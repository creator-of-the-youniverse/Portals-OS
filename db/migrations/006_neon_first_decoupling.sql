-- =============================================================================
-- Migration 006: Neon-First Decoupling for "NotNote"
--
-- Purpose:
--   Re-points "NotNote"("youniverseId") foreign key from legacy shadow table
--   "Youniverse"(id) to authoritative Neon table youniverse_identities(identity_id).
--
-- Preconditions enforced (aborts transaction via RAISE EXCEPTION on any mismatch):
--   1. Enum "ArtifactState" exists with exact values:
--      ('PENDING', 'APPROVED', 'REJECTED', 'ARCHIVED_TO_BOOKS').
--   2. Table youniverse_identities exists with PRIMARY KEY (identity_id).
--   3. Table "NotNote" exists with exact expected columns, types, nullability,
--      defaults, PRIMARY KEY (id), and index "NotNote_youniverseId_idx".
--   4. Foreign key on "NotNote"("youniverseId") is either the expected legacy
--      "NotNote_youniverseId_fkey" -> "Youniverse"(id) or (on idempotent rerun)
--      "NotNote_youniverseId_identity_fkey" -> youniverse_identities(identity_id).
--   5. Every existing "NotNote" record has an unambiguous, direct match in
--      youniverse_identities(identity_id); zero orphaned or unmapped records exist.
--
-- Safeguards:
--   - Does NOT use CREATE TABLE IF NOT EXISTS as a substitute for validation.
--   - Does NOT silently remap records.
--   - Does NOT drop "User", "Youniverse", "Session", or "DeviceTrust".
--   - Fully transactional and idempotent on re-run.
-- =============================================================================

BEGIN;

DO $$
DECLARE
  v_enum_labels TEXT[];
  v_notnote_col_count INT;
  v_missing_cols INT;
  v_pkey_def TEXT;
  v_yi_pkey_def TEXT;
  v_idx_def TEXT;
  v_old_fk_def TEXT;
  v_new_fk_def TEXT;
  v_unmatched_count INT;
  v_dup_username_count INT;
