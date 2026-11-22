/**
 * POST /api/auth/password/set
 *
 * Sets or updates the password credential for a human continuity principal.
 *
 * Security Invariants:
 *  - Enforces password strength policy (>=10 chars, upper, lower, number).
 *  - Requires active authenticated session or valid initial enrollment authorization.
 *  - On password change, revokes all other active sessions for that human principal.
 *  - Uses asynchronous scrypt derivation.
 */

import { neon } from "@neondatabase/serverless";
import { hashPassword, validatePasswordStrength } from "../../../passwordAuth.ts";
import { createSession, validateSession } from "../../../neonSession.ts";
import {
  assertSafeDatabaseTarget,
  buildSessionCookieHeader,
  validateRequestSessionWithCookieFallback,
  enforceAntiCsrf,
} from "../../../creatorOwnership.ts";
import { linkYouniverseToHuman, normalizeEmail } from "../../../humanContinuity.ts";
import crypto from "node:crypto";

export interface PasswordSetHandlerDeps {
  sql?: any;
  databaseUrl?: string;
  validateSession?: typeof validateSession;
  createSession?: typeof createSession;
  env?: Record<string, string | undefined>;
}

export default async function handler(req: any, res: any, deps: PasswordSetHandlerDeps = {}) {
  if (req.method !== "POST") {
    return res.status(405).json({ success: false, error: "method_not_allowed" });
  }

  const csrfCheck = enforceAntiCsrf(req, deps.env ?? process.env, {
    allowSameOriginTenantSubdomain: true,
  });
  if (csrfCheck.blocked) {
    return res.status(403).json({ success: false, error: "csrf_rejected", message: csrfCheck.reason });
  }

  const password = typeof req.body?.password === "string" ? req.body.password : "";
  const email = typeof req.body?.email === "string" ? normalizeEmail(req.body.email) : "";

  // 1. Password strength validation
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
    return res.status(500).json({ success: false, error: "server_misconfiguration", message: "Database not configured." });
  }
  if (!deps.sql) {
    assertSafeDatabaseTarget(databaseUrl, deps.env ?? process.env);
  }

  const sql = deps.sql ?? neon(databaseUrl!);
  const validateSessionFn = deps.validateSession ?? validateSession;
  const createSessionFn = deps.createSession ?? createSession;

  // 2. Validate caller authentication (must always hold an active session)
  const sessionValidation = await validateRequestSessionWithCookieFallback(sql, req, validateSessionFn);
  if (!sessionValidation.ok) {
    return res.status(401).json({
      success: false,
      error: "unauthorized",
      message: "Authentication required to set a password.",
    });
  }

  let humanId = sessionValidation.humanId ?? null;
  const wasLegacySession = !humanId;

  if (!humanId) {
    // Legacy session without humanId: require explicit identity ownership match
    if (!email) {
      return res.status(401).json({
        success: false,
        error: "unauthorized",
        message: "Authentication required to set a password.",
      });
    }

    const rows = await sql`
      SELECT identity_id, email_verified_at FROM youniverse_identities
      WHERE email = ${email}
    `;

    const matchedRow = Array.isArray(rows)
      ? (rows.find((r: any) => String(r.identity_id) === String(sessionValidation.identityId)) ?? rows[0])
      : null;

    if (!matchedRow || matchedRow.email_verified_at === null) {
      return res.status(403).json({
        success: false,
        error: "unverified_email",
        message: "Email must be verified before establishing a password.",
      });
    }

    if (String(matchedRow.identity_id) !== String(sessionValidation.identityId)) {
      return res.status(403).json({
        success: false,
        error: "session_identity_mismatch",
        message: "The active session does not correspond to this email identity.",
      });
    }

    // Resolve or provision human principal for this verified identity
    const existingSubject = await sql`
      SELECT human_id FROM human_auth_subjects
      WHERE provider_type = 'password' AND subject_identifier = ${email}
      LIMIT 1
    `;

    if (Array.isArray(existingSubject) && existingSubject.length > 0) {
      humanId = String(existingSubject[0].human_id);
    } else {
      humanId = crypto.randomUUID();
      const nowIso = new Date().toISOString();
      await sql`
        INSERT INTO human_continuity_identities (human_id, status, created_at, updated_at)
        VALUES (${humanId}, 'active', ${nowIso}, ${nowIso})
        ON CONFLICT DO NOTHING
      `;
    }

    try {
      await linkYouniverseToHuman(sql, {
        humanId,
        identityId: sessionValidation.identityId,
        role: "owner",
        isHomeverse: true,
        verificationStatus: "verified",
      });
    } catch (err: any) {
      if (err?.message?.includes("Cannot set multiple Homeverses")) {
        try {
          await linkYouniverseToHuman(sql, {
            humanId,
            identityId: sessionValidation.identityId,
            role: "owner",
            isHomeverse: false,
            verificationStatus: "verified",
          });
        } catch {
          return res.status(500).json({
            success: false,
            error: "association_error",
            message: "Unable to link verified Youniverse to human principal.",
          });
        }
      } else {
        return res.status(500).json({
          success: false,
          error: "association_error",
          message: "Unable to link verified Youniverse to human principal.",
        });
      }
    }
  }

  // 3. Derive scrypt hash
  const { passwordHash, salt, algorithm } = await hashPassword(password);
  const nowIso = new Date().toISOString();

  // 4. Update or insert active password human_auth_subjects and human_passwords
  const subjectRows = await sql`
    SELECT id FROM human_auth_subjects
    WHERE human_id = ${humanId}
      AND provider_type = 'password'
      AND status = 'active'
    LIMIT 1
  `;

  let authSubjectId: string;
  if (Array.isArray(subjectRows) && subjectRows.length > 0) {
    authSubjectId = String(subjectRows[0].id);
    await sql`
      UPDATE human_passwords
      SET password_hash = ${passwordHash},
          salt = ${salt},
          algorithm = ${algorithm},
          updated_at = ${nowIso}
      WHERE auth_subject_id = ${authSubjectId}
    `;

    // Revoke other active sessions for security
    if (sessionValidation.ok && sessionValidation.sessionId) {
      await sql`
        UPDATE sessions
        SET revoked_at = NOW()
        WHERE human_id = ${humanId} AND id != ${sessionValidation.sessionId} AND revoked_at IS NULL
      `;
    }
  } else {
    let verifiedEmail = email;
    if (!wasLegacySession) {
      const idRows = await sql`
        SELECT email, email_verified_at FROM youniverse_identities
        WHERE identity_id = ${sessionValidation.identityId}
        LIMIT 1
      `;
      const idRow = Array.isArray(idRows) && idRows.length > 0 ? idRows[0] : null;
      if (!idRow || idRow.email_verified_at === null || !idRow.email) {
        return res.status(403).json({
          success: false,
          error: "email_not_verified",
          message: "Email must be verified before establishing a password.",
        });
      }
      verifiedEmail = normalizeEmail(String(idRow.email));
      if (email && email !== verifiedEmail) {
        return res.status(403).json({
          success: false,
          error: "email_mismatch",
          message: "The supplied email does not match the verified session identity.",
        });
      }
    }

    authSubjectId = crypto.randomUUID();
    await sql`
      INSERT INTO human_auth_subjects (id, human_id, provider_type, subject_identifier, status, verified_at, created_at, updated_at)
      VALUES (${authSubjectId}, ${humanId}, 'password', ${verifiedEmail}, 'active', ${nowIso}, ${nowIso}, ${nowIso})
    `;
    await sql`
      INSERT INTO human_passwords (auth_subject_id, password_hash, salt, algorithm, created_at, updated_at)
      VALUES (${authSubjectId}, ${passwordHash}, ${salt}, ${algorithm}, ${nowIso}, ${nowIso})
    `;
  }

  if (wasLegacySession && humanId) {
    const clientIp =
      (req.headers?.["x-forwarded-for"] as string | undefined)?.split(",")[0]?.trim() ||
      null;
    const { rawToken } = await createSessionFn(sql, sessionValidation.identityId, {
      humanId,
      authSubjectId,
      ttlSeconds: 60 * 60 * 24 * 7,
      userAgent: req.headers?.["user-agent"] ?? null,
      ipAddress: clientIp,
    });
    if (typeof res.setHeader === "function") {
      res.setHeader(
        "Set-Cookie",
        buildSessionCookieHeader(rawToken, req, 60 * 60 * 24 * 7)
      );
    }
  }

  return res.status(200).json({
    success: true,
    message: "Password set successfully.",
    humanId,
  });
}
