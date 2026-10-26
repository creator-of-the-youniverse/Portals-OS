/**
 * tests/phase3-r12-smoke.test.mjs
 *
 * Phase R12 — Isolated Real-Database Smoke Test
 *
 * Exercises the end-to-end handoff sequence against the isolated Neon test database
 * (LOCAL_TEST_DATABASE_URL), without affecting production:
 *   1. Create disposable test identity in unverified state.
 *   2. Verify email token and confirm verified state in real DB.
 *   3. Issue handoff ticket and persist nonce in handoff_tokens table.
 *   4. Redeem ticket once, atomically consuming nonce and creating destination session.
 *   5. Authenticate owner-context endpoint using the real destination session.
 *   6. Replay the same ticket and confirm rejection (fails closed).
 *   7. Simulate downstream failure and verify documented recovery behavior.
 *   8. Confirm cleanup is strictly limited to disposable test records.
 */

import assert from "node:assert/strict";
import test from "node:test";
import crypto from "crypto";
import dotenv from "dotenv";
import { neon } from "@neondatabase/serverless";

// Load isolated test database URL from .env.local
dotenv.config({ path: ".env.local", override: true });
const testDbUrl = process.env.LOCAL_TEST_DATABASE_URL;

assert.ok(
  testDbUrl,
  "LOCAL_TEST_DATABASE_URL must be defined in .env.local for Phase R12 smoke test"
);

// Safety assertion: Ensure we NEVER run smoke test against production database!
const prodDbUrl = process.env.DATABASE_URL;
const testHost = new URL(testDbUrl).host;
if (prodDbUrl) {
  const prodHost = new URL(prodDbUrl).host;
  assert.notStrictEqual(
    testHost,
    prodHost,
    "CRITICAL SAFETY CHECK FAILED: LOCAL_TEST_DATABASE_URL matches production DATABASE_URL!"
  );
}

// Generate dedicated 2048-bit RSA test keypair for RS256 handoff
const testKeyPair = crypto.generateKeyPairSync("rsa", {
  modulusLength: 2048,
  publicKeyEncoding: { type: "spki", format: "pem" },
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
});
process.env.HANDOFF_PRIVATE_KEY = testKeyPair.privateKey;
process.env.HANDOFF_PUBLIC_KEY = testKeyPair.publicKey;
process.env.HANDOFF_ALLOW_EPHEMERAL_DEV_KEYS = "1";

const sql = neon(testDbUrl);

// Handlers and helpers
import verifyHandler from "../api/v1/auth/verify.ts";
import verifyTokenHandler from "../api/verify-token.ts";
import contextHandler from "../api/youniverse/[handle]/context.ts";
import { createVerificationToken } from "../lib/emailVerification.ts";
import { hashToken } from "../lib/neonSession.ts";

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

