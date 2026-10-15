-- ─────────────────────────────────────────────────────────────
-- 002 · @welcome — The Foundational World
--
-- @welcome is a standard Youniverse row with system permissions.
-- No separate signup service: it lives in the same table as @alex.
-- Idempotent: safe to re-run (also executed by /api/migrate-db).
-- ─────────────────────────────────────────────────────────────

-- 1. Foundation config + energy signature on every Youniverse
ALTER TABLE youniverse_identities
  ADD COLUMN IF NOT EXISTS email       TEXT,
  ADD COLUMN IF NOT EXISTS plan        TEXT DEFAULT 'free',
  ADD COLUMN IF NOT EXISTS foundation  JSONB,
  ADD COLUMN IF NOT EXISTS energy_hue  INTEGER,
  ADD COLUMN IF NOT EXISTS is_system   BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS youniverse_identities_created_at_idx
  ON youniverse_identities (created_at DESC);

-- 2. The @welcome system Youniverse itself
INSERT INTO youniverse_identities (
  identity_id, username, display_name, subdomain, identity_type,
  plan, is_system, created_at
)
VALUES (
  'sys_welcome', 'welcome', 'The Welcome World', 'welcome.itsyouonline.com',
  'agent', 'system', TRUE, NOW()
)
ON CONFLICT (username) DO UPDATE SET is_system = TRUE;

-- 3. Presence — who is standing in @welcome right now
CREATE TABLE IF NOT EXISTS welcome_presence (
  visitor_id  TEXT PRIMARY KEY,
  last_seen   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS welcome_presence_last_seen_idx
  ON welcome_presence (last_seen);

-- 4. Broadcasts — the cultural engine at the front door
--    kind: 'announcement' | 'celebration' | 'season' | 'milestone'
CREATE TABLE IF NOT EXISTS welcome_broadcasts (
  id          TEXT PRIMARY KEY,
  kind        TEXT NOT NULL DEFAULT 'announcement',
  message     TEXT NOT NULL,
  hue         INTEGER,
  starts_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ends_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS welcome_broadcasts_window_idx
  ON welcome_broadcasts (starts_at, ends_at);
