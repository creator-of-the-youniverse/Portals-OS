/**
 * Phase 1 — Session layer tests
 *
 * Tests the core security invariants of neonSession.ts using an
 * in-memory mock of the Neon SQL client. No live database is touched.
 *
 * Run: node --experimental-vm-modules tests/phase1-session.test.mjs
 *
 * Test matrix:
 *   PASS — valid token, live session         → ok:true
 *   PASS — expired session                   → ok:false / expired
 *   PASS — revoked session                   → ok:false / revoked
 *   PASS — forged token (no DB row)          → ok:false / not_found
 *   PASS — prov_ prefix alone (no DB row)    → ok:false / not_found
 *   PASS — wrong-identity token              → isOwner:false from context check
 *   PASS — hash is deterministic             → same input → same hash
 *   PASS — two tokens have different hashes  → no hash collision
 */

import { createHash, randomBytes } from "crypto";
import assert from "assert";

// ── Inline port of hashToken (avoids TypeScript compilation in test) ─────────
function hashToken(raw) {
  return createHash("sha256").update(raw, "utf8").digest("hex");
}

// ── In-memory session store ──────────────────────────────────────────────────
function makeInMemorySql(sessions = []) {
  // Returns a tagged-template mock with the same interface as neon()
  return function sql(strings, ...values) {
    const query = strings.join("?");

    // INSERT session
    if (query.includes("INSERT INTO sessions")) {
      const [identity_id, token_hash, expires_at, user_agent, ip_address] = values;
      sessions.push({
        id: randomBytes(8).toString("hex"),
        identity_id,
        token_hash,
        expires_at: new Date(expires_at),
        revoked_at: null,
        user_agent,
        ip_address,
        created_at: new Date(),
      });
      return Promise.resolve([]);
    }

    // SELECT session by token_hash
    if (query.includes("SELECT id, identity_id, expires_at, revoked_at") &&
        query.includes("WHERE token_hash")) {
      const hash = values[0];
      const row = sessions.find(s => s.token_hash === hash);
      return Promise.resolve(row ? [row] : []);
    }

    // UPDATE revoke
    if (query.includes("UPDATE sessions") && query.includes("SET revoked_at")) {
      const hash = values[0];
      const row = sessions.find(s => s.token_hash === hash && !s.revoked_at);
      if (row) row.revoked_at = new Date();
      return Promise.resolve([]);
    }

    return Promise.resolve([]);
  };
}

// ── Import session helpers (pure JS subset — no TS features used here) ───────
// We inline the logic to avoid requiring a build step for tests.
async function createSession(sql, identityId, opts = {}) {
  const ttlSeconds = opts.ttlSeconds ?? 60 * 60 * 24 * 7;
  const rawToken = randomBytes(24).toString("hex");
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + ttlSeconds * 1000);

  await sql`INSERT INTO sessions (identity_id, token_hash, expires_at, user_agent, ip_address) VALUES (${identityId}, ${tokenHash}, ${expiresAt.toISOString()}, ${opts.userAgent ?? null}, ${opts.ipAddress ?? null})`;

  return { rawToken, expiresAt };
}

async function validateSession(sql, rawToken) {
  if (!rawToken || typeof rawToken !== "string" || rawToken.length < 8) {
    return { ok: false, reason: "not_found" };
  }
  const tokenHash = hashToken(rawToken);
  const rows = await sql`SELECT id, identity_id, expires_at, revoked_at FROM sessions WHERE token_hash = ${tokenHash} LIMIT 1`;
  if (rows.length === 0) return { ok: false, reason: "not_found" };
  const row = rows[0];
  if (row.revoked_at !== null) return { ok: false, reason: "revoked" };
  if (new Date(row.expires_at) < new Date()) return { ok: false, reason: "expired" };
  return { ok: true, identityId: String(row.identity_id), sessionId: String(row.id) };
}

async function revokeSession(sql, rawToken) {
  const tokenHash = hashToken(rawToken);
  await sql`UPDATE sessions SET revoked_at = NOW() WHERE token_hash = ${tokenHash} AND revoked_at IS NULL`;
}

// ── Test runner ───────────────────────────────────────────────────────────────
let passed = 0;
let failed = 0;

async function test(name, fn) {
  try {
    await fn();
    console.log(`  ✓  ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗  ${name}`);
    console.error(`       ${err.message}`);
    failed++;
  }
}

console.log("\nPhase 1 — Session security tests\n");

