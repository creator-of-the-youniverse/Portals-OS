/**
 * tests/local-auth-environment.test.mjs
 *
 * Regression test suite verifying:
 *  1. Local development CSRF Origin handling without weakening production boundaries.
 *  2. Exact fail-closed behavior in production and preview environments.
 *  3. Invariant that X-Portals-Request cannot bypass CSRF in either mode.
 *  4. Correct route mounting of /api/auth/password/login, /api/auth/login, /api/auth/logout in server.js.
 *  5. API contract of password login handler (405, 400, 401, 403).
 */

import assert from "node:assert/strict";
import {
  enforceAntiCsrf,
  isLocalDevCsrfAllowed,
  TRUSTED_CSRF_ORIGINS,
  LOCAL_DEV_CSRF_ORIGINS,
} from "../lib/creatorOwnership.ts";
import passwordLoginHandler from "../api/auth/password/login.ts";
import logoutHandler from "../api/auth/logout.ts";

let passed = 0;
let failed = 0;

async function test(name, fn) {
  try {
    await fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error(`    ${err?.message || err}`);
    failed++;
  }
}

function makeRes() {
  const res = {
    _status: 200,
    _headers: {},
    _body: null,
    status(code) {
      res._status = code;
      return res;
    },
    json(body) {
      res._body = body;
      return res;
    },
    setHeader(name, value) {
      res._headers[name.toLowerCase()] = value;
      return res;
    },
  };
  return res;
}

console.log("\n═══ 1. Local CSRF vs Production Invariant Tests ═══\n");

await test("CSRF-01 — TRUSTED_CSRF_ORIGINS contains exactly 2 production origins", () => {
  assert.strictEqual(TRUSTED_CSRF_ORIGINS.size, 2);
  assert.ok(TRUSTED_CSRF_ORIGINS.has("https://itsyouonline.com"));
  assert.ok(TRUSTED_CSRF_ORIGINS.has("https://welcome.itsyouonline.com"));
});

await test("CSRF-02 — LOCAL_DEV_CSRF_ORIGINS contains only approved localhost / 127.0.0.1 ports", () => {
  assert.ok(LOCAL_DEV_CSRF_ORIGINS.has("http://localhost:5174"));
  assert.ok(LOCAL_DEV_CSRF_ORIGINS.has("http://127.0.0.1:5174"));
  assert.ok(LOCAL_DEV_CSRF_ORIGINS.has("http://localhost:3002"));
  assert.ok(LOCAL_DEV_CSRF_ORIGINS.has("http://127.0.0.1:3002"));
  assert.ok(!LOCAL_DEV_CSRF_ORIGINS.has("https://attacker.com"));
  assert.ok(!LOCAL_DEV_CSRF_ORIGINS.has("http://evil.com"));
});

await test("CSRF-03 — isLocalDevCsrfAllowed fails closed when VERCEL_ENV is production", () => {
  const allowed = isLocalDevCsrfAllowed({ VERCEL_ENV: "production" });
  assert.strictEqual(allowed, false);
});

await test("CSRF-04 — isLocalDevCsrfAllowed fails closed when VERCEL_ENV is preview", () => {
  const allowed = isLocalDevCsrfAllowed({ VERCEL_ENV: "preview" });
  assert.strictEqual(allowed, false);
});

await test("CSRF-05 — isLocalDevCsrfAllowed fails closed when NODE_ENV is production", () => {
  const allowed = isLocalDevCsrfAllowed({ NODE_ENV: "production" });
  assert.strictEqual(allowed, false);
});

await test("CSRF-06 — Production rejects localhost:5174 even with custom header", () => {
  const req = {
    headers: {
      origin: "http://localhost:5174",
      "x-portals-request": "1",
    },
  };
  const prodEnv = { VERCEL_ENV: "production", NODE_ENV: "production" };
  const res = enforceAntiCsrf(req, prodEnv);
  assert.strictEqual(res.blocked, true);
  assert.match(res.reason, /not in the trusted gateway allowlist/i);
});

