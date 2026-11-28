-- =============================================================================
-- Migration 015: Reconcile handoff_tokens Foreign Key & Column Type
--
-- Purpose:
--   1. Remove stale legacy FK (handoff_tokens_handle_fkey -> public.handles)
--      present in drifted environments where pre-005 tables existed before 005.
--   2. Widen handoff_tokens.handle from VARCHAR(32) to TEXT to align with
--      public.youniverse_identities.username (supports up to 50-char handles).
--   3. Ensure idx_handoff_handle index exists for FK cascades.
--   4. Guard against orphaned handoff_tokens rows before adding canonical FK.
--   5. Enforce canonical FK referencing public.youniverse_identities(username)
--      with ON UPDATE CASCADE ON DELETE CASCADE.
--
-- Non-destructive:
--   Preserves public.handles and all existing identity/ownership tables intact.
-- =============================================================================

BEGIN;

-- 1. Remove stale legacy FK (Staging) or prior canonical FK (idempotent re-run)
ALTER TABLE public.handoff_tokens
  DROP CONSTRAINT IF EXISTS handoff_tokens_handle_fkey;

ALTER TABLE public.handoff_tokens
  DROP CONSTRAINT IF EXISTS handoff_tokens_handle_youniverse_fkey;

-- 2. Align column type with canonical public.youniverse_identities.username (TEXT; supports 50-char handles)
ALTER TABLE public.handoff_tokens
  ALTER COLUMN handle TYPE TEXT;

-- 3. Ensure supporting btree index on handle for FK cascades
CREATE INDEX IF NOT EXISTS idx_handoff_handle
  ON public.handoff_tokens (handle);

-- 4. Orphan-row guard: abort cleanly if any handoff_tokens row lacks a canonical identity
DO $$
DECLARE
  v_orphan_count INTEGER := 0;
BEGIN
  SELECT COUNT(*)::INTEGER INTO v_orphan_count
  FROM public.handoff_tokens ht
  LEFT JOIN public.youniverse_identities yi
    ON yi.username = ht.handle
  WHERE yi.username IS NULL;

  IF v_orphan_count > 0 THEN
    RAISE EXCEPTION 'MIGRATION 015 ABORTED: % orphaned row(s) in public.handoff_tokens have no matching public.youniverse_identities(username).',
      v_orphan_count;
  END IF;
END $$;

-- 5. Enforce canonical referential integrity against public.youniverse_identities(username)
ALTER TABLE public.handoff_tokens
  ADD CONSTRAINT handoff_tokens_handle_youniverse_fkey
  FOREIGN KEY (handle)
  REFERENCES public.youniverse_identities(username)
  ON UPDATE CASCADE
  ON DELETE CASCADE;

COMMIT;
