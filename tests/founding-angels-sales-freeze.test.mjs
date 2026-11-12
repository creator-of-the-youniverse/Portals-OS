import assert from "node:assert";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const esbuild = require("esbuild");

// 1. Build bundled module of api/stripe/[action].ts and lib/foundingAngelsService.ts
esbuild.buildSync({
  entryPoints: ["lib/foundingAngelsService.ts"],
  bundle: true,
  platform: "node",
  format: "cjs",
  outfile: "tests/service.built.cjs",
  external: ["@neondatabase/serverless", "stripe"],
});

esbuild.buildSync({
  entryPoints: ["api/stripe/[action].ts"],
  bundle: true,
  platform: "node",
  format: "cjs",
  outfile: "tests/action.built.cjs",
  external: ["@neondatabase/serverless", "stripe"],
});

const serviceModule = require("./service.built.cjs");
const actionModule = require("./action.built.cjs");
const handler = actionModule.default;

const {
  isFoundingAngelsSalesEnabled,
  FoundingAngelSalesPausedError,
  createFoundingAngelCheckoutSession,
} = serviceModule;

function createMockReqRes({ method = "POST", url = "/api/stripe/founding-angels-checkout", query = {}, headers = {}, body = null }) {
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
    end() {
      this.ended = true;
      return this;
    },
  };

  return { req, res };
}

