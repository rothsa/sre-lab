CREATE TABLE IF NOT EXISTS checks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts INTEGER NOT NULL,
  target TEXT NOT NULL,
  ok INTEGER NOT NULL,
  status TEXT,
  latency_ms INTEGER,
  detail TEXT
);
CREATE INDEX IF NOT EXISTS checks_target_ts ON checks (target, ts);

CREATE TABLE IF NOT EXISTS state (
  target TEXT PRIMARY KEY,
  status TEXT NOT NULL,          -- up | slow | down
  since INTEGER NOT NULL,
  last_jev_ts INTEGER,
  notified INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS verdicts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts INTEGER NOT NULL,
  target TEXT NOT NULL,
  cause TEXT,
  confidence REAL,
  notify_prob REAL,
  model TEXT
);
CREATE INDEX IF NOT EXISTS verdicts_target_ts ON verdicts (target, ts);

CREATE TABLE IF NOT EXISTS budget (
  day TEXT PRIMARY KEY,
  jev_calls INTEGER NOT NULL DEFAULT 0
);
