-- =============================================================================
-- Migration 003: Establish Neon-native session layer
--
-- VERIFIED LIVE SCHEMA (2026-10-13, read-only inspection):
--   Existing tables (PascalCase, Prisma-created):
--     User, Youniverse, Session, NotNote, DeviceTrust
--   Missing tables:
--     youniverse_identities   (← api/claim.ts targets this; it does NOT exist)
--
-- This migration:
--   1. Adds token_hash + email_verified_at columns to the live Session + User tables.
--   2. Creates youniverse_identities from the Prisma-authoritative data, giving the
--      Neon direct-SQL API handlers a real table to read/write.
--   3. Closes the prov_-prefix forgery path by making token_hash non-null for
--      newly created sessions.
--
-- HOW TO RUN (when approved):
--   psql $DATABASE_URL_UNPOOLED -f db/migrations/003_neon_session_layer.sql
--
-- This migration is IDEMPOTENT. It is safe to re-run.
-- =============================================================================

BEGIN;

-- ── 1. Session table: add token_hash column ────────────────────────────────
-- token_hash stores SHA-256(bearer_token) so the raw token never rests in the
-- database. New sessions must have a hash; existing rows get NULL (legacy).
ALTER TABLE "Session"
  ADD COLUMN IF NOT EXISTS token_hash TEXT;

-- Index for O(1) bearer token lookup (hash lookup replaces refreshToken lookup
-- in the new Vercel handlers; refreshToken lookup is kept for backward compat
-- with any existing Express sessions).
CREATE UNIQUE INDEX IF NOT EXISTS "Session_token_hash_key"
  ON "Session" (token_hash)
  WHERE token_hash IS NOT NULL;

-- ── 2. User table: add email_verified_at column ───────────────────────────
-- email_verified_at mirrors the intent of emailVerified (DateTime?) in the
-- Prisma schema but uses a more descriptive name for direct SQL work.
-- We do NOT drop or rename emailVerified — Prisma still manages that column.
ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMPTZ;

-- Back-fill from existing emailVerified column so the two are consistent.
UPDATE "User"
  SET email_verified_at = "emailVerified"
  WHERE "emailVerified" IS NOT NULL
    AND email_verified_at IS NULL;

-- ── 3. Create youniverse_identities as a materialized view on the Prisma tables ─
-- api/claim.ts, api/stripe/webhook.ts, api/youniverseIdentity.ts, and
-- api/migrate-db.ts all target this table by name.  Rather than rewriting
-- every handler immediately (Phase 2 work), we create a real table that the
-- Neon SQL handlers can write to, backed by data copied from the Prisma schema.
--
-- Relationship: youniverse_identities is the CANONICAL identity record for the
-- Neon-direct API surface.  The Prisma tables (User, Youniverse) remain the
-- operational store for Express/server.js during the transition period.
-- Post-Phase-2, the Prisma tables will be retired.

CREATE TABLE IF NOT EXISTS youniverse_identities (
  identity_id         TEXT        PRIMARY KEY,
  username            TEXT        NOT NULL UNIQUE,
  display_name        TEXT        NOT NULL,
  subdomain           TEXT        NOT NULL UNIQUE,
  identity_type       TEXT        NOT NULL DEFAULT 'person'
                                  CHECK (identity_type IN ('person', 'agent')),
  email               TEXT,
  plan                TEXT        NOT NULL DEFAULT 'free',
  stripe_session_id   TEXT,
  is_live             BOOLEAN     NOT NULL DEFAULT TRUE,
  is_primary          BOOLEAN     NOT NULL DEFAULT TRUE,
  email_verified_at   TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE youniverse_identities
  ADD COLUMN IF NOT EXISTS is_live BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS is_primary BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS youniverse_identities_username_idx
  ON youniverse_identities (username);

CREATE INDEX IF NOT EXISTS youniverse_identities_email_idx
  ON youniverse_identities (email)
  WHERE email IS NOT NULL;

-- ── 4. Seed youniverse_identities from existing Prisma data ──────────────
-- Copy every (User + Youniverse) pair that exists in the live Prisma tables.
-- On conflict (duplicate username) keep the existing row — this is idempotent.
INSERT INTO youniverse_identities (
  identity_id,
  username,
  display_name,
  subdomain,
  identity_type,
  email,
  plan,
  is_live,
  is_primary,
  email_verified_at,
  created_at
)
SELECT
  y.id                                          AS identity_id,
  y.handle                                      AS username,
  y.handle                                      AS display_name,
  y.handle || '.itsyouonline.com'               AS subdomain,
  CASE WHEN y.type = 'PERSON' THEN 'person' ELSE 'agent' END AS identity_type,
  u.email                                       AS email,
  CASE WHEN y.tier = 'FREE' THEN 'free'
       WHEN y.tier = 'PAID' THEN 'paid'
       ELSE 'enterprise' END                    AS plan,
  y."isLive"                                    AS is_live,
  y."isPrimary"                                 AS is_primary,
  u."emailVerified"                             AS email_verified_at,
  y."createdAt"                                 AS created_at
FROM "Youniverse" y
JOIN "User" u ON u.id = y."ownerId"
ON CONFLICT (username) DO NOTHING;

-- ── 5. sessions table: the Neon-native session store ──────────────────────
-- This table serves the new Vercel function handlers (api/v1/auth/verify.ts,
-- api/youniverse/[handle]/context.ts, etc.).
-- The Prisma Session table remains for Express/server.js during transition.
--
-- Bearer tokens are NEVER stored here.  Only SHA-256(token) is stored.
-- Ownership is linked to youniverse_identities.identity_id, not User.id.

CREATE TABLE IF NOT EXISTS sessions (
  id              TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  identity_id     TEXT        NOT NULL
                              REFERENCES youniverse_identities(identity_id)
                              ON DELETE CASCADE,
  token_hash      TEXT        NOT NULL UNIQUE,  -- SHA-256(raw_bearer_token)
  expires_at      TIMESTAMPTZ NOT NULL,
  revoked_at      TIMESTAMPTZ,
  user_agent      TEXT,
  ip_address      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS sessions_token_hash_idx
  ON sessions (token_hash);

CREATE INDEX IF NOT EXISTS sessions_identity_id_idx
  ON sessions (identity_id);

COMMIT;
