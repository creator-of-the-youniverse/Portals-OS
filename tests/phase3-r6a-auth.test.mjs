/**
 * tests/phase3-r6a-auth.test.mjs
 *
 * Phase R6A Test Suite — Validates Secure Onboarding and Auth Compatibility:
 *  1. Claim creates a pending, unverified identity without issuing a session token.
 *  2. Ordinary session tokens cannot verify email.
 *  3. Invalid, expired, reused, and forged verification tokens fail closed.
 *  4. Successful verification is single-use, marks email verified atomically, and mints owner session.
 *  5. Pending identities cannot access owner-only endpoints.
 *  6. Valid verified Neon sessions can use authorized NotNotes and Weaver operations.
 *  7. Cross-tenant access is denied.
 *  8. Existing legacy JWT consumers still behave correctly.
 *  9. Local Express and Vercel public-profile handlers agree on the contract.
 * 10. Missing production email configuration fails safely.
 */

import assert from "node:assert/strict";
import test from "node:test";
import { createHash, randomBytes } from "crypto";
import jwt from "jsonwebtoken";

import claimHandler from "../api/claim.ts";
import verifyHandler from "../api/v1/auth/verify.ts";
import contextHandler from "../api/youniverse/[handle]/context.ts";
import publicHandler from "../api/youniverse/[handle]/public.ts";
import { getYouniversePublicDataHandler } from "../controllers/youniversePublicController.js";
import { verifyJwt } from "../middleware/verifyJwt.js";
import { saveWeaverArtifactHandler, getWeavedWidgetsHandler } from "../controllers/notNotesController.js";
import vercelArtifactHandler from "../api/not-notes/artifact.ts";
import vercelWidgetsHandler from "../api/not-notes/widgets.ts";
import {
  sendVerificationEmail,
  isEmailDeliveryConfigured,
  resolveSenderAddress,
  DEFAULT_EMAIL_FROM,
} from "../lib/emailService.ts";
import { createVerificationToken, consumeVerificationToken } from "../lib/emailVerification.ts";

process.env.HANDOFF_ALLOW_EPHEMERAL_DEV_KEYS = "1";

function hashToken(raw) {
  return createHash("sha256").update(raw, "utf8").digest("hex");
}

function createMockReqRes({ method = "GET", headers = {}, params = {}, query = {}, body = null } = {}) {
  const req = { method, headers, params, query, body };
  let statusCode = 200;
  let responseBody = null;
  const responseHeaders = {};

  const res = {
    setHeader(k, v) {
      responseHeaders[k] = v;
      return res;
    },
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
    get headers() {
      return responseHeaders;
    },
  };

  return { req, res };
}

