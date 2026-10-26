/**
 * POST /api/verify-token
 *
 * Dedicated endpoint for verifying single-use RS256 handoff tokens at the destination
 * personal subdomain, atomically consuming the handoff nonce, and minting an authenticated
 * Neon owner session.
 *
 * Security Contract (Phase R10):
 *  1. Accepts { token } in POST body.
 *  2. Derives trusted audience from canonical request routing (never from the unverified token).
 *  3. Cryptographically validates RS256 signature, issuer, audience, and 90s expiry.
 *  4. Atomically consumes single-use nonce from `handoff_tokens` in the database.
 *     Fails closed on replay, missing nonce, or expiry.
 *  5. Verifies identity in `youniverse_identities` (is_live = true, email_verified_at IS NOT NULL).
 *  6. Establishes destination Neon owner session using `createSession()`.
 *  7. Delivers the authenticated session token (Bearer contract; no cross-domain cookies required).
 */

import { neon } from "@neondatabase/serverless";
import {
  verifyHandoffToken,
  handoffAudienceFor,
  isProductionRuntime,
  HandoffConfigError,
} from "../lib/cryptoHandoff.ts";
import { resolveYouniverseRoute, YOUNIVERSE_ROOT_DOMAIN } from "../lib/youniverseRouting.ts";
import { resolveYouniverseConfiguration, type FoundationLaw } from "../lib/foundationSynthesis.ts";
import { createSession } from "../lib/neonSession.ts";

function firstHeaderValue(value: unknown): string {
  if (Array.isArray(value)) return typeof value[0] === "string" ? value[0] : "";
  return typeof value === "string" ? value : "";
}

/**
 * Derive the trusted handoff audience from the request's routing.
 *  - Production: only a real `<handle>.itsyouonline.com` Host is accepted.
 *  - Non-production: dev hosts (localhost / *.vercel.app) may use `?@=handle` or `?u=handle`.
 * Returns null when no trusted identity destination can be established.
 */
export function resolveTrustedHandoffAudience(req: any): string | null {
  const host = firstHeaderValue(req?.headers?.host)
    .trim()
    .toLowerCase()
    .replace(/:\d+$/, "");
  if (!host) return null;

  let search: string | undefined;
  if (!host.endsWith(`.${YOUNIVERSE_ROOT_DOMAIN}`)) {
    if (isProductionRuntime()) return null;
    try {
      search = new URL(String(req?.url ?? "/"), "http://local.invalid").search;
    } catch {
      return null;
    }
  }

  const route = resolveYouniverseRoute(host, search);
  if (!route || route.kind !== "identity" || !route.username) return null;
  return handoffAudienceFor(route.username);
}

export interface VerifyTokenDeps {
  sql?: any;
  databaseUrl?: string;
  createSession?: typeof createSession;
  verifyHandoffToken?: typeof verifyHandoffToken;
  resolveTrustedHandoffAudience?: typeof resolveTrustedHandoffAudience;
}

