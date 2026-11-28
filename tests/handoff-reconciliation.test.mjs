/**
 * tests/handoff-reconciliation.test.mjs
 *
 * Regression coverage for handoff persistence fail-closed guarantees across:
 *   1. GET /api/v1/auth/verify (JSON, wildcard Accept, and HTML callers)
 *   2. GET /api/youniverse/[handle]/context?handoff=1 (owner success, persistence failure, non-owner isolation)
 */

import assert from "node:assert/strict";
import test from "node:test";
import crypto from "crypto";

import verifyHandler from "../api/v1/auth/verify.ts";
import contextHandler from "../lib/handlers/youniverse/context.ts";
import { verifyHandoffToken } from "../lib/cryptoHandoff.ts";
import { hashToken } from "../lib/neonSession.ts";

const rsaKeys = crypto.generateKeyPairSync("rsa", {
  modulusLength: 2048,
  publicKeyEncoding: { type: "spki", format: "pem" },
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
});
process.env.HANDOFF_PRIVATE_KEY = rsaKeys.privateKey;
process.env.HANDOFF_PUBLIC_KEY = rsaKeys.publicKey;
delete process.env.NODE_ENV;
delete process.env.VERCEL_ENV;

function makeMockReqRes({
  method = "GET",
  headers = {},
  query = {},
  params = {},
  url = "/",
} = {}) {
  const req = { method, headers, query, params, url, body: null };
  const state = { statusCode: 200, body: undefined, headers: {}, ended: false };
  const res = {
    setHeader(k, v) {
      state.headers[k.toLowerCase()] = v;
      return res;
    },
    status(code) {
      state.statusCode = code;
      return res;
    },
    json(payload) {
      state.body = payload;
      state.ended = true;
      return res;
    },
    end() {
      state.ended = true;
      return res;
    },
    get statusCode() {
      return state.statusCode;
    },
    get body() {
      return state.body;
    },
    get headers() {
      return state.headers;
    },
    get ended() {
      return state.ended;
    },
  };
  return { req, res };
}

function normalizeSql(strings) {
  return strings.join(" ").replace(/\s+/g, " ").trim();
}

function createVerifyMockDb({ handoffError = null } = {}) {
  const identities = [];
  const verificationTokens = [];
  const sessions = [];
  const handoffTokens = [];

  async function sql(strings, ...values) {
    const q = normalizeSql(strings);

    if (q.includes("WITH consumed_token")) {
      const vt = verificationTokens.find(
        (t) => t.token_hash === values[0] && t.consumed_at === null && new Date(t.expires_at) > new Date()
      );
      if (!vt) return [];
      const id = identities.find((i) => i.identity_id === vt.identity_id);
      if (!id) return [];
      vt.consumed_at = new Date();
      id.email_verified_at = new Date();
      return [{ identity_id: id.identity_id, username: id.username, email: id.email }];
    }

    if (q.includes("FROM email_verification_tokens") && q.includes("WHERE token_hash =")) {
      const vt = verificationTokens.find((t) => t.token_hash === values[0]);
      return vt ? [vt] : [];
    }

    if (q.includes("FROM youniverse_identities") && q.includes("WHERE identity_id =")) {
      const id = identities.find((i) => i.identity_id === values[0]);
      return id ? [id] : [];
    }

    if (q.includes("UPDATE email_verification_tokens") && q.includes("SET consumed_at = NOW()")) {
      const vt = verificationTokens.find((t) => t.id === values[0] && t.consumed_at === null);
      if (!vt) return [];
      vt.consumed_at = new Date();
      return [{ id: vt.id }];
    }

    if (q.includes("UPDATE youniverse_identities") && q.includes("SET email_verified_at = NOW()")) {
      const id = identities.find((i) => i.identity_id === values[0]);
      if (id) id.email_verified_at = new Date();
      return [];
    }

    if (q.includes("INSERT INTO sessions")) {
      sessions.push({ identity_id: values[0], token_hash: values[1] });
      return [];
    }

    if (q.includes("INSERT INTO handoff_tokens")) {
      if (handoffError) throw handoffError;
      handoffTokens.push({ handle: values[0], nonce: values[1], expires_at: values[2], consumed: false });
      return [];
    }

    return [];
  }

  function seed(identityId, username) {
    const rawToken = crypto.randomBytes(32).toString("hex");
    identities.push({
      identity_id: identityId,
      username,
      email: `${username}@example.invalid`,
      is_live: true,
      email_verified_at: null,
    });
    verificationTokens.push({
      id: `evt_${identityId}`,
      identity_id: identityId,
      token_hash: hashToken(rawToken),
      expires_at: new Date(Date.now() + 60 * 60 * 1000),
      consumed_at: null,
    });
    return rawToken;
  }

  return { sql, handoffTokens, seed };
}

