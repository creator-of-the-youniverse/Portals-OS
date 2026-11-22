/**
 * tests/r5-passkey.test.mjs
 *
 * Test suite for Founder Decision A — WebAuthn / Passkey Implementation.
 *
 * In-memory tests only. Zero live database or network connections.
 */

import assert from "node:assert/strict";
import crypto from "node:crypto";
import {
  generatePasskeyRegistrationOptions,
  verifyPasskeyRegistration,
  generatePasskeyAuthenticationOptions,
  verifyPasskeyAuthentication,
  revokePasskeyCredential,
  listPasskeyCredentials,
} from "../lib/webauthnAuth.ts";
import {
  isAllowedWebAuthnOrigin,
  verifySignatureCounter,
  WEBAUTHN_CONFIG,
} from "../lib/passkeyScaffolding.ts";
import passkeyOptionsHandler from "../api/auth/passkey/options.ts";
import passkeyVerifyHandler from "../api/auth/passkey/verify.ts";

let passed = 0;
let failed = 0;

async function test(name, fn) {
  try {
    await fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error(`     ${err.message}`);
    failed++;
  }
}

// ── In-memory mock DB for passkeys ──────────────────────────────────────────
function makePasskeyDb() {
  const store = {
    webauthn_challenges: [],
    human_auth_subjects: [],
    human_passkeys: [],
    human_continuity_identities: [],
    human_youniverse_associations: [],
    sessions: [],
  };

  const sql = async (strings, ...values) => {
    const full = strings.join("?");

    // INSERT INTO webauthn_challenges
    // 'registration' and 'authentication' are SQL literals in VALUES clause
    if (full.includes("INSERT INTO webauthn_challenges")) {
      const type = full.includes("'registration'") ? "registration" : "authentication";
      const [challenge_id, challenge, human_id, expires_at, created_at] = values;
      store.webauthn_challenges.push({
        challenge_id,
        challenge,
        human_id,
        type,
        expires_at,
        created_at,
        consumed_at: null,
      });
      return [];
    }

    // SELECT webauthn_challenges
    if (full.includes("FROM webauthn_challenges") && full.includes("challenge_id = ?")) {
      const challenge_id = values[0];
      return store.webauthn_challenges.filter((c) => c.challenge_id === challenge_id);
    }

    // UPDATE webauthn_challenges SET consumed_at
    if (full.includes("UPDATE webauthn_challenges") && full.includes("consumed_at")) {
      const now = values[0];
      const challenge_id = values[1];
      const c = store.webauthn_challenges.find((item) => item.challenge_id === challenge_id);
      if (c) c.consumed_at = now;
      return [];
    }

    // INSERT INTO human_auth_subjects
    if (full.includes("INSERT INTO human_auth_subjects")) {
      const [id, human_id, provider_type, subject_identifier, status, verified_at, created_at, updated_at] = values;
      store.human_auth_subjects.push({
        id,
        human_id,
        provider_type,
        subject_identifier,
        status,
        verified_at,
        revoked_at: null,
        created_at,
        updated_at,
      });
      return [];
    }

    // INSERT INTO human_passkeys
    if (full.includes("INSERT INTO human_passkeys")) {
      const [credential_id, auth_subject_id, public_key, counter, device_label, transports, created_at] = values;
      store.human_passkeys.push({
        credential_id,
        auth_subject_id,
        public_key,
        counter,
        device_label,
        transports,
        created_at,
        last_used_at: null,
      });
      return [];
    }

    // SELECT human_passkeys JOIN human_auth_subjects by credential_id
    if (full.includes("FROM human_passkeys p") && full.includes("p.credential_id = ?")) {
      const credential_id = values[0];
      const cred = store.human_passkeys.find((p) => p.credential_id === credential_id);
      if (!cred) return [];
      const subj = store.human_auth_subjects.find((s) => s.id === cred.auth_subject_id);
      if (!subj) return [];
      return [{
        credential_id: cred.credential_id,
        auth_subject_id: cred.auth_subject_id,
        public_key: cred.public_key,
        counter: cred.counter,
        transports: cred.transports,
        human_id: subj.human_id,
        subject_status: subj.status,
      }];
    }

    // UPDATE human_passkeys SET counter
    if (full.includes("UPDATE human_passkeys") && full.includes("counter = ?")) {
      const counter = values[0];
      const last_used_at = values[1];
      const credential_id = values[2];
      const cred = store.human_passkeys.find((p) => p.credential_id === credential_id);
      if (cred) {
        cred.counter = counter;
        cred.last_used_at = last_used_at;
      }
      return [];
    }

    // SELECT for revocation
    if (full.includes("SELECT p.credential_id, s.human_id, s.status") && full.includes("p.credential_id = ?")) {
      const credential_id = values[0];
      const human_id = values[1];
      const cred = store.human_passkeys.find((p) => p.credential_id === credential_id);
      if (!cred) return [];
      const subj = store.human_auth_subjects.find((s) => s.id === cred.auth_subject_id && s.human_id === human_id);
      if (!subj) return [];
      return [{ credential_id: cred.credential_id, human_id: subj.human_id, status: subj.status }];
    }

    // UPDATE human_auth_subjects revoke
    if (full.includes("UPDATE human_auth_subjects") && full.includes("status = 'revoked'")) {
      const now = values[0];
      const credential_id = values[2];
      const human_id = values[3];
      const cred = store.human_passkeys.find((p) => p.credential_id === credential_id);
      if (cred) {
        const subj = store.human_auth_subjects.find((s) => s.id === cred.auth_subject_id && s.human_id === human_id);
        if (subj) {
          subj.status = "revoked";
          subj.revoked_at = now;
        }
      }
      return [];
    }

    // SELECT listPasskeyCredentials
    if (full.includes("FROM human_passkeys p") && full.includes("s.human_id = ?") && full.includes("s.status = 'active'")) {
      const human_id = values[0];
      const activeSubjects = store.human_auth_subjects.filter((s) => s.human_id === human_id && s.status === "active");
      const activeSubjectIds = new Set(activeSubjects.map((s) => s.id));
      return store.human_passkeys
        .filter((p) => activeSubjectIds.has(p.auth_subject_id))
        .map((p) => ({
          credential_id: p.credential_id,
          auth_subject_id: p.auth_subject_id,
          device_label: p.device_label,
          transports: p.transports,
          created_at: p.created_at,
          last_used_at: p.last_used_at,
        }));
    }

    // SELECT association
    if (full.includes("FROM human_youniverse_associations")) {
      const human_id = values[0];
      return store.human_youniverse_associations.filter((a) => a.human_id === human_id);
    }

    return [];
  };

  return { store, sql };
}

