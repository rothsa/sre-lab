-- Display metadata for the board, written by the worker each cycle so the Pages
-- Functions don't need a copy of the private target list. No hosts or URLs here.
CREATE TABLE IF NOT EXISTS targets (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  kind TEXT NOT NULL,
  public INTEGER NOT NULL,
  seen INTEGER NOT NULL,
  position INTEGER NOT NULL DEFAULT 0
);
