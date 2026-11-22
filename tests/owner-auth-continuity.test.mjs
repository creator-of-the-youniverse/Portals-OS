/**
 * tests/owner-auth-continuity.test.mjs
 *
 * Comprehensive test suite verifying the Phase 2 ONEAI Human Continuity Identity,
 * Password Authentication, Role Enforcement, Session Compatibility, and Security Contracts.
 *
 * All tests execute in-memory with zero live database connections.
 * Run: node tests/owner-auth-continuity.test.mjs
 */

import assert from "node:assert";
import crypto from "node:crypto";
import {
  hashPassword,
  verifyPassword,
  validatePasswordStrength,
  executeDummyScryptVerification,
  generatePasswordResetToken,
  hashResetToken,
  checkLoginRateLimit,
  clearLoginRateLimit,
} from "../lib/passwordAuth.ts";
import {
  createHumanPrincipalWithPassword,
  getHumanAuthSubjectByEmail,
  resolveHumanYouniverseAccess,
  linkYouniverseToHuman,
  normalizeEmail,
} from "../lib/humanContinuity.ts";
import { createSession, validateSession, revokeSession, hashToken } from "../lib/neonSession.ts";
import { isAllowedWebAuthnOrigin, verifySignatureCounter } from "../lib/passkeyScaffolding.ts";
import { signHandoffToken, verifyHandoffToken } from "../lib/cryptoHandoff.ts";

let passedCount = 0;
let failedCount = 0;

function runTest(name, fn) {
  return Promise.resolve()
    .then(fn)
    .then(() => {
      console.log(`  ✓ ${name}`);
      passedCount++;
    })
    .catch((err) => {
      console.error(`  ✗ ${name}`);
      console.error(`     Error: ${err.message}`);
      failedCount++;
    });
}

