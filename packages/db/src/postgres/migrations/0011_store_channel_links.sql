-- Per-store publishing channel linkage (architecture.md "Organization
-- publishing credentials"). Phase 3 task 6 uses only the linkage *status* to
-- gate the publish panel; task 7 fills in encrypted_token and the refresh
-- handling that turns an expired link into a blocked_by_credentials result.
--
-- `channel` carries the full publish-channel enum so it matches
-- publishChannelSchema exactly, even though GBP eligibility is currently
-- derived from gbp_locations.status rather than a row here.
CREATE TABLE IF NOT EXISTS store_channel_links (
  id text PRIMARY KEY,
  store_id text NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  channel text NOT NULL CHECK (channel IN ('gbp', 'instagram')),
  external_account_ref text NOT NULL,
  encrypted_token text,
  status text NOT NULL CHECK (status IN ('linked', 'expired', 'revoked')),
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL
);

-- A store links a channel at most once; re-linking updates the row in place so
-- the publish panel never has to pick between two candidate links.
CREATE UNIQUE INDEX IF NOT EXISTS store_channel_links_store_channel_idx
  ON store_channel_links (store_id, channel);
