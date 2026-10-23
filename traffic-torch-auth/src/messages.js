// ============================================================
// TRAFFIC TORCH — Messaging module
// Exports: handleMessageRoutes(request, env, url, deps)
//          handleCleanupMessages(request, env)
// deps = { verifyJWT, signJWT, createNotification, getUserFromToken }
// Phase 2: edit-within-5min, clear conversation, block from thread
// ============================================================

const MAX_BODY = 2000;
const EDIT_WINDOW_MS = 5 * 60 * 1000;
const RATE_PER_MIN = 20;
const RATE_PER_DAY = 200;
const ALLOWED_EMOJI = ['👍', '❤️', '😂', '🎉', '👀', '🙏'];
const ALLOWED_UPLOAD_TYPES = [
  'image/jpeg','image/png','image/gif','image/webp','image/svg+xml',
  'application/pdf','text/plain','text/markdown','text/csv',
  'text/html','text/css','text/javascript','application/javascript',
  'application/json','application/xml','text/xml',
  'application/zip','application/x-zip-compressed',
];
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
const MAX_ATTACHMENTS = 3;

// ------------------------------------------------------------
// Schema bootstrap (runs once per Worker instance)
// ------------------------------------------------------------
let _msgTablesEnsured = null;

async function ensureMessageSchema(env) {
  // New column on messages: edited_at (INTEGER, nullable)
  try {
    await env.MY_BINDING.prepare(`ALTER TABLE messages ADD COLUMN edited_at INTEGER`).run();
  } catch (e) { /* column already exists */ }

  // New table: thread_clears (per-user hide)
  try {
    await env.MY_BINDING.prepare(
      `CREATE TABLE IF NOT EXISTS thread_clears (
        user_id INTEGER NOT NULL,
        peer_id INTEGER NOT NULL,
        cleared_at INTEGER NOT NULL,
        PRIMARY KEY (user_id, peer_id)
      )`
    ).run();
  } catch (e) {
    console.error('[messages] ensureMessageSchema table error:', e.message);
  }
}

function ensureMessageSchemaOnce(env) {
  if (!_msgTablesEnsured) {
    _msgTablesEnsured = ensureMessageSchema(env).catch(err => {
      _msgTablesEnsured = null;
      throw err;
    });
  }
  return _msgTablesEnsured;
}

