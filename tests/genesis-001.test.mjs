import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import crypto from "node:crypto";

process.env.HANDOFF_ALLOW_EPHEMERAL_DEV_KEYS = "1";
process.env.VERCEL_ENV = "production";

// Dedicated 2048-bit RSA test keypair for tests running with VERCEL_ENV="production"
const testKeyPair = crypto.generateKeyPairSync("rsa", {
  modulusLength: 2048,
  publicKeyEncoding: { type: "spki", format: "pem" },
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
});
process.env.HANDOFF_PRIVATE_KEY = testKeyPair.privateKey;
process.env.HANDOFF_PUBLIC_KEY = testKeyPair.publicKey;

import {
  GENESIS_OFFICIAL_TITLE,
  GENESIS_DESIGNATION,
  GENESIS_AWARD_SLOT,
  GENESIS_ENTITLEMENT_KEY,
  isEligibleGenesisEmail,
  isProductionGenesisRuntime,
  getGenesisStatusForIdentity,
} from "../lib/genesisService.ts";
import { resolveIdentityEntitlements } from "../lib/entitlements.ts";
import { consumeVerificationTokenWithGenesis } from "../lib/emailVerification.ts";
import { hashToken } from "../lib/neonSession.ts";
import verifyHandler from "../api/v1/auth/verify.ts";
import genesisHandler from "../api/genesis/[action].ts";
import contextHandler from "../api/youniverse/[handle]/context.ts";
import publicHandler from "../api/youniverse/[handle]/public.ts";

/**
 * In-memory PostgreSQL ACID transactional simulator matching Neon schema & triggers
 * for deterministic concurrent & rollback verification.
 */
