/**
 * /api/auth/[route]
 *
 * Consolidated Human Continuity & Owner Authentication Dispatcher
 * (consolidates 15 auth endpoints across 14 handlers into 1 Vercel Function):
 *   - POST /api/auth/enroll
 *   - POST /api/auth/logout
 *   - POST /api/auth/login (compat alias -> password/login)
 *   - POST /api/auth/password/login
 *   - POST /api/auth/password/recover
 *   - POST /api/auth/password/reset
 *   - POST /api/auth/password/set
 *   - POST /api/auth/passkey/options
 *   - POST /api/auth/passkey/verify
 *   - GET, POST /api/auth/recovery/codes
 *   - POST /api/auth/recovery/redeem
 *   - GET, POST /api/auth/recovery/manual (?action=review|execute|caseId)
 *   - POST /api/auth/homeverse/relinquish
 *   - POST /api/auth/homeverse/cancel
 *   - GET  /api/auth/homeverse/status
 */

import enrollHandler from "../../lib/handlers/auth/enroll.ts";
import logoutHandler from "../../lib/handlers/auth/logout.ts";
import passwordLoginHandler from "../../lib/handlers/auth/password/login.ts";
import passwordRecoverHandler from "../../lib/handlers/auth/password/recover.ts";
import passwordResetHandler from "../../lib/handlers/auth/password/reset.ts";
import passwordSetHandler from "../../lib/handlers/auth/password/set.ts";
import passkeyOptionsHandler from "../../lib/handlers/auth/passkey/options.ts";
import passkeyVerifyHandler from "../../lib/handlers/auth/passkey/verify.ts";
import recoveryCodesHandler from "../../lib/handlers/auth/recovery/codes.ts";
import recoveryRedeemHandler from "../../lib/handlers/auth/recovery/redeem.ts";
import manualRecoveryHandler from "../../lib/handlers/auth/recovery/manual.ts";
import homeverseRelinquishHandler from "../../lib/handlers/auth/homeverse/relinquish.ts";
import homeverseCancelHandler from "../../lib/handlers/auth/homeverse/cancel.ts";
import homeverseStatusHandler from "../../lib/handlers/auth/homeverse/status.ts";

const AUTH_ROUTE_MAP: Record<string, (req: any, res: any, deps?: any) => Promise<any>> = {
  enroll: enrollHandler,
  logout: logoutHandler,
  login: passwordLoginHandler,
  "password/login": passwordLoginHandler,
  "password/recover": passwordRecoverHandler,
  "password/reset": passwordResetHandler,
  "password/set": passwordSetHandler,
  "passkey/options": passkeyOptionsHandler,
  "passkey/verify": passkeyVerifyHandler,
  "recovery/codes": recoveryCodesHandler,
  "recovery/redeem": recoveryRedeemHandler,
  "recovery/manual": manualRecoveryHandler,
  "homeverse/relinquish": homeverseRelinquishHandler,
  "homeverse/cancel": homeverseCancelHandler,
  "homeverse/status": homeverseStatusHandler,
};

export function resolveAuthRoute(req: any): string {
  const rawParam = req?.params?.route ?? req?.query?.route;
  let candidate = "";

  if (Array.isArray(rawParam)) {
    candidate = rawParam.map(String).join("/");
  } else if (typeof rawParam === "string") {
    candidate = rawParam;
  }

  candidate = candidate.trim().replace(/^\/+|\/+$/g, "");
  candidate = candidate.replace(/^api\/auth\/?/i, "");
  if (candidate === "[route]") {
    candidate = "";
  }

  if (!candidate && typeof req?.url === "string") {
    const pathname = req.url.split("?")[0].replace(/^\/+|\/+$/g, "");
    if (/^api\/auth\//i.test(pathname)) {
      candidate = pathname.replace(/^api\/auth\//i, "");
    }
  }

  return candidate.replace(/--/g, "/").replace(/\.ts$/i, "").toLowerCase();
}

export default async function handler(req: any, res: any, deps: any = {}) {
  const route = resolveAuthRoute(req);
  const targetHandler = AUTH_ROUTE_MAP[route];

  if (!targetHandler) {
    return res.status(404).json({
      success: false,
      error: "not_found",
      message: "Auth endpoint not found.",
    });
  }

  return targetHandler(req, res, deps);
}
