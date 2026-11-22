import assert from "node:assert";
import fs from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

const esbuild = require("esbuild");
esbuild.buildSync({
  entryPoints: ["api/stripe/[action].ts"],
  bundle: true,
  platform: "node",
  format: "cjs",
  outfile: "tests/action.built.cjs",
  external: ["@neondatabase/serverless", "stripe"],
});

const actionModule = require("./action.built.cjs");
const handler = actionModule.default;

assert.ok(handler, "Handler default export must exist");
assert.strictEqual(actionModule.config?.api?.bodyParser, false, "bodyParser must be false");

function createMockReqRes({ method = "GET", url = "/", query = {}, headers = {}, body = null }) {
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

async function runTests() {
  console.log("Starting Stripe Dispatcher targeted test suite...\n");
  process.env.STRIPE_SECRET_KEY = "sk_test_mock_123456789";

  // Test 1: Unsupported action returns 404
  {
    const { req, res } = createMockReqRes({
      method: "POST",
      url: "/api/stripe/nonexistent",
      query: { action: "nonexistent" },
    });
    await handler(req, res);
    assert.strictEqual(res.statusCode, 404, "Unknown action must return 404");
    assert.strictEqual(res.bodyData?.status, "not-found");
    console.log("✔ Test 1: Unsupported action returns 404");
  }

  // Test 2: Method validation
  {
    // create-checkout GET -> 405
    const { req: r1, res: s1 } = createMockReqRes({
      method: "GET",
      url: "/api/stripe/create-checkout",
      query: { action: "create-checkout" },
    });
    await handler(r1, s1);
    assert.strictEqual(s1.statusCode, 405, "GET /api/stripe/create-checkout must return 405");

    // success POST -> 405
    const { req: r2, res: s2 } = createMockReqRes({
      method: "POST",
      url: "/api/stripe/success",
      query: { action: "success" },
    });
    await handler(r2, s2);
    assert.strictEqual(s2.statusCode, 405, "POST /api/stripe/success must return 405");

    // webhook GET -> 405
    const { req: r3, res: s3 } = createMockReqRes({
      method: "GET",
      url: "/api/stripe/webhook",
      query: { action: "webhook" },
    });
    await handler(r3, s3);
    assert.strictEqual(s3.statusCode, 405, "GET /api/stripe/webhook must return 405");
    console.log("✔ Test 2: Unsupported HTTP methods return 405");
  }

  // Test 3: Checkout validation
  {
    // Missing handle
    const { req: r1, res: s1 } = createMockReqRes({
      method: "POST",
      url: "/api/stripe/create-checkout",
      query: { action: "create-checkout" },
      body: { email: "test@example.com", packId: "starter" },
    });
    await handler(r1, s1);
    assert.strictEqual(s1.statusCode, 400, "Missing handle must return 400");
    assert.strictEqual(s1.bodyData?.message, "Handle is required.");

    // Invalid email
    const { req: r2, res: s2 } = createMockReqRes({
      method: "POST",
      url: "/api/stripe/create-checkout",
      query: { action: "create-checkout" },
      body: { handle: "testhandle", email: "not-an-email", packId: "starter" },
    });
    await handler(r2, s2);
    assert.strictEqual(s2.statusCode, 400, "Invalid email must return 400");
    assert.strictEqual(s2.bodyData?.message, "A valid email is required.");

    // Invalid pack
    const { req: r3, res: s3 } = createMockReqRes({
      method: "POST",
      url: "/api/stripe/create-checkout",
      query: { action: "create-checkout" },
      body: { handle: "testhandle", email: "user@example.com", packId: "invalid_pack" },
    });
    await handler(r3, s3);
    assert.strictEqual(s3.statusCode, 400, "Invalid packId must return 400");
    assert.strictEqual(s3.bodyData?.message, "Invalid pack selected.");

    // Enterprise pack (contact-required)
    const { req: r4, res: s4 } = createMockReqRes({
      method: "POST",
      url: "/api/stripe/create-checkout",
      query: { action: "create-checkout" },
      body: { handle: "enterpriseuser", email: "corp@example.com", packId: "enterprise" },
    });
    await handler(r4, s4);
    assert.strictEqual(s4.statusCode, 200, "Enterprise pack must return 200 contact-required");
    assert.strictEqual(s4.bodyData?.status, "contact-required");
    console.log("✔ Test 3: create-checkout input validation and enterprise flow pass");
  }

  // Test 4: Success redirect handling
  {
    // Missing params -> redirects to /
    const { req: r1, res: s1 } = createMockReqRes({
      method: "GET",
      url: "/api/stripe/success",
      query: { action: "success" },
    });
    await handler(r1, s1);
    assert.strictEqual(s1.redirectUrl, "/", "Missing session_id or handle must redirect to /");
    console.log("✔ Test 4: success redirect fallback passes");
  }

  // Test 5: Webhook signature verification and raw-body handling
  {
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_test_mock";
    process.env.DATABASE_URL = "postgres://mock:mock@localhost:5432/mock";

    const payload = JSON.stringify({
      id: "evt_test",
      type: "checkout.session.completed",
      data: { object: { id: "cs_123", metadata: { handle: "testuser" } } },
    });

    const { req, res } = createMockReqRes({
      method: "POST",
      url: "/api/stripe/webhook",
      query: { action: "webhook" },
      headers: { "stripe-signature": "invalid_sig_123" },
      body: Buffer.from(payload),
    });

    await handler(req, res);
    assert.strictEqual(res.statusCode, 400, "Invalid webhook signature must return 400");
    assert.strictEqual(res.bodyData?.status, "signature-invalid");
    console.log("✔ Test 5: webhook signature verification on raw bytes correctly rejects bad signature");
  }

  // Test 6: URL fallback routing without query.action
  {
    const { req, res } = createMockReqRes({
      method: "POST",
      url: "/api/stripe/create-checkout",
      query: {},
      body: { handle: "myhandle", email: "bad-email", packId: "starter" },
    });
    await handler(req, res);
    assert.strictEqual(res.statusCode, 400);
    assert.strictEqual(res.bodyData?.message, "A valid email is required.");
    console.log("✔ Test 6: URL path fallback routing matches /api/stripe/create-checkout");
  }

  // Test 7: Webhook handles refund.created and dispatches to reconciliation
  {
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_test_mock";
    process.env.DATABASE_URL = "postgres://mock:mock@localhost:5432/mock";

    const refundCreatedEvent = {
      id: "evt_ref_created_disp",
      type: "refund.created",
      data: {
        object: {
          id: "re_disp_1",
          object: "refund",
          amount: 20000,
          currency: "usd",
          charge: "ch_disp_1",
          status: "succeeded",
        },
      },
    };

    const mockDeps = {
      stripe: {
        webhooks: {
          constructEvent: () => refundCreatedEvent,
        },
        charges: {
          retrieve: async () => ({ id: "ch_disp_1", amount_refunded: 20000, currency: "usd", livemode: false }),
        },
        refunds: {
          list: () => ({
            [Symbol.asyncIterator]: async function* () {
              yield { id: "re_disp_1", amount: 20000, status: "succeeded", created: 10, currency: "usd", charge: "ch_disp_1", livemode: false };
            },
          }),
        },
      },
      pool: {
        query: async (text, params) => {
          if (text.includes("FROM public.founding_angel_orders WHERE stripe_charge_id = $1")) {
            return { rows: [{ id: "ord_disp_1" }] };
          }
          if (text.includes("SELECT * FROM public.founding_angel_orders WHERE id = $1")) {
            return {
              rows: [{
                id: "ord_disp_1",
                amount_cents: 20000,
                status: "paid",
                stripe_charge_id: "ch_disp_1",
                refunded_amount_cents: 0,
                pending_refund_amount_cents: 0,
                chargeback_amount_cents: 0,
                currency: "usd",
              }],
            };
          }
          return { rows: [] };
        },
        connect: async () => ({
          query: async () => ({ rows: [{ id: "ord_disp_1", amount_cents: 20000, refunded_amount_cents: 0 }] }),
          release: () => {},
        }),
      },
    };

    const { req, res } = createMockReqRes({
      method: "POST",
      url: "/api/stripe/webhook",
      query: { action: "webhook" },
      headers: { "stripe-signature": "valid_sig" },
      body: Buffer.from(JSON.stringify(refundCreatedEvent)),
    });

    await handler(req, res, mockDeps);
    assert.strictEqual(res.statusCode, 200, "refund.created must return 200");
    assert.strictEqual(res.bodyData?.received, true);
    assert.strictEqual(res.bodyData?.reconciled?.succeededCents, 20000);
    console.log("✔ Test 7: Webhook handles refund.created and dispatches to reconciliation");
  }

  // Test 8: Webhook handles charge.refunded extracting Charge object ID without type confusion
  {
    const chargeRefundedEvent = {
      id: "evt_charge_refunded_disp",
      type: "charge.refunded",
      data: {
        object: {
          id: "ch_disp_charge_obj",
          object: "charge",
          amount: 20000,
          amount_refunded: 20000,
          currency: "usd",
        },
      },
    };

    const mockDeps = {
      stripe: {
        webhooks: {
          constructEvent: () => chargeRefundedEvent,
        },
        charges: {
          retrieve: async () => ({ id: "ch_disp_charge_obj", amount_refunded: 20000, currency: "usd", livemode: false }),
        },
        refunds: {
          list: () => ({
            [Symbol.asyncIterator]: async function* () {
              yield { id: "re_disp_crf", amount: 20000, status: "succeeded", created: 10, currency: "usd", charge: "ch_disp_charge_obj", livemode: false };
            },
          }),
        },
      },
      pool: {
        query: async (text, params) => {
          if (text.includes("FROM public.founding_angel_orders WHERE stripe_charge_id = $1")) {
            assert.strictEqual(params[0], "ch_disp_charge_obj", "Must query by Charge ID from Charge object");
            return { rows: [{ id: "ord_disp_2" }] };
          }
          if (text.includes("SELECT * FROM public.founding_angel_orders WHERE id = $1")) {
            return {
              rows: [{
                id: "ord_disp_2",
                amount_cents: 20000,
                status: "paid",
                stripe_charge_id: "ch_disp_charge_obj",
                refunded_amount_cents: 0,
                pending_refund_amount_cents: 0,
                chargeback_amount_cents: 0,
                currency: "usd",
              }],
            };
          }
          return { rows: [] };
        },
        connect: async () => ({
          query: async () => ({ rows: [{ id: "ord_disp_2", amount_cents: 20000, refunded_amount_cents: 0 }] }),
          release: () => {},
        }),
      },
    };

    const { req, res } = createMockReqRes({
      method: "POST",
      url: "/api/stripe/webhook",
      query: { action: "webhook" },
      headers: { "stripe-signature": "valid_sig" },
      body: Buffer.from(JSON.stringify(chargeRefundedEvent)),
    });

    await handler(req, res, mockDeps);
    assert.strictEqual(res.statusCode, 200, "charge.refunded must return 200");
    assert.strictEqual(res.bodyData?.received, true);
    assert.strictEqual(res.bodyData?.reconciled?.succeededCents, 20000);
    console.log("✔ Test 8: Webhook handles charge.refunded extracting Charge object ID without type confusion");
  }

  // Test 9: create-checkout enforces CSRF and canonical trusted return URLs (blocks hostile Origin)
  {
    let stripeCalled = false;
    let capturedParams = null;
    const mockStripe = {
      checkout: {
        sessions: {
          create: async (params) => {
            stripeCalled = true;
            capturedParams = params;
            return { id: "cs_test_origin", url: "https://checkout.stripe.com/pay/cs_test_origin" };
          },
        },
      },
    };

    const { req: badReq, res: badRes } = createMockReqRes({
      method: "POST",
      url: "/api/stripe/create-checkout",
      query: { action: "create-checkout" },
      headers: { host: "itsyouonline.com", origin: "https://evil.example.com" },
      body: { handle: "cleanhandle", email: "owner@example.com", packId: "starter" },
    });
    await handler(badReq, badRes, {
      stripe: mockStripe,
      env: { NODE_ENV: "production", VERCEL_ENV: "production" },
    });
    assert.strictEqual(badRes.statusCode, 403, "Hostile Origin on create-checkout must be rejected with 403");
    assert.strictEqual(badRes.bodyData?.error, "csrf_rejected");
    assert.strictEqual(stripeCalled, false, "Stripe must not be invoked on rejected Origin");

    const { req: okReq, res: okRes } = createMockReqRes({
      method: "POST",
      url: "/api/stripe/create-checkout",
      query: { action: "create-checkout" },
      headers: { host: "www.itsyouonline.com", origin: "https://www.itsyouonline.com" },
      body: { handle: "cleanhandle", email: "owner@example.com", packId: "starter" },
    });
    await handler(okReq, okRes, {
      stripe: mockStripe,
      env: { NODE_ENV: "production", VERCEL_ENV: "production", APP_URL: "https://www.itsyouonline.com" },
    });
    assert.strictEqual(okRes.statusCode, 200);
    assert.strictEqual(stripeCalled, true);
    assert.ok(String(capturedParams.success_url).startsWith("https://www.itsyouonline.com/api/stripe/success"));
    assert.ok(String(capturedParams.cancel_url).startsWith("https://www.itsyouonline.com/?claim="));
    console.log("✔ Test 9: create-checkout rejects hostile Origin and locks return URLs to resolved trusted origin");
  }

  // Test 10: founding-angels-checkout rejects cookie-only CSRF and cross-tenant Origin
  {
    const mockAuthAlice = async () => ({
      ok: true,
      user: { userId: "id-alice", youniverseId: "id-alice", handle: "alice", authType: "neon_session" },
    });
    const { req: csrfReq, res: csrfRes } = createMockReqRes({
      method: "POST",
      url: "/api/stripe/founding-angels-checkout",
      query: { action: "founding-angels-checkout" },
      headers: { host: "itsyouonline.com", origin: "https://evil.example.com", cookie: "__youniverse_session=tok" },
    });
    await handler(csrfReq, csrfRes, {
      authenticateRequest: mockAuthAlice,
      salesEnabled: true,
      env: { VERCEL_ENV: "production", NODE_ENV: "production" },
    });
    assert.strictEqual(csrfRes.statusCode, 403);
    assert.strictEqual(csrfRes.bodyData?.error, "csrf_rejected");

    const { req: crossTenantReq, res: crossTenantRes } = createMockReqRes({
      method: "POST",
      url: "/api/stripe/founding-angels-checkout",
      query: { action: "founding-angels-checkout" },
      headers: { host: "bob.itsyouonline.com", origin: "https://bob.itsyouonline.com", cookie: "__youniverse_session=tok" },
    });
    await handler(crossTenantReq, crossTenantRes, {
      authenticateRequest: mockAuthAlice,
      salesEnabled: true,
      env: { VERCEL_ENV: "production", NODE_ENV: "production" },
    });
    assert.strictEqual(crossTenantRes.statusCode, 403);
    assert.strictEqual(crossTenantRes.bodyData?.error, "csrf_rejected");

    // Pre-auth cookie CSRF check without calling authenticateRequest
    let authCalledOnCookieCsrf = false;
    const { req: cookieOnlyReq, res: cookieOnlyRes } = createMockReqRes({
      method: "POST",
      url: "/api/stripe/founding-angels-checkout",
      query: { action: "founding-angels-checkout" },
      headers: { host: "itsyouonline.com", cookie: "__youniverse_session=tok" },
    });
    await handler(cookieOnlyReq, cookieOnlyRes, {
      authenticateRequest: async () => {
        authCalledOnCookieCsrf = true;
        return mockAuthAlice();
      },
      salesEnabled: true,
      env: { VERCEL_ENV: "production", NODE_ENV: "production" },
    });
    assert.strictEqual(cookieOnlyRes.statusCode, 403);
    assert.strictEqual(cookieOnlyRes.bodyData?.error, "csrf_rejected");
    assert.strictEqual(authCalledOnCookieCsrf, false, "Pre-auth CSRF must reject before touching DB/auth");

    // resolveTrustedOrigin forwards deps.env
    const { req: badEnvReq, res: badEnvRes } = createMockReqRes({
      method: "POST",
      url: "/api/stripe/founding-angels-checkout",
      query: { action: "founding-angels-checkout" },
      headers: { host: "itsyouonline.com", origin: "https://itsyouonline.com", cookie: "__youniverse_session=tok" },
    });
    await handler(badEnvReq, badEnvRes, {
      authenticateRequest: mockAuthAlice,
      salesEnabled: true,
      env: { VERCEL_ENV: "production", NODE_ENV: "production", APP_URL: "https://evil.example.com" },
    });
    assert.strictEqual(badEnvRes.statusCode, 400);
    assert.strictEqual(badEnvRes.bodyData?.status, "invalid-origin");

    let capturedSuccessUrl = "";
    const { req: wwwEnvReq, res: wwwEnvRes } = createMockReqRes({
      method: "POST",
      url: "/api/stripe/founding-angels-checkout",
      query: { action: "founding-angels-checkout" },
      headers: { host: "www.itsyouonline.com", origin: "https://www.itsyouonline.com", cookie: "__youniverse_session=tok" },
    });
    await handler(wwwEnvReq, wwwEnvRes, {
      authenticateRequest: mockAuthAlice,
      salesEnabled: true,
      env: { VERCEL_ENV: "production", NODE_ENV: "production", APP_URL: "https://www.itsyouonline.com" },
      stripe: {
        checkout: {
          sessions: {
            create: async (params) => {
              capturedSuccessUrl = params.success_url;
              return { id: "cs_www_1", url: "https://checkout.stripe.com/pay/cs_www_1" };
            },
          },
        },
      },
      pool: {
        connect: async () => ({
          query: async (sql) => {
            if (sql.includes("FROM public.founding_angels_platform_setup")) {
              return { rows: [{ is_completed: true, completed_at: new Date().toISOString() }] };
            }
            if (sql.includes("public.founding_angel_memberships")) return { rows: [{ cnt: 0 }] };
            if (sql.includes("checkout_expires_at > NOW()")) return { rows: [{ cnt: 0 }] };
            if (sql.includes("INSERT INTO public.founding_angel_orders")) {
              return { rows: [{ id: "ord_www_1", stripe_idempotency_key: "idem_www" }] };
            }
            return { rows: [] };
          },
          release: () => {},
        }),
      },
    });
    assert.strictEqual(wwwEnvRes.statusCode, 200);
    assert.strictEqual(
      capturedSuccessUrl,
      "https://www.itsyouonline.com/founding-angels/success?session_id={CHECKOUT_SESSION_ID}"
    );
    console.log("✔ Test 10: founding-angels-checkout enforces pre-auth CSRF, cross-tenant checks, and forwards deps.env to resolveTrustedOrigin");
  }

  console.log("\nAll targeted tests passed successfully!");
}

runTests().catch((err) => {
  console.error("Test suite failed:", err);
  process.exit(1);
});

