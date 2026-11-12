-- =============================================================================
-- Migration 007 Rollback: Founding Angels MVP Pre-Traffic Removal
-- Phase: 13B.1.50
-- Pre-conditions: ZERO rows in public.founding_angel_orders and public.founding_angel_memberships
-- Strict: public schema-scoped, table-scoped, RESTRICT drop mode (no CASCADE)
-- =============================================================================

BEGIN;

-- Lock and statement timeouts for rollback transaction
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '15s';
SET LOCAL idle_in_transaction_session_timeout = '10s';

-- 1. Automated Data-Loss Abort Guard
DO $$
DECLARE
  v_orders_cnt INTEGER := 0;
  v_memberships_cnt INTEGER := 0;
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'founding_angel_orders' AND c.relkind = 'r'
  ) THEN
    SELECT count(*)::int INTO v_orders_cnt FROM public.founding_angel_orders;
    IF v_orders_cnt > 0 THEN
      RAISE EXCEPTION 'CRITICAL SAFETY VIOLATION: Pre-traffic rollback aborted! Table public.founding_angel_orders contains % records. Financial and customer records exist. Data must be preserved; manual forward repair required.', v_orders_cnt;
    END IF;
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'founding_angel_memberships' AND c.relkind = 'r'
  ) THEN
    SELECT count(*)::int INTO v_memberships_cnt FROM public.founding_angel_memberships;
    IF v_memberships_cnt > 0 THEN
      RAISE EXCEPTION 'CRITICAL SAFETY VIOLATION: Pre-traffic rollback aborted! Table public.founding_angel_memberships contains % records. Memberships exist. Data must be preserved; manual forward repair required.', v_memberships_cnt;
    END IF;
  END IF;
END;
$$;

-- 2. Drop Triggers with schema and table verification
DO $$
BEGIN
  -- Trigger 1: trg_enforce_founding_angel_membership_immutability on public.founding_angel_memberships
  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_trigger t
    JOIN pg_catalog.pg_class c ON c.oid = t.tgrelid
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'founding_angel_memberships'
      AND t.tgname = 'trg_enforce_founding_angel_membership_immutability'
      AND NOT t.tgisinternal
  ) THEN
    DROP TRIGGER trg_enforce_founding_angel_membership_immutability ON public.founding_angel_memberships;
  END IF;

  -- Trigger 2: trg_assign_founding_angel_member_number on public.founding_angel_memberships
  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_trigger t
    JOIN pg_catalog.pg_class c ON c.oid = t.tgrelid
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'founding_angel_memberships'
      AND t.tgname = 'trg_assign_founding_angel_member_number'
      AND NOT t.tgisinternal
  ) THEN
    DROP TRIGGER trg_assign_founding_angel_member_number ON public.founding_angel_memberships;
  END IF;

  -- Trigger 3: trg_enforce_founding_angel_order_immutability on public.founding_angel_orders
  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_trigger t
    JOIN pg_catalog.pg_class c ON c.oid = t.tgrelid
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'founding_angel_orders'
      AND t.tgname = 'trg_enforce_founding_angel_order_immutability'
      AND NOT t.tgisinternal
  ) THEN
    DROP TRIGGER trg_enforce_founding_angel_order_immutability ON public.founding_angel_orders;
  END IF;
END;
$$;

-- 3. Drop Foreign Key Constraints explicitly before dropping tables
DO $$
BEGIN
  -- FK 1: founding_angel_memberships_order_identity_fk on public.founding_angel_memberships
  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint c
    JOIN pg_catalog.pg_class cl ON cl.oid = c.conrelid
    JOIN pg_catalog.pg_namespace n ON n.oid = cl.relnamespace
    WHERE n.nspname = 'public' AND cl.relname = 'founding_angel_memberships'
      AND c.conname = 'founding_angel_memberships_order_identity_fk'
      AND c.contype = 'f'
  ) THEN
    ALTER TABLE public.founding_angel_memberships DROP CONSTRAINT founding_angel_memberships_order_identity_fk;
  END IF;

  -- FK 2: founding_angel_memberships_identity_id_fkey on public.founding_angel_memberships
  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint c
    JOIN pg_catalog.pg_class cl ON cl.oid = c.conrelid
    JOIN pg_catalog.pg_namespace n ON n.oid = cl.relnamespace
    WHERE n.nspname = 'public' AND cl.relname = 'founding_angel_memberships'
      AND c.conname = 'founding_angel_memberships_identity_id_fkey'
      AND c.contype = 'f'
  ) THEN
    ALTER TABLE public.founding_angel_memberships DROP CONSTRAINT founding_angel_memberships_identity_id_fkey;
  END IF;

  -- FK 3: founding_angel_orders_identity_id_fkey on public.founding_angel_orders
  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint c
    JOIN pg_catalog.pg_class cl ON cl.oid = c.conrelid
    JOIN pg_catalog.pg_namespace n ON n.oid = cl.relnamespace
    WHERE n.nspname = 'public' AND cl.relname = 'founding_angel_orders'
      AND c.conname = 'founding_angel_orders_identity_id_fkey'
      AND c.contype = 'f'
  ) THEN
    ALTER TABLE public.founding_angel_orders DROP CONSTRAINT founding_angel_orders_identity_id_fkey;
  END IF;
END;
$$;

-- 4. Drop Tables explicitly with RESTRICT (child table first, then parent)
DROP TABLE IF EXISTS public.founding_angel_memberships RESTRICT;
DROP TABLE IF EXISTS public.founding_angel_orders RESTRICT;

-- 5. Drop Functions with exact signatures and RESTRICT
DROP FUNCTION IF EXISTS public.transition_founding_angel_membership(p_order_id uuid, p_new_status text, p_reason text, p_dispute_id text) RESTRICT;
DROP FUNCTION IF EXISTS public.enforce_founding_angel_membership_immutability() RESTRICT;
DROP FUNCTION IF EXISTS public.assign_and_verify_founding_angel_member_number() RESTRICT;
DROP FUNCTION IF EXISTS public.enforce_founding_angel_order_immutability() RESTRICT;

COMMIT;

