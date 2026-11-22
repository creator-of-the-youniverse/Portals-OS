/**
 * tests/vercel-consolidation-readiness.test.mjs
 *
 * Verifies the consolidated Vercel Hobby deployment package (<= 12 functions):
 *  - VCR-01: Actual .vercel/output/functions bundle count === 12 (<= 12 Hobby limit)
 *  - VCR-02: All 12 compiled .func entrypoints load cleanly in Node 24 ESM
 *  - VCR-03: .vercel/output/config.json rewrites, dynamic routes, and crons preserved
 *  - VCR-04: Consolidated api/auth/[route] handles all 15 auth endpoints, methods (405), CSRF (403), and 404
 *  - VCR-05: Owner login, session continuity, public profile, non-owner denial, and logout via compiled bundles
 *  - VCR-06: Passkey, recovery, reviewer authz, internal execute, and Homeverse routes via compiled bundles
 *  - VCR-07: Consolidated api/not-notes/[action] dispatcher (artifact, widgets, 401, 405, 404)
 *  - VCR-08: Cron /api/cron/process-relinquishments via compiled bundle (401, 405, CRON_SECRET & PORTALS_INTERNAL_SECRET)
 */

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { isolatedLocalDb, TEST_FIXTURES } from "../lib/localTestDb.ts";

const REPO_ROOT = process.cwd();
const OUTPUT_DIR = path.join(REPO_ROOT, ".vercel", "output");
const FUNCTIONS_DIR = path.join(OUTPUT_DIR, "functions");

const EXPECTED_BUNDLES = [
  "api/auth/[route].func",
  "api/claim.func",
  "api/cron/process-relinquishments.func",
  "api/gemini.func",
  "api/genesis/[action].func",
  "api/not-notes/[action].func",
  "api/stripe/[action].func",
  "api/v1/auth/verify.func",
  "api/verify-token.func",
  "api/weaver/generate.func",
  "api/youniverse/[handle]/[action].func",
  "api/youniverseIdentity.func",
].sort();

function findFuncDirs(dir, list = []) {
  if (!fs.existsSync(dir)) return list;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name.endsWith(".func")) {
        list.push(path.relative(FUNCTIONS_DIR, full).replace(/\\/g, "/"));
      } else {
        findFuncDirs(full, list);
      }
    }
  }
  return list.sort();
}

async function loadCompiledBundle(relFunc) {
  const funcDir = path.join(FUNCTIONS_DIR, relFunc);
  const vcConfig = JSON.parse(fs.readFileSync(path.join(funcDir, ".vc-config.json"), "utf8"));
  const entry = path.join(funcDir, vcConfig.handler);
  return import(pathToFileURL(entry).href);
}

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
      origin: "https://itsyouonline.com",
      host: "itsyouonline.com",
      ...headers,
    },
    body,
    params,
    query,
  };
}

