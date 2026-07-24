-- SQLite twin of postgres/migrations/0012_org_credentials.sql.
CREATE TABLE IF NOT EXISTS org_credentials (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL CHECK (provider IN ('google_org', 'meta_app')),
  encrypted_token TEXT NOT NULL,
  encrypted_refresh_token TEXT,
  expires_at TEXT,
  scopes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS org_credentials_provider_idx
  ON org_credentials (provider);