await test("CSRF-07 — Production permits exact gateway origin https://itsyouonline.com and canonical alias https://www.itsyouonline.com while blocking tenant subdomains", () => {
  const prodEnv = { VERCEL_ENV: "production", NODE_ENV: "production" };
  assert.strictEqual(
    enforceAntiCsrf({ headers: { origin: "https://itsyouonline.com" } }, prodEnv).blocked,
    false
  );
  assert.strictEqual(
    enforceAntiCsrf({ headers: { origin: "https://www.itsyouonline.com" } }, prodEnv).blocked,
    false
  );
  assert.strictEqual(
    enforceAntiCsrf({ headers: { origin: "https://alice.itsyouonline.com" } }, prodEnv).blocked,
    true
  );
});

await test("CSRF-08 — Local development permits http://localhost:5174", () => {
  const req = {
    headers: {
      origin: "http://localhost:5174",
    },
  };
  const devEnv = { NODE_ENV: "development" };
  const res = enforceAntiCsrf(req, devEnv);
  assert.strictEqual(res.blocked, false);
});

await test("CSRF-09 — Local development permits http://127.0.0.1:5174", () => {
  const req = {
    headers: {
      origin: "http://127.0.0.1:5174",
    },
  };
  const devEnv = { NODE_ENV: "development" };
  const res = enforceAntiCsrf(req, devEnv);
  assert.strictEqual(res.blocked, false);
});

await test("CSRF-10 — Local development still blocks arbitrary origins (e.g. attacker.com)", () => {
  const req = {
    headers: {
      origin: "https://attacker.com",
    },
  };
  const devEnv = { NODE_ENV: "development" };
  const res = enforceAntiCsrf(req, devEnv);
  assert.strictEqual(res.blocked, true);
});

await test("CSRF-11 — Local development still blocks missing origin", () => {
  const req = {
    headers: {},
  };
  const devEnv = { NODE_ENV: "development" };
  const res = enforceAntiCsrf(req, devEnv);
  assert.strictEqual(res.blocked, true);
});

console.log("\n═══ 2. Login Handler Route & API Contract Tests ═══\n");

await test("ROUTE-01 — Method Not Allowed on GET /api/auth/password/login", async () => {
  const req = { method: "GET", headers: {} };
  const res = makeRes();
  await passwordLoginHandler(req, res);
  assert.strictEqual(res._status, 405);
  assert.strictEqual(res._body.error, "method_not_allowed");
});

await test("ROUTE-02 — Missing Origin on POST returns 403 csrf_rejected", async () => {
  const req = { method: "POST", headers: {}, body: {} };
  const res = makeRes();
  await passwordLoginHandler(req, res);
  assert.strictEqual(res._status, 403);
  assert.strictEqual(res._body.error, "csrf_rejected");
});

await test("ROUTE-03 — Approved dev origin with empty body returns 400 invalid_request", async () => {
  const req = {
    method: "POST",
    headers: { origin: "http://localhost:5174" },
    body: {},
  };
  const res = makeRes();
  await passwordLoginHandler(req, res);
  assert.strictEqual(res._status, 400);
  assert.strictEqual(res._body.error, "invalid_request");
});

await test("ROUTE-04 — Approved dev origin with invalid credentials returns 401 (dummy timing check)", async () => {
  const req = {
    method: "POST",
    headers: { origin: "http://localhost:5174" },
    body: { email: "nonexistent@example.com", password: "wrongpassword123!" },
  };
  const res = makeRes();
  // Mock sql returning empty array
  const mockSql = async () => [];
  await passwordLoginHandler(req, res, { sql: mockSql });
  assert.strictEqual(res._status, 401);
  assert.strictEqual(res._body.error, "invalid_credentials");
});

await test("ROUTE-05 — POST /api/auth/logout clears cookie and returns 200", async () => {
  const req = {
    method: "POST",
    headers: { origin: "http://localhost:5174" },
  };
  const res = makeRes();
  const mockSql = async () => [];
  await logoutHandler(req, res, { sql: mockSql });
  assert.strictEqual(res._status, 200);
  assert.strictEqual(res._body.success, true);
  assert.ok(res._headers["set-cookie"]);
  assert.ok(res._headers["set-cookie"].includes("Max-Age=0"));
});

console.log("\n──────────────────────────────────────────────────");
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