function createTransactionalSimDb({
  eligibleAfter = "2026-11-12T05:00:00.000Z",
  foundingAngelsPlatformSetup = {
    setup_key: "founding_angels",
    is_completed: true,
    completed_at: "2026-11-11T20:00:00.000Z",
  },
} = {}) {
  let state = {
    program: {
      program_key: "genesis_001",
      official_title: GENESIS_OFFICIAL_TITLE,
      official_designation: GENESIS_DESIGNATION,
      is_enabled: true,
      activated_at: eligibleAfter,
      eligible_verified_after: eligibleAfter,
    },
    foundingAngelsPlatformSetup: foundingAngelsPlatformSetup
      ? { ...foundingAngelsPlatformSetup }
      : null,
    identities: new Map(),
    tokens: new Map(),
    sessions: new Map(),
    handoffs: [],
    awards: new Map(), // keyed by award_slot
    entitlements: [],
    foundingMemberships: new Map(),
  };

  let lockChain = Promise.resolve();

  function cloneState(s) {
    return {
      program: { ...s.program },
      foundingAngelsPlatformSetup: s.foundingAngelsPlatformSetup
        ? { ...s.foundingAngelsPlatformSetup }
        : null,
      identities: new Map(Array.from(s.identities.entries()).map(([k, v]) => [k, { ...v }])),
      tokens: new Map(Array.from(s.tokens.entries()).map(([k, v]) => [k, { ...v }])),
      sessions: new Map(Array.from(s.sessions.entries()).map(([k, v]) => [k, { ...v }])),
      handoffs: s.handoffs.map((h) => ({ ...h })),
      awards: new Map(Array.from(s.awards.entries()).map(([k, v]) => [k, { ...v }])),
      entitlements: s.entitlements.map((e) => ({ ...e })),
      foundingMemberships: new Map(
        Array.from(s.foundingMemberships.entries()).map(([k, v]) => [k, { ...v }])
      ),
    };
  }

  function execOnSnapshot(snap, text, params = []) {
    const sql = text.replace(/\s+/g, " ").trim();

    if (sql.includes("FROM public.founding_angels_platform_setup")) {
      const s = snap.foundingAngelsPlatformSetup;
      if (!s) return { rows: [] };
      const key = params[0] ?? "founding_angels";
      return { rows: s.setup_key === key ? [s] : [] };
    }

    // Transactional token + identity CTE
    if (sql.includes("WITH consumed_token AS") && sql.includes("verified_identity AS")) {
      const tokenHash = params[0];
      const now = new Date();
      let foundTok = null;
      for (const tok of snap.tokens.values()) {
        if (
          tok.token_hash === tokenHash &&
          tok.consumed_at === null &&
          new Date(tok.expires_at) > now
        ) {
          foundTok = tok;
          break;
        }
      }
      if (!foundTok) return { rows: [] };
      const ident = snap.identities.get(foundTok.identity_id);
      if (!ident) return { rows: [] };

      const ts = now.toISOString();
      foundTok.consumed_at = ts;
      ident.email_verified_at = ident.email_verified_at ?? ts;

      return {
        rows: [
          {
            token_id: foundTok.id,
            identity_id: ident.identity_id,
            username: ident.username,
            email: ident.email,
            identity_type: ident.identity_type,
            is_live: ident.is_live,
            email_verified_at: ident.email_verified_at,
            created_at: ident.created_at ?? ident.email_verified_at ?? ts,
          },
        ],
      };
    }

    if (sql.includes("FROM public.email_verification_tokens WHERE token_hash = $1")) {
      const tok = Array.from(snap.tokens.values()).find((t) => t.token_hash === params[0]);
      return { rows: tok ? [tok] : [] };
    }

    if (sql.includes("FROM public.genesis_program_state WHERE program_key = $1")) {
      return { rows: snap.program.program_key === params[0] ? [snap.program] : [] };
    }

    if (sql.startsWith("INSERT INTO public.genesis_awards")) {
      const [awardSlot, identityId, username, officialTitle, awardLabel, tokenId] = params;
      if (snap.awards.has(awardSlot)) {
        // ON CONFLICT (award_slot) DO NOTHING
        return { rows: [] };
      }
      const ident = snap.identities.get(identityId);
      if (!ident || ident.is_live !== true || ident.identity_type !== "person" || !ident.email_verified_at) {
        throw new Error("DB trigger rejected ineligible identity");
      }
      if (!isEligibleGenesisEmail(ident.email)) {
        throw new Error("DB trigger rejected excluded email");
      }
      const row = {
        award_slot: awardSlot,
        identity_id: identityId,
        awarded_username: username,
        official_title: officialTitle,
        award_label: awardLabel,
        verification_token_id: tokenId,
        source_environment: "production",
        awarded_at: new Date().toISOString(),
        ceremony_seen_at: null,
      };
      snap.awards.set(awardSlot, row);
      return { rows: [row] };
    }

    if (sql.startsWith("INSERT INTO public.identity_entitlements")) {
      const [identityId, entitlementKey, sourceRef] = params;
      if (!snap.awards.has(GENESIS_AWARD_SLOT) || snap.awards.get(GENESIS_AWARD_SLOT).identity_id !== identityId) {
        throw new Error("DB trigger blocked unbacked Genesis entitlement");
      }
      const exists = snap.entitlements.some(
        (e) =>
          e.identity_id === identityId &&
          e.entitlement_key === entitlementKey &&
          e.source_type === "genesis_001"
      );
      if (!exists) {
        snap.entitlements.push({
          identity_id: identityId,
          entitlement_key: entitlementKey,
          source_type: "genesis_001",
          source_ref: sourceRef,
          is_lifetime: true,
          status: "active",
        });
      }
      return { rows: [] };
    }

    return { rows: [] };
  }

  const pool = {
    async connect() {
      let txSnap = null;
      let releaseLock = null;
      return {
        async query(text, params = []) {
          const trimmed = text.trim().toUpperCase();
          if (trimmed === "BEGIN") {
            // Serialize transactions strictly under global queue while allowing
            // Promise.all callers to race concurrently at pool.connect()/BEGIN.
            await new Promise((resolve) => {
              const prev = lockChain;
              let done;
              lockChain = new Promise((r) => {
                done = r;
              });
              prev.then(() => {
                releaseLock = done;
                txSnap = cloneState(state);
                resolve();
              });
            });
            return { rows: [] };
          }
          if (trimmed === "COMMIT") {
            state = txSnap;
            txSnap = null;
            if (releaseLock) {
              releaseLock();
              releaseLock = null;
            }
            return { rows: [] };
          }
          if (trimmed === "ROLLBACK") {
            txSnap = null;
            if (releaseLock) {
              releaseLock();
              releaseLock = null;
            }
            return { rows: [] };
          }
          const target = txSnap ?? state;
          return execOnSnapshot(target, text, params);
        },
        release() {
          if (releaseLock) {
            releaseLock();
            releaseLock = null;
          }
        },
      };
    },
  };

  async function sqlTag(strings, ...values) {
    const q = strings.join("?").replace(/\s+/g, " ").trim();

    if (q.includes("INSERT INTO sessions")) {
      const [identity_id, token_hash, expires_at] = values;
      const id = crypto.randomUUID();
      state.sessions.set(token_hash, {
        id,
        identity_id,
        token_hash,
        expires_at,
        revoked_at: null,
      });
      return [];
    }

    if (q.includes("INSERT INTO handoff_tokens")) {
      const [handle, nonce, expires_at] = values;
      state.handoffs.push({ handle, nonce, expires_at, consumed: false });
      return [];
    }

    if (q.includes("FROM sessions s") && q.includes("JOIN youniverse_identities i")) {
      const s = state.sessions.get(values[0]);
      if (!s) return [];
      const i = state.identities.get(s.identity_id);
      if (!i) return [];
      return [
        {
          session_id: s.id,
          identity_id: s.identity_id,
          expires_at: s.expires_at,
          revoked_at: s.revoked_at,
          username: i.username,
          plan: i.plan,
          is_live: i.is_live,
          email_verified_at: i.email_verified_at,
        },
      ];
    }

    if (q.includes("FROM sessions") && q.includes("WHERE token_hash =")) {
      const s = state.sessions.get(values[0]);
      return s ? [s] : [];
    }

    if (q.includes("FROM youniverse_identities") && q.includes("WHERE username =")) {
      const match = Array.from(state.identities.values()).find((i) => i.username === values[0]);
      return match ? [match] : [];
    }

    if (q.includes("FROM youniverse_identities") && q.includes("WHERE identity_id =")) {
      const match = state.identities.get(values[0]);
      return match ? [match] : [];
    }

    if (q.includes("FROM public.identity_entitlements")) {
      return state.entitlements.filter(
        (e) => e.identity_id === values[0] && e.status === "active"
      );
    }

    if (q.includes("FROM public.genesis_awards") && q.includes("WHERE identity_id =")) {
      const a = state.awards.get(GENESIS_AWARD_SLOT);
      return a && a.identity_id === values[0] ? [a] : [];
    }

    if (q.includes("FROM public.genesis_awards") && q.includes("LEFT JOIN")) {
      const a = state.awards.get(GENESIS_AWARD_SLOT);
      if (!a) return [];
      const ident = state.identities.get(a.identity_id);
      return [
        {
          award_label: a.award_label,
          official_title: a.official_title,
          awarded_at: a.awarded_at,
          handle: ident?.username ?? a.awarded_username,
          subdomain: ident?.subdomain ?? `${a.awarded_username}.itsyouonline.com`,
        },
      ];
    }

    if (q.includes("FROM public.genesis_program_state")) {
      return [state.program];
    }

    if (q.includes("FROM public.founding_angel_memberships")) {
      const fm = state.foundingMemberships.get(values[0]);
      return fm ? [fm] : [];
    }

    if (q.includes("UPDATE public.genesis_awards SET ceremony_seen_at")) {
      const a = state.awards.get(GENESIS_AWARD_SLOT);
      if (!a || a.identity_id !== values[0]) return [];
      a.ceremony_seen_at = a.ceremony_seen_at ?? new Date().toISOString();
      return [{ ceremony_seen_at: a.ceremony_seen_at }];
    }

    return [];
  }

  function seedIdentity({
    identityId,
    username,
    email,
    plan = "free",
    isLive = true,
    identityType = "person",
    verifiedAt = null,
    createdAt = null,
    token,
    expired = false,
  }) {
    state.identities.set(identityId, {
      identity_id: identityId,
      username,
      display_name: username,
      subdomain: `${username}.itsyouonline.com`,
      identity_type: identityType,
      email,
      plan,
      is_live: isLive,
      email_verified_at: verifiedAt,
      created_at: createdAt ?? verifiedAt ?? new Date().toISOString(),
    });
    if (token) {
      const tokenId = crypto.randomUUID();
      state.tokens.set(tokenId, {
        id: tokenId,
        identity_id: identityId,
        token_hash: hashToken(token),
        expires_at: new Date(Date.now() + (expired ? -60_000 : 3_600_000)).toISOString(),
        consumed_at: null,
      });
    }
  }

  return {
    get state() {
      return state;
    },
    pool,
    sqlTag,
    seedIdentity,
  };
}

