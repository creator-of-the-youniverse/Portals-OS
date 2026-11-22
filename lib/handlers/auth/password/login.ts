/**
 * POST /api/auth/password/login
 *
 * Authenticates a human continuity principal using an enrolled email and password.
 *
 * Security Invariants:
 *  - OWASP asynchronous scrypt password derivation.
 *  - Constant-time verification using crypto.timingSafeEqual.
 *  - Anti-enumeration timing mitigation: executes dummy scrypt hash when user not found.
 *  - Rate-limited sliding window per client IP + email.
 *  - Issues an HttpOnly, SameSite=Lax, Secure session cookie (Domain=.itsyouonline.com).
 *  - Raw bearer tokens are NEVER exposed in the JSON response payload.
 */

import { neon } from "@neondatabase/serverless";
import {
  verifyPassword,
  executeDummyScryptVerification,
  checkLoginRateLimit,
  clearLoginRateLimit,
} from "../../../passwordAuth.ts";
import { getHumanAuthSubjectByEmail, normalizeEmail } from "../../../humanContinuity.ts";
import { createSession } from "../../../neonSession.ts";
import { assertSafeDatabaseTarget, buildSessionCookieHeader, enforceAntiCsrf, isUndefinedTableError } from "../../../creatorOwnership.ts";

export interface LoginHandlerDeps {
  sql?: any;
  databaseUrl?: string;
  createSession?: typeof createSession;
  env?: Record<string, string | undefined>;
}

export default async function handler(req: any, res: any, deps: LoginHandlerDeps = {}) {
  if (req.method !== "POST") {
    return res.status(405).json({ success: false, error: "method_not_allowed" });
  }

  const csrfCheck = enforceAntiCsrf(req, deps.env ?? process.env, {
    allowSameOriginTenantSubdomain: true,
  });
  if (csrfCheck.blocked) {
    return res.status(403).json({ success: false, error: "csrf_rejected", message: csrfCheck.reason });
  }

  const email = typeof req.body?.email === "string" ? normalizeEmail(req.body.email) : "";
  const password = typeof req.body?.password === "string" ? req.body.password : "";

  if (!email || !password) {
    return res.status(400).json({
      success: false,
      error: "invalid_request",
      message: "Email and password are required.",
    });
  }

  // Rate limiting per IP and email
  const clientIp = (req.headers?.["x-forwarded-for"] as string | undefined)?.split(",")[0]?.trim() || "127.0.0.1";
  const rateLimitKey = `${clientIp}:${email}`;
  const rateCheck = checkLoginRateLimit(rateLimitKey);
  if (!rateCheck.allowed) {
    return res.status(429).json({
      success: false,
      error: "rate_limited",
      message: `Too many login attempts. Please try again in ${rateCheck.retryAfterSeconds} seconds.`,
    });
  }

  const databaseUrl = deps.databaseUrl ?? process.env.DATABASE_URL;
  if (!databaseUrl && !deps.sql) {
    return res.status(500).json({ success: false, error: "server_misconfiguration", message: "Database not configured." });
  }
  if (!deps.sql) {
    assertSafeDatabaseTarget(databaseUrl, deps.env ?? process.env);
  }

  const sql = deps.sql ?? neon(databaseUrl!);
  const createSessionFn = deps.createSession ?? createSession;

  // 1. Resolve human principal and credentials
  const record = await getHumanAuthSubjectByEmail(sql, email);

  if (!record) {
    // Mitigate timing analysis for non-existent users
    await executeDummyScryptVerification();
    return res.status(401).json({
      success: false,
      error: "invalid_credentials",
      message: "Invalid email or password.",
    });
  }

  // 2. Verify password hash
  const isValid = await verifyPassword(password, record.password.passwordHash);
  if (!isValid) {
    return res.status(401).json({
      success: false,
      error: "invalid_credentials",
      message: "Invalid email or password.",
    });
  }

  // Clear rate limiting upon successful login
  clearLoginRateLimit(rateLimitKey);

  // 3. Resolve target Youniverse context for the session
  // Primary target is the human's Homeverse; fallback to legacy identity only if 012 table missing.
  let targetIdentityId = "";
  let assocTableMissing = false;
  try {
    const assocRows = await sql`
      SELECT identity_id FROM human_youniverse_associations
      WHERE human_id = ${record.human.humanId}
        AND verification_status = 'verified'
        AND revoked_at IS NULL
      ORDER BY is_homeverse DESC, created_at ASC
      LIMIT 1
    `;
    if (Array.isArray(assocRows) && assocRows.length > 0) {
      targetIdentityId = String(assocRows[0].identity_id);
    }
  } catch (err: any) {
    if (isUndefinedTableError(err)) {
      assocTableMissing = true;
    }
  }

  if (!targetIdentityId && assocTableMissing) {
    const idRows = await sql`
      SELECT identity_id FROM youniverse_identities
      WHERE email = ${email}
      LIMIT 1
    `;
    if (Array.isArray(idRows) && idRows.length > 0) {
      targetIdentityId = String(idRows[0].identity_id);
    }
  }

  if (!targetIdentityId) {
    return res.status(403).json({
      success: false,
      error: "no_associated_youniverse",
      message: "No verified Youniverse is associated with this account.",
    });
  }

  // 4. Create server-managed session
  const { rawToken } = await createSessionFn(sql, targetIdentityId, {
    humanId: record.human.humanId,
    authSubjectId: record.authSubject.id,
    ttlSeconds: 60 * 60 * 24 * 7, // 7 days
    userAgent: req.headers?.["user-agent"] ?? null,
    ipAddress: clientIp,
  });

  // 5. Issue Set-Cookie header (HttpOnly, SameSite=Lax, Secure)
  if (typeof res.setHeader === "function") {
    res.setHeader("Set-Cookie", buildSessionCookieHeader(rawToken, req, 60 * 60 * 24 * 7));
  }

  return res.status(200).json({
    success: true,
    message: "Authenticated successfully.",
    humanId: record.human.humanId,
  });
}
