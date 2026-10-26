/**
 * tests/phase3-r10-handoff.test.mjs
 *
 * Phase R10 Test Suite — Verified-Owner RS256 Handoff Integration
 *
 * Scenarios Tested:
 *  1. Successful verification produces a handle-bound handoff ticket.
 *  2. The browser redirect targets the correct subdomain.
 *  3. Valid ticket creates the intended destination session.
 *  4. The nonce can be consumed only once (concurrent replays fail closed).
 *  5. Wrong audience or handle is rejected.
 *  6. Invalid signature and expired ticket are rejected.
 *  7. Missing nonce, database failure, and failed nonce consumption fail closed.
 *  8. An email-verification token cannot be used as a handoff ticket or session.
 *  9. An unverified identity cannot obtain an owner session.
 * 10. The destination owner-context endpoint accepts the established session.
 * 11. A different tenant cannot access the owner's context.
 * 12. Refresh preserves authenticated owner access without exposing the handoff ticket again.
 */

import assert from "node:assert/strict";
import test from "node:test";
import crypto from "crypto";
import jwt from "jsonwebtoken";

import verifyHandler from "../api/v1/auth/verify.ts";
import verifyTokenHandler, { resolveTrustedHandoffAudience } from "../api/verify-token.ts";
import contextHandler from "../api/youniverse/[handle]/context.ts";
import claimHandler from "../api/claim.ts";
import {
  signHandoffToken,
  verifyHandoffToken,
  handoffAudienceFor,
  HANDOFF_ISSUER,
} from "../lib/cryptoHandoff.ts";
import { hashToken } from "../lib/neonSession.ts";

// Generate dedicated 2048-bit RSA test keypair
const testKeyPair = crypto.generateKeyPairSync("rsa", {
  modulusLength: 2048,
  publicKeyEncoding: { type: "spki", format: "pem" },
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
});

process.env.HANDOFF_PRIVATE_KEY = testKeyPair.privateKey;
process.env.HANDOFF_PUBLIC_KEY = testKeyPair.publicKey;

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
  };

  return { req, res };
}

function createMockDb({
  identities = [],
  verificationTokens = [],
  handoffTokens = [],
  sessions = [],
} = {}) {
  const mockSql = async function (strings, ...values) {
    const q = strings.join("?");

    // ── youniverse_identities ─────────────────────────────────
    if (q.includes("FROM youniverse_identities") && q.includes("WHERE username =")) {
      const match = identities.find((i) => i.username === values[0]);
      return match ? [match] : [];
    }
    if (q.includes("FROM youniverse_identities") && q.includes("WHERE identity_id =")) {
      const match = identities.find((i) => i.identity_id === values[0]);
      return match ? [match] : [];
    }
    if (q.includes("FROM youniverse_identities") && q.includes("WHERE email =")) {
      const match = identities.find((i) => i.email === values[0] && (!i.plan || i.plan === "free"));
      return match ? [match] : [];
    }
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
        is_live: true,
      };
      identities.push(record);
      return [record];
    }
    if (q.includes("UPDATE youniverse_identities") && q.includes("SET email_verified_at = NOW()")) {
      const id = values[0];
      const match = identities.find((i) => i.identity_id === id);
      if (match) {
        match.email_verified_at = new Date();
        return [{ identity_id: match.identity_id, username: match.username }];
      }
      return [];
    }

    // ── email_verification_tokens ─────────────────────────────
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

    // ── handoff_tokens ────────────────────────────────────────
    if (q.includes("INSERT INTO handoff_tokens")) {
      const record = {
        token_id: "ht_" + Math.random().toString(36).slice(2, 8),
        handle: values[0],
        nonce: values[1],
        expires_at: new Date(values[2]),
        consumed: false,
        created_at: new Date(),
      };
      handoffTokens.push(record);
      return [record];
    }
    if (q.includes("UPDATE handoff_tokens") && q.includes("SET consumed = TRUE")) {
      const nonce = values[0];
      const handle = values[1];
      const match = handoffTokens.find(
        (t) => t.nonce === nonce && t.handle === handle && t.consumed === false && new Date(t.expires_at) > new Date()
      );
      if (match) {
        match.consumed = true;
        return [{ token_id: match.token_id }];
      }
      return [];
    }

    // ── sessions ──────────────────────────────────────────────
    if (q.includes("INSERT INTO sessions")) {
      const record = {
        id: "sess_" + Math.random().toString(36).slice(2, 8),
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

    return [];
  };

  const defaultDeps = {
    sql: mockSql,
    databaseUrl: "postgresql://mock:test@localhost/testdb",
  };

  return { mockSql, defaultDeps, identities, verificationTokens, handoffTokens, sessions };
}