function createMockRes() {
  return {
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
}

test("VCR-01 — Generated .vercel/output/functions contains <= 12 bundles and matches exact 12-function inventory", () => {
  assert.ok(fs.existsSync(FUNCTIONS_DIR), ".vercel/output/functions directory must exist");
  const actualBundles = findFuncDirs(FUNCTIONS_DIR);
  assert.ok(actualBundles.length <= 12, `Expected <= 12 functions for Vercel Hobby, got ${actualBundles.length}`);
  assert.deepStrictEqual(actualBundles, EXPECTED_BUNDLES);
});

test("VCR-02 — All 12 compiled .func entrypoints resolve cleanly in Node 24 ESM and export default handler", async () => {
  for (const relFunc of EXPECTED_BUNDLES) {
    const mod = await loadCompiledBundle(relFunc);
    assert.strictEqual(typeof mod.default, "function", `${relFunc} must export default function`);
  }
});

test("VCR-03 — .vercel/output/config.json preserves consolidated routing, SPA fallback, and cron", () => {
  const configPath = path.join(OUTPUT_DIR, "config.json");
  assert.ok(fs.existsSync(configPath), ".vercel/output/config.json must exist");
  const config = JSON.parse(fs.readFileSync(configPath, "utf8"));

  const routeStrings = config.routes.map((r) => `${r.src ?? ""} -> ${r.dest ?? ""}`);
  assert.ok(
    config.routes.some((r) => r.dest === "/api/auth/$1--$2" && r.check === true),
    "Must include /api/auth/:group/:leaf rewrite to /api/auth/$1--$2"
  );
  assert.ok(
    routeStrings.some((s) => s.includes("/api/auth/[route]?route=$1")),
    "Must include dynamic route for /api/auth/[route]"
  );
  assert.ok(
    routeStrings.some((s) => s.includes("/api/not-notes/[action]?action=$1")),
    "Must include dynamic route for /api/not-notes/[action]"
  );
  assert.ok(
    routeStrings.some((s) => s.includes("/api/youniverse/[handle]/[action]?handle=$1&action=$2")),
    "Must include dynamic route for /api/youniverse/[handle]/[action]"
  );
  assert.ok(
    Array.isArray(config.crons) &&
      config.crons.some((c) => c.path === "/api/cron/process-relinquishments" && c.schedule === "0 3 * * *"),
    "Must preserve relinquishment cron schedule"
  );
});

test("VCR-04 — Compiled api/auth/[route] preserves all 15 routes, HTTP methods (405), CSRF (403), and 404", async () => {
  const { default: authDispatcher } = await loadCompiledBundle("api/auth/[route].func");
  const sql = isolatedLocalDb.sql;

  // Unknown subroute -> 404
  {
    const req = createMockReq({ method: "POST", url: "/api/auth/unknown-route", query: { route: "unknown-route" } });
    const res = createMockRes();
    await authDispatcher(req, res, { sql });
    assert.strictEqual(res.statusCode, 404);
    assert.strictEqual(res.body?.error, "not_found");
  }

  // Method checks across all 15 auth endpoints
  const methodCases = [
    { route: "enroll", url: "/api/auth/enroll", method: "GET" },
    { route: "logout", url: "/api/auth/logout", method: "GET" },
    { route: "login", url: "/api/auth/login", method: "GET" },
    { route: "password--login", url: "/api/auth/password/login", method: "GET" },
    { route: "password--recover", url: "/api/auth/password/recover", method: "GET" },
    { route: "password--reset", url: "/api/auth/password/reset", method: "GET" },
    { route: "password--set", url: "/api/auth/password/set", method: "GET" },
    { route: "passkey--options", url: "/api/auth/passkey/options", method: "GET" },
    { route: "passkey--verify", url: "/api/auth/passkey/verify", method: "GET" },
    { route: "recovery--codes", url: "/api/auth/recovery/codes", method: "PUT" },
    { route: "recovery--redeem", url: "/api/auth/recovery/redeem", method: "GET" },
    { route: "recovery--manual", url: "/api/auth/recovery/manual", method: "DELETE" },
    { route: "homeverse--relinquish", url: "/api/auth/homeverse/relinquish", method: "GET" },
    { route: "homeverse--cancel", url: "/api/auth/homeverse/cancel", method: "GET" },
    { route: "homeverse--status", url: "/api/auth/homeverse/status", method: "POST" },
  ];

  for (const tc of methodCases) {
    // 1. Test via Vercel rewrite style (query.route)
    const req1 = createMockReq({
      method: tc.method,
      url: tc.url,
      headers: { authorization: "Bearer dummy" },
      query: { route: tc.route },
    });
    const res1 = createMockRes();
    if (tc.route === "recovery--codes") {
      // recovery/codes validates session before method check; allow pass if 401 when unauth or 405 if auth mocked
      await authDispatcher(req1, res1, {
        sql,
        validateSession: async () => ({ ok: true, humanId: TEST_FIXTURES.owner.humanId }),
      });
    } else {
      await authDispatcher(req1, res1, { sql });
    }
    assert.strictEqual(res1.statusCode, 405, `${tc.method} ${tc.route} must return 405`);

    // 2. Test via direct URL parsing without query.route (Express / test invocation)
    const req2 = createMockReq({ method: tc.method, url: tc.url });
    const res2 = createMockRes();
    if (tc.route === "recovery--codes") {
      await authDispatcher(req2, res2, {
        sql,
        validateSession: async () => ({ ok: true, humanId: TEST_FIXTURES.owner.humanId }),
      });
    } else {
      await authDispatcher(req2, res2, { sql });
    }
    assert.strictEqual(res2.statusCode, 405, `${tc.method} ${tc.url} must return 405`);
  }

  // CSRF checks on mutating auth endpoints with untrusted Origin
  const csrfRoutes = [
    "enroll",
    "logout",
    "login",
    "password--login",
    "password--recover",
    "password--reset",
    "password--set",
    "passkey--options",
    "passkey--verify",
    "recovery--redeem",
    "recovery--manual",
    "homeverse--relinquish",
    "homeverse--cancel",
  ];
  for (const route of csrfRoutes) {
    const req = createMockReq({
      method: "POST",
      headers: { origin: "https://evil.example", host: "itsyouonline.com" },
      query: { route },
      body: { email: "a@example.com", password: "ValidPassword1!" },
    });
    const res = createMockRes();
    await authDispatcher(req, res, { sql });
    assert.strictEqual(res.statusCode, 403, `POST ${route} must block untrusted Origin`);
  }
});

test("VCR-05 — End-to-End owner login, session continuity, public face, non-owner denial, and logout through compiled bundles", async () => {
  await isolatedLocalDb.reset();
  const sql = isolatedLocalDb.sql;
  const { default: authDispatcher } = await loadCompiledBundle("api/auth/[route].func");
  const { default: youniverseDispatcher } = await loadCompiledBundle("api/youniverse/[handle]/[action].func");

  // 1. Public profile without auth
  {
    const req = createMockReq({
      method: "GET",
      url: "/api/youniverse/test/public",
      query: { handle: "test", action: "public" },
    });
    const res = createMockRes();
    await youniverseDispatcher(req, res, { sql });
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body?.success, true);
    assert.strictEqual(res.body?.youniverse?.handle, "test");
  }

  // 2. Owner login via /api/auth/password/login rewrite
  let ownerCookie = "";
  {
    const req = createMockReq({
      method: "POST",
      url: "/api/auth/password--login",
      query: { route: "password--login" },
      body: { email: TEST_FIXTURES.owner.email, password: TEST_FIXTURES.owner.password },
    });
    const res = createMockRes();
    await authDispatcher(req, res, { sql });
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body?.success, true);
    assert.strictEqual(res.body?.humanId, TEST_FIXTURES.owner.humanId);
    assert.strictEqual(res.body?.sessionToken, undefined, "Raw session token must not be exposed in JSON");
    const setCookie = res.getHeader("set-cookie");
    assert.ok(setCookie?.includes("HttpOnly") && setCookie?.includes("SameSite=Lax"));
    ownerCookie = setCookie.split(";")[0];
  }

  // 3. Compat alias POST /api/auth/login also works
  {
    const req = createMockReq({
      method: "POST",
      url: "/api/auth/login",
      query: { route: "login" },
      body: { email: TEST_FIXTURES.owner.email, password: TEST_FIXTURES.owner.password },
    });
    const res = createMockRes();
    await authDispatcher(req, res, { sql });
    assert.strictEqual(res.statusCode, 200);
  }

  // 4. Owner context via compiled Youniverse dispatcher -> isOwner: true
  {
    const req = createMockReq({
      method: "GET",
      url: "/api/youniverse/test/context",
      query: { handle: "test", action: "context" },
      headers: { cookie: ownerCookie },
    });
    const res = createMockRes();
    await youniverseDispatcher(req, res, { sql });
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body?.isOwner, true);
  }

  // 5. Non-owner visitor login & denial on @test -> isOwner: false
  {
    const loginReq = createMockReq({
      method: "POST",
      url: "/api/auth/password/login",
      body: { email: TEST_FIXTURES.visitor.email, password: TEST_FIXTURES.visitor.password },
    });
    const loginRes = createMockRes();
    await authDispatcher(loginReq, loginRes, { sql });
    assert.strictEqual(loginRes.statusCode, 200);
    const visitorCookie = loginRes.getHeader("set-cookie").split(";")[0];

    const ctxReq = createMockReq({
      method: "GET",
      url: "/api/youniverse/test/context",
      headers: { cookie: visitorCookie },
    });
    const ctxRes = createMockRes();
    await youniverseDispatcher(ctxReq, ctxRes, { sql });
    assert.strictEqual(ctxRes.statusCode, 200);
    assert.strictEqual(ctxRes.body?.isOwner, false);
  }

  // 6. Logout revokes session & clears cookie; context subsequently returns 401
  {
    const logoutReq = createMockReq({
      method: "POST",
      url: "/api/auth/logout",
      query: { route: "logout" },
      headers: { cookie: ownerCookie },
    });
    const logoutRes = createMockRes();
    await authDispatcher(logoutReq, logoutRes, { sql });
    assert.strictEqual(logoutRes.statusCode, 200);
    assert.match(logoutRes.getHeader("set-cookie"), /Max-Age=0/);

    const postLogoutCtxReq = createMockReq({
      method: "GET",
      url: "/api/youniverse/test/context",
      query: { handle: "test", action: "context" },
      headers: { cookie: ownerCookie },
    });
    const postLogoutCtxRes = createMockRes();
    await youniverseDispatcher(postLogoutCtxReq, postLogoutCtxRes, { sql });
    assert.strictEqual(postLogoutCtxRes.statusCode, 401);
  }
});

