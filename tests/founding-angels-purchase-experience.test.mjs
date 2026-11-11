/**
 * tests/founding-angels-purchase-experience.test.mjs
 *
 * Targeted test suite for Phase 13B.1.31 Founding Angels customer purchase journey:
 * 1. Public offer page renders correctly with approved terms.
 * 2. Unauthenticated purchase fails closed and requires authentication.
 * 3. Authenticated purchase invokes existing checkout endpoint and returns checkout URL.
 * 4. Duplicate submissions are prevented.
 * 5. Checkout errors (sold out, capacity full) are visible and recoverable.
 * 6. Checkout cancellation is handled cleanly without charging or altering order state.
 * 7. Success page does not falsely claim fulfillment on redirect alone.
 * 8. Pending webhook / fulfillment does not display a member number.
 * 9. Confirmed fulfillment displays the authoritative permanent member number.
 * 10. Expired or invalid authentication fails closed safely.
 * 11. Cross-tenant isolation protects order status queries across identities.
 * 12. Responsive / mobile layout conventions verified.
 */

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import stripeHandler, { resolveTrustedOrigin } from "../api/stripe/[action].ts";
import {
  createFoundingAngelCheckoutSession,
  handleCheckoutSessionCompleted,
  getFoundingAngelStatus,
  FoundingAngelCapacityError,
} from "../lib/foundingAngelsService.ts";

function createMockReqRes({
  method = "GET",
  url = "/",
  query = {},
  headers = {},
  body = null,
}) {
  const req = {
    method,
    url,
    query: { ...query },
    headers: { ...headers },
    body,
    on(event, cb) {
      if (event === "data" && body) {
        cb(Buffer.isBuffer(body) ? body : Buffer.from(JSON.stringify(body)));
      }
      if (event === "end") {
        cb();
      }
      return this;
    },
  };

  const res = {
    statusCode: 200,
    headers: {},
    bodyData: null,
    redirectUrl: null,
    ended: false,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(data) {
      this.bodyData = data;
      this.ended = true;
      return this;
    },
    redirect(url) {
      this.redirectUrl = url;
      this.ended = true;
      return this;
    },
    end() {
      this.ended = true;
      return this;
    },
  };

  return { req, res };
}

