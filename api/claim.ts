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
import { randomBytes } from "crypto";
import { nanoid } from "nanoid";
import { createVerificationToken as defaultCreateVerificationToken } from "../lib/emailVerification.ts";
import {
  sendVerificationEmail as defaultSendVerificationEmail,
  isProductionRuntime,
} from "../lib/emailService.ts";
import {
  assertHandoffSigningConfigured,
  signHandoffToken as defaultSignHandoffToken,
} from "../lib/cryptoHandoff.ts";
import { YOUNIVERSE_ROOT_DOMAIN } from "../lib/youniverseRouting.ts";
import {
  assertSafeDatabaseTarget,
  DESIGNATED_CREATOR_EMAIL,
  enforceAntiCsrf,
  evaluateCreatorClaimAuthorization,
  extractSessionCandidatesFromRequest,
  isUndefinedTableError,
  recordCreatorAuditEvent,
} from "../lib/creatorOwnership.ts";

export const RESERVED_GATEWAY_HANDLES = new Set(["www", "welcome", "claim", "api"]);

export interface ClaimHandlerDeps {
  sql?: any;
  databaseUrl?: string;
  createVerificationToken?: typeof defaultCreateVerificationToken;
  sendVerificationEmail?: typeof defaultSendVerificationEmail;
  signHandoffToken?: typeof defaultSignHandoffToken;
  isProduction?: () => boolean;
  failClosedOnEmailFailure?: boolean;
  env?: Record<string, string | undefined>;
}

