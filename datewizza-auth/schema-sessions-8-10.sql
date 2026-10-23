CREATE TABLE IF NOT EXISTS rt_config (
  key                  TEXT PRIMARY KEY,
  value                TEXT NOT NULL,
  set_by_resolution_id TEXT,
  set_at               INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS rt_executions (
  id            TEXT PRIMARY KEY,
  resolution_id TEXT NOT NULL,
  target        TEXT NOT NULL,
  status        TEXT NOT NULL,
  external_ref  TEXT,
  payload       TEXT,
  created_at    INTEGER NOT NULL,
  completed_at  INTEGER
);
CREATE INDEX IF NOT EXISTS idx_rt_exec_res ON rt_executions(resolution_id);

INSERT OR IGNORE INTO rt_config (key, value, set_at) VALUES
  ('default_quorum_pct', '0.20', strftime('%s','now')),
  ('default_threshold_pct', '0.66', strftime('%s','now')),
  ('default_block_pct', '0.25', strftime('%s','now'));