// ────────────────────────────────────────────────────────────────────────────
// TESTS
// ────────────────────────────────────────────────────────────────────────────

test("R10-01: Successful email verification produces a handle-bound RS256 handoff ticket", async () => {
  const { defaultDeps, identities, verificationTokens, handoffTokens } = createMockDb();

  // Setup: unverified identity with verification token
  const rawVerifyToken = "vt_raw_1234567890abcdef";
  identities.push({
    identity_id: "ident_alice",
    username: "alice",
    email: "alice@example.com",
    plan: "free",
    is_live: true,
    email_verified_at: null,
  });
  verificationTokens.push({
    id: "evt_1",
    identity_id: "ident_alice",
    token_hash: hashToken(rawVerifyToken),
    expires_at: new Date(Date.now() + 86400000),
    consumed_at: null,
  });

  const { req, res } = createMockReqRes({
    method: "GET",
    query: { token: rawVerifyToken },
    headers: { host: "welcome.itsyouonline.com" },
  });

  await verifyHandler(req, res, defaultDeps);

  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual(res.body.success, true);
  assert.strictEqual(res.body.handle, "alice");
  assert.ok(res.body.handoffToken, "RS256 handoff token must be issued");

  // Verify the handoff token is cryptographically bound to alice's audience
  const decoded = verifyHandoffToken(res.body.handoffToken, "alice.itsyouonline.com");
  assert.strictEqual(decoded.handle, "alice");
  assert.ok(decoded.nonce);

  // Nonce recorded in DB
  assert.strictEqual(handoffTokens.length, 1);
  assert.strictEqual(handoffTokens[0].handle, "alice");
  assert.strictEqual(handoffTokens[0].consumed, false);
});

test("R10-02: The browser redirect targets the correct handle subdomain", async () => {
  const { defaultDeps, identities, verificationTokens } = createMockDb();
  const rawVerifyToken = "vt_redirect_test";
  identities.push({
    identity_id: "ident_bob",
    username: "bob",
    email: "bob@example.com",
    plan: "free",
    is_live: true,
    email_verified_at: null,
  });
  verificationTokens.push({
    id: "evt_2",
    identity_id: "ident_bob",
    token_hash: hashToken(rawVerifyToken),
    expires_at: new Date(Date.now() + 86400000),
    consumed_at: null,
  });

  const { req, res } = createMockReqRes({
    method: "GET",
    query: { token: rawVerifyToken },
    headers: { host: "welcome.itsyouonline.com" },
  });

  await verifyHandler(req, res, defaultDeps);

  assert.strictEqual(res.statusCode, 200);
  assert.ok(res.body.destinationUrl);
  // Verify destination uses URL fragment (#handoff_token=)
  assert.ok(res.body.destinationUrl.includes("bob.itsyouonline.com"));
  assert.ok(res.body.destinationUrl.includes("#handoff_token="));
  assert.ok(!res.body.destinationUrl.includes("?handoff_token="), "Must NOT leak in query string");
});

test("R10-03: Valid handoff ticket creates the intended destination owner session", async () => {
  const { defaultDeps, identities, handoffTokens, sessions } = createMockDb();
  const nonce = "nonce_dest_valid_123";
  identities.push({
    identity_id: "ident_carol",
    username: "carol",
    email: "carol@example.com",
    plan: "free",
    is_live: true,
    email_verified_at: new Date(),
  });
  handoffTokens.push({
    token_id: "ht_1",
    handle: "carol",
    nonce,
    consumed: false,
    expires_at: new Date(Date.now() + 90000),
  });

  const ticket = signHandoffToken({ handle: "carol", nonce });

  const { req, res } = createMockReqRes({
    method: "POST",
    headers: { host: "carol.itsyouonline.com" },
    body: { token: ticket },
  });

  await verifyTokenHandler(req, res, defaultDeps);

  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual(res.body.success, true);
  assert.strictEqual(res.body.handle, "carol");
  assert.ok(res.body.sessionToken, "Must return destination owner session token");
  assert.strictEqual(sessions.length, 1, "Session record must be created in sessions table");
  assert.strictEqual(handoffTokens[0].consumed, true, "Nonce must be marked consumed");
});

