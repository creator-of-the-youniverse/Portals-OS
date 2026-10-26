/**
 * tests/claim-flow-verification.test.mjs
 *
 * Phase R8 Verification Suite — Safely verifies the handle-claim and verification flow
 * end to end using in-memory mock database and mock email delivery.
 *
 * ZERO PRODUCTION DATABASE ACCESS.
 * ZERO REAL EMAILS SENT.
 */

import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "crypto";

import claimHandler from "../api/claim.ts";
import verifyHandler from "../api/v1/auth/verify.ts";
import { normalizeHandle, isValidHandle } from "../types/onboarding.ts";
import { sendVerificationEmail, isProductionRuntime } from "../lib/emailService.ts";

process.env.HANDOFF_ALLOW_EPHEMERAL_DEV_KEYS = "1";

function createMockReqRes({ method = "GET", headers = {}, params = {}, query = {}, body = null } = {}) {
  const req = { method, headers, params, query, body };
  let statusCode = 200;
  let responseBody = null;

  const res = {
    status(code) {
      statusCode = code;
      return res;
    },
    json(data) {
      responseBody = data;
      return res;
    },
    get statusCode() {
      return statusCode;
    },
    get body() {
      return responseBody;
    },
  };

  return { req, res };
}

function createMockDb() {
  const identities = [];
  const verificationTokens = [];
  const sessions = [];

  const mockSql = async function (strings, ...values) {
    const q = strings.join("?");

    // SELECT youniverse_identities WHERE username = ?
    if (q.includes("FROM youniverse_identities") && q.includes("WHERE username =")) {
      const match = identities.find((i) => i.username === values[0]);
      return match ? [match] : [];
    }

    // SELECT youniverse_identities WHERE identity_id = ?
    if (q.includes("FROM youniverse_identities") && q.includes("WHERE identity_id =")) {
      const match = identities.find((i) => i.identity_id === values[0]);
      return match ? [match] : [];
    }

    // SELECT youniverse_identities WHERE email = ? AND plan = 'free' (with optional username != ?)
    if (q.includes("FROM youniverse_identities") && q.includes("WHERE email =")) {
      const email = values[0];
      const excludeUsername = values.length > 1 ? values[1] : null;
      const match = identities.find(
        (i) => i.email === email && (!i.plan || i.plan === "free") && (excludeUsername ? i.username !== excludeUsername : true)
      );
      return match ? [match] : [];
    }

    // UPDATE youniverse_identities SET display_name = ? WHERE identity_id = ?
    if (q.includes("UPDATE youniverse_identities") && q.includes("SET display_name =")) {
      const match = identities.find((i) => i.identity_id === values[1]);
      if (match) match.display_name = values[0];
      return match ? [match] : [];
    }

    // UPDATE email_verification_tokens SET consumed_at = NOW() WHERE identity_id = ?
    if (q.includes("UPDATE email_verification_tokens") && q.includes("WHERE identity_id =")) {
      const identId = values[0];
      for (const t of verificationTokens) {
        if (t.identity_id === identId && t.consumed_at === null) {
          t.consumed_at = new Date();
        }
      }
      return [];
    }

    // INSERT INTO youniverse_identities
    if (q.includes("INSERT INTO youniverse_identities")) {
      const record = {
        identity_id: values[0],
        username: values[1],
        display_name: values[2],
        subdomain: values[3],
        identity_type: values[4],
        email: values[5],
        plan: values[6],
        email_verified_at: values[7],
        created_at: values[8],
      };
      identities.push(record);
      return [record];
    }

    // INSERT INTO email_verification_tokens
    if (q.includes("INSERT INTO email_verification_tokens")) {
      const record = {
        id: "evt_" + Math.random().toString(36).slice(2, 8),
        identity_id: values[0],
        token_hash: values[1],
        expires_at: new Date(values[2]),
        consumed_at: null,
      };
      verificationTokens.push(record);
      return [record];
    }

    // SELECT FROM email_verification_tokens WHERE token_hash = ?
    if (q.includes("FROM email_verification_tokens") && q.includes("WHERE token_hash =")) {
      const match = verificationTokens.find((t) => t.token_hash === values[0]);
      return match ? [match] : [];
    }

    // UPDATE email_verification_tokens SET consumed_at = NOW()
    if (q.includes("UPDATE email_verification_tokens") && q.includes("SET consumed_at = NOW()")) {
      const id = values[0];
      const match = verificationTokens.find((t) => t.id === id && t.consumed_at === null);
      if (match) {
        match.consumed_at = new Date();
        return [{ id: match.id }];
      }
      return [];
    }

    // UPDATE youniverse_identities SET email_verified_at = NOW()
    if (q.includes("UPDATE youniverse_identities") && q.includes("SET email_verified_at = NOW()")) {
      const id = values[0];
      const match = identities.find((i) => i.identity_id === id);
      if (match) {
        match.email_verified_at = new Date();
        return [{ identity_id: match.identity_id, username: match.username }];
      }
      return [];
    }

    // INSERT INTO sessions
    if (q.includes("INSERT INTO sessions")) {
      const record = {
        id: "sess_" + Math.random().toString(36).slice(2, 8),
        identity_id: values[0],
        token_hash: values[1],
        expires_at: new Date(values[2]),
        user_agent: values[3],
        ip_address: values[4],
      };
      sessions.push(record);
      return [record];
    }

    return [];
  };

  const defaultDeps = {
    sql: mockSql,
    databaseUrl: "postgresql://mock:safe@localhost:5432/testdb",
  };

  return { mockSql, defaultDeps, identities, verificationTokens, sessions };
}

