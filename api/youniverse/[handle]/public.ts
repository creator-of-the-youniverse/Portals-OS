import { neon } from "@neondatabase/serverless";
import { getPublicBadgesForIdentity } from "../../../lib/genesisService.ts";

export default async function handler(req: any, res: any, deps: any = {}) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({
      success: false,
      error: "method_not_allowed",
    });
  }

  // Support both Express req.params and Vercel req.query
  const rawHandle = req.params?.handle || req.query?.handle;

  if (typeof rawHandle !== "string") {
    return res.status(400).json({
      success: false,
      error: "invalid_handle",
    });
  }

  const handle = rawHandle.toLowerCase().replace(/^@/, "");

  if (
    handle.length < 2 ||
    handle.length > 50 ||
    !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(handle)
  ) {
    return res.status(400).json({
      success: false,
      error: "invalid_handle",
    });
  }

  const databaseUrl = deps.databaseUrl ?? process.env.DATABASE_URL;

  if (!databaseUrl) {
    return res.status(500).json({
      success: false,
      error: "server_misconfiguration",
    });
  }

  try {
    const sql = deps.sql ?? neon(databaseUrl);
    const rows = await sql`
      SELECT identity_id, username, display_name, subdomain, identity_type, plan, is_live
      FROM youniverse_identities
      WHERE username = ${handle}
      LIMIT 1
    `;

    if (rows.length === 0 || rows[0].is_live !== true) {
      return res.status(404).json({
        success: false,
        error: "youniverse_not_found",
      });
    }

    const youniverse = rows[0];
    const badges = youniverse.identity_id
      ? await getPublicBadgesForIdentity(sql, String(youniverse.identity_id))
      : [];

    return res.status(200).json({
      success: true,
      youniverse: {
        handle: String(youniverse.username),
        displayName: String(youniverse.display_name),
        subdomain: String(youniverse.subdomain),
        type: String(youniverse.identity_type),
        plan: String(youniverse.plan ?? "free"),
        badges,
      },
      publicWidgets: [],
    });
  } catch (error) {
    console.error("[YouniversePublic] Profile lookup failed:", error);
    return res.status(500).json({
      success: false,
      error: "public_profile_unavailable",
    });
  }
}
