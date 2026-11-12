/**
 * POST /api/not-notes/artifact
 *
 * Vercel Serverless Function — saves a Weaver synthesized artifact for the authenticated owner.
 */

import { neon } from "@neondatabase/serverless";
import { nanoid } from "nanoid";
import { authenticateRequest } from "../../lib/serverlessAuth.ts";

export default async function handler(req: any, res: any, deps: any = {}) {
  if (req.method !== "POST") {
    return res.status(405).json({ success: false, error: "method_not_allowed" });
  }

  const auth = await authenticateRequest(req, deps);
  if (!auth.ok) {
    return res.status(auth.status).json({ success: false, error: auth.error, message: auth.message });
  }

  const { title, code, dependencies } = req.body ?? {};
  if (!title || !code) {
    return res.status(400).json({ success: false, error: "bad_request", message: "Component title and code are required." });
  }

  const databaseUrl = deps.databaseUrl ?? process.env.DATABASE_URL;
  if (!databaseUrl) {
    return res.status(500).json({ success: false, error: "server_misconfiguration" });
  }

  try {
    const sql = deps.sql ?? neon(databaseUrl);
    const id = nanoid();
    const content = {
      type: "REACT_WIDGET",
      code,
      dependencies: Array.isArray(dependencies) ? dependencies : [],
    };

    await sql`
      INSERT INTO "NotNote" (
        id,
        "youniverseId",
        title,
        content,
        status,
        "createdAt",
        "updatedAt"
      )
      VALUES (
        ${id},
        ${auth.user.youniverseId},
        ${title},
        ${JSON.stringify(content)},
        'APPROVED',
        NOW(),
        NOW()
      )
    `;

    return res.status(200).json({
      success: true,
      artifact: {
        id,
        youniverseId: auth.user.youniverseId,
        title,
        content,
        status: "APPROVED",
      },
    });
  } catch (error) {
    console.error("[NotNotes Artifact] Insert error:", error);
    return res.status(500).json({ success: false, error: "Internal server error" });
  }
}
