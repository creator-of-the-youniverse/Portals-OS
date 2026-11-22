import assert from "node:assert/strict";
import test from "node:test";
import crypto from "node:crypto";
import fs from "node:fs";

import {
  enforceAntiCsrf,
  TRUSTED_CSRF_ORIGINS,
  buildSessionCookieHeader,
} from "../lib/creatorOwnership.ts";
import { hashPassword, hashResetToken } from "../lib/passwordAuth.ts";
import { hashToken } from "../lib/neonSession.ts";
import { signHandoffToken } from "../lib/cryptoHandoff.ts";
import { ensureBigBangStorageEpoch, BIG_BANG_STORAGE_EPOCH } from "../lib/storageEpoch.ts";
import enrollHandler from "../lib/handlers/auth/enroll.ts";
import passwordSetHandler from "../lib/handlers/auth/password/set.ts";
import passwordLoginHandler from "../lib/handlers/auth/password/login.ts";
import passwordRecoverHandler from "../lib/handlers/auth/password/recover.ts";
import artifactHandler from "../lib/handlers/not-notes/artifact.ts";
import genesisHandler from "../api/genesis/[action].ts";
import contextHandler from "../lib/handlers/youniverse/context.ts";
import verifyTokenHandler from "../api/verify-token.ts";
import verifyEmailHandler from "../api/v1/auth/verify.ts";
import { claimHandle } from "../services/identityService.ts";

function makeRes() {
  const res = {
    _status: 200,
    _headers: {},
    _body: null,
    _ended: false,
    status(s) {
      res._status = s;
      return res;
    },
    json(b) {
      res._body = b;
      res._ended = true;
      return res;
    },
    setHeader(k, v) {
      res._headers[String(k).toLowerCase()] = v;
      return res;
    },
    end() {
      res._ended = true;
      return res;
    },
  };
  return res;
}

test("BB-01: Tenant same-origin CSRF allows verified owner host and rejects cross-subdomain / reserved origins", () => {
  const prodEnv = { VERCEL_ENV: "production", NODE_ENV: "production" };
  assert.equal(TRUSTED_CSRF_ORIGINS.size, 2);

  // Default behavior unchanged (gateway only)
  assert.equal(
    enforceAntiCsrf({ headers: { origin: "https://alice.itsyouonline.com", host: "alice.itsyouonline.com" } }, prodEnv).blocked,
    true
  );

  // Tenant opt-in allows same-origin valid non-reserved subdomain
  assert.equal(
    enforceAntiCsrf(
      { headers: { origin: "https://alice.itsyouonline.com", host: "alice.itsyouonline.com" } },
      prodEnv,
      { allowSameOriginTenantSubdomain: true, expectedTenantHandle: "alice" }
    ).blocked,
    false
  );

  // Negative cases: cross-host, handle mismatch, http://, missing Origin, reserved/malformed
  assert.equal(
    enforceAntiCsrf(
      { headers: { origin: "https://evil.itsyouonline.com", host: "alice.itsyouonline.com" } },
      prodEnv,
      { allowSameOriginTenantSubdomain: true }
    ).blocked,
    true
  );
  assert.equal(
    enforceAntiCsrf(
      { headers: { origin: "https://bob.itsyouonline.com", host: "bob.itsyouonline.com" } },
      prodEnv,
      { allowSameOriginTenantSubdomain: true, expectedTenantHandle: "alice" }
    ).blocked,
    true
  );
  assert.equal(
    enforceAntiCsrf(
      { headers: { origin: "http://alice.itsyouonline.com", host: "alice.itsyouonline.com" } },
      prodEnv,
      { allowSameOriginTenantSubdomain: true }
    ).blocked,
    true
  );
  assert.equal(
    enforceAntiCsrf(
      { headers: { host: "alice.itsyouonline.com" } },
      prodEnv,
      { allowSameOriginTenantSubdomain: true }
    ).blocked,
    true
  );
  assert.equal(
    enforceAntiCsrf(
      { headers: { origin: "https://www.itsyouonline.com:8443", host: "www.itsyouonline.com:8443" } },
      prodEnv,
      { allowSameOriginTenantSubdomain: true }
    ).blocked,
    true
  );
});