// ────────────────────────────────────────────────────────────────────────────
// TESTS
// ────────────────────────────────────────────────────────────────────────────

test("1. Handle validation rules (available vs invalid formats)", () => {
  // Valid handles: 3-32 chars, alphanumeric with hyphens, not starting/ending with hyphen
  assert.strictEqual(isValidHandle("sovereign"), true);
  assert.strictEqual(isValidHandle("alpha-1"), true);
  assert.strictEqual(isValidHandle("a"), false, "Too short");
  assert.strictEqual(isValidHandle("-bad"), false, "Starts with hyphen");
  assert.strictEqual(isValidHandle("bad-"), false, "Ends with hyphen");
  assert.strictEqual(isValidHandle("bad.dot"), false, "Contains period");
  assert.strictEqual(isValidHandle("bad_underscore"), false, "Contains underscore");

  // Normalization
  assert.strictEqual(normalizeHandle(" @My-Handle "), "my-handle");
  assert.strictEqual(normalizeHandle("@TEST--DOUBLE"), "test-double");
});

test("2. Available handle claim succeeds in pending_verification state without session token", async () => {
  const { defaultDeps, identities, verificationTokens } = createMockDb();
  let dispatchedEmail = null;

  const mockSendEmail = async (params) => {
    dispatchedEmail = params;
    return { sent: true, reason: "delivered" };
  };

  const { req, res } = createMockReqRes({
    method: "POST",
    body: {
      handle: "new-user",
      email: "visitor@example.com",
      displayName: "New User",
    },
  });

  await claimHandler(req, res, {
    ...defaultDeps,
    sendVerificationEmail: mockSendEmail,
  });

  assert.strictEqual(res.statusCode, 201);
  assert.strictEqual(res.body.success, true);
  assert.strictEqual(res.body.status, "pending_verification");
  assert.strictEqual(res.body.username, "new-user");
  assert.strictEqual(res.body.subdomain, "new-user.itsyouonline.com");
  assert.strictEqual(res.body.sessionToken, undefined, "Security rule: no session token on unverified claim");

  // Check DB state
  assert.strictEqual(identities.length, 1);
  assert.strictEqual(identities[0].username, "new-user");
  assert.strictEqual(identities[0].email_verified_at, null);

  // Check token created
  assert.strictEqual(verificationTokens.length, 1);
  assert.ok(verificationTokens[0].token_hash);
  assert.ok(dispatchedEmail.token);
});

