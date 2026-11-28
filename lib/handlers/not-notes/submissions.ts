/**
 * GET /api/not-notes/submissions
 *
 * Owner-only Collection Point submissions retrieval (routed via consolidated
 * `api/not-notes/[action].ts` to preserve the Vercel 12-function Hobby cap).
 *
 * Critical Data Boundary:
 *   - Requires authenticated owner session (`authenticateRequest`).
 *   - Strictly scoped to `auth.user.youniverseId`.
 *   - Rejects any cross-Youniverse `youniverseId`, `widgetId`, or origin
 *     tenant handle mismatch with `403`.
 */

import { neon } from "@neondatabase/serverless";
import { assertSafeDatabaseTarget, extractTenantOriginHandle } from "../../creatorOwnership.ts";
import { authenticateRequest } from "../../serverlessAuth.ts";
import {
  VALID_COLLECTION_TYPES,
  listCollectionPointSubmissions,
  type CollectionPointType,
} from "../../collectionPoints.ts";

export default async function handler(req: any, res: any, deps: any = {}) {
  if (String(req?.method ?? "").toUpperCase() !== "GET") {
    res.setHeader?.("Allow", "GET");
    return res.status(405).json({ success: false, error: "method_not_allowed" });
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
      error: "forbidden_youniverse_scope",
      message: "Origin tenant handle does not match authenticated Youniverse.",
    });
  }

  const rawRequestedYouniverseId = req?.query?.youniverseId;
  if (
    typeof rawRequestedYouniverseId === "string" &&
    rawRequestedYouniverseId.trim().length > 0 &&
    rawRequestedYouniverseId.trim() !== String(auth.user.youniverseId)
  ) {
    return res.status(403).json({
      success: false,
      error: "forbidden_youniverse_scope",
      message: "You are not authorized to access another Youniverse's submissions.",
    });
  }

  const databaseUrl = deps.databaseUrl ?? process.env.DATABASE_URL;
  if (!databaseUrl && !deps.sql) {
    return res.status(500).json({ success: false, error: "server_misconfiguration" });
  }
  if (!deps.sql) {
    assertSafeDatabaseTarget(databaseUrl, deps.env ?? process.env);
  }

  try {
    const sql = deps.sql ?? neon(databaseUrl!);

    const rawWidgetId = req?.query?.widgetId;
    const widgetId =
      typeof rawWidgetId === "string" && rawWidgetId.trim().length > 0
        ? rawWidgetId.trim()
        : undefined;

    if (widgetId) {
      const widgetRows = await sql`
        SELECT id, "youniverseId", title, content, status, "createdAt", "updatedAt"
        FROM "NotNote"
        WHERE id = ${widgetId}
        LIMIT 1
      `;
      if (Array.isArray(widgetRows) && widgetRows.length > 0) {
        if (String(widgetRows[0].youniverseId) !== String(auth.user.youniverseId)) {
          return res.status(403).json({
            success: false,
            error: "forbidden_widget_ownership",
            message: "You are not authorized to access submissions for this widget.",
          });
        }
      }
    }

    const rawType =
      typeof req?.query?.collectionType === "string"
        ? req.query.collectionType.trim().toLowerCase()
        : "";
    const collectionType = VALID_COLLECTION_TYPES.has(rawType as CollectionPointType)
      ? (rawType as CollectionPointType)
      : undefined;

    const limit = req?.query?.limit ? Number(req.query.limit) : 100;

    const submissions = await listCollectionPointSubmissions(
      auth.user.youniverseId,
      { widgetId, collectionType, limit },
      { sql, env: deps.env }
    );

    return res.status(200).json({
      success: true,
      submissions,
      count: submissions.length,
    });
  } catch (error) {
    console.error("[NotNotes Submissions] Query error:", error);
    return res.status(500).json({ success: false, error: "Internal server error" });
  }
}