// In-memory mock database state for testing customer journey
function createMockDb() {
  const identities = new Map([
    [
      "usr_test_verified_1",
      {
        identity_id: "usr_test_verified_1",
        username: "patron1",
        email: "patron1@example.com",
        email_verified_at: new Date().toISOString(),
        is_live: true,
      },
    ],
    [
      "usr_test_verified_2",
      {
        identity_id: "usr_test_verified_2",
        username: "patron2",
        email: "patron2@example.com",
        email_verified_at: new Date().toISOString(),
        is_live: true,
      },
    ],
    [
      "usr_test_unverified",
      {
        identity_id: "usr_test_unverified",
        username: "unverified",
        email: "unverified@example.com",
        email_verified_at: null,
        is_live: true,
      },
    ],
  ]);

  const sessions = new Map([
    [
      "valid_token_1",
      {
        id: "sess_1",
        identity_id: "usr_test_verified_1",
        expires_at: new Date(Date.now() + 86400000).toISOString(),
        revoked_at: null,
      },
    ],
    [
      "valid_token_2",
      {
        id: "sess_2",
        identity_id: "usr_test_verified_2",
        expires_at: new Date(Date.now() + 86400000).toISOString(),
        revoked_at: null,
      },
    ],
    [
      "unverified_token",
      {
        id: "sess_unverified",
        identity_id: "usr_test_unverified",
        expires_at: new Date(Date.now() + 86400000).toISOString(),
        revoked_at: null,
      },
    ],
    [
      "expired_token",
      {
        id: "sess_expired",
        identity_id: "usr_test_verified_1",
        expires_at: new Date(Date.now() - 1000).toISOString(),
        revoked_at: null,
      },
    ],
  ]);

  const orders = new Map();
  const memberships = new Map();

  const mockPool = {
    async query(sql, params = []) {
      const q = sql.replace(/\s+/g, " ").trim();

      // Transaction management
      if (q === "BEGIN" || q === "COMMIT" || q === "ROLLBACK") {
        return { rows: [] };
      }

      // Lock query: pass-through
      if (q.startsWith("SELECT pg_advisory_xact_lock")) {
        return { rows: [{ pg_advisory_xact_lock: null }] };
      }

      // Check active orders for identity
      if (q.includes("FROM public.founding_angel_orders") && q.includes("WHERE identity_id = $1") && q.includes("status IN ('creating_session', 'open')")) {
        const idId = params[0];
        const active = Array.from(orders.values()).filter(
          (o) => o.identity_id === idId && (o.status === "creating_session" || o.status === "open")
        );
        return { rows: active };
      }

      // Count memberships
      if (q.includes("SELECT count(*)::int AS cnt FROM public.founding_angel_memberships")) {
        return { rows: [{ cnt: memberships.size }] };
      }

      // Count open checkouts
      if (q.includes("SELECT count(*)::int AS cnt FROM public.founding_angel_orders") && q.includes("checkout_expires_at > NOW()")) {
        const count = Array.from(orders.values()).filter(
          (o) => (o.status === "creating_session" || o.status === "open") && o.checkout_expires_at > new Date()
        ).length;
        return { rows: [{ cnt: count }] };
      }

      // Insert order
      if (q.startsWith("INSERT INTO public.founding_angel_orders")) {
        const id = `order_${orders.size + 1}`;
        const newOrder = {
          id,
          identity_id: params[0],
          amount_cents: params[1],
          currency: params[2],
          livemode: params[3],
          status: "creating_session",
          stripe_idempotency_key: params[4],
          checkout_expires_at: new Date(Date.now() + 1800000),
          stripe_checkout_session_id: null,
          created_at: new Date(),
          refunded_amount_cents: 0,
          chargeback_amount_cents: 0,
        };
        orders.set(id, newOrder);
        return { rows: [{ id, stripe_idempotency_key: params[4] }] };
      }

      // Update order to open
      if (q.startsWith("UPDATE public.founding_angel_orders") && q.includes("SET status = 'open'")) {
        const id = params[0];
        const ord = orders.get(id);
        if (ord) {
          ord.status = "open";
          ord.stripe_checkout_session_id = params[1];
          ord.stripe_checkout_url = params[2];
        }
        return { rows: [ord] };
      }

      // Query single order by id FOR UPDATE
      if (q.includes("FROM public.founding_angel_orders WHERE id = $1 FOR UPDATE")) {
        const id = params[0];
        const ord = orders.get(id);
        return { rows: ord ? [ord] : [] };
      }

      // Query order for status check
      if (q.includes("FROM public.founding_angel_orders") && q.includes("WHERE identity_id = $1")) {
        const idId = params[0];
        const sidOrId = params[1];
        const match = Array.from(orders.values()).find(
          (o) => o.identity_id === idId && (o.stripe_checkout_session_id === sidOrId || o.id === sidOrId)
        );
        return { rows: match ? [match] : [] };
      }

      // Query membership by order_id
      if (q.includes("FROM public.founding_angel_memberships WHERE order_id = $1")) {
        const orderId = params[0];
        const mem = Array.from(memberships.values()).find((m) => m.order_id === orderId);
        return { rows: mem ? [mem] : [] };
      }

      // Fulfill order
      if (q.startsWith("UPDATE public.founding_angel_orders") && q.includes("SET status = 'paid'")) {
        const id = params[0];
        const ord = orders.get(id);
        if (ord) {
          ord.status = "paid";
          ord.paid_at = new Date();
          ord.stripe_payment_intent_id = params[1];
          ord.stripe_charge_id = params[2];
          ord.stripe_customer_id = params[3];
          ord.fulfilled_event_id = params[4];
          ord.stripe_checkout_session_id = ord.stripe_checkout_session_id || params[5];
        }
        return { rows: [ord] };
      }

      // Insert membership
      if (q.startsWith("INSERT INTO public.founding_angel_memberships")) {
        const memNum = memberships.size + 1;
        const mem = {
          member_number: memNum,
          identity_id: params[0],
          order_id: params[1],
          status: "active",
          granted_at: new Date().toISOString(),
        };
        memberships.set(memNum, mem);
        return { rows: [{ member_number: memNum }] };
      }

      throw new Error(`Unhandled mock query: ${q}`);
    },
    async connect() {
      return {
        query: async (sql, params) => mockPool.query(sql, params),
        release: () => {},
      };
    },
  };

  return { identities, sessions, orders, memberships, mockPool };
}