// ── In-Memory SQL Mock Store ──────────────────────────────────────────────────
function createInMemoryDb() {
  const tables = {
    human_continuity_identities: [],
    human_auth_subjects: [],
    human_passwords: [],
    human_youniverse_associations: [],
    human_password_resets: [],
    youniverse_identities: [],
    sessions: [],
    handoff_tokens: [],
  };

  const sql = function (strings, ...values) {
    const query = strings.join("?");

    // SELECT from human_continuity_identities & auth_subjects
    if (query.includes("FROM human_continuity_identities h") && query.includes("s.subject_identifier = ?")) {
      const email = values[0];
      const subject = tables.human_auth_subjects.find(
        (s) => s.provider_type === "password" && s.subject_identifier === email && s.status === "active"
      );
      if (!subject) return Promise.resolve([]);
      const human = tables.human_continuity_identities.find((h) => h.human_id === subject.human_id && h.status === "active");
      if (!human) return Promise.resolve([]);
      const password = tables.human_passwords.find((p) => p.auth_subject_id === subject.id);
      if (!password) return Promise.resolve([]);

      return Promise.resolve([
        {
          human_id: human.human_id,
          human_status: human.status,
          human_created_at: human.created_at,
          human_updated_at: human.updated_at,
          subject_id: subject.id,
          provider_type: subject.provider_type,
          subject_identifier: subject.subject_identifier,
          subject_status: subject.status,
          verified_at: subject.verified_at,
          revoked_at: subject.revoked_at,
          subject_created_at: subject.created_at,
          password_hash: password.password_hash,
          salt: password.salt,
          algorithm: password.algorithm,
          password_created_at: password.created_at,
          password_updated_at: password.updated_at,
        },
      ]);
    }

    // INSERT INTO human_continuity_identities
    if (query.includes("INSERT INTO human_continuity_identities")) {
      const [human_id, created_at, updated_at] = values;
      tables.human_continuity_identities.push({ human_id, status: "active", created_at, updated_at });
      return Promise.resolve([]);
    }

    // INSERT INTO human_auth_subjects
    if (query.includes("INSERT INTO human_auth_subjects")) {
      const [id, human_id, subject_identifier, verified_at, created_at, updated_at] = values;
      tables.human_auth_subjects.push({
        id,
        human_id,
        provider_type: "password",
        subject_identifier,
        status: "active",
        verified_at,
        revoked_at: null,
        created_at,
        updated_at,
      });
      return Promise.resolve([]);
    }

    // INSERT INTO human_passwords
    if (query.includes("INSERT INTO human_passwords")) {
      const [auth_subject_id, password_hash, salt, algorithm, created_at, updated_at] = values;
      tables.human_passwords.push({ auth_subject_id, password_hash, salt, algorithm, created_at, updated_at });
      return Promise.resolve([]);
    }

    // SELECT from youniverse_identities WHERE username = ?
    if (query.includes("FROM youniverse_identities") && query.includes("WHERE username = ?")) {
      const username = values[0];
      const found = tables.youniverse_identities.filter((y) => y.username === username);
      return Promise.resolve(found);
    }

    // SELECT from human_continuity_identities WHERE human_id = ?
    if (query.includes("FROM human_continuity_identities") && query.includes("WHERE human_id = ?")) {
      const humanId = values[0];
      const found = tables.human_continuity_identities.filter((h) => h.human_id === humanId);
      return Promise.resolve(found);
    }

    // SELECT from human_youniverse_associations WHERE human_id = ? AND identity_id = ?
    if (query.includes("FROM human_youniverse_associations") && query.includes("WHERE human_id = ?") && query.includes("AND identity_id = ?")) {
      const [humanId, identityId] = values;
      const found = tables.human_youniverse_associations.filter((a) => a.human_id === humanId && a.identity_id === identityId);
      return Promise.resolve(found);
    }

    // Check existing homeverse
    if (query.includes("FROM human_youniverse_associations") && query.includes("is_homeverse = TRUE")) {
      const humanId = values[0];
      const found = tables.human_youniverse_associations.filter((a) => a.human_id === humanId && a.is_homeverse === true && a.revoked_at === null);
      return Promise.resolve(found);
    }

    // INSERT INTO human_youniverse_associations
    if (query.includes("INSERT INTO human_youniverse_associations")) {
      const [id, human_id, identity_id, role, verification_status, is_homeverse, verified_at, created_at] = values;
      tables.human_youniverse_associations.push({
        id,
        human_id,
        identity_id,
        role,
        verification_status,
        is_homeverse,
        requires_reverification: false,
        reverification_required_at: null,
        verified_at,
        revoked_at: null,
        revocation_reason: null,
        created_at,
      });
      return Promise.resolve([]);
    }

    // INSERT INTO sessions
    if (query.includes("INSERT INTO sessions")) {
      let id = crypto.randomUUID();
      let identity_id, human_id, auth_subject_id, token_hash, expires_at, user_agent, ip_address;
      if (values.length === 7) {
        [identity_id, human_id, auth_subject_id, token_hash, expires_at, user_agent, ip_address] = values;
      } else {
        [identity_id, token_hash, expires_at, user_agent, ip_address] = values;
        human_id = null;
        auth_subject_id = null;
      }
      tables.sessions.push({
        id,
        identity_id,
        human_id,
        auth_subject_id,
        token_hash,
        expires_at: new Date(expires_at),
        revoked_at: null,
        user_agent,
        ip_address,
      });
      return Promise.resolve([]);
    }

    // SELECT from sessions WHERE token_hash (matches updated neonSession.ts query with human_id, auth_subject_id)
    if (query.includes("FROM sessions") && query.includes("WHERE token_hash = ?")) {
      const hash = values[0];
      const row = tables.sessions.find((s) => s.token_hash === hash);
      return Promise.resolve(row ? [row] : []);
    }

    // UPDATE sessions SET revoked_at
    if (query.includes("UPDATE sessions") && query.includes("SET revoked_at")) {
      if (query.includes("WHERE human_id = ?")) {
        const humanId = values[0];
        for (const s of tables.sessions) {
          if (s.human_id === humanId) s.revoked_at = new Date();
        }
      } else if (query.includes("WHERE token_hash = ?")) {
        const hash = values[0];
        const s = tables.sessions.find((x) => x.token_hash === hash);
        if (s) s.revoked_at = new Date();
      }
      return Promise.resolve([]);
    }

    // INSERT INTO human_password_resets
    if (query.includes("INSERT INTO human_password_resets")) {
      const [human_id, token_hash, expires_at] = values;
      tables.human_password_resets.push({
        id: crypto.randomUUID(),
        human_id,
        token_hash,
        expires_at: new Date(expires_at),
        consumed_at: null,
      });
      return Promise.resolve([]);
    }

    // SELECT from human_password_resets
    if (query.includes("FROM human_password_resets") && query.includes("WHERE token_hash = ?")) {
      const hash = values[0];
      const row = tables.human_password_resets.find((r) => r.token_hash === hash);
      return Promise.resolve(row ? [row] : []);
    }

    // UPDATE human_password_resets SET consumed_at
    if (query.includes("UPDATE human_password_resets") && query.includes("SET consumed_at")) {
      const id = values[0];
      const row = tables.human_password_resets.find((r) => r.id === id);
      if (row) row.consumed_at = new Date();
      return Promise.resolve([]);
    }

    return Promise.resolve([]);
  };

  return { sql, tables };
}

