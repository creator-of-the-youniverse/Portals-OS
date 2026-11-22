/**
 * lib/webauthnAuth.ts
 *
 * Full server-side WebAuthn/Passkey implementation for ItsYouOnline.
 * Uses @simplewebauthn/server for cryptographic ceremonies.
 *
 * Key invariants:
 *  - Challenges are single-use and expire (5-minute TTL).
 *  - Challenges are bound to humanId for registration; unbound for authentication.
 *  - Credential counter is validated monotonically to detect cloned authenticators.
 *  - Revoked credentials are hard-rejected.
 *  - No plaintext secrets persisted. Public keys stored as hex.
 */

import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from "@simplewebauthn/server";
import type {
  GenerateRegistrationOptionsOpts,
  RegistrationResponseJSON,
  AuthenticationResponseJSON,
} from "@simplewebauthn/server";
import crypto from "node:crypto";
import {
  WEBAUTHN_CONFIG,
  isAllowedWebAuthnOrigin,
  verifySignatureCounter,
} from "./passkeyScaffolding.ts";
import type { PasskeyCredentialRecord } from "./passkeyScaffolding.ts";

/**
 * Resolves the permitted expectedOrigin list for WebAuthn verification.
 * Includes the normalized tenant subdomain origin when validated by isAllowedWebAuthnOrigin().
 */
export function resolveExpectedWebAuthnOrigins(requestOrigin?: string): string[] {
  const origins = new Set<string>(WEBAUTHN_CONFIG.allowedOrigins);
  if (typeof requestOrigin === "string") {
    const normalized = requestOrigin.trim().toLowerCase().replace(/\/$/, "");
    if (isAllowedWebAuthnOrigin(normalized)) {
      origins.add(normalized);
    }
  }
  return Array.from(origins);
}

// ── Types ────────────────────────────────────────────────────────────────────

export interface StoredChallenge {
  challengeId: string;
  challenge: string;
  humanId: string | null;
  type: "registration" | "authentication";
  expiresAt: string;
  createdAt: string;
}

export interface PasskeyAuthResult {
  ok: true;
  humanId: string;
  authSubjectId: string;
  credentialId: string;
  newCounter: bigint;
}

export type PasskeyAuthError =
  | { ok: false; error: "challenge_not_found" }
  | { ok: false; error: "challenge_expired" }
  | { ok: false; error: "challenge_consumed" }
  | { ok: false; error: "wrong_human" }
  | { ok: false; error: "credential_not_found" }
  | { ok: false; error: "credential_revoked" }
  | { ok: false; error: "counter_invalid"; reason: string }
  | { ok: false; error: "verification_failed"; detail?: string }
  | { ok: false; error: "wrong_rpid" }
  | { ok: false; error: "wrong_origin" }
  | { ok: false; error: "revoke_requires_recent_auth" };

export interface PasskeyCredentialSummary {
  credentialId: string;
  authSubjectId: string;
  deviceLabel: string;
  transports: string[];
  createdAt: string;
  lastUsedAt: string | null;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function nowIso(): string {
  return new Date().toISOString();
}

/** Fetch and validate a challenge record. Marks it consumed on success. */
async function consumeChallenge(
  sql: any,
  challengeId: string,
  expectedType: "registration" | "authentication",
  expectedHumanId?: string | null
): Promise<{ ok: true; challenge: string; humanId: string | null } | PasskeyAuthError> {
  const rows = await sql`
    SELECT challenge_id, challenge, human_id, type, expires_at, consumed_at
    FROM webauthn_challenges
    WHERE challenge_id = ${challengeId}
    LIMIT 1
  `;

  if (!Array.isArray(rows) || rows.length === 0) {
    return { ok: false, error: "challenge_not_found" };
  }

  const row = rows[0];

  if (row.consumed_at !== null && row.consumed_at !== undefined) {
    return { ok: false, error: "challenge_consumed" };
  }

  if (new Date(row.expires_at) < new Date()) {
    return { ok: false, error: "challenge_expired" };
  }

  if (row.type !== expectedType) {
    return { ok: false, error: "challenge_not_found" };
  }

  if (expectedHumanId && row.human_id && String(row.human_id) !== expectedHumanId) {
    return { ok: false, error: "wrong_human" };
  }

  // Mark consumed (single-use)
  await sql`
    UPDATE webauthn_challenges
    SET consumed_at = ${nowIso()}
    WHERE challenge_id = ${challengeId}
  `;

  return {
    ok: true,
    challenge: String(row.challenge),
    humanId: row.human_id ? String(row.human_id) : null,
  };
}

// ── Registration ─────────────────────────────────────────────────────────────

/**
 * Generates WebAuthn registration options and stores the challenge.
 * Called when an authenticated user wants to add a passkey.
 */
export async function generatePasskeyRegistrationOptions(
  sql: any,
  humanId: string,
  existingCredentials: { credentialId: string; transports?: string[] }[] = []
): Promise<{ challengeId: string; options: object }> {
  const challengeId = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + WEBAUTHN_CONFIG.challengeTtlMs).toISOString();

