/**
 * GET /api/v1/auth/verify
 *
 * Dedicated email verification endpoint.
 *
 * Security contract (Phase R6A & R10):
 *   - Consumes a dedicated email verification token from `email_verification_tokens`.
 *   - Only SHA-256(token) is stored and compared.
 *   - Verification is atomic and strictly single-use.
 *   - Ordinary bearer session tokens CANNOT be used to verify email.
 *   - Expired, already-consumed, invalid, or forged verification tokens are rejected.
 *   - Atomically updates `youniverse_identities.email_verified_at = NOW()`.
 *   - Issues an audience-bound, short-lived (90s) RS256 handoff ticket for destination workspace.
 *   - Upon successful verification, returns destinationUrl with #handoff_token fragment.
 *
 * Response negotiation (Phase R15):
 *   - API callers (fetch default `Accept: *\/*`, or `application/json`) receive the JSON contract.
 *   - Top-level browser navigations (`Accept: text/html`, e.g. the emailed link) receive a
 *     303 redirect to destinationUrl — but ONLY after the token was consumed, the handoff
 *     nonce was persisted, the ticket was signed, and the destination passed validation.
 *   - Every failure path keeps its existing JSON error response; no failure ever redirects.
 *   - The redirect target is never taken from the Host header or user input. In production it
 *     is always https://<handle>.<YOUNIVERSE_ROOT_DOMAIN>/; in local dev it may be a
 *     same-origin relative path.
 */

import { neon } from "@neondatabase/serverless";
import { randomBytes } from "crypto";
import { consumeVerificationToken as defaultConsumeVerificationToken } from "../../../lib/emailVerification.ts";
import { createSession as defaultCreateSession } from "../../../lib/neonSession.ts";
import {
  assertHandoffSigningConfigured,
  signHandoffToken as defaultSignHandoffToken,
  isProductionRuntime,
} from "../../../lib/cryptoHandoff.ts";
import { YOUNIVERSE_ROOT_DOMAIN } from "../../../lib/youniverseRouting.ts";

function firstHeaderValue(value: unknown): string {
  if (Array.isArray(value)) return typeof value[0] === "string" ? value[0] : "";
  return typeof value === "string" ? value : "";
}

/** True for a top-level browser navigation expecting an HTML document (e.g. clicking the email link). */
export function wantsHtmlNavigation(req: any): boolean {
  const accept = firstHeaderValue(req?.headers?.accept).toLowerCase();
  if (accept.includes("text/html")) return true;
  return (
    firstHeaderValue(req?.headers?.["sec-fetch-mode"]).toLowerCase() === "navigate" &&
    firstHeaderValue(req?.headers?.["sec-fetch-dest"]).toLowerCase() === "document"
  );
}

/**
 * Validates a server-constructed destination before it is used as a redirect target.
 *  - Absolute: must be https://<handle>.<YOUNIVERSE_ROOT_DOMAIN> with no port or credentials.
 *  - Relative: same-origin path only, and only outside production runtimes.
 */
export function isTrustedRedirectDestination(destinationUrl: string, handle: string): boolean {
  if (typeof handle !== "string" || !/^[a-z0-9_-]+$/.test(handle)) return false;

  if (destinationUrl.startsWith("/")) {
    return (
      !isProductionRuntime() &&
      !destinationUrl.startsWith("//") &&
      !destinationUrl.startsWith("/\\")
    );
  }

  try {
    const url = new URL(destinationUrl);
    return (
      url.protocol === "https:" &&
      url.hostname === `${handle}.${YOUNIVERSE_ROOT_DOMAIN}` &&
      url.port === "" &&
      url.username === "" &&
      url.password === ""
    );
  } catch {
    return false;
  }
}

const HANDOFF_UNAVAILABLE_BODY = {
  success: false,
  error: "handoff_unavailable",
  message: "Your email is verified, but secure sign-in could not be completed. Please sign in to continue.",
} as const;

export interface VerifyHandlerDeps {
  sql?: any;
  databaseUrl?: string;
  consumeVerificationToken?: typeof defaultConsumeVerificationToken;
  createSession?: typeof defaultCreateSession;
  signHandoffToken?: typeof defaultSignHandoffToken;
}