function json(data, status = 200) {
  const h = new Headers({ 'Content-Type': 'application/json' });
  h.set('Access-Control-Allow-Origin', '*');
  h.set('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
  h.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-fingerprint');
  return new Response(JSON.stringify(data), { status, headers: h });
}

function preflight() {
  const h = new Headers();
  h.set('Access-Control-Allow-Origin', '*');
  h.set('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
  h.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-fingerprint');
  h.set('Access-Control-Max-Age', '86400');
  return new Response(null, { status: 204, headers: h });
}

// ---------- helpers ----------

async function rateLimit(env, userId, bucket, limit, windowSec) {
  const since = Date.now() - windowSec * 1000;
  const row = await env.MY_BINDING.prepare(
    `SELECT COUNT(*) AS c FROM dm_rate_log WHERE user_id = ? AND created_at > ?`
  ).bind(userId, since).first();
  return (row?.c || 0) < limit;
}

async function logUsage(env, userId) {
  await env.MY_BINDING.prepare(
    `INSERT INTO dm_rate_log (user_id, created_at) VALUES (?, ?)`
  ).bind(userId, Date.now()).run();
}

async function getBlocks(env, a, b) {
  const row = await env.MY_BINDING.prepare(
    `SELECT 1 FROM blocks WHERE (user_id = ? AND blocked_user_id = ?) OR (user_id = ? AND blocked_user_id = ?) LIMIT 1`
  ).bind(a, b, b, a).first();
  return !!row;
}

async function isMuted(env, userId, targetId) {
  const row = await env.MY_BINDING.prepare(
    `SELECT 1 FROM message_mutes WHERE user_id = ? AND muted_user_id = ? LIMIT 1`
  ).bind(userId, targetId).first();
  return !!row;
}

async function areConnected(env, a, b) {
  const row = await env.MY_BINDING.prepare(
    `SELECT 1 FROM network WHERE (user_id = ? AND network_user_id = ?) OR (user_id = ? AND network_user_id = ?) LIMIT 1`
  ).bind(a, b, b, a).first();
  return !!row;
}

async function canMessage(env, sender, recipient) {
  if (sender.id === recipient.id) return { ok: false, status: 400, error: 'Cannot message yourself' };

  const recipientBlocked = await env.MY_BINDING.prepare(
    `SELECT messages_blocked, message_policy FROM users WHERE id = ?`
  ).bind(recipient.id).first();

  if (recipientBlocked?.messages_blocked === 1) {
    return { ok: false, status: 403, error: 'This user is not accepting messages' };
  }

  if (await getBlocks(env, sender.id, recipient.id)) {
    return { ok: false, status: 403, error: 'Unavailable' };
  }

  const policy = recipientBlocked?.message_policy || 'all';
  if (policy === 'none') return { ok: false, status: 403, error: 'This user is not accepting messages' };
  if (policy === 'network') {
    const connected = await areConnected(env, sender.id, recipient.id);
    if (!connected) return { ok: false, status: 403, error: 'This user only accepts messages from their network' };
  }

  if (await isMuted(env, sender.id, recipient.id)) {
    return { ok: false, status: 403, error: 'You have muted this user. Unmute to send messages.' };
  }

  return { ok: true };
}

async function getClearedAt(env, userId, peerId) {
  try {
    const row = await env.MY_BINDING.prepare(
      `SELECT cleared_at FROM thread_clears WHERE user_id = ? AND peer_id = ?`
    ).bind(userId, peerId).first();
    return row?.cleared_at || 0;
  } catch { return 0; }
}

async function attachReactionsAndFiles(env, messages, viewerId) {
  if (!messages.length) return messages;
  const ids = messages.map(m => m.id);
  const placeholders = ids.map(() => '?').join(',');

  const reactions = await env.MY_BINDING.prepare(
    `SELECT message_id, emoji, COUNT(*) AS count,
            MAX(CASE WHEN user_id = ? THEN 1 ELSE 0 END) AS mine
     FROM message_reactions WHERE message_id IN (${placeholders})
     GROUP BY message_id, emoji`
  ).bind(viewerId, ...ids).all();

  const attachments = await env.MY_BINDING.prepare(
    `SELECT id, message_id, filename, content_type, size_bytes FROM message_attachments
     WHERE message_id IN (${placeholders}) ORDER BY id ASC`
  ).bind(...ids).all();

  const rMap = {};
  (reactions.results || []).forEach(r => {
    (rMap[r.message_id] ||= []).push({ emoji: r.emoji, count: r.count, mine: !!r.mine });
  });
  const aMap = {};
  (attachments.results || []).forEach(a => {
    (aMap[a.message_id] ||= []).push({
      id: a.id, filename: a.filename, content_type: a.content_type,
      size_bytes: a.size_bytes, url: `/api/messages/attachments/${a.id}`
    });
  });

  return messages.map(m => ({ ...m, reactions: rMap[m.id] || [], attachments: aMap[m.id] || [] }));
}

// ---------- endpoints ----------

async function handleWsTicket(request, env, user, deps) {
  const ticket = await deps.signJWT({ uid: user.id, purpose: 'ws' }, env.JWT_SECRET, 60);
  return json({ ticket, expires_in: 60 });
}

async function handleSend(request, env, user, deps) {
  let body;
  try { body = await request.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }

  const toId = parseInt(body.to_user_id);
  const raw = String(body.body || '').trim();
  const replyToId = body.reply_to_id ? parseInt(body.reply_to_id) : null;
  const attachmentKeys = Array.isArray(body.attachment_keys) ? body.attachment_keys.slice(0, MAX_ATTACHMENTS) : [];

  if (!toId) return json({ error: 'Missing to_user_id' }, 400);
  if (!raw || raw.length > MAX_BODY) return json({ error: `Message must be 1-${MAX_BODY} characters` }, 400);

  if (!(await rateLimit(env, user.id, 'dm_minute', RATE_PER_MIN, 60)))
    return json({ error: 'Slow down — max 20 messages per minute' }, 429);
  if (!(await rateLimit(env, user.id, 'dm_day', RATE_PER_DAY, 86400)))
    return json({ error: 'Daily message limit reached (200)' }, 429);

  const recipient = await env.MY_BINDING.prepare(
    `SELECT id, username, name AS display_name FROM users WHERE id = ?`
  ).bind(toId).first();
  if (!recipient) return json({ error: 'Recipient not found' }, 404);

  const policy = await canMessage(env, user, recipient);
  if (!policy.ok) return json({ error: policy.error }, policy.status);

  if (replyToId) {
    const parent = await env.MY_BINDING.prepare(
      `SELECT from_user_id, to_user_id FROM messages WHERE id = ?`
    ).bind(replyToId).first();
    if (!parent) return json({ error: 'Reply target not found' }, 404);
    const inThread = (parent.from_user_id === user.id && parent.to_user_id === recipient.id) ||
                     (parent.from_user_id === recipient.id && parent.to_user_id === user.id);
    if (!inThread) return json({ error: 'Reply target not in thread' }, 400);
  }

  const now = Date.now();
  const ins = await env.MY_BINDING.prepare(
    `INSERT INTO messages (from_user_id, to_user_id, body, is_read, is_deleted, reply_to_id, created_at)
     VALUES (?, ?, ?, 0, 0, ?, ?)`
  ).bind(user.id, recipient.id, raw, replyToId, now).run();

  const messageId = ins.meta.last_row_id;

  if (attachmentKeys.length && env.ATTACHMENTS) {
    for (const key of attachmentKeys) {
      const meta = await env.ATTACHMENTS.head(key);
      if (!meta) continue;
      const filename = key.split('/').pop() || 'file';
      const size = meta.size || 0;
      const ct = meta.httpMetadata?.contentType || 'application/octet-stream';
      await env.MY_BINDING.prepare(
        `INSERT INTO message_attachments (message_id, r2_key, filename, content_type, size_bytes, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`
      ).bind(messageId, key, filename, ct, size, now).run();
    }
  }

  await logUsage(env, user.id);

  try {
    const senderName = user.display_name || user.username || 'Someone';
    const preview = raw.slice(0, 120) + (raw.length > 120 ? '…' : '');
    deps.createNotification(env, {
      userId: recipient.id,
      type: 'message',
      actorId: user.id,
      subjectType: 'message',
      subjectId: messageId,
      message: `${senderName}: ${preview}`,
      link: `/dashboard/?openbeams=1`
    }).catch(() => {});
  } catch {}

  const inserted = await env.MY_BINDING.prepare(
    `SELECT * FROM messages WHERE id = ?`
  ).bind(messageId).first();

  const [withMeta] = await attachReactionsAndFiles(env, [inserted], user.id);

  if (env.USER_INBOX) {
    try {
      const doId = env.USER_INBOX.idFromName(String(recipient.id));
      const stub = env.USER_INBOX.get(doId);
      const peer = {
        id: user.id,
        username: user.username || null,
        name: user.name || null,
        avatar_preset: user.avatar_preset || 'owner'
      };
      stub.fetch('https://do/push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'new_message', message: withMeta, peer })
      }).catch((e) => console.error('[messages] DO push error:', e.message));
    } catch (e) {
      console.error('[messages] DO push setup error:', e.message);
    }
  }

  return json({ success: true, message: withMeta }, 201);
}

async function handleInbox(request, env, user, url) {
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '50'), 50);

  const query = `
    SELECT t.peer_id, t.last_at
    FROM (
      SELECT
        CASE WHEN from_user_id = ? THEN to_user_id ELSE from_user_id END AS peer_id,
        MAX(created_at) AS last_at
      FROM messages
      WHERE (from_user_id = ? OR to_user_id = ?) AND is_deleted = 0
      GROUP BY peer_id
    ) t
    WHERE t.peer_id NOT IN (
      SELECT blocked_user_id FROM blocks WHERE user_id = ?
    )
    AND t.last_at > COALESCE(
      (SELECT cleared_at FROM thread_clears WHERE user_id = ? AND peer_id = t.peer_id),
      0
    )
    ORDER BY t.last_at DESC
    LIMIT ?
  `;

  const rows_raw = await env.MY_BINDING.prepare(query).bind(
    user.id, user.id, user.id, user.id, user.id, limit + 1
  ).all();

  let rows = rows_raw.results || [];
  const hasMore = rows.length > limit;
  if (hasMore) rows = rows.slice(0, limit);

  if (!rows.length) return json({ threads: [], has_more: false, cursor: null });

  const peerIds = rows.map(r => r.peer_id);
  const ph = peerIds.map(() => '?').join(',');

  const peers = await env.MY_BINDING.prepare(
    `SELECT id, username, name AS display_name, avatar_preset FROM users WHERE id IN (${ph})`
  ).bind(...peerIds).all();
  const peerMap = {};
  (peers.results || []).forEach(p => { peerMap[p.id] = p; });

  const threads = [];
  for (const r of rows) {
    const cleared = await getClearedAt(env, user.id, r.peer_id);
    const last = await env.MY_BINDING.prepare(
      `SELECT id, from_user_id, to_user_id, body, is_read, created_at, edited_at FROM messages
       WHERE ((from_user_id = ? AND to_user_id = ?) OR (from_user_id = ? AND to_user_id = ?))
         AND is_deleted = 0
         AND created_at > ?
       ORDER BY created_at DESC LIMIT 1`
    ).bind(user.id, r.peer_id, r.peer_id, user.id, cleared).first();

    if (!last) continue;

    const unread = await env.MY_BINDING.prepare(
      `SELECT COUNT(*) AS c FROM messages
       WHERE from_user_id = ? AND to_user_id = ? AND is_read = 0 AND is_deleted = 0 AND created_at > ?`
    ).bind(r.peer_id, user.id, cleared).first();

    const muted = await isMuted(env, user.id, r.peer_id);

    threads.push({
      peer: peerMap[r.peer_id] || { id: r.peer_id, username: null, display_name: null },
      last_message: last,
      unread_count: unread?.c || 0,
      muted
    });
  }

  return json({
    threads,
    has_more: hasMore,
    cursor: hasMore && threads.length ? String(threads[threads.length - 1].last_message.created_at) : null
  });
}