function mockReqRes({ method = "GET", headers = {}, query = {}, params = {}, url = "" } = {}) {
  const req = { method, headers, query, params, url };
  let statusCode = 200;
  let body = null;
  const responseHeaders = {};
  const res = {
    setHeader(k, v) {
      responseHeaders[k] = v;
      return res;
    },
    status(c) {
      statusCode = c;
      return res;
    },
    json(d) {
      body = d;
      return res;
    },
    get statusCode() {
      return statusCode;
    },
    get body() {
      return body;
    },
    get headers() {
      return responseHeaders;
    },
  };
  return { req, res };
}

test("1. First eligible claimant receives Genesis 001 + lifetime entitlement", async () => {
  const db = createTransactionalSimDb({ eligibleAfter: "2026-11-12T00:00:00.000Z" });
  const rawToken = "tok_first_person_" + crypto.randomBytes(8).toString("hex");

  db.seedIdentity({
    identityId: "id_alice",
    username: "alice",
    email: "alice@proton.me",
    token: rawToken,
  });

  const { req, res } = mockReqRes({
    method: "GET",
    query: { token: rawToken },
    headers: { host: "itsyouonline.com" },
  });

  await verifyHandler(req, res, {
    sql: db.sqlTag,
    pool: db.pool,
    isProduction: true,
  });

  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual(res.body.success, true);
  assert.strictEqual(Object.prototype.hasOwnProperty.call(res.body, "genesisAwarded"), false);

  const award = db.state.awards.get(GENESIS_AWARD_SLOT);
  assert.ok(award, "Genesis 001 award row must exist");
  assert.strictEqual(award.identity_id, "id_alice");
  assert.strictEqual(award.award_label, GENESIS_DESIGNATION);
  assert.strictEqual(award.official_title, GENESIS_OFFICIAL_TITLE);
  assert.strictEqual(db.state.entitlements.length, 1);
  assert.strictEqual(db.state.entitlements[0].entitlement_key, GENESIS_ENTITLEMENT_KEY);
  assert.strictEqual(db.state.entitlements[0].is_lifetime, true);
});

test("2. Subsequent claimants complete normally without receiving Genesis 001", async () => {
  const db = createTransactionalSimDb({ eligibleAfter: "2026-11-12T00:00:00.000Z" });
  const tok1 = "tok_1_" + crypto.randomBytes(6).toString("hex");
  const tok2 = "tok_2_" + crypto.randomBytes(6).toString("hex");

  db.seedIdentity({ identityId: "id_1", username: "first", email: "one@gmail.com", token: tok1 });
  db.seedIdentity({ identityId: "id_2", username: "second", email: "two@gmail.com", token: tok2 });

  const r1 = mockReqRes({ query: { token: tok1 }, headers: { host: "itsyouonline.com" } });
  await verifyHandler(r1.req, r1.res, { sql: db.sqlTag, pool: db.pool, isProduction: true });
  assert.strictEqual(r1.res.statusCode, 200);
  assert.strictEqual(db.state.awards.get(GENESIS_AWARD_SLOT)?.identity_id, "id_1");

  const r2 = mockReqRes({ query: { token: tok2 }, headers: { host: "itsyouonline.com" } });
  await verifyHandler(r2.req, r2.res, { sql: db.sqlTag, pool: db.pool, isProduction: true });
  assert.strictEqual(r2.res.statusCode, 200);
  assert.strictEqual(r2.res.body.success, true);
  assert.strictEqual(r2.res.body.sessionToken, undefined, "Raw sessionToken must not be exposed in JSON body");
  assert.match(String(r2.res.headers["Set-Cookie"] ?? ""), /__youniverse_session=[^;]+.*HttpOnly/i, "Second claimant must receive HttpOnly session cookie");
  assert.ok(r2.res.body.handoffToken);
  assert.strictEqual(db.state.awards.size, 1);
  assert.strictEqual(db.state.awards.get(GENESIS_AWARD_SLOT).identity_id, "id_1");
});

