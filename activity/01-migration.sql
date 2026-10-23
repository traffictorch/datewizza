-- Append inside ensureTables() before its closing brace
await env.MY_BINDING.prepare(
  `CREATE TABLE IF NOT EXISTS user_activity (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    event_type TEXT NOT NULL,
    category TEXT,
    tool TEXT,
    target_id INTEGER,
    target_label TEXT,
    link TEXT,
    created_at INTEGER NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  )`
).run();
try { await env.MY_BINDING.prepare(`CREATE INDEX IF NOT EXISTS idx_activity_user ON user_activity(user_id, created_at DESC)`).run(); } catch (e) {}
try { await env.MY_BINDING.prepare(`ALTER TABLE users ADD COLUMN activity_public INTEGER DEFAULT 1`).run(); } catch (e) {}