async function handleThread(request, env, user, username, url) {
  const peer = await env.MY_BINDING.prepare(
    `SELECT id, username, name AS display_name, avatar_preset, message_policy, messages_blocked FROM users WHERE username = ?`
  ).bind(username).first();
  if (!peer) return json({ error: 'User not found' }, 404);

  const limit = Math.min(parseInt(url.searchParams.get('limit') || '50'), 50);
  const before = url.searchParams.get('before');
  const cleared = await getClearedAt(env, user.id, peer.id);

  let q = `SELECT * FROM messages
           WHERE ((from_user_id = ? AND to_user_id = ?) OR (from_user_id = ? AND to_user_id = ?))
             AND is_deleted = 0
             AND created_at > ?`;
  const binds = [user.id, peer.id, peer.id, user.id, cleared];
  if (before) { q += ` AND id < ?`; binds.push(parseInt(before)); }
  q += ` ORDER BY created_at DESC LIMIT ?`;
  binds.push(limit + 1);

  const rows = await env.MY_BINDING.prepare(q).bind(...binds).all();
  let list = rows.results || [];
  const hasMore = list.length > limit;
  if (hasMore) list = list.slice(0, limit);
  list.reverse();

  const withMeta = await attachReactionsAndFiles(env, list, user.id);
  const muted = await isMuted(env, user.id, peer.id);

  return json({
    peer,
    messages: withMeta,
    has_more: hasMore,
    cursor: hasMore && list.length ? String(list[0].id) : null,
    muted
  });
}

