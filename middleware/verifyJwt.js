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

function hashToken(rawToken) {
  return createHash("sha256").update(rawToken, "utf8").digest("hex");
}

/**
 * @param {import('express').Request}  req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 * @param {object} [deps]
 */
export async function verifyJwt(req, res, next, deps = {}) {
  const authHeader = req.headers["authorization"] || req.headers["Authorization"];

  if (!authHeader || typeof authHeader !== "string" || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({
      error: "unauthorized",
      message: "Missing or malformed Authorization header.",
    });
  }

  const token = authHeader.slice(7).trim();

  if (!token) {
    return res.status(401).json({
      error: "unauthorized",
      message: "Missing or malformed Authorization header.",
    });
  }

  // ── 1. Check Neon-native session store first ──────────────────────────────
  const databaseUrl = deps.databaseUrl || process.env.DATABASE_URL || process.env.LOCAL_TEST_DATABASE_URL;
  if (databaseUrl || deps.sql) {
    try {
      const sql = deps.sql || neon(databaseUrl);
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
          return res.status(401).json({
            error: "session_revoked",
            message: "Session has been revoked.",
          });
        }

        if (new Date(session.expires_at) < new Date()) {
          return res.status(401).json({
            error: "session_expired",
            message: "Session has expired.",
          });
        }

        if (!session.is_live) {
          return res.status(403).json({
            error: "youniverse_suspended",
            message: "This Youniverse is suspended.",
          });
        }

        // Enforce verified identity requirement
        if (!session.email_verified_at) {
          return res.status(403).json({
            error: "email_not_verified",
            message: "Email verification required before accessing protected features.",
          });
        }

        // Attach verified identity to request strictly scoped to this session
        req.user = {
          userId: String(session.identity_id),
          youniverseId: String(session.identity_id),
          handle: String(session.username),
          plan: String(session.plan ?? "free"),
          authType: "neon_session",
        };

        return next();
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
      // Not a valid JWT and not a valid Neon session -> reject
      return res.status(401).json({
        error: "invalid_token",
        message: "Token is invalid or has expired.",
      });
    }

    const { userId, youniverseId, handle, sessionToken } = decoded || {};

    if (!userId || !youniverseId || !sessionToken) {
      return res.status(401).json({
        error: "invalid_token",
        message: "Token payload is incomplete.",
      });
    }

    try {
      const session = await deps.prisma.session.findUnique({
        where: { refreshToken: sessionToken },
      });

      if (!session) {
        return res.status(401).json({
          error: "session_not_found",
          message: "Session does not exist.",
        });
      }

      if (session.revokedAt) {
        return res.status(401).json({
          error: "session_revoked",
          message: "Session has been revoked.",
        });
      }

      if (session.expiresAt < new Date()) {
        return res.status(401).json({
          error: "session_expired",
          message: "Session has expired.",
        });
      }

      if (session.userId !== userId) {
        return res.status(401).json({
          error: "session_mismatch",
          message: "Token identity mismatch.",
        });
      }

      req.user = {
        userId,
        youniverseId,
        handle,
        authType: "jwt",
      };

      return next();
    } catch (dbErr) {
      console.error("[verifyJwt] DB error during session lookup:", dbErr);
      return res.status(500).json({
        error: "auth_check_failed",
        message: "Could not verify session.",
      });
    }
  }

  return res.status(401).json({
    error: "invalid_token",
    message: "Token is invalid or has expired.",
  });
}
