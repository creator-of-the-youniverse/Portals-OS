/**
 * GET /api/auth/homeverse/status
 *
 * Returns the relinquishment cooldown status for a given handle.
 *
 * Security:
 *  - Requires authenticated session.
 *
 * Query: ?handle=<handle>
 * Response: { isInCooldown: boolean, expiresAt?: string, relinquishmentId?: string }
 */

import { neon } from "@neondatabase/serverless";
import { assertSafeDatabaseTarget, validateRequestSessionWithCookieFallback } from "../../../creatorOwnership.ts";
import { checkRelinquishmentCooldown } from "../../../homeverseRelinquishment.ts";

export interface StatusHandlerDeps {
  sql?: any;
  databaseUrl?: string;
  validateSession?: typeof validateRequestSessionWithCookieFallback;
  env?: Record<string, string | undefined>;
}

export default async function handler(req: any, res: any, deps: StatusHandlerDeps = {}) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "method-not-allowed" });
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

  const handle =
    typeof req.query?.handle === "string"
      ? req.query.handle.toLowerCase().trim()
      : null;

  if (!handle) {
    return res.status(400).json({ error: "invalid", message: "?handle=<handle> query parameter required." });
  }

  try {
    // Resolve identity ID from handle
    const identityRows = await sql`
      SELECT identity_id FROM youniverse_identities
      WHERE username = ${handle}
      LIMIT 1
    `;

    if (!Array.isArray(identityRows) || identityRows.length === 0) {
      return res.status(404).json({ error: "not_found", message: `Handle @${handle} not found.` });
    }

    const identityId = String(identityRows[0].identity_id);
    const cooldownStatus = await checkRelinquishmentCooldown(sql, identityId);

    return res.status(200).json(cooldownStatus);
  } catch (err: any) {
    console.error("[/api/auth/homeverse/status]", err);
    return res.status(500).json({ error: "database_error", message: "Failed to check cooldown status." });
  }
}