async function handleEdit(request, env, user, messageId) {
  let body;
  try { body = await request.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }
  const newBody = String(body.body || '').trim();
  if (!newBody || newBody.length > MAX_BODY) {
    return json({ error: `Message must be 1-${MAX_BODY} characters` }, 400);
  }

  const msg = await env.MY_BINDING.prepare(
    `SELECT from_user_id, to_user_id, created_at, is_deleted FROM messages WHERE id = ?`
  ).bind(messageId).first();
  if (!msg || msg.is_deleted) return json({ error: 'Not found' }, 404);
  if (msg.from_user_id !== user.id) return json({ error: 'You can only edit your own messages' }, 403);

  const age = Date.now() - msg.created_at;
  if (age > EDIT_WINDOW_MS) {
    return json({ error: 'Edit window expired (5 minutes)' }, 403);
  }

  const now = Date.now();
  await env.MY_BINDING.prepare(
    `UPDATE messages SET body = ?, edited_at = ? WHERE id = ?`
  ).bind(newBody, now, messageId).run();

  const updated = await env.MY_BINDING.prepare(
    `SELECT * FROM messages WHERE id = ?`
  ).bind(messageId).first();
  const [withMeta] = await attachReactionsAndFiles(env, [updated], user.id);

  return json({ success: true, message: withMeta });
}