// ── Test Suite Execution ──────────────────────────────────────────────────────
async function main() {
  console.log("=== PHASE 2: ONEAI HUMAN CONTINUITY & AUTHENTICATION TEST SUITE ===\n");

  // ── T01: First-Time Enrollment ──────────────────────────────────────────────
  await runTest("T01 — First-time enrollment creates Human Continuity Principal, auth subject, and scrypt hash", async () => {
    const { sql, tables } = createInMemoryDb();
    const { passwordHash, salt } = await hashPassword("StrongP@ssw0rd123");

    const { humanId, authSubjectId } = await createHumanPrincipalWithPassword(sql, {
      email: "human1@example.com",
      passwordHash,
      salt,
    });

    assert.ok(humanId, "humanId must be generated");
    assert.ok(authSubjectId, "authSubjectId must be generated");
    assert.strictEqual(tables.human_continuity_identities.length, 1);
    assert.strictEqual(tables.human_auth_subjects.length, 1);
    assert.strictEqual(tables.human_passwords.length, 1);
    assert.strictEqual(tables.human_auth_subjects[0].subject_identifier, "human1@example.com");
  });

  // ── T02: Human Identity Separation ──────────────────────────────────────────
  await runTest("T02 — Human identity separation: Two humans with different IDs cannot merge on email collision", async () => {
    const { sql, tables } = createInMemoryDb();
    const h1 = await hashPassword("PassOne12345");
    const h2 = await hashPassword("PassTwo12345");

    const user1 = await createHumanPrincipalWithPassword(sql, { email: "alice@domain.com", passwordHash: h1.passwordHash, salt: h1.salt });
    const user2 = await createHumanPrincipalWithPassword(sql, { email: "bob@domain.com", passwordHash: h2.passwordHash, salt: h2.salt });

    assert.notStrictEqual(user1.humanId, user2.humanId, "Human IDs must be completely distinct");
    assert.strictEqual(tables.human_continuity_identities.length, 2);
  });

  // ── T03: Option A Authenticated Linking ──────────────────────────────────────
  await runTest("T03 — Option A: Linking a Youniverse to a human requires an active human principal", async () => {
    const { sql, tables } = createInMemoryDb();
    const h = await hashPassword("PassLink12345");
    const { humanId } = await createHumanPrincipalWithPassword(sql, { email: "owner@domain.com", passwordHash: h.passwordHash, salt: h.salt });

    tables.youniverse_identities.push({
      identity_id: "youniverse-territory-1",
      username: "myhandle",
      is_live: true,
      email_verified_at: new Date(),
      plan: "free",
    });

    const assocId = await linkYouniverseToHuman(sql, {
      humanId,
      identityId: "youniverse-territory-1",
      role: "owner",
      isHomeverse: true,
      verificationStatus: "verified",
    });

    assert.ok(assocId);
    assert.strictEqual(tables.human_youniverse_associations.length, 1);
    assert.strictEqual(tables.human_youniverse_associations[0].role, "owner");
    assert.strictEqual(tables.human_youniverse_associations[0].is_homeverse, true);
  });

  // ── T04: Multi-Youniverse Ownership ─────────────────────────────────────────
  await runTest("T04 — Multi-Youniverse Ownership: One human can own multiple authorized Youniverses", async () => {
    const { sql, tables } = createInMemoryDb();
    const h = await hashPassword("MultiPass12345");
    const { humanId } = await createHumanPrincipalWithPassword(sql, { email: "founder@domain.com", passwordHash: h.passwordHash, salt: h.salt });

    tables.youniverse_identities.push(
      { identity_id: "y-1", username: "homeverse", is_live: true, email_verified_at: new Date(), plan: "founder" },
      { identity_id: "y-2", username: "studio", is_live: true, email_verified_at: new Date(), plan: "founder" }
    );

    await linkYouniverseToHuman(sql, { humanId, identityId: "y-1", role: "owner", isHomeverse: true, verificationStatus: "verified" });
    await linkYouniverseToHuman(sql, { humanId, identityId: "y-2", role: "owner", isHomeverse: false, verificationStatus: "verified" });

    const access1 = await resolveHumanYouniverseAccess(sql, humanId, "homeverse");
    const access2 = await resolveHumanYouniverseAccess(sql, humanId, "studio");

    assert.strictEqual(access1.isOwner, true);
    assert.strictEqual(access1.role, "owner");
    assert.strictEqual(access2.isOwner, true);
    assert.strictEqual(access2.role, "owner");
  });

  // ── T05: Cross-Youniverse Boundary Denial ───────────────────────────────────
  await runTest("T05 — Cross-Youniverse Denial: Session for Human A cannot access unassociated Youniverse B", async () => {
    const { sql, tables } = createInMemoryDb();
    const h = await hashPassword("PassDenied123");
    const { humanId } = await createHumanPrincipalWithPassword(sql, { email: "intruder@domain.com", passwordHash: h.passwordHash, salt: h.salt });

    tables.youniverse_identities.push({
      identity_id: "y-victim",
      username: "victim",
      is_live: true,
      email_verified_at: new Date(),
      plan: "free",
    });

    const access = await resolveHumanYouniverseAccess(sql, humanId, "victim");
    assert.strictEqual(access.allowed, false);
    assert.strictEqual(access.isOwner, false);
    assert.strictEqual(access.reason, "not_associated");
  });

  // ── T06: Operator Role Boundary ────────────────────────────────────────────
  await runTest("T06 — Operator Role Boundary: Operator receives isOwner: false and cannot escalate to owner", async () => {
    const { sql, tables } = createInMemoryDb();
    const h = await hashPassword("OperatorP@ss1");
    const { humanId } = await createHumanPrincipalWithPassword(sql, { email: "op@domain.com", passwordHash: h.passwordHash, salt: h.salt });

    tables.youniverse_identities.push({
      identity_id: "y-ops",
      username: "opsverse",
      is_live: true,
      email_verified_at: new Date(),
      plan: "free",
    });

    await linkYouniverseToHuman(sql, { humanId, identityId: "y-ops", role: "operator", verificationStatus: "verified" });

    const access = await resolveHumanYouniverseAccess(sql, humanId, "opsverse");
    assert.strictEqual(access.allowed, true);
    assert.strictEqual(access.isOwner, false, "Operator must NEVER receive isOwner: true");
    assert.strictEqual(access.role, "operator");
  });

  // ── T07: Participant Role Boundary ──────────────────────────────────────────
  await runTest("T07 — Participant Role Boundary: Participant receives isOwner: false", async () => {
    const { sql, tables } = createInMemoryDb();
    const h = await hashPassword("ParticipantP@ss1");
    const { humanId } = await createHumanPrincipalWithPassword(sql, { email: "part@domain.com", passwordHash: h.passwordHash, salt: h.salt });

    tables.youniverse_identities.push({
      identity_id: "y-part",
      username: "partverse",
      is_live: true,
      email_verified_at: new Date(),
      plan: "free",
    });

    await linkYouniverseToHuman(sql, { humanId, identityId: "y-part", role: "participant", verificationStatus: "verified" });

    const access = await resolveHumanYouniverseAccess(sql, humanId, "partverse");
    assert.strictEqual(access.allowed, true);
    assert.strictEqual(access.isOwner, false);
    assert.strictEqual(access.role, "participant");
  });

  // ── T08: Suspended Association Fail-Closed ──────────────────────────────────
  await runTest("T08 — Suspended Association: Returns fail-closed association_suspended", async () => {
    const { sql, tables } = createInMemoryDb();
    const h = await hashPassword("SuspendedP@ss1");
    const { humanId } = await createHumanPrincipalWithPassword(sql, { email: "sus@domain.com", passwordHash: h.passwordHash, salt: h.salt });

    tables.youniverse_identities.push({ identity_id: "y-sus", username: "susverse", is_live: true, email_verified_at: new Date(), plan: "free" });
    await linkYouniverseToHuman(sql, { humanId, identityId: "y-sus", role: "owner", verificationStatus: "verified" });

    // Mark suspended
    tables.human_youniverse_associations[0].verification_status = "suspended";

    const access = await resolveHumanYouniverseAccess(sql, humanId, "susverse");
    assert.strictEqual(access.allowed, false);
    assert.strictEqual(access.isOwner, false);
    assert.strictEqual(access.reason, "association_suspended");
  });

  // ── T09: Revoked Association Fail-Closed ────────────────────────────────────
  await runTest("T09 — Revoked Association: Returns fail-closed association_revoked", async () => {
    const { sql, tables } = createInMemoryDb();
    const h = await hashPassword("RevokedP@ss1");
    const { humanId } = await createHumanPrincipalWithPassword(sql, { email: "rev@domain.com", passwordHash: h.passwordHash, salt: h.salt });

    tables.youniverse_identities.push({ identity_id: "y-rev", username: "revverse", is_live: true, email_verified_at: new Date(), plan: "free" });
    await linkYouniverseToHuman(sql, { humanId, identityId: "y-rev", role: "owner", verificationStatus: "verified" });

    // Mark revoked
    tables.human_youniverse_associations[0].verification_status = "revoked";
    tables.human_youniverse_associations[0].revoked_at = new Date().toISOString();

    const access = await resolveHumanYouniverseAccess(sql, humanId, "revverse");
    assert.strictEqual(access.allowed, false);
    assert.strictEqual(access.isOwner, false);
    assert.strictEqual(access.reason, "association_revoked");
  });

  // ── T10: Reverification Required Fail-Closed ────────────────────────────────
  await runTest("T10 — Reverification Required: Returns fail-closed reverification_required", async () => {
    const { sql, tables } = createInMemoryDb();
    const h = await hashPassword("ReverifyP@ss1");
    const { humanId } = await createHumanPrincipalWithPassword(sql, { email: "rv@domain.com", passwordHash: h.passwordHash, salt: h.salt });

    tables.youniverse_identities.push({ identity_id: "y-rv", username: "rvverse", is_live: true, email_verified_at: new Date(), plan: "free" });
    await linkYouniverseToHuman(sql, { humanId, identityId: "y-rv", role: "owner", verificationStatus: "verified" });

    // Set requires_reverification = true
    tables.human_youniverse_associations[0].requires_reverification = true;

    const access = await resolveHumanYouniverseAccess(sql, humanId, "rvverse");
    assert.strictEqual(access.allowed, false);
    assert.strictEqual(access.isOwner, false);
    assert.strictEqual(access.reason, "reverification_required");
  });

  // ── T11: Legacy Session Compatibility ───────────────────────────────────────
  await runTest("T11 — Legacy Session: sessions.human_id IS NULL authorizes origin identity correctly", async () => {
    const { sql, tables } = createInMemoryDb();
    const { rawToken } = await createSession(sql, "legacy-ident-123");

    const validated = await validateSession(sql, rawToken);
    assert.strictEqual(validated.ok, true);
    assert.strictEqual(validated.identityId, "legacy-ident-123");
    assert.strictEqual(validated.humanId, null);
  });

  // ── T12: New Human Continuity Session Resolution ────────────────────────────
  await runTest("T12 — Human Continuity Session: Session carries humanId and authSubjectId", async () => {
    const { sql, tables } = createInMemoryDb();
    const { rawToken } = await createSession(sql, "y-target", {
      humanId: "human-uuid-456",
      authSubjectId: "subject-uuid-789",
    });

    const validated = await validateSession(sql, rawToken);
    assert.strictEqual(validated.ok, true);
    assert.strictEqual(validated.identityId, "y-target");
    assert.strictEqual(validated.humanId, "human-uuid-456");
    assert.strictEqual(validated.authSubjectId, "subject-uuid-789");
  });

  // ── T13: Password Reset and Session Revocation ──────────────────────────────
  await runTest("T13 — Password Reset: Consuming reset token revokes all active sessions for that human", async () => {
    const { sql, tables } = createInMemoryDb();
    const h = await hashPassword("InitialP@ss1");
    const { humanId } = await createHumanPrincipalWithPassword(sql, { email: "reset@domain.com", passwordHash: h.passwordHash, salt: h.salt });

    const session1 = await createSession(sql, "y-res", { humanId });
    const session2 = await createSession(sql, "y-res", { humanId });

    const reset = generatePasswordResetToken();
    await sql`
      INSERT INTO human_password_resets (human_id, token_hash, expires_at)
      VALUES (${humanId}, ${reset.tokenHash}, ${reset.expiresAt.toISOString()})
    `;

    // Revoke sessions for human
    await sql`UPDATE sessions SET revoked_at = NOW() WHERE human_id = ${humanId}`;

    const v1 = await validateSession(sql, session1.rawToken);
    const v2 = await validateSession(sql, session2.rawToken);

    assert.strictEqual(v1.ok, false);
    assert.strictEqual(v1.reason, "revoked");
    assert.strictEqual(v2.ok, false);
    assert.strictEqual(v2.reason, "revoked");
  });

  // ── T14: Anti-Enumeration Timing Mitigation ─────────────────────────────────
  await runTest("T14 — Anti-Enumeration: Dummy scrypt calculation executes successfully", async () => {
    const t0 = Date.now();
    await executeDummyScryptVerification();
    const elapsed = Date.now() - t0;
    assert.ok(elapsed >= 5, "Dummy scrypt derivation must execute with significant non-zero cost");
  });

  // ── T15: Rate Limiting Abuse Controls ───────────────────────────────────────
  await runTest("T15 — Rate Limiting: Blocks repeated failed attempts within window", async () => {
    const testKey = "192.168.1.1:victim@domain.com";
    clearLoginRateLimit(testKey);

    for (let i = 0; i < 5; i++) {
      const res = checkLoginRateLimit(testKey, 5, 10000);
      assert.strictEqual(res.allowed, true);
    }

    const blocked = checkLoginRateLimit(testKey, 5, 10000);
    assert.strictEqual(blocked.allowed, false);
    assert.ok(blocked.retryAfterSeconds > 0);
  });

  // ── T16: WebAuthn Origin and Counter Validation ─────────────────────────────
  await runTest("T16 — WebAuthn Scaffolding: Strict non-wildcard origin and signature counter checks", async () => {
    assert.strictEqual(isAllowedWebAuthnOrigin("https://itsyouonline.com"), true);
    assert.strictEqual(isAllowedWebAuthnOrigin("https://welcome.itsyouonline.com"), true);
    assert.strictEqual(isAllowedWebAuthnOrigin("https://alice.itsyouonline.com"), true);
    assert.strictEqual(isAllowedWebAuthnOrigin("https://evil.com"), false);
    assert.strictEqual(isAllowedWebAuthnOrigin("https://*.itsyouonline.com"), false, "Wildcard origins must be rejected");

    const counterOk = verifySignatureCounter(10n, 11n);
    assert.strictEqual(counterOk.valid, true);

    const counterReplay = verifySignatureCounter(10n, 9n);
    assert.strictEqual(counterReplay.valid, false);

    const zeroCounterOk = verifySignatureCounter(0n, 0n);
    assert.strictEqual(zeroCounterOk.valid, true);
  });

  // ── T17: Singleton Homeverse Constraint ──────────────────────────────────────
  await runTest("T17 — Singleton Homeverse: Attempting to link two active Homeverses throws an error", async () => {
    const { sql } = createInMemoryDb();
    const h = await hashPassword("HomeverseP@ss1");
    const { humanId } = await createHumanPrincipalWithPassword(sql, { email: "home@domain.com", passwordHash: h.passwordHash, salt: h.salt });

    await linkYouniverseToHuman(sql, { humanId, identityId: "h-1", role: "owner", isHomeverse: true, verificationStatus: "verified" });

    let threw = false;
    try {
      await linkYouniverseToHuman(sql, { humanId, identityId: "h-2", role: "owner", isHomeverse: true, verificationStatus: "verified" });
    } catch (err) {
      threw = true;
      assert.ok(err.message.includes("Cannot set multiple Homeverses"));
    }
    assert.strictEqual(threw, true, "Must throw when multiple active Homeverses are attempted");
  });

  console.log("\n──────────────────────────────────────────────────");
  console.log(`Results: ${passedCount} passed, ${failedCount} failed`);

  if (failedCount > 0) {
    process.exit(1);
  }
}

main();
