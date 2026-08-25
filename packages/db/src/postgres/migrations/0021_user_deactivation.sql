-- Admin dashboard "delete user" is a soft delete: the row (and everything it
-- owns via FKs — stores, posts, audit trail) stays for record-keeping, but a
-- deactivated user can no longer sign in, and any session they already hold is
-- invalidated by the operator action that sets this column, not by the login
-- path re-checking it every request.
-- SQLite reaches the same column via ensureColumn in sqlite.ts (ALTER TABLE
-- isn't re-runnable there), so it skips the 0021 slot.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS deactivated_at timestamptz;