async function handleClearThread(request, env, user, username) {
  const peer = await env.MY_BINDING.prepare(
    `SELECT id FROM users WHERE username = ?`
  ).bind(username).first();
  if (!peer) return json({ error: 'User not found' }, 404);

  await env.MY_BINDING.prepare(
    `INSERT OR REPLACE INTO thread_clears (user_id, peer_id, cleared_at) VALUES (?, ?, ?)`
  ).bind(user.id, peer.id, Date.now()).run();

  return json({ success: true });
}

async function handleBlockFromThread(request, env, user, targetId) {
  if (targetId === user.id) return json({ error: 'Cannot block yourself' }, 400);

  const target = await env.MY_BINDING.prepare(
    `SELECT id, username FROM users WHERE id = ?`
  ).bind(targetId).first();
  if (!target) return json({ error: 'User not found' }, 404);

  await env.MY_BINDING.prepare(
    `INSERT OR IGNORE INTO blocks (user_id, blocked_user_id, created_at) VALUES (?, ?, ?)`
  ).bind(user.id, targetId, Date.now()).run();

  // Also remove from network in both directions for cleanliness
  try {
    await env.MY_BINDING.prepare(
      `DELETE FROM network WHERE (user_id = ? AND network_user_id = ?) OR (user_id = ? AND network_user_id = ?)`
    ).bind(user.id, targetId, targetId, user.id).run();
  } catch (e) { /* network table may not exist in some deploys, ignore */ }

  // Drop any mute entry — block supersedes it
  try {
    await env.MY_BINDING.prepare(
      `DELETE FROM message_mutes WHERE user_id = ? AND muted_user_id = ?`
    ).bind(user.id, targetId).run();
  } catch (e) { /* ignore */ }

  return json({ success: true });
}

async function handleRead(request, env, user) {
  let body;
  try { body = await request.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }
  const fromId = parseInt(body.from_user_id);
  if (!fromId) return json({ error: 'Missing from_user_id' }, 400);

  const now = Date.now();
  const res = await env.MY_BINDING.prepare(
    `UPDATE messages SET is_read = 1, read_at = ?
     WHERE from_user_id = ? AND to_user_id = ? AND is_read = 0`
  ).bind(now, fromId, user.id).run();

  return json({ success: true, marked: res.meta.changes || 0 });
}

async function handleDelete(request, env, user, messageId) {
  const msg = await env.MY_BINDING.prepare(
    `SELECT from_user_id, to_user_id FROM messages WHERE id = ?`
  ).bind(messageId).first();
  if (!msg) return json({ error: 'Not found' }, 404);
  if (msg.from_user_id !== user.id && msg.to_user_id !== user.id)
    return json({ error: 'Forbidden' }, 403);

  await env.MY_BINDING.prepare(
    `UPDATE messages SET is_deleted = 1, deleted_at = ?, body = '' WHERE id = ?`
  ).bind(Date.now(), messageId).run();

  return json({ success: true });
}

