/**
 * POST /api/auth/homeverse/relinquish
 *
 * Initiates a 30-day Homeverse relinquishment cooldown.
 *
 * Security:
 *  - Requires authenticated session (Bearer or cookie).
 *  - Enforces CSRF.
 *  - Requires explicit confirmRelinquishment: true in body.
 *
 * Body: { currentHandle: string, replacementHandle: string, confirmRelinquishment: true }
 * Response: { relinquishmentId, cooldownExpiresAt, message }
 */

import { neon } from "@neondatabase/serverless";
import { assertSafeDatabaseTarget, enforceAntiCsrf, validateRequestSessionWithCookieFallback } from "../../../creatorOwnership.ts";
import { initiateHomeverseRelinquishment } from "../../../homeverseRelinquishment.ts";

export interface RelinquishHandlerDeps {
  sql?: any;
  databaseUrl?: string;
  validateSession?: typeof validateRequestSessionWithCookieFallback;
  env?: Record<string, string | undefined>;
}

export default async function handler(req: any, res: any, deps: RelinquishHandlerDeps = {}) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "method-not-allowed" });
  }

  // CSRF guard
  const csrf = enforceAntiCsrf(req, deps.env ?? process.env, {
    allowSameOriginTenantSubdomain: true,
  });
  if (csrf.blocked) {
    return res.status(403).json({ error: "forbidden", message: csrf.reason });
  }

  // Session validation
  const databaseUrl = deps.databaseUrl ?? process.env.DATABASE_URL;
  if (!databaseUrl && !deps.sql) {
    return res.status(500).json({ error: "configuration-error", message: "Database not configured." });
  }
  if (!deps.sql) {
    assertSafeDatabaseTarget(databaseUrl, deps.env ?? process.env);
  }

  const sql = deps.sql ?? neon(databaseUrl!);
  const validateFn = deps.validateSession ?? validateRequestSessionWithCookieFallback;
  const session = await validateFn(sql, req);

  if (!session.ok) {
    return res.status(401).json({ error: "unauthenticated", message: "Valid session required." });
  }

  if (!session.humanId) {
    return res.status(403).json({ error: "forbidden", message: "Human continuity identity required." });
  }

  const { currentHandle, replacementHandle, confirmRelinquishment } = req.body ?? {};

  // Explicit confirmation gate
  if (confirmRelinquishment !== true) {
    return res.status(400).json({
      error: "confirmation_required",
      message: "confirmRelinquishment must be explicitly set to true.",
    });
  }

  if (!currentHandle || typeof currentHandle !== "string") {
    return res.status(400).json({ error: "invalid", message: "currentHandle is required." });
  }

  if (!replacementHandle || typeof replacementHandle !== "string") {
    return res.status(400).json({ error: "invalid", message: "replacementHandle is required." });
  }

  try {
    // Resolve identity IDs from handles
    const identityRows = await sql`
      SELECT identity_id, username
      FROM youniverse_identities
      WHERE username IN (${currentHandle.toLowerCase()}, ${replacementHandle.toLowerCase()})
    `;

    if (!Array.isArray(identityRows)) {
      return res.status(500).json({ error: "database_error", message: "Failed to resolve handles." });
    }

    const handleMap: Record<string, string> = {};
    for (const row of identityRows) {
      handleMap[String(row.username)] = String(row.identity_id);
    }

    const currentIdentityId = handleMap[currentHandle.toLowerCase()];
    const replacementIdentityId = handleMap[replacementHandle.toLowerCase()];

    if (!currentIdentityId) {
      return res.status(404).json({ error: "not_found", message: `Handle @${currentHandle} not found.` });
    }
    if (!replacementIdentityId) {
      return res.status(404).json({ error: "not_found", message: `Handle @${replacementHandle} not found.` });
    }

    const { relinquishmentId, cooldownExpiresAt } = await initiateHomeverseRelinquishment(sql, {
      humanId: session.humanId,
      currentHomeverseIdentityId: currentIdentityId,
      replacementIdentityId,
    });

    return res.status(200).json({
      relinquishmentId,
      cooldownExpiresAt,
      message: `Homeverse relinquishment initiated. The 30-day cooldown expires at ${cooldownExpiresAt}.`,
    });
  } catch (err: any) {
    if (err?.code === "RELINQUISHMENT_CONFLICT") {
      return res.status(409).json({ error: "conflict", message: err.message });
    }
    console.error("[/api/auth/homeverse/relinquish]", err);
    return res.status(400).json({ error: "relinquishment_failed", message: err?.message ?? "Relinquishment failed." });
  }
}
