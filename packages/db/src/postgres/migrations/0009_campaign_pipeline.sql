-- Phase 3 (Marketing Material Pipeline): campaign requests, their media assets,
-- the owner/operator review trail, and per-channel publish jobs.

CREATE TABLE IF NOT EXISTS campaign_requests (
  id text PRIMARY KEY,
  store_id text NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  brief text NOT NULL,
  status text NOT NULL CHECK (
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
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL
);

-- Queue kanban ordering and per-store lookup indexes (architecture §2).
CREATE INDEX IF NOT EXISTS campaign_requests_status_updated_idx
  ON campaign_requests (status, updated_at);

CREATE INDEX IF NOT EXISTS campaign_requests_store_id_idx
  ON campaign_requests (store_id, updated_at);

CREATE TABLE IF NOT EXISTS campaign_assets (
  id text PRIMARY KEY,
  request_id text NOT NULL REFERENCES campaign_requests(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('original', 'processed')),
  blob_url text NOT NULL,
  content_type text NOT NULL,
  width integer,
  height integer,
  meta_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  uploaded_by text NOT NULL CHECK (uploaded_by IN ('owner', 'admin')),
  created_at timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS campaign_assets_request_idx
  ON campaign_assets (request_id, kind);

CREATE TABLE IF NOT EXISTS campaign_review_events (
  id text PRIMARY KEY,
  request_id text NOT NULL REFERENCES campaign_requests(id) ON DELETE CASCADE,
  actor text NOT NULL CHECK (actor IN ('owner', 'admin')),
  decision text NOT NULL CHECK (decision IN ('go', 'no_go', 'changes_requested')),
  note text,
  created_at timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS campaign_review_events_request_idx
  ON campaign_review_events (request_id, created_at);

CREATE TABLE IF NOT EXISTS publish_jobs (
  id text PRIMARY KEY,
  request_id text NOT NULL REFERENCES campaign_requests(id) ON DELETE CASCADE,
  channel text NOT NULL CHECK (channel IN ('gbp', 'instagram')),
  status text NOT NULL CHECK (status IN ('queued', 'publishing', 'published', 'failed')),
  external_ref text,
  attempt_count integer NOT NULL DEFAULT 0,
  last_error text,
  idempotency_key text NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL
);

-- One job per channel per request, plus a globally unique idempotency key so a
-- retried publish never double-posts to GBP/Instagram.
CREATE UNIQUE INDEX IF NOT EXISTS publish_jobs_request_channel_idx
  ON publish_jobs (request_id, channel);

CREATE UNIQUE INDEX IF NOT EXISTS publish_jobs_idempotency_key_idx
  ON publish_jobs (idempotency_key);
