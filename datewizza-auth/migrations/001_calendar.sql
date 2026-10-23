-- datewizza-auth/migrations/001_calendar.sql
-- Run: cd datewizza-auth && npx wrangler d1 execute datewizza-db --remote --file=./migrations/001_calendar.sql

CREATE TABLE IF NOT EXISTS calendars (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  color TEXT DEFAULT '#10b981',
  is_default INTEGER DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  calendar_id INTEGER NOT NULL REFERENCES calendars(id) ON DELETE CASCADE,
  created_by INTEGER NOT NULL,
  title TEXT NOT NULL,
  start_at INTEGER NOT NULL,
  duration_min INTEGER DEFAULT 30,
  timezone TEXT DEFAULT 'UTC',
  location TEXT,
  location_lat REAL,
  location_lng REAL,
  notes TEXT,
  tag TEXT,
  purpose TEXT DEFAULT 'custom',
  cost_estimate_cents INTEGER DEFAULT 0,
  co2_grams INTEGER DEFAULT 0,
  status TEXT DEFAULT 'scheduled',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  calendar_id INTEGER NOT NULL REFERENCES calendars(id) ON DELETE CASCADE,
  created_by INTEGER NOT NULL,
  title TEXT NOT NULL,
  due_at INTEGER,
  effort_min INTEGER,
  energy_level TEXT DEFAULT 'medium',
  done INTEGER DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS reminders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id INTEGER REFERENCES events(id) ON DELETE CASCADE,
  task_id INTEGER REFERENCES tasks(id) ON DELETE CASCADE,
  offset_min INTEGER NOT NULL,
  channel TEXT DEFAULT 'email',
  message TEXT,
  sent_at INTEGER
);

CREATE TABLE IF NOT EXISTS event_participants (
  event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  user_id INTEGER,
  status TEXT DEFAULT 'invited',
  added_at INTEGER NOT NULL,
  PRIMARY KEY (event_id, email)
);

CREATE TABLE IF NOT EXISTS memos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  calendar_id INTEGER NOT NULL REFERENCES calendars(id) ON DELETE CASCADE,
  created_by INTEGER NOT NULL,
  body TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_events_calendar_start ON events(calendar_id, start_at);
CREATE INDEX IF NOT EXISTS idx_events_start ON events(start_at);
CREATE INDEX IF NOT EXISTS idx_tasks_calendar_due ON tasks(calendar_id, due_at);
CREATE INDEX IF NOT EXISTS idx_reminders_pending ON reminders(sent_at);
CREATE INDEX IF NOT EXISTS idx_calendars_owner ON calendars(owner_id);
