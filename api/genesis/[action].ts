/**
 * /api/genesis/[action]
 *
 * Consolidated Genesis 001 dispatcher (keeps total Vercel functions <= 12):
 *   - GET  /api/genesis/registry     (public historical ledger — zero PII)
 *   - GET  /api/genesis/status       (authenticated owner entitlements & ceremony state)
 *   - POST /api/genesis/acknowledge  (authenticated idempotent ceremony dismissal)
 */

import { neon } from "@neondatabase/serverless";
import { authenticateRequest } from "../../lib/serverlessAuth.ts";
import {
  acknowledgeGenesisCeremony,
  getPublicGenesisRegistry,
} from "../../lib/genesisService.ts";
import { resolveIdentityEntitlements } from "../../lib/entitlements.ts";

function resolveAction(req: any): string | undefined {
  if (req.query?.action) {
    return Array.isArray(req.query.action) ? req.query.action[0] : String(req.query.action);
  }
  if (req.url) {
    const pathname = String(req.url).split("?")[0];
    return pathname.split("/").filter(Boolean).pop();
  }
  return undefined;
}

export default async function handler(req: any, res: any, deps: any = {}) {
  const action = resolveAction(req);
  const databaseUrl = deps.databaseUrl ?? process.env.DATABASE_URL;

  if (!databaseUrl && !deps.sql) {
    return res.status(500).json({
      success: false,
      error: "configuration_error",
      message: "Database not configured.",
    });
  }

  const sql = deps.sql ?? neon(databaseUrl!);

  if (action === "registry") {
    if (req.method !== "GET") {
      res.setHeader("Allow", "GET");
      return res.status(405).json({ success: false, error: "method_not_allowed" });
    }
    try {
      const registry = await getPublicGenesisRegistry(sql);
      res.setHeader("Cache-Control", "no-store");
      return res.status(200).json({ success: true, registry });
    } catch (err: any) {
      console.error("[/api/genesis/registry] Error:", err);
      return res.status(500).json({
        success: false,
        error: "registry_unavailable",
        message: "Unable to load Genesis registry.",
      });
    }
  }

  if (action === "status") {
    if (req.method !== "GET") {
      res.setHeader("Allow", "GET");
      return res.status(405).json({ success: false, error: "method_not_allowed" });
    }

    const auth = deps.authenticateRequest
      ? await deps.authenticateRequest(req)
      : await authenticateRequest(req, { sql: deps.sql, databaseUrl: deps.databaseUrl });

    if (!auth.ok) {
      const errAuth = auth as { status: number; error: string; message: string };
      return res.status(errAuth.status).json({
        success: false,
        error: errAuth.error,
        message: errAuth.message,
      });
    }

    try {
      const idRows = await sql`
        SELECT plan
        FROM youniverse_identities
        WHERE identity_id = ${auth.user.youniverseId}
        LIMIT 1
      `;
      const basePlan = idRows?.[0]?.plan ? String(idRows[0].plan) : "free";
      const entitlements = await resolveIdentityEntitlements(
        sql,
        auth.user.youniverseId,
        basePlan
      );

      res.setHeader("Cache-Control", "no-store");
      return res.status(200).json({
        success: true,
        handle: auth.user.handle,
        entitlements,
      });
    } catch (err: any) {
      console.error("[/api/genesis/status] Error:", err);
      return res.status(500).json({
        success: false,
        error: "status_unavailable",
        message: "Unable to resolve entitlements.",
      });
    }
  }

  if (action === "acknowledge") {
    if (req.method !== "POST") {
      res.setHeader("Allow", "POST");
      return res.status(405).json({ success: false, error: "method_not_allowed" });
    }

    const auth = deps.authenticateRequest
      ? await deps.authenticateRequest(req)
      : await authenticateRequest(req, { sql: deps.sql, databaseUrl: deps.databaseUrl });

    if (!auth.ok) {
      const errAuth = auth as { status: number; error: string; message: string };
      return res.status(errAuth.status).json({
        success: false,
        error: errAuth.error,
        message: errAuth.message,
      });
    }

    try {
      const result = await acknowledgeGenesisCeremony(sql, auth.user.youniverseId);
      if (!result.acknowledged) {
        return res.status(404).json({
          success: false,
          error: "genesis_award_not_found",
          message: "No Genesis 001 award belongs to this identity.",
        });
      }

      res.setHeader("Cache-Control", "no-store");
      return res.status(200).json({
        success: true,
        acknowledged: true,
        ceremonySeenAt: result.ceremonySeenAt,
      });
    } catch (err: any) {
      console.error("[/api/genesis/acknowledge] Error:", err);
      return res.status(500).json({
        success: false,
        error: "acknowledge_failed",
        message: "Unable to acknowledge Genesis ceremony.",
      });
    }
  }

  return res.status(404).json({
    success: false,
    error: "not_found",
    message: `Unknown Genesis action: ${action}`,
  });
}

