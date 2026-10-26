/**
 * lib/neonSession.ts
 *
 * Neon-native session management for Vercel serverless functions.
 *
 * Design contract:
 *  - One opaque bearer token per session (no JWT layer).
 *  - Only SHA-256(token) is stored in the database. The raw token is
 *    issued once at creation and never stored or logged.
 *  - Ownership is linked to youniverse_identities.identity_id.
 *  - Email-verification tokens are separate tokens stored in a separate
 *    column (email_verify_token_hash) — NOT the same token as the session.
 *    (Column added in migration 003; email-sending is a Phase 2 concern.)
 *
 * Public API:
 *   createSession(sql, identityId, opts) → { rawToken, expiresAt }
 *   validateSession(sql, rawToken)       → SessionValidationResult
 *   revokeSession(sql, rawToken)         → void
 *   hashToken(rawToken)                  → string   (exported for tests)
 */

import { neon, type NeonQueryFunction } from "@neondatabase/serverless";
import { createHash, randomBytes } from "crypto";

// ── Types ────────────────────────────────────────────────────────────────────

export interface SessionRecord {
  id: string;
  identity_id: string;
  token_hash: string;
  expires_at: Date;
  revoked_at: Date | null;
  user_agent: string | null;
  ip_address: string | null;
  created_at: Date;
}

export type SessionValidationResult =
  | { ok: true; identityId: string; sessionId: string }
  | { ok: false; reason: "not_found" | "expired" | "revoked" };

export interface CreateSessionOptions {
  /** How many seconds until the session expires. Default: 7 days. */
  ttlSeconds?: number;
  userAgent?: string | null;
  ipAddress?: string | null;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Compute SHA-256 of a raw bearer token.
 * Exported so tests can verify hash storage without hitting the DB.
 */
export function hashToken(rawToken: string): string {
  return createHash("sha256").update(rawToken, "utf8").digest("hex");
}

/**
 * Generate a cryptographically random opaque token.
 * Format: 48 hex characters = 192 bits of entropy.
 * No prefix — the token carries no identity information.
 */
function generateRawToken(): string {
  return randomBytes(24).toString("hex");
}

// ── Session operations ───────────────────────────────────────────────────────

/**
 * Create a new session in the `sessions` table.
 *
 * Returns the RAW bearer token that the caller must send to the client.
 * The raw token is NEVER stored — only its hash is persisted.
 *
 * @throws if the DB insert fails (duplicate hash, constraint violation, etc.)
 */
export async function createSession(
  sql: NeonQueryFunction<false, false>,
  identityId: string,
  opts: CreateSessionOptions = {}
): Promise<{ rawToken: string; expiresAt: Date }> {
  const ttlSeconds = opts.ttlSeconds ?? 60 * 60 * 24 * 7; // 7 days
  const rawToken = generateRawToken();
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + ttlSeconds * 1000);

  await sql`
    INSERT INTO sessions (
      identity_id,
      token_hash,
      expires_at,
      user_agent,
      ip_address
    )
    VALUES (
      ${identityId},
      ${tokenHash},
      ${expiresAt.toISOString()},
      ${opts.userAgent ?? null},
      ${opts.ipAddress ?? null}
    )
  `;

  return { rawToken, expiresAt };
}

/**
 * Validate a raw bearer token against the `sessions` table.
 *
 * Returns ok:true with the identityId on success.
 * Returns ok:false with a reason on every failure — reasons are intentionally
 * coarse to avoid leaking session state to the caller.
 */
export async function validateSession(
  sql: NeonQueryFunction<false, false>,
  rawToken: string
): Promise<SessionValidationResult> {
  if (!rawToken || typeof rawToken !== "string" || rawToken.length < 8) {
    return { ok: false, reason: "not_found" };
  }

  const tokenHash = hashToken(rawToken);

  const rows = await sql`
    SELECT id, identity_id, expires_at, revoked_at
    FROM sessions
    WHERE token_hash = ${tokenHash}
    LIMIT 1
  `;

  if (rows.length === 0) {
    return { ok: false, reason: "not_found" };
  }

  const row = rows[0];

  if (row.revoked_at !== null) {
    return { ok: false, reason: "revoked" };
  }

  if (new Date(row.expires_at) < new Date()) {
    return { ok: false, reason: "expired" };
  }

  return {
    ok: true,
    identityId: String(row.identity_id),
    sessionId: String(row.id),
  };
}

/**
 * Revoke a session by setting revoked_at = NOW().
 * No-ops silently if the token hash is not found (idempotent).
 */
export async function revokeSession(
  sql: NeonQueryFunction<false, false>,
  rawToken: string
): Promise<void> {
  const tokenHash = hashToken(rawToken);
  await sql`
    UPDATE sessions
    SET revoked_at = NOW()
    WHERE token_hash = ${tokenHash}
      AND revoked_at IS NULL
  `;
}

/**
 * Convenience: build a neon SQL client and return a bound createSession
 * helper for use in a single request handler.
 *
 * Usage:
 *   const { createSession, validateSession } = makeSqlSession(databaseUrl);
 */
export function makeSqlClient(databaseUrl: string) {
  const sql = neon(databaseUrl);
  return {
    sql,
    createSession: (identityId: string, opts?: CreateSessionOptions) =>
      createSession(sql, identityId, opts),
    validateSession: (rawToken: string) => validateSession(sql, rawToken),
    revokeSession: (rawToken: string) => revokeSession(sql, rawToken),
  };
}
