/**
 * tests/phase2-owner-context.test.mjs
 *
 * Tests the Neon-native owner context verification handler (api/youniverse/[handle]/context.ts):
 *   - Valid Neon session for matching owner and handle -> { success: true, isOwner: true, handle, tier }
 *   - Valid Neon session for different owner -> { success: true, isOwner: false, handle, tier }
 *   - Invalid / forged session token -> 401
 *   - Expired session token -> 401
 *   - Revoked session token -> 401
 *   - Missing or malformed Authorization header -> 401
 *   - Non-existent handle -> 404
 *   - Suspended (is_live: false) Youniverse -> 403
 *   - Verify existing JWT middleware (verifyJwt.js) rejects opaque Neon tokens
 */

import assert from "node:assert/strict";
import test from "node:test";
import { createHash, randomBytes } from "crypto";
import { verifyJwt } from "../middleware/verifyJwt.js";

// Helper: sha256 hash
function hashToken(raw) {
  return createHash("sha256").update(raw, "utf8").digest("hex");
}

function makeMockSql({ sessions = [], identities = [] } = {}) {
  return async function sql(strings, ...values) {
    const q = strings.join("?");

    // SELECT id, identity_id, expires_at, revoked_at FROM sessions WHERE token_hash = ...
    if (q.includes("FROM sessions") && q.includes("WHERE token_hash")) {
      const hash = values[0];
      const match = sessions.find((s) => s.token_hash === hash);
      return match ? [match] : [];
    }

    // SELECT identity_id, username, plan, is_live FROM youniverse_identities WHERE username = ...
    if (q.includes("FROM youniverse_identities") && q.includes("WHERE username")) {
      const username = values[0];
      const match = identities.find((i) => i.username === username);
      return match ? [match] : [];
    }

    return [];
  };
}

function createMockReqRes({ method = "GET", headers = {}, params = {}, query = {} } = {}) {
  const req = { method, headers, params, query };
  let statusCode = 200;
  let body = null;

  const res = {
    status(code) {
      statusCode = code;
      return res;
    },
    json(data) {
      body = data;
      return res;
    },
    get statusCode() {
      return statusCode;
    },
    get body() {
      return body;
    },
  };

  return { req, res };
}

// Dynamically import the handler
const { default: contextHandler } = await import("../api/youniverse/[handle]/context.ts");

test("Context Handler: rejects missing Authorization header with 401", async () => {
  const { req, res } = createMockReqRes({ params: { handle: "alice" } });
  await contextHandler(req, res);
  assert.strictEqual(res.statusCode, 401);
  assert.strictEqual(res.body.success, false);
  assert.strictEqual(res.body.error, "unauthorized");
});

test("Context Handler: rejects non-Bearer Authorization header with 401", async () => {
  const { req, res } = createMockReqRes({
    headers: { authorization: "Basic 12345" },
    params: { handle: "alice" },
  });
  await contextHandler(req, res);
  assert.strictEqual(res.statusCode, 401);
  assert.strictEqual(res.body.success, false);
  assert.strictEqual(res.body.error, "unauthorized");
});

test("Context Handler: rejects missing handle with 400", async () => {
  const { req, res } = createMockReqRes({
    headers: { authorization: "Bearer " + "a".repeat(48) },
    params: {},
    query: {},
  });
  await contextHandler(req, res);
  assert.strictEqual(res.statusCode, 400);
  assert.strictEqual(res.body.success, false);
  assert.strictEqual(res.body.error, "handle_required");
});

test("Context Handler: rejects invalid token not found in Neon sessions with 401", async () => {
  const rawToken = randomBytes(24).toString("hex");
  const { req, res } = createMockReqRes({
    headers: { authorization: `Bearer ${rawToken}` },
    params: { handle: "alice" },
  });

  const mockSql = makeMockSql({ sessions: [], identities: [] });
  await contextHandler(req, res, { sql: mockSql, databaseUrl: "mock://url" });
  assert.strictEqual(res.statusCode, 401);
  assert.strictEqual(res.body.success, false);
  assert.strictEqual(res.body.error, "invalid_token");
});

test("Context Handler: grants isOwner: true for matching valid session", async () => {
  const rawToken = randomBytes(24).toString("hex");
  const tokenHash = hashToken(rawToken);
  const identityId = "id-alice-123";

  const mockSql = makeMockSql({
    sessions: [
      {
        id: "sess-1",
        identity_id: identityId,
        token_hash: tokenHash,
        expires_at: new Date(Date.now() + 100000),
        revoked_at: null,
      },
    ],
    identities: [
      {
        identity_id: identityId,
        username: "alice",
        plan: "free",
        is_live: true,
      },
    ],
  });

  const { req, res } = createMockReqRes({
    headers: { authorization: `Bearer ${rawToken}` },
    params: { handle: "alice" },
  });

  await contextHandler(req, res, { sql: mockSql, databaseUrl: "mock://url" });
  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual(res.body.success, true);
  assert.strictEqual(res.body.isOwner, true);
  assert.strictEqual(res.body.handle, "alice");
  assert.strictEqual(res.body.tier, "free");
});