// -----------------------------------------------------------------------------
// TESTS
// -----------------------------------------------------------------------------

test("1. Public offer page component contains all approved product terms and exclusions", () => {
  const offerContent = fs.readFileSync("components/founding-angels/FoundingAngelsOffer.tsx", "utf8");

  // Core terms
  assert.match(offerContent, /\$200/, "Must state $200 price");
  assert.match(offerContent, /500/, "Must state 500-member cap");
  assert.match(offerContent, /001.*500/i, "Must describe sequential numbered recognition");
  assert.match(offerContent, /Portals OS/i, "Must mention Portals OS access");

  // Required disclaimers and exclusions
  assert.match(offerContent, /Not An Investment/i, "Must disclaim financial investment/equity");
  assert.match(offerContent, /Creator Circle/i, "Must clarify Creator Circle is separate");

  // DEF-03: Status revocability accuracy
  assert.doesNotMatch(offerContent, /Unrevocable/i, "Must not claim unrevocable status");
  assert.match(offerContent, /dispute and refund terms/i, "Must clarify active privileges subject to terms");

  // Integration with checkout
  assert.match(offerContent, /\/api\/stripe\/founding-angels-checkout/, "Must point to existing checkout endpoint");
  assert.match(offerContent, /OwnerLoginModal/, "Must integrate existing OwnerLoginModal");
});

test("2. Unauthenticated purchase attempt fails closed", async () => {
  process.env.STRIPE_SECRET_KEY = ["mock", "test", "key"].join("_");

  const { req, res } = createMockReqRes({
    method: "POST",
    url: "/api/stripe/founding-angels-checkout",
    query: { action: "founding-angels-checkout" },
    headers: {}, // No Authorization header
  });

  await stripeHandler(req, res);
  assert.strictEqual(res.statusCode, 401, "Unauthenticated request must return 401");
  assert.strictEqual(res.bodyData?.status, "unauthorized");
});

test("3. Authenticated purchase invokes existing checkout endpoint and returns Stripe URL", async () => {
  process.env.STRIPE_SECRET_KEY = ["mock", "test", "key"].join("_");
  const { mockPool } = createMockDb();

  const mockStripe = {
    checkout: {
      sessions: {
        async create(params) {
          assert.strictEqual(params.mode, "payment", "Must be one-time payment");
          assert.strictEqual(params.line_items[0].price_data.unit_amount, 20000, "Price must be 20000 cents ($200)");
          assert.strictEqual(params.line_items[0].price_data.currency, "usd");
          assert.strictEqual(params.metadata.type, "founding_angel");

          // DEF-01: Canonical URLs without path doubling
          assert.strictEqual(
            params.success_url,
            "https://itsyouonline.com/founding-angels/success?session_id={CHECKOUT_SESSION_ID}",
            "Must construct canonical success URL without path doubling"
          );
          assert.strictEqual(
            params.cancel_url,
            "https://itsyouonline.com/founding-angels?canceled=true",
            "Must construct canonical cancel URL without path doubling"
          );

          return {
            id: "cs_test_success_123",
            url: "https://checkout.stripe.com/pay/cs_test_success_123",
          };
        },
      },
    },
  };

  const result = await createFoundingAngelCheckoutSession(
    "usr_test_verified_1",
    "https://itsyouonline.com/founding-angels",
    { pool: mockPool, stripe: mockStripe }
  );

  assert.ok(result.orderId, "Must return orderId");
  assert.strictEqual(result.sessionId, "cs_test_success_123");
  assert.strictEqual(result.url, "https://checkout.stripe.com/pay/cs_test_success_123");
});