  // Build exclude list from existing credentials to prevent re-registration
  const excludeCredentials = existingCredentials.map((c) => ({
    id: c.credentialId,
    transports: (c.transports ?? []) as AuthenticatorTransport[],
  }));

  const opts = await generateRegistrationOptions({
    rpName: WEBAUTHN_CONFIG.rpName,
    rpID: WEBAUTHN_CONFIG.rpID,
    userName: humanId,
    attestationType: WEBAUTHN_CONFIG.attestationPreference,
    excludeCredentials,
    authenticatorSelection: {
      residentKey: "preferred",
      userVerification: WEBAUTHN_CONFIG.userVerification,
    },
    timeout: WEBAUTHN_CONFIG.timeout,
  } as GenerateRegistrationOptionsOpts);

  // Store challenge — do not store the full options object
  await sql`
    INSERT INTO webauthn_challenges (challenge_id, challenge, human_id, type, expires_at, created_at)
    VALUES (${challengeId}, ${opts.challenge}, ${humanId}, 'registration', ${expiresAt}, ${nowIso()})
  `;

  return { challengeId, options: opts };
}

/**
 * Verifies a WebAuthn registration response, stores the new credential.
 */
export async function verifyPasskeyRegistration(
  sql: any,
  humanId: string,
  response: RegistrationResponseJSON,
  challengeId: string,
  deviceLabel = "Passkey",
  requestOrigin?: string
): Promise<{ ok: true; credentialId: string; authSubjectId: string } | PasskeyAuthError> {
  const challengeResult = await consumeChallenge(sql, challengeId, "registration", humanId);
  if (!challengeResult.ok) return challengeResult;

  let verification: Awaited<ReturnType<typeof verifyRegistrationResponse>>;
  try {
    verification = await verifyRegistrationResponse({
      response,
      expectedChallenge: challengeResult.challenge,
      expectedRPID: WEBAUTHN_CONFIG.rpID,
      expectedOrigin: resolveExpectedWebAuthnOrigins(requestOrigin),
    });
  } catch (err: any) {
    const msg = String(err?.message ?? "");
    if (msg.toLowerCase().includes("rpid")) return { ok: false, error: "wrong_rpid" };
    if (msg.toLowerCase().includes("origin")) return { ok: false, error: "wrong_origin" };
    return { ok: false, error: "verification_failed", detail: msg };
  }

  if (!verification.verified || !verification.registrationInfo) {
    return { ok: false, error: "verification_failed" };
  }

  const { credential } = verification.registrationInfo;
  const credentialId = credential.id;
  const publicKey = Buffer.from(credential.publicKey).toString("hex");
  const counter = BigInt(credential.counter ?? 0);
  const transports: string[] = Array.isArray(response.response?.transports)
    ? response.response.transports
    : [];

  const authSubjectId = crypto.randomUUID();
  const now = nowIso();

  // Insert human_auth_subjects row (provider_type = 'webauthn')
  await sql`
    INSERT INTO human_auth_subjects (id, human_id, provider_type, subject_identifier, status, verified_at, created_at, updated_at)
    VALUES (${authSubjectId}, ${humanId}, 'webauthn', ${credentialId}, 'active', ${now}, ${now}, ${now})
  `;

  // Insert passkey credential row
  await sql`
    INSERT INTO human_passkeys (credential_id, auth_subject_id, public_key, counter, device_label, transports, created_at)
    VALUES (${credentialId}, ${authSubjectId}, ${publicKey}, ${counter.toString()}, ${deviceLabel}, ${transports}, ${now})
  `;

  return { ok: true, credentialId, authSubjectId };
}

// ── Authentication ───────────────────────────────────────────────────────────

/**
 * Generates WebAuthn authentication options. No session required (pre-auth).
 * Optional credentialIds narrows the allowCredentials list to known credentials.
 */
export async function generatePasskeyAuthenticationOptions(
  sql: any,
  credentialIds?: string[]
): Promise<{ challengeId: string; options: object }> {
  const challengeId = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + WEBAUTHN_CONFIG.challengeTtlMs).toISOString();

  const allowCredentials = credentialIds?.map((id) => ({ id })) ?? [];

  const opts = await generateAuthenticationOptions({
    rpID: WEBAUTHN_CONFIG.rpID,
    timeout: WEBAUTHN_CONFIG.timeout,
    userVerification: WEBAUTHN_CONFIG.userVerification,
    allowCredentials,
  });

  await sql`
    INSERT INTO webauthn_challenges (challenge_id, challenge, human_id, type, expires_at, created_at)
    VALUES (${challengeId}, ${opts.challenge}, ${null}, 'authentication', ${expiresAt}, ${nowIso()})
  `;

  return { challengeId, options: opts };
}

/**
 * Verifies a WebAuthn authentication response, updates counter, returns humanId.
 */
