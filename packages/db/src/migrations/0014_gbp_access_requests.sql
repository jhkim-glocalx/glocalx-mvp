-- SQLite twin of postgres/migrations/0014_gbp_access_requests.sql.
CREATE TABLE IF NOT EXISTS gbp_access_requests (
  id TEXT PRIMARY KEY,
  store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  gbp_location_ref TEXT,
  state TEXT NOT NULL CHECK (state IN (
    'not_requested', 'invited', 'pending', 'granted', 'revoked', 'blocked'
  )),
  note TEXT,
  requested_at TEXT NOT NULL,
  granted_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS gbp_access_requests_store_idx
  ON gbp_access_requests (store_id);
