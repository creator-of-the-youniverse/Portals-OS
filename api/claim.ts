/**
 * POST /api/claim
 *
 * Registers a Youniverse handle directly to Neon DB:
 *   1. Writes to `handles` & `youniverse_seeds`
 *   2. Generates single-use nonce in `handoff_tokens`
 *   3. Returns signed RS256 token in redirectUrl fragment
 */

import { neon } from "@neondatabase/serverless";
import { randomBytes } from "crypto";
import { nanoid } from "nanoid";
import { signHandoffToken } from "../lib/cryptoHandoff";

/** System Youniverses + infrastructure labels that can never be personally claimed. */
const RESERVED_HANDLES = new Set([
  "welcome", "www", "claim", "api", "admin", "app", "mail", "system", "root", "help", "support",
]);

const FOUNDATION_LAW_IDS = new Set([
  "open", "private", "creative", "minimal", "curious", "builder", "playful", "quiet",
  "Open", "Private", "Creative", "Minimal", "Curious", "Builder", "Playful", "Quiet",
]);

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") {
    return res.status(405).json({ status: "method-not-allowed" });
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    return res.status(500).json({ status: "configuration-error", message: "Database not configured." });
  }

  const { handle, email, displayName, foundation, energyHue } = req.body ?? {};

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

  if (!cleanHandle || cleanHandle.length < 3 || cleanHandle.length > 32) {
    return res.status(400).json({ status: "invalid", message: "Handle must be 3–32 characters." });
  }

  if (RESERVED_HANDLES.has(cleanHandle)) {
    return res.status(409).json({ status: "reserved", message: `@${cleanHandle} is a system Youniverse.` });
  }

  if (!email || typeof email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ status: "invalid", message: "A valid email is required." });
  }

  // Foundation laws: keep only known ids, max 3, de-duplicated.
  const cleanFoundation: string[] = Array.isArray(foundation)
    ? Array.from(new Set(foundation.filter((f: unknown) => typeof f === "string" && FOUNDATION_LAW_IDS.has(f)))).slice(0, 3) as string[]
    : [];

  const cleanHue: number =
    typeof energyHue === "number" && Number.isFinite(energyHue)
      ? Math.round(((energyHue % 360) + 360) % 360)
      : 258;

  const sql = neon(databaseUrl);
  const cleanEmail = email.toLowerCase().trim();
  const createdAt = new Date().toISOString();
  const subdomain = `${cleanHandle}.itsyouonline.com`;

  try {
    // ── Check if handle is already taken ──────────────────────
    const existing = await sql`
      SELECT 1 FROM handles WHERE handle = ${cleanHandle}
      UNION
      SELECT 1 FROM youniverse_identities WHERE username = ${cleanHandle}
      LIMIT 1
    `;

    if (existing.length > 0) {
      return res.status(409).json({ status: "username-taken", message: `@${cleanHandle} is already claimed.` });
    }

    // ── 1. Transactional reservation in handles & youniverse_seeds ──
    try {
      await sql`
        INSERT INTO handles (handle, owner_email, status, created_at)
        VALUES (${cleanHandle}, ${cleanEmail}, 'claimed', ${createdAt})
        ON CONFLICT (handle) DO NOTHING
      `;

      await sql`
        INSERT INTO youniverse_seeds (handle, energy_hue, foundation_laws, is_system, created_at)
        VALUES (${cleanHandle}, ${cleanHue}, ${JSON.stringify(cleanFoundation)}::jsonb, FALSE, ${createdAt})
        ON CONFLICT (handle) DO UPDATE SET
          energy_hue = ${cleanHue},
          foundation_laws = ${JSON.stringify(cleanFoundation)}::jsonb
      `;
    } catch (schemaErr: any) {
      console.warn("[/api/claim] Notice: handles/seeds table insertion notice", schemaErr?.message);
    }

    // ── 2. Mirror into youniverse_identities for legacy/runtime compatibility ──
    const identityId = nanoid();
    const resolvedDisplayName = (displayName && typeof displayName === "string")
      ? displayName.trim().slice(0, 80)
      : cleanHandle;

    try {
      await sql`
        INSERT INTO youniverse_identities (
          identity_id, username, display_name, subdomain, identity_type, email, plan, foundation, energy_hue, created_at
        )
        VALUES (
          ${identityId}, ${cleanHandle}, ${resolvedDisplayName}, ${subdomain},
          'person', ${cleanEmail}, 'free', ${JSON.stringify({ laws: cleanFoundation, forgedAt: createdAt })}::jsonb, ${cleanHue}, ${createdAt}
        )
      `;
    } catch (identErr: any) {
      console.warn("[/api/claim] youniverse_identities mirror notice:", identErr?.message);
    }

    // ── 3. Generate nonce & token for handoff ──────────────────
    const nonce = randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 90 * 1000); // 90 seconds lifetime

    try {
      await sql`
        INSERT INTO handoff_tokens (handle, nonce, expires_at)
        VALUES (${cleanHandle}, ${nonce}, ${expiresAt.toISOString()})
      `;
    } catch (tokenErr: any) {
      console.warn("[/api/claim] handoff_tokens insert notice:", tokenErr?.message);
    }

    const token = signHandoffToken({ handle: cleanHandle, nonce });

    // ── 4. Respond with Subdomain Redirection Fragment ─────────
    const redirectUrl = `https://${cleanHandle}.itsyouonline.com/#handoff_token=${token}`;

    return res.status(201).json({
      success: true,
      status: "created",
      username: cleanHandle,
      subdomain,
      redirectUrl,
      handoffToken: token,
      foundation: cleanFoundation,
      energyHue: cleanHue,
    });

  } catch (err: any) {
    console.error("[/api/claim] Error:", err);
    if (err?.code === "23505" || err?.message?.includes("unique")) {
      return res.status(409).json({ status: "username-taken", message: `@${cleanHandle} is already claimed.` });
    }
    return res.status(500).json({ status: "error", message: "Failed to register Youniverse. Please try again." });
  }
}
