/**
 * GET /api/welcome/pulse?v=<visitorId>
 *
 * The heartbeat of @welcome — the living room of the network.
 * One round-trip returns the collective energy of the platform:
 *
 *   - presence      souls standing in @welcome right now (last 90s)
 *   - sparkedToday  Youniverses ignited since UTC midnight
 *   - total         all personal Youniverses in existence
 *   - recent        the latest handles to step through the gate
 *   - broadcasts    active announcements / celebrations (cultural engine)
 *
 * Calling it with ?v= also registers the caller's presence (heartbeat).
 * Degrades gracefully: missing tables yield zeros, never a 500 to the world.
 */

import { neon } from "@neondatabase/serverless";

const PRESENCE_WINDOW_SECONDS = 90;
const VISITOR_ID_REGEX = /^[a-z0-9]{8,40}$/i;

export default async function handler(req: any, res: any) {
  if (req.method !== "GET") {
    return res.status(405).json({ status: "method-not-allowed" });
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    return res.status(500).json({ status: "configuration-error" });
  }

  const sql = neon(databaseUrl);
  const visitorId = typeof req.query?.v === "string" ? req.query.v : "";

  const pulse = {
    status: "ok",
    now: new Date().toISOString(),
    presence: 0,
    sparkedToday: 0,
    total: 0,
    recent: [] as { handle: string; hue: number | null; at: string }[],
    broadcasts: [] as { id: string; kind: string; message: string; hue: number | null }[],
  };

  // ── Presence heartbeat ───────────────────────────────────
  try {
    if (VISITOR_ID_REGEX.test(visitorId)) {
      await sql`
        INSERT INTO welcome_presence (visitor_id, last_seen)
        VALUES (${visitorId}, NOW())
        ON CONFLICT (visitor_id) DO UPDATE SET last_seen = NOW()
      `;
    }
    // Opportunistic sweep keeps the table tiny without a cron.
    await sql`
      DELETE FROM welcome_presence
      WHERE last_seen < NOW() - INTERVAL '10 minutes'
    `;
    const [row] = await sql`
      SELECT COUNT(*)::int AS n FROM welcome_presence
      WHERE last_seen > NOW() - make_interval(secs => ${PRESENCE_WINDOW_SECONDS})
    `;
    pulse.presence = row?.n ?? 0;
  } catch (err) {
    console.warn("[welcome/pulse] presence unavailable:", (err as Error).message);
  }

  // ── Youniverse counts + recent sparks ────────────────────
  try {
    const [counts] = await sql`
      SELECT
        COUNT(*) FILTER (WHERE created_at >= date_trunc('day', NOW()))::int AS today,
        COUNT(*)::int AS total
      FROM youniverse_identities
      WHERE COALESCE(is_system, FALSE) = FALSE
    `;
    pulse.sparkedToday = counts?.today ?? 0;
    pulse.total = counts?.total ?? 0;

    const recent = await sql`
      SELECT username, energy_hue, created_at
      FROM youniverse_identities
      WHERE COALESCE(is_system, FALSE) = FALSE
      ORDER BY created_at DESC
      LIMIT 8
    `;
    pulse.recent = recent.map((r: any) => ({
      handle: String(r.username),
      hue: r.energy_hue == null ? null : Number(r.energy_hue),
      at: new Date(r.created_at).toISOString(),
    }));
  } catch (err) {
    // Pre-migration fallback: is_system / energy_hue may not exist yet.
    try {
      const [counts] = await sql`
        SELECT
          COUNT(*) FILTER (WHERE created_at >= date_trunc('day', NOW()))::int AS today,
          COUNT(*)::int AS total
        FROM youniverse_identities
      `;
      pulse.sparkedToday = counts?.today ?? 0;
      pulse.total = counts?.total ?? 0;
    } catch (inner) {
      console.warn("[welcome/pulse] identity counts unavailable:", (inner as Error).message);
    }
  }

  // ── Broadcasts (cultural engine) ─────────────────────────
  try {
    const rows = await sql`
      SELECT id, kind, message, hue
      FROM welcome_broadcasts
      WHERE starts_at <= NOW() AND (ends_at IS NULL OR ends_at > NOW())
      ORDER BY starts_at DESC
      LIMIT 5
    `;
    pulse.broadcasts = rows.map((b: any) => ({
      id: String(b.id),
      kind: String(b.kind),
      message: String(b.message),
      hue: b.hue == null ? null : Number(b.hue),
    }));
  } catch (err) {
    console.warn("[welcome/pulse] broadcasts unavailable:", (err as Error).message);
  }

  res.setHeader("Cache-Control", "no-store");
  return res.status(200).json(pulse);
}
