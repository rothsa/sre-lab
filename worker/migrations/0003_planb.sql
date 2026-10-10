-- Plan B (AI failover demo): daily caps and per-visitor rate limiting.
-- No raw IPs are stored: ip_hash is SHA-256 of a salt, the UTC day and the IP, so it can't be
-- reversed or linked across days. Rows older than a day are pruned on every request.
CREATE TABLE IF NOT EXISTS planb_budget (
  day TEXT PRIMARY KEY,                 -- UTC day, YYYY-MM-DD
  runs INTEGER NOT NULL DEFAULT 0,      -- gateway calls made
  rescues INTEGER NOT NULL DEFAULT 0    -- runs where the Anthropic fallback was allowed or answered
);

CREATE TABLE IF NOT EXISTS planb_hits (
  ip_hash TEXT NOT NULL,
  ts INTEGER NOT NULL                   -- epoch ms
);
CREATE INDEX IF NOT EXISTS planb_hits_hash_ts ON planb_hits (ip_hash, ts);
CREATE INDEX IF NOT EXISTS planb_hits_ts ON planb_hits (ts);
