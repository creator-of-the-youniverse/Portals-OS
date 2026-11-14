-- =============================================================================
-- Migration 010: Founding Angels Platform Setup Prerequisite
--
-- Tables:
--   - public.founding_angels_platform_setup
--
-- Guarantees:
--   1. Authoritative, singleton platform setup gate ('founding_angels') required
--      before Genesis 001 allocation can occur.
--   2. Enforces explicit completion state (`is_completed = TRUE` and `completed_at IS NOT NULL`).
--   3. Guarantees fail-closed behavior across all environments until setup is explicitly recorded.
-- =============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.founding_angels_platform_setup (
  setup_key TEXT PRIMARY KEY
    CONSTRAINT founding_angels_platform_setup_key_check CHECK (setup_key = 'founding_angels'),
  is_completed BOOLEAN NOT NULL DEFAULT FALSE,
  completed_at TIMESTAMPTZ NULL,
  completed_by TEXT NULL,
  notes TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT founding_angels_platform_setup_completed_consistency CHECK (
    (is_completed = FALSE AND completed_at IS NULL) OR
    (is_completed = TRUE AND completed_at IS NOT NULL)
  )
);

-- Initialize singleton uncompleted gate (fails closed)
INSERT INTO public.founding_angels_platform_setup (setup_key, is_completed, notes)
VALUES ('founding_angels', FALSE, 'Platform setup initialization gate')
ON CONFLICT (setup_key) DO NOTHING;

COMMIT;
