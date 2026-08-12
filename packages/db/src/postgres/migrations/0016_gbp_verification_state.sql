-- Per-listing Google Business Profile verification state, as read from the
-- mybusinessverifications API (VoiceOfMerchantState + fetchVerificationOptions)
-- and interpreted by packages/domain/gbp-verification-state.ts.
--
-- A freshly created listing comes back "Verification required". We attempt the
-- opportunistic AUTO verify at create time, then this row records the resulting
-- state. Google can async-revert an accepted verification, so `state` is a
-- point-in-time read refreshed on-view (no background poller exists yet), and
-- `last_checked_at` records when it was last read.
--
-- Distinct from gbp_locations.status (which gates *publishing* on VERIFIED) and
-- from gbp_access_requests (which tracks org *manager access*): this tracks the
-- listing's *verification* progress, the concierge queue's input signal.
--
-- `auto_attempted` is an integer flag (0/1), not a boolean: the schema stays
-- boolean-free so the same 0/1 binding is portable across the SQLite twin, whose
-- driver rejects JS booleans.
CREATE TABLE IF NOT EXISTS gbp_verification_state (
  id text PRIMARY KEY,
  store_id text NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  -- Google's "locations/{id}" resource name the verification calls target.
  google_location_id text NOT NULL,
  state text NOT NULL CHECK (state IN (
    'VERIFIED', 'PENDING_REVIEW', 'NEEDS_VERIFICATION', 'NEEDS_CONCIERGE', 'UNKNOWN'
  )),
  -- JSON array of the verification-method enums Google last offered; an empty
  -- array means UI/video-only (a concierge case).
  offered_methods jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- Whether the opportunistic AUTO verify was attempted (once, at create time).
  auto_attempted integer NOT NULL DEFAULT 0,
  last_checked_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL
);

-- One verification-state row per store; each re-check updates it in place.
CREATE UNIQUE INDEX IF NOT EXISTS gbp_verification_state_store_idx
  ON gbp_verification_state (store_id);