test("3. Concurrent eligible claims produce exactly one winner and allow losers through", async () => {
  const db = createTransactionalSimDb({ eligibleAfter: "2026-11-12T00:00:00.000Z" });
  const tokens = Array.from({ length: 5 }, (_, idx) => {
    const t = `tok_race_${idx}_${crypto.randomBytes(6).toString("hex")}`;
    db.seedIdentity({
      identityId: `id_race_${idx}`,
      username: `racer${idx}`,
      email: `racer${idx}@gmail.com`,
      token: t,
    });
    return t;
  });

  const results = await Promise.all(
    tokens.map(async (tok) => {
      const r = mockReqRes({ query: { token: tok }, headers: { host: "itsyouonline.com" } });
      await verifyHandler(r.req, r.res, { sql: db.sqlTag, pool: db.pool, isProduction: true });
      return r.res;
    })
  );

  for (const r of results) {
    assert.strictEqual(r.statusCode, 200);
    assert.strictEqual(r.body.success, true);
    assert.strictEqual(r.body.sessionToken, undefined);
    assert.match(String(r.headers["Set-Cookie"] ?? ""), /__youniverse_session=[^;]+.*HttpOnly/i);
    assert.ok(r.body.handoffToken);
  }
  assert.strictEqual(db.state.awards.size, 1, "Exactly one concurrent verification may win Genesis 001");
  assert.strictEqual(db.state.entitlements.length, 1);
});

test("4. Duplicate verification token replay fails closed without extra awards", async () => {
  const db = createTransactionalSimDb({ eligibleAfter: "2026-11-12T00:00:00.000Z" });
  const tok = "tok_dup_" + crypto.randomBytes(6).toString("hex");
  db.seedIdentity({ identityId: "id_dup", username: "dupuser", email: "dup@gmail.com", token: tok });

  const first = mockReqRes({ query: { token: tok }, headers: { host: "itsyouonline.com" } });
  await verifyHandler(first.req, first.res, { sql: db.sqlTag, pool: db.pool, isProduction: true });
  assert.strictEqual(first.res.statusCode, 200);
  assert.strictEqual(db.state.awards.get(GENESIS_AWARD_SLOT)?.identity_id, "id_dup");

  const replay = mockReqRes({ query: { token: tok }, headers: { host: "itsyouonline.com" } });
  await verifyHandler(replay.req, replay.res, { sql: db.sqlTag, pool: db.pool, isProduction: true });
  assert.strictEqual(replay.res.statusCode, 401);
  assert.strictEqual(replay.res.body.error, "token_already_consumed");
  assert.strictEqual(db.state.awards.size, 1);
});

test("5. Unverified or expired claims cannot receive Genesis 001", async () => {
  const db = createTransactionalSimDb({ eligibleAfter: "2026-11-12T00:00:00.000Z" });
  const expiredTok = "tok_exp_" + crypto.randomBytes(6).toString("hex");

  db.seedIdentity({
    identityId: "id_unverified",
    username: "pendingonly",
    email: "pending@gmail.com",
    token: null,
  });
  db.seedIdentity({
    identityId: "id_expired",
    username: "expireduser",
    email: "expired@gmail.com",
    token: expiredTok,
    expired: true,
  });

  const expRes = mockReqRes({ query: { token: expiredTok }, headers: { host: "itsyouonline.com" } });
  await verifyHandler(expRes.req, expRes.res, { sql: db.sqlTag, pool: db.pool, isProduction: true });
  assert.strictEqual(expRes.res.statusCode, 401);
  assert.strictEqual(expRes.res.body.error, "token_expired");
  assert.strictEqual(db.state.awards.size, 0);
});