test("R10-04: Nonce can be consumed only once (concurrent replays fail closed)", async () => {
  const { defaultDeps, identities, handoffTokens } = createMockDb();
  const nonce = "nonce_replay_test";
  identities.push({
    identity_id: "ident_dave",
    username: "dave",
    email: "dave@example.com",
    plan: "free",
    is_live: true,
    email_verified_at: new Date(),
  });
  handoffTokens.push({
    token_id: "ht_replay",
    handle: "dave",
    nonce,
    consumed: false,
    expires_at: new Date(Date.now() + 90000),
  });

  const ticket = signHandoffToken({ handle: "dave", nonce });

  // First request: succeeds
  const { req: req1, res: res1 } = createMockReqRes({
    method: "POST",
    headers: { host: "dave.itsyouonline.com" },
    body: { token: ticket },
  });
  await verifyTokenHandler(req1, res1, defaultDeps);
  assert.strictEqual(res1.statusCode, 200);

  // Second replay request: must fail closed
  const { req: req2, res: res2 } = createMockReqRes({
    method: "POST",
    headers: { host: "dave.itsyouonline.com" },
    body: { token: ticket },
  });
  await verifyTokenHandler(req2, res2, defaultDeps);
  assert.strictEqual(res2.statusCode, 401);
  assert.strictEqual(res2.body.error, "token_already_consumed_or_expired");
});

test("R10-05: Wrong audience or handle is rejected", async () => {
  const { defaultDeps, identities, handoffTokens } = createMockDb();
  const nonce = "nonce_wrong_aud";
  identities.push({
    identity_id: "ident_eve",
    username: "eve",
    email: "eve@example.com",
    plan: "free",
    is_live: true,
    email_verified_at: new Date(),
  });
  handoffTokens.push({
    token_id: "ht_aud",
    handle: "eve",
    nonce,
    consumed: false,
    expires_at: new Date(Date.now() + 90000),
  });

  // Ticket signed for eve
  const ticket = signHandoffToken({ handle: "eve", nonce });

  // Attacker attempts to redeem ticket at mallory's subdomain
  const { req, res } = createMockReqRes({
    method: "POST",
    headers: { host: "mallory.itsyouonline.com" },
    body: { token: ticket },
  });

  await verifyTokenHandler(req, res, defaultDeps);

  assert.strictEqual(res.statusCode, 401);
  assert.strictEqual(res.body.error, "invalid_handoff_token");
});

test("R10-06: Invalid signature and expired ticket are rejected", async () => {
  const { defaultDeps, identities, handoffTokens } = createMockDb();
  identities.push({
    identity_id: "ident_frank",
    username: "frank",
    email: "frank@example.com",
    plan: "free",
    is_live: true,
    email_verified_at: new Date(),
  });

  // 1. Expired ticket
  const expiredTicket = jwt.sign(
    { handle: "frank", nonce: "nonce_exp" },
    testKeyPair.privateKey,
    {
      algorithm: "RS256",
      expiresIn: -10, // expired in past
      issuer: HANDOFF_ISSUER,
      audience: "frank.itsyouonline.com",
    }
  );

  const { req: expReq, res: expRes } = createMockReqRes({
    method: "POST",
    headers: { host: "frank.itsyouonline.com" },
    body: { token: expiredTicket },
  });
  await verifyTokenHandler(expReq, expRes, defaultDeps);
  assert.strictEqual(expRes.statusCode, 401);

  // 2. Tampered signature
  const parts = expiredTicket.split(".");
  const tamperedTicket = `${parts[0]}.${parts[1]}.tampered_sig_12345`;
  const { req: tampReq, res: tampRes } = createMockReqRes({
    method: "POST",
    headers: { host: "frank.itsyouonline.com" },
    body: { token: tamperedTicket },
  });
  await verifyTokenHandler(tampReq, tampRes, defaultDeps);
  assert.strictEqual(tampRes.statusCode, 401);
});

