-- The call-to-action button a campaign publishes with: Google Business Profile
-- renders it as a real button, Instagram gets it appended to the caption as a
-- labelled link. Per-request like final_copy (0010) — one campaign carries one
-- button across every channel. Null until an operator sets one; there is
-- deliberately no default.
-- SQLite reaches the same columns via ensureColumn in sqlite.ts (an ALTER TABLE
-- isn't re-runnable there), so it skips the 0017 slot.

ALTER TABLE campaign_requests
  ADD COLUMN IF NOT EXISTS gbp_cta_action_type text;

ALTER TABLE campaign_requests
  ADD COLUMN IF NOT EXISTS gbp_cta_url text;

-- CALL renders the listing's phone number and Google ignores any url sent with
-- it, so a CALL row carrying a url would be a lie the caption formatter could
-- still act on. The pairing is enforced in the domain schema too; this is the
-- copy that survives a bad backfill or a hand-written UPDATE.
-- SQLite has no equivalent guard (ensureColumn cannot add constraints), so
-- Postgres — the only runtime prod uses — is where this actually holds.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'campaign_requests_gbp_cta_pairing'
  ) THEN
    ALTER TABLE campaign_requests
      ADD CONSTRAINT campaign_requests_gbp_cta_pairing CHECK (
        (gbp_cta_action_type IS NULL AND gbp_cta_url IS NULL)
        OR (gbp_cta_action_type = 'CALL' AND gbp_cta_url IS NULL)
        OR (gbp_cta_action_type <> 'CALL' AND gbp_cta_url IS NOT NULL)
      );
  END IF;
END $$;
