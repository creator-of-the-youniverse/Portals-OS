-- =============================================================================
-- Migration 016: Books OS Archive Entries (Neon PostgreSQL)
--
-- Purpose:
--   Durable, tenant-isolated archival ledger connecting Portals OS (NotNotes &
--   Weaver) to the canonical Books OS hierarchy (Tower / Shelf / Book / Page).
--
-- Invariants:
--   - Strictly scoped to authenticated owner's `youniverse_id`.
--   - Idempotent versioning via unique index on
--     (youniverse_id, COALESCE(source_artifact_id, ''), version_hash).
--   - Supports entry types: weaver_app_snapshot, notnote_artifact, daily_record.
-- =============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.books_os_archive_entries (
  id TEXT PRIMARY KEY,
  youniverse_id TEXT NOT NULL,
  source_artifact_id TEXT,
  entry_type TEXT NOT NULL CHECK (
    entry_type IN ('weaver_app_snapshot', 'notnote_artifact', 'daily_record')
  ),
  tower_id TEXT NOT NULL,
  shelf_id TEXT NOT NULL,
  book_id TEXT NOT NULL,
  page_id TEXT,
  title TEXT NOT NULL,
  summary TEXT,
  body_markdown TEXT NOT NULL DEFAULT '',
  payload_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  version_hash TEXT NOT NULL,
  webhook_sync_status TEXT NOT NULL DEFAULT 'skipped' CHECK (
    webhook_sync_status IN ('skipped', 'synced', 'failed')
  ),
  webhook_synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Idempotent versioning: prevent duplicate writes of unchanged content per Youniverse + source artifact
CREATE UNIQUE INDEX IF NOT EXISTS idx_books_os_archive_idempotent_version
  ON public.books_os_archive_entries (
    youniverse_id,
    COALESCE(source_artifact_id, ''),
    version_hash
  );

-- Owner timeline lookup
CREATE INDEX IF NOT EXISTS idx_books_os_archive_owner_created
  ON public.books_os_archive_entries (youniverse_id, created_at DESC);

-- Books OS coordinate lookup (Tower -> Shelf -> Book)
CREATE INDEX IF NOT EXISTS idx_books_os_archive_coordinates
  ON public.books_os_archive_entries (youniverse_id, tower_id, shelf_id, book_id);

-- Source NotNote artifact lookup
CREATE INDEX IF NOT EXISTS idx_books_os_archive_source_artifact
  ON public.books_os_archive_entries (youniverse_id, source_artifact_id)
  WHERE source_artifact_id IS NOT NULL;

COMMIT;