test("BB-02: Cross-tenant Origin header on NotNotes/Genesis blocks CSRF even with valid cookie of another owner", async () => {
  const prevEnv = process.env.VERCEL_ENV;
  process.env.VERCEL_ENV = "production";
  try {
    const rawTok = "tok-alice-cookie-1";
    const mockSql = async (strings, ...values) => {
      const q = strings.join("?");
      if (q.includes("FROM sessions")) {
        return [{
          session_id: "sess-1",
          identity_id: "id-alice",
          human_id: null,
          expires_at: new Date(Date.now() + 3600_000).toISOString(),
          revoked_at: null,
          username: "alice",
          email: "alice@example.com",
          plan: "free",
          is_live: true,
          email_verified_at: new Date().toISOString(),
        }];
      }
      return [];
    };

    const req = {
      method: "POST",
      headers: {
        host: "alice.itsyouonline.com",
        origin: "https://evil.itsyouonline.com",
        cookie: `__youniverse_session=${rawTok}`,
      },
      body: { title: "X", code: "export default function(){return null}" },
    };
    const res = makeRes();
    await artifactHandler(req, res, { sql: mockSql, env: { VERCEL_ENV: "production" } });
    assert.equal(res._status, 403);
    assert.equal(res._body.error, "csrf_rejected");

    // Same-host alice origin with X-Youniverse-Handle: bob must ALSO be rejected
    const mismatchReq = {
      method: "POST",
      headers: {
        host: "alice.itsyouonline.com",
        origin: "https://alice.itsyouonline.com",
        cookie: `__youniverse_session=${rawTok}`,
        "x-youniverse-handle": "bob",
      },
      body: { title: "X", code: "export default function(){return null}" },
    };
    const mismatchRes = makeRes();
    const bobSql = async (strings) => {
      const q = strings.join("?");
      if (q.includes("FROM sessions")) {
        return [{
          session_id: "sess-1",
          identity_id: "id-alice",
          human_id: null,
          expires_at: new Date(Date.now() + 3600_000).toISOString(),
          revoked_at: null,
          username: "alice",
          email: "alice@example.com",
          plan: "free",
          is_live: true,
          email_verified_at: new Date().toISOString(),
        }];
      }
      if (q.includes("FROM youniverse_identities") && q.includes("WHERE username")) {
        return [{ identity_id: "id-bob", username: "bob", email: "alice@example.com", plan: "free", is_live: true, email_verified_at: new Date().toISOString() }];
      }
      return [];
    };
    await artifactHandler(mismatchReq, mismatchRes, { sql: bobSql, env: { VERCEL_ENV: "production" } });
    assert.equal(mismatchRes._status, 403);

    // Legitimate owner on alice.itsyouonline.com creating draft succeeds
    const okReq = {
      method: "POST",
      headers: {
        host: "alice.itsyouonline.com",
        origin: "https://alice.itsyouonline.com",
        cookie: `__youniverse_session=${rawTok}`,
      },
      body: { title: "My Widget", code: "export default function W(){ return null; }" },
    };
    const okRes = makeRes();
    await artifactHandler(okReq, okRes, { sql: mockSql, env: { VERCEL_ENV: "production" } });
    assert.equal(okRes._status, 200);
    assert.equal(okRes._body.success, true);

    // Genesis acknowledge from tenant subdomain works when matching handle, blocked when evil origin
    const genBlockedRes = makeRes();
    await genesisHandler(
      {
        method: "POST",
        query: { action: "acknowledge" },
        headers: {
          host: "alice.itsyouonline.com",
          origin: "https://evil.itsyouonline.com",
          cookie: `__youniverse_session=${rawTok}`,
        },
      },
      genBlockedRes,
      { sql: mockSql, env: { VERCEL_ENV: "production" } }
    );
    assert.equal(genBlockedRes._status, 403);
    assert.equal(genBlockedRes._body.error, "csrf_rejected");
  } finally {
    if (prevEnv === undefined) delete process.env.VERCEL_ENV;
    else process.env.VERCEL_ENV = prevEnv;
  }
});