test("VCR-06 — Passkey, recovery, reviewer authz, internal execute, and Homeverse routes work through compiled auth bundle", async () => {
  await isolatedLocalDb.reset();
  const sql = isolatedLocalDb.sql;
  const { default: authDispatcher } = await loadCompiledBundle("api/auth/[route].func");

  // Passkey pre-auth options
  {
    const req = createMockReq({
      method: "POST",
      query: { route: "passkey--options" },
      body: { type: "authentication" },
    });
    const res = createMockRes();
    await authDispatcher(req, res, { sql });
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body?.ok, true);
    assert.strictEqual(res.body?.type, "authentication");
    assert.ok(res.body?.challengeId);
  }

  // Passkey registration requires authenticated session
  {
    const req = createMockReq({
      method: "POST",
      query: { route: "passkey--options" },
      body: { type: "registration" },
    });
    const res = createMockRes();
    await authDispatcher(req, res, { sql });
    assert.strictEqual(res.statusCode, 401);
  }

  // Recovery codes status with authenticated session
  {
    const req = createMockReq({
      method: "GET",
      query: { route: "recovery--codes" },
    });
    const res = createMockRes();
    await authDispatcher(req, res, {
      sql,
      validateSession: async () => ({ ok: true, humanId: TEST_FIXTURES.owner.humanId }),
    });
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body?.ok, true);
  }

  // Recovery code redeem anti-enumeration 401 on unknown email
  {
    const req = createMockReq({
      method: "POST",
      query: { route: "recovery--redeem" },
      body: { email: "nonexistent@example.com", code: "AAAA-BBBB-CCCC" },
    });
    const res = createMockRes();
    await authDispatcher(req, res, { sql });
    assert.strictEqual(res.statusCode, 401);
    assert.strictEqual(res.body?.error, "invalid_recovery_code");
  }

  // Manual recovery reviewer privilege check preserves ?action=review query parameter
  const prevSecret = process.env.PORTALS_INTERNAL_SECRET;
  process.env.PORTALS_INTERNAL_SECRET = "test-internal-secret-vcr";
  try {
    const reviewReq = createMockReq({
      method: "POST",
      url: "/api/auth/recovery--manual?action=review",
      query: { route: "recovery--manual", action: "review" },
      body: { caseId: "case-1", decision: "approved" },
    });
    const reviewRes = createMockRes();
    await authDispatcher(reviewReq, reviewRes, {
      sql,
      validateSession: async () => ({ ok: true, humanId: "unauthorized-human-id" }),
    });
    assert.strictEqual(reviewRes.statusCode, 403);
    assert.strictEqual(reviewRes.body?.error, "forbidden");

    // Manual recovery execute requires X-Portals-Internal
    const execReq = createMockReq({
      method: "POST",
      url: "/api/auth/recovery--manual?action=execute",
      query: { route: "recovery--manual", action: "execute" },
      headers: { "x-portals-internal": "wrong-secret" },
      body: { caseId: "case-1" },
    });
    const execRes = createMockRes();
    await authDispatcher(execReq, execRes, { sql });
    assert.strictEqual(execRes.statusCode, 401);
  } finally {
    if (prevSecret === undefined) delete process.env.PORTALS_INTERNAL_SECRET;
    else process.env.PORTALS_INTERNAL_SECRET = prevSecret;
  }

  // Homeverse status preserves ?handle=test alongside ?route=homeverse--status
  {
    const req = createMockReq({
      method: "GET",
      url: "/api/auth/homeverse--status?handle=test",
      query: { route: "homeverse--status", handle: "test" },
    });
    const res = createMockRes();
    await authDispatcher(req, res, {
      sql,
      validateSession: async () => ({ ok: true, humanId: TEST_FIXTURES.owner.humanId }),
    });
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body?.isInCooldown, false);
  }

  // Homeverse relinquish requires explicit confirmation
  {
    const req = createMockReq({
      method: "POST",
      query: { route: "homeverse--relinquish" },
      body: { currentHandle: "test", replacementHandle: "visitor", confirmRelinquishment: false },
    });
    const res = createMockRes();
    await authDispatcher(req, res, {
      sql,
      validateSession: async () => ({ ok: true, humanId: TEST_FIXTURES.owner.humanId }),
    });
    assert.strictEqual(res.statusCode, 400);
    assert.strictEqual(res.body?.error, "confirmation_required");
  }
});