function makeRes() {
  const r = { _status: 200, _headers: {}, _body: null };
  r.status = (s) => { r._status = s; return r; };
  r.json = (b) => { r._body = b; return r; };
  r.setHeader = (k, v) => { r._headers[k] = v; return r; };
  return r;
}

console.log("\n═══ Passkey Core & Scaffolding Tests ═══\n");

await test("PK-01 — Origin validation allows root, welcome, and clean tenant subdomains", () => {
  assert.equal(isAllowedWebAuthnOrigin("https://itsyouonline.com"), true);
  assert.equal(isAllowedWebAuthnOrigin("https://welcome.itsyouonline.com"), true);
  assert.equal(isAllowedWebAuthnOrigin("https://alice.itsyouonline.com"), true);
  assert.equal(isAllowedWebAuthnOrigin("https://creator-001.itsyouonline.com"), true);

  // Rejections
  assert.equal(isAllowedWebAuthnOrigin("http://itsyouonline.com"), false, "HTTP rejected");
  assert.equal(isAllowedWebAuthnOrigin("https://evil.com"), false, "External domain rejected");
  assert.equal(isAllowedWebAuthnOrigin("https://alice.evil.com"), false, "Lookalike rejected");
  assert.equal(isAllowedWebAuthnOrigin(""), false);
  assert.equal(isAllowedWebAuthnOrigin(undefined), false);
});

await test("PK-02 — Monotonic signature counter detects counter rollback (authenticator clone)", () => {
  // Initial 0 -> 0 is valid for platform authenticators
  assert.equal(verifySignatureCounter(0n, 0n).valid, true);

  // Counter increments normally
  assert.equal(verifySignatureCounter(10n, 11n).valid, true);
  assert.equal(verifySignatureCounter(10n, 15n).valid, true);

  // Counter decreases (rollback / clone detection)
  const decreased = verifySignatureCounter(15n, 10n);
  assert.equal(decreased.valid, false);
  assert.ok(decreased.reason?.includes("Potential authenticator clone"));

  // Replay of same counter (when > 0)
  const replayed = verifySignatureCounter(5n, 5n);
  assert.equal(replayed.valid, false);
});

