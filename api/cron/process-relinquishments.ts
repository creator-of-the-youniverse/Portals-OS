/**
 * POST /api/cron/process-relinquishments
 *
 * Scheduled sweep: marks Homeverse relinquishments as completed when their
 * 30-day cooldown has expired and releases the former handle for new claims.
 *
 * Security:
 *  - Requires X-Portals-Internal: <PORTALS_INTERNAL_SECRET> header.
 *    Set as a Vercel environment variable and configure the cron to send it.
 *  - Also accepts Vercel-issued Authorization: Bearer <CRON_SECRET> for
 *    Vercel Cron Jobs that use the built-in CRON_SECRET mechanism.
 *  - Any other caller receives 401.
 *
 * Vercel cron configuration (vercel.json):
 *  {
 *    "crons": [{
 *      "path": "/api/cron/process-relinquishments",
 *      "schedule": "0 3 * * *"
 *    }]
 *  }
 *
 * Idempotent: safe to call multiple times. Only processes records where
 * status = 'pending' AND cooldown_expires_at < NOW().
 */

import { neon } from "@neondatabase/serverless";
import { assertSafeDatabaseTarget } from "../../lib/creatorOwnership.ts";
import { processExpiredRelinquishments } from "../../lib/homeverseRelinquishment.ts";

export interface ProcessRelinquishmentsHandlerDeps {
  sql?: any;
  databaseUrl?: string;
  env?: Record<string, string | undefined>;
}

export default async function handler(req: any, res: any, deps: ProcessRelinquishmentsHandlerDeps = {}) {
  if (req.method !== "POST" && req.method !== "GET") {
    return res.status(405).json({ error: "method_not_allowed" });
  }

  // ── Authentication: internal service token or Vercel CRON_SECRET ─────────
  const authorized = isAuthorized(req);
  if (!authorized) {
    return res.status(401).json({
      error: "unauthorized",
      message: "Authorized internal token required.",
    });
  }

  // ── Database ──────────────────────────────────────────────────────────────
  const databaseUrl = deps.databaseUrl ?? process.env.DATABASE_URL;
  if (!databaseUrl && !deps.sql) {
    return res.status(500).json({ error: "configuration_error", message: "Database not configured." });
  }
  if (!deps.sql) {
    assertSafeDatabaseTarget(databaseUrl, deps?.env ?? process.env);
  }

  const sql = deps.sql ?? neon(databaseUrl!);

  try {
    const processed = await processExpiredRelinquishments(sql);
    return res.status(200).json({
      ok: true,
      processed,
      message: `Processed ${processed} expired relinquishment(s).`,
      timestamp: new Date().toISOString(),
    });
  } catch (err: any) {
    console.error("[/api/cron/process-relinquishments]", err);
    return res.status(500).json({ error: "sweep_failed", message: err?.message ?? "Sweep failed." });
  }
}

function isAuthorized(req: any): boolean {
  // Path 1: X-Portals-Internal service token
  const internalHeader = req?.headers?.["x-portals-internal"];
  const internalSecret = (process.env.PORTALS_INTERNAL_SECRET ?? "").trim();
  if (internalSecret && typeof internalHeader === "string" && internalHeader === internalSecret) {
    return true;
  }

  // Path 2: Vercel CRON_SECRET via Authorization: Bearer <secret>
  const cronSecret = (process.env.CRON_SECRET ?? "").trim();
  if (cronSecret) {
    const authHeader = req?.headers?.["authorization"];
    const rawAuth = Array.isArray(authHeader) ? authHeader[0] : authHeader;
    if (typeof rawAuth === "string" && rawAuth === `Bearer ${cronSecret}`) {
      return true;
    }
  }

  return false;
}
