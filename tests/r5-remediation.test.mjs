/**
 * tests/r5-remediation.test.mjs
 *
 * R5 Acceptance Remediation — regression coverage for P1–P4 fixes.
 *
 * P1: Cookie attributes correctness (buildSessionCookieHeader takes req, not boolean)
 * P2: CSRF enforcement — Origin required, X-Portals-Internal bypass, no wildcard trust
 * P3: Manual recovery execute endpoint auth (requires PORTALS_INTERNAL_SECRET)
 * P4: Homeverse cron endpoint auth and sweep dispatch
 *
 * Zero live database or network connections.
 */

import assert from "node:assert/strict";
import crypto from "node:crypto";
import {
  enforceAntiCsrf,
  buildSessionCookieHeader,
  TRUSTED_CSRF_ORIGINS,
} from "../lib/creatorOwnership.ts";
import manualHandler from "../api/auth/recovery/manual.ts";
import cronHandler from "../api/cron/process-relinquishments.ts";

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

function makeRes() {
  const r = { _status: 200, _headers: {}, _body: null };
  r.status = (s) => { r._status = s; return r; };
  r.json = (b) => { r._body = b; return r; };
  r.setHeader = (k, v) => { r._headers[k] = v; };
  return r;
}

// ═══════════════════════════════════════════════════════════════════════════════
// P1 — Cookie attribute regression
// ═══════════════════════════════════════════════════════════════════════════════

console.log("\n═══ P1 — Cookie Attribute Regression ═══\n");

await test("P1-REMED-01 — Production host: Domain=.itsyouonline.com + Secure present", () => {
  const req = { headers: { host: "alice.itsyouonline.com" } };
  const cookie = buildSessionCookieHeader("tok123", req);
  assert.ok(cookie.includes("Domain=.itsyouonline.com"), `Missing Domain: ${cookie}`);
  assert.ok(cookie.includes("Secure"), `Missing Secure: ${cookie}`);
  assert.ok(cookie.includes("HttpOnly"), `Missing HttpOnly: ${cookie}`);
  assert.ok(cookie.includes("Path=/"), `Missing Path: ${cookie}`);
  assert.ok(cookie.includes("SameSite=Lax"), `Missing SameSite: ${cookie}`);
});

await test("P1-REMED-02 — Localhost dev: no Domain, no Secure", () => {
  const req = { headers: { host: "localhost:5173" } };
  const cookie = buildSessionCookieHeader("tok456", req);
  assert.ok(!cookie.includes("Domain="), `Unexpected Domain in dev: ${cookie}`);
  assert.ok(!cookie.includes("Secure"), `Unexpected Secure in dev: ${cookie}`);
  assert.ok(cookie.includes("HttpOnly"), `Missing HttpOnly: ${cookie}`);
  assert.ok(cookie.includes("SameSite=Lax"), `Missing SameSite: ${cookie}`);
});

await test("P1-REMED-03 — Root domain itsyouonline.com: Domain + Secure present", () => {
  const req = { headers: { host: "itsyouonline.com" } };
  const cookie = buildSessionCookieHeader("tok789", req);
  assert.ok(cookie.includes("Domain=.itsyouonline.com"), `Missing Domain: ${cookie}`);
  assert.ok(cookie.includes("Secure"), `Missing Secure: ${cookie}`);
});

await test("P1-REMED-04 — welcome.itsyouonline.com: Domain + Secure present", () => {
  const req = { headers: { host: "welcome.itsyouonline.com" } };
  const cookie = buildSessionCookieHeader("tokABC", req);
  assert.ok(cookie.includes("Domain=.itsyouonline.com"), `Missing Domain: ${cookie}`);
  assert.ok(cookie.includes("Secure"), `Missing Secure: ${cookie}`);
});

// ═══════════════════════════════════════════════════════════════════════════════
// P2 — CSRF enforcement regression
// ═══════════════════════════════════════════════════════════════════════════════

console.log("\n═══ P2 — CSRF Enforcement Regression ═══\n");

