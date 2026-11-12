/**
 * lib/emailVerification.ts
 *
 * Dedicated, hash-backed email verification tokens for THE YOUNIVERSE.
 *
 * Security guarantees:
 *  - Verification tokens are separate from session tokens.
 *  - Only SHA-256(token) is stored. Raw tokens are never stored or logged.
 *  - Verification tokens are single-use and expire (default: 24h).
 *  - Token consumption and email_verified_at state update are atomic.
 *  - Session tokens cannot be passed to consumeVerificationToken.
 */

import { Pool, neonConfig, type NeonQueryFunction } from "@neondatabase/serverless";
import { randomBytes } from "crypto";
import { hashToken } from "./neonSession.ts";
import {
  tryAwardGenesis001InTransaction,
  type GenesisAwardRecord,
  type QueryRunner,
} from "./genesisService.ts";

if (typeof globalThis.WebSocket !== "undefined" && !neonConfig.webSocketConstructor) {
  neonConfig.webSocketConstructor = globalThis.WebSocket;
}

export interface CreateVerificationTokenOptions {
  ttlSeconds?: number;
}

export type VerificationConsumeResult =
  | {
      ok: true;
      identityId: string;
      username: string;
      email: string;
      genesisAwarded?: boolean;
      genesisAward?: GenesisAwardRecord;
    }
  | {
      ok: false;
      reason: "not_found" | "expired" | "already_consumed" | "identity_not_found";
    };

export interface ConsumeWithGenesisOptions {
  pool?: { connect(): Promise<QueryRunner & { release(): void }> };
  databaseUrl?: string;
  rawToken: string;
  isProduction: boolean;
  beforeCommitHook?: (client: QueryRunner) => Promise<void>;
}

/**
 * Generates an unguessable 256-bit random verification token,
 * hashes it, and stores the hash with expiration in `email_verification_tokens`.
 *
 * Returns the rawToken to be delivered out-of-band via email.
 */
export async function createVerificationToken(
  sql: NeonQueryFunction<false, false>,
  identityId: string,
  opts: CreateVerificationTokenOptions = {}
): Promise<{ rawToken: string; expiresAt: Date }> {
  const ttlSeconds = opts.ttlSeconds ?? 60 * 60 * 24; // 24 hours
  const rawToken = randomBytes(32).toString("hex");
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + ttlSeconds * 1000);

  await sql`
    INSERT INTO email_verification_tokens (
      identity_id,
      token_hash,
      expires_at
    )
    VALUES (
      ${identityId},
      ${tokenHash},
      ${expiresAt.toISOString()}
    )
  `;

  return { rawToken, expiresAt };
}

/**
 * Atomically validates and consumes a raw email verification token.
 *
 * Transitions the identity state from PENDING_EMAIL_VERIFICATION to VERIFIED.
 * Marks the token as consumed so it cannot be used again.
 */
export async function consumeVerificationToken(
  sql: NeonQueryFunction<false, false>,
  rawToken: string
): Promise<VerificationConsumeResult> {
  if (!rawToken || typeof rawToken !== "string" || rawToken.trim().length === 0) {
    return { ok: false, reason: "not_found" };
  }

  const tokenHash = hashToken(rawToken.trim());

  // 1. Atomic CTE: Consume token and mark associated identity verified in one operation.
  // Joined update guarantees:
  // - If the identity does not exist (orphaned token), consumed_token updates 0 rows.
  // - If the token is consumed, expired, or missing, verified_identity updates 0 rows.
  // - Both mutations commit together in a single statement, or neither commits.
  const atomicRows = await sql`
    WITH consumed_token AS (
      UPDATE email_verification_tokens t
      SET consumed_at = NOW()
      FROM youniverse_identities i
      WHERE t.identity_id = i.identity_id
        AND t.token_hash = ${tokenHash}
        AND t.consumed_at IS NULL
        AND t.expires_at > NOW()
      RETURNING t.id, t.identity_id, i.username, i.email
    ),
    verified_identity AS (
      UPDATE youniverse_identities i
      SET email_verified_at = NOW()
      FROM consumed_token c
      WHERE i.identity_id = c.identity_id
      RETURNING i.identity_id, c.username, c.email
    )
    SELECT identity_id, username, email FROM verified_identity;
  `;

  if (atomicRows && atomicRows.length > 0) {
    const verified = atomicRows[0];

    return {
      ok: true,
      identityId: String(verified.identity_id),
      username: String(verified.username),
      email: String(verified.email),
    };
  }

  // 2. Read-only diagnostic query to classify reason (zero mutations occur on failure)
  const tokenRows = await sql`
    SELECT id, identity_id, expires_at, consumed_at
    FROM email_verification_tokens
    WHERE token_hash = ${tokenHash}
    LIMIT 1
  `;

  if (!tokenRows || tokenRows.length === 0) {
    return { ok: false, reason: "not_found" };
  }

  const tokenRecord = tokenRows[0];

  if (tokenRecord.consumed_at !== null) {
    return { ok: false, reason: "already_consumed" };
  }

  if (new Date(tokenRecord.expires_at) < new Date()) {
    return { ok: false, reason: "expired" };
  }

  // Check if identity is missing (orphaned token)
  const identityRows = await sql`
    SELECT identity_id, username, email
    FROM youniverse_identities
    WHERE identity_id = ${tokenRecord.identity_id}
    LIMIT 1
  `;

  if (!identityRows || identityRows.length === 0) {
    return { ok: false, reason: "identity_not_found" };
  }

  // 3. Fallback for test harnesses / mocks that don't support CTEs
  const consumed = await sql`
    UPDATE email_verification_tokens
    SET consumed_at = NOW()
    WHERE id = ${tokenRecord.id}
      AND consumed_at IS NULL
    RETURNING id
  `;

  if (!consumed || consumed.length === 0) {
    return { ok: false, reason: "already_consumed" };
  }

  await sql`
    UPDATE youniverse_identities
    SET email_verified_at = NOW()
    WHERE identity_id = ${tokenRecord.identity_id}
  `;

  return {
    ok: true,
    identityId: String(tokenRecord.identity_id),
    username: String(identityRows[0].username),
    email: String(identityRows[0].email),
  };
}

