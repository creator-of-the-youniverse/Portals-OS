/**
 * api/auth/recovery/codes.ts
 *
 * Layer 2 — Offline Recovery Codes issuance and status.
 *
 * Endpoints:
 *  - POST: Issue or regenerate 8 offline recovery codes.
 *          Requires authenticated session + { confirmed: true }.
 *          Returns plaintext codes ONCE. Stores SHA-256 hashes only.
 *  - GET:  Return status (count of unused codes, issued_at). Never returns plaintext.
 *
 * Security:
 *  - Enforces CSRF for mutations.
 *  - Regeneration invalidates all previous unused codes.
 */

import { neon } from "@neondatabase/serverless";
import { assertSafeDatabaseTarget, enforceAntiCsrf, validateRequestSessionWithCookieFallback } from "../../../creatorOwnership.ts";
import { generateRecoveryCodes } from "../../../recoveryCode.ts";

export interface RecoveryCodesHandlerDeps {
  sql?: any;
  databaseUrl?: string;
  validateSession?: typeof validateRequestSessionWithCookieFallback;
  env?: Record<string, string | undefined>;
}

export default async function handler(req: any, res: any, deps: RecoveryCodesHandlerDeps = {}) {
  const databaseUrl = deps.databaseUrl ?? process.env.DATABASE_URL;
  if (!databaseUrl && !deps.sql) {
    return res.status(500).json({ error: "configuration_error", message: "Database not configured." });
  }
  if (!deps.sql) {
    assertSafeDatabaseTarget(databaseUrl, deps.env ?? process.env);
  }

  const sql = deps.sql ?? neon(databaseUrl!);
  const validateFn = deps.validateSession ?? validateRequestSessionWithCookieFallback;
  const session = await validateFn(sql, req);

  if (!session.ok || !session.humanId) {
    return res.status(401).json({ error: "unauthenticated", message: "Valid human session required." });
  }

  if (req.method === "GET") {
    // Return count of unused codes and last issuance time
    const rows = await sql`
      SELECT count(*) AS remaining, max(created_at) AS last_issued_at
      FROM human_recovery_codes
      WHERE human_id = ${session.humanId}
        AND consumed_at IS NULL
    `;
    const remaining = Number(rows?.[0]?.remaining ?? 0);
    const lastIssuedAt = rows?.[0]?.last_issued_at ?? null;
    return res.status(200).json({ ok: true, remaining, lastIssuedAt });
  }

  if (req.method === "POST") {
    const csrf = enforceAntiCsrf(req, deps.env ?? process.env, {
      allowSameOriginTenantSubdomain: true,
    });
    if (csrf.blocked) {
      return res.status(403).json({ error: "forbidden", message: csrf.reason });
    }

    const { confirmed } = req.body ?? {};
    if (!confirmed) {
      return res.status(400).json({
        error: "confirmation_required",
        message: "Explicit confirmation { confirmed: true } is required to generate or regenerate recovery codes.",
      });
    }

    // Generate 8 codes (plaintext + hashes)
    const { plaintext, hashes } = generateRecoveryCodes(8);
    const nowIso = new Date().toISOString();

    // Invalidate existing unused codes for this human
    await sql`
      UPDATE human_recovery_codes
      SET consumed_at = ${nowIso}
      WHERE human_id = ${session.humanId}
        AND consumed_at IS NULL
    `;

    // Insert new code hashes
    for (const codeHash of hashes) {
      await sql`
        INSERT INTO human_recovery_codes (
          human_id,
          code_hash,
          created_at
        )
        VALUES (
          ${session.humanId},
          ${codeHash},
          ${nowIso}
        )
      `;
    }

    return res.status(200).json({
      ok: true,
      recoveryCodes: plaintext,
      warning: "Store these recovery codes safely. They will never be shown again.",
    });
  }

  return res.status(405).json({ error: "method_not_allowed" });
}
