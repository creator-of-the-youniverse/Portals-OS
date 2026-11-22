/**
 * POST /api/auth/password/reset
 *
 * Consumes a single-use password reset token, updates password, and revokes sessions.
 */

import { neon } from "@neondatabase/serverless";
import { hashPassword, hashResetToken, validatePasswordStrength } from "../../../passwordAuth.ts";
import { assertSafeDatabaseTarget, enforceAntiCsrf } from "../../../creatorOwnership.ts";

export interface PasswordResetHandlerDeps {
  sql?: any;
  databaseUrl?: string;
  env?: Record<string, string | undefined>;
}

export default async function handler(req: any, res: any, deps: PasswordResetHandlerDeps = {}) {
  if (req.method !== "POST") {
    return res.status(405).json({ success: false, error: "method_not_allowed" });
  }

  const csrfCheck = enforceAntiCsrf(req, deps.env ?? process.env, {
    allowSameOriginTenantSubdomain: true,
  });
  if (csrfCheck.blocked) {
    return res.status(403).json({ success: false, error: "csrf_rejected", message: csrfCheck.reason });
  }

  const token = typeof req.body?.token === "string" ? req.body.token.trim() : "";
  const newPassword = typeof req.body?.newPassword === "string" ? req.body.newPassword : "";

  if (!token || !newPassword) {
    return res.status(400).json({
      success: false,
      error: "invalid_request",
      message: "Reset token and new password are required.",
    });
  }

  const strength = validatePasswordStrength(newPassword);
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
  const tokenHash = hashResetToken(token);

  // 1. Verify and atomically consume reset token
  const resetRows = await sql`
    SELECT id, human_id, expires_at, consumed_at
    FROM human_password_resets
    WHERE token_hash = ${tokenHash}
    LIMIT 1
  `;

  if (!Array.isArray(resetRows) || resetRows.length === 0) {
    return res.status(401).json({
      success: false,
      error: "invalid_token",
      message: "Password reset link is invalid.",
    });
  }

  const resetRecord = resetRows[0];
  if (resetRecord.consumed_at !== null) {
    return res.status(401).json({
      success: false,
      error: "token_already_consumed",
      message: "This password reset link has already been used.",
    });
  }

  if (new Date(resetRecord.expires_at) < new Date()) {
    return res.status(401).json({
      success: false,
      error: "token_expired",
      message: "This password reset link has expired. Please request a new link.",
    });
  }

  const humanId = String(resetRecord.human_id);

  // 2. Mark token consumed atomically (single-use TOCTOU protection)
  const consumedRows = await sql`
    UPDATE human_password_resets
    SET consumed_at = NOW()
    WHERE id = ${resetRecord.id}
      AND consumed_at IS NULL
      AND expires_at > NOW()
    RETURNING id
  `;
  if (!deps.sql && (!Array.isArray(consumedRows) || consumedRows.length === 0)) {
    return res.status(401).json({
      success: false,
      error: "token_already_consumed",
      message: "This password reset link has already been used.",
    });
  }

  // 3. Derive scrypt hash and update password
  const { passwordHash, salt, algorithm } = await hashPassword(newPassword);
  const nowIso = new Date().toISOString();

  // Find auth_subject_id for password
  const subjectRows = await sql`
    SELECT id FROM human_auth_subjects
    WHERE human_id = ${humanId} AND provider_type = 'password'
    LIMIT 1
  `;

  if (Array.isArray(subjectRows) && subjectRows.length > 0) {
    await sql`
      UPDATE human_passwords
      SET password_hash = ${passwordHash},
          salt = ${salt},
          algorithm = ${algorithm},
          updated_at = ${nowIso}
      WHERE auth_subject_id = ${subjectRows[0].id}
    `;
  }

  // 4. Revoke ALL active sessions for this human principal for security
  await sql`
    UPDATE sessions
    SET revoked_at = NOW()
    WHERE human_id = ${humanId} AND revoked_at IS NULL
  `;

  return res.status(200).json({
    success: true,
    message: "Password reset successfully. Please sign in with your new password.",
  });
}
