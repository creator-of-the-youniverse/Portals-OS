-- =============================================================================
-- Migration 014: Passkey Credential Store, Recovery Codes & Homeverse Relinquishment Cooldown
--
-- STATUS: PROPOSED DESIGN — NOT EXECUTED
-- Implementation Authorization Boundary: This migration is authored for review
-- and architecture alignment only. Zero database writes or DDL executions have
-- been performed.
--
-- Governing Decisions:
--  - Founder Decision A: WebAuthn / Passkeys (multiple credentials, counter monotonic checks)
--  - Founder Decision B: Layer 2 Offline Recovery Codes & Layer 3 Controlled Manual Recovery
--  - Founder Decision C: 30-Day Homeverse Relinquishment Cooldown (zero fee, reservation)
-- =============================================================================
BEGIN;
-- ── 1. Provider Type Extension for WebAuthn ──────────────────────────────────
-- Extends provider_type check to permit 'webauthn' alongside 'password', 'passkey', 'email_link'.
ALTER TABLE public.human_auth_subjects DROP CONSTRAINT IF EXISTS human_auth_subjects_provider_type_check;
ALTER TABLE public.human_auth_subjects
ADD CONSTRAINT human_auth_subjects_provider_type_check CHECK (
    provider_type IN ('password', 'passkey', 'webauthn', 'email_link')
  );
-- ── 2. Passkey Public Key & Counter Store ─────────────────────────────────────
-- Ownership Note: public.human_passkeys and public.webauthn_challenges.consumed_at
-- are created and owned by Migration 012; statements in Section 2 are idempotent
-- alignment guards only and must not be dropped by Migration 014 rollback.
CREATE TABLE IF NOT EXISTS public.human_passkeys (
  credential_id TEXT PRIMARY KEY,
  -- Base64URL-encoded credential ID
  auth_subject_id UUID NOT NULL REFERENCES public.human_auth_subjects(id) ON DELETE RESTRICT,
  public_key TEXT NOT NULL,
  -- Hex-encoded COSE/SPKI public key
  counter BIGINT NOT NULL DEFAULT 0,
  device_label TEXT NOT NULL DEFAULT 'Passkey',
  transports TEXT [] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS human_passkeys_auth_subject_idx ON public.human_passkeys (auth_subject_id);
ALTER TABLE public.human_passkeys
ALTER COLUMN transports
SET DEFAULT '{}';
ALTER TABLE public.webauthn_challenges
ADD COLUMN IF NOT EXISTS consumed_at TIMESTAMPTZ;
-- ── 3. Offline Recovery Codes Store (Layer 2) ─────────────────────────────────
-- Stores SHA-256 hashes only. Plaintext is never persisted.
CREATE TABLE IF NOT EXISTS public.human_recovery_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  human_id UUID NOT NULL REFERENCES public.human_continuity_identities(human_id) ON DELETE RESTRICT,
  code_hash TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  consumed_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS human_recovery_codes_human_id_idx ON public.human_recovery_codes (human_id);
CREATE INDEX IF NOT EXISTS human_recovery_codes_active_idx ON public.human_recovery_codes (human_id)
WHERE consumed_at IS NULL;
-- ── 4. Homeverse Relinquishment Lifecycle & Cooldown (Decision C) ─────────────
CREATE TABLE IF NOT EXISTS public.homeverse_relinquishments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  human_id UUID NOT NULL REFERENCES public.human_continuity_identities(human_id) ON DELETE RESTRICT,
  identity_id TEXT NOT NULL REFERENCES public.youniverse_identities(identity_id) ON DELETE RESTRICT,
  replacement_identity_id TEXT NOT NULL REFERENCES public.youniverse_identities(identity_id) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'cancelled', 'completed')),
  initiated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  cooldown_expires_at TIMESTAMPTZ NOT NULL,
  cancelled_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  audit_log JSONB NOT NULL DEFAULT '[]'
);
CREATE INDEX IF NOT EXISTS homeverse_relinquishments_pending_human_idx ON public.homeverse_relinquishments (human_id)
WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS homeverse_relinquishments_identity_idx ON public.homeverse_relinquishments (identity_id);
-- ── 5. Verification Status Extension for 'relinquished' ───────────────────────
ALTER TABLE public.human_youniverse_associations DROP CONSTRAINT IF EXISTS hya_verification_status_check,
  DROP CONSTRAINT IF EXISTS human_youniverse_associations_verification_status_check;
ALTER TABLE public.human_youniverse_associations
ADD CONSTRAINT hya_verification_status_check CHECK (
    verification_status IN (
      'provisional',
      'verified',
      'suspended',
      'revoked',
      'relinquished'
    )
  );
-- ── 6. Manual Recovery Cases (Layer 3 — Decision B) ──────────────────────────
-- Persists Layer-3 controlled manual recovery state: cases, reviewer decisions,
-- 30-day hold timestamps, execution status, and immutable audit history.
-- Replaces the former in-process Map. Survives server restarts and multi-instance deployments.
CREATE TABLE IF NOT EXISTS public.manual_recovery_cases (
  case_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  claimant_email TEXT NOT NULL,
  human_id UUID REFERENCES public.human_continuity_identities(human_id) ON DELETE RESTRICT,
  evidence_description TEXT NOT NULL DEFAULT '',
  contact_channels JSONB NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'pending_evidence' CHECK (
    status IN (
      'pending_evidence',
      'pending_review',
      'hold_pending',
      'completed',
      'rejected'
    )
  ),
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  hold_expires_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  approvals JSONB NOT NULL DEFAULT '[]',
  rejections JSONB NOT NULL DEFAULT '[]',
  audit_log JSONB NOT NULL DEFAULT '[]'
);
CREATE INDEX IF NOT EXISTS manual_recovery_cases_status_idx ON public.manual_recovery_cases (status);
CREATE INDEX IF NOT EXISTS manual_recovery_cases_claimant_idx ON public.manual_recovery_cases (claimant_email);
COMMIT;