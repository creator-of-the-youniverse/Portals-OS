/**
 * /api/stripe/[action]
 *
 * Consolidated Stripe Dispatcher for Vercel Serverless deployment.
 * Preserves public endpoints:
 *   - POST /api/stripe/create-checkout
 *   - GET  /api/stripe/success
 *   - POST /api/stripe/webhook
 */

import Stripe from "stripe";
import { neon } from "@neondatabase/serverless";
import { nanoid } from "nanoid";
import { authenticateRequest } from "../../lib/serverlessAuth.ts";
import {
  createFoundingAngelCheckoutSession,
  handleCheckoutSessionCompleted,
  handleDisputeEvent,
  reconcileOrderRefundsFromStripe,
  getFoundingAngelStatus,
  FoundingAngelCapacityError,
  FoundingAngelSalesPausedError,
  isFoundingAngelsSalesEnabled,
} from "../../lib/foundingAngelsService.ts";

export const config = {
  api: {
    bodyParser: false, // Preserves pristine raw byte stream for webhook signature verification
  },
};

// ── Pack definitions (must match ClaimYouniverse.tsx PACKS) ──────────────────
const PACK_CONFIG: Record<
  string,
  { name: string; slots: number; priceInCents: number; stripePriceId?: string }
> = {
  starter: {
    name: "Starter Pack — 3 Youniverses",
    slots: 3,
    priceInCents: 900,
    stripePriceId: process.env.STRIPE_PRICE_STARTER,
  },
  explorer: {
    name: "Explorer Pack — 5 Youniverses",
    slots: 5,
    priceInCents: 1900,
    stripePriceId: process.env.STRIPE_PRICE_EXPLORER,
  },
  builder: {
    name: "Builder Pack — 10 Youniverses",
    slots: 10,
    priceInCents: 3900,
    stripePriceId: process.env.STRIPE_PRICE_BUILDER,
  },
  agency: {
    name: "Agency Pack — 50 Youniverses",
    slots: 50,
    priceInCents: 9900,
    stripePriceId: process.env.STRIPE_PRICE_AGENCY,
  },
  enterprise: {
    name: "Enterprise Pack — 100+ Youniverses",
    slots: 100,
    priceInCents: 0,
    stripePriceId: undefined,
  },
};

/** Read raw body from a Vercel/Node request */
async function getRawBody(req: any): Promise<Buffer> {
  if (Buffer.isBuffer(req.rawBody)) return req.rawBody;
  if (Buffer.isBuffer(req.body)) return req.body;
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

/** Handler for POST /api/stripe/create-checkout */
async function handleCreateCheckout(req: any, res: any, stripeSecret: string) {
  if (req.method !== "POST") {
    return res.status(405).json({ status: "method-not-allowed" });
  }

  let body = req.body;
  if (!body || typeof body !== "object" || Buffer.isBuffer(body)) {
    const raw = await getRawBody(req);
    try {
      body = raw.length > 0 ? JSON.parse(raw.toString("utf8")) : {};
    } catch {
      return res.status(400).json({ status: "invalid", message: "Invalid JSON body" });
    }
  }

  const { handle, email, packId } = body ?? {};

  // ── Validate inputs ────────────────────────────────────────
  if (!handle || typeof handle !== "string") {
    return res.status(400).json({ status: "invalid", message: "Handle is required." });
  }
  if (!email || typeof email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ status: "invalid", message: "A valid email is required." });
  }
  if (!packId || !PACK_CONFIG[packId]) {
    return res.status(400).json({ status: "invalid", message: "Invalid pack selected." });
  }

  const pack = PACK_CONFIG[packId];

  // Enterprise = contact us
  if (packId === "enterprise") {
    return res.status(200).json({
      status: "contact-required",
      message: "Enterprise plans require a custom quote.",
      contactUrl: "mailto:hello@itsyouonline.com?subject=Enterprise Pack Inquiry",
    });
  }

  const cleanHandle = handle.trim().toLowerCase().replace(/^@+/, "").replace(/[^a-z0-9_-]/g, "-");
  const origin = req.headers.origin || "https://itsyouonline.com";

  const stripe = new Stripe(stripeSecret, { apiVersion: "2026-08-26.dahlia" });

  try {
    const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = pack.stripePriceId
      ? [{ price: pack.stripePriceId, quantity: 1 }]
      : [
          {
            price_data: {
              currency: "usd",
              recurring: { interval: "month" },
              product_data: {
                name: pack.name,
                description: `${pack.slots} Youniverse handle${pack.slots > 1 ? "s" : ""} on ItsYouOnline`,
                metadata: { packId, slots: String(pack.slots) },
              },
              unit_amount: pack.priceInCents,
            },
            quantity: 1,
          },
        ];

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      payment_method_types: ["card"],
      line_items: lineItems,
      customer_email: email,
      metadata: {
        handle: cleanHandle,
        email,
        packId,
        slots: String(pack.slots),
      },
      success_url: `${origin}/api/stripe/success?session_id={CHECKOUT_SESSION_ID}&handle=${encodeURIComponent(cleanHandle)}`,
      cancel_url: `${origin}/?claim=${encodeURIComponent(cleanHandle)}`,
      allow_promotion_codes: true,
    });

    return res.status(200).json({ status: "ok", url: session.url });
  } catch (err: any) {
    console.error("[/api/stripe/create-checkout] Stripe error:", err);
    return res.status(500).json({ status: "error", message: err.message || "Checkout session creation failed." });
  }
}