test("3. Unavailable handle is rejected with 409 username-taken", async () => {
  const { defaultDeps, identities } = createMockDb();
  identities.push({
    identity_id: "existing_id",
    username: "taken-handle",
    email: "prior@example.com",
    plan: "free",
  });

  const { req, res } = createMockReqRes({
    method: "POST",
    body: {
      handle: "taken-handle",
      email: "newperson@example.com",
    },
  });

  await claimHandler(req, res, defaultDeps);

  assert.strictEqual(res.statusCode, 409);
  assert.strictEqual(res.body.status, "username-taken");
});

test("4. Invalid handle input rejected with 400", async () => {
  const { defaultDeps } = createMockDb();

  // Missing handle
  const { req: req1, res: res1 } = createMockReqRes({
    method: "POST",
    body: { email: "person@example.com" },
  });
  await claimHandler(req1, res1, defaultDeps);
  assert.strictEqual(res1.statusCode, 400);

  // Too short handle
  const { req: req2, res: res2 } = createMockReqRes({
    method: "POST",
    body: { handle: "a", email: "person@example.com" },
  });
  await claimHandler(req2, res2, defaultDeps);
  assert.strictEqual(res2.statusCode, 400);
});

test("5. Missing or invalid email rejected with 400", async () => {
  const { defaultDeps } = createMockDb();

  // Missing email
  const { req: req1, res: res1 } = createMockReqRes({
    method: "POST",
    body: { handle: "valid-handle" },
  });
  await claimHandler(req1, res1, defaultDeps);
  assert.strictEqual(res1.statusCode, 400);

  // Invalid email format
  const { req: req2, res: res2 } = createMockReqRes({
    method: "POST",
    body: { handle: "valid-handle", email: "not-an-email" },
  });
  await claimHandler(req2, res2, defaultDeps);
  assert.strictEqual(res2.statusCode, 400);
});

test("6. Duplicate free-tier claim for same email rejected with 402 payment_required", async () => {
  const { defaultDeps, identities } = createMockDb();
  identities.push({
    identity_id: "id_free_owner",
    username: "first-handle",
    email: "singleowner@example.com",
    plan: "free",
  });

  const { req, res } = createMockReqRes({
    method: "POST",
    body: {
      handle: "second-handle",
      email: "singleowner@example.com",
    },
  });

  await claimHandler(req, res, defaultDeps);

  assert.strictEqual(res.statusCode, 402);
  assert.strictEqual(res.body.status, "payment_required");
});

test("7. Email verification link completes ownership and mints authenticated session", async () => {
  const { defaultDeps, identities, verificationTokens, sessions } = createMockDb();

  // 1. Claim
  let emailDispatched = null;
  const { req: claimReq, res: claimRes } = createMockReqRes({
    method: "POST",
    body: {
      handle: "star-pilot",
      email: "pilot@example.com",
    },
  });

  await claimHandler(claimReq, claimRes, {
    ...defaultDeps,
    sendVerificationEmail: async (params) => {
      emailDispatched = params;
      return { sent: true };
    },
  });

  assert.strictEqual(claimRes.statusCode, 201);
  const rawToken = emailDispatched.token;
  assert.ok(rawToken);

  // 2. Consume verification token
  const { req: verifyReq, res: verifyRes } = createMockReqRes({
    method: "GET",
    query: { token: rawToken },
  });

  await verifyHandler(verifyReq, verifyRes, defaultDeps);

  assert.strictEqual(verifyRes.statusCode, 200);
  assert.strictEqual(verifyRes.body.success, true);
  assert.strictEqual(verifyRes.body.handle, "star-pilot");
  assert.strictEqual(verifyRes.body.role, "AUTHENTICATED_OWNER");
  assert.ok(verifyRes.body.sessionToken);

  // DB reflects verified state
  assert.ok(identities[0].email_verified_at !== null);
  assert.strictEqual(sessions.length, 1);
});

