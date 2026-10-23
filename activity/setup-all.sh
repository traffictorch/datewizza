#!/bin/bash
set -e
cd "$(dirname "$0")"

# ── 01-migration.sql ────────────────────────────────────────
cat > 01-migration.sql << 'FILE_EOF'
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
FILE_EOF

# ── 02-logger.js ────────────────────────────────────────────
cat > 02-logger.js << 'FILE_EOF'
// Insert after getUserTotalPoints(), before "// Profile routes"
async function logActivity(env, userId, eventType, opts = {}) {
  try {
    const now = Date.now();
    await env.MY_BINDING.batch([
      env.MY_BINDING.prepare(
        `INSERT INTO user_activity (user_id, event_type, category, tool, target_id, target_label, link, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        userId, eventType,
        opts.category || null, opts.tool || null,
        opts.targetId || null, opts.targetLabel || null, opts.link || null,
        now
      ),
      env.MY_BINDING.prepare(
        `DELETE FROM user_activity WHERE user_id = ? AND id NOT IN (
           SELECT id FROM user_activity WHERE user_id = ? ORDER BY created_at DESC LIMIT 24
         )`
      ).bind(userId, userId)
    ]);
  } catch (e) { console.error('logActivity error:', e.message); }
}
FILE_EOF

# ── 03-endpoints.js ─────────────────────────────────────────
cat > 03-endpoints.js << 'FILE_EOF'
// Insert before "// Feed + comments + notifications + points routes"
async function handleActivityRoutes(request, env, url) {
  if (request.method !== 'GET') return null;
  const path = url.pathname;
  const isMe      = path === '/api/activity/me';
  const isNetwork = path === '/api/activity/network';
  const isUser    = path.startsWith('/api/activity/user/');
  if (!isMe && !isNetwork && !isUser) return null;

  const user = await getUserFromToken(request, env);
  if (!user) return feedJson({ error: 'Unauthorized' }, 401);

  const type     = (url.searchParams.get('type')     || 'all').toLowerCase();
  const category = (url.searchParams.get('category') || 'all').toLowerCase();
  const tool     = (url.searchParams.get('tool')     || 'all').toLowerCase();
  const time     = (url.searchParams.get('time')     || 'all').toLowerCase();
  const cursor   = parseInt(url.searchParams.get('cursor') || '0', 10) || 0;
  const limit    = Math.min(Math.max(parseInt(url.searchParams.get('limit') || '20', 10) || 20, 1), 50);

  const now = Date.now();
  let since = 0;
  if (time === 'today') since = now - 24 * 3600 * 1000;
  else if (time === 'week') since = now - 7 * 86400 * 1000;
  else if (time === 'month') since = now - 30 * 86400 * 1000;

  let userIds = [];
  let scope = 'network';

  if (isMe) {
    userIds = [user.id];
    scope = 'me';
  } else if (isNetwork) {
    scope = (url.searchParams.get('scope') || 'network').toLowerCase();
    if (scope === 'everyone') {
      const rows = await env.MY_BINDING.prepare(
        `SELECT id FROM users WHERE profile_public = 1 AND activity_public = 1`
      ).all();
      const blockRows = await env.MY_BINDING.prepare(
        `SELECT blocked_user_id AS x FROM blocks WHERE user_id = ?
         UNION SELECT user_id AS x FROM blocks WHERE blocked_user_id = ?`
      ).bind(user.id, user.id).all();
      const blocked = new Set((blockRows.results || []).map(r => r.x));
      userIds = (rows.results || []).map(r => r.id).filter(id => !blocked.has(id));
    } else {
      const net = await env.MY_BINDING.prepare(
        `SELECT network_user_id FROM network WHERE user_id = ?`
      ).bind(user.id).all();
      userIds = [user.id, ...(net.results || []).map(r => r.network_user_id)];
    }
  } else {
    const username = decodeURIComponent(path.replace('/api/activity/user/', '').replace(/\/$/, ''));
    const target = await env.MY_BINDING.prepare(
      'SELECT id, activity_public FROM users WHERE username = ?'
    ).bind(username).first();
    if (!target) return feedJson({ error: 'Not found' }, 404);
    if (target.id !== user.id && target.activity_public === 0) {
      return feedJson({ private: true, items: [], has_more: false, cursor: null });
    }
    userIds = [target.id];
    scope = 'user';
  }

  if (!userIds.length) return feedJson({ items: [], has_more: false, cursor: null, scope });

  const ph = userIds.map(() => '?').join(',');
  const args = [...userIds];
  let where = `a.user_id IN (${ph})`;
  if (type !== 'all')     { where += ' AND a.event_type = ?'; args.push(type); }
  if (category !== 'all') { where += ' AND a.category = ?';   args.push(category); }
  if (tool !== 'all')     { where += ' AND a.tool = ?';       args.push(tool); }
  if (since > 0)          { where += ' AND a.created_at > ?'; args.push(since); }
  if (cursor > 0)         { where += ' AND a.created_at < ?'; args.push(cursor); }

  const sql = `
    SELECT a.id, a.user_id, a.event_type, a.category, a.tool,
           a.target_id, a.target_label, a.link, a.created_at,
           u.username,
           COALESCE(u.name, u.username)       AS display_name,
           COALESCE(u.avatar_preset, 'owner') AS avatar_preset
      FROM user_activity a
      JOIN users u ON u.id = a.user_id
     WHERE ${where}
     ORDER BY a.created_at DESC
     LIMIT ?
  `;
  args.push(limit + 1);

  const rows = await env.MY_BINDING.prepare(sql).bind(...args).all();
  const items = rows.results || [];
  let nextCursor = null;
  if (items.length > limit) { items.pop(); nextCursor = items[items.length - 1].created_at; }

  return new Response(JSON.stringify({ items, cursor: nextCursor, has_more: !!nextCursor, scope }), {
    status: 200,
    headers: { 'Content-Type': 'application/json', ...FEED_CORS, 'Cache-Control': 'public, max-age=60' }
  });
}
FILE_EOF

# ── TEST-activity.sh ────────────────────────────────────────
cat > TEST-activity.sh << 'FILE_EOF'
#!/bin/bash
API="https://traffic-torch-auth.traffictorch.workers.dev"
[ -z "$TOKEN" ] && { echo -n "JWT: "; read -r TOKEN; }

echo ""; echo "── /api/activity/me ─────────────────"
curl -sS "$API/api/activity/me?limit=5" -H "Authorization: Bearer $TOKEN" | python3 -m json.tool

echo ""; echo "── /api/activity/network (scope=network) ──"
curl -sS "$API/api/activity/network?scope=network&limit=5" -H "Authorization: Bearer $TOKEN" | python3 -m json.tool

echo ""; echo "── /api/activity/network (scope=everyone) ─"
curl -sS "$API/api/activity/network?scope=everyone&limit=5" -H "Authorization: Bearer $TOKEN" | python3 -m json.tool

echo ""; echo "── /api/activity/user/bicommunications2 ──"
curl -sS "$API/api/activity/user/bicommunications2?limit=5" -H "Authorization: Bearer $TOKEN" | python3 -m json.tool

echo ""; echo "── unauth → 401 ─────────────────────"
curl -sS "$API/api/activity/me" | python3 -m json.tool
FILE_EOF
chmod +x TEST-activity.sh

echo "✓ Files written to $(pwd):"
ls -la
