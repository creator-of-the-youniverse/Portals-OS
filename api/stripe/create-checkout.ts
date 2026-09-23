/**
 * POST /api/stripe/create-checkout
 *
 * Creates a Stripe Checkout Session for a paid Youniverse pack.
 * Called by ClaimYouniverse.tsx when the user selects a paid tier.
 *
 * Body: { handle: string, email: string, packId: string }
 * Response: { url: string } — redirect to Stripe hosted checkout
 */

import Stripe from "stripe";

// ── Pack definitions (must match ClaimYouniverse.tsx PACKS) ──────────────────
// Prices are in cents (USD). Update these when you have real Stripe Price IDs.
const PACK_CONFIG: Record<
  string,
  { name: string; slots: number; priceInCents: number; stripePriceId?: string }
> = {
  starter: {
    name: "Starter Pack — 3 Youniverses",
    slots: 3,
    priceInCents: 900,           // $9/mo — replace with real Stripe Price ID below
    stripePriceId: process.env.STRIPE_PRICE_STARTER,
  },
  explorer: {
    name: "Explorer Pack — 5 Youniverses",
    slots: 5,
    priceInCents: 1900,          // $19/mo
    stripePriceId: process.env.STRIPE_PRICE_EXPLORER,
  },
  builder: {
    name: "Builder Pack — 10 Youniverses",
    slots: 10,
    priceInCents: 3900,          // $39/mo
    stripePriceId: process.env.STRIPE_PRICE_BUILDER,
  },
  agency: {
    name: "Agency Pack — 50 Youniverses",
    slots: 50,
    priceInCents: 9900,          // $99/mo
    stripePriceId: process.env.STRIPE_PRICE_AGENCY,
  },
  enterprise: {
    name: "Enterprise Pack — 100+ Youniverses",
    slots: 100,
    priceInCents: 0,             // Custom — redirect to contact
    stripePriceId: undefined,
  },
};

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") {
    return res.status(405).json({ status: "method-not-allowed" });
  }

  const stripeSecret = process.env.STRIPE_SECRET_KEY;
  if (!stripeSecret) {
    return res.status(500).json({ status: "configuration-error", message: "Stripe not configured." });
  }

  const { handle, email, packId } = req.body ?? {};

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

  const stripe = new Stripe(stripeSecret, { apiVersion: "2025-06-30.basil" });

  try {
    // ── Build line items ────────────────────────────────────────
    // If a real Stripe Price ID is configured, use recurring subscription.
    // Otherwise fall back to an inline one-time price (good for testing).
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
