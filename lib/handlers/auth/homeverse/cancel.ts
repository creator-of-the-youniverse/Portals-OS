/**
 * POST /api/auth/homeverse/cancel
 *
 * Cancels a pending Homeverse relinquishment during the cooldown window.
 *
 * Security:
 *  - Requires authenticated session.
 *  - Enforces CSRF.
 *
 * Body: { relinquishmentId: string }
 * Response: { cancelled: true }
 */

import { neon } from "@neondatabase/serverless";
import { assertSafeDatabaseTarget, enforceAntiCsrf, validateRequestSessionWithCookieFallback } from "../../../creatorOwnership.ts";
import { cancelHomeverseRelinquishment } from "../../../homeverseRelinquishment.ts";

export interface CancelHandlerDeps {
  sql?: any;
  databaseUrl?: string;
  validateSession?: typeof validateRequestSessionWithCookieFallback;
  env?: Record<string, string | undefined>;
}

export default async function handler(req: any, res: any, deps: CancelHandlerDeps = {}) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "method-not-allowed" });
  }

  const csrf = enforceAntiCsrf(req, deps.env ?? process.env, {
    allowSameOriginTenantSubdomain: true,
  });
  if (csrf.blocked) {
    return res.status(403).json({ error: "forbidden", message: csrf.reason });
  }

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

  const { relinquishmentId } = req.body ?? {};

  if (!relinquishmentId || typeof relinquishmentId !== "string") {
    return res.status(400).json({ error: "invalid", message: "relinquishmentId is required." });
  }

  try {
    await cancelHomeverseRelinquishment(sql, {
      humanId: session.humanId,
      relinquishmentId,
    });

    return res.status(200).json({ cancelled: true });
  } catch (err: any) {
    console.error("[/api/auth/homeverse/cancel]", err);
    return res.status(400).json({ error: "cancellation_failed", message: err?.message ?? "Cancellation failed." });
  }
}