export default async function handler(req: any, res: any, deps: VerifyHandlerDeps = {}) {
  if (req.method !== "GET") {
    return res.status(405).json({ success: false, error: "method_not_allowed" });
  }

  const token = req.query?.token;

  if (!token || typeof token !== "string" || token.trim().length === 0) {
    return res.status(400).json({ success: false, error: "token_required", message: "Token is required." });
  }

  const databaseUrl = deps.databaseUrl ?? process.env.DATABASE_URL;
  if (!databaseUrl && !deps.sql) {
    return res.status(500).json({ success: false, error: "server_misconfiguration", message: "Database not configured." });
  }

  const sql = deps.sql ?? neon(databaseUrl!);
  const consumeVerificationTokenFn = deps.consumeVerificationToken ?? defaultConsumeVerificationToken;
  const createSessionFn = deps.createSession ?? defaultCreateSession;
  const signHandoffTokenFn = deps.signHandoffToken ?? defaultSignHandoffToken;

  // ── 0. Validate handoff signing configuration BEFORE consuming token ────
  if (!deps.signHandoffToken) {
    assertHandoffSigningConfigured();
  }

  // ── 1. Consume the verification token ───────────────────────────────────
  const consumeResult = await consumeVerificationTokenFn(sql, token.trim());

  if (!consumeResult.ok) {
    if (consumeResult.reason === "already_consumed") {
      return res.status(401).json({
        success: false,
        error: "token_already_consumed",
        message: "Verification link has already been used.",
      });
    }

    if (consumeResult.reason === "expired") {
      return res.status(401).json({
        success: false,
        error: "token_expired",
        message: "Verification link has expired. Please claim again or request a new link.",
      });
    }

    // not_found or identity_not_found (also catches ordinary session tokens)
    return res.status(401).json({
      success: false,
      error: "invalid_token",
      message: "Invalid verification link.",
    });
  }

  // ── 2. Create authenticated owner session (gateway / direct contract) ──
  const { rawToken } = await createSessionFn(sql, consumeResult.identityId, {
    ttlSeconds: 60 * 60 * 24 * 7, // 7 days
    userAgent: req.headers?.["user-agent"] ?? null,
    ipAddress: (req.headers?.["x-forwarded-for"] as string | undefined)
      ?.split(",")[0]?.trim() ?? null,
  });

  // ── 3. Issue single-use RS256 handoff ticket for destination workspace ──
  const nonce = randomBytes(24).toString("hex");
  const handoffExpiresAt = new Date(Date.now() + 90 * 1000); // 90 seconds
  let handoffNoncePersisted = false;

  try {
    await sql`
      INSERT INTO handoff_tokens (
        handle,
        nonce,
        expires_at
      )
      VALUES (
        ${consumeResult.username},
        ${nonce},
        ${handoffExpiresAt.toISOString()}
      )
    `;
    handoffNoncePersisted = true;
  } catch (handoffDbErr) {
    console.warn("[/api/v1/auth/verify] Nonce insert notice (non-fatal if mock):", handoffDbErr);
  }

  const handoffToken = signHandoffTokenFn({
    handle: consumeResult.username,
    nonce,
  });

  const isProd = isProductionRuntime();
  const host = (req.headers?.host || "").toLowerCase();
  const isLocalHost = !isProd && (host.includes("localhost") || host.includes("127.0.0.1") || host.includes("vercel.app"));

  const destinationUrl = isLocalHost
    ? `/?@=${encodeURIComponent(consumeResult.username)}#handoff_token=${encodeURIComponent(handoffToken)}`
    : `https://${consumeResult.username}.${YOUNIVERSE_ROOT_DOMAIN}/#handoff_token=${encodeURIComponent(handoffToken)}`;

  // ── 4. Browser navigation: redirect only on full success ───────────────
  if (wantsHtmlNavigation(req)) {
    if (!handoffNoncePersisted) {
      // An unpersisted nonce makes the ticket unredeemable; never send a success redirect.
      return res.status(500).json(HANDOFF_UNAVAILABLE_BODY);
    }

    if (!isTrustedRedirectDestination(destinationUrl, consumeResult.username)) {
      // Never log destinationUrl: it carries the signed handoff ticket.
      console.error("[/api/v1/auth/verify] Refusing redirect: destination failed validation.");
      return res.status(500).json(HANDOFF_UNAVAILABLE_BODY);
    }

    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("Vary", "Accept");
    res.setHeader("Location", destinationUrl);
    return res.status(303).end();
  }

  // ── 5. API caller: existing JSON contract ───────────────────────────────
  return res.status(200).json({
    success: true,
    handle: consumeResult.username,
    subdomain: `${consumeResult.username}.${YOUNIVERSE_ROOT_DOMAIN}`,
    role: "AUTHENTICATED_OWNER",
    sessionToken: rawToken,
    handoffToken,
    destinationUrl,
  });
}