async function handleUnreadCount(request, env, user) {
  const row = await env.MY_BINDING.prepare(
    `SELECT COUNT(*) AS c FROM messages WHERE to_user_id = ? AND is_read = 0 AND is_deleted = 0`
  ).bind(user.id).first();
  return json({ count: row?.c || 0 });
}

async function handleReact(request, env, user, messageId, add) {
  let body = {};
  try { body = await request.json(); } catch {}
  const emoji = String(body.emoji || '').trim();
  if (!ALLOWED_EMOJI.includes(emoji)) return json({ error: 'Invalid emoji' }, 400);

  const msg = await env.MY_BINDING.prepare(
    `SELECT from_user_id, to_user_id FROM messages WHERE id = ? AND is_deleted = 0`
  ).bind(messageId).first();
  if (!msg) return json({ error: 'Not found' }, 404);
  if (msg.from_user_id !== user.id && msg.to_user_id !== user.id)
    return json({ error: 'Forbidden' }, 403);

  if (add) {
    await env.MY_BINDING.prepare(
      `INSERT OR IGNORE INTO message_reactions (message_id, user_id, emoji, created_at) VALUES (?, ?, ?, ?)`
    ).bind(messageId, user.id, emoji, Date.now()).run();
  } else {
    await env.MY_BINDING.prepare(
      `DELETE FROM message_reactions WHERE message_id = ? AND user_id = ? AND emoji = ?`
    ).bind(messageId, user.id, emoji).run();
  }
  return json({ success: true });
}

async function handleUpload(request, env, user) {
  if (!env.ATTACHMENTS) return json({ error: 'Attachments not configured' }, 503);

  const ct = request.headers.get('Content-Type') || '';
  if (!ct.includes('multipart/form-data')) return json({ error: 'Expected multipart/form-data' }, 400);

  const form = await request.formData();
  const file = form.get('file');
  if (!file || typeof file === 'string') return json({ error: 'Missing file' }, 400);
  if (file.size > MAX_UPLOAD_BYTES) return json({ error: 'File too large (max 5MB)' }, 413);
  if (!ALLOWED_UPLOAD_TYPES.includes(file.type)) return json({ error: 'Unsupported file type' }, 415);

  const uuid = crypto.randomUUID();
  const safeName = (file.name || 'file').replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 100);
  const key = `msg/${user.id}/${uuid}/${safeName}`;

  await env.ATTACHMENTS.put(key, file.stream(), {
    httpMetadata: { contentType: file.type }
  });

  return json({ key, filename: safeName, content_type: file.type, size_bytes: file.size });
}