/**
 * Resolves a trusted canonical origin for Stripe return URLs.
 * Fail-closed policy:
 *  1. Checks server environment configuration:
 *     - process.env.APP_URL
 *     - process.env.CANONICAL_URL
 *     If set, parses and validates as a valid http/https URL without path segments.
 *  2. If production runtime (NODE_ENV === "production" || VERCEL_ENV === "production"):
 *     - Defaults to "https://itsyouonline.com".
 *     - Never trusts unvalidated client Host / Origin headers.
 *  3. In non-production/development runtimes (local testing, preview branches):
 *     - Validates incoming Origin or Host header against allowed development host patterns:
 *       - localhost (any port)
 *       - 127.0.0.1 (any port)
 *       - [::1] (any port)
 *       - *.vercel.app (https only)
 *       - itsyouonline.com / *.itsyouonline.com (https only)
 *     - If candidate matches, returns validated origin `${protocol}//${hostname}${port}`.
 *     - If candidate header is hostile or unparseable, throws Error ("Untrusted origin or host").
 *     - If no header candidate is provided in dev, falls back to "http://localhost:5173".
 */
const APPROVED_VERCEL_PREVIEW_RE = /^portals-os(-[a-z0-9-]+)?\.vercel\.app$/i;
const CANONICAL_APEX_DOMAIN = "itsyouonline.com";

function isValidLocalhost(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";
}

function isAuthoritativePreviewHost(hostname: string, env: Record<string, string | undefined>): boolean {
  const authoritativeVercelUrl = env.VERCEL_URL ? env.VERCEL_URL.trim().toLowerCase() : "";
  const authoritativePreviewUrl = env.PREVIEW_URL ? env.PREVIEW_URL.trim().toLowerCase() : "";

  // 1. Authoritative VERCEL_URL matching project preview pattern
  if (authoritativeVercelUrl && hostname === authoritativeVercelUrl && APPROVED_VERCEL_PREVIEW_RE.test(hostname)) {
    return true;
  }

  // 2. Authoritative PREVIEW_URL explicitly configured
  if (authoritativePreviewUrl) {
    try {
      const parsed = authoritativePreviewUrl.includes("://")
        ? new URL(authoritativePreviewUrl)
        : new URL(`https://${authoritativePreviewUrl}`);
      if (parsed.hostname.toLowerCase() === hostname && APPROVED_VERCEL_PREVIEW_RE.test(hostname)) {
        return true;
      }
    } catch {}
  }

  // Without authoritative platform deployment metadata, unverified *.vercel.app hostnames are rejected
  return false;
}

