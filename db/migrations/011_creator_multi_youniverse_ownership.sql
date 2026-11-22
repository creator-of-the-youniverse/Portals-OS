-- =============================================================================
-- Migration 011: Creator Override — Multi-Youniverse Ownership
--
-- Tables:
--   - public.owner_accounts
--   - public.youniverse_owner_memberships
--   - public.creator_privilege_audit_log
--
-- Guarantees:
--   1. Separates human-level owner account principal (`owner_accounts`) from
--      individual Youniverse territories (`youniverse_identities`).
--   2. Allows one verified owner account (specifically the provisioned Creator)
--      to own multiple distinct Youniverse identities via
--      `youniverse_owner_memberships`, while keeping each Youniverse owned by
--      at most one active owner account (`UNIQUE (identity_id)`).
--   3. Enforces at the DB constraint layer that `is_creator = TRUE` can ONLY
--      be held by `creatoroftheyouniverse@itsyouonline.com`, AFTER email
--      verification and explicit server-side provisioning.
--   4. Records all Creator provisioning, privileged claims, and cross-subdomain
--      handoffs in an append-only immutable audit log.
--   5. Preserves all existing `001`–`010` tables, Genesis 001, Founding Angels,
--      and existing `youniverse_identities` records untouched.
-- =============================================================================
BEGIN;
-- Precondition checks against authoritative Neon tables
DO $$ BEGIN IF to_regclass('public.youniverse_identities') IS NULL THEN RAISE EXCEPTION 'Migration 011 precondition failed: public.youniverse_identities does not exist';
END IF;
IF to_regclass('public.sessions') IS NULL THEN RAISE EXCEPTION 'Migration 011 precondition failed: public.sessions does not exist';
END IF;
END $$;
-- =============================================================================
-- 1. TABLE: public.owner_accounts (Verified Human Owner Principal)
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.owner_accounts (
  account_id TEXT PRIMARY KEY CONSTRAINT owner_accounts_id_not_blank CHECK (btrim(account_id) <> ''),
  primary_email TEXT NOT NULL UNIQUE CONSTRAINT owner_accounts_email_format_check CHECK (
    primary_email = lower(btrim(primary_email))
    AND primary_email <> ''
    AND position('@' IN primary_email) > 1
  ),
  email_verified_at TIMESTAMPTZ NULL,
  is_creator BOOLEAN NOT NULL DEFAULT FALSE,
  creator_provisioned_at TIMESTAMPTZ NULL,
  creator_provisioned_by TEXT NULL,
  status TEXT NOT NULL DEFAULT 'active' CONSTRAINT owner_accounts_status_check CHECK (
    status IN ('active', 'suspended', 'revoked')
  ),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT owner_accounts_creator_invariant_check CHECK (
    is_creator = FALSE
    OR (
      primary_email = 'creatoroftheyouniverse@itsyouonline.com'
      AND email_verified_at IS NOT NULL
      AND creator_provisioned_at IS NOT NULL
      AND btrim(COALESCE(creator_provisioned_by, '')) <> ''
      AND status = 'active'
    )
  )
);
-- At most one active Creator entitlement row may ever exist
CREATE UNIQUE INDEX IF NOT EXISTS owner_accounts_singleton_creator_idx ON public.owner_accounts ((is_creator))
WHERE is_creator = TRUE;
-- =============================================================================
-- 2. TABLE: public.youniverse_owner_memberships (1 Account -> N Youniverses)
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.youniverse_owner_memberships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id TEXT NOT NULL CONSTRAINT youniverse_owner_memberships_account_fkey REFERENCES public.owner_accounts(account_id) ON DELETE RESTRICT,
  identity_id TEXT NOT NULL UNIQUE CONSTRAINT youniverse_owner_memberships_identity_fkey REFERENCES public.youniverse_identities(identity_id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'owner' CONSTRAINT youniverse_owner_memberships_role_check CHECK (role IN ('owner')),
  status TEXT NOT NULL DEFAULT 'active' CONSTRAINT youniverse_owner_memberships_status_check CHECK (
    status IN ('active', 'suspended', 'revoked')
  ),
  claim_source TEXT NOT NULL DEFAULT 'standard' CONSTRAINT youniverse_owner_memberships_claim_source_check CHECK (
    claim_source IN (
      'standard',
      'creator_override',
      'paid',
      'backfill'
    )
  ),
  verified_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS youniverse_owner_memberships_account_idx ON public.youniverse_owner_memberships (account_id, status);
-- =============================================================================
-- 3. TABLE: public.creator_privilege_audit_log (Append-Only Audit Trail)
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.creator_privilege_audit_log (
  event_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id TEXT NOT NULL CONSTRAINT creator_audit_account_fkey REFERENCES public.owner_accounts(account_id) ON DELETE RESTRICT,
  actor_session_id TEXT NULL,
  actor_identity_id TEXT NULL,
  target_identity_id TEXT NULL CONSTRAINT creator_audit_target_identity_fkey REFERENCES public.youniverse_identities(identity_id) ON DELETE RESTRICT,
  target_handle TEXT NOT NULL CONSTRAINT creator_audit_target_handle_not_blank CHECK (btrim(target_handle) <> ''),
  target_subdomain TEXT NOT NULL CONSTRAINT creator_audit_target_subdomain_not_blank CHECK (btrim(target_subdomain) <> ''),
  event_type TEXT NOT NULL CONSTRAINT creator_audit_event_type_check CHECK (
    event_type IN (
      'creator_entitlement_provisioned',
      'creator_privileged_claim',
      'creator_owner_handoff_issued'
    )
  ),
  runtime_environment TEXT NOT NULL CONSTRAINT creator_audit_runtime_env_check CHECK (
    runtime_environment IN ('production', 'development', 'test')
  ),
  ip_address TEXT NULL,
  user_agent TEXT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS creator_audit_account_created_idx ON public.creator_privilege_audit_log (account_id, created_at DESC);
CREATE INDEX IF NOT EXISTS creator_audit_target_identity_idx ON public.creator_privilege_audit_log (target_identity_id, created_at DESC);
CREATE OR REPLACE FUNCTION public.enforce_creator_audit_append_only() RETURNS TRIGGER LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'public.creator_privilege_audit_log is append-only; % is prohibited',
  TG_OP;
END;
$$;
DROP TRIGGER IF EXISTS trg_enforce_creator_audit_append_only ON public.creator_privilege_audit_log;
CREATE TRIGGER trg_enforce_creator_audit_append_only BEFORE
UPDATE
  OR DELETE ON public.creator_privilege_audit_log FOR EACH ROW EXECUTE FUNCTION public.enforce_creator_audit_append_only();
-- =============================================================================
-- 4. IDEMPOTENT BACKFILL OF EXISTING VERIFIED PERSON IDENTITIES
--    Note: Backfill NEVER sets is_creator = TRUE. Creator authorization must
--    be provisioned explicitly on the server after email verification.
-- =============================================================================
INSERT INTO public.owner_accounts (
    account_id,
    primary_email,
    email_verified_at,
    is_creator,
    status
  )
SELECT 'acct_' || md5(lower(btrim(yi.email))),
  lower(btrim(yi.email)),
  MIN(yi.email_verified_at),
  FALSE,
  'active'
FROM public.youniverse_identities yi
WHERE yi.identity_type = 'person'
  AND yi.email IS NOT NULL
  AND btrim(yi.email) <> ''
  AND position('@' IN lower(btrim(yi.email))) > 1
  AND yi.email_verified_at IS NOT NULL
GROUP BY lower(btrim(yi.email)) ON CONFLICT (primary_email) DO NOTHING;
INSERT INTO public.youniverse_owner_memberships (
    account_id,
    identity_id,
    role,
    status,
    claim_source,
    verified_at
  )
SELECT oa.account_id,
  yi.identity_id,
  'owner',
  'active',
  'backfill',
  yi.email_verified_at
FROM public.youniverse_identities yi
  JOIN public.owner_accounts oa ON oa.primary_email = lower(btrim(yi.email))
WHERE yi.identity_type = 'person'
  AND yi.email IS NOT NULL
  AND yi.email_verified_at IS NOT NULL ON CONFLICT (identity_id) DO NOTHING;
COMMIT;