ALTER TABLE post_drafts
  DROP CONSTRAINT IF EXISTS post_drafts_target_channel_check;

ALTER TABLE post_drafts
  ADD CONSTRAINT post_drafts_target_channel_check
  CHECK (target_channel IN ('GBP', 'INSTAGRAM'));

ALTER TABLE post_publish_attempts
  ADD COLUMN IF NOT EXISTS platform text NOT NULL DEFAULT 'GBP'
  CHECK (platform IN ('GBP', 'INSTAGRAM'));

ALTER TABLE post_publish_attempts
  ADD COLUMN IF NOT EXISTS external_post_id text;

UPDATE post_publish_attempts
SET external_post_id = gbp_post_id
WHERE external_post_id IS NULL AND gbp_post_id IS NOT NULL;