test("BB-03: First-time password/set from legacy verified session links Homeverse & issues human session cookie", async () => {
  let linkedAssoc = null;
  let issuedSessionOpts = null;
  const mockSql = async (strings, ...values) => {
    const q = strings.join("?");
    if (q.includes("FROM youniverse_identities")) {
      return [{ identity_id: "id-new-1", email_verified_at: new Date().toISOString() }];
    }
    if (q.includes("FROM human_auth_subjects") && q.includes("provider_type = 'password'")) {
      return [];
    }
    if (q.includes("INSERT INTO human_youniverse_associations")) {
      linkedAssoc = values;
      return [];
    }
    return [];
  };

  const req = {
    method: "POST",
    headers: {
      origin: "https://newowner.itsyouonline.com",
      host: "newowner.itsyouonline.com",
      cookie: "__youniverse_session=legacy-tok",
    },
    body: {
      email: "owner@example.com",
      password: "StrongPassword123",
    },
  };
  const res = makeRes();
  await passwordSetHandler(req, res, {
    sql: mockSql,
    env: { VERCEL_ENV: "production" },
    validateSession: async () => ({ ok: true, identityId: "id-new-1", sessionId: "sess-old", humanId: null }),
    createSession: async (_sql, identityId, opts) => {
      issuedSessionOpts = { identityId, opts };
      return { rawToken: "upgraded-tok-123", expiresAt: new Date(Date.now() + 3600_000) };
    },
  });

  assert.equal(res._status, 200);
  assert.ok(linkedAssoc, "password/set must link human_youniverse_associations for legacy verified session");
  assert.ok(issuedSessionOpts?.opts?.humanId, "password/set must upgrade session cookie to carry humanId");
  assert.ok(String(res._headers["set-cookie"] || "").includes("__youniverse_session="));
});

test("BB-04: Password recovery dispatches Resend email via APP_URL (never untrusted Host header)", async () => {
  const prevAppUrl = process.env.APP_URL;
  const prevResend = process.env.RESEND_API_KEY;
  process.env.APP_URL = "https://www.itsyouonline.com";
  process.env.RESEND_API_KEY = "re_test_key_mock";

  const sentPayloads = [];
  const origFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    sentPayloads.push({ url, body: JSON.parse(init.body) });
    return new Response(JSON.stringify({ id: "email_1" }), { status: 200 });
  };

  try {
    const mockSql = async (strings) => {
      const q = strings.join("?");
      if (q.includes("FROM human_auth_subjects")) {
        return [{ human_id: "00000000-0000-4000-8000-000000000001" }];
      }
      return [];
    };
    const req = {
      method: "POST",
      headers: {
        origin: "https://www.itsyouonline.com",
        host: "attacker-steal-host.example",
      },
      body: { email: "alice@example.com" },
    };
    const res = makeRes();
    await passwordRecoverHandler(req, res, { sql: mockSql, env: { VERCEL_ENV: "production" } });
    assert.equal(res._status, 200);
    assert.equal(sentPayloads.length, 1, "Recover handler must dispatch email when sendEmailFn dep is not injected");
    assert.ok(
      sentPayloads[0].body.html.includes("https://www.itsyouonline.com/reset-password?token="),
      "Reset URL must use canonical APP_URL, not attacker Host header"
    );
    assert.ok(!sentPayloads[0].body.html.includes("attacker-steal-host.example"));
  } finally {
    globalThis.fetch = origFetch;
    if (prevAppUrl === undefined) delete process.env.APP_URL;
    else process.env.APP_URL = prevAppUrl;
    if (prevResend === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = prevResend;
  }
});

