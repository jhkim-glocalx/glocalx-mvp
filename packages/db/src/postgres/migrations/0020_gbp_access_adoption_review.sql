-- Owner-claimed adoption of an already-org-owned listing. Stores that we set up
-- by hand in the org account before the app existed have no record here, so a
-- fresh owner signup would otherwise run normal GBP setup and create a *second*
-- Google listing for a business that already has one.
--
-- 'adoption_review' is the only state waiting on us rather than on the owner or
-- Google: the owner said "this is already mine" and an operator must confirm the
-- match before anything is attached. There is no Google approval behind an
-- adoption (the org account is already the manager), so the operator's verdict
-- is the whole authorization — which is why it gets its own state and its own
-- audit codes rather than riding on 'pending'.
ALTER TABLE gbp_access_requests DROP CONSTRAINT IF EXISTS gbp_access_requests_state_check;
ALTER TABLE gbp_access_requests
  ADD CONSTRAINT gbp_access_requests_state_check
  CHECK (state IN (
    'not_requested', 'adoption_review', 'invited', 'pending', 'granted',
    'revoked', 'blocked'
  ));

-- No column for the rejection reason on purpose: it lands in the operator's
-- `note` (why the request stalled, for the Stores console) and in the owner's
-- chat thread (what we need from them). A third copy here would be the one
-- nobody updates.
