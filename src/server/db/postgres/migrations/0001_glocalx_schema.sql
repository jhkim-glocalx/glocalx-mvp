CREATE TABLE IF NOT EXISTS users (
  id text PRIMARY KEY,
  email text NOT NULL UNIQUE,
  display_name text NOT NULL,
  role text NOT NULL CHECK (role IN ('OWNER', 'ADMIN')),
  created_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS stores (
  id text PRIMARY KEY,
  owner_user_id text NOT NULL REFERENCES users(id),
  name text NOT NULL,
  address text NOT NULL,
  phone text,
  category text NOT NULL,
  hours text,
  onboarding_status text NOT NULL CHECK (onboarding_status IN ('NOT_STARTED', 'IN_PROGRESS', 'COMPLETED')),
  created_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS auth_identities (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES users(id),
  provider text NOT NULL CHECK (provider IN ('GOOGLE', 'KAKAO')),
  provider_subject_id text NOT NULL,
  email text NOT NULL,
  display_name text NOT NULL,
  encrypted_access_token text NOT NULL,
  encrypted_refresh_token text,
  scopes_json jsonb NOT NULL,
  expires_at timestamptz,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  UNIQUE (provider, provider_subject_id)
);

CREATE TABLE IF NOT EXISTS business_profile_extractions (
  id text PRIMARY KEY,
  store_id text NOT NULL REFERENCES stores(id),
  source text NOT NULL CHECK (source IN ('NAVER_LOCAL', 'MANUAL')),
  source_input text NOT NULL,
  status text NOT NULL CHECK (status IN ('CANDIDATES_FOUND', 'MANUAL_INPUT_REQUIRED', 'CONFIRMED')),
  candidate_json jsonb NOT NULL,
  missing_fields_json jsonb NOT NULL,
  created_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS oauth_connections (
  id text PRIMARY KEY,
  store_id text NOT NULL REFERENCES stores(id),
  provider text NOT NULL CHECK (provider IN ('GOOGLE')),
  subject_id text NOT NULL,
  encrypted_access_token text NOT NULL,
  encrypted_refresh_token text,
  scopes_json jsonb NOT NULL,
  expires_at timestamptz,
  created_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS gbp_accounts (
  id text PRIMARY KEY,
  store_id text NOT NULL REFERENCES stores(id),
  google_account_id text NOT NULL,
  account_name text NOT NULL,
  created_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS gbp_locations (
  id text PRIMARY KEY,
  store_id text NOT NULL REFERENCES stores(id),
  gbp_account_id text NOT NULL REFERENCES gbp_accounts(id),
  google_location_id text,
  status text NOT NULL CHECK (
    status IN (
      'DISCOVERED',
      'CLAIM_REQUIRED',
      'CREATE_REQUESTED',
      'VERIFICATION_PENDING',
      'VERIFIED',
      'DUPLICATE',
      'FAILED',
      'MANUAL_FOLLOW_UP'
    )
  ),
  request_admin_rights_url text,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS post_drafts (
  id text PRIMARY KEY,
  store_id text NOT NULL REFERENCES stores(id),
  owner_intent text NOT NULL,
  target_channel text NOT NULL CHECK (target_channel IN ('GBP')),
  status text NOT NULL CHECK (status IN ('DRAFT', 'APPROVED', 'PUBLISHED', 'FAILED')),
  korean_copy text NOT NULL,
  english_copy text NOT NULL,
  revision_of_draft_id text REFERENCES post_drafts(id),
  marketing_preview_json jsonb,
  created_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS post_publish_attempts (
  id text PRIMARY KEY,
  draft_id text NOT NULL REFERENCES post_drafts(id),
  idempotency_key text NOT NULL UNIQUE,
  attempt_number integer NOT NULL CHECK (attempt_number >= 1),
  status text NOT NULL CHECK (status IN ('REQUESTED', 'SUCCEEDED', 'FAILED')),
  gbp_post_id text,
  public_url text,
  error_code text,
  created_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS reviews (
  id text PRIMARY KEY,
  store_id text NOT NULL REFERENCES stores(id),
  source_channel text NOT NULL CHECK (source_channel IN ('GBP')),
  raw_review_id text NOT NULL,
  rating integer NOT NULL CHECK (rating BETWEEN 1 AND 5),
  reviewer_name text NOT NULL,
  review_text text NOT NULL,
  detected_language text NOT NULL,
  sentiment text NOT NULL CHECK (sentiment IN ('POSITIVE', 'NEUTRAL', 'NEGATIVE', 'MALICIOUS')),
  created_at timestamptz NOT NULL,
  reply_status text NOT NULL CHECK (reply_status IN ('NONE', 'SUGGESTED', 'REPLIED', 'BLOCKED')),
  UNIQUE (source_channel, raw_review_id)
);

CREATE TABLE IF NOT EXISTS review_replies (
  id text PRIMARY KEY,
  review_id text NOT NULL REFERENCES reviews(id),
  selected_tone text NOT NULL CHECK (selected_tone IN ('friendly', 'polite', 'witty')),
  reply_text text NOT NULL,
  translated_reply_text text NOT NULL,
  status text NOT NULL CHECK (status IN ('DRAFT', 'PUBLISHED', 'FAILED')),
  gbp_reply_id text,
  created_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS job_runs (
  id text PRIMARY KEY,
  store_id text NOT NULL REFERENCES stores(id),
  job_type text NOT NULL CHECK (job_type IN ('GBP_FOLLOW_UP', 'POST_PUBLISH_RETRY', 'REVIEW_SYNC')),
  status text NOT NULL CHECK (status IN ('SCHEDULED', 'RUNNING', 'SUCCEEDED', 'FAILED')),
  idempotency_key text NOT NULL UNIQUE,
  run_after timestamptz NOT NULL,
  attempts integer NOT NULL CHECK (attempts >= 0),
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id text PRIMARY KEY,
  store_id text REFERENCES stores(id),
  actor_user_id text REFERENCES users(id),
  action text NOT NULL,
  idempotency_key text,
  redacted_payload_json jsonb NOT NULL,
  created_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS conversation_sessions (
  id text PRIMARY KEY,
  store_id text NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('onboarding', 'posting')),
  state text NOT NULL,
  status text NOT NULL CHECK (status IN ('active', 'completed')),
  selected_candidate_id text,
  selected_candidate_json jsonb,
  support_metadata_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  completed_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_conversation_sessions_store_kind_status_updated
  ON conversation_sessions (store_id, kind, status, updated_at);

CREATE TABLE IF NOT EXISTS conversation_messages (
  id text PRIMARY KEY,
  session_id text NOT NULL REFERENCES conversation_sessions(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('owner', 'assistant')),
  client_event_id text,
  content text NOT NULL,
  redacted_content text NOT NULL,
  sequence integer NOT NULL CHECK (sequence >= 1),
  created_at timestamptz NOT NULL,
  UNIQUE (session_id, sequence)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_conversation_messages_client_event
  ON conversation_messages (session_id, client_event_id)
  WHERE client_event_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_conversation_messages_session_sequence
  ON conversation_messages (session_id, sequence);

CREATE TABLE IF NOT EXISTS conversation_slot_values (
  id text PRIMARY KEY,
  session_id text NOT NULL REFERENCES conversation_sessions(id) ON DELETE CASCADE,
  slot_key text NOT NULL,
  value text NOT NULL,
  source text NOT NULL,
  confidence double precision NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_conversation_slot_values_latest
  ON conversation_slot_values (session_id, slot_key);

CREATE TABLE IF NOT EXISTS conversation_events (
  id text PRIMARY KEY,
  session_id text NOT NULL REFERENCES conversation_sessions(id) ON DELETE CASCADE,
  client_event_id text NOT NULL,
  event_type text NOT NULL,
  response_message_id text REFERENCES conversation_messages(id) ON DELETE SET NULL,
  public_response_json jsonb NOT NULL,
  redacted_payload_json jsonb NOT NULL,
  created_at timestamptz NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_conversation_events_client_event
  ON conversation_events (session_id, client_event_id);