export async function verifyPasskeyAuthentication(
  sql: any,
  response: AuthenticationResponseJSON,
  challengeId: string,
  requestOrigin?: string
): Promise<PasskeyAuthResult | PasskeyAuthError> {
  const challengeResult = await consumeChallenge(sql, challengeId, "authentication");
  if (!challengeResult.ok) return challengeResult;

  // Resolve credential from DB
  const credentialId = response.id ?? response.rawId;
  const credRows = await sql`
    SELECT p.credential_id, p.auth_subject_id, p.public_key, p.counter, p.transports,
           s.human_id, s.status as subject_status
    FROM human_passkeys p
    JOIN human_auth_subjects s ON s.id = p.auth_subject_id
    WHERE p.credential_id = ${credentialId}
    LIMIT 1
  `;

  if (!Array.isArray(credRows) || credRows.length === 0) {
    return { ok: false, error: "credential_not_found" };
  }

  const cred = credRows[0];

  if (String(cred.subject_status) === "revoked") {
    return { ok: false, error: "credential_revoked" };
  }

  const storedCounter = BigInt(cred.counter ?? 0);
  const publicKey = Buffer.from(String(cred.public_key), "hex");

  let verification: Awaited<ReturnType<typeof verifyAuthenticationResponse>>;
  try {
    verification = await verifyAuthenticationResponse({
      response,
      expectedChallenge: challengeResult.challenge,
      expectedRPID: WEBAUTHN_CONFIG.rpID,
      expectedOrigin: resolveExpectedWebAuthnOrigins(requestOrigin),
      credential: {
        id: String(cred.credential_id),
        publicKey,
        counter: Number(storedCounter),
        transports: Array.isArray(cred.transports) ? cred.transports : [],
      },
    });
  } catch (err: any) {
    const msg = String(err?.message ?? "");
    if (msg.toLowerCase().includes("rpid")) return { ok: false, error: "wrong_rpid" };
    if (msg.toLowerCase().includes("origin")) return { ok: false, error: "wrong_origin" };
    return { ok: false, error: "verification_failed", detail: msg };
  }

  if (!verification.verified || !verification.authenticationInfo) {
    return { ok: false, error: "verification_failed" };
  }

  const newCounter = BigInt(verification.authenticationInfo.newCounter);
  const counterCheck = verifySignatureCounter(storedCounter, newCounter);
  if (!counterCheck.valid) {
    return { ok: false, error: "counter_invalid", reason: counterCheck.reason! };
  }

  const now = nowIso();
  // Update counter and last_used_at
  await sql`
    UPDATE human_passkeys
    SET counter = ${newCounter.toString()}, last_used_at = ${now}
    WHERE credential_id = ${credentialId}
  `;

  return {
    ok: true,
    humanId: String(cred.human_id),
    authSubjectId: String(cred.auth_subject_id),
    credentialId: String(cred.credential_id),
    newCounter,
  };
}

// ── Credential Management ─────────────────────────────────────────────────────

/**
 * Revokes a passkey credential. hasRecentAuth is a boolean flag indicating
 * whether the caller has verified recent authentication (within last 5 minutes).
 */
export async function revokePasskeyCredential(
  sql: any,
  humanId: string,
  credentialId: string,
  hasRecentAuth: boolean
): Promise<{ ok: true } | PasskeyAuthError> {
  if (!hasRecentAuth) {
    return { ok: false, error: "revoke_requires_recent_auth" };
  }

  const rows = await sql`
    SELECT p.credential_id, s.human_id, s.status
    FROM human_passkeys p
    JOIN human_auth_subjects s ON s.id = p.auth_subject_id
    WHERE p.credential_id = ${credentialId}
      AND s.human_id = ${humanId}
    LIMIT 1
  `;

  if (!Array.isArray(rows) || rows.length === 0) {
    return { ok: false, error: "credential_not_found" };
  }

  if (String(rows[0].status) === "revoked") {
    return { ok: false, error: "credential_revoked" };
  }

  const now = nowIso();
  await sql`
    UPDATE human_auth_subjects
    SET status = 'revoked', revoked_at = ${now}, updated_at = ${now}
    WHERE id = (
      SELECT auth_subject_id FROM human_passkeys WHERE credential_id = ${credentialId}
    )
      AND human_id = ${humanId}
  `;

  return { ok: true };
}

/**
 * Returns all active passkey credentials for a human principal.
 */
export async function listPasskeyCredentials(
  sql: any,
  humanId: string
): Promise<PasskeyCredentialSummary[]> {
  const rows = await sql`
    SELECT p.credential_id, p.auth_subject_id, p.device_label, p.transports, p.created_at, p.last_used_at
    FROM human_passkeys p
    JOIN human_auth_subjects s ON s.id = p.auth_subject_id
    WHERE s.human_id = ${humanId}
      AND s.status = 'active'
    ORDER BY p.created_at ASC
  `;

  if (!Array.isArray(rows)) return [];

  return rows.map((r: any) => ({
    credentialId: String(r.credential_id),
    authSubjectId: String(r.auth_subject_id),
    deviceLabel: String(r.device_label ?? "Passkey"),
    transports: Array.isArray(r.transports) ? r.transports : [],
    createdAt: new Date(r.created_at).toISOString(),
    lastUsedAt: r.last_used_at ? new Date(r.last_used_at).toISOString() : null,
  }));
}