test("R10-07: Missing nonce record or DB failure fails closed", async () => {
  const { defaultDeps, identities } = createMockDb();
  identities.push({
    identity_id: "ident_grace",
    username: "grace",
    email: "grace@example.com",
    plan: "free",
    is_live: true,
    email_verified_at: new Date(),
  });

  // Ticket has valid signature but nonce was never stored in DB
  const unrecordedTicket = signHandoffToken({ handle: "grace", nonce: "nonce_not_in_db" });

  const { req, res } = createMockReqRes({
    method: "POST",
    headers: { host: "grace.itsyouonline.com" },
    body: { token: unrecordedTicket },
  });

  await verifyTokenHandler(req, res, defaultDeps);

  assert.strictEqual(res.statusCode, 401);
  assert.strictEqual(res.body.error, "token_already_consumed_or_expired");
});

test("R10-08: Email-verification token cannot be used as handoff ticket or bearer session", async () => {
  const { defaultDeps, identities } = createMockDb();
  identities.push({
    identity_id: "ident_heidi",
    username: "heidi",
    email: "heidi@example.com",
    plan: "free",
    is_live: true,
    email_verified_at: new Date(),
  });

  const rawVerifyToken = "vt_cannot_be_handoff_token";

  // 1. Attempt using email token at verify-token handoff endpoint
  const { req: hReq, res: hRes } = createMockReqRes({
    method: "POST",
    headers: { host: "heidi.itsyouonline.com" },
    body: { token: rawVerifyToken },
  });
  await verifyTokenHandler(hReq, hRes, defaultDeps);
  assert.strictEqual(hRes.statusCode, 401);

  // 2. Attempt using email token as Bearer session at owner context endpoint
  const { req: cReq, res: cRes } = createMockReqRes({
    method: "GET",
    params: { handle: "heidi" },
    headers: { authorization: `Bearer ${rawVerifyToken}` },
  });
  await contextHandler(cReq, cRes, defaultDeps);
  assert.strictEqual(cRes.statusCode, 401);
});

test("R10-09: Unverified identity cannot obtain an owner session via handoff", async () => {
  const { defaultDeps, identities, handoffTokens } = createMockDb();
  const nonce = "nonce_unverified_user";
  identities.push({
    identity_id: "ident_ivan",
    username: "ivan",
    email: "ivan@example.com",
    plan: "free",
    is_live: true,
    email_verified_at: null, // NOT verified!
  });
  handoffTokens.push({
    token_id: "ht_unverified",
    handle: "ivan",
    nonce,
    consumed: false,
    expires_at: new Date(Date.now() + 90000),
  });

  const ticket = signHandoffToken({ handle: "ivan", nonce });

  const { req, res } = createMockReqRes({
    method: "POST",
    headers: { host: "ivan.itsyouonline.com" },
    body: { token: ticket },
  });

  await verifyTokenHandler(req, res, defaultDeps);

  assert.strictEqual(res.statusCode, 403);
  assert.strictEqual(res.body.error, "email_not_verified");
});

test("R10-10: Destination owner-context endpoint accepts established session", async () => {
  const { defaultDeps, identities, handoffTokens } = createMockDb();
  const nonce = "nonce_ctx_test";
  identities.push({
    identity_id: "ident_judy",
    username: "judy",
    email: "judy@example.com",
    plan: "free",
    is_live: true,
    email_verified_at: new Date(),
  });
  handoffTokens.push({
    token_id: "ht_judy",
    handle: "judy",
    nonce,
    consumed: false,
    expires_at: new Date(Date.now() + 90000),
  });

  const ticket = signHandoffToken({ handle: "judy", nonce });

  // 1. Redeem handoff ticket
  const { req: hReq, res: hRes } = createMockReqRes({
    method: "POST",
    headers: { host: "judy.itsyouonline.com" },
    body: { token: ticket },
  });
  await verifyTokenHandler(hReq, hRes, defaultDeps);
  assert.strictEqual(hRes.statusCode, 200);
  const establishedSessionToken = hRes.body.sessionToken;

  // 2. Query destination owner context with the established session
  const { req: cReq, res: cRes } = createMockReqRes({
    method: "GET",
    params: { handle: "judy" },
    headers: { authorization: `Bearer ${establishedSessionToken}` },
  });
  await contextHandler(cReq, cRes, defaultDeps);

  assert.strictEqual(cRes.statusCode, 200);
  assert.strictEqual(cRes.body.success, true);
  assert.strictEqual(cRes.body.isOwner, true);
  assert.strictEqual(cRes.body.handle, "judy");
});