test("6. Non-production runtime never awards Genesis 001", async () => {
  // Pure predicate matrix
  assert.strictEqual(isProductionGenesisRuntime({ NODE_ENV: "development" }), false);
  assert.strictEqual(isProductionGenesisRuntime({ VERCEL_ENV: "preview" }), false);
  assert.strictEqual(isProductionGenesisRuntime({ VERCEL_ENV: "production" }), true);
  assert.strictEqual(isProductionGenesisRuntime({ VERCEL_ENV: "preview", NODE_ENV: "production" }), false);
  assert.strictEqual(isProductionGenesisRuntime({ NODE_ENV: "production" }), false);
  assert.strictEqual(isProductionGenesisRuntime({ VERCEL_ENV: "development", NODE_ENV: "production" }), false);
  assert.strictEqual(isProductionGenesisRuntime({}), false);

  const prevVercelEnv = process.env.VERCEL_ENV;
  const prevNodeEnv = process.env.NODE_ENV;

  try {
    // Subtest A: Preview runtime fails closed even when NODE_ENV=production
    process.env.VERCEL_ENV = "preview";
    process.env.NODE_ENV = "production";
    const dbPreview = createTransactionalSimDb({ eligibleAfter: "2026-11-12T00:00:00.000Z" });
    const tokPrev = "tok_prev_" + crypto.randomBytes(6).toString("hex");
    dbPreview.seedIdentity({
      identityId: "id_prev",
      username: "previewuser",
      email: "previewuser@gmail.com",
      token: tokPrev,
    });
    const resPrev = mockReqRes({ query: { token: tokPrev }, headers: { host: "portals-preview.vercel.app" } });
    await verifyHandler(resPrev.req, resPrev.res, {
      sql: dbPreview.sqlTag,
      pool: dbPreview.pool,
      signHandoffToken: () => "mock_handoff_token",
    });
    assert.strictEqual(resPrev.res.statusCode, 200);
    assert.strictEqual(dbPreview.state.awards.size, 0, "Preview runtime must NEVER allocate Genesis 001");

    // Subtest B: Local execution fails closed (VERCEL_ENV not set)
    delete process.env.VERCEL_ENV;
    process.env.NODE_ENV = "development";
    const dbLocal = createTransactionalSimDb({ eligibleAfter: "2026-11-12T00:00:00.000Z" });
    const tokLocal = "tok_local_" + crypto.randomBytes(6).toString("hex");
    dbLocal.seedIdentity({
      identityId: "id_local",
      username: "localuser",
      email: "localuser@gmail.com",
      token: tokLocal,
    });
    const resLocal = mockReqRes({ query: { token: tokLocal }, headers: { host: "localhost:5173" } });
    await verifyHandler(resLocal.req, resLocal.res, {
      sql: dbLocal.sqlTag,
      pool: dbLocal.pool,
    });
    assert.strictEqual(resLocal.res.statusCode, 200);
    assert.strictEqual(dbLocal.state.awards.size, 0, "Local execution without VERCEL_ENV must NEVER allocate Genesis 001");

    // Subtest C: Injected isProduction=true CANNOT authorize Genesis outside genuine Vercel Production
    process.env.VERCEL_ENV = "preview";
    process.env.NODE_ENV = "production";
    const dbInjected = createTransactionalSimDb({ eligibleAfter: "2026-11-12T00:00:00.000Z" });
    const tokInj = "tok_inj_" + crypto.randomBytes(6).toString("hex");
    dbInjected.seedIdentity({
      identityId: "id_inj",
      username: "injecteduser",
      email: "injecteduser@gmail.com",
      token: tokInj,
    });
    const resInj = mockReqRes({ query: { token: tokInj }, headers: { host: "portals-preview.vercel.app" } });
    await verifyHandler(resInj.req, resInj.res, {
      sql: dbInjected.sqlTag,
      pool: dbInjected.pool,
      isProduction: true, // INJECTED TRUE on Preview
      signHandoffToken: () => "mock_handoff_token",
    });
    assert.strictEqual(resInj.res.statusCode, 200);
    assert.strictEqual(dbInjected.state.awards.size, 0, "Injected isProduction=true MUST NOT bypass non-production VERCEL_ENV");

    // Also test direct consumeVerificationTokenWithGenesis call with injected isProduction=true on preview
    const tokDirect = "tok_direct_" + crypto.randomBytes(6).toString("hex");
    dbInjected.seedIdentity({
      identityId: "id_direct",
      username: "directuser",
      email: "directuser@gmail.com",
      token: tokDirect,
    });
    const directRes = await consumeVerificationTokenWithGenesis({
      pool: dbInjected.pool,
      rawToken: tokDirect,
      isProduction: true, // INJECTED TRUE on Preview
    });
    assert.strictEqual(directRes.ok, true);
    assert.strictEqual(directRes.genesisAwarded, false, "Direct consumeVerificationTokenWithGenesis with isProduction=true must reject outside genuine Production");
    assert.strictEqual(dbInjected.state.awards.size, 0);

    // Subtest D: Genuine Vercel Production passes the environment check and authorizes Genesis
    process.env.VERCEL_ENV = "production";
    process.env.NODE_ENV = "production";
    const dbProd = createTransactionalSimDb({ eligibleAfter: "2026-11-12T00:00:00.000Z" });
    const tokProd = "tok_prod_" + crypto.randomBytes(6).toString("hex");
    dbProd.seedIdentity({
      identityId: "id_prod",
      username: "produser",
      email: "produser@gmail.com",
      token: tokProd,
    });
    const resProd = mockReqRes({ query: { token: tokProd }, headers: { host: "itsyouonline.com" } });
    await verifyHandler(resProd.req, resProd.res, {
      sql: dbProd.sqlTag,
      pool: dbProd.pool,
      signHandoffToken: () => "mock_handoff_token",
    });
    assert.strictEqual(resProd.res.statusCode, 200);
    assert.strictEqual(dbProd.state.awards.size, 1, "Genuine Vercel Production MUST authorize Genesis 001");
    assert.strictEqual(dbProd.state.awards.get(GENESIS_AWARD_SLOT)?.identity_id, "id_prod");
  } finally {
    if (prevVercelEnv !== undefined) process.env.VERCEL_ENV = prevVercelEnv; else delete process.env.VERCEL_ENV;
    if (prevNodeEnv !== undefined) process.env.NODE_ENV = prevNodeEnv; else delete process.env.NODE_ENV;
  }
});

test("7. Internal/itsyouonline.com emails are excluded; external pre-existing users are eligible candidates", async () => {
  const db = createTransactionalSimDb();

  // Internal emails (itsyouonline.com domain) are ALWAYS excluded by email gate
  const internalOnly = [
    { id: "iF6hqzhNHjAD7AJ_DBYkq", handle: "phase11-test-2026", email: "test@itsyouonline.com" },
    { id: "f_iLGnF9aJ5aL61BuCoFg", handle: "creatoroftheyouniverse", email: "cr@itsyouonline.com" },
  ];
  for (const h of internalOnly) {
    const tok = `tok_hist_${h.handle}`;
    db.seedIdentity({ identityId: h.id, username: h.handle, email: h.email, token: tok });
    const out = await consumeVerificationTokenWithGenesis({ pool: db.pool, rawToken: tok, isProduction: true });
    assert.strictEqual(out.ok, true);
    assert.strictEqual(out.genesisAwarded, false, `Internal email @${h.handle} must never receive Genesis 001`);
  }

  // External-email pre-existing users have no special timestamp exclusion.
  // They're legitimate candidates: whoever verifies first (with setup complete + program enabled) wins.
  const externalHistorical = [
    { id: "0XYhTLe2eQoOb40kF7ayX", handle: "trader", email: "kl@gmail.com" },
    { id: "osrwu_ueKHulDCB50Anmw", handle: "sean", email: "it@gmail.com" },
  ];
  let firstWinner = null;
  for (const h of externalHistorical) {
    const tok = `tok_hist_ext_${h.handle}`;
    db.seedIdentity({ identityId: h.id, username: h.handle, email: h.email, token: tok });
    const out = await consumeVerificationTokenWithGenesis({ pool: db.pool, rawToken: tok, isProduction: true });
    assert.strictEqual(out.ok, true);
    if (firstWinner === null && out.genesisAwarded) {
      firstWinner = h.handle;
    }
  }
  // Exactly one external-historical user wins Genesis (first to verify), second does not
  assert.strictEqual(db.state.awards.size, 1, "Exactly one Genesis 001 must be awarded among eligible external users");
  assert.strictEqual(db.state.awards.get(GENESIS_AWARD_SLOT)?.identity_id, externalHistorical[0].id,
    "First verifier wins Genesis 001");
});

