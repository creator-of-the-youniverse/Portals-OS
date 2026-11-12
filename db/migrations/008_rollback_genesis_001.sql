-- =============================================================================
-- Migration 008 Rollback: Genesis 001
--
-- Guarded rollback: strictly REFUSES to drop tables or erase records if any
-- Genesis 001 award or Genesis lifetime entitlement has been minted.
-- =============================================================================

BEGIN;

DO $$
DECLARE
  v_award_count INTEGER := 0;
  v_entitlement_count INTEGER := 0;
BEGIN
  IF to_regclass('public.genesis_awards') IS NOT NULL THEN
    SELECT COUNT(*) INTO v_award_count FROM public.genesis_awards;
    IF v_award_count > 0 THEN
      RAISE EXCEPTION 'Rollback blocked: public.genesis_awards already contains % awarded row(s).', v_award_count;
    END IF;
  END IF;

  IF to_regclass('public.identity_entitlements') IS NOT NULL THEN
    SELECT COUNT(*) INTO v_entitlement_count
    FROM public.identity_entitlements
    WHERE source_type = 'genesis_001';
    IF v_entitlement_count > 0 THEN
      RAISE EXCEPTION 'Rollback blocked: public.identity_entitlements already contains % Genesis 001 row(s).', v_entitlement_count;
    END IF;
  END IF;
END
$$;

DROP TRIGGER IF EXISTS trg_enforce_genesis_entitlement_integrity ON public.identity_entitlements;
DROP TABLE IF EXISTS public.identity_entitlements;
DROP FUNCTION IF EXISTS public.enforce_genesis_entitlement_integrity();

DROP TRIGGER IF EXISTS trg_enforce_genesis_award_immutability ON public.genesis_awards;
DROP TRIGGER IF EXISTS trg_verify_genesis_award_eligibility ON public.genesis_awards;
DROP TABLE IF EXISTS public.genesis_awards;
DROP FUNCTION IF EXISTS public.enforce_genesis_award_immutability();
DROP FUNCTION IF EXISTS public.verify_genesis_award_eligibility();

DROP TRIGGER IF EXISTS trg_enforce_genesis_program_state_immutability ON public.genesis_program_state;
DROP TABLE IF EXISTS public.genesis_program_state;
DROP FUNCTION IF EXISTS public.enforce_genesis_program_state_immutability();

DROP FUNCTION IF EXISTS public.is_eligible_genesis_email(TEXT);

COMMIT;