async function handleAttachmentDownload(request, env, user, attachmentId) {
  if (!env.ATTACHMENTS) return json({ error: 'Attachments not configured' }, 503);

  const att = await env.MY_BINDING.prepare(
    `SELECT a.r2_key, a.filename, a.content_type, m.from_user_id, m.to_user_id
     FROM message_attachments a JOIN messages m ON m.id = a.message_id
     WHERE a.id = ?`
  ).bind(attachmentId).first();
  if (!att) return json({ error: 'Not found' }, 404);
  if (att.from_user_id !== user.id && att.to_user_id !== user.id)
    return json({ error: 'Forbidden' }, 403);

  const obj = await env.ATTACHMENTS.get(att.r2_key);
  if (!obj) return json({ error: 'File missing' }, 404);

  const INLINE_OK = new Set(['image/jpeg','image/png','image/gif','image/webp','application/pdf']);
  const disposition = INLINE_OK.has(att.content_type) ? 'inline' : 'attachment';
  const safeName = (att.filename || 'file').replace(/["\r\n]/g, '');
  const h = new Headers({
    'Content-Type': att.content_type || 'application/octet-stream',
    'Content-Disposition': `${disposition}; filename="${safeName}"`,
    'X-Content-Type-Options': 'nosniff',
    'Cache-Control': 'private, max-age=3600',
  });
  h.set('Access-Control-Allow-Origin', '*');
  h.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
  h.set('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  h.set('Access-Control-Expose-Headers', 'Content-Type, Content-Disposition, Content-Length');
  return new Response(obj.body, { headers: h });
}

async function handleSettings(request, env, user) {
  let body;
  try { body = await request.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }

  const updates = [];
  const binds = [];
  if (body.message_policy !== undefined) {
    if (!['all','network','none'].includes(body.message_policy))
      return json({ error: 'Invalid message_policy' }, 400);
    updates.push('message_policy = ?');
    binds.push(body.message_policy);
  }
  if (body.messages_blocked !== undefined) {
    updates.push('messages_blocked = ?');
    binds.push(body.messages_blocked ? 1 : 0);
  }
  if (!updates.length) return json({ error: 'Nothing to update' }, 400);

  binds.push(user.id);
  await env.MY_BINDING.prepare(
    `UPDATE users SET ${updates.join(', ')} WHERE id = ?`
  ).bind(...binds).run();

  return json({ success: true });
}

async function handleReport(request, env, user, messageId) {
  let body = {};
  try { body = await request.json(); } catch {}
  const reason = String(body.reason || '').slice(0, 500);
  if (!reason) return json({ error: 'Reason required' }, 400);

  const msg = await env.MY_BINDING.prepare(
    `SELECT from_user_id, to_user_id FROM messages WHERE id = ?`
  ).bind(messageId).first();
  if (!msg) return json({ error: 'Not found' }, 404);
  if (msg.from_user_id !== user.id && msg.to_user_id !== user.id)
    return json({ error: 'Forbidden' }, 403);

  const reportedId = msg.from_user_id === user.id ? msg.to_user_id : msg.from_user_id;

  await env.MY_BINDING.prepare(
    `INSERT INTO reports (reporter_id, reported_user_id, type, target_id, reason, created_at)
     VALUES (?, ?, 'message', ?, ?, ?)`
  ).bind(user.id, reportedId, messageId, reason, Date.now()).run();

  return json({ success: true });
}

async function handleMute(request, env, user, targetId, mute) {
  if (targetId === user.id) return json({ error: 'Cannot mute yourself' }, 400);

  if (mute) {
    await env.MY_BINDING.prepare(
      `INSERT OR IGNORE INTO message_mutes (user_id, muted_user_id, created_at) VALUES (?, ?, ?)`
    ).bind(user.id, targetId, Date.now()).run();
  } else {
    await env.MY_BINDING.prepare(
      `DELETE FROM message_mutes WHERE user_id = ? AND muted_user_id = ?`
    ).bind(user.id, targetId).run();
  }
  return json({ success: true });
}

// ---------- router ----------

export async function handleMessageRoutes(request, env, url, deps) {
  if (request.method === 'OPTIONS') return preflight();

  await ensureMessageSchemaOnce(env);

  const p = url.pathname;

  if (p === '/api/messages/connect') {
    const upgrade = (request.headers.get('Upgrade') || '').toLowerCase();
    if (upgrade !== 'websocket') return json({ error: 'Expected WebSocket upgrade' }, 426);
    const ticket = url.searchParams.get('ticket');
    if (!ticket) return json({ error: 'Missing ticket' }, 401);
    const payload = await deps.verifyJWT(ticket, env.JWT_SECRET);
    if (!payload || payload.purpose !== 'ws' || !payload.uid) {
      return json({ error: 'Invalid or expired ticket' }, 401);
    }
    if (!env.USER_INBOX) return json({ error: 'WebSocket unavailable' }, 503);
    const id = env.USER_INBOX.idFromName(String(payload.uid));
    const stub = env.USER_INBOX.get(id);
    return await stub.fetch(request);
  }

  const user = await deps.getUserFromToken(request, env);
  if (!user) return json({ error: 'Unauthorized' }, 401);

  const m = request.method;

  try {
    if (p === '/api/messages/ws-ticket' && m === 'POST') return await handleWsTicket(request, env, user, deps);
    if (p === '/api/messages/send' && m === 'POST') return await handleSend(request, env, user, deps);
    if (p === '/api/messages/inbox' && m === 'GET') return await handleInbox(request, env, user, url);
    if (p === '/api/messages/unread-count' && m === 'GET') return handleUnreadCount(request, env, user);
    if (p === '/api/messages/read' && m === 'POST') return await handleRead(request, env, user);
    if (p === '/api/messages/upload' && m === 'POST') return await handleUpload(request, env, user);
    if (p === '/api/messages/settings' && m === 'PATCH') return await handleSettings(request, env, user);

    if (p.startsWith('/api/messages/thread/') && m === 'GET') {
      const username = decodeURIComponent(p.slice('/api/messages/thread/'.length));
      return await handleThread(request, env, user, username, url);
    }

    let match;
    if ((match = p.match(/^\/api\/messages\/thread\/([^\/]+)\/clear$/)) && m === 'POST') {
      const username = decodeURIComponent(match[1]);
      return await handleClearThread(request, env, user, username);
    }
    if ((match = p.match(/^\/api\/messages\/block\/(\d+)$/)) && m === 'POST') {
      return await handleBlockFromThread(request, env, user, parseInt(match[1]));
    }
    if ((match = p.match(/^\/api\/messages\/(\d+)\/react$/))) {
      const id = parseInt(match[1]);
      if (m === 'POST') return await handleReact(request, env, user, id, true);
      if (m === 'DELETE') return await handleReact(request, env, user, id, false);
    }
    if ((match = p.match(/^\/api\/messages\/report\/(\d+)$/)) && m === 'POST') {
      return await handleReport(request, env, user, parseInt(match[1]));
    }
    if ((match = p.match(/^\/api\/messages\/mute\/(\d+)$/))) {
      const id = parseInt(match[1]);
      if (m === 'POST') return await handleMute(request, env, user, id, true);
      if (m === 'DELETE') return await handleMute(request, env, user, id, false);
    }
    if ((match = p.match(/^\/api\/messages\/attachments\/(\d+)$/)) && m === 'GET') {
      return await handleAttachmentDownload(request, env, user, parseInt(match[1]));
    }
    if ((match = p.match(/^\/api\/messages\/(\d+)$/))) {
      const id = parseInt(match[1]);
      if (m === 'PATCH') return await handleEdit(request, env, user, id);
      if (m === 'DELETE') return await handleDelete(request, env, user, id);
    }

    return json({ error: 'Not found' }, 404);
  } catch (err) {
    console.error('[messages] error:', err.message, err.stack);
    return json({ error: 'Internal error', detail: err.message }, 500);
  }
}

// ---------- cron cleanup ----------

export async function handleCleanupMessages(request, env) {
  const auth = request.headers.get('Authorization') || '';
  if (auth !== `Bearer ${env.PURGE_SECRET}`) return json({ error: 'Unauthorized' }, 401);

  const now = Date.now();
  const softCutoff = now - 7 * 24 * 60 * 60 * 1000;
  const readCutoff = now - 30 * 24 * 60 * 60 * 1000;
  const rateCutoff = now - 48 * 60 * 60 * 1000;

  const hard1 = await env.MY_BINDING.prepare(
    `DELETE FROM messages WHERE is_deleted = 1 AND deleted_at < ?`
  ).bind(softCutoff).run();

  const hard2 = await env.MY_BINDING.prepare(
    `DELETE FROM messages WHERE is_read = 1 AND read_at IS NOT NULL AND read_at < ? AND is_deleted = 0`
  ).bind(readCutoff).run();

  const rate = await env.MY_BINDING.prepare(
    `DELETE FROM dm_rate_log WHERE created_at < ?`
  ).bind(rateCutoff).run();

  return json({
    success: true,
    purged_soft_deleted: hard1.meta.changes || 0,
    purged_old_read: hard2.meta.changes || 0,
    purged_rate_rows: rate.meta.changes || 0
  });
}