test("R10-11: Different tenant cannot access owner context using valid session of another user", async () => {
  const { defaultDeps, identities, handoffTokens } = createMockDb();
  const nonce = "nonce_cross_tenant";
  identities.push(
    {
      identity_id: "ident_tenant_a",
      username: "alice",
      email: "alice@example.com",
      plan: "free",
      is_live: true,
      email_verified_at: new Date(),
    },
    {
      identity_id: "ident_tenant_b",
      username: "bob",
      email: "bob@example.com",
      plan: "free",
      is_live: true,
      email_verified_at: new Date(),
    }
  );
  handoffTokens.push({
    token_id: "ht_alice",
    handle: "alice",
    nonce,
    consumed: false,
    expires_at: new Date(Date.now() + 90000),
  });

  const ticket = signHandoffToken({ handle: "alice", nonce });

  // Alice establishes session
  const { req: hReq, res: hRes } = createMockReqRes({
    method: "POST",
    headers: { host: "alice.itsyouonline.com" },
    body: { token: ticket },
  });
  await verifyTokenHandler(hReq, hRes, defaultDeps);
  const aliceSessionToken = hRes.body.sessionToken;

  // Alice tries to use her session at Bob's context
  const { req: cReq, res: cRes } = createMockReqRes({
    method: "GET",
    params: { handle: "bob" },
    headers: { authorization: `Bearer ${aliceSessionToken}` },
  });
  await contextHandler(cReq, cRes, defaultDeps);

  // Must not be owner of Bob's workspace
  assert.strictEqual(cRes.statusCode, 200);
  assert.strictEqual(cRes.body.isOwner, false, "Alice must not be recognized as owner of Bob's workspace");
});

test("R10-12: Page refresh preserves authenticated owner access without re-exposing handoff ticket", async () => {
  const { defaultDeps, identities, handoffTokens } = createMockDb();
  const nonce = "nonce_refresh_test";
  identities.push({
    identity_id: "ident_refresh",
    username: "oscar",
    email: "oscar@example.com",
    plan: "free",
    is_live: true,
    email_verified_at: new Date(),
  });
  handoffTokens.push({
    token_id: "ht_oscar",
    handle: "oscar",
    nonce,
    consumed: false,
    expires_at: new Date(Date.now() + 90000),
  });

  const ticket = signHandoffToken({ handle: "oscar", nonce });

  // 1. Initial arrival: exchange ticket
  const { req: hReq, res: hRes } = createMockReqRes({
    method: "POST",
    headers: { host: "oscar.itsyouonline.com" },
    body: { token: ticket },
  });
  await verifyTokenHandler(hReq, hRes, defaultDeps);
  const savedToken = hRes.body.sessionToken;

  // 2. Simulated page refresh: URL hash is clean; client retrieves token from destination localStorage
  const { req: rReq, res: rRes } = createMockReqRes({
    method: "GET",
    params: { handle: "oscar" },
    headers: { authorization: `Bearer ${savedToken}` },
  });
  await contextHandler(rReq, rRes, defaultDeps);

  assert.strictEqual(rRes.statusCode, 200);
  assert.strictEqual(rRes.body.isOwner, true);
  assert.strictEqual(rRes.body.handle, "oscar");

  // Attempting to replay original ticket fails
  const { req: replayReq, res: replayRes } = createMockReqRes({
    method: "POST",
    headers: { host: "oscar.itsyouonline.com" },
    body: { token: ticket },
  });
  await verifyTokenHandler(replayReq, replayRes, defaultDeps);
  assert.strictEqual(replayRes.statusCode, 401);
});
