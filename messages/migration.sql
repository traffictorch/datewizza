CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  from_user_id INTEGER NOT NULL,
  to_user_id   INTEGER NOT NULL,
  body         TEXT NOT NULL,
  is_read      INTEGER DEFAULT 0,
  is_deleted   INTEGER DEFAULT 0,
  reply_to_id  INTEGER,
  created_at   INTEGER NOT NULL,
  read_at      INTEGER,
  deleted_at   INTEGER
);
CREATE INDEX IF NOT EXISTS idx_messages_to     ON messages(to_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_from   ON messages(from_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_thread ON messages(from_user_id, to_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_unread ON messages(to_user_id, is_read);

CREATE TABLE IF NOT EXISTS message_reactions (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  message_id  INTEGER NOT NULL,
  user_id     INTEGER NOT NULL,
  emoji       TEXT NOT NULL,
  created_at  INTEGER NOT NULL,
  UNIQUE(message_id, user_id, emoji)
);
CREATE INDEX IF NOT EXISTS idx_reactions_msg ON message_reactions(message_id);

CREATE TABLE IF NOT EXISTS message_attachments (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  message_id    INTEGER NOT NULL,
  r2_key        TEXT NOT NULL,
  filename      TEXT NOT NULL,
  content_type  TEXT NOT NULL,
  size_bytes    INTEGER NOT NULL,
  created_at    INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_attach_msg ON message_attachments(message_id);

CREATE TABLE IF NOT EXISTS message_mutes (
  user_id       INTEGER NOT NULL,
  muted_user_id INTEGER NOT NULL,
  created_at    INTEGER NOT NULL,
  PRIMARY KEY (user_id, muted_user_id)
);
