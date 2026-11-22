/**
 * POST /api/auth/password/recover
 *
 * Requests a password reset link.
 *
 * Anti-Enumeration Invariant:
 *  - Returns HTTP 200 with generic success message whether the email exists or not.
 *  - Generates a single-use 192-bit token with 15-minute expiration stored as SHA-256 hash.
 */

import { neon } from "@neondatabase/serverless";
import { generatePasswordResetToken } from "../../../passwordAuth.ts";
import { normalizeEmail } from "../../../humanContinuity.ts";
import { assertSafeDatabaseTarget, enforceAntiCsrf } from "../../../creatorOwnership.ts";
import { buildPasswordResetUrl, sendPasswordResetEmail } from "../../../emailService.ts";

export interface PasswordRecoverHandlerDeps {
  sql?: any;
  databaseUrl?: string;
  sendEmailFn?: (email: string, resetLink: string) => Promise<void>;
  env?: Record<string, string | undefined>;
}

export default async function handler(req: any, res: any, deps: PasswordRecoverHandlerDeps = {}) {
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

  // Always return identical success response to prevent account enumeration
  const genericResponse = {
    success: true,
    message: "If an account exists for this email, a password reset link has been dispatched.",
  };

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(200).json(genericResponse);
  }

  const databaseUrl = deps.databaseUrl ?? process.env.DATABASE_URL;
  if (!databaseUrl && !deps.sql) {
    return res.status(500).json({ success: false, error: "server_misconfiguration", message: "Database not configured." });
  }
  if (!deps.sql) {
    assertSafeDatabaseTarget(databaseUrl, deps.env ?? process.env);
  }

  const sql = deps.sql ?? neon(databaseUrl!);

  try {
    const subjectRows = await sql`
      SELECT human_id FROM human_auth_subjects
      WHERE provider_type = 'password' AND subject_identifier = ${email} AND status = 'active'
      LIMIT 1
    `;

    if (Array.isArray(subjectRows) && subjectRows.length > 0) {
      const humanId = String(subjectRows[0].human_id);
      const { rawToken, tokenHash, expiresAt } = generatePasswordResetToken();

      await sql`
        INSERT INTO human_password_resets (
          human_id,
          token_hash,
          expires_at,
          created_at
        )
        VALUES (
          ${humanId},
          ${tokenHash},
          ${expiresAt.toISOString()},
          NOW()
        )
      `;

      const resetLink = buildPasswordResetUrl(rawToken);
      if (deps.sendEmailFn) {
        await deps.sendEmailFn(email, resetLink);
      } else {
        await sendPasswordResetEmail({ email, resetUrl: resetLink });
      }
    }
  } catch {
    // Fail silently to outside caller to maintain anti-enumeration invariant
  }

  return res.status(200).json(genericResponse);
}