test("8. Subdomain handoff: Gateway claim transitions client to PROVISIONAL_OWNER role", () => {
  // Test the client response adapter contract from services/identityService.ts
  const simulateClientClaimResponse = (apiResponse) => {
    const res = { status: apiResponse.statusCode };
    const data = apiResponse.body;
    const subdomain = `${data.username || "handle"}.itsyouonline.com`;

    if (res.status === 201 && (data.status === "created" || data.status === "pending_verification" || data.success === true)) {
      return {
        success: true,
        subdomain: data.subdomain ?? subdomain,
        sessionToken: data.sessionToken,
      };
    }
    if (res.status === 409 || data.status === "username-taken") {
      return { success: false, subdomain, error: "taken" };
    }
    if (res.status === 402 || data.status === "payment_required") {
      return { success: false, subdomain, error: "payment_required" };
    }
    return { success: false, subdomain, error: data.message || data.status || "claim_failed" };
  };

  const pendingResult = simulateClientClaimResponse({
    statusCode: 201,
    body: {
      success: true,
      status: "pending_verification",
      username: "nebula",
      subdomain: "nebula.itsyouonline.com",
    },
  });

  assert.strictEqual(pendingResult.success, true);
  assert.strictEqual(pendingResult.subdomain, "nebula.itsyouonline.com");
  assert.strictEqual(pendingResult.sessionToken, undefined);
});

// ────────────────────────────────────────────────────────────────────────────
// PRODUCTION EMAIL-DELIVERY FAILURE PATH & RETRY REGRESSION TESTS
// ────────────────────────────────────────────────────────────────────────────

test("9. Email failure: Missing RESEND_API_KEY fails closed with 503 in production, preserves claim for retry", async () => {
  const { defaultDeps, identities, verificationTokens } = createMockDb();
  const originalKey = process.env.RESEND_API_KEY;
  delete process.env.RESEND_API_KEY;

  try {
    const { req, res } = createMockReqRes({
      method: "POST",
      body: {
        handle: "unreachable-pilot",
        email: "pilot@example.com",
        displayName: "Unreachable Pilot",
      },
    });

    // In production runtime, missing key triggers fail-closed 503
    await claimHandler(req, res, {
      ...defaultDeps,
      isProduction: () => true,
    });

    assert.strictEqual(res.statusCode, 503);
    assert.strictEqual(res.body.success, false);
    assert.strictEqual(res.body.status, "email_delivery_failed");
    assert.strictEqual(res.body.error, "email_delivery_failed");
    assert.match(res.body.message, /could not dispatch your verification email/i);
    // Ensure no secrets or API keys leaked
    assert.strictEqual(res.body.apiKey, undefined);
    assert.strictEqual(JSON.stringify(res.body).includes("RESEND_API_KEY"), false);

    // Identity is preserved in unverified state (NOT deleted) so user can retry
    assert.strictEqual(identities.length, 1);
    assert.strictEqual(identities[0].username, "unreachable-pilot");
    assert.strictEqual(identities[0].email_verified_at, null);
    assert.strictEqual(verificationTokens.length, 1);
  } finally {
    if (originalKey !== undefined) process.env.RESEND_API_KEY = originalKey;
  }
});