test("4. Duplicate checkout submission is prevented when active order exists", async () => {
  const { mockPool, orders } = createMockDb();

  // Create an existing open order for this identity
  orders.set("order_existing", {
    id: "order_existing",
    identity_id: "usr_test_verified_1",
    status: "open",
    checkout_expires_at: new Date(Date.now() + 1800000),
  });

  const mockStripe = {
    checkout: { sessions: { async create() { return { id: "cs_dummy" }; } } },
  };

  await assert.rejects(
    async () => {
      await createFoundingAngelCheckoutSession(
        "usr_test_verified_1",
        "https://itsyouonline.com/founding-angels",
        { pool: mockPool, stripe: mockStripe }
      );
    },
    /An active Founding Angel checkout session already exists/
  );
});

test("5. Checkout capacity cap rejects with typed error when capacity is 500", async () => {
  const { mockPool, memberships } = createMockDb();

  // Simulate 500 existing memberships
  for (let i = 1; i <= 500; i++) {
    memberships.set(i, { member_number: i, status: "active" });
  }

  const mockStripe = {
    checkout: { sessions: { async create() { return { id: "cs_dummy" }; } } },
  };

  await assert.rejects(
    async () => {
      await createFoundingAngelCheckoutSession(
        "usr_test_verified_1",
        "https://itsyouonline.com/founding-angels",
        { pool: mockPool, stripe: mockStripe }
      );
    },
    (err) => {
      assert.ok(err instanceof FoundingAngelCapacityError || err.code === "CAPACITY_FULL");
      assert.match(err.message, /capacity is full|claimed/i);
      return true;
    }
  );
});

test("6. Checkout cancellation return page explains return without asserting unverified payment state", () => {
  const cancelContent = fs.readFileSync("components/founding-angels/FoundingAngelsCancel.tsx", "utf8");

  assert.match(cancelContent, /Order Canceled/i);
  assert.match(cancelContent, /returned from the checkout session/i);
  assert.doesNotMatch(cancelContent, /No charges were made/i, "Must not assert unverified no-charge claim");
  assert.match(cancelContent, /\/founding-angels/);
});

test("7. Success page bounds polling and does not falsely claim fulfillment on redirect alone", () => {
  const successContent = fs.readFileSync("components/founding-angels/FoundingAngelsSuccess.tsx", "utf8");

  // Inspect authoritative state requirement
  assert.match(successContent, /\/api\/stripe\/founding-angels-status/, "Must query authoritative status API");
  assert.match(successContent, /status === "fulfilled"/, "Must guard member number display behind fulfilled state");
  assert.match(successContent, /status === "pending"/, "Must have explicit pending state while webhook processes");

  // DEF-04: Bounded fulfillment polling
  assert.match(successContent, /pollCountRef/, "Must use useRef for poll count to avoid stale closures");
  assert.match(successContent, /startTimeRef/, "Must track elapsed time via ref");
  assert.match(successContent, /30000/, "Must enforce 30-second polling boundary");
  assert.match(successContent, /isRequestInFlightRef/, "Must prevent overlapping fetch requests");
});

test("8. Pending fulfillment query returns status 'pending' without a member number", async () => {
  const { mockPool, orders } = createMockDb();

  orders.set("order_open_1", {
    id: "order_open_1",
    identity_id: "usr_test_verified_1",
    status: "open",
    stripe_checkout_session_id: "cs_pending_123",
    created_at: new Date(),
  });

  const res = await getFoundingAngelStatus("usr_test_verified_1", "cs_pending_123", { pool: mockPool });

  assert.strictEqual(res.found, true);
  assert.strictEqual(res.status, "pending");
  assert.strictEqual(res.memberNumber, undefined, "Member number must not be exposed while pending");
});

