/**
 * GET /api/not-notes/widgets
 *
 * Vercel Serverless Function — returns approved widgets for the authenticated owner.
 */

import { neon } from "@neondatabase/serverless";
import { authenticateRequest } from "../../lib/serverlessAuth.ts";

export default async function handler(req: any, res: any, deps: any = {}) {
  if (req.method !== "GET") {
    return res.status(405).json({ success: false, error: "method_not_allowed" });
  }

  const auth = await authenticateRequest(req, deps);
  if (!auth.ok) {
    return res.status(auth.status).json({ success: false, error: auth.error, message: auth.message });
  }

  const databaseUrl = deps.databaseUrl ?? process.env.DATABASE_URL;
  if (!databaseUrl) {
    return res.status(500).json({ success: false, error: "server_misconfiguration" });
  }

  try {
    const sql = deps.sql ?? neon(databaseUrl);
    const widgets = await sql`
      SELECT id, title, content, "createdAt"
      FROM "NotNote"
      WHERE "youniverseId" = ${auth.user.youniverseId}
        AND status = 'APPROVED'
      ORDER BY "createdAt" DESC
    `;

    const reactWidgets = widgets
      .filter((w: any) => w.content && typeof w.content === "object" && w.content.type === "REACT_WIDGET")
      .map((w: any) => ({
        id: w.id,
        title: w.title,
        code: w.content.code,
        dependencies: w.content.dependencies || [],
        createdAt: w.createdAt,
      }));

    return res.status(200).json({
      success: true,
      widgets: reactWidgets,
    });
  } catch (error) {
    console.error("[NotNotes Widgets] Query error:", error);
    return res.status(500).json({ success: false, error: "Internal server error" });
  }
}
