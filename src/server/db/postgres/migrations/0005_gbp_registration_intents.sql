CREATE TABLE IF NOT EXISTS gbp_registration_intents (
  id TEXT PRIMARY KEY,
  store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  google_subject_id TEXT NOT NULL,
  payload_digest TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_gbp_registration_intents_store
  ON gbp_registration_intents(store_id, created_at);
