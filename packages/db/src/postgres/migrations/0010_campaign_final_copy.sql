-- Phase 3 (Marketing Material Pipeline): the operator-authored caption that
-- ships with the processed assets. Per-request rather than per-asset — one
-- campaign publishes one body of copy across every channel.
-- SQLite reaches the same state via ensureColumn in sqlite.ts (an
-- ALTER TABLE isn't re-runnable there), so it skips the 0010 slot.

ALTER TABLE campaign_requests
  ADD COLUMN IF NOT EXISTS final_copy text;