test("8. Internal/test emails are excluded while legitimate handles are allowed", async () => {
  assert.strictEqual(isEligibleGenesisEmail("team@itsyouonline.com"), false);
  assert.strictEqual(isEligibleGenesisEmail("smoke@sub.itsyouonline.com"), false);
  assert.strictEqual(isEligibleGenesisEmail("user@example.com"), false);
  assert.strictEqual(isEligibleGenesisEmail("user+test@gmail.com"), false);
  assert.strictEqual(isEligibleGenesisEmail("smoke-runner@gmail.com"), false);
  assert.strictEqual(isEligibleGenesisEmail("founder@gmail.com"), true);

  const db = createTransactionalSimDb({ eligibleAfter: "2026-11-12T00:00:00.000Z" });
  const badTok = "tok_internal_" + crypto.randomBytes(4).toString("hex");
  const goodTok = "tok_legit_name_" + crypto.randomBytes(4).toString("hex");

  db.seedIdentity({
    identityId: "id_internal",
    username: "internaluser",
    email: "ops@itsyouonline.com",
    token: badTok,
  });
  // Handle literally named 'testpilot' with a legitimate non-test email must NOT be rejected
  db.seedIdentity({
    identityId: "id_testpilot",
    username: "testpilot",
    email: "founder@icloud.com",
    token: goodTok,
  });

  const internalRes = mockReqRes({ query: { token: badTok }, headers: { host: "itsyouonline.com" } });
  await verifyHandler(internalRes.req, internalRes.res, { sql: db.sqlTag, pool: db.pool, isProduction: true });
  assert.strictEqual(internalRes.res.statusCode, 200);
  assert.strictEqual(db.state.awards.size, 0);

  const legitRes = mockReqRes({ query: { token: goodTok }, headers: { host: "itsyouonline.com" } });
  await verifyHandler(legitRes.req, legitRes.res, { sql: db.sqlTag, pool: db.pool, isProduction: true });
  assert.strictEqual(legitRes.res.statusCode, 200);
  assert.strictEqual(db.state.awards.get(GENESIS_AWARD_SLOT).awarded_username, "testpilot");
});

test("9 & 10. Subscription changes never revoke Genesis; sibling handles do not inherit it", async () => {
  const db = createTransactionalSimDb({ eligibleAfter: "2026-11-12T00:00:00.000Z" });
  const winTok = "tok_win_sub_" + crypto.randomBytes(4).toString("hex");
  const siblingTok = "tok_sib_sub_" + crypto.randomBytes(4).toString("hex");

  db.seedIdentity({
    identityId: "id_winner_main",
    username: "firstperson",
    email: "first@domain.co",
    plan: "free",
    token: winTok,
  });

  await consumeVerificationTokenWithGenesis({ pool: db.pool, rawToken: winTok, isProduction: true });

  // Winner later claims a second Youniverse handle with the SAME email (paid pack)
  db.seedIdentity({
    identityId: "id_winner_second_handle",
    username: "secondstudio",
    email: "first@domain.co",
    plan: "starter",
    token: siblingTok,
  });
  await consumeVerificationTokenWithGenesis({ pool: db.pool, rawToken: siblingTok, isProduction: true });

  // Simulate ordinary subscription upgrades & cancellation on winner identity
  for (const plan of ["starter", "platoon", "free", "canceled"]) {
    db.state.identities.get("id_winner_main").plan = plan;
    const ent = await resolveIdentityEntitlements(db.sqlTag, "id_winner_main", plan);
    assert.strictEqual(ent.hasLifetimeGenesisAccess, true);
    assert.strictEqual(ent.effectiveTier, "platoon");
    assert.strictEqual(ent.genesis.isWinner, true);
  }

  // Sibling handle owned by same email must NOT inherit Genesis 001 lifetime access
  const siblingEnt = await resolveIdentityEntitlements(db.sqlTag, "id_winner_second_handle", "free");
  assert.strictEqual(siblingEnt.hasLifetimeGenesisAccess, false);
  assert.strictEqual(siblingEnt.genesis.isWinner, false);
  assert.strictEqual(siblingEnt.effectiveTier, "free");
});

