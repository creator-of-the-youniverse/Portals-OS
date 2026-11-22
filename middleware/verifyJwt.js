/**
 * middleware/verifyJwt.js
 *
 * Dual-authentication middleware supporting:
 *  1. Neon-native hash-backed bearer sessions (primary, modern).
 *  2. Signed JWT bearer tokens verified against Prisma Session (legacy fallback).
 *
 * Requirements (Phase R6A):
 *  - Valid, unexpired, unrevoked session belonging to a verified identity.
 *  - Preserves tenant-scoped authorization (req.user = { userId, youniverseId, handle }).
 *  - Fails closed with 401 on missing/invalid/expired tokens.
 *  - Fails closed with 403 on unverified identities (pending email verification).
 *  - Preserves legacy JWT verification path without weakening security.
 */

import jwt from "jsonwebtoken";
import { neon } from "@neondatabase/serverless";
import { createHash } from "crypto";
import {
  assertSafeDatabaseTarget,
  extractSessionCandidatesFromRequest,
  resolveAuthorizedTargetYouniverse,
} from "../lib/creatorOwnership.ts";

function hashToken(rawToken) {
  return createHash("sha256").update(rawToken, "utf8").digest("hex");
}

async function verifyCandidateToken(token, req, deps) {
  // ── 1. Check Neon-native session store first ──────────────────────────────
  const databaseUrl = deps.databaseUrl || process.env.DATABASE_URL || process.env.LOCAL_TEST_DATABASE_URL;
  if (!deps.sql && databaseUrl) {
    assertSafeDatabaseTarget(databaseUrl, deps.env ?? process.env);
  }
  if (databaseUrl || deps.sql) {
    try {
      const sql = deps.sql || neon(databaseUrl);
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

        // Enforce verified identity requirement
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
            plan: target.plan ?? String(session.plan ?? "free"),
            authType: "neon_session",
          },
        };
      }
    } catch (neonErr) {
      console.error("[verifyJwt] Neon session lookup error:", neonErr.message);
      // Fall through to JWT check
    }
  }

  // ── 2. Legacy JWT validation fallback (explicitly injected test deps only) ─
  const secret = deps.jwtSecret || process.env.JWT_SECRET;

  if (secret && deps.prisma) {
    let decoded;
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

      if (!session) {
        return {
          ok: false,
          terminal: false,
          status: 401,
          error: "session_not_found",
          message: "Session does not exist.",
        };
      }

      if (session.revokedAt) {
        return {
          ok: false,
          terminal: false,
          status: 401,
          error: "session_revoked",
          message: "Session has been revoked.",
        };
      }

      if (session.expiresAt < new Date()) {
        return {
          ok: false,
          terminal: false,
          status: 401,
          error: "session_expired",
          message: "Session has expired.",
        };
      }

      if (session.userId !== userId) {
        return {
          ok: false,
          terminal: false,
          status: 401,
          error: "session_mismatch",
          message: "Token identity mismatch.",
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
    } catch (dbErr) {
      console.error("[verifyJwt] DB error during session lookup:", dbErr);
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

/**
 * @param {import('express').Request}  req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 * @param {object} [deps]
 */
export async function verifyJwt(req, res, next, deps = {}) {
  const candidates = extractSessionCandidatesFromRequest(req);
  const candidateTokens = [candidates.bearerToken, candidates.cookieToken].filter(
    (t, idx, arr) => Boolean(t) && arr.indexOf(t) === idx
  );

  if (candidateTokens.length === 0) {
    return res.status(401).json({
      error: "unauthorized",
      message: "Missing or malformed Authorization header.",
    });
  }

  let firstFailure = null;
  for (const token of candidateTokens) {
    const attempt = await verifyCandidateToken(token, req, deps);
    if (attempt.ok) {
      req.user = attempt.user;
      return next();
    }
    if (attempt.terminal) {
      return res.status(attempt.status).json({
        error: attempt.error,
        message: attempt.message,
      });
    }
    if (!firstFailure) {
      firstFailure = attempt;
    }
  }

  return res.status(firstFailure?.status ?? 401).json({
    error: firstFailure?.error ?? "invalid_token",
    message: firstFailure?.message ?? "Token is invalid or has expired.",
  });
}
