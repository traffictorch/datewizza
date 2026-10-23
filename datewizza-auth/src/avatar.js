// ============================================================
// DateWizza — Profile avatar handlers
// POST   /api/profile/avatar           (multipart upload)
// GET    /api/profile/avatar/:userId   (public, streams R2 or 302s to preset SVG)
// DELETE /api/profile/avatar           (revert to preset)
// ============================================================

const MAX_BYTES = 15 * 1024 * 1024;
const ALLOWED   = ['image/jpeg', 'image/png', 'image/webp'];
const IMMUTABLE = 'public, max-age=31536000, immutable';
const RATE_PER_DAY = 30;
const PRESETS = ['owner', 'designer', 'seo'];

function json(data, status = 200, extra = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', ...extra },
  });
}

// ---- magic-byte sniffing (never trust Content-Type from client) ----
function sniff(buf) {
  if (buf.length < 12) return null;
  if (buf[0] === 0xFF && buf[1] === 0xD8 && buf[2] === 0xFF) return 'image/jpeg';
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47) return 'image/png';
  if (buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 &&
      buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50) return 'image/webp';
  return null;
}

// ---- minimal JWT verify (avoid circular import from index.js) ----
async function verifyJWT(token, secret) {
  try {
    const [h, p, s] = token.split('.');
    if (!s) return null;
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret),
      { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
    const sig = Uint8Array.from(atob(s.replace(/-/g,'+').replace(/_/g,'/')), c => c.charCodeAt(0));
    const ok = await crypto.subtle.verify('HMAC', key, sig, new TextEncoder().encode(`${h}.${p}`));
    if (!ok) return null;
    const payload = JSON.parse(atob(p.replace(/-/g,'+').replace(/_/g,'/')));
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch { return null; }
}

async function userFromToken(request, env) {
  const t = (request.headers.get('Authorization') || '').replace('Bearer ', '').trim();
  if (!t) return null;
  const p = await verifyJWT(t, env.JWT_SECRET);
  if (!p) return null;
  const id = p.id || p.userId || p.sub;
  if (!id) return null;
  return await env.MY_BINDING.prepare('SELECT * FROM users WHERE id = ?').bind(id).first();
}

async function ensureRateTable(env) {
  await env.MY_BINDING.prepare(
    `CREATE TABLE IF NOT EXISTS avatar_rate_log (user_id INTEGER, created_at INTEGER, bucket TEXT)`
  ).run().catch(() => {});
}

async function rateCheck(env, userId) {
  await ensureRateTable(env);
  const since = Date.now() - 86400 * 1000;
  const row = await env.MY_BINDING.prepare(
    `SELECT COUNT(*) AS c FROM avatar_rate_log WHERE user_id = ? AND bucket = 'day' AND created_at > ?`
  ).bind(userId, since).first();
  return (row?.c || 0) < RATE_PER_DAY;
}

async function rateLog(env, userId) {
  await env.MY_BINDING.prepare(
    `INSERT INTO avatar_rate_log (user_id, created_at, bucket) VALUES (?, ?, 'day')`
  ).bind(userId, Date.now()).run();
}

// ============ handlers ============

async function handleUpload(request, env) {
  const user = await userFromToken(request, env);
  if (!user) return json({ error: 'Unauthorized' }, 401);
  if (!env.ATTACHMENTS) return json({ error: 'Storage not configured' }, 503);

  const ct = request.headers.get('content-type') || '';
  if (!ct.includes('multipart/form-data')) return json({ error: 'Expected multipart/form-data' }, 400);

  const form = await request.formData();
  const file = form.get('file');
  if (!file || typeof file === 'string') return json({ error: 'No file' }, 400);
  if (file.size > MAX_BYTES) return json({ error: 'File too large (max 15 MB)' }, 413);

  const buf = new Uint8Array(await file.arrayBuffer());
  const sniffed = sniff(buf);
  if (!sniffed || !ALLOWED.includes(sniffed)) {
    return json({ error: 'Only JPEG, PNG, or WebP allowed' }, 415);
  }

  // Rate check runs AFTER validation — only files that pass reach this point.
  if (!(await rateCheck(env, user.id))) {
    return json({ error: 'Daily upload limit reached (30)' }, 429);
  }

  const ext = sniffed === 'image/webp' ? 'webp' : sniffed === 'image/png' ? 'png' : 'jpg';
  const key = `avatars/${user.id}/${crypto.randomUUID()}.${ext}`;

  await env.ATTACHMENTS.put(key, buf, {
    httpMetadata: { contentType: sniffed, cacheControl: IMMUTABLE },
  });

  const now = Date.now();
  const prevKey = user.avatar_r2_key;
  await env.MY_BINDING.prepare(
    `UPDATE users SET avatar_r2_key = ?, avatar_updated_at = ? WHERE id = ?`
  ).bind(key, now, user.id).run();

  if (prevKey && prevKey !== key) {
    env.ATTACHMENTS.delete(prevKey).catch(() => {});
  }

  // Only count SUCCESSFUL uploads toward the daily limit.
  await rateLog(env, user.id).catch(() => {});

  return json({
    success: true,
    avatar_url: `/api/profile/avatar/${user.id}?v=${now}`,
    avatar_r2_key: key,
    avatar_updated_at: now,
  });
}

async function handleGet(env, userId) {
  console.log('[avatar] get userId=', userId);
  if (!Number.isFinite(userId)) return new Response('Bad request', { status: 400 });
  const u = await env.MY_BINDING.prepare(
    'SELECT id, avatar_r2_key, avatar_preset FROM users WHERE id = ?'
  ).bind(userId).first();
  if (!u) return new Response('Not found', { status: 404 });

  const fallbackPreset = PRESETS.includes(u.avatar_preset) ? u.avatar_preset : 'owner';

  if (!u.avatar_r2_key) {
    return new Response(null, {
      status: 302,
      headers: {
        'Location': `https://datewizza.com/images/avatars/${fallbackPreset}.svg`,
        'Cache-Control': 'no-store',
        'Access-Control-Allow-Origin': '*',
      },
    });
  }

  if (!env.ATTACHMENTS) return new Response('Not found', { status: 404 });
  const obj = await env.ATTACHMENTS.get(u.avatar_r2_key);
  if (!obj) {
    return new Response(null, {
      status: 302,
      headers: {
        'Location': `https://datewizza.com/images/avatars/${fallbackPreset}.svg`,
        'Cache-Control': 'no-store',
        'Access-Control-Allow-Origin': '*',
      },
    });
  }

  const headers = new Headers();
  obj.writeHttpMetadata(headers);
  headers.set('Cache-Control', IMMUTABLE);
  headers.set('ETag', obj.httpEtag);
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('Access-Control-Allow-Origin', '*');
  return new Response(obj.body, { headers });
}

async function handleDelete(request, env) {
  const user = await userFromToken(request, env);
  if (!user) return json({ error: 'Unauthorized' }, 401);
  const prevKey = user.avatar_r2_key;
  await env.MY_BINDING.prepare(
    'UPDATE users SET avatar_r2_key = NULL, avatar_updated_at = NULL WHERE id = ?'
  ).bind(user.id).run();
  if (prevKey && env.ATTACHMENTS) env.ATTACHMENTS.delete(prevKey).catch(() => {});
  return json({ success: true });
}

// ============ public router ============

export async function handleAvatarRoutes(request, env, url) {
  const p = url.pathname;
  const parts = p.split('/').filter(Boolean);
  if (parts[0] !== 'api' || parts[1] !== 'profile' || parts[2] !== 'avatar') return null;

  console.log('[avatar]', request.method, p);

  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    }});
  }

  if (parts.length === 4 && request.method === 'GET') {
    const uid = parseInt(parts[3], 10);
    if (Number.isFinite(uid)) return handleGet(env, uid);
  }

  if (parts.length === 3) {
    if (request.method === 'POST')   return handleUpload(request, env);
    if (request.method === 'DELETE') return handleDelete(request, env);
  }

  return json({ error: 'Not found', path: p }, 404);
}