test("11 & 12. Ceremony acknowledgment survives refresh, non-winner blocked, and replay leaves award unchanged", async () => {
  const db = createTransactionalSimDb({ eligibleAfter: "2026-11-12T00:00:00.000Z" });
  const winTok = "tok_ceremony_" + crypto.randomBytes(4).toString("hex");
  const winSession = "sess_win_" + crypto.randomBytes(12).toString("hex");
  const loserSession = "sess_lose_" + crypto.randomBytes(12).toString("hex");

  db.seedIdentity({ identityId: "id_ceremony_win", username: "one", email: "one@real.org", token: winTok });
  db.seedIdentity({
    identityId: "id_ceremony_lose",
    username: "two",
    email: "two@real.org",
    verifiedAt: "2026-11-12T00:10:00.000Z",
  });

  await consumeVerificationTokenWithGenesis({ pool: db.pool, rawToken: winTok, isProduction: true });

  db.state.sessions.set(hashToken(winSession), {
    id: "s1",
    identity_id: "id_ceremony_win",
    token_hash: hashToken(winSession),
    expires_at: new Date(Date.now() + 86400_000).toISOString(),
    revoked_at: null,
  });
  db.state.sessions.set(hashToken(loserSession), {
    id: "s2",
    identity_id: "id_ceremony_lose",
    token_hash: hashToken(loserSession),
    expires_at: new Date(Date.now() + 86400_000).toISOString(),
    revoked_at: null,
  });

  const beforeAwardSnapshot = { ...db.state.awards.get(GENESIS_AWARD_SLOT) };
  assert.strictEqual(beforeAwardSnapshot.ceremony_seen_at, null);

  // Simulated browser refresh BEFORE acknowledgment: ceremonyPending remains true
  const ctxBefore = mockReqRes({
    headers: { authorization: `Bearer ${winSession}` },
    params: { handle: "one" },
  });
  await contextHandler(ctxBefore.req, ctxBefore.res, { sql: db.sqlTag, databaseUrl: "mock://db" });
  assert.strictEqual(ctxBefore.res.body.entitlements.genesis.ceremonyPending, true);

  // Non-winner cannot acknowledge
  const ackLose = mockReqRes({
    method: "POST",
    query: { action: "acknowledge" },
    headers: { authorization: `Bearer ${loserSession}` },
  });
  await genesisHandler(ackLose.req, ackLose.res, { sql: db.sqlTag, databaseUrl: "mock://db" });
  assert.strictEqual(ackLose.res.statusCode, 404);

  // Winner acknowledges ceremony
  const ackWin = mockReqRes({
    method: "POST",
    query: { action: "acknowledge" },
    headers: { authorization: `Bearer ${winSession}` },
  });
  await genesisHandler(ackWin.req, ackWin.res, { sql: db.sqlTag, databaseUrl: "mock://db" });
  assert.strictEqual(ackWin.res.statusCode, 200);
  assert.strictEqual(ackWin.res.body.acknowledged, true);
  assert.ok(ackWin.res.body.ceremonySeenAt);

  // Subsequent refresh confirms ceremonyPending is false
  const ctxAfter = mockReqRes({
    headers: { authorization: `Bearer ${winSession}` },
    params: { handle: "one" },
  });
  await contextHandler(ctxAfter.req, ctxAfter.res, { sql: db.sqlTag, databaseUrl: "mock://db" });
  assert.strictEqual(ctxAfter.res.body.entitlements.genesis.ceremonyPending, false);

  // Public profile badge & public registry expose designation/handle without leaking email/tokens
  const pubRes = mockReqRes({ params: { handle: "one" } });
  await publicHandler(pubRes.req, pubRes.res, { sql: db.sqlTag, databaseUrl: "mock://db" });
  assert.strictEqual(pubRes.res.statusCode, 200);
  assert.strictEqual(pubRes.res.body.youniverse.badges[0].designation, "GENESIS 001");
  assert.strictEqual(JSON.stringify(pubRes.res.body).includes("one@real.org"), false);

  const regRes = mockReqRes({ method: "GET", query: { action: "registry" } });
  await genesisHandler(regRes.req, regRes.res, { sql: db.sqlTag, databaseUrl: "mock://db" });
  assert.strictEqual(regRes.res.statusCode, 200);
  assert.strictEqual(regRes.res.body.registry.winner.handle, "one");
  assert.strictEqual(JSON.stringify(regRes.res.body).includes("one@real.org"), false);

  // Historical award identity/timestamps unchanged
  const finalAward = db.state.awards.get(GENESIS_AWARD_SLOT);
  assert.strictEqual(finalAward.identity_id, beforeAwardSnapshot.identity_id);
  assert.strictEqual(finalAward.awarded_username, beforeAwardSnapshot.awarded_username);
  assert.strictEqual(finalAward.awarded_at, beforeAwardSnapshot.awarded_at);
});

test("13. Fault injection inside verification rolls back token, identity verification, award, and entitlement together", async () => {
  const db = createTransactionalSimDb({ eligibleAfter: "2026-11-12T00:00:00.000Z" });
  const tok = "tok_rb_" + crypto.randomBytes(6).toString("hex");
  db.seedIdentity({ identityId: "id_rb", username: "rollbackuser", email: "rb@gmail.com", token: tok });

  await assert.rejects(
    async () => {
      await consumeVerificationTokenWithGenesis({
        pool: db.pool,
        rawToken: tok,
        isProduction: true,
        beforeCommitHook: async () => {
          throw new Error("Simulated mid-transaction crash");
        },
      });
    },
    /Simulated mid-transaction crash/
  );

  // Verify complete atomic rollback across ALL four state pieces
  const [tokRow] = Array.from(db.state.tokens.values());
  assert.strictEqual(tokRow.consumed_at, null, "Token must remain unconsumed after rollback");
  assert.strictEqual(db.state.identities.get("id_rb").email_verified_at, null, "Identity must remain unverified");
  assert.strictEqual(db.state.awards.size, 0, "Genesis award must roll back");
  assert.strictEqual(db.state.entitlements.length, 0, "Entitlement grant must roll back");
});