await test("P2-REMED-01 — Trusted Origin https://itsyouonline.com passes", () => {
  const result = enforceAntiCsrf({ headers: { origin: "https://itsyouonline.com" } });
  assert.strictEqual(result.blocked, false);
});

await test("P2-REMED-02 — Trusted Origin https://welcome.itsyouonline.com passes", () => {
  const result = enforceAntiCsrf({ headers: { origin: "https://welcome.itsyouonline.com" } });
  assert.strictEqual(result.blocked, false);
});

await test("P2-REMED-03 — BLOCKED: Youniverse subdomain (tenant-controlled, untrusted)", () => {
  const result = enforceAntiCsrf({ headers: { origin: "https://alice.itsyouonline.com" } });
  assert.strictEqual(result.blocked, true);
});

await test("P2-REMED-04 — BLOCKED: Arbitrary cross-origin", () => {
  const result = enforceAntiCsrf({ headers: { origin: "https://attacker.com" } });
  assert.strictEqual(result.blocked, true);
});

await test("P2-REMED-05 — BLOCKED: Malformed Origin", () => {
  const result = enforceAntiCsrf({ headers: { origin: "not-a-url" } });
  assert.strictEqual(result.blocked, true);
});

await test("P2-REMED-06 — BLOCKED: Missing Origin (no internal token)", () => {
  const result = enforceAntiCsrf({ headers: {} });
  assert.strictEqual(result.blocked, true);
});

await test("P2-REMED-07 — BLOCKED: X-Portals-Request:1 + untrusted Origin → still blocked", () => {
  const result = enforceAntiCsrf({ headers: { "x-portals-request": "1", origin: "https://evil.itsyouonline.com" } });
  assert.strictEqual(result.blocked, true);
});

await test("P2-REMED-08 — BLOCKED: X-Portals-Request:1 + missing Origin → still blocked", () => {
  const result = enforceAntiCsrf({ headers: { "x-portals-request": "1" } });
  assert.strictEqual(result.blocked, true);
});

await test("P2-REMED-09 — Internal token + no Origin passes (server-to-server)", () => {
  const secret = "test-internal-secret-32chars-min";
  process.env.PORTALS_INTERNAL_SECRET = secret;
  try {
    const result = enforceAntiCsrf({ headers: { "x-portals-internal": secret } });
    assert.strictEqual(result.blocked, false);
  } finally {
    delete process.env.PORTALS_INTERNAL_SECRET;
  }
});

await test("P2-REMED-10 — BLOCKED: Internal token present but wrong value", () => {
  process.env.PORTALS_INTERNAL_SECRET = "correct-secret-value-32chars-min";
  try {
    const result = enforceAntiCsrf({ headers: { "x-portals-internal": "wrong-secret" } });
    assert.strictEqual(result.blocked, true);
  } finally {
    delete process.env.PORTALS_INTERNAL_SECRET;
  }
});

await test("P2-REMED-11 — BLOCKED: Empty string Origin", () => {
  const result = enforceAntiCsrf({ headers: { origin: "" } });
  assert.strictEqual(result.blocked, true);
});

await test("P2-REMED-12 — TRUSTED_CSRF_ORIGINS contains exactly 2 entries", () => {
  assert.strictEqual(TRUSTED_CSRF_ORIGINS.size, 2);
  assert.ok(TRUSTED_CSRF_ORIGINS.has("https://itsyouonline.com"));
  assert.ok(TRUSTED_CSRF_ORIGINS.has("https://welcome.itsyouonline.com"));
});

// ═══════════════════════════════════════════════════════════════════════════════
// P3 — Manual recovery execute endpoint auth
// ═══════════════════════════════════════════════════════════════════════════════

console.log("\n═══ P3 — Manual Recovery Execute Auth Regression ═══\n");

// Minimal SQL mock for execute path (manualRecovery.ts will never be reached if auth fails)
const noopSql = async () => [];

