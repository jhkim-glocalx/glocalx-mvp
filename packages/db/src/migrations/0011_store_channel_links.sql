-- SQLite twin of postgres/migrations/0011_store_channel_links.sql.
CREATE TABLE IF NOT EXISTS store_channel_links (
  id TEXT PRIMARY KEY,
  store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  channel TEXT NOT NULL CHECK (channel IN ('gbp', 'instagram')),
  external_account_ref TEXT NOT NULL,
  encrypted_token TEXT,
  status TEXT NOT NULL CHECK (status IN ('linked', 'expired', 'revoked')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS store_channel_links_store_channel_idx
  ON store_channel_links (store_id, channel);
