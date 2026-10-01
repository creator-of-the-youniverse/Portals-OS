/**
 * middleware/verifyJwt.js
 *
 * Reusable Express middleware that:
 *  1. Reads the "Authorization: Bearer <token>" header.
 *  2. Verifies the JWT signature using JWT_SECRET from .env.
 *  3. Confirms the session is still alive (not expired / revoked) via Prisma.
 *  4. Attaches req.user = { userId, youniverseId, handle } for downstream handlers.
 *
 * Any failure returns 401 — no sensitive details leak to the client.
 */

import jwt from "jsonwebtoken";
import { PrismaClient } from "@prisma/client";

// Share a single Prisma instance across the process.
const prisma = new PrismaClient();

/**
 * @param {import('express').Request}  req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
export async function verifyJwt(req, res, next) {
  const authHeader = req.headers["authorization"];

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({
      error: "unauthorized",
      message: "Missing or malformed Authorization header.",
    });
  }

  const token = authHeader.slice(7); // strip "Bearer "
  const secret = process.env.JWT_SECRET;

  if (!secret) {
    console.error("[verifyJwt] JWT_SECRET is not set in environment.");
    return res.status(500).json({
      error: "server_misconfiguration",
      message: "Authentication is not configured.",
    });
  }

  let decoded;
  try {
    decoded = jwt.verify(token, secret);
  } catch (err) {
    // Covers TokenExpiredError, JsonWebTokenError, etc.
    return res.status(401).json({
      error: "invalid_token",
      message: "Token is invalid or has expired.",
    });
  }

  // Payload shape expected: { userId, youniverseId, handle, sessionToken }
  const { userId, youniverseId, handle, sessionToken } = decoded;

  if (!userId || !youniverseId || !sessionToken) {
    return res.status(401).json({
      error: "invalid_token",
      message: "Token payload is incomplete.",
    });
  }

  // Cross-check the session is still live in the DB (prevents use of revoked tokens).
  try {
    const session = await prisma.session.findUnique({
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

    // Verify the session belongs to the claimed user (prevent token substitution).
    if (session.userId !== userId) {
      return res.status(401).json({
        error: "session_mismatch",
        message: "Token identity mismatch.",
      });
    }
  } catch (dbErr) {
    console.error("[verifyJwt] DB error during session lookup:", dbErr);
    return res.status(500).json({
      error: "auth_check_failed",
      message: "Could not verify session.",
    });
  }

  // Attach verified identity to request for downstream use.
  req.user = { userId, youniverseId, handle };
  next();
}