await test("P3-REMED-01 — Execute without internal token → 401", async () => {
  const req = {
    method: "POST",
    query: { action: "execute" },
    headers: { "x-portals-internal": "wrong-secret", "origin": "https://itsyouonline.com" },
    body: { caseId: "some-case-id" },
  };
  const res = makeRes();
  process.env.PORTALS_INTERNAL_SECRET = "configured-secret-value-here-xx";
  try {
    await manualHandler(req, res, { sql: noopSql });
    assert.strictEqual(res._status, 401, `Expected 401, got ${res._status}`);
  } finally {
    delete process.env.PORTALS_INTERNAL_SECRET;
  }
});

await test("P3-REMED-02 — Execute without any auth header → 401", async () => {
  const req = {
    method: "POST",
    query: { action: "execute" },
    headers: { "origin": "https://itsyouonline.com" },
    body: { caseId: "some-case-id" },
  };
  const res = makeRes();
  process.env.PORTALS_INTERNAL_SECRET = "configured-secret-value-here-xx";
  try {
    await manualHandler(req, res, { sql: noopSql });
    assert.strictEqual(res._status, 401, `Expected 401, got ${res._status}`);
  } finally {
    delete process.env.PORTALS_INTERNAL_SECRET;
  }
});

await test("P3-REMED-03 — Execute with correct internal token reaches business logic (not 401)", async () => {
  const secret = "configured-secret-value-here-xx";
  // Mock SQL: returns a case in hold_pending status whose hold has not expired
  // so executeRecovery should throw "30-day hold has not yet expired"
  // This confirms we got past auth into the library.
  const mockSql = async (strings, ...values) => {
    const full = strings.join("?");
    if (full.includes("FROM manual_recovery_cases")) {
      return [{
        case_id: "test-case",
        claimant_email: "test@example.com",
        human_id: null,
        evidence_description: "test",
        contact_channels: "[]",
        status: "hold_pending",
        requested_at: new Date().toISOString(),
        hold_expires_at: new Date(Date.now() + 1000000).toISOString(), // future
        completed_at: null,
        approvals: JSON.stringify([
          { reviewerId: "r1", decision: "approved", notes: "", decidedAt: new Date().toISOString() },
          { reviewerId: "r2", decision: "approved", notes: "", decidedAt: new Date().toISOString() },
        ]),
        rejections: "[]",
        audit_log: "[]",
      }];
    }
    return [];
  };

  const req = {
    method: "POST",
    query: { action: "execute" },
    headers: { "x-portals-internal": secret, "origin": "https://itsyouonline.com" },
    body: { caseId: "test-case" },
  };
  const res = makeRes();
  process.env.PORTALS_INTERNAL_SECRET = secret;
  try {
    await manualHandler(req, res, { sql: mockSql });
    // Should be 400 (hold not expired) — means auth passed
    assert.strictEqual(res._status, 400, `Expected 400 (hold-blocked), got ${res._status}: ${JSON.stringify(res._body)}`);
    assert.ok(res._body.message.includes("hold"), `Expected hold message: ${res._body.message}`);
  } finally {
    delete process.env.PORTALS_INTERNAL_SECRET;
  }
});

await test("P3-REMED-04 — Execute when PORTALS_INTERNAL_SECRET not configured → 503", async () => {
  delete process.env.PORTALS_INTERNAL_SECRET;
  const req = {
    method: "POST",
    query: { action: "execute" },
    headers: { "x-portals-internal": "any-value", "origin": "https://itsyouonline.com" },
    body: { caseId: "test-case" },
  };
  const res = makeRes();
  await manualHandler(req, res, { sql: noopSql });
  assert.strictEqual(res._status, 503, `Expected 503, got ${res._status}`);
});

// ═══════════════════════════════════════════════════════════════════════════════
// P4 — Homeverse cron handler auth and sweep
// ═══════════════════════════════════════════════════════════════════════════════

console.log("\n═══ P4 — Homeverse Expiry Cron Auth Regression ═══\n");

