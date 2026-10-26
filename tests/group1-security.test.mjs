/**
 * Group 1 Security Implementation Tests (Real-Code Validation)
 *
 * Covers:
 *   Change C: api/migrate-db.ts (Containment: endpoint disabled, returns 410 Gone, no DDL)
 *   Change A: api/gemini.ts (Real production handler & input bounding: auth, store error boundary,
 *             model allowlist, part/text limits, system instructions, rejected tools/binary, safe errors)
 *   Change B: lib/ownerAuth.ts & OwnerLoginModal flow (Real production auth logic: fail-closed,
 *             prevents conflicting success state on rejected token, storage isolation)
 *
 * Run: node tests/group1-security.test.mjs
 */

import assert from "assert";

// ── Production Code Imports ──────────────────────────────────────────────────
import migrateDbHandler from "../api/migrate-db.ts";
import realGeminiHandler, {
  validateGeminiInput,
  ALLOWED_MODELS,
  MAX_CONTENT_ITEMS,
  MAX_PARTS_PER_CONTENT,
  MAX_TOTAL_TEXT_LENGTH,
  MAX_OUTPUT_TOKENS_LIMIT,
} from "../api/gemini.ts";
import {
  validateOwnerTokenOnServer,
  processMagicLinkResponse,
} from "../lib/ownerAuth.ts";

// ── Mock HTTP req/res Helper ─────────────────────────────────────────────────
function createMockReqRes({ method = "POST", headers = {}, body = {}, query = {} } = {}) {
  const req = {
    method,
    headers,
    body,
    query,
  };

  let statusCode = 200;
  let responseData = null;
  const setHeaders = {};

  const res = {
    status(code) {
      statusCode = code;
      return res;
    },
    json(data) {
      responseData = data;
      return res;
    },
    setHeader(k, v) {
      setHeaders[k] = v;
      return res;
    },
    end() {
      return res;
    },
    get statusCode() {
      return statusCode;
    },
    get body() {
      return responseData;
    },
    get headers() {
      return setHeaders;
    },
  };

  return { req, res };
}

// ── Mock Dependency Factory for Real Gemini Handler ──────────────────────────
function createMockDeps({
  validateSessionResult = { ok: true, identityId: "id-1" },
  shouldSessionThrow = false,
  generateResult = { response: Promise.resolve({ candidates: [{ content: { parts: [{ text: "response" }], role: "model" } }] }) },
  shouldGenerateThrow = false,
} = {}) {
  let providerCalled = false;
  let sessionCalled = false;
  let capturedModelParams = null;
  let capturedContents = null;

  const mockNeon = (url) => {
    return (strings, ...values) => Promise.resolve([]);
  };

  const mockValidateSession = async (sql, rawToken) => {
    sessionCalled = true;
    if (shouldSessionThrow) {
      throw new Error("Neon connection timeout / unreachable");
    }
    return typeof validateSessionResult === "function"
      ? validateSessionResult(rawToken)
      : validateSessionResult;
  };

  class MockGoogleGenerativeAI {
    constructor(apiKey) {
      this.apiKey = apiKey;
    }
    getGenerativeModel(params) {
      capturedModelParams = params;
      return {
        generateContent: async (contents) => {
          providerCalled = true;
          capturedContents = contents;
          if (shouldGenerateThrow) {
            throw new Error("Gemini quota exceeded or upstream 503");
          }
          return generateResult;
        },
      };
    }
  }

  return {
    deps: {
      neon: mockNeon,
      validateSession: mockValidateSession,
      GoogleGenerativeAI: MockGoogleGenerativeAI,
      databaseUrl: "postgresql://mock:mock@localhost/mock",
      apiKey: "mock-gemini-key",
    },
    wasProviderCalled: () => providerCalled,
    wasSessionCalled: () => sessionCalled,
    getCapturedModelParams: () => capturedModelParams,
    getCapturedContents: () => capturedContents,
  };
}

let passed = 0;
let failed = 0;

