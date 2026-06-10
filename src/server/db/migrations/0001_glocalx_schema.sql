PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('OWNER', 'ADMIN')),
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS stores (
  id TEXT PRIMARY KEY,
  owner_user_id TEXT NOT NULL REFERENCES users(id),
  name TEXT NOT NULL,
  address TEXT NOT NULL,
  phone TEXT,
  category TEXT NOT NULL,
  hours TEXT,
  onboarding_status TEXT NOT NULL CHECK (onboarding_status IN ('NOT_STARTED', 'IN_PROGRESS', 'COMPLETED')),
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS auth_identities (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  provider TEXT NOT NULL CHECK (provider IN ('GOOGLE', 'KAKAO')),
  provider_subject_id TEXT NOT NULL,
  email TEXT NOT NULL,
  display_name TEXT NOT NULL,
  encrypted_access_token TEXT NOT NULL,
  encrypted_refresh_token TEXT,
  scopes_json TEXT NOT NULL,
  expires_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (provider, provider_subject_id)
);

CREATE TABLE IF NOT EXISTS business_profile_extractions (
  id TEXT PRIMARY KEY,
  store_id TEXT NOT NULL REFERENCES stores(id),
  source TEXT NOT NULL CHECK (source IN ('NAVER_LOCAL', 'MANUAL')),
  source_input TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('CANDIDATES_FOUND', 'MANUAL_INPUT_REQUIRED', 'CONFIRMED')),
  candidate_json TEXT NOT NULL,
  missing_fields_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS oauth_connections (
  id TEXT PRIMARY KEY,
  store_id TEXT NOT NULL REFERENCES stores(id),
  provider TEXT NOT NULL CHECK (provider IN ('GOOGLE')),
  subject_id TEXT NOT NULL,
  encrypted_access_token TEXT NOT NULL,
  encrypted_refresh_token TEXT,
  scopes_json TEXT NOT NULL,
  expires_at TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS gbp_accounts (
  id TEXT PRIMARY KEY,
  store_id TEXT NOT NULL REFERENCES stores(id),
  google_account_id TEXT NOT NULL,
  account_name TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS gbp_locations (
  id TEXT PRIMARY KEY,
  store_id TEXT NOT NULL REFERENCES stores(id),
  gbp_account_id TEXT NOT NULL REFERENCES gbp_accounts(id),
  google_location_id TEXT,
  status TEXT NOT NULL CHECK (
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
  request_admin_rights_url TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS post_drafts (
  id TEXT PRIMARY KEY,
  store_id TEXT NOT NULL REFERENCES stores(id),
  owner_intent TEXT NOT NULL,
  target_channel TEXT NOT NULL CHECK (target_channel IN ('GBP')),
  status TEXT NOT NULL CHECK (status IN ('DRAFT', 'APPROVED', 'PUBLISHED', 'FAILED')),
  korean_copy TEXT NOT NULL,
  english_copy TEXT NOT NULL,
  revision_of_draft_id TEXT REFERENCES post_drafts(id),
  marketing_preview_json TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS post_publish_attempts (
  id TEXT PRIMARY KEY,
  draft_id TEXT NOT NULL REFERENCES post_drafts(id),
  idempotency_key TEXT NOT NULL UNIQUE,
  attempt_number INTEGER NOT NULL CHECK (attempt_number >= 1),
  status TEXT NOT NULL CHECK (status IN ('REQUESTED', 'SUCCEEDED', 'FAILED')),
  gbp_post_id TEXT,
  public_url TEXT,
  error_code TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS reviews (
  id TEXT PRIMARY KEY,
  store_id TEXT NOT NULL REFERENCES stores(id),
  source_channel TEXT NOT NULL CHECK (source_channel IN ('GBP')),
  raw_review_id TEXT NOT NULL,
  rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  reviewer_name TEXT NOT NULL,
  review_text TEXT NOT NULL,
  detected_language TEXT NOT NULL,
  sentiment TEXT NOT NULL CHECK (sentiment IN ('POSITIVE', 'NEUTRAL', 'NEGATIVE', 'MALICIOUS')),
  created_at TEXT NOT NULL,
  reply_status TEXT NOT NULL CHECK (reply_status IN ('NONE', 'SUGGESTED', 'REPLIED', 'BLOCKED')),
  UNIQUE (source_channel, raw_review_id)
);

CREATE TABLE IF NOT EXISTS review_replies (
  id TEXT PRIMARY KEY,
  review_id TEXT NOT NULL REFERENCES reviews(id),
  selected_tone TEXT NOT NULL CHECK (selected_tone IN ('friendly', 'polite', 'witty')),
  reply_text TEXT NOT NULL,
  translated_reply_text TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('DRAFT', 'PUBLISHED', 'FAILED')),
  gbp_reply_id TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS job_runs (
  id TEXT PRIMARY KEY,
  store_id TEXT NOT NULL REFERENCES stores(id),
  job_type TEXT NOT NULL CHECK (job_type IN ('GBP_FOLLOW_UP', 'POST_PUBLISH_RETRY', 'REVIEW_SYNC')),
  status TEXT NOT NULL CHECK (status IN ('SCHEDULED', 'RUNNING', 'SUCCEEDED', 'FAILED')),
  idempotency_key TEXT NOT NULL UNIQUE,
  run_after TEXT NOT NULL,
  attempts INTEGER NOT NULL CHECK (attempts >= 0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  store_id TEXT REFERENCES stores(id),
  actor_user_id TEXT REFERENCES users(id),
  action TEXT NOT NULL,
  idempotency_key TEXT,
  redacted_payload_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);
