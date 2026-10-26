/**
 * tests/phase3-r15-verify-redirect.test.mjs
 *
 * Phase R15 — Email Verification Browser-Redirect Fix
 *
 * Scenarios:
 *  1. Successful HTML navigation → 303 to the canonical https://<handle>.itsyouonline.com/#handoff_token=…
 *  2. Successful API (JSON) request → unchanged JSON contract, no redirect.
 *  3. Invalid, expired, reused, and missing tokens never redirect (HTML or JSON).
 *  4. Handoff-ticket creation failure (nonce persistence or signing) never yields a success redirect.
 *  5. Redirect destination cannot be steered by Host / X-Forwarded-Host or a malformed handle.
 *  6. Raw verification tokens and signed handoff tickets are never logged.
 *
 * Uses the real consumeVerificationToken + createSession against an in-memory SQL mock that
 * implements the atomic CTE, so the production consumption path is exercised.
 */

import assert from "node:assert/strict";
import test from "node:test";
import crypto from "crypto";

import verifyHandler, {
  wantsHtmlNavigation,
  isTrustedRedirectDestination,
} from "../api/v1/auth/verify.ts";
import { verifyHandoffToken, HandoffConfigError } from "../lib/cryptoHandoff.ts";
import { hashToken } from "../lib/neonSession.ts";

const testKeyPair = crypto.generateKeyPairSync("rsa", {
  modulusLength: 2048,
  publicKeyEncoding: { type: "spki", format: "pem" },
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
});
process.env.HANDOFF_PRIVATE_KEY = testKeyPair.privateKey;
process.env.HANDOFF_PUBLIC_KEY = testKeyPair.publicKey;

// Default to a non-production runtime; individual tests opt into production explicitly.
delete process.env.NODE_ENV;
delete process.env.VERCEL_ENV;

const BROWSER_ACCEPT =
  "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8";

// ────────────────────────────────────────────────────────────────────────────
// Harness
// ────────────────────────────────────────────────────────────────────────────