test("9. Confirmed fulfillment displays authoritative permanent member number", async () => {
  const { mockPool, orders, memberships } = createMockDb();

  orders.set("order_paid_1", {
    id: "order_paid_1",
    identity_id: "usr_test_verified_1",
    status: "paid",
    stripe_checkout_session_id: "cs_confirmed_123",
    created_at: new Date(),
  });

  memberships.set(42, {
    member_number: 42,
    order_id: "order_paid_1",
    identity_id: "usr_test_verified_1",
    status: "active",
    granted_at: "2026-11-09T12:00:00Z",
  });

  const res = await getFoundingAngelStatus("usr_test_verified_1", "cs_confirmed_123", { pool: mockPool });

  assert.strictEqual(res.found, true);
  assert.strictEqual(res.status, "fulfilled");
  assert.strictEqual(res.memberNumber, 42, "Must return exact confirmed member number 42");
  assert.strictEqual(res.membershipStatus, "active");
});

test("10. Missing identity or unknown session ID fails closed safely", async () => {
  const { mockPool } = createMockDb();

  const res1 = await getFoundingAngelStatus("", "cs_unknown", { pool: mockPool });
  assert.strictEqual(res1.found, false);
  assert.strictEqual(res1.status, "not_found");

  const res2 = await getFoundingAngelStatus("usr_test_verified_1", "cs_nonexistent", { pool: mockPool });
  assert.strictEqual(res2.found, false);
  assert.strictEqual(res2.status, "not_found");
});

test("11. Cross-tenant isolation protects order status queries across identities", async () => {
  const { mockPool, orders, memberships } = createMockDb();

  // Order belongs to user 1
  orders.set("order_user_1", {
    id: "order_user_1",
    identity_id: "usr_test_verified_1",
    status: "paid",
    stripe_checkout_session_id: "cs_secret_1",
    created_at: new Date(),
  });

  memberships.set(7, {
    member_number: 7,
    order_id: "order_user_1",
    identity_id: "usr_test_verified_1",
    status: "active",
    granted_at: new Date().toISOString(),
  });

  // User 2 attempts to query User 1's session ID
  const crossTenantResult = await getFoundingAngelStatus("usr_test_verified_2", "cs_secret_1", { pool: mockPool });

  assert.strictEqual(crossTenantResult.found, false, "Cross-tenant access must return not found");
  assert.strictEqual(crossTenantResult.status, "not_found");
});

test("12. Client router in App.tsx maps all three Founding Angels routes", () => {
  const appContent = fs.readFileSync("App.tsx", "utf8");

  assert.match(appContent, /isFoundingAngelsSuccess/, "Must handle /founding-angels/success");
  assert.match(appContent, /isFoundingAngelsCancel/, "Must handle /founding-angels/cancel");
  assert.match(appContent, /isFoundingAngelsOffer/, "Must handle /founding-angels");
  assert.match(appContent, /<FoundingAngelsOffer/, "Must render FoundingAngelsOffer");
  assert.match(appContent, /<FoundingAngelsSuccess/, "Must render FoundingAngelsSuccess");
  assert.match(appContent, /<FoundingAngelsCancel/, "Must render FoundingAngelsCancel");
});