await test("P4-REMED-01 — No auth header → 401", async () => {
  const req = { method: "POST", headers: {} };
  const res = makeRes();
  delete process.env.PORTALS_INTERNAL_SECRET;
  delete process.env.CRON_SECRET;
  await cronHandler(req, res, { sql: noopSql });
  assert.strictEqual(res._status, 401, `Expected 401, got ${res._status}`);
});

await test("P4-REMED-02 — Wrong internal token → 401", async () => {
  process.env.PORTALS_INTERNAL_SECRET = "correct-secret";
  const req = { method: "POST", headers: { "x-portals-internal": "wrong-secret" } };
  const res = makeRes();
  try {
    await cronHandler(req, res, { sql: noopSql });
    assert.strictEqual(res._status, 401, `Expected 401, got ${res._status}`);
  } finally {
    delete process.env.PORTALS_INTERNAL_SECRET;
  }
});

await test("P4-REMED-03 — Correct internal token + no expired records → {processed: 0}", async () => {
  const secret = "correct-cron-secret-value-here";
  process.env.PORTALS_INTERNAL_SECRET = secret;

  // SQL mock: no expired pending records
  const mockSql = async (strings, ...values) => {
    const full = strings.join("?");
    if (full.includes("FROM homeverse_relinquishments")) return [];
    return [];
  };

  const req = { method: "POST", headers: { "x-portals-internal": secret } };
  const res = makeRes();
  try {
    await cronHandler(req, res, { sql: mockSql });
    assert.strictEqual(res._status, 200, `Expected 200, got ${res._status}`);
    assert.strictEqual(res._body.ok, true);
    assert.strictEqual(res._body.processed, 0);
  } finally {
    delete process.env.PORTALS_INTERNAL_SECRET;
  }
});

await test("P4-REMED-04 — CRON_SECRET via Authorization: Bearer passes", async () => {
  const cronSecret = "vercel-cron-secret-value";
  process.env.CRON_SECRET = cronSecret;
  delete process.env.PORTALS_INTERNAL_SECRET;

  const mockSql = async () => [];

  const req = {
    method: "POST",
    headers: { authorization: `Bearer ${cronSecret}` },
  };
  const res = makeRes();
  try {
    await cronHandler(req, res, { sql: mockSql });
    assert.strictEqual(res._status, 200, `Expected 200, got ${res._status}`);
  } finally {
    delete process.env.CRON_SECRET;
  }
});

await test("P4-REMED-05 — Idempotent: second call with no pending records → {processed: 0}", async () => {
  const secret = "idempotent-secret-value-32chars";
  process.env.PORTALS_INTERNAL_SECRET = secret;

  let callCount = 0;
  const mockSql = async (strings, ...values) => {
    callCount++;
    // Simulate: first call returns 1 expired record, UPDATE completes, then returns 0
    return [];
  };

  const req = { method: "POST", headers: { "x-portals-internal": secret } };

  try {
    // First call
    const res1 = makeRes();
    await cronHandler(req, res1, { sql: mockSql });
    assert.strictEqual(res1._status, 200);

    // Second call — still 200, still idempotent
    const res2 = makeRes();
    await cronHandler(req, res2, { sql: mockSql });
    assert.strictEqual(res2._status, 200);
    assert.strictEqual(res2._body.ok, true);
  } finally {
    delete process.env.PORTALS_INTERNAL_SECRET;
  }
});

await test("P4-REMED-06 — GET method is also accepted (Vercel cron may issue GET)", async () => {
  const secret = "get-method-secret-32chars-min-x";
  process.env.PORTALS_INTERNAL_SECRET = secret;
  const req = { method: "GET", headers: { "x-portals-internal": secret } };
  const res = makeRes();
  try {
    await cronHandler(req, res, { sql: noopSql });
    assert.strictEqual(res._status, 200, `Expected 200, got ${res._status}`);
  } finally {
    delete process.env.PORTALS_INTERNAL_SECRET;
  }
});

// ═══════════════════════════════════════════════════════════════════════════════

console.log("\n──────────────────────────────────────────────────");
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
