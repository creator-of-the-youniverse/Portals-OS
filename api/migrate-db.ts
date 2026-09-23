/**
 * GET /api/migrate-db
 *
 * One-time migration: adds email, plan, and stripe_session_id columns
 * to the youniverse_identities table if they don't already exist.
 *
 * Call once: https://itsyouonline.com/api/migrate-db?secret=YOUR_MIGRATE_SECRET
 * Protect with MIGRATE_SECRET env var to prevent accidental re-runs.
 */

import { neon } from "@neondatabase/serverless";

export default async function handler(req: any, res: any) {
  if (req.method !== "GET") {
    return res.status(405).json({ status: "method-not-allowed" });
  }

  const databaseUrl = process.env.DATABASE_URL;
  const migrateSecret = process.env.MIGRATE_SECRET;

  if (!databaseUrl) {
    return res.status(500).json({ status: "no-database-url" });
  }

  // Simple protection — require a secret query param
  if (migrateSecret && req.query?.secret !== migrateSecret) {
    return res.status(401).json({ status: "unauthorized" });
  }

  const sql = neon(databaseUrl);

  try {
    // Add columns only if they don't exist (idempotent)
    await sql`
      ALTER TABLE youniverse_identities
        ADD COLUMN IF NOT EXISTS email TEXT,
        ADD COLUMN IF NOT EXISTS plan TEXT DEFAULT 'free',
        ADD COLUMN IF NOT EXISTS stripe_session_id TEXT
    `;

    // Ensure unique constraint exists on username
    await sql`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conname = 'youniverse_identities_username_key'
        ) THEN
          ALTER TABLE youniverse_identities
            ADD CONSTRAINT youniverse_identities_username_key UNIQUE (username);
        END IF;
      END
      $$;
    `;

    return res.status(200).json({
      status: "ok",
      message: "Migration complete — email, plan, stripe_session_id columns ensured.",
    });
  } catch (err: any) {
    console.error("[migrate-db] Error:", err);
    return res.status(500).json({ status: "error", message: err.message });
  }
}