/**
 * DEF-01 & Phase 35/36 Hardened Return URL Origin Resolution
 *
 * Enforces canonical, fail-closed return URL resolution:
 *  1. Production:
 *     - If APP_URL or CANONICAL_URL is set, validates scheme (https), port, absence of credentials,
 *       and host (must match canonical itsyouonline.com apex domain).
 *     - If unconfigured, falls back to canonical "https://itsyouonline.com".
 *     - Request Host, Origin, and X-Forwarded-* headers are NEVER trusted in production.
 *  2. Non-Production (Development & Testing):
 *     - If APP_URL or CANONICAL_URL is set, validates against localhost, itsyouonline.com, or verified preview.
 *     - Request Host / Origin headers are inspected under a strict allowlist:
 *       - localhost / 127.0.0.1 / [::1] (http/https, any port permitted for local dev)
 *       - Explicit, authoritatively verified project preview: portals-os(-*).vercel.app
 *         (requires matching env.VERCEL_URL or env.PREVIEW_URL metadata; unverified hostnames rejected)
 *       - Canonical apex itsyouonline.com (https only, standard port, no credentials; arbitrary subdomains rejected)
 *     - Hostile, third-party vercel apps, unverified portals-os-* domains, arbitrary subdomains,
 *       malformed hostnames, credentials in URLs, and unapproved schemes fail closed and throw.
 *     - If no candidate header is present, defaults to "http://localhost:5173".
 */
export function resolveTrustedOrigin(
  req?: any,
  env: Record<string, string | undefined> = process.env
): string {
  const isProd = env.NODE_ENV === "production" || env.VERCEL_ENV === "production";
  const configuredAppUrl = env.APP_URL || env.CANONICAL_URL;

  if (configuredAppUrl && typeof configuredAppUrl === "string" && configuredAppUrl.trim() !== "") {
    let parsed: URL;
    try {
      parsed = new URL(configuredAppUrl.trim());
    } catch {
      throw new Error(`Invalid URL configured in APP_URL/CANONICAL_URL: ${configuredAppUrl}`);
    }

    if (parsed.username || parsed.password) {
      throw new Error("Credentials not permitted in configured origin URL");
    }

    const host = parsed.hostname.toLowerCase();
    const isLocal = isValidLocalhost(host);

    if (parsed.protocol !== "https:" && !(isLocal && parsed.protocol === "http:")) {
      throw new Error("Configured URL must use HTTPS (HTTP permitted only for localhost)");
    }

    if (!isLocal && parsed.port && parsed.port !== "443" && parsed.port !== "80") {
      throw new Error(`Unexpected port on configured origin URL: ${parsed.port}`);
    }

    if (isProd) {
      if (host !== CANONICAL_APEX_DOMAIN && host !== `www.${CANONICAL_APEX_DOMAIN}`) {
        throw new Error("Configured production origin must be the canonical itsyouonline.com domain");
      }
    } else {
      const isApprovedPreview = isAuthoritativePreviewHost(host, env) || APPROVED_VERCEL_PREVIEW_RE.test(host);
      if (!isLocal && host !== CANONICAL_APEX_DOMAIN && !isApprovedPreview) {
        throw new Error("Configured origin must be localhost, itsyouonline.com, or portals-os preview");
      }
    }

    return parsed.origin;
  }

  if (isProd) {
    return "https://itsyouonline.com";
  }

  const candidateHeader = req?.headers?.origin || req?.headers?.host;
  const candidate = Array.isArray(candidateHeader) ? candidateHeader[0] : candidateHeader;

  if (candidate && typeof candidate === "string" && candidate.trim() !== "") {
    let candidateUrl: URL;
    try {
      if (candidate.includes("://")) {
        candidateUrl = new URL(candidate.trim());
      } else {
        const isBareLocal =
          candidate.startsWith("localhost") ||
          candidate.startsWith("127.0.0.1") ||
          candidate.startsWith("[::1]");
        candidateUrl = new URL((isBareLocal ? "http://" : "https://") + candidate.trim());
      }
    } catch {
      throw new Error(`Malformed host or origin: ${candidate}`);
    }

    if (candidateUrl.username || candidateUrl.password) {
      throw new Error("Credentials in origin URL are not permitted");
    }

    const hostname = candidateUrl.hostname.toLowerCase();
    const isLocal = isValidLocalhost(hostname);

    if (candidateUrl.protocol !== "https:" && !(isLocal && candidateUrl.protocol === "http:")) {
      throw new Error("Invalid scheme: only HTTPS is permitted (HTTP permitted only for localhost)");
    }

    if (!isLocal && candidateUrl.port && candidateUrl.port !== "443" && candidateUrl.port !== "80") {
      throw new Error(`Unexpected port on remote origin: ${candidateUrl.port}`);
    }

    if (isLocal) {
      const port = candidateUrl.port ? `:${candidateUrl.port}` : "";
      return `${candidateUrl.protocol}//${hostname}${port}`;
    }

    // Exact canonical apex domain accepted
    if (hostname === CANONICAL_APEX_DOMAIN) {
      return `https://${hostname}`;
    }

    // Preview origin accepted ONLY IF authoritatively verified by deployment metadata
    if (isAuthoritativePreviewHost(hostname, env)) {
      return `https://${hostname}`;
    }

    throw new Error(`Untrusted host or origin: ${candidate}`);
  }

  return "http://localhost:5173";
}