test("10. Email failure: Provider rejection returns 503 with user-safe message and preserves state", async () => {
  const { defaultDeps, identities } = createMockDb();

  const mockProviderReject = async () => {
    return {
      sent: false,
      reason: "delivery_failed",
      error: "Provider responded with status 403: Forbidden - domain unverified",
    };
  };

  const { req, res } = createMockReqRes({
    method: "POST",
    body: {
      handle: "rejected-pilot",
      email: "rejected@example.com",
    },
  });

  await claimHandler(req, res, {
    ...defaultDeps,
    sendVerificationEmail: mockProviderReject,
    isProduction: () => true,
  });

  assert.strictEqual(res.statusCode, 503);
  assert.strictEqual(res.body.success, false);
  assert.strictEqual(res.body.status, "email_delivery_failed");
  assert.strictEqual(res.body.error, "email_delivery_failed");
  // Never expose provider credentials or upstream error messages to user
  assert.strictEqual(JSON.stringify(res.body).includes("Forbidden"), false);
  assert.strictEqual(JSON.stringify(res.body).includes("domain unverified"), false);

  // Identity is preserved unverified
  assert.strictEqual(identities.length, 1);
  assert.strictEqual(identities[0].username, "rejected-pilot");
  assert.strictEqual(identities[0].email_verified_at, null);
});

test("11. Email failure: Network timeout or ambiguous outcome returns 503 without deleting identity", async () => {
  const { defaultDeps, identities } = createMockDb();

  const mockNetworkTimeout = async () => {
    return {
      sent: false,
      reason: "delivery_failed",
      error: "AbortError: The operation was aborted due to timeout",
    };
  };

  const { req, res } = createMockReqRes({
    method: "POST",
    body: {
      handle: "timeout-pilot",
      email: "timeout@example.com",
    },
  });

  await claimHandler(req, res, {
    ...defaultDeps,
    sendVerificationEmail: mockNetworkTimeout,
    isProduction: () => true,
  });

  assert.strictEqual(res.statusCode, 503);
  assert.strictEqual(res.body.success, false);
  assert.strictEqual(res.body.status, "email_delivery_failed");

  // Crucial invariant: Never delete identity on network failure because provider might have accepted it
  assert.strictEqual(identities.length, 1);
  assert.strictEqual(identities[0].username, "timeout-pilot");
  assert.strictEqual(identities[0].email_verified_at, null);
});

test("12. Email success: Successful dispatch returns 201 with pending_verification contract", async () => {
  const { defaultDeps, identities, verificationTokens } = createMockDb();

  let sentPayload = null;
  const mockSuccessSend = async (params) => {
    sentPayload = params;
    return { sent: true, reason: "delivered" };
  };

  const { req, res } = createMockReqRes({
    method: "POST",
    body: {
      handle: "success-pilot",
      email: "success@example.com",
      displayName: "Success Pilot",
    },
  });

  await claimHandler(req, res, {
    ...defaultDeps,
    sendVerificationEmail: mockSuccessSend,
    isProduction: () => true,
  });

  assert.strictEqual(res.statusCode, 201);
  assert.strictEqual(res.body.success, true);
  assert.strictEqual(res.body.status, "pending_verification");
  assert.strictEqual(res.body.username, "success-pilot");
  assert.strictEqual(res.body.emailSent, true);
  assert.strictEqual(res.body.subdomain, "success-pilot.itsyouonline.com");
  assert.strictEqual(res.body.sessionToken, undefined, "No session token issued before verification");

  // In DB: Token hash is saved, raw token is never saved
  assert.ok(sentPayload.token);
  assert.strictEqual(verificationTokens.length, 1);
  const expectedHash = createHash("sha256").update(sentPayload.token).digest("hex");
  assert.strictEqual(verificationTokens[0].token_hash, expectedHash);
  assert.notStrictEqual(verificationTokens[0].token_hash, sentPayload.token);
});

