/**
 * POST /api/auth/enroll
 *
 * First-time enrollment: establishes the Human Continuity Principal and links
 * a Youniverse association for a human who has already completed email
 * verification (email_verified_at IS NOT NULL in youniverse_identities).
 *
 * This is the bridge between the existing email-verification flow and the
 * human continuity identity model. It MUST be called after /api/v1/auth/verify
 * succeeds and before the owner attempts to use password authentication.
 *
 * Option A Invariants:
 *  - Human principal is established once at first verified enrollment.
 *  - Identity is NOT inferred from email equality — only from an active,
 *    server-managed session whose identity_id matches the target Youniverse.
 *  - Existing human principals are NEVER merged or overwritten automatically.
 *  - If a human principal with a password auth subject already exists for this
 *    email, the endpoint returns that principal's ID without creating a new one.
 *
 * Request body: { email: string; password: string; handle: string }
 * Required: an active session cookie (__youniverse_session) OR
 *           Authorization: Bearer <token> that belongs to the target handle.
 *
 * Returns: { success: true; humanId: string; enrollmentStatus: "created" | "existing" }
 */

import { neon } from "@neondatabase/serverless";
import { hashPassword, validatePasswordStrength } from "../../passwordAuth.ts";
import { validateSession, createSession } from "../../neonSession.ts";
import {
  assertSafeDatabaseTarget,
  validateRequestSessionWithCookieFallback,
  buildSessionCookieHeader,
  enforceAntiCsrf,
} from "../../creatorOwnership.ts";
import {
  createHumanPrincipalWithPassword,
  getHumanAuthSubjectByEmail,
  linkYouniverseToHuman,
  normalizeEmail,
} from "../../humanContinuity.ts";

export interface EnrollHandlerDeps {
  sql?: any;
  databaseUrl?: string;
  validateSession?: typeof validateSession;
  createSession?: typeof createSession;
  env?: Record<string, string | undefined>;
}

