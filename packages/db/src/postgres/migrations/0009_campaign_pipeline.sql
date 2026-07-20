-- Phase 3: Marketing Material Pipeline Migration
-- Defines campaign_requests, campaign_assets, campaign_review_events, and publish_jobs.

CREATE TABLE IF NOT EXISTS campaign_requests (
  id TEXT PRIMARY KEY,
  store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  brief TEXT NOT NULL,
  status TEXT NOT NULL CHECK (
    status IN (
      'submitted',
      'in_production',
      'ready_for_review',
      'approved',
      'changes_requested',
      'rejected',
      'publishing',
      'published',
      'partially_published',
      'failed'
    )
  ),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Queue kanban ordering and per-store lookup indexes (architecture §2).
CREATE INDEX IF NOT EXISTS campaign_requests_status_updated_idx
  ON campaign_requests (status, updated_at);

CREATE INDEX IF NOT EXISTS campaign_requests_store_id_idx
  ON campaign_requests (store_id, updated_at);

CREATE TABLE IF NOT EXISTS campaign_assets (
  id TEXT PRIMARY KEY,
  request_id TEXT NOT NULL REFERENCES campaign_requests(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('original', 'processed')),
  blob_url TEXT NOT NULL,
  content_type TEXT NOT NULL,
  width INTEGER,
  height INTEGER,
  meta_json TEXT NOT NULL DEFAULT '{}',
  uploaded_by TEXT NOT NULL CHECK (uploaded_by IN ('owner', 'admin')),
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS campaign_assets_request_idx
  ON campaign_assets (request_id, kind);

CREATE TABLE IF NOT EXISTS campaign_review_events (
  id TEXT PRIMARY KEY,
  request_id TEXT NOT NULL REFERENCES campaign_requests(id) ON DELETE CASCADE,
  actor TEXT NOT NULL CHECK (actor IN ('owner', 'admin')),
  decision TEXT NOT NULL CHECK (decision IN ('go', 'no_go', 'changes_requested')),
  note TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS campaign_review_events_request_idx
  ON campaign_review_events (request_id, created_at);

CREATE TABLE IF NOT EXISTS publish_jobs (
  id TEXT PRIMARY KEY,
  request_id TEXT NOT NULL REFERENCES campaign_requests(id) ON DELETE CASCADE,
  channel TEXT NOT NULL CHECK (channel IN ('gbp', 'instagram')),
  status TEXT NOT NULL CHECK (status IN ('queued', 'publishing', 'published', 'failed')),
  external_ref TEXT,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  idempotency_key TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS publish_jobs_request_channel_idx
  ON publish_jobs (request_id, channel);

CREATE UNIQUE INDEX IF NOT EXISTS publish_jobs_idempotency_key_idx
  ON publish_jobs (idempotency_key);