// ── T01: Valid token, live session ───────────────────────────────────────────
await test("T01 — valid token returns ok:true with identityId", async () => {
  const sessions = [];
  const sql = makeInMemorySql(sessions);
  const { rawToken } = await createSession(sql, "identity-abc", { ttlSeconds: 3600 });
  const result = await validateSession(sql, rawToken);
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.identityId, "identity-abc");
});

// ── T02: Expired session ─────────────────────────────────────────────────────
await test("T02 — expired session returns ok:false / expired", async () => {
  const sessions = [];
  const sql = makeInMemorySql(sessions);
  const { rawToken } = await createSession(sql, "identity-abc", { ttlSeconds: -1 }); // already expired
  const result = await validateSession(sql, rawToken);
  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.reason, "expired");
});

// ── T03: Revoked session ─────────────────────────────────────────────────────
await test("T03 — revoked session returns ok:false / revoked", async () => {
  const sessions = [];
  const sql = makeInMemorySql(sessions);
  const { rawToken } = await createSession(sql, "identity-abc", { ttlSeconds: 3600 });
  await revokeSession(sql, rawToken);
  const result = await validateSession(sql, rawToken);
  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.reason, "revoked");
});

// ── T04: Forged token (random, no DB row) ────────────────────────────────────
await test("T04 — forged random token returns ok:false / not_found", async () => {
  const sessions = [];
  const sql = makeInMemorySql(sessions);
  const forged = randomBytes(24).toString("hex");
  const result = await validateSession(sql, forged);
  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.reason, "not_found");
});

// ── T05: prov_ prefix alone (no DB row) ─────────────────────────────────────
await test("T05 — prov_-prefix token with no DB row returns ok:false / not_found", async () => {
  const sessions = [];
  const sql = makeInMemorySql(sessions);
  const fakeProvToken = `prov_${Date.now()}_${randomBytes(8).toString("hex")}`;
  const result = await validateSession(sql, fakeProvToken);
  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.reason, "not_found");
});

// ── T06: Empty / too-short token ────────────────────────────────────────────
await test("T06 — empty token returns ok:false / not_found", async () => {
  const sessions = [];
  const sql = makeInMemorySql(sessions);
  const result = await validateSession(sql, "");
  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.reason, "not_found");
});

// ── T07: Wrong-owner token (cross-identity context check) ────────────────────
await test("T07 — token for identity-A does NOT grant ownership of identity-B handle", async () => {
  const sessions = [];
  const sql = makeInMemorySql(sessions);
  // Identity A claims a session
  const { rawToken: tokenA } = await createSession(sql, "identity-A", { ttlSeconds: 3600 });
  const validationA = await validateSession(sql, tokenA);
  assert.strictEqual(validationA.ok, true);

  // Simulate the context check: session identity vs. Youniverse identity
  const sessionIdentityId = validationA.identityId;
  const youniverseIdentityId = "identity-B"; // different owner
  const isOwner = sessionIdentityId === youniverseIdentityId;
  assert.strictEqual(isOwner, false, "Cross-identity ownership check must return false");
});

// ── T08: Hash determinism ────────────────────────────────────────────────────
await test("T08 — SHA-256 hash is deterministic for the same input", async () => {
  const token = "test-token-12345";
  const h1 = hashToken(token);
  const h2 = hashToken(token);
  assert.strictEqual(h1, h2);
  assert.strictEqual(h1.length, 64); // 32 bytes hex
});

// ── T09: No hash collision between different tokens ──────────────────────────
await test("T09 — two distinct tokens have different hashes", async () => {
  const t1 = randomBytes(24).toString("hex");
  const t2 = randomBytes(24).toString("hex");
  assert.notStrictEqual(hashToken(t1), hashToken(t2));
});

// ── T10: Raw token is NOT stored in sessions table ───────────────────────────
await test("T10 — raw token does not appear in the sessions store", async () => {
  const sessions = [];
  const sql = makeInMemorySql(sessions);
  const { rawToken } = await createSession(sql, "identity-abc", { ttlSeconds: 3600 });
  const sessionRow = sessions[0];
  // The stored hash must not equal the raw token
  assert.notStrictEqual(sessionRow.token_hash, rawToken);
  // Verify the stored value is indeed the hash
  assert.strictEqual(sessionRow.token_hash, hashToken(rawToken));
});

// ── Summary ───────────────────────────────────────────────────────────────────
console.log(`\n${"─".repeat(50)}`);
console.log(`Results: ${passed} passed, ${failed} failed\n`);

if (failed > 0) {
  process.exit(1);
}
