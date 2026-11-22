/**
 * /api/youniverse/[handle]/[action]
 *
 * Consolidated Youniverse Handle Dispatcher (consolidates 2 routes into 1 Vercel Function):
 *   - GET /api/youniverse/:handle/context
 *   - GET /api/youniverse/:handle/public
 */

import contextHandler from "../../../lib/handlers/youniverse/context.ts";
import publicHandler from "../../../lib/handlers/youniverse/public.ts";

const YOUNIVERSE_ACTION_MAP: Record<string, (req: any, res: any, deps?: any) => Promise<any>> = {
  context: contextHandler,
  public: publicHandler,
};

export function resolveYouniverseParams(req: any): { handle: string; action: string } {
  const rawHandleParam = req?.params?.handle ?? req?.query?.handle;
  const rawActionParam = req?.params?.action ?? req?.query?.action;

  let handle = Array.isArray(rawHandleParam)
    ? String(rawHandleParam[0] ?? "")
    : typeof rawHandleParam === "string"
      ? rawHandleParam
      : "";
  let action = Array.isArray(rawActionParam)
    ? String(rawActionParam[0] ?? "")
    : typeof rawActionParam === "string"
      ? rawActionParam
      : "";

  handle = handle.trim();
  action = action.trim();
  if (handle === "[handle]") handle = "";
  if (action === "[action]") action = "";

  if ((!handle || !action) && typeof req?.url === "string") {
    const pathname = req.url.split("?")[0].replace(/^\/+|\/+$/g, "");
    const match = pathname.match(/^api\/youniverse\/([^/]+)\/([^/]+)$/i);
    if (match) {
      if (!handle) handle = match[1];
      if (!action) action = match[2];
    }
  }

  if (handle && req && typeof req === "object") {
    if (!req.query || typeof req.query !== "object") {
      req.query = {};
    }
    if (!req.query.handle) {
      req.query.handle = handle;
    }
  }

  return {
    handle,
    action: action.replace(/\.ts$/i, "").toLowerCase(),
  };
}

export default async function handler(req: any, res: any, deps: any = {}) {
  const { action } = resolveYouniverseParams(req);
  const targetHandler = YOUNIVERSE_ACTION_MAP[action];

  if (!targetHandler) {
    return res.status(404).json({
      success: false,
      error: "not_found",
    });
  }

  return targetHandler(req, res, deps);
}
