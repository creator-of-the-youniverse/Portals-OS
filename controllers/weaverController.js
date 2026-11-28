/**
 * controllers/weaverController.js
 *
 * POST /api/weaver/generate (Express local dev mirror of api/weaver/generate.ts)
 *
 * Supports consolidated Weaver AI Studio actions:
 *   - action: "generate" (default) — Targeted multi-file edits
 *   - action: "generate_asset"     — CSP-safe multimodal/SVG asset synthesis
 *   - action: "runtime_infer"      — Authenticated runtime inference proxy
 *
 * Security layers:
 *   - Authenticated owner session injected via `verifyJwt` middleware (`req.user`).
 *   - Per-user rate limiting in `server.js` (`weaverRateLimiter`).
 *   - Anti-CSRF & tenant origin handle checks matching Vercel serverless handler.
 *   - Server-side provider sovereignty via `lib/weaverStudioBackend.ts`.
 */

import { enforceAntiCsrf, extractTenantOriginHandle } from "../lib/creatorOwnership.ts";
import { executeWeaverStudioAction } from "../lib/weaverStudioBackend.ts";

/**
 * @param {import('express').Request}  req  – authenticated; req.user is set by verifyJwt.
 * @param {import('express').Response} res
 * @param {object} [deps]
 */
export async function weaverGenerateHandler(req, res, deps = {}) {
  const user = req?.user;
  if (!user || !user.youniverseId) {
    return res.status(401).json({
      success: false,
      error: "unauthorized",
      message: "Authenticated owner session is required.",
    });
  }

  const hasOriginHeader = Boolean(req?.headers?.origin ?? req?.headers?.Origin);
  const rawAuthHeader = req?.headers?.authorization ?? req?.headers?.Authorization;
  const hasBearerAuth =
    typeof rawAuthHeader === "string" &&
    rawAuthHeader.startsWith("Bearer ") &&
    rawAuthHeader.slice(7).trim().length > 0;

  if (hasOriginHeader) {
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
  } else if (!hasBearerAuth && req?.headers?.cookie) {
    const csrf = enforceAntiCsrf(req, deps?.env ?? process.env, {
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

  const originTenantHandle = extractTenantOriginHandle(req);
  if (
    originTenantHandle &&
    user.handle &&
    originTenantHandle !== String(user.handle).toLowerCase()
  ) {
    return res.status(403).json({
      success: false,
      error: "csrf_rejected",
      message: "Origin tenant handle does not match authorized target Youniverse.",
    });
  }

  return executeWeaverStudioAction(req, res, user, deps);
}
