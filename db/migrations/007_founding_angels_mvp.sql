-- =============================================================================
-- Migration 007: Founding Angels MVP
-- Phase: 13B.1.12
-- Tables: public.founding_angel_orders, public.founding_angel_memberships
-- Triggers: 3 (member numbering, order immutability, membership immutability)
-- Approved: Phase 13B.1.12 specification — DO NOT MODIFY WITHOUT REVIEW
-- =============================================================================

BEGIN;

-- =============================================================================
-- 1. TABLE: public.founding_angel_orders
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.founding_angel_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  identity_id TEXT NOT NULL
    CONSTRAINT founding_angel_orders_identity_id_not_blank CHECK (btrim(identity_id) <> '')
    CONSTRAINT founding_angel_orders_identity_id_fkey
      REFERENCES public.youniverse_identities(identity_id) ON DELETE RESTRICT,
  amount_cents INTEGER NOT NULL DEFAULT 20000
    CONSTRAINT founding_angel_orders_amount_check CHECK (amount_cents = 20000),
  currency TEXT NOT NULL DEFAULT 'usd'
    CONSTRAINT founding_angel_orders_currency_check CHECK (currency = 'usd'),
  livemode BOOLEAN NOT NULL,

  -- Primary lifecycle status
  status TEXT NOT NULL
    CONSTRAINT founding_angel_orders_status_check CHECK (
      status IN (
        'creating_session',
        'open',
        'paid',
        'expired',
        'partially_refunded',
        'refunded',
        'disputed',
        'chargeback_lost'
      )
    ),

  -- Immutable payment-time fulfillment classification
  fulfillment_disposition TEXT NULL
    CONSTRAINT founding_angel_orders_fulfillment_disposition_check CHECK (
      fulfillment_disposition IS NULL OR fulfillment_disposition IN (
        'membership_granted',
        'refund_required_overflow',
        'refund_required_duplicate'
      )
    ),

  -- Separated refund & chargeback financial accounting
  charge_amount_refunded_cents INTEGER NOT NULL DEFAULT 0
    CONSTRAINT founding_angel_orders_charge_refunded_check CHECK (
      charge_amount_refunded_cents >= 0 AND charge_amount_refunded_cents <= amount_cents
    ),
  refunded_amount_cents INTEGER NOT NULL DEFAULT 0
    CONSTRAINT founding_angel_orders_refunded_amount_check CHECK (
      refunded_amount_cents >= 0 AND refunded_amount_cents <= amount_cents
    ),
  pending_refund_amount_cents INTEGER NOT NULL DEFAULT 0
    CONSTRAINT founding_angel_orders_pending_refund_amount_check CHECK (
      pending_refund_amount_cents >= 0
    ),
  chargeback_amount_cents INTEGER NOT NULL DEFAULT 0
    CONSTRAINT founding_angel_orders_chargeback_amount_check CHECK (
      chargeback_amount_cents >= 0
    ),

  -- Master combined financial exposure invariant (C09 / C18 / Phase 13B.1.19)
  CONSTRAINT founding_angel_orders_total_exposure_check CHECK (
    -- Invariant 1: Total refund exposure (settled + pending) cannot exceed original charge
    (refunded_amount_cents + pending_refund_amount_cents <= amount_cents)
    AND
    -- Invariant 2: Chargeback debited cannot exceed original charge
    (chargeback_amount_cents <= amount_cents)
    AND
    -- Invariant 3: Combined exposure cannot exceed amount_cents unless quarantined,
    -- and even under quarantine can NEVER exceed 2x amount_cents ($400 max dual-debit)
    (
      (flagged_for_review = FALSE AND (refunded_amount_cents + pending_refund_amount_cents + chargeback_amount_cents <= amount_cents))
      OR
      (flagged_for_review = TRUE AND (refunded_amount_cents + pending_refund_amount_cents + chargeback_amount_cents <= amount_cents * 2))
    )
  ),

  refund_obligation_cents INTEGER NOT NULL DEFAULT 0
    CONSTRAINT founding_angel_orders_refund_obligation_check CHECK (
      refund_obligation_cents IN (0, 20000)
    ),
  refunds_json JSONB NOT NULL DEFAULT '[]'::jsonb
    CONSTRAINT founding_angel_orders_refunds_json_check CHECK (
      jsonb_typeof(refunds_json) = 'array'
    ),
  obligation_satisfied_by_refund_ids TEXT[] NOT NULL DEFAULT '{}'::TEXT[],

  -- Crash-safe manual refund execution tracking (C04 / H04 / C11)
  refund_execution_status TEXT NOT NULL DEFAULT 'not_applicable'
    CONSTRAINT founding_angel_orders_refund_exec_status_check CHECK (
      refund_execution_status IN (
        'not_applicable',
        'refund_required',
        'refund_intent_recorded',
        'refund_submitted_pending',
        'refund_ambiguous_lookup_required',
        'refund_partially_completed',
        'refund_completed',
        'refund_extinguished_by_chargeback'
      )
    ),
  active_refund_attempt_no INTEGER NOT NULL DEFAULT 0
    CONSTRAINT founding_angel_orders_refund_attempt_no_check CHECK (active_refund_attempt_no >= 0),
  active_refund_idempotency_key TEXT NULL UNIQUE,
  active_refund_amount_cents INTEGER NULL
    CONSTRAINT founding_angel_orders_active_refund_amt_check CHECK (
      active_refund_amount_cents IS NULL
      OR (active_refund_amount_cents > 0 AND active_refund_amount_cents <= amount_cents)
    ),
  active_stripe_refund_id TEXT NULL,
  refund_initiated_at TIMESTAMPTZ NULL,
  refund_initiated_by TEXT NULL,

  -- Formal chargeback tracking ONLY (C01 / C03 / C08)
  dispute_id TEXT NULL UNIQUE,
  dispute_status TEXT NULL
    CONSTRAINT founding_angel_orders_dispute_status_check CHECK (
      dispute_status IS NULL OR dispute_status IN (
        'needs_response',
        'under_review',
        'won',
        'lost'
      )
    ),
  dispute_status_rank INTEGER NOT NULL DEFAULT 0
    CONSTRAINT founding_angel_orders_dispute_rank_check CHECK (
      dispute_status_rank IN (0, 1, 2, 3)
    ),
  dispute_amount_cents INTEGER NULL
    CONSTRAINT founding_angel_orders_dispute_amount_check CHECK (
      dispute_amount_cents IS NULL OR (dispute_amount_cents > 0 AND dispute_amount_cents <= amount_cents)
    ),

  -- Card-network Inquiry / RDR Prevented dispute tracking (C01 / C08)
  inquiry_dispute_id TEXT NULL,
  inquiry_dispute_status TEXT NULL
    CONSTRAINT founding_angel_orders_inquiry_status_check CHECK (
      inquiry_dispute_status IS NULL OR inquiry_dispute_status IN (
        'warning_needs_response',
        'warning_under_review',
        'warning_closed',
        'prevented'
      )
    ),
  inquiry_updated_at TIMESTAMPTZ NULL,

  -- Stripe Radar Early Fraud Warning tracking (C01 / C08)
  efw_id TEXT NULL,
  efw_actionable BOOLEAN NULL,
  efw_fraud_type TEXT NULL,
  efw_updated_at TIMESTAMPTZ NULL,

  -- Manual review / quarantine flags
  flagged_for_review BOOLEAN NOT NULL DEFAULT FALSE,
  review_reason TEXT NULL,

  -- Stripe object identifiers
  stripe_idempotency_key TEXT NOT NULL UNIQUE,
  stripe_checkout_session_id TEXT NULL UNIQUE,
  stripe_checkout_url TEXT NULL,
  stripe_payment_intent_id TEXT NULL UNIQUE,
  stripe_charge_id TEXT NULL UNIQUE,
  stripe_customer_id TEXT NULL,

  -- Milestone audit IDs & full per-order webhook deduplication array (H05 / Check 8)
  fulfilled_event_id TEXT NULL,
  expired_event_id TEXT NULL,
  last_refund_event_id TEXT NULL,
  last_dispute_event_id TEXT NULL,
  last_efw_event_id TEXT NULL,
  last_stripe_event_id TEXT NULL,
  processed_event_ids TEXT[] NOT NULL DEFAULT '{}'::TEXT[],

  -- Timestamps
  checkout_expires_at TIMESTAMPTZ NOT NULL,
  paid_at TIMESTAMPTZ NULL,
  expired_at TIMESTAMPTZ NULL,
  refunded_at TIMESTAMPTZ NULL,
  disputed_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Composite unique key supporting composite FK from founding_angel_memberships (C05)
  CONSTRAINT founding_angel_orders_id_identity_uq UNIQUE (id, identity_id),

  -- Consistency: refunded_at ↔ refunded_amount_cents (Check 1)
  CONSTRAINT founding_angel_orders_refunded_at_consistency_check CHECK (
    (refunded_at IS NULL AND refunded_amount_cents < amount_cents)
    OR
    (refunded_at IS NOT NULL AND refunded_amount_cents = amount_cents)
  ),

  -- Consistency: expired_at ↔ status (Check 2)
  CONSTRAINT founding_angel_orders_expired_at_consistency_check CHECK (
    (expired_at IS NULL AND status <> 'expired')
    OR
    (expired_at IS NOT NULL AND status = 'expired')
  ),

  -- Radar EFW consistency check (C01)
  CONSTRAINT founding_angel_orders_efw_consistency_check CHECK (
    (efw_id IS NULL AND efw_actionable IS NULL AND efw_fraud_type IS NULL AND efw_updated_at IS NULL)
    OR
    (efw_id IS NOT NULL AND efw_actionable IS NOT NULL AND efw_fraud_type IS NOT NULL AND efw_updated_at IS NOT NULL)
  ),

  -- Inquiry warning consistency check (C01)
  CONSTRAINT founding_angel_orders_inquiry_consistency_check CHECK (
    (inquiry_dispute_id IS NULL AND inquiry_dispute_status IS NULL AND inquiry_updated_at IS NULL)
    OR
    (inquiry_dispute_id IS NOT NULL AND inquiry_dispute_status IS NOT NULL AND inquiry_updated_at IS NOT NULL)
  ),

  -- Formal dispute rank consistency check (C03 / Check 3)
  CONSTRAINT founding_angel_orders_dispute_rank_consistency_check CHECK (
    (dispute_id IS NULL AND dispute_status IS NULL AND dispute_status_rank = 0 AND disputed_at IS NULL)
    OR
    (dispute_id IS NOT NULL AND dispute_status = 'needs_response' AND dispute_status_rank = 1 AND disputed_at IS NOT NULL)
    OR
    (dispute_id IS NOT NULL AND dispute_status = 'under_review' AND dispute_status_rank = 2 AND disputed_at IS NOT NULL)
    OR
    (dispute_id IS NOT NULL AND dispute_status IN ('won', 'lost') AND dispute_status_rank = 3 AND disputed_at IS NOT NULL)
  ),

  -- Refund execution state consistency check (C11)
  CONSTRAINT founding_angel_orders_refund_exec_consistency_check CHECK (
    (
      refund_execution_status = 'not_applicable'
      AND active_refund_attempt_no = 0
      AND active_refund_idempotency_key IS NULL
      AND active_refund_amount_cents IS NULL
      AND active_stripe_refund_id IS NULL
      AND refund_initiated_at IS NULL
      AND refund_initiated_by IS NULL
      AND refund_obligation_cents = 0
    )
    OR
    (
      refund_execution_status = 'refund_required'
      AND refund_obligation_cents = 20000
      AND active_refund_idempotency_key IS NULL
      AND active_refund_amount_cents IS NULL
      AND active_stripe_refund_id IS NULL
      AND refund_initiated_at IS NULL
      AND refund_initiated_by IS NULL
      AND pending_refund_amount_cents = 0
    )
    OR
    (
      refund_execution_status = 'refund_intent_recorded'
      AND active_refund_attempt_no >= 1
      AND active_refund_idempotency_key IS NOT NULL
      AND active_refund_amount_cents IS NOT NULL
      AND active_refund_amount_cents > 0
      AND active_refund_amount_cents <= (amount_cents - refunded_amount_cents)
      AND refund_initiated_at IS NOT NULL
      AND refund_initiated_by IS NOT NULL
      AND active_stripe_refund_id IS NULL
    )
    OR
    (
      refund_execution_status = 'refund_submitted_pending'
      AND active_refund_attempt_no >= 1
      AND active_refund_idempotency_key IS NOT NULL
      AND active_refund_amount_cents IS NOT NULL
      AND active_refund_amount_cents > 0
      AND refund_initiated_at IS NOT NULL
      AND refund_initiated_by IS NOT NULL
      AND active_stripe_refund_id IS NOT NULL
      AND pending_refund_amount_cents > 0
    )
    OR
    (
      refund_execution_status = 'refund_ambiguous_lookup_required'
      AND active_refund_attempt_no >= 1
      AND active_refund_idempotency_key IS NOT NULL
      AND active_refund_amount_cents IS NOT NULL
      AND refund_initiated_at IS NOT NULL
      AND flagged_for_review = TRUE
    )
    OR
    (
      refund_execution_status = 'refund_partially_completed'
      AND refunded_amount_cents > 0
      AND refunded_amount_cents < amount_cents
      AND cardinality(obligation_satisfied_by_refund_ids) >= 1
    )
    OR
    (
      refund_execution_status = 'refund_completed'
      AND refunded_amount_cents = amount_cents
      AND pending_refund_amount_cents = 0
      AND refunded_at IS NOT NULL
      AND cardinality(obligation_satisfied_by_refund_ids) >= 1
    )
    OR
    (
      refund_execution_status = 'refund_extinguished_by_chargeback'
      AND status = 'chargeback_lost'
      AND dispute_status = 'lost'
      AND chargeback_amount_cents > 0
    )
  ),

  -- Master state/disposition/financial/dispute invariant (C07 / C09)
  CONSTRAINT founding_angel_orders_disposition_state_check CHECK (
    (
      status = 'creating_session'
      AND fulfillment_disposition IS NULL
      AND paid_at IS NULL
      AND refunded_amount_cents = 0
      AND pending_refund_amount_cents = 0
      AND chargeback_amount_cents = 0
      AND refund_obligation_cents = 0
      AND refund_execution_status = 'not_applicable'
      AND dispute_id IS NULL
      AND stripe_checkout_session_id IS NULL
      AND stripe_payment_intent_id IS NULL
      AND stripe_charge_id IS NULL
    )
    OR
    (
      status = 'open'
      AND fulfillment_disposition IS NULL
      AND paid_at IS NULL
      AND refunded_amount_cents = 0
      AND pending_refund_amount_cents = 0
      AND chargeback_amount_cents = 0
      AND refund_obligation_cents = 0
      AND refund_execution_status = 'not_applicable'
      AND dispute_id IS NULL
      AND stripe_checkout_session_id IS NOT NULL
    )
    OR
    (
      status = 'expired'
      AND fulfillment_disposition IS NULL
      AND paid_at IS NULL
      AND refunded_amount_cents = 0
      AND pending_refund_amount_cents = 0
      AND chargeback_amount_cents = 0
      AND refund_obligation_cents = 0
      AND refund_execution_status = 'not_applicable'
      AND dispute_id IS NULL
      AND expired_at IS NOT NULL
    )
    OR
    (
      status = 'paid'
      AND fulfillment_disposition IS NOT NULL
      AND paid_at IS NOT NULL
      AND stripe_payment_intent_id IS NOT NULL
      AND refunded_amount_cents = 0
      AND chargeback_amount_cents = 0
      AND (
        (fulfillment_disposition = 'membership_granted' AND refund_execution_status IN ('not_applicable', 'refund_required', 'refund_intent_recorded', 'refund_submitted_pending', 'refund_ambiguous_lookup_required'))
        OR
        (fulfillment_disposition IN ('refund_required_overflow', 'refund_required_duplicate') AND refund_obligation_cents = 20000 AND refund_execution_status IN ('refund_required', 'refund_intent_recorded', 'refund_submitted_pending', 'refund_ambiguous_lookup_required'))
      )
      AND (dispute_status IS NULL OR dispute_status = 'won')
    )
    OR
    (
      status = 'partially_refunded'
      AND fulfillment_disposition IS NOT NULL
      AND paid_at IS NOT NULL
      AND stripe_payment_intent_id IS NOT NULL
      AND stripe_charge_id IS NOT NULL
      AND refunded_amount_cents > 0
      AND refunded_amount_cents < amount_cents
      AND chargeback_amount_cents = 0
      AND refund_execution_status IN ('refund_partially_completed', 'refund_required', 'refund_intent_recorded', 'refund_submitted_pending', 'refund_ambiguous_lookup_required')
      AND (dispute_status IS NULL OR dispute_status = 'won')
    )
    OR
    (
      status = 'refunded'
      AND fulfillment_disposition IS NOT NULL
      AND paid_at IS NOT NULL
      AND stripe_payment_intent_id IS NOT NULL
      AND stripe_charge_id IS NOT NULL
      AND refunded_amount_cents = amount_cents
      AND pending_refund_amount_cents = 0
      AND chargeback_amount_cents = 0
      AND refunded_at IS NOT NULL
      AND refund_execution_status = 'refund_completed'
      AND (dispute_status IS NULL OR dispute_status = 'won')
    )
    OR
    (
      status = 'disputed'
      AND fulfillment_disposition IS NOT NULL
      AND paid_at IS NOT NULL
      AND stripe_payment_intent_id IS NOT NULL
      AND stripe_charge_id IS NOT NULL
      AND dispute_id IS NOT NULL
      AND dispute_status IN ('needs_response', 'under_review')
      AND chargeback_amount_cents = 0
      AND (
        (refunded_amount_cents < amount_cents)
        OR
        (refunded_amount_cents = amount_cents AND refunded_at IS NOT NULL AND refund_execution_status = 'refund_completed')
      )
    )
    OR
    (
      status = 'chargeback_lost'
      AND fulfillment_disposition IS NOT NULL
      AND paid_at IS NOT NULL
      AND stripe_payment_intent_id IS NOT NULL
      AND stripe_charge_id IS NOT NULL
      AND dispute_id IS NOT NULL
      AND dispute_status = 'lost'
      AND chargeback_amount_cents > 0
      AND (
        (flagged_for_review = FALSE AND (refunded_amount_cents + pending_refund_amount_cents + chargeback_amount_cents <= amount_cents))
        OR
        (flagged_for_review = TRUE AND (refunded_amount_cents + pending_refund_amount_cents + chargeback_amount_cents <= amount_cents * 2))
      )
      AND (pending_refund_amount_cents = 0 OR flagged_for_review = TRUE)
      AND refund_execution_status IN (
        'refund_extinguished_by_chargeback',
        'refund_submitted_pending',
        'refund_ambiguous_lookup_required',
        'refund_partially_completed',
        'refund_completed'
      )
    )
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS founding_angel_orders_one_active_checkout_idx
  ON public.founding_angel_orders (identity_id)
  WHERE status IN ('creating_session', 'open');

CREATE INDEX IF NOT EXISTS founding_angel_orders_active_capacity_idx
  ON public.founding_angel_orders (status, checkout_expires_at)
  WHERE status IN ('creating_session', 'open');

CREATE INDEX IF NOT EXISTS founding_angel_orders_refund_queue_idx
  ON public.founding_angel_orders (fulfillment_disposition, status, refund_execution_status)
  WHERE refund_obligation_cents > refunded_amount_cents
    AND status IN ('paid', 'partially_refunded');

-- =============================================================================
-- 2. TABLE: public.founding_angel_memberships
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.founding_angel_memberships (
  member_number INTEGER PRIMARY KEY
    CONSTRAINT founding_angel_memberships_number_check CHECK (
      member_number >= 1 AND member_number <= 500
    ),
  identity_id TEXT NOT NULL UNIQUE
    CONSTRAINT founding_angel_memberships_identity_id_not_blank CHECK (btrim(identity_id) <> '')
    CONSTRAINT founding_angel_memberships_identity_id_fkey
      REFERENCES public.youniverse_identities(identity_id) ON DELETE RESTRICT,
  order_id UUID NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'active'
    CONSTRAINT founding_angel_memberships_status_check CHECK (
      status IN ('active', 'suspended', 'revoked')
    ),
  granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Active suspension state (non-null ONLY while status = 'suspended')
  suspended_at TIMESTAMPTZ NULL,
  suspension_reason TEXT NULL
    CONSTRAINT founding_angel_memberships_suspension_reason_check CHECK (
      suspension_reason IS NULL OR suspension_reason IN ('formal_dispute')
    ),
  suspended_by_dispute_id TEXT NULL,

  -- Preserved suspension/restoration audit history
  last_suspended_at TIMESTAMPTZ NULL,
  last_restored_at TIMESTAMPTZ NULL,
  last_restored_from_dispute_id TEXT NULL,

  -- Terminal revocation state
  revoked_at TIMESTAMPTZ NULL,
  revocation_reason TEXT NULL
    CONSTRAINT founding_angel_memberships_revocation_reason_check CHECK (
      revocation_reason IS NULL OR revocation_reason IN ('full_refund', 'chargeback_lost', 'operator_revoked')
    ),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Composite FK: membership + order belong to same identity (C05)
  CONSTRAINT founding_angel_memberships_order_identity_fk
    FOREIGN KEY (order_id, identity_id)
    REFERENCES public.founding_angel_orders (id, identity_id)
    ON DELETE RESTRICT,

  -- Lifecycle timestamp & reason consistency
  CONSTRAINT founding_angel_memberships_lifecycle_timestamps_check CHECK (
    (
      status = 'active'
      AND suspended_at IS NULL
      AND suspension_reason IS NULL
      AND suspended_by_dispute_id IS NULL
      AND revoked_at IS NULL
      AND revocation_reason IS NULL
      AND (
        (last_suspended_at IS NULL AND last_restored_at IS NULL AND last_restored_from_dispute_id IS NULL)
        OR
        (last_suspended_at IS NOT NULL AND last_restored_at IS NOT NULL AND last_restored_from_dispute_id IS NOT NULL AND last_restored_at >= last_suspended_at)
      )
    )
    OR
    (
      status = 'suspended'
      AND suspended_at IS NOT NULL
      AND suspension_reason = 'formal_dispute'
      AND suspended_by_dispute_id IS NOT NULL
      AND last_suspended_at IS NOT NULL
      AND revoked_at IS NULL
      AND revocation_reason IS NULL
    )
    OR
    (
      status = 'revoked'
      AND revoked_at IS NOT NULL
      AND revocation_reason IS NOT NULL
      AND suspended_at IS NULL
      AND suspension_reason IS NULL
      AND suspended_by_dispute_id IS NULL
    )
  )
);

-- =============================================================================
-- 3. TRIGGERS
-- =============================================================================

-- 3A. Member numbering & financial entitlement verification (H01 / C06 / C14 / C16)
CREATE OR REPLACE FUNCTION public.assign_and_verify_founding_angel_member_number()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_expected_next INTEGER;
  v_order RECORD;
BEGIN
  -- 1. Lock parent order row FIRST (C16 universal acyclic lock hierarchy)
  SELECT status, fulfillment_disposition, refunded_amount_cents,
         pending_refund_amount_cents, chargeback_amount_cents, dispute_status
    INTO v_order
  FROM public.founding_angel_orders
  WHERE id = NEW.order_id
    AND identity_id = NEW.identity_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Referenced order (%) does not exist for identity (%)', NEW.order_id, NEW.identity_id;
  END IF;

  -- 2. Entitlement verification (C06)
  IF v_order.fulfillment_disposition IS DISTINCT FROM 'membership_granted'
     OR v_order.status IS DISTINCT FROM 'paid'
     OR v_order.refunded_amount_cents <> 0
     OR v_order.pending_refund_amount_cents <> 0
     OR v_order.chargeback_amount_cents <> 0
     OR (v_order.dispute_status IS NOT NULL AND v_order.dispute_status <> 'won') THEN
    RAISE EXCEPTION 'Cannot grant membership: order (%) has invalid entitlement state (status=%, disposition=%, refunded=%, pending=%, chargeback=%, dispute_status=%)',
      NEW.order_id, v_order.status, v_order.fulfillment_disposition,
      v_order.refunded_amount_cents, v_order.pending_refund_amount_cents,
      v_order.chargeback_amount_cents, v_order.dispute_status;
  END IF;

  -- 3. Initial membership lifecycle cleanliness enforcement (C14)
  IF NEW.status IS DISTINCT FROM 'active' THEN
    RAISE EXCEPTION 'New Founding Angel membership must begin in active state, not % (order_id=%)',
      NEW.status, NEW.order_id;
  END IF;

  IF NEW.suspended_at IS NOT NULL
     OR NEW.suspension_reason IS NOT NULL
     OR NEW.suspended_by_dispute_id IS NOT NULL
     OR NEW.last_suspended_at IS NOT NULL
     OR NEW.last_restored_at IS NOT NULL
     OR NEW.last_restored_from_dispute_id IS NOT NULL
     OR NEW.revoked_at IS NOT NULL
     OR NEW.revocation_reason IS NOT NULL THEN
    RAISE EXCEPTION 'New Founding Angel membership cannot be inserted with non-empty lifecycle history (order_id=%)',
      NEW.order_id;
  END IF;

  -- 4. Acquire Advisory Lock 500200 SECOND (serializes member numbering only after order row is secured)
  PERFORM pg_advisory_xact_lock(500200);

  -- 5. Allocate sequential member number
  SELECT COALESCE(MAX(member_number), 0) + 1
    INTO v_expected_next
  FROM public.founding_angel_memberships;

  IF v_expected_next > 500 THEN
    RAISE EXCEPTION 'Founding Angels 500-member capacity is full (next=%).', v_expected_next;
  END IF;

  IF NEW.member_number IS NULL THEN
    NEW.member_number := v_expected_next;
  ELSIF NEW.member_number <> v_expected_next THEN
    RAISE EXCEPTION 'Non-sequential member_number % rejected; expected %.', NEW.member_number, v_expected_next;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_assign_founding_angel_member_number
  ON public.founding_angel_memberships;

CREATE TRIGGER trg_assign_founding_angel_member_number
  BEFORE INSERT ON public.founding_angel_memberships
  FOR EACH ROW
  EXECUTE FUNCTION public.assign_and_verify_founding_angel_member_number();

-- 3B. Order immutability, monotonic progression, and audit (C08 / Checks 4-9)
CREATE OR REPLACE FUNCTION public.enforce_founding_angel_order_immutability()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'founding_angel_orders rows cannot be deleted (order_id=%)', OLD.id;
  END IF;

  -- 1. Identity & order parameter immutability (Check 6)
  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.identity_id IS DISTINCT FROM OLD.identity_id
     OR NEW.amount_cents IS DISTINCT FROM OLD.amount_cents
     OR NEW.currency IS DISTINCT FROM OLD.currency
     OR NEW.livemode IS DISTINCT FROM OLD.livemode
     OR NEW.stripe_idempotency_key IS DISTINCT FROM OLD.stripe_idempotency_key
     OR NEW.checkout_expires_at IS DISTINCT FROM OLD.checkout_expires_at THEN
    RAISE EXCEPTION 'Immutable order identity/financial columns cannot be modified on founding_angel_orders (id=%)', OLD.id;
  END IF;

  -- 2. Immutable-once-set fields (Checks 4, 5 / C08)
  IF OLD.fulfillment_disposition IS NOT NULL
     AND NEW.fulfillment_disposition IS DISTINCT FROM OLD.fulfillment_disposition THEN
    RAISE EXCEPTION 'fulfillment_disposition is immutable once set on founding_angel_orders (id=%)', OLD.id;
  END IF;

  IF OLD.paid_at IS NOT NULL AND NEW.paid_at IS DISTINCT FROM OLD.paid_at THEN
    RAISE EXCEPTION 'paid_at is immutable once set (id=%, old=%, new=%)', OLD.id, OLD.paid_at, NEW.paid_at;
  END IF;

  IF OLD.stripe_customer_id IS NOT NULL AND NEW.stripe_customer_id IS DISTINCT FROM OLD.stripe_customer_id THEN
    RAISE EXCEPTION 'stripe_customer_id is immutable once set (id=%)', OLD.id;
  END IF;

  IF OLD.stripe_checkout_session_id IS NOT NULL
     AND NEW.stripe_checkout_session_id IS DISTINCT FROM OLD.stripe_checkout_session_id THEN
    RAISE EXCEPTION 'stripe_checkout_session_id is immutable once set (id=%)', OLD.id;
  END IF;

  IF OLD.stripe_payment_intent_id IS NOT NULL
     AND NEW.stripe_payment_intent_id IS DISTINCT FROM OLD.stripe_payment_intent_id THEN
    RAISE EXCEPTION 'stripe_payment_intent_id is immutable once set (id=%)', OLD.id;
  END IF;

  IF OLD.stripe_charge_id IS NOT NULL
     AND NEW.stripe_charge_id IS DISTINCT FROM OLD.stripe_charge_id THEN
    RAISE EXCEPTION 'stripe_charge_id is immutable once set (id=%)', OLD.id;
  END IF;

  IF OLD.dispute_id IS NOT NULL AND NEW.dispute_id IS DISTINCT FROM OLD.dispute_id THEN
    RAISE EXCEPTION 'dispute_id is immutable once set on founding_angel_orders (old=%, new=%)',
      OLD.dispute_id, NEW.dispute_id;
  END IF;

  IF OLD.disputed_at IS NOT NULL AND NEW.disputed_at IS DISTINCT FROM OLD.disputed_at THEN
    RAISE EXCEPTION 'disputed_at is immutable once set (id=%)', OLD.id;
  END IF;

  -- 3. Monotonic financial totals
  IF NEW.refunded_amount_cents < OLD.refunded_amount_cents THEN
    RAISE EXCEPTION 'Succeeded refunded_amount_cents cannot decrease (id=%, old=%, new=%)',
      OLD.id, OLD.refunded_amount_cents, NEW.refunded_amount_cents;
  END IF;

  -- 3B. Final dispute outcome immutability (C17 / Phase 13B.1.19)
  IF OLD.dispute_status IN ('won', 'lost')
     AND NEW.dispute_status IS DISTINCT FROM OLD.dispute_status THEN
    RAISE EXCEPTION 'Final dispute status (%) cannot be altered to % (order_id=%)',
      OLD.dispute_status, NEW.dispute_status, OLD.id;
  END IF;

  -- 4. Monotonic dispute status rank
  IF OLD.dispute_id IS NOT NULL
     AND NEW.dispute_id = OLD.dispute_id
     AND NEW.dispute_status_rank < OLD.dispute_status_rank THEN
    RAISE EXCEPTION 'dispute_status_rank cannot regress for dispute_id=% (old=%, new=%)',
      OLD.dispute_id, OLD.dispute_status_rank, NEW.dispute_status_rank;
  END IF;

  -- 5. Terminal chargeback_lost state
  IF OLD.status = 'chargeback_lost' AND NEW.status IS DISTINCT FROM 'chargeback_lost' THEN
    RAISE EXCEPTION 'chargeback_lost is a terminal order state and cannot transition to % (id=%)',
      NEW.status, OLD.id;
  END IF;

  -- 6. Monotonic processed_event_ids array (Check 8)
  IF NOT (OLD.processed_event_ids <@ NEW.processed_event_ids)
     OR cardinality(NEW.processed_event_ids) < cardinality(OLD.processed_event_ids) THEN
    RAISE EXCEPTION 'processed_event_ids array can only grow (id=%, old_len=%, new_len=%)',
      OLD.id, cardinality(OLD.processed_event_ids), cardinality(NEW.processed_event_ids);
  END IF;

  -- 7. flagged_for_review durability and evidence enforcement (Check 9 / C18)
  IF OLD.flagged_for_review = TRUE AND NEW.flagged_for_review = FALSE THEN
    -- Evidence Guard 1: Resolution note format
    IF NEW.review_reason IS NULL OR NOT (NEW.review_reason LIKE 'RESOLVED:%' OR NEW.review_reason LIKE 'RESOLVED_BY:%') THEN
      RAISE EXCEPTION 'flagged_for_review cannot be cleared without an operator resolution note in review_reason prefixed with RESOLVED: or RESOLVED_BY: (id=%)', OLD.id;
    END IF;

    -- Evidence Guard 2: No unresolved ambiguous refund attempt
    IF NEW.refund_execution_status = 'refund_ambiguous_lookup_required' THEN
      RAISE EXCEPTION 'Cannot clear flagged_for_review while refund_execution_status is refund_ambiguous_lookup_required (order_id=%)', OLD.id;
    END IF;

    -- Evidence Guard 3: No unresolved pending refund on chargeback-lost order
    IF NEW.status = 'chargeback_lost' AND NEW.pending_refund_amount_cents > 0 THEN
      RAISE EXCEPTION 'Cannot clear flagged_for_review while pending_refund_amount_cents > 0 on chargeback_lost order (order_id=%)', OLD.id;
    END IF;

    -- Evidence Guard 4: Total exposure must be reconciled to <= amount_cents
    IF (NEW.refunded_amount_cents + NEW.pending_refund_amount_cents + NEW.chargeback_amount_cents) > NEW.amount_cents THEN
      RAISE EXCEPTION 'Cannot clear flagged_for_review while combined exposure (%) exceeds amount_cents (%) (order_id=%)',
        (NEW.refunded_amount_cents + NEW.pending_refund_amount_cents + NEW.chargeback_amount_cents), NEW.amount_cents, OLD.id;
    END IF;
  END IF;

  -- 8. Auto-maintain updated_at (Check 7)
  NEW.updated_at := NOW();

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_founding_angel_order_immutability
  ON public.founding_angel_orders;

CREATE TRIGGER trg_enforce_founding_angel_order_immutability
  BEFORE UPDATE OR DELETE ON public.founding_angel_orders
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_founding_angel_order_immutability();

-- 3C. Membership immutability & lifecycle transition enforcement (C10 / Check 7)
CREATE OR REPLACE FUNCTION public.enforce_founding_angel_membership_immutability()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_order RECORD;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'founding_angel_memberships rows cannot be deleted; member_number % is permanently consumed', OLD.member_number;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    -- 1. Identity immutability
    IF NEW.member_number IS DISTINCT FROM OLD.member_number
       OR NEW.identity_id IS DISTINCT FROM OLD.identity_id
       OR NEW.order_id IS DISTINCT FROM OLD.order_id
       OR NEW.granted_at IS DISTINCT FROM OLD.granted_at THEN
      RAISE EXCEPTION 'Permanent Founding Angel membership identity columns (member_number, identity_id, order_id, granted_at) are immutable after insertion';
    END IF;

    -- 1B. Lifecycle metadata immutability on same-status update (C15 / Phase 13B.1.19)
    IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
      IF NEW.suspended_at IS DISTINCT FROM OLD.suspended_at
         OR NEW.suspension_reason IS DISTINCT FROM OLD.suspension_reason
         OR NEW.suspended_by_dispute_id IS DISTINCT FROM OLD.suspended_by_dispute_id
         OR NEW.last_suspended_at IS DISTINCT FROM OLD.last_suspended_at
         OR NEW.last_restored_at IS DISTINCT FROM OLD.last_restored_at
         OR NEW.last_restored_from_dispute_id IS DISTINCT FROM OLD.last_restored_from_dispute_id
         OR NEW.revoked_at IS DISTINCT FROM OLD.revoked_at
         OR NEW.revocation_reason IS DISTINCT FROM OLD.revocation_reason THEN
        RAISE EXCEPTION 'Founding Angel membership lifecycle metadata is immutable when status is unchanged (member_number=%)',
          OLD.member_number;
      END IF;
    END IF;

    -- 2. Terminal state protection
    IF OLD.status = 'revoked' AND NEW.status IS DISTINCT FROM 'revoked' THEN
      RAISE EXCEPTION 'Revoked Founding Angel membership (member_number=%) is terminal and cannot be reactivated', OLD.member_number;
    END IF;

    -- 3. Lifecycle transition enforcement with parent order evidence (C10)
    IF NEW.status IS DISTINCT FROM OLD.status THEN
      SELECT status, dispute_id, dispute_status, refunded_amount_cents,
             amount_cents, chargeback_amount_cents, flagged_for_review
        INTO v_order
      FROM public.founding_angel_orders
      WHERE id = NEW.order_id;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'Parent order % not found for membership %', NEW.order_id, NEW.member_number;
      END IF;

      -- 3A. active → suspended
      IF OLD.status = 'active' AND NEW.status = 'suspended' THEN
        IF v_order.status IS DISTINCT FROM 'disputed'
           OR v_order.dispute_id IS DISTINCT FROM NEW.suspended_by_dispute_id
           OR v_order.dispute_status NOT IN ('needs_response', 'under_review') THEN
          RAISE EXCEPTION 'Cannot suspend membership % without active formal dispute on order (order_status=%, dispute_id=%, dispute_status=%)',
            NEW.member_number, v_order.status, v_order.dispute_id, v_order.dispute_status;
        END IF;

      -- 3B. suspended → active
      ELSIF OLD.status = 'suspended' AND NEW.status = 'active' THEN
        IF v_order.dispute_status IS DISTINCT FROM 'won'
           OR v_order.status NOT IN ('paid', 'partially_refunded')
           OR v_order.refunded_amount_cents >= v_order.amount_cents
           OR v_order.chargeback_amount_cents <> 0 THEN
          RAISE EXCEPTION 'Cannot restore membership % to active unless dispute won and financial state eligible (order_status=%, dispute_status=%, refunded=%, chargeback=%)',
            NEW.member_number, v_order.status, v_order.dispute_status, v_order.refunded_amount_cents, v_order.chargeback_amount_cents;
        END IF;

      -- 3C. (active | suspended) → revoked
      ELSIF (OLD.status IN ('active', 'suspended')) AND NEW.status = 'revoked' THEN
        IF NEW.revocation_reason = 'full_refund' THEN
          IF v_order.refunded_amount_cents <> v_order.amount_cents THEN
            RAISE EXCEPTION 'Cannot revoke membership % for full_refund when refunded_amount_cents (%) <> amount_cents (%)',
              NEW.member_number, v_order.refunded_amount_cents, v_order.amount_cents;
          END IF;
        ELSIF NEW.revocation_reason = 'chargeback_lost' THEN
          IF v_order.status IS DISTINCT FROM 'chargeback_lost' OR v_order.dispute_status IS DISTINCT FROM 'lost' THEN
            RAISE EXCEPTION 'Cannot revoke membership % for chargeback_lost when order status is % and dispute_status is %',
              NEW.member_number, v_order.status, v_order.dispute_status;
          END IF;
        ELSIF NEW.revocation_reason = 'operator_revoked' THEN
          IF v_order.flagged_for_review IS NOT TRUE THEN
            RAISE EXCEPTION 'operator_revoked requires flagged_for_review = TRUE on parent order %', NEW.order_id;
          END IF;
        ELSE
          RAISE EXCEPTION 'Invalid revocation_reason % for membership %', NEW.revocation_reason, NEW.member_number;
        END IF;

      ELSE
        RAISE EXCEPTION 'Illegal membership status transition from % to % for member_number %',
          OLD.status, NEW.status, NEW.member_number;
      END IF;
    END IF;

    -- Auto-maintain updated_at (Check 7)
    NEW.updated_at := NOW();
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_founding_angel_membership_immutability
  ON public.founding_angel_memberships;

CREATE TRIGGER trg_enforce_founding_angel_membership_immutability
  BEFORE UPDATE OR DELETE ON public.founding_angel_memberships
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_founding_angel_membership_immutability();

-- =============================================================================
-- 4. RPC / HELPER FUNCTIONS
-- =============================================================================

-- 4A. Transaction-scoped membership transition helper ensuring parent-first locking
CREATE OR REPLACE FUNCTION public.transition_founding_angel_membership(
  p_order_id UUID,
  p_new_status TEXT,
  p_reason TEXT DEFAULT NULL,
  p_dispute_id TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  v_order_id UUID;
BEGIN
  -- Universal Lock Hierarchy: Lock parent order FIRST
  SELECT id INTO v_order_id
  FROM public.founding_angel_orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Parent order % not found for membership transition', p_order_id;
  END IF;

  -- Then execute membership update (which fires immutability trigger with clean snapshot)
  IF p_new_status = 'suspended' THEN
    UPDATE public.founding_angel_memberships
    SET status = 'suspended',
        suspended_at = NOW(),
        suspension_reason = p_reason,
        suspended_by_dispute_id = p_dispute_id,
        last_suspended_at = NOW()
    WHERE order_id = p_order_id;
  ELSIF p_new_status = 'active' THEN
    UPDATE public.founding_angel_memberships
    SET status = 'active',
        suspended_at = NULL,
        suspension_reason = NULL,
        suspended_by_dispute_id = NULL,
        last_restored_at = NOW(),
        last_restored_from_dispute_id = p_dispute_id
    WHERE order_id = p_order_id;
  ELSIF p_new_status = 'revoked' THEN
    UPDATE public.founding_angel_memberships
    SET status = 'revoked',
        revoked_at = NOW(),
        revocation_reason = p_reason,
        suspended_at = NULL,
        suspension_reason = NULL,
        suspended_by_dispute_id = NULL
    WHERE order_id = p_order_id;
  ELSE
    RAISE EXCEPTION 'Invalid target membership status: %', p_new_status;
  END IF;
END;
$$;

COMMIT;