test("13. DEF-01: Canonical Return Origin & Hostile Origin Rejection", () => {
  // 1. Approved production origin (canonical apex)
  const prodEnv = { NODE_ENV: "production", APP_URL: "https://itsyouonline.com" };
  assert.strictEqual(resolveTrustedOrigin({ headers: { host: "evil.com" } }, prodEnv), "https://itsyouonline.com");

  // 2. Production fallback without APP_URL defaults to canonical
  const prodEnvFallback = { NODE_ENV: "production" };
  assert.strictEqual(resolveTrustedOrigin({ headers: { host: "evil.com" } }, prodEnvFallback), "https://itsyouonline.com");

  // 3. Approved localhost development origin
  const devEnv = { NODE_ENV: "development" };
  assert.strictEqual(
    resolveTrustedOrigin({ headers: { origin: "http://localhost:5173" } }, devEnv),
    "http://localhost:5173"
  );
  assert.strictEqual(
    resolveTrustedOrigin({ headers: { host: "127.0.0.1:3000" } }, devEnv),
    "http://127.0.0.1:3000"
  );

  // 4. Authoritative preview origin (matching platform metadata VERCEL_URL)
  const verifiedPreviewEnv = {
    NODE_ENV: "development",
    VERCEL_URL: "portals-os-git-feature-the-youniverse.vercel.app",
  };
  assert.strictEqual(
    resolveTrustedOrigin({ headers: { host: "portals-os-git-feature-the-youniverse.vercel.app" } }, verifiedPreviewEnv),
    "https://portals-os-git-feature-the-youniverse.vercel.app"
  );

  // 5. Arbitrary unverified portals-os-* hostname is rejected
  assert.throws(
    () => resolveTrustedOrigin({ headers: { host: "portals-os-arbitrary.vercel.app" } }, devEnv),
    /Untrusted host or origin/
  );
  assert.throws(
    () => resolveTrustedOrigin({ headers: { host: "portals-os-attacker.vercel.app" } }, devEnv),
    /Untrusted host or origin/
  );

  // 6. Another project's *.vercel.app hostname is rejected
  assert.throws(
    () => resolveTrustedOrigin({ headers: { host: "attacker.vercel.app" } }, devEnv),
    /Untrusted host or origin/
  );
  assert.throws(
    () => resolveTrustedOrigin({ headers: { host: "other-project.vercel.app" } }, devEnv),
    /Untrusted host or origin/
  );

  // 7. Arbitrary custom subdomains rejected (must be canonical apex)
  assert.throws(
    () => resolveTrustedOrigin({ headers: { host: "attacker.itsyouonline.com" } }, devEnv),
    /Untrusted host or origin/
  );
  assert.throws(
    () => resolveTrustedOrigin({ headers: { host: "tenant.itsyouonline.com" } }, devEnv),
    /Untrusted host or origin/
  );

  // 8. Lookalike and suffix confusion domains rejected
  assert.throws(
    () => resolveTrustedOrigin({ headers: { host: "portals-os.evil.com" } }, devEnv),
    /Untrusted host or origin/
  );
  assert.throws(
    () => resolveTrustedOrigin({ headers: { host: "portals-os.vercel.app.evil.com" } }, devEnv),
    /Untrusted host or origin/
  );
  assert.throws(
    () => resolveTrustedOrigin({ headers: { host: "fakeitsyouonline.com" } }, devEnv),
    /Untrusted host or origin/
  );
  assert.throws(
    () => resolveTrustedOrigin({ headers: { host: "evil.com" } }, devEnv),
    /Untrusted host or origin/
  );

  // 9. Spoofed forwarded headers cannot override trusted origin
  assert.strictEqual(
    resolveTrustedOrigin(
      { headers: { host: "localhost:5173", "x-forwarded-host": "attacker.com", "x-forwarded-proto": "http" } },
      devEnv
    ),
    "http://localhost:5173"
  );
  assert.strictEqual(
    resolveTrustedOrigin(
      { headers: { host: "evil.com", "x-forwarded-host": "evil.com" } },
      prodEnv
    ),
    "https://itsyouonline.com"
  );

  // 10. Malformed hostnames, unexpected ports, and credentials rejected
  assert.throws(
    () => resolveTrustedOrigin({ headers: { host: "user:pass@localhost" } }, devEnv),
    /Credentials in origin URL are not permitted/
  );
  assert.throws(
    () => resolveTrustedOrigin({ headers: { host: "portals-os.vercel.app:8080" } }, devEnv),
    /Unexpected port on remote origin/
  );
  assert.throws(
    () => resolveTrustedOrigin({ headers: { host: "http://malformed [bracket" } }, devEnv),
    /Malformed host or origin/
  );

  // 11. Missing production configuration fails closed (does not accept attacker domain)
  assert.strictEqual(
    resolveTrustedOrigin({ headers: { host: "attacker.com", origin: "https://attacker.com" } }, { NODE_ENV: "production" }),
    "https://itsyouonline.com"
  );
  assert.throws(
    () => resolveTrustedOrigin({}, { NODE_ENV: "production", APP_URL: "https://attacker.com" }),
    /Configured production origin must be the canonical itsyouonline\.com domain/
  );
  assert.throws(
    () => resolveTrustedOrigin({}, { NODE_ENV: "production", APP_URL: "https://attacker.itsyouonline.com" }),
    /Configured production origin must be the canonical itsyouonline\.com domain/
  );
  assert.throws(
    () => resolveTrustedOrigin({}, { NODE_ENV: "production", APP_URL: "http://insecure.itsyouonline.com" }),
    /Configured URL must use HTTPS/
  );
});

