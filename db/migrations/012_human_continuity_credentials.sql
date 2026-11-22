-- =============================================================================
-- Migration 012: Additive Human Continuity & Authentication Credential Layer
--
-- STATUS: PROPOSED DESIGN — NOT EXECUTED
-- Implementation Authorization Boundary: This migration is authored for review
-- and local testing only. No database writes or DDL executions have been performed.
--
-- Canon: CANONICAL ARCHITECTURE v2.0 §2.4, §5, §14.1-14.3, §25.1; Phase 1 WP5 §2-4
--
-- Key Corrective Safeguards (R2 Defect Corrections):
--  1. No verified_at DEFAULT NOW(): Verified timestamp is NULL until proof of verification.
--  2. No silent verified association default: verification_status defaults to 'provisional'.
--  3. No is_homeverse DEFAULT TRUE: defaults to FALSE. Enforces partial unique index
--     ensuring at most ONE active Homeverse per human principal.
--  4. Explicit role assignment: role CHECK ('owner', 'operator', 'participant') with no silent owner assumption.
--  5. ON DELETE RESTRICT: Preserves decadal human continuity; prohibits cascading deletion.
-- =============================================================================

BEGIN;

-- ── 1. Human Continuity Principal Root ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.human_continuity_identities (
  human_id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  status                TEXT        NOT NULL DEFAULT 'active'
                                    CHECK (status IN ('active', 'suspended', 'deactivated')),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 2. Human Authentication Subjects ────────────────────────────────────────
-- Decouples authentication providers and credentials from human identity.
CREATE TABLE IF NOT EXISTS public.human_auth_subjects (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  human_id              UUID        NOT NULL
                                    REFERENCES public.human_continuity_identities(human_id)
                                    ON DELETE RESTRICT,
  provider_type         TEXT        NOT NULL
                                    CONSTRAINT human_auth_subjects_provider_type_check
                                    CHECK (provider_type IN ('password', 'passkey', 'email_link')),
  subject_identifier    TEXT        NOT NULL,
  status                TEXT        NOT NULL DEFAULT 'active'
                                    CHECK (status IN ('pending', 'active', 'revoked')),
  verified_at           TIMESTAMPTZ, -- Explicitly NULL until verified
  revoked_at            TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT human_auth_subject_unique UNIQUE (provider_type, subject_identifier)
);

CREATE INDEX IF NOT EXISTS human_auth_subjects_human_id_idx
  ON public.human_auth_subjects (human_id);

-- ── 3. Passwords Store ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.human_passwords (
  auth_subject_id       UUID        PRIMARY KEY
                                    REFERENCES public.human_auth_subjects(id)
                                    ON DELETE RESTRICT,
  password_hash         TEXT        NOT NULL,
  salt                  TEXT        NOT NULL,
  algorithm             TEXT        NOT NULL DEFAULT 'scrypt-v1',
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 4. Passkeys Store (WebAuthn L3) ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.human_passkeys (
  credential_id         TEXT        PRIMARY KEY,
  auth_subject_id       UUID        NOT NULL
                                    REFERENCES public.human_auth_subjects(id)
                                    ON DELETE RESTRICT,
  public_key            TEXT        NOT NULL,
  counter               BIGINT      NOT NULL DEFAULT 0,
  device_label          TEXT        NOT NULL DEFAULT 'Passkey',
  transports            TEXT[]      NOT NULL DEFAULT '{}',
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at          TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS human_passkeys_auth_subject_idx
  ON public.human_passkeys (auth_subject_id);

-- ── 5. Human-to-Youniverse Authorization Associations ───────────────────────
CREATE TABLE IF NOT EXISTS public.human_youniverse_associations (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  human_id              UUID        NOT NULL
                                    REFERENCES public.human_continuity_identities(human_id)
                                    ON DELETE RESTRICT,
  identity_id           TEXT        NOT NULL
                                    REFERENCES public.youniverse_identities(identity_id)
                                    ON DELETE RESTRICT,
  role                  TEXT        NOT NULL
                                    CHECK (role IN ('owner', 'operator', 'participant')),
  verification_status   TEXT        NOT NULL DEFAULT 'provisional'
                                    CONSTRAINT hya_verification_status_check
                                    CHECK (verification_status IN ('provisional', 'verified', 'suspended', 'revoked')),
  is_homeverse          BOOLEAN     NOT NULL DEFAULT FALSE,
  requires_reverification BOOLEAN   NOT NULL DEFAULT FALSE,
  reverification_required_at TIMESTAMPTZ,
  verified_at           TIMESTAMPTZ, -- Explicitly NULL until verified
  revoked_at            TIMESTAMPTZ,
  revocation_reason     TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT hya_human_identity_role_uq UNIQUE (human_id, identity_id, role)
);

-- Singleton Homeverse Invariant: At most ONE active Homeverse per human
CREATE UNIQUE INDEX IF NOT EXISTS human_singleton_homeverse_idx
  ON public.human_youniverse_associations (human_id)
  WHERE is_homeverse = TRUE AND verification_status = 'verified' AND revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS hya_identity_id_idx
  ON public.human_youniverse_associations (identity_id);

-- ── 6. Single-Use Password Reset Tokens ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.human_password_resets (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  human_id              UUID        NOT NULL
                                    REFERENCES public.human_continuity_identities(human_id)
                                    ON DELETE CASCADE,
  token_hash            TEXT        NOT NULL UNIQUE,
  expires_at            TIMESTAMPTZ NOT NULL,
  consumed_at           TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS human_password_resets_token_hash_idx
  ON public.human_password_resets (token_hash);

-- ── 7. Ephemeral WebAuthn Challenges ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.webauthn_challenges (
  challenge_id          TEXT        PRIMARY KEY,
  challenge             TEXT        NOT NULL,
  human_id              UUID        REFERENCES public.human_continuity_identities(human_id)
                                    ON DELETE CASCADE,
  type                  TEXT        NOT NULL CHECK (type IN ('registration', 'authentication')),
  expires_at            TIMESTAMPTZ NOT NULL,
  consumed_at           TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS webauthn_challenges_expires_at_idx
  ON public.webauthn_challenges (expires_at);

-- ── 8. Additive Session Columns ─────────────────────────────────────────────
ALTER TABLE public.sessions
  ADD COLUMN IF NOT EXISTS human_id UUID
  REFERENCES public.human_continuity_identities(human_id)
  ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS auth_subject_id UUID
  REFERENCES public.human_auth_subjects(id)
  ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS sessions_human_id_idx ON public.sessions (human_id);

COMMIT;