async function test(name, fn) {
  try {
    await fn();
    console.log(`  ✓  ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗  ${name}`);
    console.error(`     ${err.message}`);
    failed++;
  }
}

console.log("\nGroup 1 Security Tests (Real Production Code)\n");

// ============================================================================
// CHANGE C: api/migrate-db.ts containment
// ============================================================================
console.log("Change C: api/migrate-db.ts containment");

await test("C01: api/migrate-db returns HTTP 410 Gone for GET request", async () => {
  const { req, res } = createMockReqRes({ method: "GET" });
  await migrateDbHandler(req, res);
  assert.strictEqual(res.statusCode, 410);
  assert.strictEqual(res.body.success, false);
  assert.strictEqual(res.body.error, "endpoint_disabled");
});

await test("C02: api/migrate-db returns HTTP 410 Gone for POST request", async () => {
  const { req, res } = createMockReqRes({ method: "POST" });
  await migrateDbHandler(req, res);
  assert.strictEqual(res.statusCode, 410);
  assert.strictEqual(res.body.success, false);
  assert.strictEqual(res.body.error, "endpoint_disabled");
});

await test("C03: api/migrate-db does not inspect query secrets or attempt DB operations", async () => {
  const { req, res } = createMockReqRes({ method: "GET", query: { secret: "super-secret" } });
  await migrateDbHandler(req, res);
  assert.strictEqual(res.statusCode, 410);
  assert.strictEqual(res.body.success, false);
});

// ============================================================================
// CHANGE A: api/gemini.ts real handler execution & security bounds
// ============================================================================
console.log("\nChange A: api/gemini.ts real production handler");

await test("A01: rejects non-POST requests with 405 without invoking provider", async () => {
  const { req, res } = createMockReqRes({ method: "GET" });
  const mock = createMockDeps();
  await realGeminiHandler(req, res, mock.deps);
  assert.strictEqual(res.statusCode, 405);
  assert.strictEqual(res.body.error, "Method not allowed");
  assert.strictEqual(mock.wasProviderCalled(), false);
});

await test("A02: rejects missing Authorization header with 401 without invoking provider", async () => {
  const { req, res } = createMockReqRes({
    method: "POST",
    headers: {},
    body: { model: "gemini-1.5-flash", contents: [{ role: "user", parts: [{ text: "hi" }] }] },
  });
  const mock = createMockDeps();
  await realGeminiHandler(req, res, mock.deps);
  assert.strictEqual(res.statusCode, 401);
  assert.strictEqual(res.body.error, "unauthorized");
  assert.strictEqual(mock.wasSessionCalled(), false);
  assert.strictEqual(mock.wasProviderCalled(), false);
});

await test("A03: rejects malformed Authorization header (non-Bearer) with 401", async () => {
  const { req, res } = createMockReqRes({
    method: "POST",
    headers: { authorization: "Basic dXNlcjpwYXNz" },
    body: { model: "gemini-1.5-flash", contents: [{ role: "user", parts: [{ text: "hi" }] }] },
  });
  const mock = createMockDeps();
  await realGeminiHandler(req, res, mock.deps);
  assert.strictEqual(res.statusCode, 401);
  assert.strictEqual(res.body.error, "unauthorized");
  assert.strictEqual(mock.wasProviderCalled(), false);
});

await test("A04: rejects whitespace-only Bearer token with 401", async () => {
  const { req, res } = createMockReqRes({
    method: "POST",
    headers: { authorization: "Bearer   " },
    body: { model: "gemini-1.5-flash", contents: [{ role: "user", parts: [{ text: "hi" }] }] },
  });
  const mock = createMockDeps();
  await realGeminiHandler(req, res, mock.deps);
  assert.strictEqual(res.statusCode, 401);
  assert.strictEqual(res.body.error, "unauthorized");
  assert.strictEqual(mock.wasProviderCalled(), false);
});

