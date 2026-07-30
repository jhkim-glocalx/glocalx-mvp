-- Organization GBP manager-access tracking (architecture.md "GBP organization
-- access"). One row per store records how far the org account has gotten toward
-- manager access on that store's Google Business Profile location.
--
-- Distinct from the v1 location-verification state machine
-- (packages/domain/gbp-eligibility.ts), which gates *publishing*: this table
-- tracks the *access grant*, and in v2 every transition is an operator action
-- audited via audit_logs. There is no automated Google polling (architecture
-- §9 open question), so nothing advances these rows on its own.
CREATE TABLE IF NOT EXISTS gbp_access_requests (
  id text PRIMARY KEY,
  store_id text NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  -- Free-form Google location identifier, nullable: a store can be tracked in
  -- not_requested before the operator has pinned down which GBP location it maps
  -- to. Deliberately NOT a foreign key to gbp_locations — the access flow can
  -- start before v1 setup has produced a location row.
  gbp_location_ref text,
  state text NOT NULL CHECK (state IN (
    'not_requested', 'invited', 'pending', 'granted', 'revoked', 'blocked'
  )),
  -- Operator chase note, nullable: the latest free-text status being tracked
  -- (e.g. "owner said they'd accept tonight"). Never owner-authored content.
  note text,
  -- When tracking started (row creation). Staleness age in the dashboard is
  -- derived from updated_at, which moves only on a state change.
  requested_at timestamptz NOT NULL,
  -- Stamped when the request reaches granted; retained as history if it is later
  -- revoked. Nullable until the first grant.
  granted_at timestamptz,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL
);

-- One access request per store: re-running the owner connect flow updates the
-- existing row rather than opening a second, so operator progress is never lost.
CREATE UNIQUE INDEX IF NOT EXISTS gbp_access_requests_store_idx
  ON gbp_access_requests (store_id);
