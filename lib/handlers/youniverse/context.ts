/**
 * GET /api/youniverse/[handle]/context
 *
 * Vercel Serverless Function — server-authoritative owner gate.
 *
 * Called by App.tsx verifyOwnership() with an Authorization: Bearer <token> header.
 * Returns { success, isOwner, handle, tier } — the client MUST treat isOwner:false
 * as a public view, never granting OS access based on client-side logic alone.
 *
 * Authorization chain:
 *   1. Extract raw bearer token from Authorization header.
 *   2. Hash the token; look up sessions.token_hash → get identity_id.
 *   3. Look up youniverse_identities WHERE username = :handle.
 *   4. Compare identity_id from session to identity_id from youniverse row.
 *   5. isOwner = (session.identity_id === youniverse.identity_id).
 *
 * Failure modes:
 *   - Missing/malformed Authorization header → 401
 *   - Token not found / expired / revoked → 401
 *   - Handle not found → 404
 *   - Handle found but session identity ≠ youniverse identity → 200 { isOwner: false }
 */

import { neon } from "@neondatabase/serverless";
import { randomBytes } from "crypto";
import { validateSession } from "../../neonSession.ts";
import { resolveIdentityEntitlements } from "../../entitlements.ts";
import {
  assertHandoffSigningConfigured,
  isProductionRuntime,
  signHandoffToken as defaultSignHandoffToken,
} from "../../cryptoHandoff.ts";
import { YOUNIVERSE_ROOT_DOMAIN } from "../../youniverseRouting.ts";
import {
  assertSafeDatabaseTarget,
  extractSessionCandidatesFromRequest,
  isCreatorRuntimeAllowed,
  listOwnedYouniversesForIdentity,
  recordCreatorAuditEvent,
  resolveOwnerAccessForIdentity,
  validateRequestSessionWithCookieFallback,
} from "../../creatorOwnership.ts";
import { resolveHumanYouniverseAccess } from "../../humanContinuity.ts";

const HANDOFF_UNAVAILABLE_BODY = {
  success: false,
  error: "handoff_unavailable",
  message: "Unable to issue secure handoff ticket right now. Please retry.",
} as const;

