/**
 * POST /api/claim
 *
 * Registers a free-tier Youniverse handle directly to the Neon DB.
 * Called by ClaimYouniverse.tsx for the Sovereign Free plan.
 *
 * Body: { handle: string, email: string, displayName?: string }
 * Response: { status: "created" | "username-taken" | "invalid" | "error", subdomain?: string }
 */

import { neon } from "@neondatabase/serverless";
import { nanoid } from "nanoid";

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") {
    return res.status(405).json({ status: "method-not-allowed" });
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    return res.status(500).json({ status: "configuration-error", message: "Database not configured." });
  }

  const { handle, email, displayName } = req.body ?? {};

  // ── Validate inputs ────────────────────────────────────────
  if (!handle || typeof handle !== "string") {
    return res.status(400).json({ status: "invalid", message: "A valid handle is required." });
  }

  const cleanHandle = handle
    .trim()
    .toLowerCase()
    .replace(/^@+/, "")
    .replace(/[^a-z0-9_-]/g, "-")
    .replace(/^-+|-+$/g, "");

  if (!cleanHandle || cleanHandle.length < 2 || cleanHandle.length > 50) {
    return res.status(400).json({ status: "invalid", message: "Handle must be 2–50 characters." });
  }

  if (!email || typeof email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ status: "invalid", message: "A valid email is required." });
  }

  const sql = neon(databaseUrl);

  try {
    // ── Check if handle is already taken ──────────────────────
    const existing = await sql`
      SELECT 1 FROM youniverse_identities
      WHERE username = ${cleanHandle}
      LIMIT 1
    `;

    if (existing.length > 0) {
      return res.status(409).json({ status: "username-taken", message: `@${cleanHandle} is already claimed.` });
    }

    // ── Create the identity ────────────────────────────────────
    const identityId = nanoid();
    const subdomain = `${cleanHandle}.itsyouonline.com`;
    const resolvedDisplayName = (displayName && typeof displayName === "string")
      ? displayName.trim().slice(0, 80)
      : cleanHandle;

    await sql`
      INSERT INTO youniverse_identities (
        identity_id,
        username,
        display_name,
        subdomain,
        identity_type,
        email,
        plan,
        created_at
      )
      VALUES (
        ${identityId},
        ${cleanHandle},
        ${resolvedDisplayName},
        ${subdomain},
        ${"person"},
        ${email.toLowerCase().trim()},
        ${"free"},
        ${new Date().toISOString()}
      )
    `;

    // ── Respond ────────────────────────────────────────────────
    return res.status(201).json({
      status: "created",
      username: cleanHandle,
      subdomain,
      identityId,
    });

  } catch (err: any) {
    console.error("[/api/claim] DB error:", err);

    // Handle unique constraint violation from DB
    if (err?.code === "23505" || err?.message?.includes("unique")) {
      return res.status(409).json({ status: "username-taken", message: `@${cleanHandle} is already claimed.` });
    }

    return res.status(500).json({ status: "error", message: "Failed to register Youniverse. Please try again." });
  }
}
