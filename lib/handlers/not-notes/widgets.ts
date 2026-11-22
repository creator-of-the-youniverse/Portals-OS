/**
 * GET /api/not-notes/widgets
 *
 * Vercel Serverless Function — returns saved widgets (draft, published, and
 * unpublished) belonging strictly to the authorized target Youniverse.
 */

import { neon } from "@neondatabase/serverless";
import { assertSafeDatabaseTarget } from "../../creatorOwnership.ts";
import { authenticateRequest } from "../../serverlessAuth.ts";
import { formatOwnerWidget } from "../../widgetLifecycle.ts";

export default async function handler(req: any, res: any, deps: any = {}) {
  if (req.method !== "GET") {
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

  const databaseUrl = deps.databaseUrl ?? process.env.DATABASE_URL;
  if (!databaseUrl && !deps.sql) {
    return res.status(500).json({ success: false, error: "server_misconfiguration" });
  }
  if (!deps.sql) {
    assertSafeDatabaseTarget(databaseUrl, deps.env ?? process.env);
  }

  try {
    const sql = deps.sql ?? neon(databaseUrl!);
    const rawRequestedId = req?.query?.id;
    const requestedId =
      typeof rawRequestedId === "string" && rawRequestedId.trim().length > 0
        ? rawRequestedId.trim()
        : null;

    if (requestedId) {
      const byIdRows = await sql`
        SELECT id, "youniverseId", title, content, status, "createdAt", "updatedAt"
        FROM "NotNote"
        WHERE id = ${requestedId}
        LIMIT 1
      `;
      if (!Array.isArray(byIdRows) || byIdRows.length === 0) {
        return res.status(404).json({
          success: false,
          error: "widget_not_found",
          message: "Widget not found.",
        });
      }
      const row = byIdRows[0];
      if (String(row.youniverseId) !== String(auth.user.youniverseId)) {
        return res.status(403).json({
          success: false,
          error: "forbidden_widget_ownership",
          message: "You are not authorized to access this widget.",
        });
      }
      if (String(row.status ?? "APPROVED") !== "APPROVED") {
        return res.status(404).json({
          success: false,
          error: "widget_not_found",
          message: "Widget not found.",
        });
      }
      const formatted = formatOwnerWidget(row, auth.user.youniverseId);
      if (!formatted) {
        return res.status(404).json({
          success: false,
          error: "widget_not_found",
          message: "Widget not found.",
        });
      }
      return res.status(200).json({
        success: true,
        widget: formatted,
        widgets: [formatted],
      });
    }

    const widgets = await sql`
      SELECT id, "youniverseId", title, content, status, "createdAt", "updatedAt"
      FROM "NotNote"
      WHERE "youniverseId" = ${auth.user.youniverseId}
        AND status = 'APPROVED'
      ORDER BY "createdAt" DESC
    `;

    const reactWidgets = (Array.isArray(widgets) ? widgets : [])
      .filter((w: any) => String(w.youniverseId ?? auth.user.youniverseId) === String(auth.user.youniverseId))
      .map((w: any) => formatOwnerWidget(w, auth.user.youniverseId))
      .filter((w): w is NonNullable<typeof w> => w !== null);

    return res.status(200).json({
      success: true,
      widgets: reactWidgets,
    });
  } catch (error) {
    console.error("[NotNotes Widgets] Query error:", error);
    return res.status(500).json({ success: false, error: "Internal server error" });
  }
}