/** Handler for POST /api/stripe/founding-angels-checkout */
async function handleFoundingAngelCheckout(req: any, res: any, stripeSecret: string, deps: any = {}) {
  if (req.method !== "POST") {
    return res.status(405).json({ status: "method-not-allowed" });
  }

  const salesEnabled = deps?.salesEnabled ?? isFoundingAngelsSalesEnabled(deps?.env ?? process.env);
  if (!salesEnabled) {
    return res.status(503).json({
      status: "sales-paused",
      error: "SALES_PAUSED",
      message: "Founding Angels enrollment is temporarily paused.",
    });
  }

  const auth = deps?.authenticateRequest
    ? await deps.authenticateRequest(req)
    : await authenticateRequest(req, deps?.authDeps);

  if (!auth.ok) {
    const errorAuth = auth as { status: number; error: string; message: string };
    return res.status(errorAuth.status).json({ status: errorAuth.error, message: errorAuth.message });
  }

  let trustedOrigin: string;
  try {
    trustedOrigin = resolveTrustedOrigin(req);
  } catch (err: any) {
    console.error("[/api/stripe/founding-angels-checkout] Origin resolution rejected:", err.message);
    return res.status(400).json({ status: "invalid-origin", message: err.message || "Invalid origin." });
  }

  const stripe = deps?.stripe ?? new Stripe(stripeSecret, { apiVersion: "2026-08-26.dahlia" });

  try {
    const result = await createFoundingAngelCheckoutSession(auth.user.youniverseId, trustedOrigin, { stripe, ...deps });
    return res.status(200).json({ status: "ok", url: result.url, sessionId: result.sessionId });
  } catch (err: any) {
    console.error("[/api/stripe/founding-angels-checkout] Error:", err);
    if (
      err instanceof FoundingAngelSalesPausedError ||
      err?.code === "SALES_PAUSED" ||
      err?.message?.includes("temporarily paused")
    ) {
      return res.status(503).json({
        status: "sales-paused",
        error: "SALES_PAUSED",
        message: "Founding Angels enrollment is temporarily paused.",
      });
    }
    if (
      err instanceof FoundingAngelCapacityError ||
      err?.code === "CAPACITY_FULL" ||
      err?.message?.includes("capacity is full") ||
      err?.message?.includes("All 500 Founding Angel memberships have been claimed")
    ) {
      return res.status(409).json({
        status: "sold-out",
        message: "All 500 Founding Angel memberships have been claimed.",
      });
    }
    return res.status(500).json({ status: "error", message: err.message || "Checkout session creation failed." });
  }
}

