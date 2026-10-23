CREATE TABLE IF NOT EXISTS dm_rate_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_dm_rate_user_time ON dm_rate_log(user_id, created_at);