await test("A05: rejects invalid, expired, or revoked session token with 401", async () => {
  const { req, res } = createMockReqRes({
    method: "POST",
    headers: { authorization: "Bearer invalid_tok_xyz" },
    body: { model: "gemini-1.5-flash", contents: [{ role: "user", parts: [{ text: "hi" }] }] },
  });
  const mock = createMockDeps({
    validateSessionResult: { ok: false, reason: "not_found" },
  });
  await realGeminiHandler(req, res, mock.deps);
  assert.strictEqual(res.statusCode, 401);
  assert.strictEqual(res.body.error, "invalid_token");
  assert.strictEqual(mock.wasSessionCalled(), true);
  assert.strictEqual(mock.wasProviderCalled(), false);
});

await test("A06: session store failure returns controlled 500 without leaking details or calling provider", async () => {
  const { req, res } = createMockReqRes({
    method: "POST",
    headers: { authorization: "Bearer valid_tok" },
    body: { model: "gemini-1.5-flash", contents: [{ role: "user", parts: [{ text: "hi" }] }] },
  });
  const mock = createMockDeps({ shouldSessionThrow: true });
  await realGeminiHandler(req, res, mock.deps);
  assert.strictEqual(res.statusCode, 500);
  assert.strictEqual(res.body.error, "session_store_unavailable");
  assert.strictEqual(res.body.message, "Authentication service temporarily unavailable.");
  assert.strictEqual(mock.wasProviderCalled(), false);
});

await test("A07: rejects disallowed model names with 400", async () => {
  const { req, res } = createMockReqRes({
    method: "POST",
    headers: { authorization: "Bearer valid_tok" },
    body: { model: "gemini-1.5-pro", contents: [{ role: "user", parts: [{ text: "hi" }] }] },
  });
  const mock = createMockDeps();
  await realGeminiHandler(req, res, mock.deps);
  assert.strictEqual(res.statusCode, 400);
  assert.strictEqual(res.body.error, "invalid_model");
  assert.strictEqual(mock.wasProviderCalled(), false);
});

await test("A08: rejects non-array or empty contents with 400", async () => {
  const mock = createMockDeps();

  // Non-array
  const r1 = createMockReqRes({
    method: "POST",
    headers: { authorization: "Bearer valid_tok" },
    body: { model: "gemini-1.5-flash", contents: "string_not_array" },
  });
  await realGeminiHandler(r1.req, r1.res, mock.deps);
  assert.strictEqual(r1.res.statusCode, 400);
  assert.strictEqual(r1.res.body.error, "invalid_contents");

  // Empty array
  const r2 = createMockReqRes({
    method: "POST",
    headers: { authorization: "Bearer valid_tok" },
    body: { model: "gemini-1.5-flash", contents: [] },
  });
  await realGeminiHandler(r2.req, r2.res, mock.deps);
  assert.strictEqual(r2.res.statusCode, 400);
  assert.strictEqual(r2.res.body.error, "invalid_contents");
  assert.strictEqual(mock.wasProviderCalled(), false);
});

await test("A09: rejects contents with > 20 items with 400", async () => {
  const hugeContents = Array.from({ length: 21 }, () => ({ role: "user", parts: [{ text: "a" }] }));
  const { req, res } = createMockReqRes({
    method: "POST",
    headers: { authorization: "Bearer valid_tok" },
    body: { model: "gemini-1.5-flash", contents: hugeContents },
  });
  const mock = createMockDeps();
  await realGeminiHandler(req, res, mock.deps);
  assert.strictEqual(res.statusCode, 400);
  assert.strictEqual(res.body.error, "invalid_contents");
  assert.strictEqual(mock.wasProviderCalled(), false);
});

await test("A10: rejects content item with > 10 parts with 400", async () => {
  const manyParts = Array.from({ length: 11 }, () => ({ text: "p" }));
  const { req, res } = createMockReqRes({
    method: "POST",
    headers: { authorization: "Bearer valid_tok" },
    body: { model: "gemini-1.5-flash", contents: [{ role: "user", parts: manyParts }] },
  });
  const mock = createMockDeps();
  await realGeminiHandler(req, res, mock.deps);
  assert.strictEqual(res.statusCode, 400);
  assert.strictEqual(res.body.error, "invalid_contents");
  assert.strictEqual(mock.wasProviderCalled(), false);
});

