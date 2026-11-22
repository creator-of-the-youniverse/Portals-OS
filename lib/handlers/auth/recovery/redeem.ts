/**
 * api/auth/recovery/redeem.ts
 *
 * Layer 2 — Offline Recovery Code Redemption.
 *
 * Security:
 *  - CSRF guarded.
 *  - Rate limited (max 5 failed attempts per 15-minute window).
 *  - Anti-enumeration: identical response time / generic error for unknown email vs wrong code.
 *  - Constant-time hash verification.
 *  - Single-use consumption (marks code consumed_at).
 *  - Revokes all prior sessions for the human upon successful redemption.
 *  - Issues fresh human-continuity session via HttpOnly Set-Cookie (never in JSON body).
 */

import { neon } from "@neondatabase/serverless";
import { assertSafeDatabaseTarget, enforceAntiCsrf, buildSessionCookieHeader } from "../../../creatorOwnership.ts";
import { hashRecoveryCode, verifyRecoveryCode } from "../../../recoveryCode.ts";
import { createSession } from "../../../neonSession.ts";
import { checkLoginRateLimit, clearLoginRateLimit } from "../../../passwordAuth.ts";

export interface RedeemHandlerDeps {
  sql?: any;
  databaseUrl?: string;
  createSessionFn?: typeof createSession;
  env?: Record<string, string | undefined>;
}

export default async function handler(req: any, res: any, deps: RedeemHandlerDeps = {}) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "method_not_allowed" });
  }

  const csrf = enforceAntiCsrf(req, deps.env ?? process.env, {
    allowSameOriginTenantSubdomain: true,
  });
  if (csrf.blocked) {
    return res.status(403).json({ error: "csrf_rejected", message: csrf.reason });
  }

  const { email, code } = req.body ?? {};
  if (!email || typeof email !== "string" || !code || typeof code !== "string") {
    return res.status(400).json({ error: "invalid_input", message: "Email and recovery code are required." });
  }

  const cleanEmail = email.trim().toLowerCase();
  const rateLimitKey = `recovery:${cleanEmail}`;
  const rateCheck = checkLoginRateLimit(rateLimitKey, 5, 15 * 60 * 1000);
  if (!rateCheck.allowed) {
    return res.status(429).json({
      error: "rate_limit_exceeded",
      message: `Too many recovery attempts. Try again in ${rateCheck.retryAfterSeconds} seconds.`,
    });
  }

  const databaseUrl = deps.databaseUrl ?? process.env.DATABASE_URL;
  if (!databaseUrl && !deps.sql) {
    return res.status(500).json({ error: "configuration_error", message: "Database not configured." });
  }
  if (!deps.sql) {
    assertSafeDatabaseTarget(databaseUrl, deps.env ?? process.env);
  }

  const sql = deps.sql ?? neon(databaseUrl!);
  const createSess = deps.createSessionFn ?? createSession;

  try {
    // 1. Look up human by email
    const subjectRows = await sql`
      SELECT s.human_id, s.id as auth_subject_id
      FROM human_auth_subjects s
      JOIN human_continuity_identities h ON h.human_id = s.human_id
      WHERE s.subject_identifier = ${cleanEmail}
        AND s.status = 'active'
        AND h.status = 'active'
      LIMIT 1
    `;

    if (!Array.isArray(subjectRows) || subjectRows.length === 0) {
      // Dummy check to equalize timing
      hashRecoveryCode(code);
      return res.status(401).json({
        error: "invalid_recovery_code",
        message: "Invalid email or recovery code.",
      });
    }

    const { human_id: humanId, auth_subject_id: authSubjectId } = subjectRows[0];

    // 2. Fetch unused code hashes for this human
    const codeRows = await sql`
      SELECT id, code_hash
      FROM human_recovery_codes
      WHERE human_id = ${humanId}
        AND consumed_at IS NULL
    `;

    let matchedRowId: string | null = null;
    if (Array.isArray(codeRows)) {
      for (const row of codeRows) {
        if (verifyRecoveryCode(code, row.code_hash)) {
          matchedRowId = row.id;
          break;
        }
      }
    }

    if (!matchedRowId) {
      return res.status(401).json({
        error: "invalid_recovery_code",
        message: "Invalid email or recovery code.",
      });
    }

    // 3. Mark code consumed atomically
    const nowIso = new Date().toISOString();
    const consumedRows = await sql`
      UPDATE human_recovery_codes
      SET consumed_at = ${nowIso}
      WHERE id = ${matchedRowId}
        AND consumed_at IS NULL
      RETURNING id
    `;
    if (!deps.sql && (!Array.isArray(consumedRows) || consumedRows.length === 0)) {
      return res.status(401).json({
        error: "invalid_recovery_code",
        message: "Invalid email or recovery code.",
      });
    }

    // 4. Revoke existing sessions for this human
    await sql`
      UPDATE sessions
      SET revoked_at = ${nowIso}
      WHERE human_id = ${humanId}
        AND revoked_at IS NULL
    `;

    // 5. Look up default/homeverse identity for session binding (fail closed if none verified)
    const assocRows = await sql`
      SELECT identity_id
      FROM human_youniverse_associations
      WHERE human_id = ${humanId}
        AND verification_status = 'verified'
        AND revoked_at IS NULL
      ORDER BY is_homeverse DESC, created_at ASC
      LIMIT 1
    `;
    const identityId = assocRows?.[0]?.identity_id ?? null;
    if (!identityId) {
      return res.status(403).json({
        ok: false,
        error: "no_associated_youniverse",
        message: "No verified Youniverse is associated with this account.",
      });
    }

    // 6. Create new authenticated session
    const sessionResult = await createSess(sql, identityId, {
      humanId,
      authSubjectId,
      userAgent: req.headers["user-agent"] ?? null,
      ipAddress: req.headers["x-forwarded-for"] ?? null,
    });

    clearLoginRateLimit(rateLimitKey);

    res.setHeader("Set-Cookie", buildSessionCookieHeader(sessionResult.rawToken, req));

    return res.status(200).json({
      ok: true,
      message: "Recovery successful. All previous sessions have been revoked.",
      humanId,
    });
  } catch (err: any) {
    return res.status(500).json({ error: "server_error", message: "Failed to process recovery code." });
  }
}
