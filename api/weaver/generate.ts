/**
 * POST /api/weaver/generate
 *
 * Consolidated Vercel Serverless Function for Weaver AI Studio:
 *   - action: "generate" (default) — Targeted multi-file code generation & edits
 *   - action: "generate_asset"     — CSP-safe multimodal/SVG asset synthesis
 *   - action: "runtime_infer"      — Server-side text / structuredJson / liveGrounding proxy
 *
 * Security layers:
 *   - Anti-CSRF enforcement (Origin-bearing or cookie-authenticated requests)
 *   - ItsYouOnline server-side owner authentication (`authenticateRequest`)
 *   - Tenant origin handle isolation (`extractTenantOriginHandle`)
 *   - Server-side provider sovereignty (API keys never leave the server)
 */

import { authenticateRequest } from "../../lib/serverlessAuth.ts";
import { enforceAntiCsrf, extractTenantOriginHandle } from "../../lib/creatorOwnership.ts";
import { executeWeaverStudioAction } from "../../lib/weaverStudioBackend.ts";

export default async function handler(req: any, res: any, deps: any = {}) {
  if (req.method !== "POST") {
    return res.status(405).json({ success: false, error: "method_not_allowed" });
  }

  const hasOriginHeader = Boolean(req?.headers?.origin ?? req?.headers?.Origin);
  const rawAuthHeader = req?.headers?.authorization ?? req?.headers?.Authorization;
  const hasBearerAuth =
    typeof rawAuthHeader === "string" &&
    rawAuthHeader.startsWith("Bearer ") &&
    rawAuthHeader.slice(7).trim().length > 0;

  if (hasOriginHeader || !hasBearerAuth) {
    const normalizedHeaders =
      !req?.headers?.origin && req?.headers?.Origin
        ? { ...req.headers, origin: req.headers.Origin }
        : req?.headers;
    const csrfReq =
      normalizedHeaders === req?.headers ? req : { ...req, headers: normalizedHeaders };
    const csrf = enforceAntiCsrf(csrfReq, deps?.env ?? process.env, {
      allowSameOriginTenantSubdomain: true,
    });
    if (csrf.blocked) {
      return res.status(403).json({
        success: false,
        error: "csrf_rejected",
        message: csrf.reason,
      });
    }
  }

  const auth = await authenticateRequest(req, deps);
  if (!auth.ok) {
    const errAuth = auth as { status: number; error: string; message: string };
    return res.status(errAuth.status).json({
      success: false,
      error: errAuth.error,
      message: errAuth.message,
    });
  }

  const originTenantHandle = extractTenantOriginHandle(req);
  if (originTenantHandle && originTenantHandle !== auth.user.handle.toLowerCase()) {
    return res.status(403).json({
      success: false,
      error: "csrf_rejected",
      message: "Origin tenant handle does not match authorized target Youniverse.",
    });
  }

  return executeWeaverStudioAction(req, res, auth.user, deps);
}