await test("PK-03 — Registration options generated with 5-minute challenge and stored in DB", async () => {
  const { store, sql } = makePasskeyDb();
  const humanId = "human-alice";

  const { challengeId, options } = await generatePasskeyRegistrationOptions(sql, humanId, []);
  assert.ok(challengeId);
  assert.ok(options);
  assert.equal(options.rp.name, "ItsYouOnline");
  assert.equal(options.rp.id, "itsyouonline.com");
  assert.equal(options.user.name, humanId);

  // Challenge must be stored in DB
  const stored = store.webauthn_challenges.find((c) => c.challenge_id === challengeId);
  assert.ok(stored);
  assert.equal(stored.human_id, humanId);
  assert.equal(stored.type, "registration");
  assert.equal(stored.consumed_at, null);
});

await test("PK-04 — Registration options excludes existing credentials to prevent duplicate enrollment", async () => {
  const { sql } = makePasskeyDb();
  const humanId = "human-alice";
  const existing = [{ credentialId: "cred-1", transports: ["internal"] }];

  const { options } = await generatePasskeyRegistrationOptions(sql, humanId, existing);
  assert.equal(options.excludeCredentials?.length, 1);
  assert.equal(options.excludeCredentials[0].id, "cred-1");
});

await test("PK-05 — Authentication options generated for pre-auth (unbound humanId)", async () => {
  const { store, sql } = makePasskeyDb();

  const { challengeId, options } = await generatePasskeyAuthenticationOptions(sql);
  assert.ok(challengeId);
  assert.ok(options);
  assert.equal(options.rpId, "itsyouonline.com");

  const stored = store.webauthn_challenges.find((c) => c.challenge_id === challengeId);
  assert.ok(stored);
  assert.equal(stored.human_id, null, "Authentication challenge is pre-auth / unbound");
  assert.equal(stored.type, "authentication");
});

await test("PK-06 — Challenge consumed cannot be replayed (challenge_consumed)", async () => {
  const { store, sql } = makePasskeyDb();
  const challengeId = crypto.randomUUID();
  store.webauthn_challenges.push({
    challenge_id: challengeId,
    challenge: "chal-123",
    human_id: "human-1",
    type: "registration",
    expires_at: new Date(Date.now() + 300000).toISOString(),
    created_at: new Date().toISOString(),
    consumed_at: new Date().toISOString(), // already consumed
  });

  const dummyResponse = { id: "c1", rawId: "c1", response: {}, type: "public-key", clientExtensionResults: {} };
  const result = await verifyPasskeyRegistration(sql, "human-1", dummyResponse, challengeId);
  assert.equal(result.ok, false);
  assert.equal(result.error, "challenge_consumed");
});

await test("PK-07 — Expired challenge rejected (challenge_expired)", async () => {
  const { store, sql } = makePasskeyDb();
  const challengeId = crypto.randomUUID();
  store.webauthn_challenges.push({
    challenge_id: challengeId,
    challenge: "chal-123",
    human_id: "human-1",
    type: "registration",
    expires_at: new Date(Date.now() - 1000).toISOString(), // expired
    created_at: new Date().toISOString(),
    consumed_at: null,
  });

  const dummyResponse = { id: "c1", rawId: "c1", response: {}, type: "public-key", clientExtensionResults: {} };
  const result = await verifyPasskeyRegistration(sql, "human-1", dummyResponse, challengeId);
  assert.equal(result.ok, false);
  assert.equal(result.error, "challenge_expired");
});

await test("PK-08 — Challenge bound to different human rejected (wrong_human)", async () => {
  const { store, sql } = makePasskeyDb();
  const challengeId = crypto.randomUUID();
  store.webauthn_challenges.push({
    challenge_id: challengeId,
    challenge: "chal-123",
    human_id: "human-alice",
    type: "registration",
    expires_at: new Date(Date.now() + 300000).toISOString(),
    created_at: new Date().toISOString(),
    consumed_at: null,
  });

  const dummyResponse = { id: "c1", rawId: "c1", response: {}, type: "public-key", clientExtensionResults: {} };
  const result = await verifyPasskeyRegistration(sql, "human-bob", dummyResponse, challengeId); // Bob trying to consume Alice's challenge
  assert.equal(result.ok, false);
  assert.equal(result.error, "wrong_human");
});

