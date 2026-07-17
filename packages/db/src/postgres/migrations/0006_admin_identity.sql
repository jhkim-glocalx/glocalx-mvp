CREATE TABLE IF NOT EXISTS admin_users (
  id text PRIMARY KEY,
  email text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  display_name text NOT NULL,
  role text NOT NULL CHECK (role IN ('OPERATOR', 'OWNER')),
  status text NOT NULL CHECK (status IN ('ACTIVE', 'DISABLED')),
  created_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS admin_sessions (
  id text PRIMARY KEY,
  admin_user_id text NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS admin_sessions_expires_at_idx
  ON admin_sessions (expires_at);