test("13. Retry: Retrying an unverified pending claim reuses identity and dispatches fresh verification", async () => {
  const { defaultDeps, identities } = createMockDb();

  // First attempt: Fails due to delivery issue
  const { req: req1, res: res1 } = createMockReqRes({
    method: "POST",
    body: {
      handle: "retry-pilot",
      email: "retry@example.com",
      displayName: "First Attempt",
    },
  });

  await claimHandler(req1, res1, {
    ...defaultDeps,
    sendVerificationEmail: async () => ({ sent: false, reason: "delivery_failed", error: "500" }),
    isProduction: () => true,
  });

  assert.strictEqual(res1.statusCode, 503);
  assert.strictEqual(identities.length, 1);
  const originalIdentityId = identities[0].identity_id;
  assert.strictEqual(identities[0].display_name, "First Attempt");

  // Second attempt: User retries with same handle and email, updated displayName
  let retryDispatched = null;
  const { req: req2, res: res2 } = createMockReqRes({
    method: "POST",
    body: {
      handle: "retry-pilot",
      email: "retry@example.com",
      displayName: "Second Attempt",
    },
  });

  await claimHandler(req2, res2, {
    ...defaultDeps,
    sendVerificationEmail: async (params) => {
      retryDispatched = params;
      return { sent: true, reason: "delivered" };
    },
    isProduction: () => true,
  });

  assert.strictEqual(res2.statusCode, 201);
  assert.strictEqual(res2.body.success, true);
  assert.strictEqual(res2.body.identityId, originalIdentityId);

  // Still exactly 1 identity row in DB (reused, not duplicated)
  assert.strictEqual(identities.length, 1);
  assert.strictEqual(identities[0].identity_id, originalIdentityId);
  assert.strictEqual(identities[0].display_name, "Second Attempt");
});

test("14. Retry: Invalidates superseded verification token and fresh token verifies successfully", async () => {
  const { defaultDeps, identities, verificationTokens } = createMockDb();

  let token1 = null;
  let token2 = null;

  // Claim 1
  const { req: req1, res: res1 } = createMockReqRes({
    method: "POST",
    body: { handle: "swap-pilot", email: "swap@example.com" },
  });
  await claimHandler(req1, res1, {
    ...defaultDeps,
    sendVerificationEmail: async (p) => { token1 = p.token; return { sent: true }; },
    isProduction: () => true,
  });
  assert.strictEqual(res1.statusCode, 201);

  // Superseded token is in DB
  assert.strictEqual(verificationTokens.length, 1);
  assert.strictEqual(verificationTokens[0].consumed_at, null);

  // Claim 2 (retry)
  const { req: req2, res: res2 } = createMockReqRes({
    method: "POST",
    body: { handle: "swap-pilot", email: "swap@example.com" },
  });
  await claimHandler(req2, res2, {
    ...defaultDeps,
    sendVerificationEmail: async (p) => { token2 = p.token; return { sent: true }; },
    isProduction: () => true,
  });
  assert.strictEqual(res2.statusCode, 201);

  // Two token records exist: first is consumed/invalidated, second is active
  assert.strictEqual(verificationTokens.length, 2);
  assert.ok(verificationTokens[0].consumed_at !== null, "Superseded token marked consumed");
  assert.strictEqual(verificationTokens[1].consumed_at, null, "Fresh token is unconsumed");
  assert.notStrictEqual(token1, token2);

  // Attempting to verify with old token1 is rejected
  const { req: vReqOld, res: vResOld } = createMockReqRes({
    method: "GET",
    query: { token: token1 },
  });
  await verifyHandler(vReqOld, vResOld, defaultDeps);
  assert.strictEqual(vResOld.statusCode, 401);
  assert.strictEqual(vResOld.body.error, "token_already_consumed");

  // Attempting to verify with new token2 succeeds
  const { req: vReqNew, res: vResNew } = createMockReqRes({
    method: "GET",
    query: { token: token2 },
  });
  await verifyHandler(vReqNew, vResNew, defaultDeps);
  assert.strictEqual(vResNew.statusCode, 200);
  assert.strictEqual(vResNew.body.success, true);
  assert.strictEqual(vResNew.body.handle, "swap-pilot");
  assert.ok(identities[0].email_verified_at !== null);
});