test("VCR-07 — Compiled api/not-notes/[action] handles artifact, widgets, 401, 405, and 404", async () => {
  await isolatedLocalDb.reset();
  const { default: notNotesDispatcher } = await loadCompiledBundle("api/not-notes/[action].func");

  // Wrap isolatedLocalDb.sql with joined sessions->youniverse_identities & NotNote persistence for serverlessAuth
  const notNotesRows = [];
  const wrappedSql = function (strings, ...values) {
    const rawQuery = Array.isArray(strings?.raw) ? strings.raw.join("?") : String(strings);
    const q = rawQuery.replace(/\s+/g, " ").trim();

    if (q.includes("FROM sessions s") && q.includes("JOIN youniverse_identities i") && q.includes("WHERE s.token_hash = ?")) {
      const tokenHash = values[0];
      const sess = isolatedLocalDb.tables.sessions.find((s) => s.token_hash === tokenHash);
      if (!sess) return Promise.resolve([]);
      const ident = isolatedLocalDb.tables.youniverse_identities.find((y) => y.identity_id === sess.identity_id);
      if (!ident) return Promise.resolve([]);
      return Promise.resolve([
        {
          session_id: sess.id,
          identity_id: sess.identity_id,
          expires_at: sess.expires_at,
          revoked_at: sess.revoked_at,
          username: ident.username,
          email: ident.email,
          plan: ident.plan,
          is_live: ident.is_live,
          email_verified_at: ident.email_verified_at,
        },
      ]);
    }

    if (q.includes('INSERT INTO "NotNote"')) {
      const [id, youniverseId, title, contentJson] = values;
      notNotesRows.push({
        id,
        youniverseId,
        title,
        content: JSON.parse(contentJson),
        status: "APPROVED",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      return Promise.resolve([]);
    }

    if (q.includes('FROM "NotNote"') && q.includes("WHERE id = ?")) {
      const id = values[0];
      return Promise.resolve(notNotesRows.filter((w) => w.id === id));
    }

    if (q.includes('FROM "NotNote"')) {
      const youniverseId = values[0];
      return Promise.resolve(notNotesRows.filter((w) => w.youniverseId === youniverseId && w.status === "APPROVED"));
    }

    if (q.includes('UPDATE "NotNote" SET title = ?')) {
      const [title, contentJson, id, youniverseId] = values;
      const row = notNotesRows.find((w) => w.id === id && w.youniverseId === youniverseId);
      if (row) {
        row.title = title;
        row.content = JSON.parse(contentJson);
        row.updatedAt = new Date().toISOString();
      }
      return Promise.resolve([]);
    }

    return isolatedLocalDb.sql(strings, ...values);
  };

  // Login first to obtain real active session token for owner
  const { default: authDispatcher } = await loadCompiledBundle("api/auth/[route].func");
  const loginReq = createMockReq({
    method: "POST",
    query: { route: "password--login" },
    body: { email: TEST_FIXTURES.owner.email, password: TEST_FIXTURES.owner.password },
  });
  const loginRes = createMockRes();
  await authDispatcher(loginReq, loginRes, { sql: wrappedSql });
  const rawToken = loginRes.getHeader("set-cookie").match(/__youniverse_session=([^;]+)/)[1];

  // Unauthenticated widgets -> 401
  {
    const req = createMockReq({ method: "GET", query: { action: "widgets" }, headers: {} });
    const res = createMockRes();
    await notNotesDispatcher(req, res, { sql: wrappedSql });
    assert.strictEqual(res.statusCode, 401);
  }

  // Wrong methods -> 405
  {
    const r1 = createMockRes();
    await notNotesDispatcher(createMockReq({ method: "POST", query: { action: "widgets" } }), r1);
    assert.strictEqual(r1.statusCode, 405);

    const r2 = createMockRes();
    await notNotesDispatcher(createMockReq({ method: "GET", query: { action: "artifact" } }), r2);
    assert.strictEqual(r2.statusCode, 405);
  }

  // Unknown action -> 404
  {
    const res = createMockRes();
    await notNotesDispatcher(createMockReq({ method: "GET", query: { action: "missing" } }), res);
    assert.strictEqual(res.statusCode, 404);
  }

  // Authenticated artifact POST -> persisted widgets GET
  {
    const aReq = createMockReq({
      method: "POST",
      url: "/api/not-notes/artifact",
      headers: { authorization: `Bearer ${rawToken}` },
      body: { title: "ClockWidget", code: "export default () => null;" },
    });
    const aRes = createMockRes();
    await notNotesDispatcher(aReq, aRes, {
      sql: wrappedSql,
      databaseUrl: "postgresql://mock.invalid/test",
    });
    assert.strictEqual(aRes.statusCode, 200);
    assert.strictEqual(aRes.body?.success, true);
    assert.strictEqual(aRes.body?.artifact?.title, "ClockWidget");

    const wReq = createMockReq({
      method: "GET",
      url: "/api/not-notes/widgets",
      headers: { authorization: `Bearer ${rawToken}` },
    });
    const wRes = createMockRes();
    await notNotesDispatcher(wReq, wRes, {
      sql: wrappedSql,
      databaseUrl: "postgresql://mock.invalid/test",
    });
    assert.strictEqual(wRes.statusCode, 200);
    assert.strictEqual(wRes.body?.success, true);
    assert.strictEqual(wRes.body?.widgets?.length, 1);
    assert.strictEqual(wRes.body?.widgets?.[0]?.title, "ClockWidget");
    assert.strictEqual(wRes.body?.widgets?.[0]?.publicationStatus, "draft");

    // Publish & unpublish via consolidated bundle
    const widgetId = aRes.body.artifact.id;
    const pReq = createMockReq({
      method: "POST",
      url: "/api/not-notes/publish",
      query: { action: "publish" },
      headers: { authorization: `Bearer ${rawToken}` },
      body: { id: widgetId },
    });
    const pRes = createMockRes();
    await notNotesDispatcher(pReq, pRes, {
      sql: wrappedSql,
      databaseUrl: "postgresql://mock.invalid/test",
    });
    assert.strictEqual(pRes.statusCode, 200);
    assert.strictEqual(pRes.body?.widget?.publicationStatus, "published");

    const uReq = createMockReq({
      method: "POST",
      url: "/api/not-notes/unpublish",
      query: { action: "unpublish" },
      headers: { authorization: `Bearer ${rawToken}` },
      body: { id: widgetId },
    });
    const uRes = createMockRes();
    await notNotesDispatcher(uReq, uRes, {
      sql: wrappedSql,
      databaseUrl: "postgresql://mock.invalid/test",
    });
    assert.strictEqual(uRes.statusCode, 200);
    assert.strictEqual(uRes.body?.widget?.publicationStatus, "unpublished");
  }
});

test("VCR-08 — Compiled cron bundle /api/cron/process-relinquishments preserves CRON_SECRET and PORTALS_INTERNAL_SECRET gates", async () => {
  const { default: cronHandler } = await loadCompiledBundle("api/cron/process-relinquishments.func");
  const sql = isolatedLocalDb.sql;

  const prevInternal = process.env.PORTALS_INTERNAL_SECRET;
  const prevCron = process.env.CRON_SECRET;
  process.env.PORTALS_INTERNAL_SECRET = "cron-internal-vcr";
  process.env.CRON_SECRET = "vercel-cron-secret-vcr";

  try {
    // Unauthenticated GET -> 401
    {
      const res = createMockRes();
      await cronHandler(createMockReq({ method: "GET", headers: {} }), res, { sql });
      assert.strictEqual(res.statusCode, 401);
    }

    // Wrong method PUT -> 405
    {
      const res = createMockRes();
      await cronHandler(createMockReq({ method: "PUT", headers: {} }), res, { sql });
      assert.strictEqual(res.statusCode, 405);
    }

    // Valid Authorization: Bearer <CRON_SECRET> on GET -> 200
    {
      const res = createMockRes();
      await cronHandler(
        createMockReq({ method: "GET", headers: { authorization: "Bearer vercel-cron-secret-vcr" } }),
        res,
        { sql }
      );
      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body?.ok, true);
      assert.strictEqual(res.body?.processed, 0);
    }

    // Valid X-Portals-Internal on POST -> 200
    {
      const res = createMockRes();
      await cronHandler(
        createMockReq({ method: "POST", headers: { "x-portals-internal": "cron-internal-vcr" } }),
        res,
        { sql }
      );
      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body?.ok, true);
    }
  } finally {
    if (prevInternal === undefined) delete process.env.PORTALS_INTERNAL_SECRET;
    else process.env.PORTALS_INTERNAL_SECRET = prevInternal;
    if (prevCron === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = prevCron;
  }
});

test("VCR-09 — enforceAntiCsrf allows same-origin Vercel Preview host in preview mode while blocking cross-origin and localhost", async () => {
  const { enforceAntiCsrf } = await import("../lib/creatorOwnership.ts");
  const previewOrigin = "https://portals-abc12345-the-youniverse.vercel.app";

  // Same-origin preview deployment host in VERCEL_ENV=preview -> allowed
  assert.deepStrictEqual(
    enforceAntiCsrf(
      createMockReq({
        method: "POST",
        headers: {
          origin: previewOrigin,
          host: "portals-abc12345-the-youniverse.vercel.app",
        },
      }),
      { VERCEL_ENV: "preview", NODE_ENV: "production" }
    ),
    { blocked: false }
  );

  // Same-origin preview deployment via VERCEL_ENV=production -> blocked
  assert.strictEqual(
    enforceAntiCsrf(
      createMockReq({
        method: "POST",
        headers: {
          origin: previewOrigin,
          host: "portals-abc12345-the-youniverse.vercel.app",
        },
      }),
      { VERCEL_ENV: "production", NODE_ENV: "production" }
    ).blocked,
    true
  );

  // Cross-origin attacker vercel.app host in VERCEL_ENV=preview -> blocked
  assert.strictEqual(
    enforceAntiCsrf(
      createMockReq({
        method: "POST",
        headers: {
          origin: "https://evil-attacker.vercel.app",
          host: "portals-abc12345-the-youniverse.vercel.app",
        },
      }),
      { VERCEL_ENV: "preview", NODE_ENV: "production" }
    ).blocked,
    true
  );

  // Localhost origin in VERCEL_ENV=preview -> blocked
  assert.strictEqual(
    enforceAntiCsrf(
      createMockReq({
        method: "POST",
        headers: {
          origin: "http://localhost:5174",
          host: "portals-abc12345-the-youniverse.vercel.app",
        },
      }),
      { VERCEL_ENV: "preview", NODE_ENV: "production" }
    ).blocked,
    true
  );
});
