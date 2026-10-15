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

    // ── 002 · @welcome Foundational World ─────────────────────
    await sql`
      ALTER TABLE youniverse_identities
        ADD COLUMN IF NOT EXISTS foundation JSONB,
        ADD COLUMN IF NOT EXISTS energy_hue INTEGER,
        ADD COLUMN IF NOT EXISTS is_system BOOLEAN NOT NULL DEFAULT FALSE
    `;
    await sql`
      CREATE INDEX IF NOT EXISTS youniverse_identities_created_at_idx
        ON youniverse_identities (created_at DESC)
    `;
    await sql`
      INSERT INTO youniverse_identities (
        identity_id, username, display_name, subdomain, identity_type,
        plan, is_system, created_at
      )
      VALUES (
        'sys_welcome', 'welcome', 'The Welcome World', 'welcome.itsyouonline.com',
        'agent', 'system', TRUE, NOW()
      )
      ON CONFLICT (username) DO UPDATE SET is_system = TRUE
    `;
    await sql`
      CREATE TABLE IF NOT EXISTS welcome_presence (
        visitor_id TEXT PRIMARY KEY,
        last_seen TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `;
    await sql`
      CREATE INDEX IF NOT EXISTS welcome_presence_last_seen_idx
        ON welcome_presence (last_seen)
    `;
    await sql`
      CREATE TABLE IF NOT EXISTS welcome_broadcasts (
        id TEXT PRIMARY KEY,
        kind TEXT NOT NULL DEFAULT 'announcement',
        message TEXT NOT NULL,
        hue INTEGER,
        starts_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        ends_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `;

    // ── 003 · Handle Claims, Seeds & Handoff Tokens ───────────
    await sql`
      CREATE TABLE IF NOT EXISTS handles (
        handle VARCHAR(32) PRIMARY KEY,
        owner_email VARCHAR(255) NOT NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'claimed' CHECK (status IN ('reserved', 'claimed', 'suspended')),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `;
    await sql`
      CREATE INDEX IF NOT EXISTS idx_handles_owner ON handles(owner_email)
    `;
    await sql`
      INSERT INTO handles (handle, owner_email, status, created_at)
      VALUES ('welcome', 'system@itsyouonline.com', 'reserved', NOW())
      ON CONFLICT (handle) DO UPDATE SET status = 'reserved'
    `;
    await sql`
      CREATE TABLE IF NOT EXISTS youniverse_seeds (
        handle VARCHAR(32) PRIMARY KEY REFERENCES handles(handle) ON DELETE CASCADE,
        energy_hue SMALLINT NOT NULL CHECK (energy_hue BETWEEN 0 AND 360),
        foundation_laws JSONB NOT NULL DEFAULT '[]'::jsonb,
        is_system BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `;
    await sql`
      CREATE TABLE IF NOT EXISTS handoff_tokens (
        token_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        handle VARCHAR(32) NOT NULL REFERENCES handles(handle) ON DELETE CASCADE,
        nonce VARCHAR(64) UNIQUE NOT NULL,
        consumed BOOLEAN NOT NULL DEFAULT FALSE,
        expires_at TIMESTAMPTZ NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `;
    await sql`
      CREATE INDEX IF NOT EXISTS idx_handoff_active ON handoff_tokens(nonce, consumed, expires_at)
    `;

    return res.status(200).json({
      status: "ok",
      message: "Migration complete — handles, seeds, handoff_tokens, identity columns & @welcome tables ensured.",
    });
  } catch (err: any) {
    console.error("[migrate-db] Error:", err);
    return res.status(500).json({ status: "error", message: err.message });
  }
}
