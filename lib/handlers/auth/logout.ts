/**
 * POST /api/auth/logout
 *
 * Terminates the authenticated session and clears the session cookie.
 */

import { neon } from "@neondatabase/serverless";
import { validateSession } from "../../neonSession.ts";
import {
  assertSafeDatabaseTarget,
  validateRequestSessionWithCookieFallback,
  buildClearSessionCookieHeader,
  enforceAntiCsrf,
} from "../../creatorOwnership.ts";

export interface LogoutHandlerDeps {
  sql?: any;
  databaseUrl?: string;
  env?: Record<string, string | undefined>;
}

export default async function handler(req: any, res: any, deps: LogoutHandlerDeps = {}) {
  if (req.method !== "POST") {
    return res.status(405).json({ success: false, error: "method_not_allowed" });
  }

  const csrfCheck = enforceAntiCsrf(req, deps.env ?? process.env, {
    allowSameOriginTenantSubdomain: true,
  });
  if (csrfCheck.blocked) {
    return res.status(403).json({ success: false, error: "csrf_rejected", message: csrfCheck.reason });
  }

  const databaseUrl = deps.databaseUrl ?? process.env.DATABASE_URL;
  if (!deps.sql && databaseUrl) {
    assertSafeDatabaseTarget(databaseUrl, deps.env ?? process.env);
  }
  const sql = deps.sql ?? (databaseUrl ? neon(databaseUrl) : null);

  if (sql) {
    try {
      const validation = await validateRequestSessionWithCookieFallback(sql, req, validateSession);
      if (validation.ok && validation.sessionId) {
        await sql`
          UPDATE sessions
          SET revoked_at = NOW()
          WHERE id = ${validation.sessionId} AND revoked_at IS NULL
        `;
      }
    } catch {
      // Ignore DB errors on logout to ensure cookie clearing always succeeds
    }
  }

  if (typeof res.setHeader === "function") {
    res.setHeader("Set-Cookie", buildClearSessionCookieHeader(req));
  }

  return res.status(200).json({
    success: true,
    message: "Logged out successfully.",
  });
}