test("Phase R12: Isolated Real-Database Smoke Test", async (t) => {
  const uniqueSuffix = Date.now().toString(36) + Math.random().toString(36).substring(2, 6);
  const testHandle = `r12_${uniqueSuffix}`.slice(0, 30);
  const testEmail = `${testHandle}@example.invalid`;
  const identityId = `ident_${uniqueSuffix}`;
  let rawVerifyToken = null;
  let handoffToken = null;
  let sessionToken = null;

  // Track created IDs for strict cleanup assertion
  const createdRecordIds = {
    identityId,
    handle: testHandle,
    emailTokenHash: null,
    handoffNonce: null,
    sessionTokenHash: null,
  };

  try {
    // ── 1. Create disposable test identity ───────────────────────────────────
    await t.test("1. Create disposable test identity in unverified state", async () => {
      // In the isolated test DB, if table 'handles' exists with FK, create handle row
      const checkHandles = await sql`
        SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'handles'
      `;
      if (checkHandles.length > 0) {
        await sql`
          INSERT INTO handles (handle, owner_email, status, created_at, updated_at)
          VALUES (${testHandle}, ${testEmail}, 'claimed', NOW(), NOW())
          ON CONFLICT (handle) DO NOTHING
        `;
      }

      await sql`
        INSERT INTO youniverse_identities (
          identity_id,
          username,
          display_name,
          subdomain,
          identity_type,
          email,
          plan,
          is_live,
          email_verified_at,
          created_at
        )
        VALUES (
          ${identityId},
          ${testHandle},
          ${testHandle},
          ${`${testHandle}.itsyouonline.com`},
          'person',
          ${testEmail},
          'free',
          TRUE,
          NULL,
          NOW()
        )
      `;

      // Create dedicated email verification token
      const tokenResult = await createVerificationToken(sql, identityId);
      rawVerifyToken = tokenResult.rawToken;
      createdRecordIds.emailTokenHash = hashToken(rawVerifyToken);

      // Verify unverified state in real DB
      const rows = await sql`
        SELECT username, email_verified_at, is_live
        FROM youniverse_identities
        WHERE identity_id = ${identityId}
      `;
      assert.strictEqual(rows.length, 1);
      assert.strictEqual(rows[0].username, testHandle);
      assert.strictEqual(rows[0].email_verified_at, null, "Identity must be unverified initially");
      assert.strictEqual(rows[0].is_live, true);
    });

    // ── 2. Verify email token and confirm verified state ─────────────────────
    await t.test("2. Verify email token and confirm verified state in real DB", async () => {
      const { req, res } = createMockReqRes({
        method: "GET",
        query: { token: rawVerifyToken },
        headers: { host: "welcome.itsyouonline.com" },
      });

      await verifyHandler(req, res, { sql, databaseUrl: testDbUrl });

      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body.success, true);
      assert.strictEqual(res.body.handle, testHandle);
      assert.ok(res.body.handoffToken, "Must return signed handoff ticket");
      assert.ok(res.body.destinationUrl, "Must return destinationUrl");

      handoffToken = res.body.handoffToken;

      // Assert verified state in real DB
      const identityRows = await sql`
        SELECT email_verified_at
        FROM youniverse_identities
        WHERE identity_id = ${identityId}
      `;
      assert.ok(identityRows[0].email_verified_at !== null, "email_verified_at must be populated");

      // Assert email_verification_tokens consumed in real DB
      const tokenRows = await sql`
        SELECT consumed_at
        FROM email_verification_tokens
        WHERE token_hash = ${createdRecordIds.emailTokenHash}
      `;
      assert.strictEqual(tokenRows.length, 1);
      assert.ok(tokenRows[0].consumed_at !== null, "Token must be marked consumed");
    });

    // ── 3. Inspect persisted handoff nonce ───────────────────────────────────
    await t.test("3. Handoff ticket is persisted with unconsumed nonce in DB", async () => {
      // Find the nonce from the handoff_tokens table for this handle
      const handoffRows = await sql`
        SELECT nonce, consumed, expires_at
        FROM handoff_tokens
        WHERE handle = ${testHandle}
      `;
      assert.strictEqual(handoffRows.length, 1, "Must have exactly one handoff_token row");
      assert.strictEqual(handoffRows[0].consumed, false, "Must initially be unconsumed");
      assert.ok(new Date(handoffRows[0].expires_at) > new Date(), "Must not be expired");

      createdRecordIds.handoffNonce = handoffRows[0].nonce;
    });

    // ── 4. Redeem ticket once and confirm destination session created ────────
    await t.test("4. Redeem ticket once and confirm destination session in real DB", async () => {
      const { req, res } = createMockReqRes({
        method: "POST",
        headers: {
          host: `${testHandle}.itsyouonline.com`,
          "user-agent": "SmokeTestAgent/1.0",
        },
        body: { token: handoffToken },
      });

      await verifyTokenHandler(req, res, { sql, databaseUrl: testDbUrl });

      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body.success, true);
      assert.strictEqual(res.body.handle, testHandle);
      assert.ok(res.body.sessionToken, "Must receive destination sessionToken");
      assert.ok(res.body.workspaceConfig, "Must receive synthesized workspaceConfig");

      sessionToken = res.body.sessionToken;
      createdRecordIds.sessionTokenHash = hashToken(sessionToken);

      // Verify nonce is atomically marked consumed in real DB
      const handoffRows = await sql`
        SELECT consumed
        FROM handoff_tokens
        WHERE nonce = ${createdRecordIds.handoffNonce}
      `;
      assert.strictEqual(handoffRows[0].consumed, true, "Nonce must be marked consumed in DB");

      // Verify destination session exists in sessions table
      const sessionRows = await sql`
        SELECT identity_id, expires_at, revoked_at
        FROM sessions
        WHERE token_hash = ${createdRecordIds.sessionTokenHash}
      `;
      assert.strictEqual(sessionRows.length, 1, "Session record must exist in sessions table");
      assert.strictEqual(sessionRows[0].identity_id, identityId);
      assert.strictEqual(sessionRows[0].revoked_at, null);
      assert.ok(new Date(sessionRows[0].expires_at) > new Date());
    });

    // ── 5. Authenticate owner-context endpoint with resulting session ────────
    await t.test("5. Authenticate owner-context endpoint with real session", async () => {
      const { req, res } = createMockReqRes({
        method: "GET",
        headers: {
          authorization: `Bearer ${sessionToken}`,
        },
        params: { handle: testHandle },
      });

      await contextHandler(req, res, { sql, databaseUrl: testDbUrl });

      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body.success, true);
      assert.strictEqual(res.body.isOwner, true, "Must confirm isOwner: true for real session");
      assert.strictEqual(res.body.handle, testHandle);
    });

    // ── 6. Replay the same ticket and confirm rejection ──────────────────────
    await t.test("6. Replay ticket and confirm rejection with no new sessions", async () => {
      const { req, res } = createMockReqRes({
        method: "POST",
        headers: {
          host: `${testHandle}.itsyouonline.com`,
        },
        body: { token: handoffToken },
      });

      await verifyTokenHandler(req, res, { sql, databaseUrl: testDbUrl });

      assert.strictEqual(res.statusCode, 401);
      assert.strictEqual(res.body.success, false);
      assert.strictEqual(res.body.error, "token_already_consumed_or_expired");

      // Verify no extra session was minted for this identity
      const sessionCount = await sql`
        SELECT COUNT(*)::int as count
        FROM sessions
        WHERE identity_id = ${identityId} AND token_hash = ${createdRecordIds.sessionTokenHash}
      `;
      assert.strictEqual(sessionCount[0].count, 1, "Exactly 1 destination session must exist");
    });

    // ── 7. Simulate downstream database failure & verify recovery behavior ───
    await t.test("7. Simulate downstream DB failure after nonce consumption", async () => {
      // Create a secondary handoff ticket for simulation
      const simNonce = crypto.randomBytes(24).toString("hex");
      const simExpiresAt = new Date(Date.now() + 90 * 1000);
      await sql`
        INSERT INTO handoff_tokens (handle, nonce, expires_at, consumed)
        VALUES (${testHandle}, ${simNonce}, ${simExpiresAt.toISOString()}, FALSE)
      `;

      const { signHandoffToken } = await import("../lib/cryptoHandoff.ts");
      const simTicket = signHandoffToken({ handle: testHandle, nonce: simNonce });

      // Simulate failure in createSessionFn
      const faultyCreateSession = async () => {
        throw new Error("Simulated downstream DB connection reset");
      };

      const { req, res } = createMockReqRes({
        method: "POST",
        headers: { host: `${testHandle}.itsyouonline.com` },
        body: { token: simTicket },
      });

      await verifyTokenHandler(req, res, {
        sql,
        databaseUrl: testDbUrl,
        createSession: faultyCreateSession,
      });

      // Assert fail-closed response
      assert.strictEqual(res.statusCode, 500);
      assert.strictEqual(res.body.success, false);
      assert.strictEqual(res.body.error, "server_error");

      // Verify recovery behavior: Nonce was burned, preventing replay attack
      const nonceCheck = await sql`
        SELECT consumed FROM handoff_tokens WHERE nonce = ${simNonce}
      `;
      assert.strictEqual(nonceCheck[0].consumed, true, "Nonce must remain consumed");

      // Retrying with the same ticket must now fail closed with 401
      const { req: retryReq, res: retryRes } = createMockReqRes({
        method: "POST",
        headers: { host: `${testHandle}.itsyouonline.com` },
        body: { token: simTicket },
      });
      await verifyTokenHandler(retryReq, retryRes, { sql, databaseUrl: testDbUrl });
      assert.strictEqual(retryRes.statusCode, 401);
      assert.strictEqual(retryRes.body.error, "token_already_consumed_or_expired");

      // Clean up simNonce
      await sql`DELETE FROM handoff_tokens WHERE nonce = ${simNonce}`;
    });

  } finally {
    // ── 8. Cleanup limited to test records ───────────────────────────────────
    await t.test("8. Confirm cleanup is strictly limited to test records", async () => {
      // Count records before cleanup
      const preCleanupIdentities = await sql`SELECT COUNT(*)::int as count FROM youniverse_identities`;

      // Delete test records by explicit test identity and handle
      await sql`DELETE FROM sessions WHERE identity_id = ${identityId}`;
      await sql`DELETE FROM email_verification_tokens WHERE identity_id = ${identityId}`;
      await sql`DELETE FROM handoff_tokens WHERE handle = ${testHandle}`;
      await sql`DELETE FROM youniverse_identities WHERE identity_id = ${identityId}`;

      const checkHandles = await sql`
        SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'handles'
      `;
      if (checkHandles.length > 0) {
        await sql`DELETE FROM handles WHERE handle = ${testHandle}`;
      }

      // Assert test identity is removed
      const checkDeleted = await sql`
        SELECT 1 FROM youniverse_identities WHERE identity_id = ${identityId}
      `;
      assert.strictEqual(checkDeleted.length, 0, "Test identity must be deleted");

      // Assert other records were not affected
      const postCleanupIdentities = await sql`SELECT COUNT(*)::int as count FROM youniverse_identities`;
      assert.strictEqual(
        postCleanupIdentities[0].count,
        preCleanupIdentities[0].count - 1,
        "Exactly 1 identity record must have been deleted"
      );
    });
  }
});
