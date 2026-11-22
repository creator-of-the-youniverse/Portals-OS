-- =============================================================================
-- Migration 012 Rollback: Safe Rollback for Human Continuity Credentials
--
-- STATUS: PROPOSED DESIGN — NOT EXECUTED
-- Implementation Authorization Boundary: This rollback script is authored for
-- review and local testing only. No database writes or DDL executions have been performed.
--
-- Rollback and Data-Survival Safety Contract:
--  1. Pre-cutover: If the migration was executed in test/staging before any live credentials
--     or associations were written, tables are dropped safely.
--  2. Post-cutover Guard: If human_continuity_identities or human_passwords contains
--     active user records, this rollback ABORTS with an exception to prevent catastrophic
--     loss of human continuity identities or user credentials.
--  3. Data Survival Invariant: Never drop youniverse_identities or sessions.
-- =============================================================================

BEGIN;

DO $$
DECLARE
  v_human_count INT := 0;
  v_subject_count INT := 0;
  v_password_count INT := 0;
  v_passkey_count INT := 0;
  v_assoc_count INT := 0;
  v_session_count INT := 0;
  v_challenge_count INT := 0;
BEGIN
  -- Ensure Migration 014 dependents are rolled back first
  IF to_regclass('public.manual_recovery_cases') IS NOT NULL
     OR to_regclass('public.homeverse_relinquishments') IS NOT NULL
     OR to_regclass('public.human_recovery_codes') IS NOT NULL THEN
    RAISE EXCEPTION 'ROLLBACK ABORTED: Migration 014 tables still exist. Execute 014_rollback_passkey_recovery_homeverse_cooldown.sql before rolling back Migration 012.';
  END IF;

  -- Check for live data in new tables and columns before proceeding
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'human_continuity_identities') THEN
    SELECT COUNT(*) INTO v_human_count FROM public.human_continuity_identities;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'human_auth_subjects') THEN
    SELECT COUNT(*) INTO v_subject_count FROM public.human_auth_subjects;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'human_passwords') THEN
    SELECT COUNT(*) INTO v_password_count FROM public.human_passwords;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'human_passkeys') THEN
    SELECT COUNT(*) INTO v_passkey_count FROM public.human_passkeys;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'human_youniverse_associations') THEN
    SELECT COUNT(*) INTO v_assoc_count FROM public.human_youniverse_associations;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'webauthn_challenges') THEN
    SELECT COUNT(*) INTO v_challenge_count FROM public.webauthn_challenges;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'sessions' AND column_name = 'human_id'
  ) THEN
    SELECT COUNT(*) INTO v_session_count FROM public.sessions WHERE human_id IS NOT NULL OR auth_subject_id IS NOT NULL;
  END IF;

  -- Abort if live user data would be destroyed
  IF v_human_count > 0
     OR v_subject_count > 0
     OR v_password_count > 0
     OR v_passkey_count > 0
     OR v_assoc_count > 0
     OR v_session_count > 0
     OR v_challenge_count > 0 THEN
    RAISE EXCEPTION 'ROLLBACK ABORTED: Cannot drop human continuity tables because active data exists (humans: %, subjects: %, passwords: %, passkeys: %, associations: %, sessions: %, challenges: %). Perform application-level fallback instead.',
      v_human_count, v_subject_count, v_password_count, v_passkey_count, v_assoc_count, v_session_count, v_challenge_count;
  END IF;
END $$;

-- Drop ephemeral/cache tables
DROP TABLE IF EXISTS public.webauthn_challenges RESTRICT;
DROP TABLE IF EXISTS public.human_password_resets RESTRICT;

-- Drop association and credential tables
DROP TABLE IF EXISTS public.human_passkeys RESTRICT;
DROP TABLE IF EXISTS public.human_passwords RESTRICT;
DROP TABLE IF EXISTS public.human_youniverse_associations RESTRICT;
DROP TABLE IF EXISTS public.human_auth_subjects RESTRICT;
DROP TABLE IF EXISTS public.human_continuity_identities RESTRICT;

-- Drop additive session indexes and columns
DROP INDEX IF EXISTS public.sessions_human_id_idx;
ALTER TABLE public.sessions
  DROP COLUMN IF EXISTS auth_subject_id,
  DROP COLUMN IF EXISTS human_id;

COMMIT;