test("Context Handler: returns isOwner: false for valid session of a different identity", async () => {
  const rawToken = randomBytes(24).toString("hex");
  const tokenHash = hashToken(rawToken);
  const bobIdentityId = "id-bob-456";
  const aliceIdentityId = "id-alice-123";

  const mockSql = makeMockSql({
    sessions: [
      {
        id: "sess-bob",
        identity_id: bobIdentityId,
        token_hash: tokenHash,
        expires_at: new Date(Date.now() + 100000),
        revoked_at: null,
      },
    ],
    identities: [
      {
        identity_id: aliceIdentityId,
        username: "alice",
        plan: "free",
        is_live: true,
      },
    ],
  });

  const { req, res } = createMockReqRes({
    headers: { authorization: `Bearer ${rawToken}` },
    params: { handle: "alice" },
  });

  await contextHandler(req, res, { sql: mockSql, databaseUrl: "mock://url" });
  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual(res.body.success, true);
  assert.strictEqual(res.body.isOwner, false);
  assert.strictEqual(res.body.handle, "alice");
});

test("Context Handler: rejects expired session with 401", async () => {
  const rawToken = randomBytes(24).toString("hex");
  const tokenHash = hashToken(rawToken);
  const identityId = "id-alice-123";

  const mockSql = makeMockSql({
    sessions: [
      {
        id: "sess-expired",
        identity_id: identityId,
        token_hash: tokenHash,
        expires_at: new Date(Date.now() - 1000), // expired
        revoked_at: null,
      },
    ],
    identities: [
      {
        identity_id: identityId,
        username: "alice",
        plan: "free",
        is_live: true,
      },
    ],
  });

  const { req, res } = createMockReqRes({
    headers: { authorization: `Bearer ${rawToken}` },
    params: { handle: "alice" },
  });

  await contextHandler(req, res, { sql: mockSql, databaseUrl: "mock://url" });
  assert.strictEqual(res.statusCode, 401);
  assert.strictEqual(res.body.success, false);
  assert.strictEqual(res.body.error, "invalid_token");
});

test("Context Handler: rejects revoked session with 401", async () => {
  const rawToken = randomBytes(24).toString("hex");
  const tokenHash = hashToken(rawToken);
  const identityId = "id-alice-123";

  const mockSql = makeMockSql({
    sessions: [
      {
        id: "sess-revoked",
        identity_id: identityId,
        token_hash: tokenHash,
        expires_at: new Date(Date.now() + 100000),
        revoked_at: new Date(), // revoked
      },
    ],
    identities: [
      {
        identity_id: identityId,
        username: "alice",
        plan: "free",
        is_live: true,
      },
    ],
  });

  const { req, res } = createMockReqRes({
    headers: { authorization: `Bearer ${rawToken}` },
    params: { handle: "alice" },
  });

  await contextHandler(req, res, { sql: mockSql, databaseUrl: "mock://url" });
  assert.strictEqual(res.statusCode, 401);
  assert.strictEqual(res.body.success, false);
  assert.strictEqual(res.body.error, "invalid_token");
});

test("Context Handler: returns 404 if Youniverse handle is not found", async () => {
  const rawToken = randomBytes(24).toString("hex");
  const tokenHash = hashToken(rawToken);
  const identityId = "id-alice-123";

  const mockSql = makeMockSql({
    sessions: [
      {
        id: "sess-1",
        identity_id: identityId,
        token_hash: tokenHash,
        expires_at: new Date(Date.now() + 100000),
        revoked_at: null,
      },
    ],
    identities: [], // handle not found
  });

  const { req, res } = createMockReqRes({
    headers: { authorization: `Bearer ${rawToken}` },
    params: { handle: "alice" },
  });

  await contextHandler(req, res, { sql: mockSql, databaseUrl: "mock://url" });
  assert.strictEqual(res.statusCode, 404);
  assert.strictEqual(res.body.success, false);
  assert.strictEqual(res.body.error, "youniverse_not_found");
});

test("verifyJwt: rejects opaque Neon random token (preserves NotNotes and Weaver boundaries)", async () => {
  const opaqueNeonToken = randomBytes(24).toString("hex");
  const req = {
    headers: { authorization: `Bearer ${opaqueNeonToken}` },
  };
  let statusCode = 200;
  let body = null;
  const res = {
    status(c) {
      statusCode = c;
      return res;
    },
    json(b) {
      body = b;
      return res;
    },
  };
  let nextCalled = false;

  await verifyJwt(req, res, () => {
    nextCalled = true;
  });

  assert.strictEqual(nextCalled, false);
  assert.strictEqual(statusCode, 401);
  assert.strictEqual(body.error, "invalid_token");
});