function createMockSqlDb({
  identities = [],
  sessions = [],
  verificationTokens = [],
  notNotes = [],
} = {}) {
  return async function mockSql(strings, ...values) {
    const q = strings.join("?");

    // ── youniverse_identities ──────────────────────────────────
    if (q.includes("FROM youniverse_identities") && q.includes("WHERE username =")) {
      const match = identities.find((i) => i.username === values[0]);
      return match ? [match] : [];
    }

    if (q.includes("FROM youniverse_identities") && q.includes("WHERE email =")) {
      const match = identities.find((i) => i.email === values[0] && i.plan === values[1]);
      return match ? [match] : [];
    }

    if (q.includes("FROM youniverse_identities") && q.includes("WHERE identity_id =")) {
      const match = identities.find((i) => i.identity_id === values[0]);
      return match ? [match] : [];
    }

    if (q.includes("INSERT INTO youniverse_identities")) {
      const newIdentity = {
        identity_id: values[0],
        username: values[1],
        display_name: values[2],
        subdomain: values[3],
        identity_type: values[4],
        email: values[5],
        plan: values[6],
        email_verified_at: values[7],
        created_at: values[8],
        is_live: true,
      };
      identities.push(newIdentity);
      return [newIdentity];
    }

    if (q.includes("UPDATE youniverse_identities") && q.includes("SET email_verified_at = NOW()")) {
      const id = values[0];
      const match = identities.find((i) => i.identity_id === id);
      if (match) {
        match.email_verified_at = new Date();
      }
      return match ? [match] : [];
    }

    // ── email_verification_tokens ──────────────────────────────
    if (q.includes("INSERT INTO email_verification_tokens")) {
      const record = {
        id: "evt_" + Math.random().toString(36).substring(2, 9),
        identity_id: values[0],
        token_hash: values[1],
        expires_at: new Date(values[2]),
        consumed_at: null,
      };
      verificationTokens.push(record);
      return [record];
    }

    if (q.includes("FROM email_verification_tokens") && q.includes("WHERE token_hash =")) {
      const match = verificationTokens.find((t) => t.token_hash === values[0]);
      return match ? [match] : [];
    }

    if (q.includes("UPDATE email_verification_tokens") && q.includes("SET consumed_at = NOW()")) {
      const id = values[0];
      const match = verificationTokens.find((t) => t.id === id && t.consumed_at === null);
      if (match) {
        match.consumed_at = new Date();
        return [{ id: match.id }];
      }
      return [];
    }

    // ── sessions ───────────────────────────────────────────────
    if (q.includes("INSERT INTO sessions")) {
      const record = {
        id: "sess_" + Math.random().toString(36).substring(2, 9),
        identity_id: values[0],
        token_hash: values[1],
        expires_at: new Date(values[2]),
        user_agent: values[3],
        ip_address: values[4],
        revoked_at: null,
      };
      sessions.push(record);
      return [record];
    }

    if (q.includes("FROM sessions") && q.includes("JOIN youniverse_identities")) {
      const hash = values[0];
      const sess = sessions.find((s) => s.token_hash === hash);
      if (!sess) return [];
      const ident = identities.find((i) => i.identity_id === sess.identity_id);
      if (!ident) return [];
      return [
        {
          session_id: sess.id,
          identity_id: sess.identity_id,
          expires_at: sess.expires_at,
          revoked_at: sess.revoked_at,
          username: ident.username,
          plan: ident.plan,
          is_live: ident.is_live,
          email_verified_at: ident.email_verified_at,
        },
      ];
    }

    if (q.includes("FROM sessions") && q.includes("WHERE token_hash =")) {
      const hash = values[0];
      const match = sessions.find((s) => s.token_hash === hash);
      return match ? [match] : [];
    }

    // ── NotNote ────────────────────────────────────────────────
    if (q.includes("INSERT INTO \"NotNote\"")) {
      const note = {
        id: values[0],
        youniverseId: values[1],
        title: values[2],
        content: typeof values[3] === "string" ? JSON.parse(values[3]) : values[3],
        status: values[4] || "APPROVED",
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      notNotes.push(note);
      return [note];
    }

    if (q.includes("FROM \"NotNote\"") && q.includes("WHERE \"youniverseId\" =")) {
      const youniverseId = values[0];
      const matches = notNotes.filter((n) => n.youniverseId === youniverseId && n.status === "APPROVED");
      return matches;
    }

    // Fallback ignore for User / Youniverse compatibility statements
    return [];
  };
}

// ============================================================================
// TESTS
// ============================================================================

test("R6A-01: Claim creates a pending, unverified identity without returning a session token", async () => {
  const identities = [];
  const verificationTokens = [];
  const mockSql = createMockSqlDb({ identities, verificationTokens });

  let emailSentParams = null;
  const mockSendEmail = async (params) => {
    emailSentParams = params;
    return { sent: true, reason: "delivered" };
  };

  const { req, res } = createMockReqRes({
    method: "POST",
    body: {
      handle: "newstar",
      email: "star@example.com",
      displayName: "New Star",
    },
  });

  await claimHandler(req, res, {
    sql: mockSql,
    sendVerificationEmail: mockSendEmail,
  });

  assert.strictEqual(res.statusCode, 201);
  assert.strictEqual(res.body.success, true);
  assert.strictEqual(res.body.status, "pending_verification");
  assert.strictEqual(res.body.username, "newstar");
  assert.strictEqual(res.body.sessionToken, undefined, "CRITICAL: sessionToken must not be returned on claim");

  // Verify DB state
  assert.strictEqual(identities.length, 1);
  assert.strictEqual(identities[0].username, "newstar");
  assert.strictEqual(identities[0].email_verified_at, null, "Identity must be unverified");

  // Verify verification token created
  assert.strictEqual(verificationTokens.length, 1);
  assert.strictEqual(verificationTokens[0].identity_id, identities[0].identity_id);
  assert.ok(verificationTokens[0].token_hash);

  // Verify email dispatch received raw token
  assert.ok(emailSentParams);
  assert.strictEqual(emailSentParams.email, "star@example.com");
  assert.ok(typeof emailSentParams.token === "string" && emailSentParams.token.length >= 32);
});

test("R6A-02: Ordinary session tokens cannot verify email", async () => {
  const sessionToken = randomBytes(24).toString("hex");
  const sessionHash = hashToken(sessionToken);

  const mockSql = createMockSqlDb({
    identities: [
      {
        identity_id: "id_alice",
        username: "alice",
        email: "alice@example.com",
        email_verified_at: null,
        is_live: true,
      },
    ],
    sessions: [
      {
        id: "sess_1",
        identity_id: "id_alice",
        token_hash: sessionHash,
        expires_at: new Date(Date.now() + 100000),
        revoked_at: null,
      },
    ],
    verificationTokens: [], // session token is NOT in email_verification_tokens
  });

  const { req, res } = createMockReqRes({
    method: "GET",
    query: { token: sessionToken },
  });

  await verifyHandler(req, res, { sql: mockSql });

  assert.strictEqual(res.statusCode, 401);
  assert.strictEqual(res.body.success, false);
  assert.strictEqual(res.body.error, "invalid_token");
});

test("R6A-03: Invalid, expired, reused, and forged verification tokens fail closed", async () => {
  const validToken = randomBytes(32).toString("hex");
  const validHash = hashToken(validToken);

  const expiredToken = randomBytes(32).toString("hex");
  const expiredHash = hashToken(expiredToken);

  const consumedToken = randomBytes(32).toString("hex");
  const consumedHash = hashToken(consumedToken);

  const mockSql = createMockSqlDb({
    identities: [
      {
        identity_id: "id_bob",
        username: "bob",
        email: "bob@example.com",
        email_verified_at: null,
        is_live: true,
      },
    ],
    verificationTokens: [
      {
        id: "evt_valid",
        identity_id: "id_bob",
        token_hash: validHash,
        expires_at: new Date(Date.now() + 86400000),
        consumed_at: null,
      },
      {
        id: "evt_expired",
        identity_id: "id_bob",
        token_hash: expiredHash,
        expires_at: new Date(Date.now() - 1000), // expired
        consumed_at: null,
      },
      {
        id: "evt_consumed",
        identity_id: "id_bob",
        token_hash: consumedHash,
        expires_at: new Date(Date.now() + 86400000),
        consumed_at: new Date(Date.now() - 5000), // already consumed
      },
    ],
  });

  // Forged token
  const forged = createMockReqRes({ method: "GET", query: { token: "forged_random_string_12345" } });
  await verifyHandler(forged.req, forged.res, { sql: mockSql });
  assert.strictEqual(forged.res.statusCode, 401);
  assert.strictEqual(forged.res.body.error, "invalid_token");

  // Missing token
  const missing = createMockReqRes({ method: "GET", query: {} });
  await verifyHandler(missing.req, missing.res, { sql: mockSql });
  assert.strictEqual(missing.res.statusCode, 400);

  // Expired token
  const expired = createMockReqRes({ method: "GET", query: { token: expiredToken } });
  await verifyHandler(expired.req, expired.res, { sql: mockSql });
  assert.strictEqual(expired.res.statusCode, 401);
  assert.strictEqual(expired.res.body.error, "token_expired");

  // Already consumed token
  const consumed = createMockReqRes({ method: "GET", query: { token: consumedToken } });
  await verifyHandler(consumed.req, consumed.res, { sql: mockSql });
  assert.strictEqual(consumed.res.statusCode, 401);
  assert.strictEqual(consumed.res.body.error, "token_already_consumed");
});

test("R6A-04: Successful verification is single-use, marks email verified, and mints owner session", async () => {
  const token = randomBytes(32).toString("hex");
  const tokenHash = hashToken(token);

  const identities = [
    {
      identity_id: "id_charlie",
      username: "charlie",
      email: "charlie@example.com",
      email_verified_at: null,
      is_live: true,
    },
  ];
  const verificationTokens = [
    {
      id: "evt_charlie",
      identity_id: "id_charlie",
      token_hash: tokenHash,
      expires_at: new Date(Date.now() + 86400000),
      consumed_at: null,
    },
  ];
  const sessions = [];

  const mockSql = createMockSqlDb({ identities, verificationTokens, sessions });

  // 1. First verification attempt: succeeds
  const first = createMockReqRes({ method: "GET", query: { token } });
  await verifyHandler(first.req, first.res, { sql: mockSql });

  assert.strictEqual(first.res.statusCode, 200);
  assert.strictEqual(first.res.body.success, true);
  assert.strictEqual(first.res.body.role, "AUTHENTICATED_OWNER");
  assert.strictEqual(first.res.body.handle, "charlie");
  assert.ok(typeof first.res.body.sessionToken === "string" && first.res.body.sessionToken.length >= 32);

  // Verify identity is now verified
  assert.ok(identities[0].email_verified_at !== null);

  // Verify session created in DB
  assert.strictEqual(sessions.length, 1);
  assert.strictEqual(sessions[0].identity_id, "id_charlie");

  // 2. Second verification attempt with same token: rejected (single-use)
  const second = createMockReqRes({ method: "GET", query: { token } });
  await verifyHandler(second.req, second.res, { sql: mockSql });

  assert.strictEqual(second.res.statusCode, 401);
  assert.strictEqual(second.res.body.error, "token_already_consumed");
});

test("R6A-05: Pending identities cannot access owner-only endpoints", async () => {
  const rawSessionToken = randomBytes(24).toString("hex");
  const sessionHash = hashToken(rawSessionToken);

  const mockSql = createMockSqlDb({
    identities: [
      {
        identity_id: "id_pending",
        username: "pendinguser",
        email: "pending@example.com",
        email_verified_at: null, // PENDING
        is_live: true,
        plan: "free",
      },
    ],
    sessions: [
      {
        id: "sess_pending",
        identity_id: "id_pending",
        token_hash: sessionHash,
        expires_at: new Date(Date.now() + 100000),
        revoked_at: null,
      },
    ],
  });

  // 1. Owner context check denies owner access
  const ctx = createMockReqRes({
    headers: { authorization: `Bearer ${rawSessionToken}` },
    params: { handle: "pendinguser" },
  });
  await contextHandler(ctx.req, ctx.res, { sql: mockSql, databaseUrl: "mock://url" });

  assert.strictEqual(ctx.res.statusCode, 403);
  assert.strictEqual(ctx.res.body.isOwner, false);
  assert.strictEqual(ctx.res.body.error, "email_not_verified");

  // 2. verifyJwt middleware blocks pending identity from protected endpoints
  const mwReq = { headers: { authorization: `Bearer ${rawSessionToken}` } };
  let mwStatus = 200;
  let mwBody = null;
  const mwRes = {
    status(c) { mwStatus = c; return mwRes; },
    json(b) { mwBody = b; return mwRes; },
  };
  let nextCalled = false;

  await verifyJwt(mwReq, mwRes, () => { nextCalled = true; }, { sql: mockSql });

  assert.strictEqual(nextCalled, false);
  assert.strictEqual(mwStatus, 403);
  assert.strictEqual(mwBody.error, "email_not_verified");
});

test("R6A-06: Valid verified Neon sessions can use authorized NotNotes operations", async () => {
  const verifiedToken = randomBytes(24).toString("hex");
  const tokenHash = hashToken(verifiedToken);
  const identityId = "id_verified_owner";

  const notNotes = [];
  const mockSql = createMockSqlDb({
    identities: [
      {
        identity_id: identityId,
        username: "verifiedowner",
        email: "owner@example.com",
        email_verified_at: new Date(), // VERIFIED
        is_live: true,
        plan: "free",
      },
    ],
    sessions: [
      {
        id: "sess_owner",
        identity_id: identityId,
        token_hash: tokenHash,
        expires_at: new Date(Date.now() + 100000),
        revoked_at: null,
      },
    ],
    notNotes,
  });

  // 1. verifyJwt successfully passes and populates req.user
  const req = {
    headers: { authorization: `Bearer ${verifiedToken}` },
    body: {
      title: "WeatherWidget",
      code: "export default () => <div>Sunny</div>",
      dependencies: ["lucide-react"],
    },
  };
  let nextCalled = false;
  const { res } = createMockReqRes();

  await verifyJwt(req, res, () => { nextCalled = true; }, { sql: mockSql });
  assert.strictEqual(nextCalled, true);
  assert.strictEqual(req.user.youniverseId, identityId);
  assert.strictEqual(req.user.handle, "verifiedowner");

  // 2. Save artifact
  const saveRes = createMockReqRes().res;
  await saveWeaverArtifactHandler(req, saveRes, { sql: mockSql });
  assert.strictEqual(saveRes.statusCode, 200);
  assert.strictEqual(saveRes.body.success, true);
  assert.strictEqual(saveRes.body.artifact.title, "WeatherWidget");

  // 3. Get widgets
  const getReq = { user: req.user };
  const getRes = createMockReqRes().res;
  await getWeavedWidgetsHandler(getReq, getRes, { sql: mockSql });
  assert.strictEqual(getRes.statusCode, 200);
  assert.strictEqual(getRes.body.widgets.length, 1);
  assert.strictEqual(getRes.body.widgets[0].title, "WeatherWidget");
});

test("R6A-07: Cross-tenant access is denied for owner context and NotNotes", async () => {
  const tokenA = randomBytes(24).toString("hex");
  const hashA = hashToken(tokenA);

  const notNotes = [
    {
      id: "note_b",
      youniverseId: "tenant_B",
      title: "SecretWidgetB",
      content: { type: "REACT_WIDGET", code: "export default () => <div>B</div>" },
      status: "APPROVED",
    },
  ];

  const mockSql = createMockSqlDb({
    identities: [
      { identity_id: "tenant_A", username: "user-a", email: "a@test.com", email_verified_at: new Date(), is_live: true },
      { identity_id: "tenant_B", username: "user-b", email: "b@test.com", email_verified_at: new Date(), is_live: true },
    ],
    sessions: [
      { id: "s_a", identity_id: "tenant_A", token_hash: hashA, expires_at: new Date(Date.now() + 100000), revoked_at: null },
    ],
    notNotes,
  });

  // User A requests User B's context -> isOwner: false
  const ctx = createMockReqRes({
    headers: { authorization: `Bearer ${tokenA}` },
    params: { handle: "user-b" },
  });
  await contextHandler(ctx.req, ctx.res, { sql: mockSql, databaseUrl: "mock://url" });
  assert.strictEqual(ctx.res.statusCode, 200);
  assert.strictEqual(ctx.res.body.isOwner, false);

  // User A fetches widgets -> only sees tenant_A's widgets (0 widgets), never tenant_B's
  const getReq = { user: { youniverseId: "tenant_A" } };
  const getRes = createMockReqRes().res;
  await getWeavedWidgetsHandler(getReq, getRes, { sql: mockSql });
  assert.strictEqual(getRes.statusCode, 200);
  assert.strictEqual(getRes.body.widgets.length, 0);
});

test("R6A-08: Existing legacy JWT consumers still authenticate correctly", async () => {
  const jwtSecret = "test_legacy_secret_key_12345678901234567890";
  const sessionToken = "session_refresh_token_abc";
  const token = jwt.sign(
    { userId: "u_legacy_1", youniverseId: "y_legacy_1", handle: "legacyuser", sessionToken },
    jwtSecret
  );

  const mockPrisma = {
    session: {
      findUnique: async ({ where }) => {
        if (where.refreshToken === sessionToken) {
          return {
            id: "ps_1",
            userId: "u_legacy_1",
            refreshToken: sessionToken,
            expiresAt: new Date(Date.now() + 100000),
            revokedAt: null,
          };
        }
        return null;
      },
    },
  };

  const req = { headers: { authorization: `Bearer ${token}` } };
  const { res } = createMockReqRes();
  let nextCalled = false;

  await verifyJwt(req, res, () => { nextCalled = true; }, {
    jwtSecret,
    prisma: mockPrisma,
    sql: async () => [], // Neon session lookup returns empty
  });

  assert.strictEqual(nextCalled, true);
  assert.strictEqual(req.user.userId, "u_legacy_1");
  assert.strictEqual(req.user.authType, "jwt");
});

test("R6A-09: Local Express and Vercel public-profile handlers agree on the contract", async () => {
  const mockSql = createMockSqlDb({
    identities: [
      {
        identity_id: "id_public",
        username: "publicnode",
        display_name: "Public Node",
        subdomain: "publicnode.itsyouonline.com",
        identity_type: "person",
        plan: "free",
        email: "private_owner@example.com", // PRIVATE
        email_verified_at: new Date(),
        is_live: true,
      },
    ],
  });

  // Vercel handler
  const vercel = createMockReqRes({ method: "GET", query: { handle: "publicnode" } });
  await publicHandler(vercel.req, vercel.res, { sql: mockSql, databaseUrl: "mock://url" });

  // Express controller
  const express = createMockReqRes({ method: "GET", params: { handle: "publicnode" } });
  await getYouniversePublicDataHandler(express.req, express.res, { sql: mockSql, databaseUrl: "mock://url" });

  assert.strictEqual(vercel.res.statusCode, 200);
  assert.strictEqual(express.res.statusCode, 200);
  assert.deepStrictEqual(vercel.res.body, express.res.body);

  // Ensure private owner email and tokens are NOT exposed
  assert.strictEqual(vercel.res.body.youniverse.handle, "publicnode");
  assert.strictEqual(vercel.res.body.youniverse.email, undefined);
  assert.strictEqual(vercel.res.body.youniverse.token_hash, undefined);
});

test("R6A-10: Missing production email configuration fails safely without throwing", async () => {
  const oldKey = process.env.RESEND_API_KEY;
  delete process.env.RESEND_API_KEY;

  try {
    assert.strictEqual(isEmailDeliveryConfigured(), false);

    const result = await sendVerificationEmail({
      email: "safe@example.com",
      handle: "safehandle",
      token: "secret_verification_token_value",
    });

    assert.strictEqual(result.sent, false);
    assert.strictEqual(result.reason, "missing_api_key");
    assert.ok(result.error);
  } finally {
    if (oldKey) process.env.RESEND_API_KEY = oldKey;
  }
});

test("R6A-11: Checkpoint A — Claim, verification, and NotNotes operate purely on Neon without Prisma shadow rows", async () => {
  const identities = [];
  const verificationTokens = [];
  const sessions = [];
  const notNotes = [];
  const baseSql = createMockSqlDb({ identities, verificationTokens, sessions, notNotes });

  // Strict SQL wrapper that throws if any query touches legacy "User" or "Youniverse" tables
  const strictNeonSql = async (strings, ...values) => {
    const queryText = strings.join("?");
    if (queryText.includes('"User"') || queryText.includes('"Youniverse"')) {
      throw new Error(`Forbidden legacy shadow table access detected: ${queryText}`);
    }
    return baseSql(strings, ...values);
  };

  let rawVerifyToken = null;
  const { req: claimReq, res: claimRes } = createMockReqRes({
    method: "POST",
    body: { handle: "neonpure", email: "neonpure@example.com", displayName: "Neon Pure" },
  });

  await claimHandler(claimReq, claimRes, {
    sql: strictNeonSql,
    sendVerificationEmail: async ({ token }) => {
      rawVerifyToken = token;
      return { sent: true, reason: "delivered" };
    },
  });

  assert.strictEqual(claimRes.statusCode, 201);
  assert.strictEqual(identities.length, 1);

  const { req: verifyReq, res: verifyRes } = createMockReqRes({
    method: "GET",
    query: { token: rawVerifyToken },
  });
  await verifyHandler(verifyReq, verifyRes, { sql: strictNeonSql });
  assert.strictEqual(verifyRes.statusCode, 200);
  const sessionToken = verifyRes.body.sessionToken;

  // Create NotNote via Vercel serverless handler without any Prisma shadow rows
  const { req: vSaveReq, res: vSaveRes } = createMockReqRes({
    method: "POST",
    headers: { authorization: `Bearer ${sessionToken}` },
    body: {
      title: "NeonServerlessWidget",
      code: "export default () => <div>Serverless</div>",
      dependencies: ["framer-motion"],
    },
  });
  await vercelArtifactHandler(vSaveReq, vSaveRes, { sql: strictNeonSql, databaseUrl: "mock://neon" });
  assert.strictEqual(vSaveRes.statusCode, 200);
  assert.strictEqual(vSaveRes.body.success, true);
  assert.strictEqual(vSaveRes.body.artifact.youniverseId, identities[0].identity_id);
  assert.strictEqual(vSaveRes.body.artifact.status, "APPROVED");

  // Retrieve widgets via Vercel serverless handler
  const { req: vGetReq, res: vGetRes } = createMockReqRes({
    method: "GET",
    headers: { authorization: `Bearer ${sessionToken}` },
  });
  await vercelWidgetsHandler(vGetReq, vGetRes, { sql: strictNeonSql, databaseUrl: "mock://neon" });
  assert.strictEqual(vGetRes.statusCode, 200);
  assert.strictEqual(vGetRes.body.widgets.length, 1);
  assert.strictEqual(vGetRes.body.widgets[0].title, "NeonServerlessWidget");
  assert.deepStrictEqual(vGetRes.body.widgets[0].dependencies, ["framer-motion"]);
});

test("R6A-12: Checkpoint A — NotNotes preserves status and content filtering behavior", async () => {
  const identityId = "yi_status_test";
  const notNotes = [
    {
      id: "nn_approved_widget",
      youniverseId: identityId,
      title: "ApprovedWidget",
      content: { type: "REACT_WIDGET", code: "export default () => <div>OK</div>", dependencies: [] },
      status: "APPROVED",
      createdAt: new Date(),
    },
    {
      id: "nn_pending_widget",
      youniverseId: identityId,
      title: "PendingWidget",
      content: { type: "REACT_WIDGET", code: "export default () => <div>Pending</div>", dependencies: [] },
      status: "PENDING",
      createdAt: new Date(),
    },
    {
      id: "nn_rejected_widget",
      youniverseId: identityId,
      title: "RejectedWidget",
      content: { type: "REACT_WIDGET", code: "export default () => <div>Rejected</div>", dependencies: [] },
      status: "REJECTED",
      createdAt: new Date(),
    },
    {
      id: "nn_archived_book",
      youniverseId: identityId,
      title: "ArchivedNote",
      content: { type: "TEXT_NOTE", body: "Not a widget" },
      status: "APPROVED",
      createdAt: new Date(),
    },
  ];

  const mockSql = createMockSqlDb({ notNotes });
  const req = { user: { youniverseId: identityId } };
  const { res } = createMockReqRes();

  await getWeavedWidgetsHandler(req, res, { sql: mockSql });
  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual(res.body.widgets.length, 1);
  assert.strictEqual(res.body.widgets[0].id, "nn_approved_widget");
  assert.strictEqual(res.body.widgets[0].title, "ApprovedWidget");
});

test("R6A-13: Email sender resilience — respects valid EMAIL_FROM, rejects placeholders/malformed, never logs secrets", async () => {
  // 1. Valid configured EMAIL_FROM values are respected
  assert.strictEqual(
    resolveSenderAddress("onboarding@itsyouonline.com"),
    "onboarding@itsyouonline.com"
  );
  assert.strictEqual(
    resolveSenderAddress("verify@itsyouonline.com"),
    "verify@itsyouonline.com"
  );
  assert.strictEqual(
    resolveSenderAddress("  THE YOUNIVERSE <onboarding@itsyouonline.com>  "),
    "THE YOUNIVERSE <onboarding@itsyouonline.com>"
  );

  // 2. Empty, malformed, or placeholder values fall back to onboarding@itsyouonline.com
  const invalidOrPlaceholderSenders = [
    undefined,
    null,
    "",
    "   ",
    "placeholder",
    "unconfigured",
    "changeme",
    "todo",
    "not-an-email",
    "@itsyouonline.com",
    "onboarding@",
    "onboarding@itsyouonline",
    "onboarding@localhost",
    "test@example.com",
    "noreply@example.invalid",
    "user@placeholder.local",
    "placeholder@itsyouonline.com",
    "THE YOUNIVERSE <placeholder>",
    "THE YOUNIVERSE <test@example.com>",
    "THE YOUNIVERSE <onboarding@itsyouonline.com",
  ];

  for (const candidate of invalidOrPlaceholderSenders) {
    assert.strictEqual(
      resolveSenderAddress(candidate),
      DEFAULT_EMAIL_FROM,
      `Expected fallback for sender candidate: ${String(candidate)}`
    );
  }

  // 3. sendVerificationEmail uses fallback when EMAIL_FROM is a placeholder and never logs secrets on failure
  const oldKey = process.env.RESEND_API_KEY;
  const oldFrom = process.env.EMAIL_FROM;
  const secretApiKey = "re_test_secret_key_do_not_log_999";
  const secretVerifyToken = "raw_verify_token_do_not_log_888";

  const capturedPayloads = [];
  const capturedLogs = [];
  const origError = console.error;
  const origWarn = console.warn;

  try {
    console.error = (...args) => capturedLogs.push(args.join(" "));
    console.warn = (...args) => capturedLogs.push(args.join(" "));

    process.env.RESEND_API_KEY = secretApiKey;
    process.env.EMAIL_FROM = "placeholder";

    const mockFetchOk = async (_url, opts) => {
      capturedPayloads.push(JSON.parse(opts.body));
      return { ok: true, status: 200, text: async () => "{}" };
    };

    const okResult = await sendVerificationEmail(
      { email: "owner@itsyouonline.com", handle: "owner", token: secretVerifyToken },
      mockFetchOk
    );
    assert.strictEqual(okResult.sent, true);
    assert.strictEqual(capturedPayloads.length, 1);
    assert.strictEqual(capturedPayloads[0].from, "onboarding@itsyouonline.com");

    // Valid custom sender is respected in actual dispatch
    process.env.EMAIL_FROM = "THE YOUNIVERSE <verify@itsyouonline.com>";
    await sendVerificationEmail(
      { email: "owner@itsyouonline.com", handle: "owner", token: secretVerifyToken },
      mockFetchOk
    );
    assert.strictEqual(capturedPayloads[1].from, "THE YOUNIVERSE <verify@itsyouonline.com>");

    // Upstream failure remains fail-closed and never logs API key or verification token
    const mockFetchFail = async () => ({
      ok: false,
      status: 422,
      text: async () => "Invalid from address",
    });
    const failResult = await sendVerificationEmail(
      { email: "owner@itsyouonline.com", handle: "owner", token: secretVerifyToken },
      mockFetchFail
    );
    assert.strictEqual(failResult.sent, false);
    assert.strictEqual(failResult.reason, "delivery_failed");

    const allLogs = capturedLogs.join("\n");
    assert.strictEqual(allLogs.includes(secretApiKey), false, "API key must never appear in logs");
    assert.strictEqual(allLogs.includes(secretVerifyToken), false, "Verification token must never appear in logs");
  } finally {
    console.error = origError;
    console.warn = origWarn;
    if (oldKey === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = oldKey;
    if (oldFrom === undefined) delete process.env.EMAIL_FROM;
    else process.env.EMAIL_FROM = oldFrom;
  }
});