/** Handler for GET /api/stripe/success */
async function handleSuccess(req: any, res: any, stripeSecret: string) {
  if (req.method !== "GET") {
    return res.status(405).end();
  }

  const { session_id, handle } = req.query ?? {};

  if (!session_id || !handle) {
    return res.redirect("/");
  }

  const stripe = new Stripe(stripeSecret, { apiVersion: "2026-08-26.dahlia" });

  try {
    const session = await stripe.checkout.sessions.retrieve(String(session_id));

    if (session.payment_status === "paid" || session.status === "complete") {
      const cleanHandle = String(handle).replace(/^@+/, "").toLowerCase();
      const host = req.headers.host || "itsyouonline.com";

      if (host.includes("localhost") || host.includes("127.0.0.1") || host.includes("vercel.app")) {
        return res.redirect(`/?@=${encodeURIComponent(cleanHandle)}&entered=true`);
      } else {
        return res.redirect(`https://${cleanHandle}.itsyouonline.com?entered=true`);
      }
    }
  } catch (err) {
    console.error("[/api/stripe/success] Error:", err);
  }

  return res.redirect("/");
}

/** Handler for POST /api/stripe/webhook */
async function handleWebhook(req: any, res: any, stripeSecret: string, deps: any = {}) {
  if (req.method !== "POST") {
    return res.status(405).json({ status: "method-not-allowed" });
  }

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  const databaseUrl = process.env.DATABASE_URL;

  if (!webhookSecret || !databaseUrl) {
    console.error("[webhook] Missing env vars (STRIPE_WEBHOOK_SECRET or DATABASE_URL)");
    return res.status(500).json({ status: "configuration-error" });
  }

  const stripe = deps.stripe ?? new Stripe(stripeSecret, { apiVersion: "2026-08-26.dahlia" });
  const rawBody = await getRawBody(req);
  const sig = req.headers["stripe-signature"];

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret);
  } catch (err: any) {
    console.error("[webhook] Signature verification failed:", err.message);
    return res.status(400).json({ status: "signature-invalid" });
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;

    // Delegate to Founding Angel fulfillment if tagged
    if (session.metadata?.type === "founding_angel") {
      try {
        const result = await handleCheckoutSessionCompleted(session, { stripe, ...deps });
        return res.status(200).json({ received: true, foundingAngel: result });
      } catch (err: any) {
        console.error("[webhook] Founding Angel checkout completion failed:", err);
        return res.status(500).json({ status: "db-error", message: err.message });
      }
    }

    const handle = session.metadata?.handle;
    const email = session.metadata?.email || session.customer_email || "";
    const packId = session.metadata?.packId || "starter";

    if (!handle) {
      console.error("[webhook] Missing handle in session metadata");
      return res.status(400).json({ status: "missing-handle" });
    }

    const sql = neon(databaseUrl);

    try {
      const existing = await sql`
        SELECT 1 FROM youniverse_identities WHERE username = ${handle} LIMIT 1
      `;

      if (existing.length === 0) {
        const identityId = nanoid();
        const subdomain = `${handle}.itsyouonline.com`;

        await sql`
          INSERT INTO youniverse_identities (
            identity_id, username, display_name, subdomain,
            identity_type, email, plan, stripe_session_id, created_at
          )
          VALUES (
            ${identityId}, ${handle}, ${handle}, ${subdomain},
            ${"person"}, ${email.toLowerCase()}, ${packId},
            ${session.id}, ${new Date().toISOString()}
          )
        `;

        console.log(`[webhook] ✅ Registered @${handle} on plan:${packId}`);
      } else {
        console.log(`[webhook] @${handle} already exists — skipping (idempotent)`);
      }
    } catch (err: any) {
      console.error("[webhook] DB error:", err);
      return res.status(500).json({ status: "db-error" });
    }
  }

  // Handle dispute events for Founding Angel orders
  if (
    event.type === "charge.dispute.created" ||
    event.type === "charge.dispute.closed" ||
    event.type === "charge.dispute.funds_reinstated" ||
    event.type === "charge.dispute.funds_withdrawn"
  ) {
    try {
      const result = await handleDisputeEvent(event, { stripe, ...deps });
      return res.status(200).json({ received: true, dispute: result });
    } catch (err: any) {
      console.error("[webhook] Dispute event handling failed:", err);
      return res.status(500).json({ status: "dispute-error", message: err.message });
    }
  }

  // Handle refund events for Founding Angel orders
  if (
    event.type === "refund.created" ||
    event.type === "refund.updated" ||
    event.type === "charge.refund.updated" ||
    event.type === "charge.refunded"
  ) {
    let chargeId: string | undefined;
    if (event.type === "charge.refunded") {
      const chargeObj = event.data.object as any;
      chargeId = typeof chargeObj?.id === "string" ? chargeObj.id : undefined;
    } else {
      const refundObj = event.data.object as any;
      chargeId = typeof refundObj?.charge === "string" ? refundObj.charge : refundObj?.charge?.id;
    }

    if (chargeId) {
      try {
        let orderId: string | undefined;
        if (deps.pool) {
          const resQuery = await deps.pool.query(
            `SELECT id FROM public.founding_angel_orders WHERE stripe_charge_id = $1 LIMIT 1`,
            [chargeId]
          );
          if (resQuery.rows.length > 0) {
            orderId = resQuery.rows[0].id;
          }
        } else {
          const sql = deps.sql ?? neon(databaseUrl);
          const orders = await sql`
            SELECT id FROM founding_angel_orders WHERE stripe_charge_id = ${chargeId} LIMIT 1
          `;
          if (orders.length > 0) {
            orderId = orders[0].id;
          }
        }

        if (orderId) {
          const result = await reconcileOrderRefundsFromStripe(orderId, { stripe, ...deps });
          return res.status(200).json({ received: true, reconciled: result });
        }
      } catch (err: any) {
        console.error("[webhook] Refund update reconciliation failed:", err);
        return res.status(500).json({ status: "refund-reconcile-error", message: err.message });
      }
    }
  }

  return res.status(200).json({ received: true });
}

