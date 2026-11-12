-- =============================================================================
-- Migration 008: Genesis 001 — First Person of The Youniverse
--
-- Tables:
--   - public.genesis_program_state
--   - public.genesis_awards
--   - public.identity_entitlements
--
-- Guarantees:
--   1. Write-once activation boundary & immutable eligibility cutoff (NOW()).
--   2. Singleton physical PK ('genesis_001') permitting at most ONE award.
--   3. DB-enforced eligibility predicate (post-activation verified production
--      person identity, excluding internal/synthetic test email addresses).
--   4. Immutable historical award fields & monotonic ceremony acknowledgment.
--   5. Orthogonal lifetime entitlement ledger independent of identities.plan,
--      Stripe subscriptions, and Founding Angels memberships.
-- =============================================================================

BEGIN;

-- Precondition checks against authoritative Neon tables
DO $$
BEGIN
  IF to_regclass('public.youniverse_identities') IS NULL THEN
    RAISE EXCEPTION 'Migration 008 precondition failed: public.youniverse_identities does not exist';
  END IF;
  IF to_regclass('public.email_verification_tokens') IS NULL THEN
    RAISE EXCEPTION 'Migration 008 precondition failed: public.email_verification_tokens does not exist';
  END IF;
END
$$;

-- =============================================================================
-- 1. TABLE: public.genesis_program_state (Write-Once Activation Boundary)
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.genesis_program_state (
  program_key TEXT PRIMARY KEY
    CONSTRAINT genesis_program_state_key_check CHECK (program_key = 'genesis_001'),
  official_title TEXT NOT NULL DEFAULT 'FIRST PERSON OF THE YOUNIVERSE'
    CONSTRAINT genesis_program_state_title_check CHECK (
      official_title = 'FIRST PERSON OF THE YOUNIVERSE'
    ),
  official_designation TEXT NOT NULL DEFAULT 'GENESIS 001'
    CONSTRAINT genesis_program_state_designation_check CHECK (
      official_designation = 'GENESIS 001'
    ),
  is_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  activated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  eligible_verified_after TIMESTAMPTZ NOT NULL DEFAULT NOW()
    CONSTRAINT genesis_program_state_cutoff_floor_check CHECK (
      eligible_verified_after >= TIMESTAMPTZ '2026-11-12T01:47:35Z'
    ),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Initialize write-once activation boundary from DB server clock (never client-supplied)
INSERT INTO public.genesis_program_state (program_key)
VALUES ('genesis_001')
ON CONFLICT (program_key) DO NOTHING;

-- Immutability guard: prevent deletion or retroactive movement of activation cutoff
CREATE OR REPLACE FUNCTION public.enforce_genesis_program_state_immutability()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'genesis_program_state row (%) cannot be deleted', OLD.program_key;
  END IF;

  IF NEW.program_key IS DISTINCT FROM OLD.program_key
     OR NEW.official_title IS DISTINCT FROM OLD.official_title
     OR NEW.official_designation IS DISTINCT FROM OLD.official_designation
     OR NEW.activated_at IS DISTINCT FROM OLD.activated_at
     OR NEW.eligible_verified_after IS DISTINCT FROM OLD.eligible_verified_after THEN
    RAISE EXCEPTION 'genesis_program_state boundary columns (program_key, official_title, official_designation, activated_at, eligible_verified_after) are permanently immutable';
  END IF;

  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_genesis_program_state_immutability
  ON public.genesis_program_state;

CREATE TRIGGER trg_enforce_genesis_program_state_immutability
  BEFORE UPDATE OR DELETE ON public.genesis_program_state
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_genesis_program_state_immutability();

-- =============================================================================
-- 2. HELPER FUNCTION: Database-level synthetic/internal email exclusion check
-- =============================================================================
CREATE OR REPLACE FUNCTION public.is_eligible_genesis_email(p_email TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_clean TEXT;
  v_local TEXT;
  v_domain TEXT;
  v_at_pos INTEGER;
BEGIN
  IF p_email IS NULL THEN
    RETURN FALSE;
  END IF;

  v_clean := lower(btrim(p_email));
  IF v_clean = '' THEN
    RETURN FALSE;
  END IF;

  v_at_pos := position('@' IN v_clean);
  IF v_at_pos <= 1 OR v_at_pos >= length(v_clean) THEN
    RETURN FALSE;
  END IF;

  v_local := substring(v_clean FROM 1 FOR v_at_pos - 1);
  v_domain := substring(v_clean FROM v_at_pos + 1);

  IF position('.' IN v_domain) = 0 OR v_domain = 'localhost' THEN
    RETURN FALSE;
  END IF;

  -- Exclude internal company domains and standard reserved/synthetic test domains
  IF v_domain = 'itsyouonline.com'
     OR v_domain LIKE '%.itsyouonline.com'
     OR v_domain IN ('example.com', 'example.org', 'example.net', 'test.com', 'mailinator.com')
     OR v_domain LIKE '%.example'
     OR v_domain LIKE '%.invalid'
     OR v_domain LIKE '%.local'
     OR v_domain LIKE '%.test' THEN
    RETURN FALSE;
  END IF;

  -- Exclude clearly automated/test subaddresses or synthetic smoke prefixes
  IF v_local ~ '\+(test|smoke|e2e|ci|autotest|dev)(?:$|[0-9_-])'
     OR v_local ~ '^(smoke[-_.]|e2e[-_.]|autotest[-_.]|ci[-_.])' THEN
    RETURN FALSE;
  END IF;

  RETURN TRUE;
END;
$$;

-- =============================================================================
-- 3. TABLE: public.genesis_awards (Singleton Historical Award Registry)
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.genesis_awards (
  award_slot TEXT PRIMARY KEY
    CONSTRAINT genesis_awards_singleton_slot_check CHECK (award_slot = 'genesis_001'),
  identity_id TEXT NOT NULL UNIQUE
    CONSTRAINT genesis_awards_identity_not_blank CHECK (btrim(identity_id) <> '')
    CONSTRAINT genesis_awards_identity_fkey
      REFERENCES public.youniverse_identities(identity_id) ON DELETE RESTRICT,
  awarded_username TEXT NOT NULL
    CONSTRAINT genesis_awards_username_not_blank CHECK (btrim(awarded_username) <> ''),
  official_title TEXT NOT NULL DEFAULT 'FIRST PERSON OF THE YOUNIVERSE'
    CONSTRAINT genesis_awards_title_check CHECK (
      official_title = 'FIRST PERSON OF THE YOUNIVERSE'
    ),
  award_label TEXT NOT NULL DEFAULT 'GENESIS 001'
    CONSTRAINT genesis_awards_label_check CHECK (award_label = 'GENESIS 001'),
  awarded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  verification_token_id TEXT NOT NULL UNIQUE
    CONSTRAINT genesis_awards_token_not_blank CHECK (btrim(verification_token_id) <> '')
    CONSTRAINT genesis_awards_token_fkey
      REFERENCES public.email_verification_tokens(id) ON DELETE RESTRICT,
  source_environment TEXT NOT NULL
    CONSTRAINT genesis_awards_prod_env_check CHECK (source_environment = 'production'),
  ceremony_seen_at TIMESTAMPTZ NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Eligibility verification BEFORE INSERT trigger
CREATE OR REPLACE FUNCTION public.verify_genesis_award_eligibility()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_program RECORD;
  v_identity RECORD;
  v_token RECORD;
BEGIN
  SELECT is_enabled, eligible_verified_after
    INTO v_program
  FROM public.genesis_program_state
  WHERE program_key = 'genesis_001';

  IF NOT FOUND OR v_program.is_enabled IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'Genesis 001 program is not active in genesis_program_state';
  END IF;

  SELECT identity_id, username, identity_type, email, is_live, email_verified_at
    INTO v_identity
  FROM public.youniverse_identities
  WHERE identity_id = NEW.identity_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Referenced identity (%) does not exist', NEW.identity_id;
  END IF;

  IF v_identity.is_live IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'Cannot award Genesis 001 to inactive identity (%)', NEW.identity_id;
  END IF;

  IF v_identity.identity_type IS DISTINCT FROM 'person' THEN
    RAISE EXCEPTION 'Cannot award Genesis 001 to non-person identity (%)', NEW.identity_id;
  END IF;

  IF v_identity.email_verified_at IS NULL THEN
    RAISE EXCEPTION 'Cannot award Genesis 001 before email verification (%)', NEW.identity_id;
  END IF;

  IF v_identity.email_verified_at < v_program.eligible_verified_after THEN
    RAISE EXCEPTION 'Identity (%) verified at (%) precedes Genesis activation cutoff (%)',
      NEW.identity_id, v_identity.email_verified_at, v_program.eligible_verified_after;
  END IF;

  IF NOT public.is_eligible_genesis_email(v_identity.email) THEN
    RAISE EXCEPTION 'Identity (%) email is excluded from Genesis 001 eligibility', NEW.identity_id;
  END IF;

  IF NEW.awarded_username IS DISTINCT FROM v_identity.username THEN
    RAISE EXCEPTION 'awarded_username (%) must match identity username (%)', NEW.awarded_username, v_identity.username;
  END IF;

  SELECT id, identity_id, consumed_at
    INTO v_token
  FROM public.email_verification_tokens
  WHERE id = NEW.verification_token_id;

  IF NOT FOUND
     OR v_token.identity_id IS DISTINCT FROM NEW.identity_id
     OR v_token.consumed_at IS NULL THEN
    RAISE EXCEPTION 'Genesis 001 requires a consumed email_verification_tokens record belonging to identity (%)', NEW.identity_id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_verify_genesis_award_eligibility
  ON public.genesis_awards;

CREATE TRIGGER trg_verify_genesis_award_eligibility
  BEFORE INSERT ON public.genesis_awards
  FOR EACH ROW
  EXECUTE FUNCTION public.verify_genesis_award_eligibility();

-- Immutability guard BEFORE UPDATE OR DELETE
CREATE OR REPLACE FUNCTION public.enforce_genesis_award_immutability()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'genesis_awards record (%) is permanent and cannot be deleted', OLD.award_slot;
  END IF;

  IF NEW.award_slot IS DISTINCT FROM OLD.award_slot
     OR NEW.identity_id IS DISTINCT FROM OLD.identity_id
     OR NEW.awarded_username IS DISTINCT FROM OLD.awarded_username
     OR NEW.official_title IS DISTINCT FROM OLD.official_title
     OR NEW.award_label IS DISTINCT FROM OLD.award_label
     OR NEW.awarded_at IS DISTINCT FROM OLD.awarded_at
     OR NEW.verification_token_id IS DISTINCT FROM OLD.verification_token_id
     OR NEW.source_environment IS DISTINCT FROM OLD.source_environment THEN
    RAISE EXCEPTION 'Immutable Genesis 001 award identity/historical columns cannot be modified';
  END IF;

  IF OLD.ceremony_seen_at IS NOT NULL
     AND NEW.ceremony_seen_at IS DISTINCT FROM OLD.ceremony_seen_at THEN
    RAISE EXCEPTION 'ceremony_seen_at is immutable once acknowledged';
  END IF;

  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_genesis_award_immutability
  ON public.genesis_awards;

CREATE TRIGGER trg_enforce_genesis_award_immutability
  BEFORE UPDATE OR DELETE ON public.genesis_awards
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_genesis_award_immutability();

-- =============================================================================
-- 4. TABLE: public.identity_entitlements (Orthogonal Lifetime Ledger)
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.identity_entitlements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  identity_id TEXT NOT NULL
    CONSTRAINT identity_entitlements_identity_not_blank CHECK (btrim(identity_id) <> '')
    CONSTRAINT identity_entitlements_identity_fkey
      REFERENCES public.youniverse_identities(identity_id) ON DELETE RESTRICT,
  entitlement_key TEXT NOT NULL
    CONSTRAINT identity_entitlements_key_check CHECK (
      entitlement_key IN ('genesis_lifetime_access')
    ),
  source_type TEXT NOT NULL
    CONSTRAINT identity_entitlements_source_type_check CHECK (
      source_type IN ('genesis_001', 'founding_angel', 'subscription')
    ),
  source_ref TEXT NOT NULL
    CONSTRAINT identity_entitlements_source_ref_not_blank CHECK (btrim(source_ref) <> ''),
  is_lifetime BOOLEAN NOT NULL DEFAULT FALSE,
  status TEXT NOT NULL DEFAULT 'active'
    CONSTRAINT identity_entitlements_status_check CHECK (
      status IN ('active', 'suspended', 'revoked')
    ),
  granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT identity_entitlements_unique_identity_source
    UNIQUE (identity_id, entitlement_key, source_type),
  CONSTRAINT identity_entitlements_lifetime_expiry_check CHECK (
    (is_lifetime = TRUE AND expires_at IS NULL)
    OR
    (is_lifetime = FALSE)
  ),
  CONSTRAINT identity_entitlements_genesis_invariant_check CHECK (
    source_type <> 'genesis_001'
    OR (
      entitlement_key = 'genesis_lifetime_access'
      AND source_ref = 'genesis_001'
      AND is_lifetime = TRUE
      AND status = 'active'
      AND expires_at IS NULL
    )
  )
);

-- Enforce singleton Genesis lifetime grant at the entitlement ledger layer as well
CREATE UNIQUE INDEX IF NOT EXISTS identity_entitlements_singleton_genesis_idx
  ON public.identity_entitlements (entitlement_key)
  WHERE source_type = 'genesis_001';

CREATE INDEX IF NOT EXISTS identity_entitlements_identity_idx
  ON public.identity_entitlements (identity_id, status);

-- Immutability & Genesis backing trigger for identity_entitlements
CREATE OR REPLACE FUNCTION public.enforce_genesis_entitlement_integrity()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_award_identity TEXT;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.source_type = 'genesis_001' THEN
      RAISE EXCEPTION 'Genesis 001 lifetime entitlement cannot be deleted';
    END IF;
    RETURN OLD;
  END IF;

  IF TG_OP = 'INSERT' AND NEW.source_type = 'genesis_001' THEN
    SELECT identity_id
      INTO v_award_identity
    FROM public.genesis_awards
    WHERE award_slot = 'genesis_001';

    IF NOT FOUND OR v_award_identity IS DISTINCT FROM NEW.identity_id THEN
      RAISE EXCEPTION 'Cannot grant genesis_lifetime_access without matching genesis_awards record for identity (%)', NEW.identity_id;
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.source_type = 'genesis_001' THEN
    IF NEW.identity_id IS DISTINCT FROM OLD.identity_id
       OR NEW.entitlement_key IS DISTINCT FROM OLD.entitlement_key
       OR NEW.source_type IS DISTINCT FROM OLD.source_type
       OR NEW.source_ref IS DISTINCT FROM OLD.source_ref
       OR NEW.is_lifetime IS DISTINCT FROM OLD.is_lifetime
       OR NEW.status IS DISTINCT FROM OLD.status
       OR NEW.granted_at IS DISTINCT FROM OLD.granted_at
       OR NEW.expires_at IS DISTINCT FROM OLD.expires_at THEN
      RAISE EXCEPTION 'Genesis 001 lifetime entitlement is permanent and immutable';
    END IF;
  END IF;

  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_genesis_entitlement_integrity
  ON public.identity_entitlements;

CREATE TRIGGER trg_enforce_genesis_entitlement_integrity
  BEFORE INSERT OR UPDATE OR DELETE ON public.identity_entitlements
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_genesis_entitlement_integrity();

COMMIT;

