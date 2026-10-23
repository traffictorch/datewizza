ALTER TABLE calendars ADD COLUMN invite_token TEXT;

CREATE TABLE IF NOT EXISTS calendar_members (
  calendar_id INTEGER NOT NULL REFERENCES calendars(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL,
  role TEXT DEFAULT 'editor',
  added_at INTEGER NOT NULL,
  PRIMARY KEY (calendar_id, user_id)
);
