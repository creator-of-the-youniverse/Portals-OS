-- =============================================================================
-- Migration 011 Rollback: Creator Override — Multi-Youniverse Ownership
--
-- Guarded rollback: strictly REFUSES to drop tables if privileged Creator
-- claims or multi-Youniverse ownership records already exist.
-- =============================================================================

BEGIN;

SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '15s';

DO $$
DECLARE
  v_prov_events INTEGER := 0;
  v_priv_claims INTEGER := 0;
  v_audit_events INTEGER := 0;
  v_creator_accounts INTEGER := 0;
  v_creator_memberships INTEGER := 0;
BEGIN
  IF to_regclass('public.creator_privilege_audit_log') IS NOT NULL THEN
    SELECT COUNT(*)::int INTO v_prov_events
    FROM public.creator_privilege_audit_log
    WHERE event_type = 'creator_entitlement_provisioned';

    IF v_prov_events > 0 THEN
      RAISE EXCEPTION 'Rollback blocked: public.creator_privilege_audit_log contains % Creator provisioning audit event(s).', v_prov_events;
    END IF;

    SELECT COUNT(*)::int INTO v_priv_claims
    FROM public.creator_privilege_audit_log
    WHERE event_type = 'creator_privileged_claim';

    IF v_priv_claims > 0 THEN
      RAISE EXCEPTION 'Rollback blocked: public.creator_privilege_audit_log contains % Creator privileged claim event(s).', v_priv_claims;
    END IF;

    SELECT COUNT(*)::int INTO v_audit_events
    FROM public.creator_privilege_audit_log;

    IF v_audit_events > 0 THEN
      RAISE EXCEPTION 'Rollback blocked: public.creator_privilege_audit_log contains % Creator audit event(s).', v_audit_events;
    END IF;
  END IF;

  IF to_regclass('public.owner_accounts') IS NOT NULL THEN
    SELECT COUNT(*)::int INTO v_creator_accounts
    FROM public.owner_accounts
    WHERE is_creator = TRUE
       OR creator_provisioned_at IS NOT NULL;

    IF v_creator_accounts > 0 THEN
      RAISE EXCEPTION 'Rollback blocked: public.owner_accounts contains % provisioned Creator account(s) (is_creator = TRUE).', v_creator_accounts;
    END IF;
  END IF;

  IF to_regclass('public.youniverse_owner_memberships') IS NOT NULL THEN
    IF to_regclass('public.owner_accounts') IS NOT NULL THEN
      SELECT COUNT(*)::int INTO v_creator_memberships
      FROM public.youniverse_owner_memberships m
      LEFT JOIN public.owner_accounts oa
        ON oa.account_id = m.account_id
      WHERE m.claim_source = 'creator_override'
         OR oa.is_creator = TRUE;
    ELSE
      SELECT COUNT(*)::int INTO v_creator_memberships
      FROM public.youniverse_owner_memberships m
      WHERE m.claim_source = 'creator_override';
    END IF;

    IF v_creator_memberships > 0 THEN
      RAISE EXCEPTION 'Rollback blocked: public.youniverse_owner_memberships contains % Creator-created or Creator-owned membership(s).', v_creator_memberships;
    END IF;
  END IF;
END
$$;

DROP TRIGGER IF EXISTS trg_enforce_creator_audit_append_only ON public.creator_privilege_audit_log;
DROP TABLE IF EXISTS public.creator_privilege_audit_log RESTRICT;
DROP FUNCTION IF EXISTS public.enforce_creator_audit_append_only() RESTRICT;

DROP INDEX IF EXISTS public.youniverse_owner_memberships_account_idx;
DROP TABLE IF EXISTS public.youniverse_owner_memberships RESTRICT;

DROP INDEX IF EXISTS public.owner_accounts_singleton_creator_idx;
DROP TABLE IF EXISTS public.owner_accounts RESTRICT;

COMMIT;
