-- =============================================================================
-- Migration 015 Rollback: Remove canonical handoff_tokens_handle_youniverse_fkey
--
-- Notes:
--   - Drops the canonical FK constraint added in Migration 015.
--   - Retains handoff_tokens.handle as TEXT (not narrowed back to VARCHAR(32))
--     so any handles > 32 characters cannot be truncated on rollback.
--   - Retains idx_handoff_handle index (non-destructive, additive performance index).
--   - Does NOT re-add legacy handoff_tokens_handle_fkey -> public.handles(handle),
--     as public.handles is deprecated and disconnected from live identity claims.
-- =============================================================================

BEGIN;

ALTER TABLE public.handoff_tokens
  DROP CONSTRAINT IF EXISTS handoff_tokens_handle_youniverse_fkey;

COMMIT;