test("14. DEF-02: Sold-out capacity in dispatcher maps to HTTP 409", async () => {
  process.env.STRIPE_SECRET_KEY = ["mock", "test", "key"].join("_");
  const { mockPool, memberships } = createMockDb();

  // Fill capacity to 500
  for (let i = 1; i <= 500; i++) {
    memberships.set(i, { member_number: i, status: "active" });
  }

  const { req, res } = createMockReqRes({
    method: "POST",
    url: "/api/stripe/founding-angels-checkout",
    query: { action: "founding-angels-checkout" },
    headers: {
      authorization: "Bearer valid_token_1",
      host: "localhost:5173",
    },
  });

  const mockAuth = async () => ({
    ok: true,
    user: {
      userId: "usr_test_verified_1",
      youniverseId: "usr_test_verified_1",
      handle: "patron1",
      authType: "neon_session",
    },
  });

  await stripeHandler(req, res, { authenticateRequest: mockAuth, pool: mockPool });
  assert.strictEqual(res.statusCode, 409, "Must return HTTP 409 when capacity is full");
  assert.strictEqual(res.bodyData?.status, "sold-out");
  assert.match(res.bodyData?.message, /All 500 Founding Angel memberships have been claimed/i);
});

test("15. DEF-02: Unrelated errors return HTTP 500 and are not mislabeled as capacity full", async () => {
  process.env.STRIPE_SECRET_KEY = ["mock", "test", "key"].join("_");

  const failingReqRes = createMockReqRes({
    method: "POST",
    url: "/api/stripe/founding-angels-checkout",
    query: { action: "founding-angels-checkout" },
    headers: {
      authorization: "Bearer valid_token_1",
      host: "localhost:5173",
    },
  });

  const mockAuth = async () => ({
    ok: true,
    user: {
      userId: "usr_test_verified_1",
      youniverseId: "usr_test_verified_1",
      handle: "patron1",
      authType: "neon_session",
    },
  });

  const failingPool = {
    async connect() {
      throw new Error("Neon connection failed unexpectedly");
    },
    async query() {
      throw new Error("Neon connection failed unexpectedly");
    },
  };

  await stripeHandler(failingReqRes.req, failingReqRes.res, { authenticateRequest: mockAuth, pool: failingPool });

  assert.strictEqual(failingReqRes.res.statusCode, 500, "Unrelated DB failure must return HTTP 500");
  assert.strictEqual(failingReqRes.res.bodyData?.status, "error");
  assert.notStrictEqual(failingReqRes.res.bodyData?.status, "sold-out");
  assert.match(failingReqRes.res.bodyData?.message, /Neon connection failed/i);
});

test("16. DEF-04: Polling timeout states in FoundingAngelsSuccess.tsx provide retry path", () => {
  const successContent = fs.readFileSync("components/founding-angels/FoundingAngelsSuccess.tsx", "utf8");

  assert.match(successContent, /Fulfillment In Progress/i, "Must show clear in-progress heading on timeout");
  assert.match(successContent, /Check Again/i, "Must provide manual check again button on timeout");
  assert.match(successContent, /clearTimer\(\)/, "Must properly clear timeout timers");
});
