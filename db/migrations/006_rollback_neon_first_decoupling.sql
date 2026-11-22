-- =============================================================================
-- Migration 006 Rollback: Restore Legacy "NotNote" Foreign Key
--
-- Purpose:
--   Safely reverses Migration 006 (`006_neon_first_decoupling.sql`) by restoring
--   "NotNote"("youniverseId") foreign key `"NotNote_youniverseId_fkey"`
--   referencing legacy `"Youniverse"(id)`.
--
-- Data-Preservation Safeguards (aborts transaction via RAISE EXCEPTION):
--   1. Verifies `"NotNote"` and `"Youniverse"` exist with expected primary keys.
--   2. Refuses rollback if ANY `"NotNote"` row references a Neon-first
--      `youniverse_identities.identity_id` that does not exist in `"Youniverse"(id)`.
--      Never deletes, nulls, or silently remaps `"NotNote"` rows.
--   3. Idempotent on repeated runs and verifies postcondition via `pg_get_constraintdef`.
-- =============================================================================

BEGIN;

DO $$
DECLARE
  v_legacy_pk_def TEXT;
  v_notnote_pk_def TEXT;
  v_identity_fk_def TEXT;
  v_legacy_fk_def TEXT;
  v_unmatched_legacy_count INT;
BEGIN
  -- ── 1. Verify prerequisite tables & primary keys ──────────────────────────
  SELECT pg_get_constraintdef(con.oid)
    INTO v_notnote_pk_def
  FROM pg_constraint con
  JOIN pg_class c ON c.oid = con.conrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relname = 'NotNote'
    AND con.contype = 'p';

  IF v_notnote_pk_def IS DISTINCT FROM 'PRIMARY KEY (id)' THEN
    RAISE EXCEPTION 'Migration 006 rollback precondition failed: "NotNote" primary key mismatch (found: %)', v_notnote_pk_def;
  END IF;

  SELECT pg_get_constraintdef(con.oid)
    INTO v_legacy_pk_def
  FROM pg_constraint con
  JOIN pg_class c ON c.oid = con.conrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relname = 'Youniverse'
    AND con.contype = 'p';

  IF v_legacy_pk_def IS DISTINCT FROM 'PRIMARY KEY (id)' THEN
    RAISE EXCEPTION 'Migration 006 rollback precondition failed: legacy "Youniverse" primary key mismatch (found: %)', v_legacy_pk_def;
  END IF;

  -- ── 2. Data-preservation guard: refuse rollback if Neon-only rows exist ───
  SELECT COUNT(*)
    INTO v_unmatched_legacy_count
  FROM public."NotNote" nn
  LEFT JOIN public."Youniverse" y
    ON y.id = nn."youniverseId"
  WHERE y.id IS NULL;

  IF v_unmatched_legacy_count > 0 THEN
    RAISE EXCEPTION 'Migration 006 rollback blocked: % "NotNote" record(s) reference Neon-first identities not present in legacy "Youniverse"(id). Preserve or archive those records before rolling back.', v_unmatched_legacy_count;
  END IF;

  -- ── 3. Restore legacy foreign key ─────────────────────────────────────────
  SELECT pg_get_constraintdef(con.oid)
    INTO v_identity_fk_def
  FROM pg_constraint con
  JOIN pg_class c ON c.oid = con.conrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relname = 'NotNote'
    AND con.conname = 'NotNote_youniverseId_identity_fkey'
    AND con.contype = 'f';

  SELECT pg_get_constraintdef(con.oid)
    INTO v_legacy_fk_def
  FROM pg_constraint con
  JOIN pg_class c ON c.oid = con.conrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relname = 'NotNote'
    AND con.conname = 'NotNote_youniverseId_fkey'
    AND con.contype = 'f';

  IF v_identity_fk_def IS NOT NULL THEN
    ALTER TABLE public."NotNote"
      DROP CONSTRAINT "NotNote_youniverseId_identity_fkey";
  END IF;

  IF v_legacy_fk_def IS NULL THEN
    ALTER TABLE public."NotNote"
      ADD CONSTRAINT "NotNote_youniverseId_fkey"
      FOREIGN KEY ("youniverseId")
      REFERENCES public."Youniverse"(id)
      ON UPDATE CASCADE
      ON DELETE CASCADE;
  END IF;

  -- ── 4. Verify postcondition ───────────────────────────────────────────────
  SELECT pg_get_constraintdef(con.oid)
    INTO v_legacy_fk_def
  FROM pg_constraint con
  JOIN pg_class c ON c.oid = con.conrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relname = 'NotNote'
    AND con.conname = 'NotNote_youniverseId_fkey'
    AND con.contype = 'f';

  IF v_legacy_fk_def IS DISTINCT FROM 'FOREIGN KEY ("youniverseId") REFERENCES "Youniverse"(id) ON UPDATE CASCADE ON DELETE CASCADE' THEN
    RAISE EXCEPTION 'Migration 006 rollback postcondition failed: "NotNote_youniverseId_fkey" was not restored (found: %)', v_legacy_fk_def;
  END IF;
END
$$;

COMMIT;
