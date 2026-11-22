/**
 * POST /api/auth/passkey/verify
 *
 * Verifies a WebAuthn response for registration or authentication.
 *
 * Registration:
 *  - Verifies registration response against challenge stored for session.humanId.
 *  - Stores new passkey credential linked to human_auth_subjects.
 *  - Returns { ok: true, credentialId, authSubjectId }.
 *
 * Authentication:
 *  - Verifies authentication response against challenge.
 *  - Monotonically validates signature counter.
 *  - Creates fresh human-continuity session.
 *  - Sets HttpOnly Set-Cookie: __youniverse_session=... (never returns raw token in JSON body).
 *  - Returns { ok: true, humanId, authSubjectId }.
 *
 * Security:
 *  - Enforces CSRF.
 *  - Challenges are single-use (consumed immediately).
 *  - Counter rollback indicates authenticator cloning and is hard-rejected.
 */

import { neon } from "@neondatabase/serverless";
import { assertSafeDatabaseTarget, enforceAntiCsrf, validateRequestSessionWithCookieFallback, buildSessionCookieHeader } from "../../../creatorOwnership.ts";
import {
  verifyPasskeyRegistration,
  verifyPasskeyAuthentication,
} from "../../../webauthnAuth.ts";
import { createSession } from "../../../neonSession.ts";

export interface PasskeyVerifyDeps {
  sql?: any;
  databaseUrl?: string;
  validateSession?: typeof validateRequestSessionWithCookieFallback;
  createSessionFn?: typeof createSession;
  env?: Record<string, string | undefined>;
}

export default async function handler(req: any, res: any, deps: PasskeyVerifyDeps = {}) {
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
  const reqOrigin = typeof req.headers?.origin === "string" ? req.headers.origin : undefined;
  const { type, challengeId, response, deviceLabel } = req.body ?? {};

  if (!type || !challengeId || !response) {
    return res.status(400).json({ error: "invalid_input", message: "type, challengeId, and response are required." });
  }

  // ── Registration Verification ─────────────────────────────────────────────
  if (type === "registration") {
    const validateFn = deps.validateSession ?? validateRequestSessionWithCookieFallback;
    const session = await validateFn(sql, req);

    if (!session.ok || !session.humanId) {
      return res.status(401).json({ error: "unauthenticated", message: "Authenticated session required for passkey registration." });
    }

    const regResult = await verifyPasskeyRegistration(
      sql,
      session.humanId,
      response,
      challengeId,
      deviceLabel ?? "Passkey",
      reqOrigin
    );

    if (!regResult.ok) {
      return res.status(400).json({ error: regResult.error, message: "Passkey registration verification failed." });
    }

    return res.status(201).json({
      ok: true,
      credentialId: regResult.credentialId,
      authSubjectId: regResult.authSubjectId,
      message: "Passkey registered successfully.",
    });
  }

  // ── Authentication Verification ───────────────────────────────────────────
  if (type === "authentication") {
    const authResult = await verifyPasskeyAuthentication(sql, response, challengeId, reqOrigin);

    if (!authResult.ok) {
      const status = authResult.error === "challenge_not_found" || authResult.error === "challenge_expired" ? 401 : 400;
      return res.status(status).json({ error: authResult.error, message: "Passkey authentication verification failed." });
    }

    const { humanId, authSubjectId } = authResult;

    // Resolve default/homeverse identity for this human (fail closed if none verified)
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

    const createSess = deps.createSessionFn ?? createSession;
    const sessionResult = await createSess(sql, identityId, {
      humanId,
      authSubjectId,
      userAgent: req.headers["user-agent"] ?? null,
      ipAddress: req.headers["x-forwarded-for"] ?? null,
    });

    res.setHeader("Set-Cookie", buildSessionCookieHeader(sessionResult.rawToken, req));

    return res.status(200).json({
      ok: true,
      humanId,
      authSubjectId,
      message: "Passkey sign-in successful.",
    });
  }

  return res.status(400).json({ error: "invalid_type", message: "type must be 'registration' or 'authentication'." });
}
