/**
 * tests/owner-journey-e2e.test.mjs
 *
 * Full End-to-End Positive and Negative Owner Sign-In & Session Continuity Verification.
 *
 * Exercises:
 *  1. Positive Path: Test owner authenticates with valid credentials.
 *  2. Session Creation: Verifies server creates session and emits HttpOnly cookie.
 *  3. Cookie Metadata: Verifies HttpOnly, SameSite=Lax, Path=/, Max-Age=604800.
 *  4. Session Persistence: Verifies cookie authorizes owner context resolution (isOwner: true).
 *  5. Negative Path (Unauthorized Human): Authenticates as visitor, checks target @test (isOwner: false).
 *  6. Negative Path (Invalid Credentials): Returns 401 anti-enumeration.
 *  7. Negative Path (Public Visitor): Returns 401 unauthorized on private context.
 *  8. Logout & Revocation: Marks session revoked in DB and clears cookie.
 */

import test from "node:test";
import assert from "node:assert";
import passwordLoginHandler from "../api/auth/password/login.ts";
import contextHandler from "../api/youniverse/[handle]/context.ts";
import logoutHandler from "../api/auth/logout.ts";
import { isolatedLocalDb, TEST_FIXTURES } from "../lib/localTestDb.ts";

function createMockReq({
  method = "GET",
  url = "/",
  headers = {},
  body = {},
  params = {},
  query = {},
} = {}) {
  return {
    method,
    url,
    headers: {
      origin: "http://localhost:5174",
      host: "localhost:5174",
      ...headers,
    },
    body,
    params,
    query,
  };
}

function createMockRes() {
  const res = {
    statusCode: 200,
    headers: {},
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    setHeader(name, value) {
      this.headers[name.toLowerCase()] = value;
      return this;
    },
    getHeader(name) {
      return this.headers[name.toLowerCase()];
    },
    json(payload) {
      this.body = payload;
      return this;
    },
    end() {
      return this;
    },
  };
  return res;
}

