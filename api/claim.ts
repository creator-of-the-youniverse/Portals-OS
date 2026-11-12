/**
 * POST /api/claim
 *
 * Registers a free-tier Youniverse handle directly to the Neon DB in PENDING_EMAIL_VERIFICATION state.
 *
 * Security contract (Phase R6A):
 *  - State transitions: UNCLAIMED → PENDING_EMAIL_VERIFICATION.
 *  - A successful claim does NOT grant an owner session or prove email ownership.
 *  - Generates a dedicated, cryptographically random email verification token.
 *  - Only SHA-256(verificationToken) is stored in `email_verification_tokens`.
 *  - Verification token expires and is single-use.
 *  - Raw verification token is dispatched out-of-band via configured email provider.
 *  - Never returns an active owner session token.
 *
 * Body: { handle: string, email: string, displayName?: string }
 * Response: { success: true, status: "pending_verification", username, subdomain, identityId, message }
 */

import { neon } from "@neondatabase/serverless";
import { nanoid } from "nanoid";
import { createVerificationToken as defaultCreateVerificationToken } from "../lib/emailVerification.ts";
import {
  sendVerificationEmail as defaultSendVerificationEmail,
  isProductionRuntime,
} from "../lib/emailService.ts";

export interface ClaimHandlerDeps {
  sql?: any;
  databaseUrl?: string;
  createVerificationToken?: typeof defaultCreateVerificationToken;
  sendVerificationEmail?: typeof defaultSendVerificationEmail;
  isProduction?: () => boolean;
  failClosedOnEmailFailure?: boolean;
}

