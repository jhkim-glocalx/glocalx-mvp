-- Organization-wide publishing credentials (architecture.md "Organization
-- publishing credentials"). v1 published with the *owner's* Google token; v2
-- inverts that so one org account publishes to many stores' GBP locations.
--
-- Org-wide, not per-store: `provider` is unique, so there is exactly one live
-- credential per provider and the publish path never has to choose between
-- candidates. Per-store linkage stays in store_channel_links.
--
-- Tokens are encrypted with the TOKEN_ENCRYPTION_KEY mechanism before they
-- reach this table and are read only by the admin app.
CREATE TABLE IF NOT EXISTS org_credentials (
  id text PRIMARY KEY,
  provider text NOT NULL CHECK (provider IN ('google_org', 'meta_app')),
  encrypted_token text NOT NULL,
  -- Nullable: long-lived credentials (a Meta app token) have nothing to refresh.
  encrypted_refresh_token text,
  -- Nullable means "no known expiry" — a credential that never reports one is
  -- usable, which is different from an expires_at already in the past.
  expires_at timestamptz,
  scopes text,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS org_credentials_provider_idx
  ON org_credentials (provider);
