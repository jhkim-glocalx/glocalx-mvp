-- SQLite twin of postgres/migrations/0016_gbp_verification_state.sql.
CREATE TABLE IF NOT EXISTS gbp_verification_state (
  id TEXT PRIMARY KEY,
  store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  google_location_id TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN (
    'VERIFIED', 'PENDING_REVIEW', 'NEEDS_VERIFICATION', 'NEEDS_CONCIERGE', 'UNKNOWN'
  )),
  offered_methods TEXT NOT NULL DEFAULT '[]',
  auto_attempted INTEGER NOT NULL DEFAULT 0,
  last_checked_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS gbp_verification_state_store_idx
  ON gbp_verification_state (store_id);
