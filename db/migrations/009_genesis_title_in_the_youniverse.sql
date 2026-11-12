-- =============================================================================
-- Migration 009: Update Genesis 001 Official Title
--   'FIRST PERSON OF THE YOUNIVERSE' -> 'FIRST PERSON IN THE YOUNIVERSE'
--
-- Preserves activated_at and eligible_verified_after boundaries untouched.
-- Aborts if any Genesis award already exists under the prior title.
-- =============================================================================

BEGIN;

DO $$
DECLARE
  v_award_count INTEGER := 0;
BEGIN
  SELECT COUNT(*) INTO v_award_count FROM public.genesis_awards;
  IF v_award_count > 0 THEN
    RAISE EXCEPTION 'Migration 009 aborted: public.genesis_awards already contains % row(s).', v_award_count;
  END IF;
END
$$;

ALTER TABLE public.genesis_program_state
  DROP CONSTRAINT IF EXISTS genesis_program_state_title_check;

ALTER TABLE public.genesis_program_state
  ALTER COLUMN official_title SET DEFAULT 'FIRST PERSON IN THE YOUNIVERSE';

ALTER TABLE public.genesis_program_state
  DISABLE TRIGGER trg_enforce_genesis_program_state_immutability;

UPDATE public.genesis_program_state
SET official_title = 'FIRST PERSON IN THE YOUNIVERSE',
    updated_at = NOW()
WHERE program_key = 'genesis_001';

ALTER TABLE public.genesis_program_state
  ENABLE TRIGGER trg_enforce_genesis_program_state_immutability;

ALTER TABLE public.genesis_program_state
  ADD CONSTRAINT genesis_program_state_title_check CHECK (
    official_title = 'FIRST PERSON IN THE YOUNIVERSE'
  );

ALTER TABLE public.genesis_awards
  DROP CONSTRAINT IF EXISTS genesis_awards_title_check;

ALTER TABLE public.genesis_awards
  ALTER COLUMN official_title SET DEFAULT 'FIRST PERSON IN THE YOUNIVERSE';

ALTER TABLE public.genesis_awards
  ADD CONSTRAINT genesis_awards_title_check CHECK (
    official_title = 'FIRST PERSON IN THE YOUNIVERSE'
  );

COMMIT;

