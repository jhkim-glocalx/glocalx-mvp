CREATE TABLE IF NOT EXISTS cs_conversations (
  id text PRIMARY KEY,
  store_id text NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  mode text NOT NULL CHECK (mode IN ('ai', 'human')),
  status text NOT NULL CHECK (status IN ('open', 'resolved')),
  assigned_admin_id text REFERENCES admin_users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL
);

-- Inbox ordering: awaiting-reply conversations surface by recency (architecture §2).
CREATE INDEX IF NOT EXISTS cs_conversations_status_updated_idx
  ON cs_conversations (status, updated_at);

-- One open conversation per store at a time (architecture §3/§5); a resolved
-- conversation frees the slot for a new one.
CREATE UNIQUE INDEX IF NOT EXISTS cs_conversations_one_open_per_store_idx
  ON cs_conversations (store_id)
  WHERE status = 'open';

CREATE TABLE IF NOT EXISTS cs_messages (
  id text PRIMARY KEY,
  conversation_id text NOT NULL REFERENCES cs_conversations(id) ON DELETE CASCADE,
  -- sender is what the owner sees (one "assistant" persona); author_kind is
  -- what operations knows about who actually wrote it (architecture §2).
  sender text NOT NULL CHECK (sender IN ('owner', 'assistant')),
  author_kind text NOT NULL CHECK (author_kind IN ('user', 'ai', 'admin')),
  author_admin_id text REFERENCES admin_users(id) ON DELETE SET NULL,
  body text NOT NULL,
  created_at timestamptz NOT NULL,
  owner_read_at timestamptz,
  admin_read_at timestamptz
);

-- Cursor reads for polling: ids are random UUIDs, so the cursor orders by
-- (created_at, id) with id as a stable tiebreak (matches audit-log pagination).
CREATE INDEX IF NOT EXISTS cs_messages_conversation_cursor_idx
  ON cs_messages (conversation_id, created_at, id);

CREATE TABLE IF NOT EXISTS cs_message_context (
  id text PRIMARY KEY,
  message_id text NOT NULL REFERENCES cs_messages(id) ON DELETE CASCADE,
  section text NOT NULL,
  stage text,
  activity_trail_json jsonb NOT NULL,
  captured_at timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS cs_message_context_message_idx
  ON cs_message_context (message_id);

CREATE TABLE IF NOT EXISTS activity_events (
  id text PRIMARY KEY,
  store_id text NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  session_id text,
  section text NOT NULL,
  action text NOT NULL,
  -- Whitelisted keys only, enforced in packages/domain — never free text,
  -- keystrokes, or credential material (architecture §7).
  detail_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL
);

-- Store timeline in the dashboard (architecture §2).
CREATE INDEX IF NOT EXISTS activity_events_store_created_idx
  ON activity_events (store_id, created_at);