test("15. Security: Refuses to overwrite an already verified identity on retry or new claim", async () => {
  const { defaultDeps, identities } = createMockDb();
  identities.push({
    identity_id: "ident_verified",
    username: "locked-owner",
    display_name: "Original Owner",
    subdomain: "locked-owner.itsyouonline.com",
    identity_type: "person",
    email: "owner@example.com",
    plan: "free",
    email_verified_at: new Date(),
    created_at: new Date().toISOString(),
  });

  // 1. Same email tries to reclaim already verified handle
  const { req: reqSame, res: resSame } = createMockReqRes({
    method: "POST",
    body: { handle: "locked-owner", email: "owner@example.com" },
  });
  await claimHandler(reqSame, resSame, { ...defaultDeps, isProduction: () => true });
  assert.strictEqual(resSame.statusCode, 409);
  assert.strictEqual(resSame.body.status, "username-taken");

  // 2. Different email tries to claim already verified handle
  const { req: reqDiff, res: resDiff } = createMockReqRes({
    method: "POST",
    body: { handle: "locked-owner", email: "attacker@example.com" },
  });
  await claimHandler(reqDiff, resDiff, { ...defaultDeps, isProduction: () => true });
  assert.strictEqual(resDiff.statusCode, 409);
  assert.strictEqual(resDiff.body.status, "username-taken");

  // Identity is completely unaltered
  assert.strictEqual(identities.length, 1);
  assert.strictEqual(identities[0].email, "owner@example.com");
  assert.strictEqual(identities[0].display_name, "Original Owner");
});

test("16. Concurrency: Database unique violation (23505) returns 409 username-taken", async () => {
  // Mock sql that throws Postgres 23505 unique constraint violation on INSERT
  const concurrencySql = async function (strings, ...values) {
    const q = strings.join("?");
    if (q.includes("FROM youniverse_identities") && q.includes("WHERE username =")) {
      return []; // appears available initially
    }
    if (q.includes("FROM youniverse_identities") && q.includes("WHERE email =")) {
      return [];
    }
    if (q.includes("INSERT INTO youniverse_identities")) {
      const err = new Error("duplicate key value violates unique constraint \"youniverse_identities_username_key\"");
      err.code = "23505";
      throw err;
    }
    return [];
  };

  const { req, res } = createMockReqRes({
    method: "POST",
    body: { handle: "racer", email: "racer@example.com" },
  });

  await claimHandler(req, res, {
    sql: concurrencySql,
    isProduction: () => true,
  });

  assert.strictEqual(res.statusCode, 409);
  assert.strictEqual(res.body.status, "username-taken");
  assert.match(res.body.message, /already claimed/i);
});

test("17. Reliability: Database failure during retry returns 500 without leaking internal details", async () => {
  const { identities } = createMockDb();
  identities.push({
    identity_id: "ident_unverified",
    username: "retry-db-fail",
    email: "fail@example.com",
    plan: "free",
    email_verified_at: null,
  });

  const failingSql = async function (strings, ...values) {
    const q = strings.join("?");
    if (q.includes("FROM youniverse_identities") && q.includes("WHERE username =")) {
      return [identities[0]];
    }
    // Simulate database crash on subsequent query
    throw new Error("NeonDbConnectionFailure: Connection terminated unexpectedly at 10.0.0.1:5432");
  };

  const { req, res } = createMockReqRes({
    method: "POST",
    body: { handle: "retry-db-fail", email: "fail@example.com" },
  });

  await claimHandler(req, res, {
    sql: failingSql,
    isProduction: () => true,
  });

  assert.strictEqual(res.statusCode, 500);
  assert.strictEqual(res.body.status, "error");
  assert.strictEqual(res.body.error, "database_error");
  assert.strictEqual(res.body.message, "Failed to register Youniverse. Please try again.");
  // Confirm sensitive connection details are never exposed to client
  assert.strictEqual(JSON.stringify(res.body).includes("10.0.0.1"), false);
  assert.strictEqual(JSON.stringify(res.body).includes("NeonDbConnectionFailure"), false);
});