export default async function handler(req: any, res: any, deps: ClaimHandlerDeps = {}) {
  if (req.method !== "POST") {
    return res.status(405).json({ status: "method-not-allowed", error: "method-not-allowed" });
  }

  const databaseUrl = deps.databaseUrl ?? process.env.DATABASE_URL;
  if (!databaseUrl && !deps.sql) {
    return res.status(500).json({ status: "configuration-error", error: "configuration-error", message: "Database not configured." });
  }

  const { handle, email, displayName } = req.body ?? {};

  // ── Validate inputs ────────────────────────────────────────
  if (!handle || typeof handle !== "string") {
    return res.status(400).json({ status: "invalid", error: "invalid", message: "A valid handle is required." });
  }

  const cleanHandle = handle
    .trim()
    .toLowerCase()
    .replace(/^@+/, "")
    .replace(/[^a-z0-9_-]/g, "-")
    .replace(/^-+|-+$/g, "");

  if (!cleanHandle || cleanHandle.length < 2 || cleanHandle.length > 50) {
    return res.status(400).json({ status: "invalid", error: "invalid", message: "Handle must be 2–50 characters." });
  }

  if (!email || typeof email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ status: "invalid", error: "invalid", message: "A valid email is required." });
  }

  const sql = deps.sql ?? neon(databaseUrl!);
  const createVerificationTokenFn = deps.createVerificationToken ?? defaultCreateVerificationToken;
  const sendVerificationEmailFn = deps.sendVerificationEmail ?? defaultSendVerificationEmail;
  const isProductionFn = deps.isProduction ?? isProductionRuntime;

  const normalizedEmail = email.toLowerCase().trim();
  const subdomain = `${cleanHandle}.itsyouonline.com`;
  const resolvedDisplayName = (displayName && typeof displayName === "string")
    ? displayName.trim().slice(0, 80)
    : cleanHandle;

  try {
    // ── Check if handle already exists in DB ────────────────────
    const existing = await sql`
      SELECT identity_id, username, email, email_verified_at, plan
      FROM youniverse_identities
      WHERE username = ${cleanHandle}
      LIMIT 1
    `;

    let identityId: string;

    if (existing.length > 0) {
      const existingIdentity = existing[0];

      // 1. Refuse to overwrite an already verified identity
      if (existingIdentity.email_verified_at !== null) {
        return res.status(409).json({
          status: "username-taken",
          error: "username-taken",
          message: `@${cleanHandle} is already claimed.`,
        });
      }

      // 2. Refuse if an unverified handle was claimed by a different email
      if (existingIdentity.email && existingIdentity.email.toLowerCase().trim() !== normalizedEmail) {
        return res.status(409).json({
          status: "username-taken",
          error: "username-taken",
          message: `@${cleanHandle} is already claimed.`,
        });
      }

      // 3. Safe retry by the same email on an unverified handle:
      // Verify the user has no other free claimed handle
      const otherFreeClaims = await sql`
        SELECT 1 FROM youniverse_identities
        WHERE email = ${normalizedEmail}
          AND plan = 'free'
          AND username != ${cleanHandle}
        LIMIT 1
      `;

      if (otherFreeClaims.length > 0) {
        return res.status(402).json({
          status: "payment_required",
          error: "payment_required",
          message: "A free Youniverse has already been claimed with this email. Upgrade to create additional Youniverses.",
        });
      }

      identityId = existingIdentity.identity_id;

      // Update display name if provided
      if (displayName && typeof displayName === "string") {
        await sql`
          UPDATE youniverse_identities
          SET display_name = ${resolvedDisplayName}
          WHERE identity_id = ${identityId} AND email_verified_at IS NULL
        `;
      }

      // Invalidate any superseded unconsumed verification tokens for this identity
      await sql`
        UPDATE email_verification_tokens
        SET consumed_at = NOW()
        WHERE identity_id = ${identityId}
          AND consumed_at IS NULL
      `;
    } else {
      // ── New claim: Check 'One Free Youniverse' rule via Email ──
      const existingEmailClaims = await sql`
        SELECT 1 FROM youniverse_identities
        WHERE email = ${normalizedEmail} AND plan = 'free'
        LIMIT 1
      `;

      if (existingEmailClaims.length > 0) {
        return res.status(402).json({
          status: "payment_required",
          error: "payment_required",
          message: "A free Youniverse has already been claimed with this email. Upgrade to create additional Youniverses.",
        });
      }

      // ── Create the identity (PENDING_EMAIL_VERIFICATION) ────
      identityId = nanoid();

      await sql`
        INSERT INTO youniverse_identities (
          identity_id,
          username,
          display_name,
          subdomain,
          identity_type,
          email,
          plan,
          email_verified_at,
          created_at
        )
        VALUES (
          ${identityId},
          ${cleanHandle},
          ${resolvedDisplayName},
          ${subdomain},
          ${"person"},
          ${normalizedEmail},
          ${"free"},
          ${null},
          ${new Date().toISOString()}
        )
      `;
    }

    // ── Generate dedicated email verification token ───────────
    const { rawToken } = await createVerificationTokenFn(sql, identityId, {
      ttlSeconds: 60 * 60 * 24, // 24 hours
    });

    // ── Dispatch email verification link ─────────────────────
    const emailResult = await sendVerificationEmailFn({
      email: normalizedEmail,
      handle: cleanHandle,
      token: rawToken,
    });

    const isProduction = isProductionFn();

    // ── Enforce truthful response semantics ───────────────────
    if (!emailResult.sent) {
      if (isProduction || deps.failClosedOnEmailFailure) {
        return res.status(503).json({
          success: false,
          status: "email_delivery_failed",
          error: "email_delivery_failed",
          message: "We could not dispatch your verification email at this time. Your claim has been reserved—please try claiming again in a few moments to resend.",
        });
      }

      // Local development fallback (offline dev with no Resend key)
      return res.status(201).json({
        success: true,
        status: "pending_verification",
        username: cleanHandle,
        subdomain,
        identityId,
        emailSent: false,
        message: "Handle claimed. Email delivery service unconfigured in local development.",
      });
    }

    // ── Respond: Identity created/refreshed, pending email verification ─
    return res.status(201).json({
      success: true,
      status: "pending_verification",
      username: cleanHandle,
      subdomain,
      identityId,
      emailSent: true,
      message: "A verification link has been dispatched to your email.",
    });

  } catch (err: any) {
    console.error("[/api/claim] DB error:", err);

    if (err?.code === "23505" || err?.message?.includes("unique")) {
      return res.status(409).json({
        status: "username-taken",
        error: "username-taken",
        message: `@${cleanHandle} is already claimed.`,
      });
    }

    return res.status(500).json({
      status: "error",
      error: "database_error",
      message: "Failed to register Youniverse. Please try again.",
    });
  }
}
