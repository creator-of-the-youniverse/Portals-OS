/**
 * lib/serverlessAuth.ts
 *
 * Shared authentication helper for both Vercel serverless functions
 * and Express middleware.
 *
 * Enforces:
 *  - Active, unrevoked, unexpired session.
 *  - Email verification requirement for protected features.
 *  - Strict tenant resolution attached to authenticated user.
 *  - Support for both Neon-native bearer sessions and legacy JWT sessions.
 */

import { neon } from "@neondatabase/serverless";
import { hashToken } from "./neonSession.ts";
import jwt from "jsonwebtoken";

export interface AuthenticatedUser {
  userId: string;
  youniverseId: string;
  handle: string;
  authType: "neon_session" | "jwt";
}

export type AuthResult =
  | { ok: true; user: AuthenticatedUser }
  | { ok: false; status: number; error: string; message: string };

export async function authenticateRequest(
  req: any,
  deps: { sql?: any; databaseUrl?: string; jwtSecret?: string; prisma?: any } = {}
): Promise<AuthResult> {
  const authHeader = req.headers?.["authorization"] || req.headers?.["Authorization"];
  if (!authHeader || typeof authHeader !== "string" || !authHeader.startsWith("Bearer ")) {
    return {
      ok: false,
      status: 401,
      error: "unauthorized",
      message: "Missing or malformed Authorization header.",
    };
  }

  const token = authHeader.slice(7).trim();
  if (!token) {
    return {
      ok: false,
      status: 401,
      error: "unauthorized",
      message: "Missing or malformed Authorization header.",
    };
  }

  // ── 1. Neon DB session check (Primary) ──────────────────────────────────
  const databaseUrl = deps.databaseUrl ?? process.env.DATABASE_URL;
  if (databaseUrl || deps.sql) {
    try {
      const sql = deps.sql ?? neon(databaseUrl!);
      const tokenHash = hashToken(token);

      const sessionRows = await sql`
        SELECT s.id AS session_id, s.identity_id, s.expires_at, s.revoked_at,
               i.username, i.plan, i.is_live, i.email_verified_at
        FROM sessions s
        JOIN youniverse_identities i ON i.identity_id = s.identity_id
        WHERE s.token_hash = ${tokenHash}
        LIMIT 1
      `;

      if (sessionRows.length > 0) {
        const session = sessionRows[0];

        if (session.revoked_at) {
          return {
            ok: false,
            status: 401,
            error: "session_revoked",
            message: "Session has been revoked.",
          };
        }

        if (new Date(session.expires_at) < new Date()) {
          return {
            ok: false,
            status: 401,
            error: "session_expired",
            message: "Session has expired.",
          };
        }

        if (!session.is_live) {
          return {
            ok: false,
            status: 403,
            error: "youniverse_suspended",
            message: "This Youniverse is suspended.",
          };
        }

        if (!session.email_verified_at) {
          return {
            ok: false,
            status: 403,
            error: "email_not_verified",
            message: "Email verification required before accessing protected features.",
          };
        }

        return {
          ok: true,
          user: {
            userId: String(session.identity_id),
            youniverseId: String(session.identity_id),
            handle: String(session.username),
            authType: "neon_session",
          },
        };
      }
    } catch (err: any) {
      console.error("[authenticateRequest] DB error:", err.message);
    }
  }

  // ── 2. Legacy JWT check (Fallback — explicitly injected test deps only) ──
  const secret = deps.jwtSecret ?? process.env.JWT_SECRET;
  if (secret && deps.prisma) {
    let decoded: any;
    try {
      decoded = jwt.verify(token, secret);
    } catch {
      return {
        ok: false,
        status: 401,
        error: "invalid_token",
        message: "Token is invalid or has expired.",
      };
    }

    const { userId, youniverseId, handle, sessionToken } = decoded || {};
    if (!userId || !youniverseId || !sessionToken) {
      return {
        ok: false,
        status: 401,
        error: "invalid_token",
        message: "Token payload is incomplete.",
      };
    }

    try {
      const session = await deps.prisma.session.findUnique({
        where: { refreshToken: sessionToken },
      });

      if (!session || session.revokedAt || session.expiresAt < new Date() || session.userId !== userId) {
        return {
          ok: false,
          status: 401,
          error: "invalid_token",
          message: "Session is invalid, expired, or revoked.",
        };
      }

      return {
        ok: true,
        user: {
          userId,
          youniverseId,
          handle,
          authType: "jwt",
        },
      };
    } catch {
      return {
        ok: false,
        status: 500,
        error: "auth_check_failed",
        message: "Could not verify session.",
      };
    }
  }

  return {
    ok: false,
    status: 401,
    error: "invalid_token",
    message: "Token is invalid or has expired.",
  };
}
