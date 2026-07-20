-- Phase 2 (AI mode + seamless handoff): widen the conversation mode enum to add
-- the "AI drafts, operator sends" posture, mark AI-composed drafts on messages,
-- and let a failed AI composition flag a conversation for operator attention.
-- New conversations still open in 'human' mode (concierge default); ai_draft/ai
-- are per-conversation operator opt-ins.

ALTER TABLE cs_conversations DROP CONSTRAINT IF EXISTS cs_conversations_mode_check;
ALTER TABLE cs_conversations
  ADD CONSTRAINT cs_conversations_mode_check
  CHECK (mode IN ('ai_draft', 'ai', 'human'));

-- Draft posture: AI-composed assistant messages that are never owner-visible
-- until an operator sends them (the one-assistant illusion seam, architecture §5).
ALTER TABLE cs_messages
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'sent'
  CHECK (status IN ('sent', 'draft'));

-- Owner reads and unread counts must skip drafts; a partial index keeps that
-- filtered cursor scan cheap (mirrors cs_messages_conversation_cursor_idx).
CREATE INDEX IF NOT EXISTS cs_messages_owner_visible_cursor_idx
  ON cs_messages (conversation_id, created_at, id)
  WHERE status = 'sent';

-- AI failure surfacing: a flagged conversation shows in the dashboard so an
-- operator can step in — an AI error never silently drops the owner's message
-- (architecture §5). Cleared when the operator takes over.
ALTER TABLE cs_conversations ADD COLUMN IF NOT EXISTS flagged_at timestamptz;
ALTER TABLE cs_conversations ADD COLUMN IF NOT EXISTS flag_reason text;
