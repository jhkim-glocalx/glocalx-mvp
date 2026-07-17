CREATE TABLE IF NOT EXISTS auth_rate_limits (
  id TEXT PRIMARY KEY,
  attempt_count INTEGER NOT NULL,
  expires_at_epoch INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS auth_rate_limits_expires_at_idx
  ON auth_rate_limits (expires_at_epoch);