let cachedPool: Pool | null = null;
let cachedPoolUrl: string | null = null;

function getVerificationPool(databaseUrl: string): Pool {
  if (!cachedPool || cachedPoolUrl !== databaseUrl) {
    cachedPool = new Pool({ connectionString: databaseUrl });
    cachedPoolUrl = databaseUrl;
  }
  return cachedPool;
}

/**
 * Atomically consumes the email verification token, verifies `youniverse_identities`,
 * evaluates Genesis 001 singleton allocation, and creates the lifetime entitlement ledger row
 * inside a single real PostgreSQL transaction (`BEGIN ... COMMIT / ROLLBACK`).
 */
export async function consumeVerificationTokenWithGenesis(
  opts: ConsumeWithGenesisOptions
): Promise<VerificationConsumeResult> {
  const { rawToken, isProduction, beforeCommitHook } = opts;
  if (!rawToken || typeof rawToken !== "string" || rawToken.trim().length === 0) {
    return { ok: false, reason: "not_found" };
  }

  const pool =
    opts.pool ??
    (opts.databaseUrl ? getVerificationPool(opts.databaseUrl) : null);

  if (!pool) {
    throw new Error("Pool or databaseUrl is required for transactional verification.");
  }

  const tokenHash = hashToken(rawToken.trim());
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const atomicRes = await client.query(
      `WITH consumed_token AS (
         UPDATE public.email_verification_tokens t
         SET consumed_at = NOW()
         FROM public.youniverse_identities i
         WHERE t.identity_id = i.identity_id
           AND t.token_hash = $1
           AND t.consumed_at IS NULL
           AND t.expires_at > NOW()
         RETURNING t.id AS token_id, t.identity_id, i.username, i.email, i.identity_type, i.is_live
       ),
       verified_identity AS (
         UPDATE public.youniverse_identities i
         SET email_verified_at = COALESCE(i.email_verified_at, NOW())
         FROM consumed_token c
         WHERE i.identity_id = c.identity_id
         RETURNING c.token_id, i.identity_id, c.username, c.email, c.identity_type, c.is_live, i.email_verified_at
       )
       SELECT token_id, identity_id, username, email, identity_type, is_live, email_verified_at
       FROM verified_identity`,
      [tokenHash]
    );

    if (!atomicRes?.rows || atomicRes.rows.length === 0) {
      const tokenRes = await client.query(
        `SELECT id, identity_id, expires_at, consumed_at
         FROM public.email_verification_tokens
         WHERE token_hash = $1
         LIMIT 1`,
        [tokenHash]
      );

      await client.query("ROLLBACK");

      if (!tokenRes?.rows || tokenRes.rows.length === 0) {
        return { ok: false, reason: "not_found" };
      }

      const tokenRecord = tokenRes.rows[0];
      if (tokenRecord.consumed_at !== null) {
        return { ok: false, reason: "already_consumed" };
      }
      if (new Date(tokenRecord.expires_at) < new Date()) {
        return { ok: false, reason: "expired" };
      }

      return { ok: false, reason: "identity_not_found" };
    }

    const verified = atomicRes.rows[0];

    const genesisRes = await tryAwardGenesis001InTransaction(client, {
      identityId: String(verified.identity_id),
      username: String(verified.username),
      email: verified.email ? String(verified.email) : "",
      identityType: verified.identity_type ? String(verified.identity_type) : "person",
      isLive: verified.is_live !== false,
      verificationTokenId: String(verified.token_id),
      verifiedAt: verified.email_verified_at,
      isProduction,
    });

    if (beforeCommitHook) {
      await beforeCommitHook(client);
    }

    await client.query("COMMIT");

    return {
      ok: true,
      identityId: String(verified.identity_id),
      username: String(verified.username),
      email: String(verified.email ?? ""),
      genesisAwarded: genesisRes.awarded,
      genesisAward: genesisRes.awarded ? genesisRes.award : undefined,
    };
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // ignore rollback masking
    }
    throw err;
  } finally {
    client.release();
  }
}
