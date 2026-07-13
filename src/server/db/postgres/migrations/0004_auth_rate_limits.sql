CREATE TABLE IF NOT EXISTS auth_rate_limits (
  id text PRIMARY KEY,
  attempt_count integer NOT NULL,
  expires_at_epoch double precision NOT NULL
);

CREATE INDEX IF NOT EXISTS auth_rate_limits_expires_at_idx
  ON auth_rate_limits (expires_at_epoch);
