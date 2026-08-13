-- The public address of a published post, as the channel itself reported it:
-- Instagram's permalink, Google's searchUrl. Both adapters already return it and
-- both callers threw it away, so a settled job carried only the channel's own id
-- — which cannot be opened. An operator checking what actually went live had to
-- go hunting in Business Profile Manager or the Instagram profile.
--
-- Nullable and never backfilled: jobs published before this column existed have
-- genuinely lost their url (neither API lets us look one up from the id alone
-- without re-authenticating as the publishing account), and a guessed url is
-- worse than an absent one.
-- SQLite reaches the same column via ensureColumn in sqlite.ts (an ALTER TABLE
-- isn't re-runnable there), so it skips the 0018 slot.

ALTER TABLE publish_jobs
  ADD COLUMN IF NOT EXISTS external_url text;
