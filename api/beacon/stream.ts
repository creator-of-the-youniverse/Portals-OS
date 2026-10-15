/**
 * GET /api/beacon/stream
 *
 * Server-Sent Events (SSE) Broadcast Bus for the Welcome Beacon.
 * Streams low-overhead ambient network pulses and seasonal moments:
 *   - Initial pulse state upon connection
 *   - Global event emissions (PULSE, BROADCAST, MILESTONE)
 *   - Edge-friendly keep-alive heartbeats
 */

import { neon } from "@neondatabase/serverless";

export default async function handler(req: any, res: any) {
  if (req.method !== "GET") {
    return res.status(405).json({ status: "method-not-allowed" });
  }

  // Set SSE Headers
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.flushHeaders?.();

  const databaseUrl = process.env.DATABASE_URL;

  // Send immediate initial connection beacon pulse
  const initialEvent = {
    type: "PULSE",
    title: "Connected to @welcome hearth bus",
    energyHue: 258,
    timestamp: new Date().toISOString(),
  };

  res.write(`event: global_event\ndata: ${JSON.stringify(initialEvent)}\n\n`);

  // Query latest broadcast if database is available
  if (databaseUrl) {
    try {
      const sql = neon(databaseUrl);
      const rows = await sql`
        SELECT id, kind, message, hue
        FROM welcome_broadcasts
        WHERE starts_at <= NOW() AND (ends_at IS NULL OR ends_at > NOW())
        ORDER BY starts_at DESC
        LIMIT 1;
      `;

      if (rows.length > 0) {
        const b = rows[0];
        const broadcastEvent = {
          type: "BROADCAST",
          title: b.message,
          energyHue: b.hue ?? 258,
          timestamp: new Date().toISOString(),
        };
        res.write(`event: global_event\ndata: ${JSON.stringify(broadcastEvent)}\n\n`);
      }
    } catch (e) {
      console.warn("[beacon/stream] Broadcast lookup notice:", (e as Error).message);
    }
  }

  // Periodic keep-alive ping / heartbeat every 25 seconds
  const interval = setInterval(() => {
    res.write(`: keepalive ${Date.now()}\n\n`);
  }, 25000);

  req.on?.("close", () => {
    clearInterval(interval);
    res.end();
  });
}
