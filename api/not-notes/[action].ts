/**
 * /api/not-notes/[action]
 *
 * Consolidated Not-Notes Widget Dispatcher (consolidates all NotNotes routes into 1 Vercel Function):
 *   - POST / PUT / PATCH /api/not-notes/artifact
 *   - GET  /api/not-notes/widgets
 *   - POST / PUT / PATCH /api/not-notes/update
 *   - POST / PATCH       /api/not-notes/publish
 *   - POST / PATCH       /api/not-notes/unpublish
 */

import artifactHandler from "../../lib/handlers/not-notes/artifact.ts";
import widgetsHandler from "../../lib/handlers/not-notes/widgets.ts";

const NOT_NOTES_ACTION_MAP: Record<string, (req: any, res: any, deps?: any) => Promise<any>> = {
  artifact: (req, res, deps = {}) => artifactHandler(req, res, deps),
  widgets: (req, res, deps = {}) => widgetsHandler(req, res, deps),
  update: (req, res, deps = {}) => artifactHandler(req, res, { ...deps, forcedAction: "update" }),
  publish: (req, res, deps = {}) => artifactHandler(req, res, { ...deps, forcedAction: "publish" }),
  unpublish: (req, res, deps = {}) => artifactHandler(req, res, { ...deps, forcedAction: "unpublish" }),
};

export function resolveNotNotesAction(req: any): string {
  const rawParam = req?.params?.action ?? req?.query?.action;
  let candidate = Array.isArray(rawParam)
    ? String(rawParam[0] ?? "")
    : typeof rawParam === "string"
      ? rawParam
      : "";

  candidate = candidate.trim().replace(/^\/+|\/+$/g, "");
  if (candidate === "[action]") {
    candidate = "";
  }

  if (!candidate && typeof req?.url === "string") {
    const pathname = req.url.split("?")[0].replace(/^\/+|\/+$/g, "");
    const match = pathname.match(/^api\/not-notes\/([^/]+)$/i);
    if (match) {
      candidate = match[1];
    }
  }

  return candidate.replace(/\.ts$/i, "").toLowerCase();
}

export default async function handler(req: any, res: any, deps: any = {}) {
  const action = resolveNotNotesAction(req);
  const targetHandler = NOT_NOTES_ACTION_MAP[action];

  if (!targetHandler) {
    return res.status(404).json({
      success: false,
      error: "not_found",
    });
  }

  return targetHandler(req, res, deps);
}
