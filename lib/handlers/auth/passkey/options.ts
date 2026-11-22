/**
 * POST /api/auth/passkey/options
 *
 * Generates WebAuthn challenge options for either registration or authentication.
 *
 * Registration:
 *  - Requires active authenticated human session.
 *  - Generates registration options bound to session.humanId.
 *  - Excludes already-registered credentials for this human.
 *
 * Authentication:
 *  - Pre-auth flow; does not require active session.
 *  - Generates authentication options with rpID = itsyouonline.com.
 *
 * Security:
 *  - Enforces CSRF.
 *  - Challenges are stored with 5-minute TTL in webauthn_challenges.
 */

import { neon } from "@neondatabase/serverless";
import { assertSafeDatabaseTarget, enforceAntiCsrf, validateRequestSessionWithCookieFallback } from "../../../creatorOwnership.ts";
import {
  generatePasskeyRegistrationOptions,
  generatePasskeyAuthenticationOptions,
  listPasskeyCredentials,
} from "../../../webauthnAuth.ts";

export interface PasskeyOptionsDeps {
  sql?: any;
  databaseUrl?: string;
  validateSession?: typeof validateRequestSessionWithCookieFallback;
  env?: Record<string, string | undefined>;
}

export default async function handler(req: any, res: any, deps: PasskeyOptionsDeps = {}) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "method_not_allowed" });
  }

  const csrf = enforceAntiCsrf(req, deps.env ?? process.env, {
    allowSameOriginTenantSubdomain: true,
  });
  if (csrf.blocked) {
    return res.status(403).json({ error: "csrf_rejected", message: csrf.reason });
  }

  const databaseUrl = deps.databaseUrl ?? process.env.DATABASE_URL;
  if (!databaseUrl && !deps.sql) {
    return res.status(500).json({ error: "configuration_error", message: "Database not configured." });
  }
  if (!deps.sql) {
    assertSafeDatabaseTarget(databaseUrl, deps.env ?? process.env);
  }

  const sql = deps.sql ?? neon(databaseUrl!);
  const type = req.body?.type ?? "authentication";

  if (type === "registration") {
    // Requires authenticated session
    const validateFn = deps.validateSession ?? validateRequestSessionWithCookieFallback;
    const session = await validateFn(sql, req);

    if (!session.ok || !session.humanId) {
      return res.status(401).json({ error: "unauthenticated", message: "Authenticated session required for passkey registration." });
    }

    try {
      const existing = await listPasskeyCredentials(sql, session.humanId);
      const { challengeId, options } = await generatePasskeyRegistrationOptions(
        sql,
        session.humanId,
        existing.map((c) => ({ credentialId: c.credentialId, transports: c.transports }))
      );
      return res.status(200).json({ ok: true, type: "registration", challengeId, options });
    } catch (err: any) {
      return res.status(500).json({ error: "options_generation_failed", message: err.message });
    }
  }

  if (type === "authentication") {
    try {
      const { challengeId, options } = await generatePasskeyAuthenticationOptions(sql);
      return res.status(200).json({ ok: true, type: "authentication", challengeId, options });
    } catch (err: any) {
      return res.status(500).json({ error: "options_generation_failed", message: err.message });
    }
  }

  return res.status(400).json({ error: "invalid_type", message: "type must be 'registration' or 'authentication'." });
}
