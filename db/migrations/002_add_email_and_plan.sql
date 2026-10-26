-- Migration 002: Add email, plan, and stripe_session_id to youniverse_identities
ALTER TABLE youniverse_identities
  ADD COLUMN IF NOT EXISTS email TEXT,
  ADD COLUMN IF NOT EXISTS plan TEXT DEFAULT 'free',
  ADD COLUMN IF NOT EXISTS stripe_session_id TEXT;

-- Ensure unique constraint exists on username
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'youniverse_identities_username_key'
  ) THEN
    ALTER TABLE youniverse_identities
      ADD CONSTRAINT youniverse_identities_username_key UNIQUE (username);
  END IF;
END
$$;
