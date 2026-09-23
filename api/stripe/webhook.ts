/**
 * POST /api/stripe/webhook
 *
 * Receives Stripe webhook events and registers the Youniverse
 * after a successful subscription checkout.
 *
 * Events handled:
 *   - checkout.session.completed → create the identity in Neon DB
 *
 * Configure in Stripe Dashboard:
 *   Endpoint URL: https://itsyouonline.com/api/stripe/webhook
 *   Events:       checkout.session.completed
 */

import Stripe from "stripe";
import { neon } from "@neondatabase/serverless";
import { nanoid } from "nanoid";

export const config = {
  api: {
    bodyParser: false, // Stripe requires the raw body for signature verification
  },
};

/** Read raw body from a Vercel/Express request */
async function getRawBody(req: any): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") {
    return res.status(405).json({ status: "method-not-allowed" });
  }

  const stripeSecret = process.env.STRIPE_SECRET_KEY;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  const databaseUrl = process.env.DATABASE_URL;

  if (!stripeSecret || !webhookSecret || !databaseUrl) {
    console.error("[webhook] Missing env vars");
    return res.status(500).json({ status: "configuration-error" });
  }

  const stripe = new Stripe(stripeSecret, { apiVersion: "2025-06-30.basil" });
  const rawBody = await getRawBody(req);
  const sig = req.headers["stripe-signature"];

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret);
  } catch (err: any) {
    console.error("[webhook] Signature verification failed:", err.message);
    return res.status(400).json({ status: "signature-invalid" });
  }

  // ── Handle checkout.session.completed ─────────────────────────────────────
  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;

    const handle = session.metadata?.handle;
    const email = session.metadata?.email || session.customer_email || "";
    const packId = session.metadata?.packId || "starter";

    if (!handle) {
      console.error("[webhook] Missing handle in session metadata");
      return res.status(400).json({ status: "missing-handle" });
    }

    const sql = neon(databaseUrl);

    try {
      // Check if already registered (idempotency)
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
      // Return 500 so Stripe retries
      return res.status(500).json({ status: "db-error" });
    }
  }

  return res.status(200).json({ received: true });
}
