-- Onboarding asks the owner which Instagram account they mean *before* sending
-- them to Meta, so a link carries two names: what the owner asked for and what
-- the authorization actually returned. Keeping both is what makes the mismatch
-- ("you asked for @a but signed in as @b") reviewable after the redirect is
-- gone — external_account_ref stays the numeric IG user id the publish path
-- posts through, which no human can eyeball.
-- SQLite reaches the same columns via ensureColumn in sqlite.ts (an ALTER TABLE
-- isn't re-runnable there), so it skips the 0019 slot.

ALTER TABLE store_channel_links
  ADD COLUMN IF NOT EXISTS requested_account_handle text;

ALTER TABLE store_channel_links
  ADD COLUMN IF NOT EXISTS linked_account_username text;