export default async function handler(req: any, res: any, deps: any = {}) {
  if (req.method !== "GET") {
    return res.status(405).json({ success: false, error: "method_not_allowed" });
  }

  // ── 1. Extract bearer/cookie session candidates ───────────────────────────
  const candidates = extractSessionCandidatesFromRequest(req);
  if (!candidates.bearerToken && !candidates.cookieToken) {
    return res.status(401).json({
      success: false,
      error: "unauthorized",
      message: "Missing or malformed Authorization header.",
    });
  }

  // ── 2. Resolve handle from URL ────────────────────────────────────────────
  // Vercel passes dynamic segments via req.query; Express passes via req.params.
  const rawHandle = req.params?.handle || req.query?.handle;
  if (!rawHandle || typeof rawHandle !== "string") {
    return res.status(400).json({ success: false, error: "handle_required" });
  }
  const handle = rawHandle.toLowerCase().replace(/^@/, "");

  const databaseUrl = deps.databaseUrl ?? process.env.DATABASE_URL;
  if (!databaseUrl && !deps.sql) {
    return res.status(500).json({ success: false, error: "server_misconfiguration" });
  }
  if (!deps.sql) {
    assertSafeDatabaseTarget(databaseUrl, deps.env ?? process.env);
  }

  const sql = deps.sql ?? (deps.neon ? deps.neon(databaseUrl) : neon(databaseUrl));
  const validateSessionFn = deps.validateSession ?? validateSession;

  // ── 3. Validate Bearer session, falling back to HttpOnly cookie ───────────
  const validation = await validateRequestSessionWithCookieFallback(
    sql,
    req,
    validateSessionFn
  );
  if (!validation.ok) {
    return res.status(401).json({
      success: false,
      error: "invalid_token",
      message: "Token is invalid, expired, or revoked.",
    });
  }

  // ── 4. Look up the Youniverse identity for :handle ────────────────────────
  const rows = await sql`
    SELECT identity_id, username, email, plan, is_live, email_verified_at
    FROM youniverse_identities
    WHERE username = ${handle}
    LIMIT 1
  `;

  if (rows.length === 0) {
    return res.status(404).json({
      success: false,
      error: "youniverse_not_found",
      message: `No Youniverse found for handle @${handle}.`,
    });
  }

  const youniverse = rows[0];

  if (!youniverse.is_live) {
    return res.status(403).json({
      success: false,
      error: "youniverse_suspended",
      message: "This Youniverse is not currently live.",
    });
  }

  // ── 5. Server-authoritative ownership check ───────────────────────────────
  // Evaluates independent human-continuity authorization when humanId is present;
  // falls back to legacy single-Youniverse session resolution for backward compatibility.
  let isOwner = false;
  let effectiveRole = "public";
  let legacyAccess: Awaited<ReturnType<typeof resolveOwnerAccessForIdentity>> | null = null;

  if (validation.humanId) {
    const humanAccess = await resolveHumanYouniverseAccess(sql, validation.humanId, handle);
    if (!humanAccess.allowed) {
      if (humanAccess.reason === "association_revoked") {
        return res.status(403).json({
          success: false,
          isOwner: false,
          error: "association_revoked",
          message: "Your association with this Youniverse has been revoked.",
          handle: String(youniverse.username),
          tier: String(youniverse.plan ?? "free"),
        });
      }
      if (humanAccess.reason === "association_suspended") {
        return res.status(403).json({
          success: false,
          isOwner: false,
          error: "association_suspended",
          message: "Your association with this Youniverse is suspended.",
          handle: String(youniverse.username),
          tier: String(youniverse.plan ?? "free"),
        });
      }
      if (humanAccess.reason === "reverification_required") {
        return res.status(403).json({
          success: false,
          isOwner: false,
          error: "reverification_required",
          message: "Reverification required following Homeverse replacement.",
          handle: String(youniverse.username),
          tier: String(youniverse.plan ?? "free"),
        });
      }
      // "not_associated", "association_provisional", etc. -> public visitor (isOwner: false)
      isOwner = false;
    } else {
      isOwner = humanAccess.isOwner;
      effectiveRole = humanAccess.role;
    }
  } else {
    const access = await resolveOwnerAccessForIdentity(
      sql,
      validation.identityId,
      youniverse,
      { env: deps.env, databaseUrl }
    );

    if (access.status === 403) {
      return res.status(403).json({
        success: false,
        isOwner: false,
        error: access.error,
        message: access.message,
        handle: String(youniverse.username),
        tier: String(youniverse.plan ?? "free"),
      });
    }

    legacyAccess = access;
    isOwner = access.isOwner;
    effectiveRole = isOwner ? "owner" : "public";
  }

  const isVerified = youniverse.email_verified_at !== null;

  const entitlements = isOwner
    ? await resolveIdentityEntitlements(
        sql,
        String(youniverse.identity_id),
        String(youniverse.plan ?? "free")
      )
    : undefined;

  let ownedYouniverses = isOwner
    ? await listOwnedYouniversesForIdentity(sql, String(youniverse.identity_id))
    : [];

  let hasPassword = false;
  if (isOwner) {
    if (validation.humanId) {
      try {
        const humanOwnedRows = await sql`
          SELECT yi.identity_id, yi.username AS handle, yi.subdomain, yi.display_name, yi.plan
          FROM human_youniverse_associations hya
          JOIN youniverse_identities yi ON yi.identity_id = hya.identity_id
          WHERE hya.human_id = ${validation.humanId}
            AND hya.role = 'owner'
            AND hya.verification_status = 'verified'
            AND hya.revoked_at IS NULL
            AND yi.is_live = TRUE
          ORDER BY hya.is_homeverse DESC, hya.created_at ASC
        `;
        if (Array.isArray(humanOwnedRows) && humanOwnedRows.length > 0) {
          const seenHandles = new Set(ownedYouniverses.map((o) => o.handle));
          const merged = [...ownedYouniverses];
          for (const r of humanOwnedRows) {
            const h = String(r.handle || "").toLowerCase();
            if (!h || seenHandles.has(h)) continue;
            seenHandles.add(h);
            merged.push({
              identityId: String(r.identity_id),
              handle: h,
              subdomain: String(r.subdomain || `${h}.${YOUNIVERSE_ROOT_DOMAIN}`),
              displayName: String(r.display_name || h),
              plan: String(r.plan || "free"),
              claimSource: "human_continuity",
            });
          }
          ownedYouniverses = merged;
        }
      } catch {
        // Ignore if human_youniverse_associations is unavailable in legacy mocks
      }

      try {
        const pwRows = await sql`
          SELECT id FROM human_auth_subjects
          WHERE human_id = ${validation.humanId}
            AND provider_type = 'password'
            AND status = 'active'
          LIMIT 1
        `;
        hasPassword = Array.isArray(pwRows) && pwRows.length > 0;
      } catch {
        hasPassword = false;
      }
    } else {
      try {
        const pwViaAssocRows = await sql`
          SELECT s.id
          FROM human_youniverse_associations hya
          JOIN human_auth_subjects s ON s.human_id = hya.human_id
          WHERE hya.identity_id = ${String(youniverse.identity_id)}
            AND hya.role = 'owner'
            AND hya.verification_status = 'verified'
            AND hya.revoked_at IS NULL
            AND s.provider_type = 'password'
            AND s.status = 'active'
          LIMIT 1
        `;
        hasPassword = Array.isArray(pwViaAssocRows) && pwViaAssocRows.length > 0;
      } catch {
        hasPassword = false;
      }
    }
  }

  let handoffResponse: { handoffToken: string; destinationUrl: string } | undefined;
  const wantsHandoff = req.query?.handoff === "1" || req.query?.handoff === "true";

  if (isOwner && wantsHandoff) {
    const signHandoffTokenFn = deps.signHandoffToken ?? defaultSignHandoffToken;
    if (!deps.signHandoffToken) {
      assertHandoffSigningConfigured();
    }

    const nonce = randomBytes(24).toString("hex");
    const handoffExpiresAt = new Date(Date.now() + 90 * 1000);
    try {
      await sql`
        INSERT INTO handoff_tokens (
          handle,
          nonce,
          expires_at
        )
        VALUES (
          ${String(youniverse.username)},
          ${nonce},
          ${handoffExpiresAt.toISOString()}
        )
      `;
    } catch (handoffDbErr: any) {
      console.error("[YouCtx] Handoff nonce persistence failed.", {
        code: typeof handoffDbErr?.code === "string" ? handoffDbErr.code : null,
        constraint: typeof handoffDbErr?.constraint === "string" ? handoffDbErr.constraint : null,
      });
      if (typeof res.setHeader === "function") {
        res.setHeader("Cache-Control", "no-store");
      }
      return res.status(500).json(HANDOFF_UNAVAILABLE_BODY);
    }

    const handoffToken = signHandoffTokenFn({
      handle: String(youniverse.username),
      nonce,
    });

    const isProd = isProductionRuntime();
    const host = String(req.headers?.host || "").toLowerCase();
    const isLocalHost =
      !isProd && (host.includes("localhost") || host.includes("127.0.0.1"));
    const destinationUrl = isLocalHost
      ? `/?@=${encodeURIComponent(String(youniverse.username))}#handoff_token=${encodeURIComponent(handoffToken)}`
      : `https://${String(youniverse.username)}.${YOUNIVERSE_ROOT_DOMAIN}/#handoff_token=${encodeURIComponent(handoffToken)}`;

    // Creator audit event: only applicable in the legacy identity path (legacyAccess object present).
    // Human-continuity sessions (validation.humanId set) go through resolveHumanYouniverseAccess
    // and do not produce a legacy access object — do not reference it here.
    if (
      !validation.humanId &&
      legacyAccess &&
      "isCreator" in legacyAccess &&
      legacyAccess.isCreator &&
      "accountId" in legacyAccess &&
      legacyAccess.accountId
    ) {
      const runtimeCheck = isCreatorRuntimeAllowed(deps.env, databaseUrl);
      if (runtimeCheck.allowed) {
        const userAgent =
          typeof req.headers?.["user-agent"] === "string"
            ? req.headers["user-agent"]
            : null;
        const ipAddress =
          typeof req.headers?.["x-forwarded-for"] === "string"
            ? req.headers["x-forwarded-for"].split(",")[0]?.trim() ?? null
            : null;

        await recordCreatorAuditEvent(sql, {
          accountId: legacyAccess.accountId,
          actorSessionId: validation.sessionId,
          actorIdentityId: validation.identityId,
          targetIdentityId: String(youniverse.identity_id),
          targetHandle: String(youniverse.username),
          targetSubdomain: `${String(youniverse.username)}.${YOUNIVERSE_ROOT_DOMAIN}`,
          eventType: "creator_owner_handoff_issued",
          runtimeEnv: runtimeCheck.runtimeEnv,
          ipAddress,
          userAgent,
        });
      }
    }

    if (typeof res.setHeader === "function") {
      res.setHeader("Cache-Control", "no-store");
    }

    handoffResponse = { handoffToken, destinationUrl };
  }

  console.log(
    `[YouCtx] handle=@${handle} | sessionIdentityId=${validation.identityId} | dbIdentityId=${youniverse.identity_id} | isVerified=${isVerified} | isOwner=${isOwner}`
  );

  return res.status(200).json({
    success: true,
    isOwner,
    handle: String(youniverse.username),
    tier: entitlements ? entitlements.effectiveTier : String(youniverse.plan),
    ...(isOwner ? { hasPassword } : {}),
    ...(entitlements ? { entitlements } : {}),
    ...(isOwner && ownedYouniverses.length > 0 ? { ownedYouniverses } : {}),
    ...(handoffResponse ?? {}),
  });
}
