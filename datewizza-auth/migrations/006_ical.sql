CREATE TABLE IF NOT EXISTS calendar_feeds (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  calendar_id INTEGER NOT NULL REFERENCES calendars(id) ON DELETE CASCADE,
  name TEXT DEFAULT 'External Feed',
  url TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS external_events (
  id TEXT PRIMARY KEY, 
  feed_id INTEGER NOT NULL REFERENCES calendar_feeds(id) ON DELETE CASCADE,
  title TEXT,
  start_at INTEGER,
  end_at INTEGER
);
