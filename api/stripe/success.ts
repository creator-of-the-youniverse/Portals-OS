/**
 * GET /api/stripe/success
 *
 * Handles the Stripe success redirect.
 * Validates the session, then redirects the user to their new Youniverse.
 *
 * Query params: ?session_id=cs_xxx&handle=theirhandle
 */

import Stripe from "stripe";

export default async function handler(req: any, res: any) {
  if (req.method !== "GET") {
    return res.status(405).end();
  }

  const stripeSecret = process.env.STRIPE_SECRET_KEY;
  if (!stripeSecret) {
    return res.redirect("/?error=config");
  }

  const { session_id, handle } = req.query ?? {};

  if (!session_id || !handle) {
    return res.redirect("/");
  }

  const stripe = new Stripe(stripeSecret, { apiVersion: "2025-06-30.basil" });

  try {
    const session = await stripe.checkout.sessions.retrieve(String(session_id));

    if (session.payment_status === "paid" || session.status === "complete") {
      // Redirect to the claimed Youniverse
      const cleanHandle = String(handle).replace(/^@+/, "").toLowerCase();
      const host = req.headers.host || "itsyouonline.com";

      // In production redirect to the subdomain; in dev stay on localhost
      if (host.includes("localhost") || host.includes("127.0.0.1") || host.includes("vercel.app")) {
        return res.redirect(`/?@=${encodeURIComponent(cleanHandle)}&entered=true`);
      } else {
        return res.redirect(`https://${cleanHandle}.itsyouonline.com?entered=true`);
      }
    }
  } catch (err) {
    console.error("[/api/stripe/success] Error:", err);
  }

  // Fallback
  return res.redirect("/");
}