BEGIN
  -- ── 1. Verify ArtifactState enum definition ─────────────────────────────────
  SELECT ARRAY_AGG(e.enumlabel ORDER BY e.enumsortorder)
    INTO v_enum_labels
  FROM pg_type t
  JOIN pg_enum e ON e.enumtypid = t.oid
  JOIN pg_namespace n ON n.oid = t.typnamespace
  WHERE n.nspname = 'public'
    AND t.typname = 'ArtifactState';

  IF v_enum_labels IS NULL OR v_enum_labels <> ARRAY['PENDING', 'APPROVED', 'REJECTED', 'ARCHIVED_TO_BOOKS'] THEN
    RAISE EXCEPTION 'Migration 006 precondition failed: "ArtifactState" enum definition mismatch (found: %)', v_enum_labels;
  END IF;

  -- ── 2. Verify youniverse_identities primary key ─────────────────────────────
  SELECT pg_get_constraintdef(con.oid)
    INTO v_yi_pkey_def
  FROM pg_constraint con
  JOIN pg_class c ON c.oid = con.conrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relname = 'youniverse_identities'
    AND con.contype = 'p';

  IF v_yi_pkey_def IS DISTINCT FROM 'PRIMARY KEY (identity_id)' THEN
    RAISE EXCEPTION 'Migration 006 precondition failed: youniverse_identities primary key mismatch (found: %)', v_yi_pkey_def;
  END IF;

  -- ── 3. Verify "NotNote" table columns, types, nullability, and defaults ─────
  SELECT COUNT(*)
    INTO v_notnote_col_count
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'NotNote';

  IF v_notnote_col_count <> 7 THEN
    RAISE EXCEPTION 'Migration 006 precondition failed: "NotNote" expected 7 columns, found %', v_notnote_col_count;
  END IF;

  SELECT COUNT(*)
    INTO v_missing_cols
  FROM (
    VALUES
      ('id',           'text',                        'text',          'NO'),
      ('youniverseId', 'text',                        'text',          'NO'),
      ('title',        'text',                        'text',          'NO'),
      ('content',      'jsonb',                       'jsonb',         'NO'),
      ('status',       'USER-DEFINED',                'ArtifactState', 'NO'),
      ('createdAt',    'timestamp without time zone', 'timestamp',     'NO'),
      ('updatedAt',    'timestamp without time zone', 'timestamp',     'NO')
  ) AS expected(col_name, data_type, udt_name, is_nullable)
  LEFT JOIN information_schema.columns c
    ON c.table_schema = 'public'
   AND c.table_name = 'NotNote'
   AND c.column_name = expected.col_name
   AND c.data_type = expected.data_type
   AND c.udt_name = expected.udt_name
   AND c.is_nullable = expected.is_nullable
  WHERE c.column_name IS NULL;

  IF v_missing_cols > 0 THEN
    RAISE EXCEPTION 'Migration 006 precondition failed: "NotNote" column schema does not match expected types/nullability';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'NotNote'
      AND column_name = 'status'
      AND column_default = '''PENDING''::"ArtifactState"'
  ) THEN
    RAISE EXCEPTION 'Migration 006 precondition failed: "NotNote".status default is not ''PENDING''::"ArtifactState"';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'NotNote'
      AND column_name = 'createdAt'
      AND column_default = 'CURRENT_TIMESTAMP'
  ) THEN
    RAISE EXCEPTION 'Migration 006 precondition failed: "NotNote"."createdAt" default is not CURRENT_TIMESTAMP';
  END IF;

  -- Verify "NotNote_pkey"
  SELECT pg_get_constraintdef(con.oid)
    INTO v_pkey_def
  FROM pg_constraint con
  JOIN pg_class c ON c.oid = con.conrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relname = 'NotNote'
    AND con.conname = 'NotNote_pkey'
    AND con.contype = 'p';

  IF v_pkey_def IS DISTINCT FROM 'PRIMARY KEY (id)' THEN
    RAISE EXCEPTION 'Migration 006 precondition failed: "NotNote_pkey" mismatch (found: %)', v_pkey_def;
  END IF;

  -- Verify "NotNote_youniverseId_idx"
  SELECT indexdef
    INTO v_idx_def
  FROM pg_indexes
  WHERE schemaname = 'public'
    AND tablename = 'NotNote'
    AND indexname = 'NotNote_youniverseId_idx';

  IF v_idx_def IS NULL THEN
    RAISE EXCEPTION 'Migration 006 precondition failed: index "NotNote_youniverseId_idx" is missing';
  END IF;

  -- ── 4. Verify existing foreign key state ────────────────────────────────────
  SELECT pg_get_constraintdef(con.oid)
    INTO v_old_fk_def
  FROM pg_constraint con
  JOIN pg_class c ON c.oid = con.conrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relname = 'NotNote'
    AND con.conname = 'NotNote_youniverseId_fkey'
    AND con.contype = 'f';

  SELECT pg_get_constraintdef(con.oid)
    INTO v_new_fk_def
  FROM pg_constraint con
  JOIN pg_class c ON c.oid = con.conrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relname = 'NotNote'
    AND con.conname = 'NotNote_youniverseId_identity_fkey'
    AND con.contype = 'f';

  IF v_old_fk_def IS NOT NULL THEN
    IF v_old_fk_def <> 'FOREIGN KEY ("youniverseId") REFERENCES "Youniverse"(id) ON UPDATE CASCADE ON DELETE CASCADE' THEN
      RAISE EXCEPTION 'Migration 006 precondition failed: unexpected definition for "NotNote_youniverseId_fkey": %', v_old_fk_def;
    END IF;
  ELSIF v_new_fk_def IS NOT NULL THEN
    IF v_new_fk_def <> 'FOREIGN KEY ("youniverseId") REFERENCES youniverse_identities(identity_id) ON UPDATE CASCADE ON DELETE CASCADE' THEN
      RAISE EXCEPTION 'Migration 006 precondition failed: unexpected definition for "NotNote_youniverseId_identity_fkey": %', v_new_fk_def;
    END IF;
  ELSE
    RAISE EXCEPTION 'Migration 006 precondition failed: neither "NotNote_youniverseId_fkey" nor "NotNote_youniverseId_identity_fkey" found on "NotNote"';
  END IF;

  -- ── 5. Verify data integrity (no orphaned or unmapped NotNote records) ──────
  SELECT COUNT(*)
    INTO v_dup_username_count
  FROM (
    SELECT LOWER(username)
    FROM youniverse_identities
    GROUP BY LOWER(username)
    HAVING COUNT(*) > 1
  ) dup;

  IF v_dup_username_count > 0 THEN
    RAISE EXCEPTION 'Migration 006 precondition failed: % duplicate case-insensitive username(s) found in youniverse_identities', v_dup_username_count;
  END IF;

  SELECT COUNT(*)
    INTO v_unmatched_count
  FROM "NotNote" nn
  LEFT JOIN youniverse_identities yi
    ON yi.identity_id = nn."youniverseId"
  WHERE yi.identity_id IS NULL;

  IF v_unmatched_count > 0 THEN
    RAISE EXCEPTION 'Migration 006 precondition failed: % "NotNote" record(s) do not have a direct matching youniverse_identities.identity_id. Aborting without silent remapping.', v_unmatched_count;
  END IF;

  -- ── 6. Replace Foreign Key ──────────────────────────────────────────────────
  IF v_old_fk_def IS NOT NULL THEN
    ALTER TABLE "NotNote"
      DROP CONSTRAINT "NotNote_youniverseId_fkey";
  END IF;

  IF v_new_fk_def IS NULL THEN
    ALTER TABLE "NotNote"
      ADD CONSTRAINT "NotNote_youniverseId_identity_fkey"
      FOREIGN KEY ("youniverseId")
      REFERENCES youniverse_identities(identity_id)
      ON UPDATE CASCADE
      ON DELETE CASCADE;
  END IF;

  -- ── 7. Verify postcondition ─────────────────────────────────────────────────
  SELECT pg_get_constraintdef(con.oid)
    INTO v_new_fk_def
  FROM pg_constraint con
  JOIN pg_class c ON c.oid = con.conrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relname = 'NotNote'
    AND con.conname = 'NotNote_youniverseId_identity_fkey'
    AND con.contype = 'f';

  IF v_new_fk_def IS DISTINCT FROM 'FOREIGN KEY ("youniverseId") REFERENCES youniverse_identities(identity_id) ON UPDATE CASCADE ON DELETE CASCADE' THEN
    RAISE EXCEPTION 'Migration 006 postcondition failed: "NotNote_youniverseId_identity_fkey" not properly established';
  END IF;
END
$$;

COMMIT;