test("14. Migration 008 DDL, Rollback guard, Ceremony copy, and Dispatcher structure invariants", () => {
  const m008 = fs.readFileSync("db/migrations/008_genesis_001.sql", "utf8");
  const rb008 = fs.readFileSync("db/migrations/008_rollback_genesis_001.sql", "utf8");
  const ceremony = fs.readFileSync("components/genesis/GenesisCeremonyModal.tsx", "utf8");

  assert.match(m008, /program_key = 'genesis_001'/);
  assert.match(m008, /award_slot = 'genesis_001'/);
  assert.match(m008, /eligible_verified_after >= TIMESTAMPTZ '2026-11-12T01:47:35Z'/);
  assert.match(m008, /source_environment = 'production'/);
  assert.match(m008, /identity_entitlements_singleton_genesis_idx/);
  assert.match(rb008, /Rollback blocked: public\.genesis_awards/);

  assert.match(ceremony, /Before there were many, there was one\./);
  assert.match(ceremony, /Welcome to The Youniverse\./);
  assert.match(ceremony, /You are the First Person\./);
  assert.match(ceremony, /Your Youniverse is Genesis 001\./);
  assert.match(ceremony, /Your place in the history of The Youniverse is permanent\./);
});

test("15. Founding Angels platform setup fails closed when table, row, or completion is missing", async () => {
  // Case A: Table/row missing entirely
  const dbNoSetup = createTransactionalSimDb({
    foundingAngelsPlatformSetup: null,
  });
  const tokA = "tok_nosetup_" + crypto.randomBytes(6).toString("hex");
  dbNoSetup.seedIdentity({ identityId: "id_nosetup", username: "nosetup", email: "nosetup@gmail.com", token: tokA });
  const resA = mockReqRes({ query: { token: tokA }, headers: { host: "itsyouonline.com" } });
  await verifyHandler(resA.req, resA.res, { sql: dbNoSetup.sqlTag, pool: dbNoSetup.pool, isProduction: true });
  assert.strictEqual(resA.res.statusCode, 200, "Verification itself succeeds");
  assert.strictEqual(dbNoSetup.state.awards.size, 0, "Genesis 001 must NOT be awarded when setup table/record is absent");

  // Case B: Table present but is_completed is false
  const dbIncomplete = createTransactionalSimDb({
    foundingAngelsPlatformSetup: {
      setup_key: "founding_angels",
      is_completed: false,
      completed_at: null,
    },
  });
  const tokB = "tok_incomp_" + crypto.randomBytes(6).toString("hex");
  dbIncomplete.seedIdentity({ identityId: "id_incomp", username: "incomp", email: "incomp@gmail.com", token: tokB });
  const resB = mockReqRes({ query: { token: tokB }, headers: { host: "itsyouonline.com" } });
  await verifyHandler(resB.req, resB.res, { sql: dbIncomplete.sqlTag, pool: dbIncomplete.pool, isProduction: true });
  assert.strictEqual(resB.res.statusCode, 200);
  assert.strictEqual(dbIncomplete.state.awards.size, 0, "Genesis 001 must NOT be awarded when is_completed is false");
});

test("16. Genesis winner is NOT required to be an individual Founding Angel member", async () => {
  const db = createTransactionalSimDb({
    eligibleAfter: "2026-11-12T00:00:00.000Z",
    foundingAngelsPlatformSetup: {
      setup_key: "founding_angels",
      is_completed: true,
      completed_at: "2026-11-11T23:00:00.000Z",
    },
  });
  const tok = "tok_nonmember_" + crypto.randomBytes(6).toString("hex");
  db.seedIdentity({ identityId: "id_nonmember", username: "nonmember", email: "nonmember@gmail.com", token: tok });

  // Zero founding angel memberships exist for this identity
  assert.strictEqual(db.state.foundingMemberships.size, 0);

  const res = mockReqRes({ query: { token: tok }, headers: { host: "itsyouonline.com" } });
  await verifyHandler(res.req, res.res, { sql: db.sqlTag, pool: db.pool, isProduction: true });
  assert.strictEqual(res.res.statusCode, 200);
  assert.strictEqual(db.state.awards.size, 1, "Genesis 001 is awarded based on platform readiness, not individual membership");
  assert.strictEqual(db.state.awards.get(GENESIS_AWARD_SLOT).identity_id, "id_nonmember");
});

test("17. Sibling handles and secondary identities cannot inherit Genesis 001", async () => {
  const db = createTransactionalSimDb({
    eligibleAfter: "2026-11-12T00:00:00.000Z",
    foundingAngelsPlatformSetup: {
      setup_key: "founding_angels",
      is_completed: true,
      completed_at: "2026-11-11T23:00:00.000Z",
    },
  });

  const tokPrimary = "tok_primary_" + crypto.randomBytes(6).toString("hex");
  const tokSecondary = "tok_secondary_" + crypto.randomBytes(6).toString("hex");

  db.seedIdentity({ identityId: "id_primary", username: "primaryhandle", email: "owner@gmail.com", token: tokPrimary });
  db.seedIdentity({ identityId: "id_secondary", username: "secondaryhandle", email: "owner@gmail.com", token: tokSecondary });

  // 1. Primary claims and wins Genesis 001
  const res1 = mockReqRes({ query: { token: tokPrimary }, headers: { host: "itsyouonline.com" } });
  await verifyHandler(res1.req, res1.res, { sql: db.sqlTag, pool: db.pool, isProduction: true });
  assert.strictEqual(db.state.awards.get(GENESIS_AWARD_SLOT)?.identity_id, "id_primary");

  // 2. Secondary verifies
  const res2 = mockReqRes({ query: { token: tokSecondary }, headers: { host: "itsyouonline.com" } });
  await verifyHandler(res2.req, res2.res, { sql: db.sqlTag, pool: db.pool, isProduction: true });

  // Secondary status check must show isWinner: false
  const secStatus = await getGenesisStatusForIdentity(db.sqlTag, "id_secondary");
  assert.strictEqual(secStatus.isWinner, false);
  assert.strictEqual(secStatus.designation, null);

  const primStatus = await getGenesisStatusForIdentity(db.sqlTag, "id_primary");
  assert.strictEqual(primStatus.isWinner, true);
  assert.strictEqual(primStatus.designation, GENESIS_DESIGNATION);
});