export default async function handler(req: any, res: any, deps: EnrollHandlerDeps = {}) {
  if (req.method !== "POST") {
    return res.status(405).json({ success: false, error: "method_not_allowed" });
  }

  const rawHandle = typeof req.body?.handle === "string" ? req.body.handle : "";
  const handle = rawHandle.toLowerCase().replace(/^@/, "").trim();

  const csrfCheck = enforceAntiCsrf(req, deps.env ?? process.env, {
    allowSameOriginTenantSubdomain: true,
    ...(handle ? { expectedTenantHandle: handle } : {}),
  });
  if (csrfCheck.blocked) {
    return res.status(403).json({ success: false, error: "csrf_rejected", message: csrfCheck.reason });
  }

  const rawEmail = typeof req.body?.email === "string" ? req.body.email : "";
  const password = typeof req.body?.password === "string" ? req.body.password : "";

  const email = normalizeEmail(rawEmail);

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({
      success: false,
      error: "invalid_request",
      message: "A valid email address is required.",
    });
  }

  if (!rawHandle) {
    return res.status(400).json({
      success: false,
      error: "invalid_request",
      message: "A Youniverse handle is required.",
    });
  }

  const strength = validatePasswordStrength(password);
  if (!strength.valid) {
    return res.status(400).json({
      success: false,
      error: "weak_password",
      message: strength.reason,
    });
  }

  const databaseUrl = deps.databaseUrl ?? process.env.DATABASE_URL;
  if (!databaseUrl && !deps.sql) {
    return res.status(500).json({ success: false, error: "server_misconfiguration" });
  }
  if (!deps.sql) {
    assertSafeDatabaseTarget(databaseUrl, deps.env ?? process.env);
  }

  const sql = deps.sql ?? neon(databaseUrl!);
  const validateSessionFn = deps.validateSession ?? validateSession;
  const createSessionFn = deps.createSession ?? createSession;

  // ── 1. Verify caller holds an active session for this Youniverse ───────────
  // The session must have been established by the email-verification step.
  // This guards against unauthenticated callers fabricating enrollment requests.
  const sessionValidation = await validateRequestSessionWithCookieFallback(
    sql,
    req,
    validateSessionFn
  );

  if (!sessionValidation.ok) {
    return res.status(401).json({
      success: false,
      error: "unauthorized",
      message: "An active verified session is required to complete enrollment.",
    });
  }

  // ── 2. Verify the Youniverse handle and that email matches ─────────────────
  const youniverseRows = await sql`
    SELECT identity_id, username, email, email_verified_at, plan, is_live
    FROM youniverse_identities
    WHERE username = ${handle}
    LIMIT 1
  `;

  if (!Array.isArray(youniverseRows) || youniverseRows.length === 0) {
    return res.status(404).json({
      success: false,
      error: "youniverse_not_found",
      message: `No Youniverse found for @${handle}.`,
    });
  }

  const youniverse = youniverseRows[0];

  if (youniverse.email_verified_at === null) {
    return res.status(403).json({
      success: false,
      error: "email_not_verified",
      message: "Email must be verified before establishing a password.",
    });
  }

  // Email must match the verified youniverse to prevent cross-account credential theft.
  const normalizedYouniverseEmail = (youniverse.email || "").toLowerCase().trim();
  if (normalizedYouniverseEmail !== email) {
    return res.status(403).json({
      success: false,
      error: "email_mismatch",
      message: "The provided email does not match the verified Youniverse email.",
    });
  }

  // Check if human principal already exists for this email before authorizing cross-handle claim
  const existingRecord = await getHumanAuthSubjectByEmail(sql, email);

  // Session identity must correspond to this Youniverse, OR belong to the exact same
  // already-enrolled Human Continuity Principal attempting idempotent linking.
  const identityId = String(youniverse.identity_id);
  if (sessionValidation.identityId !== identityId) {
    const isSameHuman = Boolean(
      sessionValidation.humanId &&
      existingRecord &&
      existingRecord.human.humanId === sessionValidation.humanId
    );
    if (!isSameHuman) {
      return res.status(403).json({
        success: false,
        error: "session_identity_mismatch",
        message: "The active session does not correspond to the requested Youniverse.",
      });
    }
  }

  // ── 3. Idempotent: check if human principal already exists for this email ─
  if (existingRecord) {
    // Human principal and password credential already established.
    // Return existing humanId without creating duplicates.
    // Ensure the Youniverse association exists (idempotent upsert in linkYouniverseToHuman).
    let assocError: string | null = null;
    try {
      await linkYouniverseToHuman(sql, {
        humanId: existingRecord.human.humanId,
        identityId,
        role: "owner",
        isHomeverse: true,
        verificationStatus: "verified",
      });
    } catch (err: any) {
      // Multi-Youniverse owner: already has another Homeverse, link this handle cleanly as secondary owner.
      if (err.message?.includes("Cannot set multiple Homeverses")) {
        try {
          await linkYouniverseToHuman(sql, {
            humanId: existingRecord.human.humanId,
            identityId,
            role: "owner",
            isHomeverse: false,
            verificationStatus: "verified",
          });
        } catch (retryErr: any) {
          assocError = String(retryErr?.message ?? retryErr);
        }
      } else {
        assocError = String(err.message);
      }
    }

    if (assocError) {
      return res.status(500).json({ success: false, error: "association_error", message: assocError });
    }

    return res.status(200).json({
      success: true,
      humanId: existingRecord.human.humanId,
      enrollmentStatus: "existing",
      message: "Enrollment already established. Human principal recognized.",
    });
  }

  // ── 4. Create new human principal with password credential ─────────────────
  const { passwordHash, salt, algorithm } = await hashPassword(password);
  const { humanId, authSubjectId } = await createHumanPrincipalWithPassword(sql, {
    email,
    passwordHash,
    salt,
    algorithm,
  });

  // ── 5. Create explicit Youniverse association (Homeverse) ──────────────────
  await linkYouniverseToHuman(sql, {
    humanId,
    identityId,
    role: "owner",
    isHomeverse: true,
    verificationStatus: "verified",
  });

  // ── 6. Upgrade the current session to carry humanId ───────────────────────
  // Create a new human-continuity session and issue a fresh cookie.
  // The old identity-only session remains valid for backward compatibility
  // until it expires; the new session supersedes it going forward.
  const clientIp =
    (req.headers?.["x-forwarded-for"] as string | undefined)?.split(",")[0]?.trim() ||
    null;
  const { rawToken } = await createSessionFn(sql, identityId, {
    humanId,
    authSubjectId,
    ttlSeconds: 60 * 60 * 24 * 7, // 7 days
    userAgent: req.headers?.["user-agent"] ?? null,
    ipAddress: clientIp,
  });

  if (typeof res.setHeader === "function") {
    res.setHeader(
      "Set-Cookie",
      buildSessionCookieHeader(rawToken, req, 60 * 60 * 24 * 7)
    );
  }

  return res.status(201).json({
    success: true,
    humanId,
    enrollmentStatus: "created",
    message: "Human Continuity Principal established. Password and Youniverse association created.",
  });
}
