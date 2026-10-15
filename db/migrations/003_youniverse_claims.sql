-- ─────────────────────────────────────────────────────────────
-- 003 · Handle Claims, Identity Seeds & Subdomain Handoff Tokens
--
-- Cryptographic origin verification & single-use nonce ledger
-- for secure handoffs between @welcome and personal subdomains.
-- ─────────────────────────────────────────────────────────────

-- 1. Handle Registrations & Reservation Ledger
CREATE TABLE IF NOT EXISTS handles (
    handle VARCHAR(32) PRIMARY KEY,
    owner_email VARCHAR(255) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'claimed' CHECK (status IN ('reserved', 'claimed', 'suspended')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_handles_owner ON handles(owner_email);

-- Ensure @welcome is reserved in the ledger
INSERT INTO handles (handle, owner_email, status, created_at)
VALUES ('welcome', 'system@itsyouonline.com', 'reserved', NOW())
ON CONFLICT (handle) DO UPDATE SET status = 'reserved';

-- 2. Youniverse Identity Seeds (Configuration State)
CREATE TABLE IF NOT EXISTS youniverse_seeds (
    handle VARCHAR(32) PRIMARY KEY REFERENCES handles(handle) ON DELETE CASCADE,
    energy_hue SMALLINT NOT NULL CHECK (energy_hue BETWEEN 0 AND 360),
    foundation_laws JSONB NOT NULL DEFAULT '[]'::jsonb,
    is_system BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed @welcome configuration
INSERT INTO youniverse_seeds (handle, energy_hue, foundation_laws, is_system, created_at)
VALUES ('welcome', 258, '["Creative", "Open"]'::jsonb, TRUE, NOW())
ON CONFLICT (handle) DO NOTHING;

-- 3. Handoff Tokens (Short-lived JWT nonces for subdomain transfer)
CREATE TABLE IF NOT EXISTS handoff_tokens (
    token_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    handle VARCHAR(32) NOT NULL REFERENCES handles(handle) ON DELETE CASCADE,
    nonce VARCHAR(64) UNIQUE NOT NULL,
    consumed BOOLEAN NOT NULL DEFAULT FALSE,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_handoff_active ON handoff_tokens(nonce, consumed, expires_at);