async function runTests() {
  console.log("=== Founding Angels Sales Freeze Test Suite ===\n");
  process.env.STRIPE_SECRET_KEY = "sk_test_mock_123456789";

  // ── 1. Unit Tests: isFoundingAngelsSalesEnabled ───────────────────────────────
  console.log("--- 1. Testing isFoundingAngelsSalesEnabled() ---");

  // Default enabled when unset or empty
  assert.strictEqual(isFoundingAngelsSalesEnabled({}), true, "Unset env must default to true");
  assert.strictEqual(isFoundingAngelsSalesEnabled({ FOUNDING_ANGELS_SALES_ENABLED: "" }), true, "Empty string must default to true");
  assert.strictEqual(isFoundingAngelsSalesEnabled({ FOUNDING_ANGELS_SALES_ENABLED: "   " }), true, "Whitespace must default to true");

  // Explicit true
  assert.strictEqual(isFoundingAngelsSalesEnabled({ FOUNDING_ANGELS_SALES_ENABLED: "true" }), true, "'true' must return true");
  assert.strictEqual(isFoundingAngelsSalesEnabled({ FOUNDING_ANGELS_SALES_ENABLED: "TRUE" }), true, "'TRUE' must return true");
  assert.strictEqual(isFoundingAngelsSalesEnabled({ FOUNDING_ANGELS_SALES_ENABLED: " True " }), true, "' True ' must return true");

  // Explicit false
  assert.strictEqual(isFoundingAngelsSalesEnabled({ FOUNDING_ANGELS_SALES_ENABLED: "false" }), false, "'false' must return false");
  assert.strictEqual(isFoundingAngelsSalesEnabled({ FOUNDING_ANGELS_SALES_ENABLED: "FALSE" }), false, "'FALSE' must return false");
  assert.strictEqual(isFoundingAngelsSalesEnabled({ FOUNDING_ANGELS_SALES_ENABLED: " False " }), false, "' False ' must return false");

  // Fail-closed on invalid values
  assert.strictEqual(isFoundingAngelsSalesEnabled({ FOUNDING_ANGELS_SALES_ENABLED: "invalid" }), false, "'invalid' must fail-closed to false");
  assert.strictEqual(isFoundingAngelsSalesEnabled({ FOUNDING_ANGELS_SALES_ENABLED: "0" }), false, "'0' must fail-closed to false");
  assert.strictEqual(isFoundingAngelsSalesEnabled({ FOUNDING_ANGELS_SALES_ENABLED: "paused" }), false, "'paused' must fail-closed to false");
  assert.strictEqual(isFoundingAngelsSalesEnabled({ FOUNDING_ANGELS_SALES_ENABLED: "yes" }), false, "'yes' must fail-closed to false");

  console.log("✔ isFoundingAngelsSalesEnabled() passed all configuration cases\n");

  // ── 2. Unit Tests: FoundingAngelSalesPausedError ─────────────────────────────
  console.log("--- 2. Testing FoundingAngelSalesPausedError ---");
  const err = new FoundingAngelSalesPausedError();
  assert.strictEqual(err.code, "SALES_PAUSED");
  assert.strictEqual(err.name, "FoundingAngelSalesPausedError");
  assert.strictEqual(err.message, "Founding Angels enrollment is temporarily paused.");
  console.log("✔ FoundingAngelSalesPausedError contract verified\n");

  // ── 3. Service Level: createFoundingAngelCheckoutSession ─────────────────────
  console.log("--- 3. Testing createFoundingAngelCheckoutSession() with Sales Disabled ---");

  // Via deps.salesEnabled = false
  await assert.rejects(
    async () => {
      await createFoundingAngelCheckoutSession("usr_test123", "https://itsyouonline.com", {
        salesEnabled: false,
      });
    },
    (err) => {
      assert.strictEqual(err.code, "SALES_PAUSED");
      assert.strictEqual(err.name, "FoundingAngelSalesPausedError");
      return true;
    },
    "createFoundingAngelCheckoutSession must reject with FoundingAngelSalesPausedError when salesEnabled is false"
  );

  // Via env FOUNDING_ANGELS_SALES_ENABLED = "false"
  await assert.rejects(
    async () => {
      await createFoundingAngelCheckoutSession("usr_test123", "https://itsyouonline.com", {
        env: { FOUNDING_ANGELS_SALES_ENABLED: "false" },
      });
    },
    (err) => {
      assert.strictEqual(err.code, "SALES_PAUSED");
      return true;
    },
    "createFoundingAngelCheckoutSession must reject when env is 'false'"
  );

  // Via env invalid value (fail-closed)
  await assert.rejects(
    async () => {
      await createFoundingAngelCheckoutSession("usr_test123", "https://itsyouonline.com", {
        env: { FOUNDING_ANGELS_SALES_ENABLED: "invalid_val" },
      });
    },
    (err) => {
      assert.strictEqual(err.code, "SALES_PAUSED");
      return true;
    },
    "createFoundingAngelCheckoutSession must reject when env is invalid"
  );

  console.log("✔ createFoundingAngelCheckoutSession correctly blocks checkout under all pause conditions\n");

  // ── 4. Dispatcher: POST /api/stripe/founding-angels-checkout ────────────────
  console.log("--- 4. Testing Dispatcher Route with Sales Disabled vs Enabled ---");

  const mockAuthSuccess = async () => ({
    ok: true,
    user: { youniverseId: "usr_active_member", email: "member@example.com" },
  });

  // 4a. When sales disabled via env: returns 503
  {
    const { req, res } = createMockReqRes({
      method: "POST",
      url: "/api/stripe/founding-angels-checkout",
      headers: { host: "itsyouonline.com", origin: "https://itsyouonline.com" },
    });

    await handler(req, res, {
      authenticateRequest: mockAuthSuccess,
      env: { FOUNDING_ANGELS_SALES_ENABLED: "false" },
    });

    assert.strictEqual(res.statusCode, 503, "Should return 503 Service Unavailable");
    assert.strictEqual(res.bodyData?.status, "sales-paused");
    assert.strictEqual(res.bodyData?.error, "SALES_PAUSED");
    assert.strictEqual(res.bodyData?.message, "Founding Angels enrollment is temporarily paused.");
    console.log("✔ Dispatcher returns 503 with sales-paused payload when FOUNDING_ANGELS_SALES_ENABLED='false'");
  }

  // 4b. When invalid env value configured: returns 503 (fail closed)
  {
    const { req, res } = createMockReqRes({
      method: "POST",
      url: "/api/stripe/founding-angels-checkout",
      headers: { host: "itsyouonline.com", origin: "https://itsyouonline.com" },
    });

    await handler(req, res, {
      authenticateRequest: mockAuthSuccess,
      env: { FOUNDING_ANGELS_SALES_ENABLED: "unexpected_string" },
    });

    assert.strictEqual(res.statusCode, 503, "Invalid sales flag must fail closed to 503");
    assert.strictEqual(res.bodyData?.status, "sales-paused");
    console.log("✔ Dispatcher fails closed to 503 on invalid env setting");
  }

  // 4c. When sales enabled: proceeds to checkout session creation
  {
    const { req, res } = createMockReqRes({
      method: "POST",
      url: "/api/stripe/founding-angels-checkout",
      headers: { host: "itsyouonline.com", origin: "https://itsyouonline.com" },
    });

    // Mock successful checkout session
    let sessionCreated = false;
    const mockStripe = {
      checkout: {
        sessions: {
          create: async () => {
            sessionCreated = true;
            return { id: "cs_mock_123", url: "https://checkout.stripe.com/c/pay/cs_mock_123" };
          },
        },
      },
    };

    // Mock DB queries for createFoundingAngelCheckoutSession
    const mockPool = {
      connect: async () => ({
        query: async (sql) => {
          if (sql.includes("pg_advisory_xact_lock")) return { rows: [] };
          if (sql.includes("LIMIT 1")) return { rows: [] }; // no active checkouts
          if (sql.includes("public.founding_angel_memberships")) return { rows: [{ cnt: 10 }] };
          if (sql.includes("checkout_expires_at > NOW()")) return { rows: [{ cnt: 0 }] };
          if (sql.includes("INSERT INTO public.founding_angel_orders")) {
            return { rows: [{ id: "order_mock_uuid", stripe_idempotency_key: "idem_123" }] };
          }
          if (sql.includes("FOR UPDATE")) return { rows: [{ id: "order_mock_uuid" }] };
          if (sql.includes("UPDATE public.founding_angel_orders")) return { rows: [] };
          return { rows: [] };
        },
        release: () => {},
      }),
    };

    await handler(req, res, {
      authenticateRequest: mockAuthSuccess,
      salesEnabled: true,
      stripe: mockStripe,
      pool: mockPool,
    });

    assert.strictEqual(res.statusCode, 200, "Should return 200 OK when sales enabled");
    assert.strictEqual(res.bodyData?.status, "ok");
    assert.strictEqual(res.bodyData?.sessionId, "cs_mock_123");
    assert.strictEqual(sessionCreated, true, "Stripe session creation must be called");
    console.log("✔ Dispatcher proceeds to 200 OK when sales enabled\n");
  }

  // ── 5. Independence: Webhooks & Status Unaffected by Sales Freeze ────────────
  console.log("--- 5. Testing Webhook & Status Independence During Freeze ---");

  // 5a. Webhook is NOT blocked by sales freeze
  {
    const { req, res } = createMockReqRes({
      method: "POST",
      url: "/api/stripe/webhook",
      headers: {
        host: "itsyouonline.com",
        "stripe-signature": "invalid_mock_sig",
      },
      body: Buffer.from(JSON.stringify({ type: "dummy.event" })),
    });

    // Provide env with sales disabled
    const origWebhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    const origDbUrl = process.env.DATABASE_URL;
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_mock";
    process.env.DATABASE_URL = "postgres://mock:mock@localhost:5432/mock";

    try {
      await handler(req, res, {
        env: { FOUNDING_ANGELS_SALES_ENABLED: "false" },
      });

      // Signature verification fails with 400 signature-invalid, proving it entered webhook handler and wasn't blocked with 503
      assert.strictEqual(res.statusCode, 400, "Webhook must evaluate signature, not fail with 503");
      assert.strictEqual(res.bodyData?.status, "signature-invalid");
      console.log("✔ Webhook handler executes independently without being blocked by sales freeze");
    } finally {
      process.env.STRIPE_WEBHOOK_SECRET = origWebhookSecret;
      process.env.DATABASE_URL = origDbUrl;
    }
  }

  // 5b. Status endpoint is NOT blocked by sales freeze
  {
    const { req, res } = createMockReqRes({
      method: "GET",
      url: "/api/stripe/founding-angels-status",
      query: { session_id: "cs_mock_123" },
      headers: { host: "itsyouonline.com" },
    });

    const mockPool = {
      connect: async () => ({
        query: async (sql) => {
          if (sql.includes("FROM public.founding_angel_orders")) {
            return {
              rows: [
                {
                  id: "order_mock_uuid",
                  status: "paid",
                  identity_id: "usr_active_member",
                  stripe_checkout_session_id: "cs_mock_123",
                  refunded_amount_cents: 0,
                  chargeback_amount_cents: 0,
                },
              ],
            };
          }
          if (sql.includes("FROM public.founding_angel_memberships")) {
            return {
              rows: [
                {
                  member_number: 42,
                  status: "active",
                  granted_at: new Date().toISOString(),
                },
              ],
            };
          }
          return { rows: [] };
        },
        release: () => {},
      }),
      query: async (sql) => {
        if (sql.includes("FROM public.founding_angel_orders")) {
          return {
            rows: [
              {
                id: "order_mock_uuid",
                status: "paid",
                identity_id: "usr_active_member",
                stripe_checkout_session_id: "cs_mock_123",
                refunded_amount_cents: 0,
                chargeback_amount_cents: 0,
              },
            ],
          };
        }
        if (sql.includes("FROM public.founding_angel_memberships")) {
          return {
            rows: [
              {
                member_number: 42,
                status: "active",
                granted_at: new Date().toISOString(),
              },
            ],
          };
        }
        return { rows: [] };
      },
    };

    await handler(req, res, {
      authenticateRequest: mockAuthSuccess,
      pool: mockPool,
      env: { FOUNDING_ANGELS_SALES_ENABLED: "false" },
    });

    assert.strictEqual(res.statusCode, 200, "Status query must return 200 even when sales paused");
    assert.strictEqual(res.bodyData?.status, "ok");
    assert.strictEqual(res.bodyData?.data?.found, true);
    assert.strictEqual(res.bodyData?.data?.memberNumber, 42);
    console.log("✔ Status query executes successfully during sales freeze");
  }

  console.log("\nAll Founding Angels Sales Freeze tests passed (100% unconditional pass rate).");
}

runTests().catch((err) => {
  console.error("Test failure:", err);
  process.exit(1);
});
