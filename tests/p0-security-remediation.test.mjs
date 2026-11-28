/**
 * tests/p0-security-remediation.test.mjs
 *
 * Comprehensive regression suite for P0-A through P0-D exercising actual API
 * endpoints, dispatchers, DB isolation guards, and window message validators.
 * Zero live Neon/PostgreSQL/Stripe/network mutations.
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

import youniverseIdentityHandler from "../api/youniverseIdentity.ts";
import { createNeonYouniverseIdentityRepository } from "../lib/neonYouniverseIdentityRepository.ts";
import {
  createYouniverseIdentityHandler,
  toPublicYouniverseIdentity,
} from "../lib/youniverseIdentityApi.ts";
import { PUBLIC_YOUNIVERSE_IDENTITY_FIELDS } from "../lib/youniverseIdentityTypes.ts";
import authDispatcher from "../api/auth/[route].ts";
import claimHandler from "../api/claim.ts";
import youniversePublicApi from "../api/youniverse/[handle]/public.ts";
import youniverseActionDispatcher from "../api/youniverse/[handle]/[action].ts";
import { getYouniverseContextHandler } from "../controllers/youniverseContextController.js";
import { assertSafeDatabaseTarget } from "../lib/creatorOwnership.ts";
import { getPool } from "../lib/foundingAngelsService.ts";
import youniverseContextHandler from "../lib/handlers/youniverse/context.ts";
import youniversePublicHandler, {
  buildPublicYouniversePayload,
  isIdentityEmailVerified,
} from "../lib/handlers/youniverse/public.ts";
import { isolatedLocalDb, TEST_FIXTURES } from "../lib/localTestDb.ts";
import { makeSqlClient } from "../lib/neonSession.ts";
import { authenticateRequest } from "../lib/serverlessAuth.ts";
import {
  APPROVED_AGENT_ORIGINS,
  APPROVED_ECOSYSTEM_ORIGINS,
  buildAllowedPortalMessageOrigins,
  isTrustedAgentIframeSrc,
  normalizeStrictOrigin,
  validatePortalWindowMessage,
  validateWeaverSandboxMessage,
} from "../lib/windowMessageSecurity.ts";

const PROD_NEON_URL =
  "postgresql://neondb_owner:super_secret_pw_999@ep-aged-dew-av9711nr-pooler.c-2.us-east-1.aws.neon.tech/neondb?sslmode=require";
const STG_NEON_URL =
  "postgresql://neondb_owner:stg_pw_123@ep-aged-lake-avdgndee-pooler.c-2.us-east-1.aws.neon.tech/neondb?sslmode=require";
const LOCAL_PG_URL = "postgresql://postgres:local_pw_123@127.0.0.1:5432/portals_isolated_test_db";

function makeReq({
  method = "GET",
  url = "/",
  query = {},
  params = {},
  headers = {},
  body = {},
} = {}) {
  return { method, url, query, params, headers, body };
}

function makeRes() {
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

// ============================================================================
// P0-A — PUBLIC EMAIL / PII EXPOSURE REMOVAL
// ============================================================================

test("P0-A.1 — Regression: GET /api/youniverseIdentity never returns email, plan, or private fields even when DB row contains them", async () => {
  const capturedQueries = [];
  const mockSql = async (strings, ...values) => {
    const queryText = Array.isArray(strings.raw)
      ? strings.raw.join("?")
      : strings.join("?");
    capturedQueries.push({ queryText, values });
    return [
      {
        identity_id: "id-leak-check-001",
        username: "founder-check",
        display_name: "Founder Check",
        subdomain: "founder-check",
        identity_type: "person",
        email: "founder-private-email@example.com",
        plan: "enterprise",
        stripe_session_id: "cs_test_secret_123",
        email_verified_at: "2026-11-22T00:00:00.000Z",
        created_at: "2026-11-01T00:00:00.000Z",
      },
    ];
  };

  const req = makeReq({ method: "GET", query: { username: "@founder-check" } });
  const res = makeRes();

  await youniverseIdentityHandler(req, res, { sql: mockSql });

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.status, "found");
  assert.equal(res.getHeader("cache-control"), "no-store");

  // SQL SELECT itself must not select `email` or `plan`
  assert.equal(capturedQueries.length, 1);
  assert.doesNotMatch(capturedQueries[0].queryText, /\bemail\b/i);
  assert.doesNotMatch(capturedQueries[0].queryText, /\bplan\b/i);

  // Public response allowlist check
  assert.deepEqual(
    Object.keys(res.body.identity).sort(),
    [...PUBLIC_YOUNIVERSE_IDENTITY_FIELDS].sort()
  );
  assert.deepEqual(res.body.identity, {
    username: "founder-check",
    displayName: "Founder Check",
    subdomain: "founder-check",
    identityType: "person",
    createdAt: "2026-11-01T00:00:00.000Z",
  });

  const serialized = JSON.stringify(res.body);
  assert.equal(serialized.includes("founder-private-email@example.com"), false);
  assert.equal(serialized.includes("cs_test_secret_123"), false);
  assert.equal(serialized.includes("id-leak-check-001"), false);
  assert.equal("email" in res.body.identity, false);
  assert.equal("plan" in res.body.identity, false);
  assert.equal("identityId" in res.body.identity, false);
});

test("P0-A.2 — Explicit allowlist strips nested private objects and future repository properties", async () => {
  const maliciousResolver = {
    async resolve(handle) {
      return {
        status: "found",
        handle,
        identity: {
          identityId: "internal-uuid-999",
          username: "nested-alice",
          displayName: "Nested Alice",
          subdomain: "nested-alice",
          identityType: "person",
          createdAt: "2026-11-22T01:02:03.000Z",
          email: "alice-secret@example.com",
          plan: "pro",
          owner: {
            email: "nested-owner@example.com",
            phone: "+1-555-0100",
          },
          metadata: {
            stripeCustomerId: "cus_secret_123",
            internalSecret: "top-secret",
          },
          __extraFutureField: "should-not-serialize",
        },
      };
    },
  };

  const handler = createYouniverseIdentityHandler({ resolver: maliciousResolver });
  const req = makeReq({ method: "GET", query: { username: "nested-alice" } });
  const res = makeRes();

  await handler(req, res);

  assert.equal(res.statusCode, 200);
  const serialized = JSON.stringify(res.body);
  assert.equal(serialized.includes("alice-secret@example.com"), false);
  assert.equal(serialized.includes("nested-owner@example.com"), false);
  assert.equal(serialized.includes("cus_secret_123"), false);
  assert.equal(serialized.includes("should-not-serialize"), false);
  assert.equal(serialized.includes("internal-uuid-999"), false);
  assert.deepEqual(
    Object.keys(res.body.identity).sort(),
    [...PUBLIC_YOUNIVERSE_IDENTITY_FIELDS].sort()
  );

  assert.equal(toPublicYouniverseIdentity(null), null);
  assert.equal(toPublicYouniverseIdentity(["not-an-object"]), null);
  assert.equal(
    toPublicYouniverseIdentity({ username: "x", identityType: "invalid-type" }),
    null
  );
});

test("P0-A.3 — GET /api/youniverseIdentity handles unknown handles, malformed queries, non-GET, and resolver errors without leaking details", async () => {
  for (const unknownHandle of ["nonexistent-user-xyz", "!!!"]) {
    const notFoundReq = makeReq({ method: "GET", query: { username: unknownHandle } });
    const notFoundRes = makeRes();
    await youniverseIdentityHandler(notFoundReq, notFoundRes, {
      sql: isolatedLocalDb.sql,
    });
    assert.equal(notFoundRes.statusCode, 404);
    assert.deepEqual(notFoundRes.body, { status: "not-found" });
  }

  for (const badQuery of [
    {},
    { username: "" },
    { username: "   " },
    { username: "@" },
    { username: "@@@" },
    { username: ["alice", "bob"] },
    { username: 12345 },
  ]) {
    const req = makeReq({ method: "GET", query: badQuery });
    const res = makeRes();
    await youniverseIdentityHandler(req, res, { sql: isolatedLocalDb.sql });
    assert.equal(res.statusCode, 400);
    assert.deepEqual(res.body, { status: "invalid" });
  }

  const postReq = makeReq({ method: "POST", query: { username: "test" } });
  const postRes = makeRes();
  await youniverseIdentityHandler(postReq, postRes, { sql: isolatedLocalDb.sql });
  assert.equal(postRes.statusCode, 405);
  assert.equal(postRes.getHeader("allow"), "GET");

  const errorHandler = createYouniverseIdentityHandler({
    resolver: {
      async resolve() {
        throw new Error("DB error exposing secret-owner@example.com");
      },
    },
  });
  const origErr = console.error;
  console.error = () => {};
  const errRes = makeRes();
  try {
    await errorHandler(
      makeReq({ method: "GET", query: { username: "valid-handle" } }),
      errRes
    );
  } finally {
    console.error = origErr;
  }
  assert.equal(errRes.statusCode, 500);
  assert.deepEqual(errRes.body, { status: "error" });
  assert.equal(JSON.stringify(errRes.body).includes("secret-owner@example.com"), false);
});

test("P0-A.4 — Local DB identity lookup & authenticated owner session continuity remain intact", async () => {
  await isolatedLocalDb.reset();

  // Even when backed by isolatedLocalDb (whose SQL helper returns full row columns including email),
  // GET /api/youniverseIdentity strictly omits email and private fields.
  const idReq = makeReq({
    method: "GET",
    query: { username: TEST_FIXTURES.owner.username },
  });
  const idRes = makeRes();
  await youniverseIdentityHandler(idReq, idRes, { sql: isolatedLocalDb.sql });
  assert.equal(idRes.statusCode, 200);
  assert.equal(idRes.body.status, "found");
  assert.equal(idRes.body.identity.username, TEST_FIXTURES.owner.username);
  assert.equal(JSON.stringify(idRes.body).includes(TEST_FIXTURES.owner.email), false);

  // Authenticated owner login + context access remains operational
  const loginReq = makeReq({
    method: "POST",
    url: "/api/auth/password/login",
    query: { route: "password--login" },
    headers: { origin: "https://itsyouonline.com", host: "itsyouonline.com" },
    body: {
      email: TEST_FIXTURES.owner.email,
      password: TEST_FIXTURES.owner.password,
    },
  });
  const loginRes = makeRes();
  await authDispatcher(loginReq, loginRes, { sql: isolatedLocalDb.sql });
  assert.equal(loginRes.statusCode, 200);
  const setCookie = loginRes.getHeader("set-cookie");
  assert.ok(setCookie, "Owner login must issue HttpOnly session cookie");
  const sessionCookie = setCookie.split(";")[0];

  const ctxReq = makeReq({
    method: "GET",
    url: `/api/youniverse/${TEST_FIXTURES.owner.username}/context`,
    query: { handle: TEST_FIXTURES.owner.username },
    headers: { cookie: sessionCookie, host: "itsyouonline.com" },
  });
  const ctxRes = makeRes();
  await youniverseContextHandler(ctxReq, ctxRes, { sql: isolatedLocalDb.sql });
  assert.equal(ctxRes.statusCode, 200);
  assert.equal(ctxRes.body.success, true);
  assert.equal(ctxRes.body.isOwner, true);
  assert.equal(ctxRes.body.handle, TEST_FIXTURES.owner.username);
});

// ============================================================================
// P0-B — VERIFIED-IDENTITY PUBLICATION BOUNDARY
// ============================================================================

test("P0-B.1 — Unverified identity (email_verified_at IS NULL, e.g. @kevin) fails closed on all public handlers with zero PII", async () => {
  let badgeOrWidgetQueried = false;
  const unverifiedMockSql = async (strings) => {
    const q = (Array.isArray(strings.raw) ? strings.raw.join("?") : strings.join("?")).toLowerCase();
    if (q.includes("from youniverse_identities")) {
      return [
        {
          identity_id: "DCPdiagnjbYeTocYn83G2",
          username: "kevin",
          display_name: "Kevin Sovereign",
          subdomain: "kevin",
          identity_type: "person",
          email: "kevin-private@example.com",
          plan: "free",
          is_live: true,
          email_verified_at: null,
        },
      ];
    }
    badgeOrWidgetQueried = true;
    return [];
  };

  for (const [label, callEndpoint] of [
    [
      "lib/handlers/youniverse/public.ts",
      (res) =>
        youniversePublicHandler(
          makeReq({ method: "GET", query: { handle: "kevin" } }),
          res,
          { sql: unverifiedMockSql }
        ),
    ],
    [
      "api/youniverse/[handle]/public.ts",
      (res) =>
        youniversePublicApi(
          makeReq({ method: "GET", query: { handle: "kevin" } }),
          res,
          { sql: unverifiedMockSql }
        ),
    ],
    [
      "api/youniverse/[handle]/[action].ts",
      (res) =>
        youniverseActionDispatcher(
          makeReq({
            method: "GET",
            url: "/api/youniverse/kevin/public",
            query: { handle: "kevin", action: "public" },
          }),
          res,
          { sql: unverifiedMockSql }
        ),
    ],
  ]) {
    badgeOrWidgetQueried = false;
    const res = makeRes();
    await callEndpoint(res);

    assert.equal(res.statusCode, 403, `${label} must return 403 for unverified identity`);
    assert.equal(res.body.success, false);
    assert.equal(res.body.error, "youniverse_unverified");
    assert.equal(res.body.status, "unverified");
    assert.equal(res.body.youniverse, undefined);
    assert.equal(res.body.publicWidgets, undefined);
    assert.equal(res.getHeader("cache-control"), "no-store");
    assert.equal(badgeOrWidgetQueried, false, `${label} must not query badges/widgets for unverified identity`);
    const json = JSON.stringify(res.body);
    assert.equal(json.includes("kevin-private@example.com"), false);
    assert.equal(json.includes("DCPdiagnjbYeTocYn83G2"), false);
  }
});

test("P0-B.2 — Verified identity returns 200 public allowlist while missing, non-live, and invalid verification fail closed", async () => {
  await isolatedLocalDb.reset();

  // Verified live identity succeeds with zero PII
  const verifiedReq = makeReq({
    method: "GET",
    query: { handle: TEST_FIXTURES.owner.username },
  });
  const verifiedRes = makeRes();
  await youniversePublicHandler(verifiedReq, verifiedRes, {
    sql: isolatedLocalDb.sql,
  });
  assert.equal(verifiedRes.statusCode, 200);
  assert.equal(verifiedRes.body.success, true);
  assert.equal(verifiedRes.body.youniverse.handle, TEST_FIXTURES.owner.username);
  assert.equal(
    JSON.stringify(verifiedRes.body).includes(TEST_FIXTURES.owner.email),
    false
  );
  assert.equal("email" in verifiedRes.body.youniverse, false);
  assert.equal("identity_id" in verifiedRes.body.youniverse, false);
  assert.equal("email_verified_at" in verifiedRes.body.youniverse, false);

  // Helper edge cases
  assert.equal(isIdentityEmailVerified(null), false);
  assert.equal(isIdentityEmailVerified(undefined), false);
  assert.equal(isIdentityEmailVerified(""), false);
  assert.equal(isIdentityEmailVerified("0"), false);
  assert.equal(isIdentityEmailVerified("1700000000"), false);
  assert.equal(isIdentityEmailVerified("invalid-date"), false);
  assert.equal(isIdentityEmailVerified(true), false);
  assert.equal(isIdentityEmailVerified(new Date("2026-11-22T00:00:00Z")), true);
  assert.equal(isIdentityEmailVerified("2026-11-22T00:00:00.000Z"), true);

  // Explicit payload builder omits extra private properties
  const built = buildPublicYouniversePayload(
    {
      identity_id: "id-1",
      username: "alice",
      display_name: "Alice",
      subdomain: "alice",
      identity_type: "person",
      plan: "free",
      email: "alice@example.com",
      email_verified_at: "2026-11-22T00:00:00.000Z",
    },
    []
  );
  assert.deepEqual(Object.keys(built).sort(), [
    "badges",
    "displayName",
    "handle",
    "plan",
    "subdomain",
    "type",
  ]);

  // Non-live / missing -> 404
  const missingRes = makeRes();
  await youniversePublicHandler(
    makeReq({ method: "GET", query: { handle: "does-not-exist" } }),
    missingRes,
    { sql: isolatedLocalDb.sql }
  );
  assert.equal(missingRes.statusCode, 404);
  assert.equal(missingRes.body.error, "youniverse_not_found");

  // DB error -> 500 fail closed
  const origErr = console.error;
  console.error = () => {};
  const errRes = makeRes();
  try {
    await youniversePublicHandler(
      makeReq({ method: "GET", query: { handle: "alice" } }),
      errRes,
      {
        sql: async () => {
          throw new Error("neon connection error exposing secret@example.com");
        },
      }
    );
  } finally {
    console.error = origErr;
  }
  assert.equal(errRes.statusCode, 500);
  assert.equal(errRes.body.error, "public_profile_unavailable");
  assert.equal(JSON.stringify(errRes.body).includes("secret@example.com"), false);
});

test("P0-B.3 — PublicYouniverse UI explicitly differentiates unverified state without rendering Verified Sovereign Instance", () => {
  const uiSource = fs.readFileSync(
    path.join(process.cwd(), "components", "PublicYouniverse.tsx"),
    "utf8"
  );
  assert.match(uiSource, /youniverse_unverified/);
  assert.match(uiSource, /Verification Pending/);
  assert.match(uiSource, /errorState\?\.kind === ['"]unverified['"]/);
});

// ============================================================================
// P0-C — DEVELOPMENT & LOCAL PRODUCTION DATABASE ISOLATION
// ============================================================================

test("P0-C.1 — assertSafeDatabaseTarget enforces fail-closed Production Neon isolation across runtimes", () => {
  // 1. Genuine Vercel Production + Production Neon -> allowed
  assert.doesNotThrow(() =>
    assertSafeDatabaseTarget(PROD_NEON_URL, { VERCEL_ENV: "production" })
  );
  assert.doesNotThrow(() =>
    assertSafeDatabaseTarget(PROD_NEON_URL, { VERCEL_ENV: "Production" })
  );

  // 2. Preview + Production Neon -> blocked (preserves MSR-10 error contract)
  assert.throws(
    () => assertSafeDatabaseTarget(PROD_NEON_URL, { VERCEL_ENV: "preview" }),
    /FATAL: Preview deployment is prohibited from targeting Production Neon endpoint ep-aged-dew-av9711nr/
  );

  // 3. Development + Production Neon -> blocked
  for (const envObj of [
    { VERCEL_ENV: "development" },
    { VERCEL_ENV: "Development" },
    { VERCEL_ENV: "development", NODE_ENV: "production" },
  ]) {
    assert.throws(
      () => assertSafeDatabaseTarget(PROD_NEON_URL, envObj),
      /FATAL: Non-production runtime \(development\) is prohibited from targeting Production Neon endpoint ep-aged-dew-av9711nr/
    );
  }

  // 4. Local / unset VERCEL_ENV (even with NODE_ENV=production) + Production Neon -> blocked
  for (const envObj of [
    {},
    { NODE_ENV: "development" },
    { NODE_ENV: "production" },
    { NODE_ENV: "test" },
  ]) {
    assert.throws(
      () => assertSafeDatabaseTarget(PROD_NEON_URL, envObj),
      /FATAL: Non-production runtime \(local\) is prohibited from targeting Production Neon endpoint ep-aged-dew-av9711nr/
    );
  }

  // 5. Unknown/ambiguous VERCEL_ENV + Production Neon -> blocked
  for (const unknownEnv of ["staging", "qa", "prod", "local", "canary"]) {
    assert.throws(
      () => assertSafeDatabaseTarget(PROD_NEON_URL, { VERCEL_ENV: unknownEnv }),
      /FATAL: Non-production runtime .* is prohibited from targeting Production Neon endpoint ep-aged-dew-av9711nr/
    );
  }

  // 6. Custom PRODUCTION_DATABASE_URL host match + PGHOST fallback -> blocked outside production
  assert.throws(
    () =>
      assertSafeDatabaseTarget("postgresql://u:pw_hidden@custom-prod-host.example.com/neondb", {
        VERCEL_ENV: "development",
        PRODUCTION_DATABASE_URL: "postgresql://u:x@custom-prod-host.example.com/neondb",
      }),
    /FATAL: Non-production runtime \(development\) is prohibited from targeting Production Neon endpoint ep-aged-dew-av9711nr/
  );
  assert.throws(
    () =>
      assertSafeDatabaseTarget(undefined, {
        VERCEL_ENV: "development",
        PGHOST: "ep-aged-dew-av9711nr-pooler.c-2.us-east-1.aws.neon.tech",
      }),
    /FATAL: Non-production runtime \(development\) is prohibited from targeting Production Neon endpoint ep-aged-dew-av9711nr/
  );
  // Hostless URI and empty-string databaseUrl must NOT bypass PGHOST checks
  assert.throws(
    () =>
      assertSafeDatabaseTarget("postgresql:///neondb", {
        VERCEL_ENV: "development",
        PGHOST: "ep-aged-dew-av9711nr-pooler.c-2.us-east-1.aws.neon.tech",
      }),
    /FATAL: Non-production runtime \(development\) is prohibited from targeting Production Neon endpoint ep-aged-dew-av9711nr/
  );
  assert.throws(
    () =>
      assertSafeDatabaseTarget("", {
        VERCEL_ENV: "development",
        DATABASE_URL: "",
        PGHOST: "ep-aged-dew-av9711nr-pooler.c-2.us-east-1.aws.neon.tech",
      }),
    /FATAL: Non-production runtime \(development\) is prohibited from targeting Production Neon endpoint ep-aged-dew-av9711nr/
  );
  assert.throws(
    () =>
      assertSafeDatabaseTarget("", {
        VERCEL_ENV: "production",
        DATABASE_URL: "",
        PGHOST: "ep-aged-lake-avdgndee-pooler.c-2.us-east-1.aws.neon.tech",
      }),
    /FATAL: Production deployment is prohibited from targeting Staging Neon endpoint ep-aged-lake-avdgndee/
  );

  // 7. Production + Staging Neon -> blocked
  assert.throws(
    () => assertSafeDatabaseTarget(STG_NEON_URL, { VERCEL_ENV: "production" }),
    /FATAL: Production deployment is prohibited from targeting Staging Neon endpoint ep-aged-lake-avdgndee/
  );

  // 8. Staging in Development/Preview and local loopback PG in local runtime -> allowed
  assert.doesNotThrow(() =>
    assertSafeDatabaseTarget(STG_NEON_URL, { VERCEL_ENV: "development" })
  );
  assert.doesNotThrow(() =>
    assertSafeDatabaseTarget(STG_NEON_URL, { VERCEL_ENV: "preview" })
  );
  assert.doesNotThrow(() =>
    assertSafeDatabaseTarget(LOCAL_PG_URL, { NODE_ENV: "development" })
  );

  // 9. Credential redaction: password must NEVER appear in thrown error messages
  try {
    assertSafeDatabaseTarget(PROD_NEON_URL, { VERCEL_ENV: "development" });
    assert.fail("Expected throw");
  } catch (err) {
    assert.equal(String(err.message).includes("super_secret_pw_999"), false);
  }

  // 10. Explicit env must NOT inherit process.env.VERCEL_ENV="production"
  const origVercelEnv = process.env.VERCEL_ENV;
  try {
    process.env.VERCEL_ENV = "production";
    assert.throws(
      () => assertSafeDatabaseTarget(PROD_NEON_URL, { NODE_ENV: "development" }),
      /Non-production runtime \(local\) is prohibited/
    );
  } finally {
    if (origVercelEnv === undefined) delete process.env.VERCEL_ENV;
    else process.env.VERCEL_ENV = origVercelEnv;
  }
});

test("P0-C.2 — No application DB initialization path bypasses assertSafeDatabaseTarget in non-production", async () => {
  const devEnv = { VERCEL_ENV: "development", NODE_ENV: "development" };
  const localEnv = { NODE_ENV: "production" }; // intentionally adversarial NODE_ENV=production without VERCEL_ENV=production

  for (const envObj of [devEnv, localEnv]) {
    // 1. Identity API & repository
    await assert.rejects(
      () =>
        youniverseIdentityHandler(
          makeReq({ method: "GET", query: { username: "alice" } }),
          makeRes(),
          { databaseUrl: PROD_NEON_URL, env: envObj }
        ),
      /prohibited from targeting Production Neon endpoint ep-aged-dew-av9711nr/
    );
    assert.throws(
      () => createNeonYouniverseIdentityRepository(PROD_NEON_URL, envObj),
      /prohibited from targeting Production Neon endpoint ep-aged-dew-av9711nr/
    );

    // 2. Public profile endpoint
    await assert.rejects(
      () =>
        youniversePublicHandler(
          makeReq({ method: "GET", query: { handle: "alice" } }),
          makeRes(),
          { databaseUrl: PROD_NEON_URL, env: envObj }
        ),
      /prohibited from targeting Production Neon endpoint ep-aged-dew-av9711nr/
    );

    // 3. Founding Angels getPool
    assert.throws(
      () => getPool({ databaseUrl: PROD_NEON_URL, env: envObj }),
      /prohibited from targeting Production Neon endpoint ep-aged-dew-av9711nr/
    );

    // 4. Neon session factory
    assert.throws(
      () => makeSqlClient(PROD_NEON_URL, envObj),
      /prohibited from targeting Production Neon endpoint ep-aged-dew-av9711nr/
    );

    // 5. Serverless auth
    await assert.rejects(
      () =>
        authenticateRequest(
          makeReq({ headers: { authorization: "Bearer test-token-123" } }),
          { databaseUrl: PROD_NEON_URL, env: envObj }
        ),
      /prohibited from targeting Production Neon endpoint ep-aged-dew-av9711nr/
    );

    // 6. Claim API
    await assert.rejects(
      () =>
        claimHandler(
          makeReq({
            method: "POST",
            headers: { origin: "https://itsyouonline.com" },
            body: { handle: "alice", email: "alice@example.com" },
          }),
          makeRes(),
          { databaseUrl: PROD_NEON_URL, env: envObj }
        ),
      /prohibited from targeting Production Neon endpoint ep-aged-dew-av9711nr/
    );

    // 7. Context endpoint & legacy controller
    await assert.rejects(
      () =>
        youniverseContextHandler(
          makeReq({
            method: "GET",
            query: { handle: "alice" },
            headers: { authorization: "Bearer test-token-123" },
          }),
          makeRes(),
          { databaseUrl: PROD_NEON_URL, env: envObj }
        ),
      /prohibited from targeting Production Neon endpoint ep-aged-dew-av9711nr/
    );

    const legacyRes = makeRes();
    await getYouniverseContextHandler(
      makeReq({ params: { handle: "alice" } }),
      legacyRes,
      { env: { ...envObj, DATABASE_URL: PROD_NEON_URL } }
    );
    assert.equal(legacyRes.statusCode, 500);
    assert.equal(legacyRes.body.error, "internal_error");
  }
});

// ============================================================================
// P0-D — POSTMESSAGE ORIGIN, SOURCE & PAYLOAD VALIDATION
// ============================================================================

test("P0-D.1 — Strict origin allowlist accepts approved origins and rejects untrusted/wildcard/null/missing origins", () => {
  assert.ok(APPROVED_ECOSYSTEM_ORIGINS.includes("https://itsyouonline.com"));
  assert.ok(APPROVED_ECOSYSTEM_ORIGINS.includes("https://www.itsyouonline.com"));
  assert.ok(APPROVED_AGENT_ORIGINS.has("https://contracts.itsyouonline.com"));
  assert.equal(APPROVED_AGENT_ORIGINS.has("https://win"), false);

  assert.equal(normalizeStrictOrigin("https://itsyouonline.com"), "https://itsyouonline.com");
  assert.equal(normalizeStrictOrigin("http://localhost:5174"), "http://localhost:5174");
  assert.equal(normalizeStrictOrigin("http://127.0.0.1:5174"), "http://127.0.0.1:5174");

  for (const bad of ["*", "null", "", "   ", null, undefined, "http://evil.com", "http://contracts.itsyouonline.com", "https://user:pass@itsyouonline.com", "https://itsyouonline.com/path"]) {
    assert.equal(normalizeStrictOrigin(bad), null, `Must reject origin: ${String(bad)}`);
  }

  // Fail closed when currentOrigin is missing/invalid
  assert.equal(buildAllowedPortalMessageOrigins("").size, 0);
  assert.equal(buildAllowedPortalMessageOrigins("null").size, 0);

  const allowedOnProd = buildAllowedPortalMessageOrigins("https://itsyouonline.com");
  assert.equal(allowedOnProd.has("https://itsyouonline.com"), true);
  assert.equal(allowedOnProd.has("https://contracts.itsyouonline.com"), true);
  assert.equal(allowedOnProd.has("https://attacker.itsyouonline.com"), false);
  assert.equal(allowedOnProd.has("https://evil.com"), false);
  assert.equal(allowedOnProd.has("http://localhost:5174"), false);
});

test("P0-D.2 — validatePortalWindowMessage enforces origin, source, and schema without permissive fallback", () => {
  const selfWin = { id: "self" };
  const agentIframeWin = { id: "agent-iframe" };
  const externalOpenerWin = { id: "unrelated-tab" };
  const allowedSources = new Set([agentIframeWin]);

  // 1. Approved cross-origin agent iframe + valid SUBMIT_DELIVERABLE -> accepted
  const okCross = validatePortalWindowMessage(
    {
      origin: "https://contracts.itsyouonline.com",
      source: agentIframeWin,
      data: {
        type: "SUBMIT_DELIVERABLE",
        agentId: "AC",
        agentName: "Arbiter",
        content: "Signed artifact",
        timestamp: "2026-11-23T12:00:00.000Z",
        extraField: "ignored",
      },
    },
    {
      currentOrigin: "https://itsyouonline.com",
      allowedSources,
      selfWindow: selfWin,
    }
  );
  assert.equal(okCross.ok, true);
  assert.deepEqual(okCross.message, {
    type: "SUBMIT_DELIVERABLE",
    agentId: "AC",
    agentName: "Arbiter",
    content: "Signed artifact",
    timestamp: "2026-11-23T12:00:00.000Z",
  });
  assert.equal("extraField" in okCross.message, false);

  // 2. Approved same-origin self window + AGENT_READY / HEARTBEAT / ERROR -> accepted
  for (const type of ["AGENT_READY", "AGENT_HEARTBEAT", "AGENT_ERROR"]) {
    const okSame = validatePortalWindowMessage(
      {
        origin: "https://itsyouonline.com",
        source: selfWin,
        data: { type, agentId: "AC", agentName: "Arbiter" },
      },
      {
        currentOrigin: "https://itsyouonline.com",
        allowedSources,
        selfWindow: selfWin,
      }
    );
    assert.equal(okSame.ok, true);
    assert.equal(okSame.message.type, type);
  }

  // 3. Unapproved origins with valid-looking payload -> rejected
  for (const evilOrigin of [
    "https://evil.com",
    "https://itsyouonline.com.evil.com",
    "https://attacker-tenant.itsyouonline.com",
    "http://contracts.itsyouonline.com",
    "https://contracts.itsyouonline.com:8443",
    "https://win",
    "null",
    "",
    "*",
    undefined,
  ]) {
    const res = validatePortalWindowMessage(
      {
        origin: evilOrigin,
        source: agentIframeWin,
        data: { type: "SUBMIT_DELIVERABLE", agentId: "AC", content: "forged" },
      },
      {
        currentOrigin: "https://itsyouonline.com",
        allowedSources,
        selfWindow: selfWin,
      }
    );
    assert.equal(res.ok, false, `Must reject evil origin: ${String(evilOrigin)}`);
    assert.equal(res.reason, "untrusted_origin");
  }

  // 4. Cross-origin from non-iframe external window / missing source -> rejected
  assert.deepEqual(
    validatePortalWindowMessage(
      {
        origin: "https://contracts.itsyouonline.com",
        source: externalOpenerWin,
        data: { type: "AGENT_READY", agentId: "AC" },
      },
      {
        currentOrigin: "https://itsyouonline.com",
        allowedSources,
        selfWindow: selfWin,
      }
    ),
    { ok: false, reason: "untrusted_source" }
  );

  assert.deepEqual(
    validatePortalWindowMessage(
      {
        origin: "https://contracts.itsyouonline.com",
        source: null,
        data: { type: "AGENT_READY", agentId: "AC" },
      },
      {
        currentOrigin: "https://itsyouonline.com",
        allowedSources,
        selfWindow: selfWin,
      }
    ),
    { ok: false, reason: "missing_source" }
  );

  // 5. Missing currentOrigin config -> fail closed (no permissive fallback)
  assert.deepEqual(
    validatePortalWindowMessage(
      {
        origin: "https://contracts.itsyouonline.com",
        source: agentIframeWin,
        data: { type: "AGENT_READY", agentId: "AC" },
      },
      { currentOrigin: "", allowedSources, selfWindow: selfWin }
    ),
    { ok: false, reason: "missing_origin_config" }
  );

  // 6. Approved origin + malformed payloads -> rejected
  for (const badData of [
    null,
    undefined,
    "string",
    [],
    { type: "UNKNOWN_ACTION", agentId: "AC" },
    { type: "AGENT_READY" },
    { type: "AGENT_READY", agentId: "bad id with spaces!" },
    { type: "SUBMIT_DELIVERABLE", agentId: "AC", content: "" },
    { type: "SUBMIT_DELIVERABLE", agentId: "AC", content: { nested: true } },
    { type: "SUBMIT_DELIVERABLE", agentId: "AC", content: "x".repeat(50_001) },
    { type: "SUBMIT_DELIVERABLE", agentId: "AC", content: "ok", timestamp: "not-a-date" },
    { type: "AGENT_READY", agentId: "AC", agentName: 123 },
  ]) {
    const badRes = validatePortalWindowMessage(
      {
        origin: "https://contracts.itsyouonline.com",
        source: agentIframeWin,
        data: badData,
      },
      {
        currentOrigin: "https://itsyouonline.com",
        allowedSources,
        selfWindow: selfWin,
      }
    );
    assert.equal(badRes.ok, false);
    assert.equal(badRes.reason, "invalid_payload");
  }
});

test("P0-D.3 — WeaverSandbox validator & App.tsx wiring enforce message boundary", () => {
  const iframeWin = { id: "weaver-frame" };

  assert.deepEqual(
    validateWeaverSandboxMessage(
      { origin: "null", source: iframeWin, data: { type: "SANDBOX_READY" } },
      iframeWin
    ),
    { ok: true, message: { type: "SANDBOX_READY" } }
  );

  assert.equal(
    validateWeaverSandboxMessage(
      { origin: "null", source: undefined, data: { type: "SANDBOX_READY" } },
      undefined
    ).ok,
    false
  );
  assert.equal(
    validateWeaverSandboxMessage(
      { origin: "https://evil.com", source: iframeWin, data: { type: "SANDBOX_READY" } },
      iframeWin
    ).ok,
    false
  );
  assert.equal(
    validateWeaverSandboxMessage(
      { origin: "null", source: { other: true }, data: { type: "SANDBOX_READY" } },
      iframeWin
    ).ok,
    false
  );
  assert.equal(
    validateWeaverSandboxMessage(
      { origin: "null", source: iframeWin, data: { type: "UNEXPECTED" } },
      iframeWin
    ).ok,
    false
  );

  const appSource = fs.readFileSync(path.join(process.cwd(), "App.tsx"), "utf8");
  const sandboxSource = fs.readFileSync(
    path.join(process.cwd(), "components", "weaver", "WeaverSandbox.tsx"),
    "utf8"
  );
  assert.match(appSource, /validatePortalWindowMessage\(/);
  assert.match(appSource, /isTrustedAgentIframeSrc\(/);
  assert.match(appSource, /if \(!validated\.ok\)/);
  assert.match(sandboxSource, /validateWeaverSandboxMessage\(/);

  // Trusted agent iframe allowlist rejects same-origin proxy iframes and untrusted schemes
  assert.equal(isTrustedAgentIframeSrc("https://contracts.itsyouonline.com"), true);
  assert.equal(isTrustedAgentIframeSrc("https://contracts.itsyouonline.com/agent"), true);
  assert.equal(isTrustedAgentIframeSrc("/api/browser/proxy?url=https%3A%2F%2Fevil.com"), false);
  assert.equal(isTrustedAgentIframeSrc("about:blank"), false);
  assert.equal(isTrustedAgentIframeSrc("data:text/html,<script></script>"), false);
  assert.equal(isTrustedAgentIframeSrc("http://contracts.itsyouonline.com"), false);
  assert.equal(isTrustedAgentIframeSrc("https://attacker.itsyouonline.com"), false);
});
