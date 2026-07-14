CREATE TABLE IF NOT EXISTS gbp_registration_intents (
  id TEXT PRIMARY KEY,
  store_id TEXT NOT NULL,
  google_subject_id TEXT NOT NULL,
  payload_digest TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  consumed_at TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_gbp_registration_intents_store
  ON gbp_registration_intents(store_id, created_at);
