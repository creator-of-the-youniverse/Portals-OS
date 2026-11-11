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

  console.log("\nAll targeted tests passed successfully!");
}

runTests().catch((err) => {
  console.error("Test suite failed:", err);
  process.exit(1);
});