await test("PK-09 — Revocation requires recent auth flag", async () => {
  const { store, sql } = makePasskeyDb();
  const humanId = "human-alice";
  const authSubjId = "subj-1";
  const credId = "cred-1";

  store.human_auth_subjects.push({ id: authSubjId, human_id: humanId, status: "active" });
  store.human_passkeys.push({ credential_id: credId, auth_subject_id: authSubjId });

  // Without recent auth -> rejected
  const resNoAuth = await revokePasskeyCredential(sql, humanId, credId, false);
  assert.equal(resNoAuth.ok, false);
  assert.equal(resNoAuth.error, "revoke_requires_recent_auth");

  // With recent auth -> success
  const resWithAuth = await revokePasskeyCredential(sql, humanId, credId, true);
  assert.equal(resWithAuth.ok, true);

  const subj = store.human_auth_subjects.find((s) => s.id === authSubjId);
  assert.equal(subj.status, "revoked");
});

await test("PK-10 — listPasskeyCredentials returns multiple credentials and excludes revoked", async () => {
  const { store, sql } = makePasskeyDb();
  const humanId = "human-multi";

  // Cred 1 (active MacBook)
  store.human_auth_subjects.push({ id: "s1", human_id: humanId, status: "active" });
  store.human_passkeys.push({
    credential_id: "c1",
    auth_subject_id: "s1",
    device_label: "MacBook Pro Touch ID",
    transports: ["internal"],
    created_at: new Date().toISOString(),
  });

  // Cred 2 (active YubiKey)
  store.human_auth_subjects.push({ id: "s2", human_id: humanId, status: "active" });
  store.human_passkeys.push({
    credential_id: "c2",
    auth_subject_id: "s2",
    device_label: "YubiKey 5C NFC",
    transports: ["usb", "nfc"],
    created_at: new Date().toISOString(),
  });

  // Cred 3 (revoked old iPhone)
  store.human_auth_subjects.push({ id: "s3", human_id: humanId, status: "revoked" });
  store.human_passkeys.push({
    credential_id: "c3",
    auth_subject_id: "s3",
    device_label: "Old iPhone",
    transports: ["internal"],
    created_at: new Date().toISOString(),
  });

  const list = await listPasskeyCredentials(sql, humanId);
  assert.equal(list.length, 2, "Only 2 active credentials should be listed");
  assert.ok(list.some((c) => c.credentialId === "c1" && c.deviceLabel === "MacBook Pro Touch ID"));
  assert.ok(list.some((c) => c.credentialId === "c2" && c.deviceLabel === "YubiKey 5C NFC"));
  assert.ok(!list.some((c) => c.credentialId === "c3"), "Revoked credential must not be listed");
});

console.log("\n═══ Passkey API Handlers Tests ═══\n");

await test("PK-11 — API options: Registration rejected without session (401)", async () => {
  const { sql } = makePasskeyDb();
  const req = {
    method: "POST",
    headers: { "x-portals-request": "1", "origin": "https://itsyouonline.com" },
    body: { type: "registration" },
  };
  const res = makeRes();
  const mockValidateSession = async () => ({ ok: false });

  await passkeyOptionsHandler(req, res, { sql, validateSession: mockValidateSession });
  assert.equal(res._status, 401);
  assert.equal(res._body.error, "unauthenticated");
});

await test("PK-12 — API options: Authentication allowed without session (pre-auth 200)", async () => {
  const { sql } = makePasskeyDb();
  const req = {
    method: "POST",
    headers: { "x-portals-request": "1", "origin": "https://itsyouonline.com" },
    body: { type: "authentication" },
  };
  const res = makeRes();

  await passkeyOptionsHandler(req, res, { sql });
  assert.equal(res._status, 200);
  assert.equal(res._body.ok, true);
  assert.equal(res._body.type, "authentication");
  assert.ok(res._body.challengeId);
  assert.ok(res._body.options);
});

console.log("\n──────────────────────────────────────────────────");
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