export default async function handler(req: any, res: any, deps: ClaimHandlerDeps = {}) {
  if (req.method !== "POST") {
    return res.status(405).json({ status: "method-not-allowed", error: "method-not-allowed" });
  }

  const hasOriginHeader = Boolean(req?.headers?.origin ?? req?.headers?.Origin);
  const rawAuthHeader = req?.headers?.authorization ?? req?.headers?.Authorization;
  const hasBearerAuth =
    typeof rawAuthHeader === "string" &&
    rawAuthHeader.startsWith("Bearer ") &&
    rawAuthHeader.slice(7).trim().length > 0;
  const sessionCandidates = extractSessionCandidatesFromRequest(req);

  if (hasOriginHeader || (Boolean(sessionCandidates.cookieToken) && !hasBearerAuth)) {
    const normalizedHeaders =
      !req?.headers?.origin && req?.headers?.Origin
        ? { ...req.headers, origin: req.headers.Origin }
        : req?.headers;
    const csrfReq = normalizedHeaders === req?.headers ? req : { ...req, headers: normalizedHeaders };
    const csrf = enforceAntiCsrf(csrfReq, deps?.env ?? process.env);
    if (csrf.blocked) {
      return res.status(403).json({
        success: false,
        status: "csrf_rejected",
        error: "csrf_rejected",
        message: csrf.reason,
      });
    }
  }

  const databaseUrl = deps.databaseUrl ?? process.env.DATABASE_URL;
  if (!databaseUrl && !deps.sql) {
    return res.status(500).json({ status: "configuration-error", error: "configuration-error", message: "Database not configured." });
  }
  if (!deps.sql) {
    assertSafeDatabaseTarget(databaseUrl, deps?.env ?? process.env);
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

  if (RESERVED_GATEWAY_HANDLES.has(cleanHandle)) {
    return res.status(409).json({ status: "username-taken", error: "username-taken", message: `@${cleanHandle} is already claimed.` });
  }

  if (!email || typeof email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ status: "invalid", error: "invalid", message: "A valid email is required." });
  }

  const sql = deps.sql ?? neon(databaseUrl!);
  const createVerificationTokenFn = deps.createVerificationToken ?? defaultCreateVerificationToken;
  const sendVerificationEmailFn = deps.sendVerificationEmail ?? defaultSendVerificationEmail;
  const signHandoffTokenFn = deps.signHandoffToken ?? defaultSignHandoffToken;
  const isProductionFn = deps.isProduction ?? isProductionRuntime;

  const normalizedEmail = email.toLowerCase().trim();
  const subdomain = `${cleanHandle}.itsyouonline.com`;
  const resolvedDisplayName = (displayName && typeof displayName === "string")
    ? displayName.trim().slice(0, 80)
    : cleanHandle;

  try {
    // ── Check server-authoritative Creator session authorization ──
    const creatorAuth = await evaluateCreatorClaimAuthorization(sql, req, normalizedEmail, {
      env: deps.env,
      databaseUrl,
    });

    if (
      !creatorAuth.authorized &&
      (creatorAuth.status === "invalid_session" ||
        creatorAuth.status === "forbidden" ||
        creatorAuth.status === "environment_blocked")
    ) {
      return res.status(creatorAuth.httpStatus).json({
        success: false,
        status: creatorAuth.error,
        error: creatorAuth.error,
        message: creatorAuth.message,
      });
    }

    const hasProvisionedCreatorAccount = async (): Promise<boolean> => {
      if (normalizedEmail !== DESIGNATED_CREATOR_EMAIL) return false;
      try {
        const rows = await sql`
          SELECT 1 FROM public.owner_accounts
          WHERE primary_email = ${DESIGNATED_CREATOR_EMAIL}
            AND is_creator = TRUE
          LIMIT 1
        `;
        return Array.isArray(rows) && rows.length > 0;
      } catch (err: any) {
        if (isUndefinedTableError(err)) return false;
        throw err;
      }
    };

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

      if (!creatorAuth.authorized) {
        // 3. Safe retry by the same email on an unverified handle:
        // Verify the user has no other free claimed handle
        const otherFreeClaims = await sql`
          SELECT 1 FROM youniverse_identities
          WHERE email = ${normalizedEmail}
            AND plan = 'free'
            AND username != ${cleanHandle}
          LIMIT 1
        `;

        if (otherFreeClaims.length > 0 || (await hasProvisionedCreatorAccount())) {
          return res.status(402).json({
            status: "payment_required",
            error: "payment_required",
            message: "A free Youniverse has already been claimed with this email. Upgrade to create additional Youniverses.",
          });
        }
      }

      identityId = existingIdentity.identity_id;

      if (creatorAuth.authorized) {
        if (!deps.signHandoffToken) {
          assertHandoffSigningConfigured();
        }
        const nowIso = new Date().toISOString();
        await sql`
          UPDATE youniverse_identities
          SET display_name = ${resolvedDisplayName},
              email_verified_at = ${nowIso}
          WHERE identity_id = ${identityId} AND email_verified_at IS NULL
        `;
      } else if (displayName && typeof displayName === "string") {
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
      if (!creatorAuth.authorized) {
        // ── New claim: Check 'One Free Youniverse' rule via Email ──
        const existingEmailClaims = await sql`
          SELECT 1 FROM youniverse_identities
          WHERE email = ${normalizedEmail} AND plan = 'free'
          LIMIT 1
        `;

        if (existingEmailClaims.length > 0 || (await hasProvisionedCreatorAccount())) {
          return res.status(402).json({
            status: "payment_required",
            error: "payment_required",
            message: "A free Youniverse has already been claimed with this email. Upgrade to create additional Youniverses.",
          });
        }
      } else if (!deps.signHandoffToken) {
        assertHandoffSigningConfigured();
      }

      // ── Create the identity ──────────────────────────────────
      identityId = nanoid();
      const nowIso = new Date().toISOString();

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
          ${creatorAuth.authorized ? nowIso : null},
          ${nowIso}
        )
      `;
    }

    // ── Authenticated verified Creator override path ─────────
    if (creatorAuth.authorized) {
      const verifiedAtIso = new Date().toISOString();

      await sql`
        INSERT INTO public.youniverse_owner_memberships (
          account_id,
          identity_id,
          role,
          status,
          claim_source,
          verified_at
        )
        VALUES (
          ${creatorAuth.accountId},
          ${identityId},
          'owner',
          'active',
          ${"creator_override"},
          ${verifiedAtIso}
        )
        ON CONFLICT (identity_id) DO UPDATE
        SET account_id = EXCLUDED.account_id,
            status = 'active',
            claim_source = EXCLUDED.claim_source,
            verified_at = COALESCE(public.youniverse_owner_memberships.verified_at, EXCLUDED.verified_at),
            updated_at = NOW()
      `;

      const userAgent =
        typeof req.headers?.["user-agent"] === "string"
          ? req.headers["user-agent"]
          : null;
      const ipAddress =
        typeof req.headers?.["x-forwarded-for"] === "string"
          ? req.headers["x-forwarded-for"].split(",")[0]?.trim() ?? null
          : null;

      await recordCreatorAuditEvent(sql, {
        accountId: creatorAuth.accountId,
        actorSessionId: creatorAuth.sessionId,
        actorIdentityId: creatorAuth.actorIdentityId,
        targetIdentityId: identityId,
        targetHandle: cleanHandle,
        targetSubdomain: subdomain,
        eventType: "creator_privileged_claim",
        runtimeEnv: creatorAuth.runtimeEnv,
        ipAddress,
        userAgent,
        metadata: {
          displayName: resolvedDisplayName,
        },
      });

      const nonce = randomBytes(24).toString("hex");
      const handoffExpiresAt = new Date(Date.now() + 90 * 1000);
      await sql`
        INSERT INTO handoff_tokens (
          handle,
          nonce,
          expires_at
        )
        VALUES (
          ${cleanHandle},
          ${nonce},
          ${handoffExpiresAt.toISOString()}
        )
      `;

      const handoffToken = signHandoffTokenFn({
        handle: cleanHandle,
        nonce,
      });

      const isProd = isProductionFn();
      const host = String(req.headers?.host || "").toLowerCase();
      const isLocalHost =
        !isProd && (host.includes("localhost") || host.includes("127.0.0.1"));
      const destinationUrl = isLocalHost
        ? `/?@=${encodeURIComponent(cleanHandle)}#handoff_token=${encodeURIComponent(handoffToken)}`
        : `https://${cleanHandle}.${YOUNIVERSE_ROOT_DOMAIN}/#handoff_token=${encodeURIComponent(handoffToken)}`;

      if (typeof res.setHeader === "function") {
        res.setHeader("Cache-Control", "no-store");
      }

      return res.status(201).json({
        success: true,
        status: "verified_creator_claim",
        username: cleanHandle,
        subdomain,
        identityId,
        handoffToken,
        destinationUrl,
        emailSent: false,
        message: "Youniverse claimed and linked to your Creator account.",
      });
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
