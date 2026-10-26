/**
 * GET /api/youniverse/[handle]/context
 *
 * Vercel Serverless Function — server-authoritative owner gate.
 *
 * Called by App.tsx verifyOwnership() with an Authorization: Bearer <token> header.
 * Returns { success, isOwner, handle, tier } — the client MUST treat isOwner:false
 * as a public view, never granting OS access based on client-side logic alone.
 *
 * Authorization chain:
 *   1. Extract raw bearer token from Authorization header.
 *   2. Hash the token; look up sessions.token_hash → get identity_id.
 *   3. Look up youniverse_identities WHERE username = :handle.
 *   4. Compare identity_id from session to identity_id from youniverse row.
 *   5. isOwner = (session.identity_id === youniverse.identity_id).
 *
 * Failure modes:
 *   - Missing/malformed Authorization header → 401
 *   - Token not found / expired / revoked → 401
 *   - Handle not found → 404
 *   - Handle found but session identity ≠ youniverse identity → 200 { isOwner: false }
 */

import { neon } from "@neondatabase/serverless";
import { validateSession } from "../../../lib/neonSession.ts";

export default async function handler(req: any, res: any, deps: any = {}) {
  if (req.method !== "GET") {
    return res.status(405).json({ success: false, error: "method_not_allowed" });
  }

  // ── 1. Extract bearer token ───────────────────────────────────────────────
  const authHeader = req.headers["authorization"] as string | undefined;
  if (!authHeader?.startsWith("Bearer ")) {
    return res.status(401).json({
      success: false,
      error: "unauthorized",
      message: "Missing or malformed Authorization header.",
    });
  }
  const rawToken = authHeader.slice(7).trim();

  // ── 2. Resolve handle from URL ────────────────────────────────────────────
  // Vercel passes dynamic segments via req.query; Express passes via req.params.
  const rawHandle = req.params?.handle || req.query?.handle;
  if (!rawHandle || typeof rawHandle !== "string") {
    return res.status(400).json({ success: false, error: "handle_required" });
  }
  const handle = rawHandle.toLowerCase().replace(/^@/, "");

  const databaseUrl = deps.databaseUrl ?? process.env.DATABASE_URL;
  if (!databaseUrl) {
    return res.status(500).json({ success: false, error: "server_misconfiguration" });
  }

  const sql = deps.sql ?? (deps.neon ? deps.neon(databaseUrl) : neon(databaseUrl));
  const validateSessionFn = deps.validateSession ?? validateSession;

  // ── 3. Validate session ───────────────────────────────────────────────────
  const validation = await validateSessionFn(sql, rawToken);
  if (!validation.ok) {
    return res.status(401).json({
      success: false,
      error: "invalid_token",
      message: "Token is invalid, expired, or revoked.",
    });
  }

  // ── 4. Look up the Youniverse identity for :handle ────────────────────────
  const rows = await sql`
    SELECT identity_id, username, plan, is_live, email_verified_at
    FROM youniverse_identities
    WHERE username = ${handle}
    LIMIT 1
  `;

  if (rows.length === 0) {
    return res.status(404).json({
      success: false,
      error: "youniverse_not_found",
      message: `No Youniverse found for handle @${handle}.`,
    });
  }

  const youniverse = rows[0];

  if (!youniverse.is_live) {
    return res.status(403).json({
      success: false,
      error: "youniverse_suspended",
      message: "This Youniverse is not currently live.",
    });
  }

  // ── 5. Server-authoritative ownership check ───────────────────────────────
  // Session identity_id must match the Youniverse identity_id exactly,
  // AND the identity must be email-verified.
  const isMatch = validation.identityId === String(youniverse.identity_id);
  const isVerified = youniverse.email_verified_at !== null;

  if (isMatch && !isVerified) {
    return res.status(403).json({
      success: false,
      isOwner: false,
      error: "email_not_verified",
      message: "Email verification required before accessing private operating system.",
      handle: String(youniverse.username),
      tier: String(youniverse.plan),
    });
  }

  const isOwner = isMatch && isVerified;

  console.log(
    `[YouCtx] handle=@${handle} | sessionIdentityId=${validation.identityId} | dbIdentityId=${youniverse.identity_id} | isVerified=${isVerified} | isOwner=${isOwner}`
  );

  return res.status(200).json({
    success: true,
    isOwner,
    handle: String(youniverse.username),
    tier: String(youniverse.plan),
  });
}