test("E2E Owner Authentication and Session Continuity Suite", async (t) => {
  await isolatedLocalDb.reset();
  const sql = isolatedLocalDb.sql;

  let ownerCookie = "";
  let visitorCookie = "";

  // ── TEST 1: Positive Owner Login ──────────────────────────────────────────
  await t.test("1. Test owner authenticates with valid credentials", async () => {
    const req = createMockReq({
      method: "POST",
      url: "/api/auth/password/login",
      body: {
        email: TEST_FIXTURES.owner.email,
        password: TEST_FIXTURES.owner.password,
      },
    });
    const res = createMockRes();

    await passwordLoginHandler(req, res, { sql });

    assert.strictEqual(res.statusCode, 200, "Should return HTTP 200");
    assert.strictEqual(res.body?.success, true, "Body success should be true");
    assert.strictEqual(
      res.body?.humanId,
      TEST_FIXTURES.owner.humanId,
      "Should return correct owner humanId"
    );

    const setCookie = res.getHeader("set-cookie");
    assert.ok(setCookie, "Set-Cookie header must be emitted");
    assert.match(
      setCookie,
      /^__youniverse_session=[a-f0-9]{48};/,
      "Cookie must match __youniverse_session=48-hex"
    );
    assert.match(setCookie, /HttpOnly/i, "Must have HttpOnly flag");
    assert.match(setCookie, /SameSite=Lax/i, "Must have SameSite=Lax");
    assert.match(setCookie, /Path=\//i, "Must have Path=/");
    assert.match(setCookie, /Max-Age=604800/i, "Must have 7-day TTL");

    // Extract raw cookie string for subsequent requests
    const cookieTokenMatch = setCookie.match(/__youniverse_session=([^;]+)/);
    assert.ok(cookieTokenMatch, "Cookie token extracted");
    ownerCookie = `__youniverse_session=${cookieTokenMatch[1]}`;
  });

  // ── TEST 2: Session Persistence & Context Verification (isOwner: true) ────
  await t.test("2. Cookie persists session and grants isOwner: true for @test", async () => {
    assert.ok(ownerCookie, "Owner cookie must exist");

    const req = createMockReq({
      method: "GET",
      url: "/api/youniverse/test/context",
      headers: {
        cookie: ownerCookie,
      },
      params: { handle: "test" },
    });
    const res = createMockRes();

    await contextHandler(req, res, { sql });

    assert.strictEqual(res.statusCode, 200, "Should return HTTP 200");
    assert.strictEqual(res.body?.success, true, "Success should be true");
    assert.strictEqual(res.body?.isOwner, true, "isOwner MUST be true for owner");
    assert.strictEqual(res.body?.handle, "test", "Handle must be test");
  });

  // ── TEST 3: Negative Path - Visitor Login (Unauthorized Human) ────────────
  await t.test("3. Authenticated visitor human receives session", async () => {
    const req = createMockReq({
      method: "POST",
      url: "/api/auth/password/login",
      body: {
        email: TEST_FIXTURES.visitor.email,
        password: TEST_FIXTURES.visitor.password,
      },
    });
    const res = createMockRes();

    await passwordLoginHandler(req, res, { sql });

    assert.strictEqual(res.statusCode, 200, "Visitor login returns HTTP 200");
    assert.strictEqual(
      res.body?.humanId,
      TEST_FIXTURES.visitor.humanId,
      "Visitor receives their own humanId"
    );

    const setCookie = res.getHeader("set-cookie");
    const cookieTokenMatch = setCookie.match(/__youniverse_session=([^;]+)/);
    assert.ok(cookieTokenMatch, "Visitor cookie token extracted");
    visitorCookie = `__youniverse_session=${cookieTokenMatch[1]}`;
  });

  // ── TEST 4: Visitor Accesses @test -> isOwner: false ──────────────────────
  await t.test("4. Authenticated visitor checking @test receives isOwner: false", async () => {
    assert.ok(visitorCookie, "Visitor cookie must exist");

    const req = createMockReq({
      method: "GET",
      url: "/api/youniverse/test/context",
      headers: {
        cookie: visitorCookie,
      },
      params: { handle: "test" },
    });
    const res = createMockRes();

    await contextHandler(req, res, { sql });

    assert.strictEqual(res.statusCode, 200, "Returns 200 public context");
    assert.strictEqual(res.body?.success, true, "Success is true");
    assert.strictEqual(
      res.body?.isOwner,
      false,
      "isOwner MUST be false for visitor on @test"
    );
  });

  // ── TEST 5: Visitor Accesses Own Space @visitor -> isOwner: true ──────────
  await t.test("5. Visitor checking their own @visitor receives isOwner: true", async () => {
    const req = createMockReq({
      method: "GET",
      url: "/api/youniverse/visitor/context",
      headers: {
        cookie: visitorCookie,
      },
      params: { handle: "visitor" },
    });
    const res = createMockRes();

    await contextHandler(req, res, { sql });

    assert.strictEqual(res.statusCode, 200, "Returns 200");
    assert.strictEqual(res.body?.isOwner, true, "isOwner is true for own space");
  });

  // ── TEST 6: Negative Path - Invalid Credentials ───────────────────────────
  await t.test("6. Invalid password returns 401 invalid_credentials", async () => {
    const req = createMockReq({
      method: "POST",
      url: "/api/auth/password/login",
      body: {
        email: TEST_FIXTURES.owner.email,
        password: "WrongPassword123!",
      },
    });
    const res = createMockRes();

    await passwordLoginHandler(req, res, { sql });

    assert.strictEqual(res.statusCode, 401, "Should return HTTP 401");
    assert.strictEqual(res.body?.error, "invalid_credentials");
    assert.strictEqual(res.body?.success, false);
    assert.strictEqual(res.getHeader("set-cookie"), undefined, "No cookie emitted");
  });

  // ── TEST 7: Negative Path - Unauthenticated Visitor ───────────────────────
  await t.test("7. Unauthenticated request to context returns 401 unauthorized", async () => {
    const req = createMockReq({
      method: "GET",
      url: "/api/youniverse/test/context",
      params: { handle: "test" },
    });
    const res = createMockRes();

    await contextHandler(req, res, { sql });

    assert.strictEqual(res.statusCode, 401, "Should return HTTP 401");
    assert.strictEqual(res.body?.error, "unauthorized");
  });

  // ── TEST 8: Logout & Revocation ───────────────────────────────────────────
  await t.test("8. Logout revokes session and clears cookie", async () => {
    const req = createMockReq({
      method: "POST",
      url: "/api/auth/logout",
      headers: {
        cookie: ownerCookie,
      },
    });
    const res = createMockRes();

    await logoutHandler(req, res, { sql });

    assert.strictEqual(res.statusCode, 200, "Logout returns 200");
    assert.strictEqual(res.body?.success, true);

    const setCookie = res.getHeader("set-cookie");
    assert.ok(setCookie, "Cookie clearance emitted");
    assert.match(setCookie, /Max-Age=0/i, "Max-Age=0 clears cookie");

    // Subsequent request with revoked cookie
    const reqAfter = createMockReq({
      method: "GET",
      url: "/api/youniverse/test/context",
      headers: {
        cookie: ownerCookie,
      },
      params: { handle: "test" },
    });
    const resAfter = createMockRes();

    await contextHandler(reqAfter, resAfter, { sql });

    assert.strictEqual(
      resAfter.statusCode,
      401,
      "Revoked session returns 401 invalid_token"
    );
    assert.strictEqual(resAfter.body?.error, "invalid_token");
  });
});
