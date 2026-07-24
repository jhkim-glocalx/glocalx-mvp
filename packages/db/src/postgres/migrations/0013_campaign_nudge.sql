-- Phase 3 task 8: the operator's out-of-band nudge. v2 has no push channel, so
-- a request sitting in ready_for_review only moves when an operator personally
-- messages the owner on the channel they already use — this column is how the
-- queue knows that happened. Null means "still owed a nudge"; every status
-- change clears it, because the nudge belongs to the state the owner is in now.
-- SQLite reaches the same state via ensureColumn in sqlite.ts (an ALTER TABLE
-- isn't re-runnable there), so it skips the 0013 slot.

ALTER TABLE campaign_requests
  ADD COLUMN IF NOT EXISTS nudged_at timestamptz;