function createContextMockDb({ handoffError = null } = {}) {
  const identities = [
    {
      identity_id: "id_owner",
      username: "owner-one",
      plan: "free",
      is_live: true,
      email_verified_at: new Date(),
    },
    {
      identity_id: "id_foreign",
      username: "foreign-two",
      plan: "free",
      is_live: true,
      email_verified_at: new Date(),
    },
  ];
  const rawSessionToken = crypto.randomBytes(24).toString("hex");
  const sessionTokenHash = hashToken(rawSessionToken);
  const handoffTokens = [];

  async function sql(strings, ...values) {
    const q = normalizeSql(strings);

    if (q.includes("FROM sessions") && q.includes("WHERE token_hash =")) {
      if (values[0] !== sessionTokenHash) return [];
      return [
        {
          id: "sess_owner_1",
          identity_id: "id_owner",
          human_id: null,
          auth_subject_id: null,
          expires_at: new Date(Date.now() + 3600_000),
          revoked_at: null,
        },
      ];
    }

    if (q.includes("FROM youniverse_identities") && q.includes("WHERE username =")) {
      const match = identities.find((i) => i.username === values[0]);
      return match ? [match] : [];
    }

    if (q.includes("INSERT INTO handoff_tokens")) {
      if (handoffError) throw handoffError;
      handoffTokens.push({ handle: values[0], nonce: values[1], expires_at: values[2], consumed: false });
      return [];
    }

    return [];
  }

  return { sql, rawSessionToken, handoffTokens };
}

test("verify.ts fails closed with 500 handoff_unavailable across JSON, wildcard, and HTML on FK/DB error", async () => {
  const pgFkErr = Object.assign(
    new Error('insert or update on table "handoff_tokens" violates foreign key constraint "handoff_tokens_handle_youniverse_fkey"'),
    { code: "23503", constraint: "handoff_tokens_handle_youniverse_fkey" }
  );

  for (const accept of ["application/json", "*/*", "text/html"]) {
    const db = createVerifyMockDb({ handoffError: pgFkErr });
    const rawToken = db.seed(`id_${accept.replace(/[^a-z]/g, "")}`, "validhandle");
    const { req, res } = makeMockReqRes({
      query: { token: rawToken },
      headers: { host: "www.itsyouonline.com", accept },
    });

    await verifyHandler(req, res, { sql: db.sql });

    assert.strictEqual(res.statusCode, 500, `Accept=${accept} must return 500`);
    assert.strictEqual(res.body.success, false, `Accept=${accept} must not mark success`);
    assert.strictEqual(res.body.error, "handoff_unavailable");
    assert.strictEqual(res.body.handoffToken, undefined);
    assert.strictEqual(res.body.destinationUrl, undefined);
    assert.strictEqual(res.headers.location, undefined);
    assert.strictEqual(res.headers["cache-control"], "no-store");
    assert.ok(!JSON.stringify(res.body).includes("23503"), "Raw DB code must not leak in response body");
  }
});

test("context.ts?handoff=1 fails closed with structured 500 handoff_unavailable on persistence failure", async () => {
  const pgFkErr = Object.assign(
    new Error('insert or update on table "handoff_tokens" violates foreign key constraint "handoff_tokens_handle_fkey"'),
    { code: "23503", constraint: "handoff_tokens_handle_fkey" }
  );
  const db = createContextMockDb({ handoffError: pgFkErr });

  const { req, res } = makeMockReqRes({
    headers: { authorization: `Bearer ${db.rawSessionToken}`, host: "www.itsyouonline.com" },
    params: { handle: "owner-one" },
    query: { handoff: "1" },
  });

  await contextHandler(req, res, { sql: db.sql, databaseUrl: "postgres://mock.invalid/db" });

  assert.strictEqual(res.statusCode, 500);
  assert.strictEqual(res.body.success, false);
  assert.strictEqual(res.body.error, "handoff_unavailable");
  assert.strictEqual(res.body.handoffToken, undefined);
  assert.strictEqual(res.body.destinationUrl, undefined);
  assert.strictEqual(res.headers["cache-control"], "no-store");
  assert.ok(!JSON.stringify(res.body).includes("handoff_tokens_handle_fkey"));
});

test("context.ts?handoff=1 issues verifiable ticket and persists nonce on owner success", async () => {
  const db = createContextMockDb();

  const { req, res } = makeMockReqRes({
    headers: { authorization: `Bearer ${db.rawSessionToken}`, host: "www.itsyouonline.com" },
    params: { handle: "owner-one" },
    query: { handoff: "1" },
  });

  await contextHandler(req, res, { sql: db.sql, databaseUrl: "postgres://mock.invalid/db" });

  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual(res.body.success, true);
  assert.strictEqual(res.body.isOwner, true);
  assert.strictEqual(res.body.handle, "owner-one");
  assert.ok(typeof res.body.handoffToken === "string" && res.body.handoffToken.length > 50);
  assert.strictEqual(res.headers["cache-control"], "no-store");
  assert.strictEqual(db.handoffTokens.length, 1);
  assert.strictEqual(db.handoffTokens[0].handle, "owner-one");

  const verified = verifyHandoffToken(res.body.handoffToken, "owner-one.itsyouonline.com");
  assert.strictEqual(verified.handle, "owner-one");
  assert.strictEqual(verified.nonce, db.handoffTokens[0].nonce);
});

test("context.ts?handoff=1 enforces tenant isolation for non-owner (no handoffToken, no DB insert)", async () => {
  const db = createContextMockDb();

  const { req, res } = makeMockReqRes({
    headers: { authorization: `Bearer ${db.rawSessionToken}`, host: "www.itsyouonline.com" },
    params: { handle: "foreign-two" },
    query: { handoff: "1" },
  });

  await contextHandler(req, res, { sql: db.sql, databaseUrl: "postgres://mock.invalid/db" });

  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual(res.body.success, true);
  assert.strictEqual(res.body.isOwner, false);
  assert.strictEqual(res.body.handle, "foreign-two");
  assert.strictEqual(res.body.handoffToken, undefined);
  assert.strictEqual(res.body.destinationUrl, undefined);
  assert.strictEqual(db.handoffTokens.length, 0);
});