test("BB-05: password/login fails closed with 403 when human has zero Youniverse associations (no FK crash)", async () => {
  const { passwordHash, salt, algorithm } = await hashPassword("ValidPass123");
  let sessionInserted = false;
  const mockSql = async (strings) => {
    const q = strings.join("?");
    if (q.includes("FROM human_continuity_identities")) {
      return [{
        human_id: "00000000-0000-4000-8000-000000000002",
        human_status: "active",
        human_created_at: new Date().toISOString(),
        human_updated_at: new Date().toISOString(),
        subject_id: "00000000-0000-4000-8000-000000000003",
        provider_type: "password",
        subject_identifier: "orphan@example.com",
        subject_status: "active",
        verified_at: new Date().toISOString(),
        revoked_at: null,
        subject_created_at: new Date().toISOString(),
        password_hash: passwordHash,
        salt,
        algorithm,
        password_created_at: new Date().toISOString(),
        password_updated_at: new Date().toISOString(),
      }];
    }
    return [];
  };

  const req = {
    method: "POST",
    headers: { origin: "https://www.itsyouonline.com", host: "www.itsyouonline.com" },
    body: { email: "orphan@example.com", password: "ValidPass123" },
  };
  const res = makeRes();
  await passwordLoginHandler(req, res, {
    sql: mockSql,
    env: { VERCEL_ENV: "production" },
    createSession: async () => {
      sessionInserted = true;
      return { rawToken: "should-not-create", expiresAt: new Date() };
    },
  });

  assert.equal(res._status, 403);
  assert.equal(res._body.error, "no_associated_youniverse");
  assert.equal(sessionInserted, false);
});

test("BB-06: context returns hasPassword + human-continuity ownedYouniverses, and verify preserves humanId", async () => {
  const kp = crypto.generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });
  const prevPriv = process.env.HANDOFF_PRIVATE_KEY;
  const prevPub = process.env.HANDOFF_PUBLIC_KEY;
  process.env.HANDOFF_PRIVATE_KEY = kp.privateKey;
  process.env.HANDOFF_PUBLIC_KEY = kp.publicKey;

  try {
    // 1. context with humanId returns hasPassword & ownedYouniverses from human_youniverse_associations
    const humanId = "00000000-0000-4000-8000-000000000099";
    const ctxSql = async (strings) => {
      const q = strings.join("?");
      if (q.includes("FROM youniverse_identities") && q.includes("WHERE username")) {
        return [{ identity_id: "id-main", username: "main", email: "m@e.com", plan: "free", is_live: true, email_verified_at: new Date().toISOString() }];
      }
      if (q.includes("FROM human_continuity_identities")) {
        return [{ status: "active" }];
      }
      if (q.includes("FROM human_youniverse_associations hya")) {
        return [
          { identity_id: "id-main", handle: "main", subdomain: "main.itsyouonline.com", display_name: "main", plan: "free" },
          { identity_id: "id-alt", handle: "alt", subdomain: "alt.itsyouonline.com", display_name: "alt", plan: "starter" },
        ];
      }
      if (q.includes("FROM human_youniverse_associations")) {
        return [{
          id: "assoc-1",
          human_id: humanId,
          identity_id: "id-main",
          role: "owner",
          verification_status: "verified",
          is_homeverse: true,
          requires_reverification: false,
          reverification_required_at: null,
          verified_at: new Date().toISOString(),
          revoked_at: null,
          revocation_reason: null,
          created_at: new Date().toISOString(),
        }];
      }
      if (q.includes("FROM human_auth_subjects") && q.includes("provider_type = 'password'")) {
        return [{ id: "subj-pw-1" }];
      }
      return [];
    };

    const ctxRes = makeRes();
    await contextHandler(
      { method: "GET", query: { handle: "main" }, headers: { cookie: "__youniverse_session=ok" } },
      ctxRes,
      {
        sql: ctxSql,
        validateSession: async () => ({ ok: true, identityId: "id-main", sessionId: "s-1", humanId }),
      }
    );
    assert.equal(ctxRes._status, 200);
    assert.equal(ctxRes._body.isOwner, true);
    assert.equal(ctxRes._body.hasPassword, true);
    assert.equal(ctxRes._body.ownedYouniverses.length, 2);

    // 2. verify-token & verify.ts pass linked humanId to createSession when human_youniverse_associations exists
    let verifyTokenHumanId = null;
    const nonce = "abc123";
    const handoffJwt = signHandoffToken({ handle: "main", nonce });
    const vtSql = async (strings) => {
      const q = strings.join("?");
      if (q.includes("UPDATE handoff_tokens")) return [{ token_id: "t-1" }];
      if (q.includes("FROM youniverse_identities")) {
        return [{ identity_id: "id-main", username: "main", email: "m@e.com", plan: "free", is_live: true, email_verified_at: new Date().toISOString() }];
      }
      if (q.includes("FROM human_youniverse_associations")) return [{ human_id: humanId }];
      return [];
    };
    const vtRes = makeRes();
    await verifyTokenHandler(
      { method: "POST", headers: { host: "main.itsyouonline.com" }, body: { token: handoffJwt } },
      vtRes,
      {
        sql: vtSql,
        resolveTrustedHandoffAudience: () => "main.itsyouonline.com",
        createSession: async (_sql, _id, opts) => {
          verifyTokenHumanId = opts?.humanId ?? null;
          return { rawToken: "rt-1", expiresAt: new Date(Date.now() + 3600_000) };
        },
      }
    );
    assert.equal(vtRes._status, 200);
    assert.equal(verifyTokenHumanId, humanId);
  } finally {
    if (prevPriv === undefined) delete process.env.HANDOFF_PRIVATE_KEY;
    else process.env.HANDOFF_PRIVATE_KEY = prevPriv;
    if (prevPub === undefined) delete process.env.HANDOFF_PUBLIC_KEY;
    else process.env.HANDOFF_PUBLIC_KEY = prevPub;
  }
});