function createMockReqRes({ method = "GET", headers = {}, query = {} } = {}) {
  const req = { method, headers, query, params: {}, body: null };
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
    json(data) {
      state.body = data;
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

function createMockDb({ failHandoffInsert = false } = {}) {
  const identities = [];
  const verificationTokens = [];
  const handoffTokens = [];
  const sessions = [];

  async function mockSql(strings, ...values) {
    const q = strings.join("?");

    // Atomic CTE (consumeVerificationToken primary path)
    if (q.includes("WITH consumed_token")) {
      const tokenHash = values[0];
      const tok = verificationTokens.find(
        (t) => t.token_hash === tokenHash && t.consumed_at === null && new Date(t.expires_at) > new Date()
      );
      if (!tok) return [];
      const ident = identities.find((i) => i.identity_id === tok.identity_id);
      if (!ident) return [];
      tok.consumed_at = new Date();
      ident.email_verified_at = new Date();
      return [{ identity_id: ident.identity_id, username: ident.username, email: ident.email }];
    }

    if (q.includes("FROM email_verification_tokens") && q.includes("WHERE token_hash =")) {
      const match = verificationTokens.find((t) => t.token_hash === values[0]);
      return match ? [match] : [];
    }

    if (q.includes("FROM youniverse_identities") && q.includes("WHERE identity_id =")) {
      const match = identities.find((i) => i.identity_id === values[0]);
      return match ? [match] : [];
    }

    if (q.includes("UPDATE email_verification_tokens") && q.includes("SET consumed_at = NOW()")) {
      const match = verificationTokens.find((t) => t.id === values[0] && t.consumed_at === null);
      if (!match) return [];
      match.consumed_at = new Date();
      return [{ id: match.id }];
    }

    if (q.includes("UPDATE youniverse_identities") && q.includes("SET email_verified_at = NOW()")) {
      const match = identities.find((i) => i.identity_id === values[0]);
      if (match) match.email_verified_at = new Date();
      return [];
    }

    if (q.includes("INSERT INTO sessions")) {
      sessions.push({ identity_id: values[0], token_hash: values[1] });
      return [];
    }

    if (q.includes("INSERT INTO handoff_tokens")) {
      if (failHandoffInsert) throw new Error("simulated handoff_tokens insert failure");
      handoffTokens.push({ handle: values[0], nonce: values[1], expires_at: new Date(values[2]), consumed: false });
      return [];
    }

    // Legacy "User" sync and anything else
    return [];
  }

  function seedIdentity({ identityId, username, expiresInMs = 86_400_000, consumed = false }) {
    const rawToken = crypto.randomBytes(32).toString("hex");
    identities.push({
      identity_id: identityId,
      username,
      email: `${username.replace(/[^a-z0-9]/g, "")}@example.invalid`,
      is_live: true,
      email_verified_at: null,
    });
    verificationTokens.push({
      id: `evt_${identityId}`,
      identity_id: identityId,
      token_hash: hashToken(rawToken),
      expires_at: new Date(Date.now() + expiresInMs),
      consumed_at: consumed ? new Date(Date.now() - 5000) : null,
    });
    return rawToken;
  }

  return { sql: mockSql, identities, verificationTokens, handoffTokens, sessions, seedIdentity };
}

async function withEnv(overrides, fn) {
  const saved = {};
  for (const k of Object.keys(overrides)) {
    saved[k] = process.env[k];
    if (overrides[k] === undefined) delete process.env[k];
    else process.env[k] = overrides[k];
  }
  try {
    return await fn();
  } finally {
    for (const k of Object.keys(saved)) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  }
}

async function captureConsole(fn) {
  const lines = [];
  const orig = { log: console.log, warn: console.warn, error: console.error, info: console.info };
  for (const m of Object.keys(orig)) {
    console[m] = (...args) => {
      lines.push(
        args
          .map((a) => (a instanceof Error ? `${a.name}: ${a.message}\n${a.stack}` : typeof a === "string" ? a : JSON.stringify(a)))
          .join(" ")
      );
    };
  }
  try {
    const result = await fn();
    return { result, logs: lines.join("\n") };
  } finally {
    Object.assign(console, orig);
  }
}

function assertNoRedirect(res, label) {
  assert.ok(res.statusCode < 300 || res.statusCode >= 400, `${label}: must not be a 3xx (got ${res.statusCode})`);
  assert.strictEqual(res.headers.location, undefined, `${label}: must not set Location`);
}

const JSON_CONTRACT_KEYS = [
  "destinationUrl",
  "handle",
  "handoffToken",
  "role",
  "sessionToken",
  "subdomain",
  "success",
];

// ────────────────────────────────────────────────────────────────────────────
// 1. Successful HTML navigation redirects to the canonical destination
// ────────────────────────────────────────────────────────────────────────────

test("R15-01: Successful HTML navigation → 303 to canonical https://<handle>.itsyouonline.com/#handoff_token", async () => {
  const db = createMockDb();
  const rawToken = db.seedIdentity({ identityId: "ident_dana", username: "dana" });

  const { req, res } = createMockReqRes({
    query: { token: rawToken },
    headers: { host: "www.itsyouonline.com", accept: BROWSER_ACCEPT },
  });

  await verifyHandler(req, res, { sql: db.sql });

  assert.strictEqual(res.statusCode, 303);
  assert.strictEqual(res.ended, true);
  assert.strictEqual(res.body, undefined, "Redirect must not carry a JSON body (no sessionToken exposure)");

  const location = res.headers.location;
  const prefix = "https://dana.itsyouonline.com/#handoff_token=";
  assert.ok(location.startsWith(prefix), `Unexpected Location: ${location.slice(0, 60)}…`);

  const url = new URL(location);
  assert.strictEqual(url.hostname, "dana.itsyouonline.com");
  assert.strictEqual(url.search, "", "Ticket must never appear in the query string");

  // Fragment carries a valid, audience-bound RS256 ticket whose nonce was persisted.
  const ticket = decodeURIComponent(location.slice(prefix.length));
  const decoded = verifyHandoffToken(ticket, "dana.itsyouonline.com");
  assert.strictEqual(decoded.handle, "dana");
  assert.strictEqual(db.handoffTokens.length, 1);
  assert.strictEqual(db.handoffTokens[0].nonce, decoded.nonce);

  // Token consumed exactly once; identity verified.
  assert.ok(db.verificationTokens[0].consumed_at instanceof Date);
  assert.ok(db.identities[0].email_verified_at instanceof Date);

  assert.strictEqual(res.headers["cache-control"], "no-store");
  assert.strictEqual(res.headers["referrer-policy"], "no-referrer");
  assert.strictEqual(res.headers.vary, "Accept");
});

test("R15-01b: Sec-Fetch navigation without text/html Accept is still treated as browser navigation", async () => {
  const db = createMockDb();
  const rawToken = db.seedIdentity({ identityId: "ident_erin", username: "erin" });

  const { req, res } = createMockReqRes({
    query: { token: rawToken },
    headers: { host: "www.itsyouonline.com", "sec-fetch-mode": "navigate", "sec-fetch-dest": "document" },
  });

  await verifyHandler(req, res, { sql: db.sql });

  assert.strictEqual(res.statusCode, 303);
  assert.ok(res.headers.location.startsWith("https://erin.itsyouonline.com/#handoff_token="));
});

test("R15-01c: wantsHtmlNavigation classification", () => {
  assert.strictEqual(wantsHtmlNavigation({ headers: { accept: BROWSER_ACCEPT } }), true);
  assert.strictEqual(wantsHtmlNavigation({ headers: { accept: "*/*" } }), false, "fetch() default is JSON");
  assert.strictEqual(wantsHtmlNavigation({ headers: { accept: "application/json" } }), false);
  assert.strictEqual(wantsHtmlNavigation({ headers: {} }), false);
  assert.strictEqual(wantsHtmlNavigation({}), false);
  assert.strictEqual(
    wantsHtmlNavigation({ headers: { "sec-fetch-mode": "cors", "sec-fetch-dest": "empty" } }),
    false
  );
});

// ────────────────────────────────────────────────────────────────────────────
// 2. JSON API contract unchanged
// ────────────────────────────────────────────────────────────────────────────

for (const [label, headers] of [
  ["no Accept header", { host: "www.itsyouonline.com" }],
  ["fetch default Accept */*", { host: "www.itsyouonline.com", accept: "*/*" }],
  ["explicit application/json", { host: "www.itsyouonline.com", accept: "application/json" }],
]) {
  test(`R15-02: Successful JSON request (${label}) returns the unchanged JSON payload`, async () => {
    const db = createMockDb();
    const rawToken = db.seedIdentity({ identityId: "ident_finn", username: "finn" });

    const { req, res } = createMockReqRes({ query: { token: rawToken }, headers });
    await verifyHandler(req, res, { sql: db.sql });

    assert.strictEqual(res.statusCode, 200);
    assertNoRedirect(res, label);
    assert.deepStrictEqual(Object.keys(res.body).sort(), JSON_CONTRACT_KEYS);
    assert.strictEqual(res.body.success, true);
    assert.strictEqual(res.body.handle, "finn");
    assert.strictEqual(res.body.subdomain, "finn.itsyouonline.com");
    assert.strictEqual(res.body.role, "AUTHENTICATED_OWNER");
    assert.ok(typeof res.body.sessionToken === "string" && res.body.sessionToken.length >= 32);
    assert.strictEqual(
      res.body.destinationUrl,
      `https://finn.itsyouonline.com/#handoff_token=${encodeURIComponent(res.body.handoffToken)}`
    );
    assert.strictEqual(verifyHandoffToken(res.body.handoffToken, "finn.itsyouonline.com").handle, "finn");
    assert.strictEqual(db.sessions.length, 1);
  });
}

// ────────────────────────────────────────────────────────────────────────────
// 3. Invalid / expired / reused / missing tokens never redirect
// ────────────────────────────────────────────────────────────────────────────

test("R15-03: Invalid, expired, reused, and missing tokens do not redirect (HTML navigation)", async () => {
  const db = createMockDb();
  const expiredToken = db.seedIdentity({ identityId: "ident_exp", username: "expy", expiresInMs: -1000 });
  const consumedToken = db.seedIdentity({ identityId: "ident_used", username: "used", consumed: true });
  const headers = { host: "www.itsyouonline.com", accept: BROWSER_ACCEPT };

  const cases = [
    ["invalid", { token: crypto.randomBytes(32).toString("hex") }, 401, "invalid_token"],
    ["expired", { token: expiredToken }, 401, "token_expired"],
    ["already consumed", { token: consumedToken }, 401, "token_already_consumed"],
    ["missing", {}, 400, "token_required"],
    ["blank", { token: "   " }, 400, "token_required"],
  ];

  for (const [label, query, status, error] of cases) {
    const { req, res } = createMockReqRes({ query, headers });
    await verifyHandler(req, res, { sql: db.sql });
    assert.strictEqual(res.statusCode, status, label);
    assert.strictEqual(res.body.success, false, label);
    assert.strictEqual(res.body.error, error, label);
    assertNoRedirect(res, label);
  }

  assert.strictEqual(db.handoffTokens.length, 0, "No handoff ticket may be issued for a failed token");
  assert.strictEqual(db.sessions.length, 0, "No session may be minted for a failed token");
  assert.strictEqual(db.identities.every((i) => i.email_verified_at === null), true);
});

test("R15-03b: Replaying a token after a successful redirect is rejected without redirect", async () => {
  const db = createMockDb();
  const rawToken = db.seedIdentity({ identityId: "ident_gus", username: "gus" });
  const headers = { host: "www.itsyouonline.com", accept: BROWSER_ACCEPT };

  const first = createMockReqRes({ query: { token: rawToken }, headers });
  await verifyHandler(first.req, first.res, { sql: db.sql });
  assert.strictEqual(first.res.statusCode, 303);

  const second = createMockReqRes({ query: { token: rawToken }, headers });
  await verifyHandler(second.req, second.res, { sql: db.sql });
  assert.strictEqual(second.res.statusCode, 401);
  assert.strictEqual(second.res.body.error, "token_already_consumed");
  assertNoRedirect(second.res, "replay");
  assert.strictEqual(db.handoffTokens.length, 1, "Replay must not issue a second ticket");
});

test("R15-03c: Unsuccessful consumption (consumer reports failure) does not redirect", async () => {
  const db = createMockDb();
  const { req, res } = createMockReqRes({
    query: { token: "anything-at-all" },
    headers: { host: "www.itsyouonline.com", accept: BROWSER_ACCEPT },
  });

  await verifyHandler(req, res, {
    sql: db.sql,
    consumeVerificationToken: async () => ({ ok: false, reason: "identity_not_found" }),
  });

  assert.strictEqual(res.statusCode, 401);
  assert.strictEqual(res.body.error, "invalid_token");
  assertNoRedirect(res, "identity_not_found");
});

// ────────────────────────────────────────────────────────────────────────────
// 4. Handoff-ticket creation failure never yields a success redirect
// ────────────────────────────────────────────────────────────────────────────

test("R15-04: Handoff nonce persistence failure → no success redirect, no tokens in body", async () => {
  const db = createMockDb({ failHandoffInsert: true });
  const rawToken = db.seedIdentity({ identityId: "ident_hal", username: "hal" });

  const { req, res } = createMockReqRes({
    query: { token: rawToken },
    headers: { host: "www.itsyouonline.com", accept: BROWSER_ACCEPT },
  });

  const { logs } = await captureConsole(() => verifyHandler(req, res, { sql: db.sql }));

  assert.strictEqual(res.statusCode, 500);
  assertNoRedirect(res, "nonce insert failure");
  assert.strictEqual(res.body.success, false);
  assert.strictEqual(res.body.error, "handoff_unavailable");
  assert.strictEqual(res.body.sessionToken, undefined);
  assert.strictEqual(res.body.handoffToken, undefined);
  assert.strictEqual(res.body.destinationUrl, undefined);
  assert.ok(!logs.includes(rawToken), "Raw verification token must not be logged");
});

test("R15-04b: Handoff signing failure → handler fails, no redirect issued", async () => {
  const db = createMockDb();
  const rawToken = db.seedIdentity({ identityId: "ident_ivy", username: "ivy" });

  const { req, res } = createMockReqRes({
    query: { token: rawToken },
    headers: { host: "www.itsyouonline.com", accept: BROWSER_ACCEPT },
  });

  await assert.rejects(
    () =>
      verifyHandler(req, res, {
        sql: db.sql,
        signHandoffToken: () => {
          throw new HandoffConfigError("HANDOFF_PRIVATE_KEY is not configured.");
        },
      }),
    HandoffConfigError
  );

  assertNoRedirect(res, "signing failure");
  assert.strictEqual(res.ended, false, "No success response may be written");
});

test("R15-04c: JSON path keeps legacy non-fatal nonce-insert behavior (preserved contract)", async () => {
  const db = createMockDb({ failHandoffInsert: true });
  const rawToken = db.seedIdentity({ identityId: "ident_jo", username: "jo" });

  const { req, res } = createMockReqRes({ query: { token: rawToken }, headers: { host: "www.itsyouonline.com" } });
  await captureConsole(() => verifyHandler(req, res, { sql: db.sql }));

  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual(res.body.success, true);
  assertNoRedirect(res, "json nonce failure");
});

// ────────────────────────────────────────────────────────────────────────────
// 5. Redirect destination cannot be controlled through Host / user input
// ────────────────────────────────────────────────────────────────────────────

test("R15-05: Production — hostile Host / X-Forwarded-Host cannot change the redirect target", async () => {
  await withEnv({ NODE_ENV: "production" }, async () => {
    for (const host of ["evil.example", "localhost", "attacker.vercel.app", "kim.itsyouonline.com.evil.example"]) {
      const db = createMockDb();
      const rawToken = db.seedIdentity({ identityId: "ident_kim", username: "kim" });

      const { req, res } = createMockReqRes({
        query: { token: rawToken, redirect: "https://evil.example/", next: "//evil.example" },
        headers: {
          host,
          "x-forwarded-host": "evil.example",
          origin: "https://evil.example",
          referer: "https://evil.example/",
          accept: BROWSER_ACCEPT,
        },
      });

      await verifyHandler(req, res, { sql: db.sql });

      assert.strictEqual(res.statusCode, 303, host);
      const url = new URL(res.headers.location);
      assert.strictEqual(url.protocol, "https:", host);
      assert.strictEqual(url.hostname, "kim.itsyouonline.com", host);
      assert.strictEqual(url.pathname, "/", host);
      assert.ok(url.hash.startsWith("#handoff_token="), host);
    }
  });
});

test("R15-05b: Non-production dev host yields a same-origin relative path, never a foreign origin", async () => {
  const db = createMockDb();
  const rawToken = db.seedIdentity({ identityId: "ident_lee", username: "lee" });

  const { req, res } = createMockReqRes({
    query: { token: rawToken },
    headers: { host: "localhost.evil.example", accept: BROWSER_ACCEPT },
  });

  await verifyHandler(req, res, { sql: db.sql });

  assert.strictEqual(res.statusCode, 303);
  const location = res.headers.location;
  assert.ok(location.startsWith("/?@=lee#handoff_token="), location.slice(0, 40));
  assert.ok(!location.startsWith("//"));
  // Relative Location resolves against whatever origin the browser actually requested.
  assert.strictEqual(new URL(location, "http://localhost:5174/api/v1/auth/verify").origin, "http://localhost:5174");
});

test("R15-05c: A malformed handle that would retarget the host is refused (no redirect)", async () => {
  await withEnv({ NODE_ENV: "production" }, async () => {
    const db = createMockDb();
    const rawToken = db.seedIdentity({ identityId: "ident_evil", username: "evil.example/x" });

    const { req, res } = createMockReqRes({
      query: { token: rawToken },
      headers: { host: "www.itsyouonline.com", accept: BROWSER_ACCEPT },
    });

    const { logs } = await captureConsole(() => verifyHandler(req, res, { sql: db.sql }));

    assert.strictEqual(res.statusCode, 500);
    assert.strictEqual(res.body.error, "handoff_unavailable");
    assertNoRedirect(res, "malformed handle");
    assert.ok(!logs.includes("handoff_token="), "Destination URL (with ticket) must not be logged");
  });
});

test("R15-05d: isTrustedRedirectDestination rejects every non-canonical shape", async () => {
  assert.strictEqual(isTrustedRedirectDestination("https://mo.itsyouonline.com/#handoff_token=x", "mo"), true);
  assert.strictEqual(isTrustedRedirectDestination("/?@=mo#handoff_token=x", "mo"), true, "dev relative allowed");

  const rejects = [
    ["https://evil.com/.itsyouonline.com/#t", "evil.com/"],
    ["https://evil.com/#t", "mo"],
    ["http://mo.itsyouonline.com/#t", "mo"],
    ["https://mo.itsyouonline.com:8443/#t", "mo"],
    ["https://user:pw@mo.itsyouonline.com/#t", "mo"],
    ["https://other.itsyouonline.com/#t", "mo"],
    ["https://mo.itsyouonline.com.evil.com/#t", "mo"],
    ["//evil.com/#t", "mo"],
    ["/\\evil.com/#t", "mo"],
    ["javascript:alert(1)", "mo"],
    ["https://a.b.itsyouonline.com/#t", "a.b"],
  ];
  for (const [dest, handle] of rejects) {
    assert.strictEqual(isTrustedRedirectDestination(dest, handle), false, `${dest} / ${handle}`);
  }

  await withEnv({ NODE_ENV: "production" }, () => {
    assert.strictEqual(isTrustedRedirectDestination("/?@=mo#t", "mo"), false, "relative refused in production");
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 6. No raw verification tokens or signed tickets in logs
// ────────────────────────────────────────────────────────────────────────────

test("R15-06: Success and failure paths never log raw verification tokens or handoff tickets", async () => {
  const db = createMockDb();
  const goodToken = db.seedIdentity({ identityId: "ident_nia", username: "nia" });
  const expiredToken = db.seedIdentity({ identityId: "ident_old", username: "old", expiresInMs: -1000 });
  const headers = { host: "www.itsyouonline.com", accept: BROWSER_ACCEPT };

  const ok = createMockReqRes({ query: { token: goodToken }, headers });
  const bad = createMockReqRes({ query: { token: expiredToken }, headers });

  const { logs } = await captureConsole(async () => {
    await verifyHandler(ok.req, ok.res, { sql: db.sql });
    await verifyHandler(bad.req, bad.res, { sql: db.sql });
  });

  const ticket = decodeURIComponent(ok.res.headers.location.split("#handoff_token=")[1]);
  assert.ok(ticket.length > 100);
  assert.ok(!logs.includes(goodToken));
  assert.ok(!logs.includes(expiredToken));
  assert.ok(!logs.includes(ticket));
  assert.ok(!logs.includes(encodeURIComponent(ticket)));
});
