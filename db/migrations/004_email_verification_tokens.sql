-- =============================================================================
-- Migration 004: Establish email verification token store
--
-- Dedicated single-use, hash-backed email verification tokens.
-- The raw token is generated on claim and sent out-of-band via email.
-- Only SHA-256(token) is stored. Once consumed or expired, it cannot be reused.
--
-- Safe to re-run (idempotent).
-- =============================================================================

CREATE TABLE IF NOT EXISTS email_verification_tokens (
  id              TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  identity_id     TEXT        NOT NULL
                              REFERENCES youniverse_identities(identity_id)
                              ON DELETE CASCADE,
  token_hash      TEXT        NOT NULL UNIQUE,  -- SHA-256(raw_verification_token)
  expires_at      TIMESTAMPTZ NOT NULL,
  consumed_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS email_verification_tokens_token_hash_idx
  ON email_verification_tokens (token_hash);

CREATE INDEX IF NOT EXISTS email_verification_tokens_identity_id_idx
  ON email_verification_tokens (identity_id);
