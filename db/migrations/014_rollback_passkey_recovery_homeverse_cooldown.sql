-- =============================================================================
-- Migration 014 Rollback: Passkey Credential Store, Recovery Codes & Relinquishments
--
-- STATUS: PROPOSED DESIGN — NOT EXECUTED
-- Guarded rollback: strictly REFUSES to roll back if active passkey, recovery,
-- or Homeverse relinquishment records exist (unless explicitly cleaned in staging).
-- =============================================================================
BEGIN;
DO $$
DECLARE v_recovery_cases INT := 0;
v_relinquishments INT := 0;
v_recovery_codes INT := 0;
v_relinquished_assocs INT := 0;
v_webauthn_subjects INT := 0;
BEGIN IF to_regclass('public.manual_recovery_cases') IS NOT NULL THEN
SELECT COUNT(*)::int INTO v_recovery_cases
FROM public.manual_recovery_cases;
END IF;
IF to_regclass('public.homeverse_relinquishments') IS NOT NULL THEN
SELECT COUNT(*)::int INTO v_relinquishments
FROM public.homeverse_relinquishments;
END IF;
IF to_regclass('public.human_recovery_codes') IS NOT NULL THEN
SELECT COUNT(*)::int INTO v_recovery_codes
FROM public.human_recovery_codes;
END IF;
IF to_regclass('public.human_youniverse_associations') IS NOT NULL THEN
SELECT COUNT(*)::int INTO v_relinquished_assocs
FROM public.human_youniverse_associations
WHERE verification_status = 'relinquished';
END IF;
IF to_regclass('public.human_auth_subjects') IS NOT NULL THEN
SELECT COUNT(*)::int INTO v_webauthn_subjects
FROM public.human_auth_subjects
WHERE provider_type = 'webauthn';
END IF;
IF v_recovery_cases > 0
OR v_relinquishments > 0
OR v_recovery_codes > 0
OR v_relinquished_assocs > 0
OR v_webauthn_subjects > 0 THEN RAISE EXCEPTION 'ROLLBACK ABORTED: Cannot roll back Migration 014 because active data exists (recovery_cases: %, relinquishments: %, recovery_codes: %, relinquished_associations: %, webauthn_subjects: %).',
v_recovery_cases,
v_relinquishments,
v_recovery_codes,
v_relinquished_assocs,
v_webauthn_subjects;
END IF;
END $$;
-- 1. Revert verification_status constraint
ALTER TABLE public.human_youniverse_associations DROP CONSTRAINT IF EXISTS hya_verification_status_check,
  DROP CONSTRAINT IF EXISTS human_youniverse_associations_verification_status_check;
ALTER TABLE public.human_youniverse_associations
ADD CONSTRAINT hya_verification_status_check CHECK (
    verification_status IN (
      'provisional',
      'verified',
      'suspended',
      'revoked'
    )
  );
-- 2. Drop manual_recovery_cases table (added in 014 step 6)
DROP TABLE IF EXISTS public.manual_recovery_cases RESTRICT;
-- 3. Drop homeverse_relinquishments table
DROP TABLE IF EXISTS public.homeverse_relinquishments RESTRICT;
-- 4. Drop human_recovery_codes table
DROP TABLE IF EXISTS public.human_recovery_codes RESTRICT;
-- 5. Preserve human_passkeys and webauthn_challenges.consumed_at (owned by Migration 012)
-- 6. Revert provider_type constraint
ALTER TABLE public.human_auth_subjects DROP CONSTRAINT IF EXISTS human_auth_subjects_provider_type_check;
ALTER TABLE public.human_auth_subjects
ADD CONSTRAINT human_auth_subjects_provider_type_check CHECK (
    provider_type IN ('password', 'passkey', 'email_link')
  );
COMMIT;