await test("A11: rejects prompt text exceeding 10,000 aggregate characters with 400", async () => {
  const hugePart = [{ role: "user", parts: [{ text: "x".repeat(10001) }] }];
  const { req, res } = createMockReqRes({
    method: "POST",
    headers: { authorization: "Bearer valid_tok" },
    body: { model: "gemini-1.5-flash", contents: hugePart },
  });
  const mock = createMockDeps();
  await realGeminiHandler(req, res, mock.deps);
  assert.strictEqual(res.statusCode, 400);
  assert.strictEqual(res.body.error, "payload_too_large");
  assert.strictEqual(mock.wasProviderCalled(), false);
});

await test("A12: rejects client-supplied tools with 400", async () => {
  const { req, res } = createMockReqRes({
    method: "POST",
    headers: { authorization: "Bearer valid_tok" },
    body: {
      model: "gemini-1.5-flash",
      contents: [{ role: "user", parts: [{ text: "hi" }] }],
      tools: [{ functionDeclarations: [{ name: "exec", description: "unauthorized" }] }],
    },
  });
  const mock = createMockDeps();
  await realGeminiHandler(req, res, mock.deps);
  assert.strictEqual(res.statusCode, 400);
  assert.strictEqual(res.body.error, "unsupported_feature");
  assert.strictEqual(mock.wasProviderCalled(), false);
});

await test("A13: rejects inline binary data (inlineData) in content parts with 400", async () => {
  const { req, res } = createMockReqRes({
    method: "POST",
    headers: { authorization: "Bearer valid_tok" },
    body: {
      model: "gemini-1.5-flash",
      contents: [{
        role: "user",
        parts: [{ inlineData: { mimeType: "image/png", data: "base64data==" } }],
      }],
    },
  });
  const mock = createMockDeps();
  await realGeminiHandler(req, res, mock.deps);
  assert.strictEqual(res.statusCode, 400);
  assert.strictEqual(res.body.error, "unsupported_content");
  assert.strictEqual(mock.wasProviderCalled(), false);
});

await test("A14: rejects oversized or malformed system instructions with 400", async () => {
  const mock = createMockDeps();

  // Oversized system instruction (> 2000 chars)
  const r1 = createMockReqRes({
    method: "POST",
    headers: { authorization: "Bearer valid_tok" },
    body: {
      model: "gemini-1.5-flash",
      contents: [{ role: "user", parts: [{ text: "hi" }] }],
      systemInstruction: "s".repeat(2001),
    },
  });
  await realGeminiHandler(r1.req, r1.res, mock.deps);
  assert.strictEqual(r1.res.statusCode, 400);
  assert.strictEqual(r1.res.body.error, "invalid_system_instruction");

  // Binary in system instruction parts
  const r2 = createMockReqRes({
    method: "POST",
    headers: { authorization: "Bearer valid_tok" },
    body: {
      model: "gemini-1.5-flash",
      contents: [{ role: "user", parts: [{ text: "hi" }] }],
      systemInstruction: { parts: [{ inlineData: { data: "xyz" } }] },
    },
  });
  await realGeminiHandler(r2.req, r2.res, mock.deps);
  assert.strictEqual(r2.res.statusCode, 400);
  assert.strictEqual(r2.res.body.error, "unsupported_content");
  assert.strictEqual(mock.wasProviderCalled(), false);
});

await test("A15: rejects client attempts to override server output token limit (> 100) with 400", async () => {
  const { req, res } = createMockReqRes({
    method: "POST",
    headers: { authorization: "Bearer valid_tok" },
    body: {
      model: "gemini-1.5-flash",
      contents: [{ role: "user", parts: [{ text: "hi" }] }],
      generationConfig: { maxOutputTokens: 5000 },
    },
  });
  const mock = createMockDeps();
  await realGeminiHandler(req, res, mock.deps);
  assert.strictEqual(res.statusCode, 400);
  assert.strictEqual(res.body.error, "invalid_generation_config");
  assert.strictEqual(mock.wasProviderCalled(), false);
});