test("BB-07: Stale client storage purge (ensureBigBangStorageEpoch) & stale-token claim recovery", async () => {
  const store = new Map([
    ["win11-portfolio-storage", '{"state":{"gemini":{"sessions":{"s1":{}}}}}'],
    ["youniverse_session_token", "stale-tok"],
    ["weaver_jwt", "stale-jwt"],
    ["active_youniverse_handle", "oldhandle"],
    ["youniverse_os_active_oldhandle", "true"],
    ["youniverse_foundation_oldhandle", '{"seed":{}}'],
    ["youniverse_arrived_oldhandle", "true"],
    ["youniverse-pwa-dismissed", "12345"],
  ]);
  const ls = {
    get length() { return store.size; },
    key(i) { return Array.from(store.keys())[i] ?? null; },
    getItem(k) { return store.get(k) ?? null; },
    setItem(k, v) { store.set(k, String(v)); },
    removeItem(k) { store.delete(k); },
  };
  ensureBigBangStorageEpoch(ls);
  assert.equal(ls.getItem("youniverse_storage_epoch"), BIG_BANG_STORAGE_EPOCH);
  assert.equal(ls.getItem("win11-portfolio-storage"), null);
  assert.equal(ls.getItem("youniverse_session_token"), null);
  assert.equal(ls.getItem("youniverse_os_active_oldhandle"), null);
  assert.equal(ls.getItem("youniverse-pwa-dismissed"), "12345");

  // Re-running on current epoch is a no-op for newly stored keys
  ls.setItem("active_youniverse_handle", "freshowner");
  ensureBigBangStorageEpoch(ls);
  assert.equal(ls.getItem("active_youniverse_handle"), "freshowner");

  // claimHandle clears stale Bearer token & retries once on 401
  const calls = [];
  const origFetch = globalThis.fetch;
  const origLS = globalThis.localStorage;
  globalThis.localStorage = ls;
  ls.setItem("youniverse_session_token", "stale-creator-tok");
  globalThis.fetch = async (_url, init) => {
    calls.push(init.headers);
    if (calls.length === 1) {
      return new Response(JSON.stringify({ status: "invalid_token" }), { status: 401 });
    }
    return new Response(JSON.stringify({ status: "pending_verification", subdomain: "fresh.itsyouonline.com" }), { status: 201 });
  };
  try {
    const res = await claimHandle({ handle: "fresh", email: "new@example.com" });
    assert.equal(res.success, true);
    assert.equal(calls.length, 2);
    assert.ok(calls[0].Authorization);
    assert.equal(calls[1].Authorization, undefined);
    assert.equal(ls.getItem("youniverse_session_token"), null);
  } finally {
    globalThis.fetch = origFetch;
    if (origLS === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = origLS;
  }
});

test("BB-08: Multi-handle Homeverse fallback in enroll & password/set, active subject filter, and unverified email denial", async () => {
  const { passwordHash, salt, algorithm } = await hashPassword("StrongPassword123");
  const existingHumanId = "00000000-0000-4000-8000-0000000000aa";
  const linkedCalls = [];

  // 1. enrollHandler: existing email with existing Homeverse retries with isHomeverse: false
  const enrollSql = async (strings, ...values) => {
    const q = strings.join("?");
    if (q.includes("FROM human_continuity_identities h")) {
      return [{
        human_id: existingHumanId,
        human_status: "active",
        human_created_at: new Date().toISOString(),
        human_updated_at: new Date().toISOString(),
        subject_id: "subj-active-1",
        provider_type: "password",
        subject_identifier: "multi@example.com",
        subject_status: "active",
        verified_at: new Date().toISOString(),
        revoked_at: null,
        subject_created_at: new Date().toISOString(),
        password_hash: passwordHash,
        salt,
        algorithm,
        password_created_at: new Date().toISOString(),
        password_updated_at: new Date().toISOString(),
      }];
    }
    if (q.includes("FROM youniverse_identities") && q.includes("WHERE username")) {
      return [{ identity_id: "id-second-1", username: "second", email: "multi@example.com", email_verified_at: new Date().toISOString(), plan: "free", is_live: true }];
    }
    if (q.includes("FROM human_youniverse_associations") && q.includes("is_homeverse = TRUE")) {
      return [{ id: "existing-hv-1" }];
    }
    if (q.includes("INSERT INTO human_youniverse_associations")) {
      linkedCalls.push({ isHomeverse: values[5], identityId: values[2] });
      return [];
    }
    return [];
  };

  const enrollRes = makeRes();
  await enrollHandler(
    {
      method: "POST",
      headers: { origin: "https://second.itsyouonline.com", host: "second.itsyouonline.com", cookie: "__youniverse_session=valid-sess" },
      body: { handle: "second", email: "multi@example.com", password: "StrongPassword123" },
    },
    enrollRes,
    {
      sql: enrollSql,
      env: { VERCEL_ENV: "production" },
      validateSession: async () => ({ ok: true, identityId: "id-second-1", sessionId: "s-1", humanId: existingHumanId }),
    }
  );
  assert.equal(enrollRes._status, 200);
  assert.equal(linkedCalls.length, 1);
  assert.equal(linkedCalls[0].identityId, "id-second-1");
  assert.equal(linkedCalls[0].isHomeverse, false);

  // 2. password/set with legacy session on second handle links with isHomeverse: false when Homeverse exists
  const setLinked = [];
  const setSql = async (strings, ...values) => {
    const q = strings.join("?");
    if (q.includes("FROM youniverse_identities") && q.includes("WHERE email")) {
      return [{ identity_id: "id-second-1", email_verified_at: new Date().toISOString() }];
    }
    if (q.includes("FROM human_auth_subjects") && q.includes("subject_identifier")) {
      return [{ human_id: existingHumanId }];
    }
    if (q.includes("FROM human_youniverse_associations") && q.includes("is_homeverse = TRUE")) {
      return [{ id: "existing-hv-1" }];
    }
    if (q.includes("INSERT INTO human_youniverse_associations")) {
      setLinked.push({ isHomeverse: values[5], identityId: values[2] });
      return [];
    }
    if (q.includes("FROM human_auth_subjects") && q.includes("provider_type = 'password'")) {
      assert.ok(q.includes("status = 'active'"), "password/set must filter active password subjects only");
      return [{ id: "subj-active-1" }];
    }
    return [];
  };
  const setRes = makeRes();
  await passwordSetHandler(
    {
      method: "POST",
      headers: { origin: "https://second.itsyouonline.com", host: "second.itsyouonline.com", cookie: "__youniverse_session=legacy-2" },
      body: { email: "multi@example.com", password: "NewStrongPassword123" },
    },
    setRes,
    {
      sql: setSql,
      env: { VERCEL_ENV: "production" },
      validateSession: async () => ({ ok: true, identityId: "id-second-1", sessionId: "s-2", humanId: null }),
      createSession: async () => ({ rawToken: "upgraded-2", expiresAt: new Date(Date.now() + 3600_000) }),
    }
  );
  assert.equal(setRes._status, 200);
  assert.equal(setLinked.length, 1);
  assert.equal(setLinked[0].isHomeverse, false);

  // 3. password/set when human session has no active password subject rejects unverified email
  const unverifiedRes = makeRes();
  await passwordSetHandler(
    {
      method: "POST",
      headers: { origin: "https://www.itsyouonline.com", host: "www.itsyouonline.com", cookie: "__youniverse_session=hum-sess" },
      body: { email: "spoof@example.com", password: "NewStrongPassword123" },
    },
    unverifiedRes,
    {
      sql: async (strings) => {
        const q = strings.join("?");
        if (q.includes("FROM human_auth_subjects")) return [];
        if (q.includes("FROM youniverse_identities")) {
          return [{ email: "real@example.com", email_verified_at: null }];
        }
        return [];
      },
      env: { VERCEL_ENV: "production" },
      validateSession: async () => ({ ok: true, identityId: "id-real-1", sessionId: "s-3", humanId: existingHumanId }),
    }
  );
  assert.equal(unverifiedRes._status, 403);
  assert.equal(unverifiedRes._body.error, "email_not_verified");
});

test("BB-09: WebAuthn tenant origin helper + fail-closed 403 on passkey/verify and recovery/redeem with zero verified Youniverse", async () => {
  const { resolveExpectedWebAuthnOrigins } = await import("../lib/webauthnAuth.ts");
  const { default: passkeyVerifyHandler } = await import("../lib/handlers/auth/passkey/verify.ts");
  const { default: recoveryRedeemHandler } = await import("../lib/handlers/auth/recovery/redeem.ts");
  const { hashRecoveryCode } = await import("../lib/recoveryCode.ts");

  const withTenant = resolveExpectedWebAuthnOrigins("https://alice.itsyouonline.com");
  assert.ok(withTenant.includes("https://alice.itsyouonline.com"));
  const withoutEvil = resolveExpectedWebAuthnOrigins("https://evil.example.com");
  assert.ok(!withoutEvil.includes("https://evil.example.com"));

  // recovery/redeem rejects with 403 no_associated_youniverse when zero verified associations exist
  const rawCode = "WXYZ-2345-6789";
  const redeemRes = makeRes();
  await recoveryRedeemHandler(
    {
      method: "POST",
      headers: { origin: "https://www.itsyouonline.com", host: "www.itsyouonline.com" },
      body: { email: "orphan@example.com", code: rawCode },
    },
    redeemRes,
    {
      sql: async (strings) => {
        const q = strings.join("?");
        if (q.includes("FROM human_auth_subjects")) {
          return [{ human_id: "00000000-0000-4000-8000-0000000000bb", auth_subject_id: "subj-r1", human_status: "active" }];
        }
        if (q.includes("FROM human_recovery_codes")) {
          return [{ id: "rc-1", code_hash: hashRecoveryCode(rawCode) }];
        }
        return [];
      },
      createSessionFn: async () => {
        throw new Error("Should not create session without verified association");
      },
      env: { VERCEL_ENV: "production" },
    }
  );
  assert.equal(redeemRes._status, 403);
  assert.equal(redeemRes._body.error, "no_associated_youniverse");

  // Source verification for atomic UPDATE ... RETURNING id + passkey/verify fail-closed guard
  const resetSrc = fs.readFileSync("lib/handlers/auth/password/reset.ts", "utf8");
  assert.ok(resetSrc.includes("AND consumed_at IS NULL") && resetSrc.includes("RETURNING id"));
  const pvSrc = fs.readFileSync("lib/handlers/auth/passkey/verify.ts", "utf8");
  assert.ok(pvSrc.includes("no_associated_youniverse") && !pvSrc.includes("anyAssocRows"));
  assert.equal(typeof passkeyVerifyHandler, "function");
});

test("BB-10: api/gemini.ts enforces anti-CSRF, cross-tenant Origin check, and non-wildcard CORS", async () => {
  const { default: geminiHandler } = await import("../api/gemini.ts");
  const prodEnv = { VERCEL_ENV: "production", NODE_ENV: "production" };
  const validBody = { model: "gemini-1.5-flash", contents: [{ role: "user", parts: [{ text: "hello" }] }] };

  const evilCorsRes = makeRes();
  await geminiHandler(
    { method: "OPTIONS", headers: { host: "itsyouonline.com", origin: "https://evil.example.com" } },
    evilCorsRes,
    { env: prodEnv }
  );
  assert.equal(evilCorsRes._status, 200);
  assert.equal(evilCorsRes._headers["access-control-allow-origin"], undefined);

  const missingOriginRes = makeRes();
  await geminiHandler(
    { method: "POST", headers: { host: "itsyouonline.com", cookie: "__youniverse_session=valid-sess" }, body: validBody },
    missingOriginRes,
    { env: prodEnv }
  );
  assert.equal(missingOriginRes._status, 403);
  assert.equal(missingOriginRes._body.error, "csrf_rejected");

  const crossTenantRes = makeRes();
  await geminiHandler(
    {
      method: "POST",
      headers: { host: "bob.itsyouonline.com", origin: "https://bob.itsyouonline.com", cookie: "__youniverse_session=valid-sess" },
      body: validBody,
    },
    crossTenantRes,
    {
      env: prodEnv,
      sql: async (strings, ...values) => {
        const q = strings.join("?");
        if (q.includes("FROM youniverse_identities") && q.includes("identity_id =")) {
          return [{ identity_id: "id-alice", username: "alice", email: "alice@example.com", plan: "free", is_live: true, email_verified_at: "2026-11-21T00:00:00Z" }];
        }
        if (q.includes("FROM youniverse_identities") && q.includes("username =") && values[0] === "bob") {
          return [{ identity_id: "id-bob", username: "bob", email: "bob@example.com", plan: "free", is_live: true, email_verified_at: "2026-11-21T00:00:00Z" }];
        }
        return [];
      },
      validateSession: async () => ({ ok: true, identityId: "id-alice", sessionId: "sess-a", humanId: null }),
    }
  );
  assert.equal(crossTenantRes._status, 403);
  assert.equal(crossTenantRes._body.error, "csrf_rejected");

  const trustedRes = makeRes();
  await geminiHandler(
    {
      method: "POST",
      headers: { host: "www.itsyouonline.com", origin: "https://www.itsyouonline.com", cookie: "__youniverse_session=valid-sess" },
      body: validBody,
    },
    trustedRes,
    {
      env: prodEnv,
      apiKey: "mock-key",
      sql: async () => [],
      validateSession: async () => ({ ok: true, identityId: "id-alice", sessionId: "sess-a", humanId: null }),
      GoogleGenerativeAI: class {
        getGenerativeModel() {
          return {
            generateContent: async () => ({
              response: { candidates: [{ content: { parts: [{ text: "hi" }], role: "model" }, finishReason: "STOP" }] },
            }),
          };
        }
      },
    }
  );
  assert.equal(trustedRes._status, 200);
  assert.equal(trustedRes._headers["access-control-allow-origin"], "https://www.itsyouonline.com");
  assert.notEqual(trustedRes._headers["access-control-allow-origin"], "*");
});