export default async function handler(req: any, res: any, deps: VerifyTokenDeps = {}) {
  if (req.method !== "POST") {
    return res.status(405).json({ success: false, error: "method_not_allowed" });
  }

  const databaseUrl = deps.databaseUrl ?? process.env.DATABASE_URL;
  if (!databaseUrl && !deps.sql) {
    return res.status(500).json({ success: false, error: "database_not_configured", message: "Database not configured." });
  }

  const sql = deps.sql ?? neon(databaseUrl!);
  const createSessionFn = deps.createSession ?? createSession;
  const verifyHandoffTokenFn = deps.verifyHandoffToken ?? verifyHandoffToken;
  const resolveAudienceFn = deps.resolveTrustedHandoffAudience ?? resolveTrustedHandoffAudience;

  const { token } = req.body ?? {};

  if (!token || typeof token !== "string" || token.trim().length === 0) {
    return res.status(400).json({ success: false, error: "token_required", message: "Token is required." });
  }

  // 1. Resolve trusted destination audience from request routing
  const expectedAudience = resolveAudienceFn(req);
  if (!expectedAudience) {
    return res.status(401).json({ success: false, error: "untrusted_destination", message: "Untrusted handoff destination." });
  }

  // 2. Cryptographically verify RS256 signature, issuer, audience, and expiry
  let payload: { handle: string; nonce: string };
  try {
    payload = verifyHandoffTokenFn(token.trim(), expectedAudience);
  } catch (err: any) {
    if (err instanceof HandoffConfigError) {
      console.error("[/api/verify-token] Handoff key configuration error:", err.message);
      return res.status(500).json({ success: false, error: "handoff_misconfigured", message: "Handoff key configuration error." });
    }
    console.warn("[/api/verify-token] Token rejected:", err?.name);
    return res.status(401).json({ success: false, error: "invalid_handoff_token", message: "Invalid or expired handoff token." });
  }

  try {
    // 3. Atomically consume the single-use nonce
    const consumed = await sql`
      UPDATE handoff_tokens
      SET consumed = TRUE
      WHERE nonce = ${payload.nonce}
        AND handle = ${payload.handle}
        AND consumed = FALSE
        AND expires_at > NOW()
      RETURNING token_id;
    `;

    if (!consumed || consumed.length === 0) {
      return res.status(401).json({
        success: false,
        error: "token_already_consumed_or_expired",
        message: "Handoff token has already been consumed or has expired.",
      });
    }

    // 4. Verify identity exists, is live, and email is verified
    const identityRows = await sql`
      SELECT identity_id, username, plan, is_live, email_verified_at
      FROM youniverse_identities
      WHERE username = ${payload.handle}
      LIMIT 1;
    `;

    if (!identityRows || identityRows.length === 0) {
      return res.status(404).json({
        success: false,
        error: "youniverse_not_found",
        message: `No Youniverse found for handle @${payload.handle}.`,
      });
    }

    const identity = identityRows[0];

    if (!identity.is_live) {
      return res.status(403).json({
        success: false,
        error: "youniverse_suspended",
        message: "This Youniverse is not currently live.",
      });
    }

    if (identity.email_verified_at === null) {
      return res.status(403).json({
        success: false,
        error: "email_not_verified",
        message: "Email verification required before establishing owner session.",
      });
    }

    // 5. Establish authenticated Neon owner session for this destination origin
    const userAgent = firstHeaderValue(req.headers?.["user-agent"]) || null;
    const ipAddress = (req.headers?.["x-forwarded-for"] as string | undefined)
      ?.split(",")[0]?.trim() ?? null;

    const { rawToken, expiresAt } = await createSessionFn(sql, identity.identity_id, {
      ttlSeconds: 60 * 60 * 24 * 7, // 7 days
      userAgent,
      ipAddress,
    });

    // 6. Synthesize runtime workspace config
    const rawLaws: string[] = Array.isArray((identity as any).foundation?.laws)
      ? (identity as any).foundation.laws
      : [];
    const formattedLaws = rawLaws.length > 0
      ? rawLaws.map(
          (l) => (l.charAt(0).toUpperCase() + l.slice(1).toLowerCase()) as FoundationLaw
        )
      : (["Minimal"] as FoundationLaw[]);

    const workspaceConfig = resolveYouniverseConfiguration({
      handle: payload.handle,
      energyHue: (identity as any).energy_hue ?? 258,
      laws: formattedLaws,
    });

    res.setHeader("Cache-Control", "no-store");
    return res.status(200).json({
      success: true,
      handle: payload.handle,
      sessionToken: rawToken,
      expiresAt: expiresAt.toISOString(),
      workspaceConfig,
    });
  } catch (err: any) {
    console.error("[/api/verify-token] Execution error:", err);
    return res.status(500).json({
      success: false,
      error: "server_error",
      message: "An internal error occurred during handoff verification.",
    });
  }
}
