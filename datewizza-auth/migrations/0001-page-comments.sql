CREATE TABLE IF NOT EXISTS page_comments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  page_path TEXT NOT NULL,
  user_id INTEGER NOT NULL,
  body TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_page_comments_path_time ON page_comments (page_path, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_page_comments_user_path ON page_comments (user_id, page_path, created_at DESC);
