-- =============================================================================
-- Migration 005: Establish handoff tokens table for RS256 subdomain transfer
--
-- Single-use, short-lived (90s) cryptographic nonces for secure handoffs
-- between @welcome and personal subdomains (<handle>.itsyouonline.com).
--
-- Safe to re-run (idempotent).
-- =============================================================================

CREATE TABLE IF NOT EXISTS handoff_tokens (
    token_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    handle VARCHAR(32) NOT NULL,
    nonce VARCHAR(64) UNIQUE NOT NULL,
    consumed BOOLEAN NOT NULL DEFAULT FALSE,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_handoff_active ON handoff_tokens(nonce, consumed, expires_at);
CREATE INDEX IF NOT EXISTS idx_handoff_handle ON handoff_tokens(handle);
