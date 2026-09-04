CREATE TABLE youniverse_identities (
  identity_id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  subdomain TEXT NOT NULL UNIQUE,
  identity_type TEXT NOT NULL
    CHECK (identity_type IN ('person', 'agent')),
  created_at TIMESTAMPTZ NOT NULL
);