/** Default entry point: dispatches by action query parameter or URL path segment */
export default async function handler(req: any, res: any, deps: any = {}) {
  // Resolve action from req.query.action or URL path
  let action: string | undefined;
  if (req.query?.action) {
    action = Array.isArray(req.query.action) ? req.query.action[0] : req.query.action;
  } else if (req.url) {
    const pathname = req.url.split("?")[0];
    action = pathname.split("/").filter(Boolean).pop();
  }

  const stripeSecret = process.env.STRIPE_SECRET_KEY;
  if (!stripeSecret) {
    if (action === "success") {
      return res.redirect("/?error=config");
    }
    return res.status(500).json({ status: "configuration-error", message: "Stripe not configured." });
  }

  switch (action) {
    case "create-checkout":
      return handleCreateCheckout(req, res, stripeSecret);
    case "founding-angels-checkout":
      return handleFoundingAngelCheckout(req, res, stripeSecret, deps);
    case "founding-angels-status":
      return handleFoundingAngelStatus(req, res, deps);
    case "success":
      return handleSuccess(req, res, stripeSecret);
    case "webhook":
      return handleWebhook(req, res, stripeSecret, deps);
    default:
      return res.status(404).json({ status: "not-found", message: `Unknown Stripe action: ${action}` });
  }
}

/** Handler for GET /api/stripe/founding-angels-status */
async function handleFoundingAngelStatus(req: any, res: any, deps: any = {}) {
  if (req.method !== "GET") {
    return res.status(405).json({ status: "method-not-allowed" });
  }

  const auth = deps?.authenticateRequest
    ? await deps.authenticateRequest(req)
    : await authenticateRequest(req, deps?.authDeps);

  if (!auth.ok) {
    const errorAuth = auth as { status: number; error: string; message: string };
    return res.status(errorAuth.status).json({ status: errorAuth.error, message: errorAuth.message });
  }

  const sessionId = req.query?.session_id;
  if (!sessionId || typeof sessionId !== "string") {
    return res.status(400).json({ status: "error", message: "session_id query parameter is required." });
  }

  try {
    const statusResult = await getFoundingAngelStatus(auth.user.youniverseId, sessionId, deps);
    if (!statusResult.found) {
      return res.status(404).json({ status: "not_found", message: statusResult.message });
    }
    return res.status(200).json({ status: "ok", data: statusResult, handle: auth.user.handle });
  } catch (err: any) {
    console.error("[/api/stripe/founding-angels-status] Error:", err);
    return res.status(500).json({ status: "error", message: err.message || "Failed to query status." });
  }
}


