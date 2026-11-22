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
import {
  assertSafeDatabaseTarget,
  extractSessionCandidatesFromRequest,
  resolveAuthorizedTargetYouniverse,
} from "./creatorOwnership.ts";
import jwt from "jsonwebtoken";

export interface AuthenticatedUser {
  userId: string;
  humanId?: string | null;
  youniverseId: string;
  handle: string;
  authType: "neon_session" | "jwt";
}

export type AuthResult =
  | { ok: true; user: AuthenticatedUser }
  | { ok: false; status: number; error: string; message: string };

type CandidateAuthAttempt =
  | { ok: true; user: AuthenticatedUser }
  | { ok: false; terminal: boolean; status: number; error: string; message: string };

async function authenticateCandidateToken(
  token: string,
  req: any,
  deps: {
    sql?: any;
    databaseUrl?: string;
    jwtSecret?: string;
    prisma?: any;
    env?: Record<string, string | undefined>;
  }
): Promise<CandidateAuthAttempt> {
  // ── 1. Neon DB session check (Primary) ──────────────────────────────────
  const databaseUrl = deps.databaseUrl ?? process.env.DATABASE_URL;
  if (!deps.sql) {
    assertSafeDatabaseTarget(databaseUrl, deps.env ?? process.env);
  }
  if (databaseUrl || deps.sql) {
    try {
      const sql = deps.sql ?? neon(databaseUrl!);
      const tokenHash = hashToken(token);

      const sessionRows = await sql`
        SELECT s.id AS session_id, s.identity_id, s.human_id, s.expires_at, s.revoked_at,
               i.username, i.email, i.plan, i.is_live, i.email_verified_at
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
            terminal: false,
            status: 401,
            error: "session_revoked",
            message: "Session has been revoked.",
          };
        }

        if (new Date(session.expires_at) < new Date()) {
          return {
            ok: false,
            terminal: false,
            status: 401,
            error: "session_expired",
            message: "Session has expired.",
          };
        }

        if (!session.is_live) {
          return {
            ok: false,
            terminal: true,
            status: 403,
            error: "youniverse_suspended",
            message: "This Youniverse is suspended.",
          };
        }

        if (!session.email_verified_at) {
          return {
            ok: false,
            terminal: true,
            status: 403,
            error: "email_not_verified",
            message: "Email verification required before accessing protected features.",
          };
        }

        const target = await resolveAuthorizedTargetYouniverse(
          sql,
          req,
          {
            identity_id: String(session.identity_id),
            username: String(session.username),
            human_id: session.human_id ? String(session.human_id) : null,
            email: session.email ? String(session.email) : null,
            plan: session.plan ? String(session.plan) : "free",
            is_live: Boolean(session.is_live),
            email_verified_at: session.email_verified_at,
          },
          { env: deps.env, databaseUrl }
        );

        if (!target.ok) {
          return {
            ok: false,
            terminal: true,
            status: target.status,
            error: target.error,
            message: target.message,
          };
        }

        return {
          ok: true,
          user: {
            userId: String(session.identity_id),
            humanId: session.human_id ? String(session.human_id) : null,
            youniverseId: target.youniverseId,
            handle: target.handle,
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
        terminal: false,
        status: 401,
        error: "invalid_token",
        message: "Token is invalid or has expired.",
      };
    }

    const { userId, youniverseId, handle, sessionToken } = decoded || {};
    if (!userId || !youniverseId || !sessionToken) {
      return {
        ok: false,
        terminal: false,
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
          terminal: false,
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
        terminal: true,
        status: 500,
        error: "auth_check_failed",
        message: "Could not verify session.",
      };
    }
  }

  return {
    ok: false,
    terminal: false,
    status: 401,
    error: "invalid_token",
    message: "Token is invalid or has expired.",
  };
}

export async function authenticateRequest(
  req: any,
  deps: {
    sql?: any;
    databaseUrl?: string;
    jwtSecret?: string;
    prisma?: any;
    env?: Record<string, string | undefined>;
  } = {}
): Promise<AuthResult> {
  const candidates = extractSessionCandidatesFromRequest(req);
  const candidateTokens = [candidates.bearerToken, candidates.cookieToken].filter(
    (t, idx, arr): t is string => Boolean(t) && arr.indexOf(t) === idx
  );

  if (candidateTokens.length === 0) {
    return {
      ok: false,
      status: 401,
      error: "unauthorized",
      message: "Missing or malformed Authorization header.",
    };
  }

  let firstFailure: CandidateAuthAttempt | null = null;
  for (const token of candidateTokens) {
    const attempt = await authenticateCandidateToken(token, req, deps);
    if (attempt.ok) {
      return { ok: true, user: attempt.user };
    }
    if (attempt.terminal) {
      return {
        ok: false,
        status: attempt.status,
        error: attempt.error,
        message: attempt.message,
      };
    }
    if (!firstFailure) {
      firstFailure = attempt;
    }
  }

  return {
    ok: false,
    status: firstFailure?.status ?? 401,
    error: firstFailure?.error ?? "invalid_token",
    message: firstFailure?.message ?? "Token is invalid or has expired.",
  };
}