await test("A16: accepts valid authenticated text request and invokes provider with bounded config (200)", async () => {
  const { req, res } = createMockReqRes({
    method: "POST",
    headers: { authorization: "Bearer valid_tok" },
    body: {
      model: "gemini-1.5-flash",
      systemInstruction: { parts: [{ text: "You are Atom." }] },
      contents: [{ role: "user", parts: [{ text: "Hello" }] }],
      generationConfig: { maxOutputTokens: 30, temperature: 0.8 },
    },
  });
  const mock = createMockDeps({
    generateResult: {
      response: Promise.resolve({
        candidates: [{
          content: { parts: [{ text: "Atom response" }], role: "model" },
          finishReason: "STOP",
        }],
      }),
    },
  });
  await realGeminiHandler(req, res, mock.deps);
  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual(mock.wasProviderCalled(), true);
  assert.strictEqual(res.body.candidates[0].content.parts[0].text, "Atom response");

  // Verify server enforced safe generationConfig bounds to the provider
  const modelParams = mock.getCapturedModelParams();
  assert.strictEqual(modelParams.generationConfig.maxOutputTokens, 30);
  assert.strictEqual(modelParams.generationConfig.temperature, 0.8);
});

await test("A17: provider failure returns safe 500 without leaking error details", async () => {
  const { req, res } = createMockReqRes({
    method: "POST",
    headers: { authorization: "Bearer valid_tok" },
    body: {
      model: "gemini-1.5-flash",
      contents: [{ role: "user", parts: [{ text: "Hello" }] }],
    },
  });
  const mock = createMockDeps({ shouldGenerateThrow: true });
  await realGeminiHandler(req, res, mock.deps);
  assert.strictEqual(res.statusCode, 500);
  assert.strictEqual(res.body.error, "generation_failed");
  assert.strictEqual(res.body.message, "An error occurred while generating content.");
});

// ============================================================================
// CHANGE B: Owner login validation & magic-link flow (lib/ownerAuth.ts)
// ============================================================================
console.log("\nChange B: Owner login real validation & magic-link response handling");

await test("B01: validateOwnerTokenOnServer fails closed on empty token or missing handle", async () => {
  const r1 = await validateOwnerTokenOnServer("", "valid_token");
  assert.strictEqual(r1.ok, false);

  const r2 = await validateOwnerTokenOnServer("target", "   ");
  assert.strictEqual(r2.ok, false);
});

await test("B02: validateOwnerTokenOnServer requires 200 response with isOwner: true", async () => {
  // Non-owner (200 with isOwner: false)
  const mockFetchNonOwner = async () => ({
    ok: true,
    status: 200,
    json: async () => ({ success: true, isOwner: false, handle: "target" }),
  });
  const r1 = await validateOwnerTokenOnServer("target", "tok_user_b", mockFetchNonOwner);
  assert.strictEqual(r1.ok, false);
  assert.strictEqual(r1.isOwner, false);

  // 401 Unauthorized
  const mockFetch401 = async () => ({
    ok: false,
    status: 401,
    json: async () => ({ success: false, error: "invalid_token" }),
  });
  const r2 = await validateOwnerTokenOnServer("target", "bad_tok", mockFetch401);
  assert.strictEqual(r2.ok, false);
  assert.strictEqual(r2.status, 401);

  // 403 Suspended
  const mockFetch403 = async () => ({
    ok: false,
    status: 403,
    json: async () => ({ success: false, error: "youniverse_suspended" }),
  });
  const r3 = await validateOwnerTokenOnServer("target", "tok", mockFetch403);
  assert.strictEqual(r3.ok, false);
  assert.strictEqual(r3.status, 403);

  // Network error fails closed
  const mockFetchThrow = async () => { throw new Error("Network down"); };
  const r4 = await validateOwnerTokenOnServer("target", "tok", mockFetchThrow);
  assert.strictEqual(r4.ok, false);

  // Verified owner
  const mockFetchOwner = async () => ({
    ok: true,
    status: 200,
    json: async () => ({ success: true, isOwner: true, handle: "target" }),
  });
  const r5 = await validateOwnerTokenOnServer("target", "tok_owner", mockFetchOwner);
  assert.strictEqual(r5.ok, true);
  assert.strictEqual(r5.isOwner, true);
});

