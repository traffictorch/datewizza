CREATE TABLE IF NOT EXISTS push_subscriptions (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id       INTEGER NOT NULL,
  endpoint      TEXT    NOT NULL UNIQUE,
  p256dh        TEXT    NOT NULL,
  auth          TEXT    NOT NULL,
  user_agent    TEXT,
  created_at    INTEGER NOT NULL DEFAULT (unixepoch()),
  last_seen_at  INTEGER NOT NULL DEFAULT (unixepoch()),
  revoked_at    INTEGER DEFAULT NULL
);

CREATE INDEX IF NOT EXISTS idx_push_subs_user
  ON push_subscriptions(user_id);

CREATE INDEX IF NOT EXISTS idx_push_subs_active
  ON push_subscriptions(revoked_at)
  WHERE revoked_at IS NULL;