await test("B03: rejected session token NEVER stores token, calls onLoginSuccess, or shows dispatch success", async () => {
  const storageMap = new Map();
  const mockStorage = {
    setItem: (k, v) => storageMap.set(k, v),
  };
  let loginSuccessCalled = false;

  const outcome = await processMagicLinkResponse({
    res: { ok: true, status: 200 },
    data: { success: true, sessionToken: "candidate_invalid_tok" },
    handle: "testowner",
    validateOwnerToken: async (tok) => false, // validation fails
    onLoginSuccess: () => { loginSuccessCalled = true; },
    storage: mockStorage,
  });

  // Must yield error_validation_failed, NOT success_link_dispatched
  assert.strictEqual(outcome.type, "error_validation_failed");
  assert.strictEqual(loginSuccessCalled, false);
  assert.strictEqual(storageMap.has("youniverse_session_token"), false);
  assert.strictEqual(storageMap.has("youniverse_os_active_testowner"), false);
});

await test("B04: verified session token stores credentials and triggers onLoginSuccess", async () => {
  const storageMap = new Map();
  const mockStorage = {
    setItem: (k, v) => storageMap.set(k, v),
  };
  let loggedInToken = null;

  const outcome = await processMagicLinkResponse({
    res: { ok: true, status: 200 },
    data: { success: true, sessionToken: "valid_owner_tok" },
    handle: "testowner",
    validateOwnerToken: async (tok) => true, // verified owner
    onLoginSuccess: (tok) => { loggedInToken = tok; },
    storage: mockStorage,
  });

  assert.strictEqual(outcome.type, "success_authenticated");
  assert.strictEqual(outcome.token, "valid_owner_tok");
  assert.strictEqual(loggedInToken, "valid_owner_tok");
  assert.strictEqual(storageMap.get("youniverse_session_token"), "valid_owner_tok");
  assert.strictEqual(storageMap.get("youniverse_os_active_testowner"), "true");
});

await test("B05: genuine magic-link dispatch without token yields success_link_dispatched", async () => {
  let loginSuccessCalled = false;
  const outcome = await processMagicLinkResponse({
    res: { ok: true, status: 200 },
    data: { success: true }, // no direct session token returned
    handle: "testowner",
    validateOwnerToken: async () => false,
    onLoginSuccess: () => { loginSuccessCalled = true; },
  });

  assert.strictEqual(outcome.type, "success_link_dispatched");
  assert.strictEqual(loginSuccessCalled, false);
});

await test("B06: payment required (402) and server errors fail closed with clear error outcome", async () => {
  const r402 = await processMagicLinkResponse({
    res: { ok: false, status: 402 },
    data: {},
    handle: "testowner",
    validateOwnerToken: async () => false,
    onLoginSuccess: () => {},
  });
  assert.strictEqual(r402.type, "error");
  assert.strictEqual(r402.message, "Upgrade required for this domain.");

  const r500 = await processMagicLinkResponse({
    res: { ok: false, status: 500 },
    data: { message: "Internal server error" },
    handle: "testowner",
    validateOwnerToken: async () => false,
    onLoginSuccess: () => {},
  });
  assert.strictEqual(r500.type, "error");
  assert.strictEqual(r500.message, "Internal server error");
});

console.log("\n──────────────────────────────────────────────────");
console.log(`Results: ${passed} passed, ${failed} failed\n`);

if (failed > 0) {
  process.exit(1);
}
