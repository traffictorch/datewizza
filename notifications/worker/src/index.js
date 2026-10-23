import { sendToUser, isKnownType } from './lib/push.js';
import { getVapidConfig } from './lib/vapid.js';

const ALLOWED_ORIGINS = [
  'https://datewizza.com',
  'https://www.datewizza.com',
];

function corsHeaders(origin) {
  const allow = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  };
}

function json(body, status, origin) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
  });
}

// Verify a user's JWT by asking the auth worker. Returns user_id or null.
function decodeJwtPayload(token) {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
    const json = atob(padded);
    return JSON.parse(json);
  } catch {
    return null;
  }
}

async function verifyUser(request, env) {
  const auth = request.headers.get('Authorization') || '';
  if (!auth.startsWith('Bearer ')) return null;
  const token = auth.slice(7);
  try {
    // Auth worker verifies signature + expiry. If it returns 200, the token is valid.
    const res = await env.AUTH.fetch('https://auth.internal/api/account-info', {
      headers: { Authorization: auth },
    });
    if (!res.ok) return null;

    // Prefer id from the response body if present; otherwise decode from the JWT.
    const data = await res.json().catch(() => null);
    if (data && Number.isInteger(data.id) && data.id > 0) return data.id;

    const claims = decodeJwtPayload(token);
    if (claims && Number.isInteger(claims.id) && claims.id > 0) return claims.id;

    console.error('verifyUser: no id in response or JWT');
    return null;
  } catch (err) {
    console.error('verifyUser failed', err);
    return null;
  }
}

function checkInternalAuth(request, env) {
  const auth = request.headers.get('Authorization') || '';
  const expected = `Bearer ${env.PUSH_SECRET}`;
  // constant-time-ish comparison
  if (auth.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < auth.length; i++) diff |= auth.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}

async function handleSubscribe(request, env, origin) {
  const userId = await verifyUser(request, env);
  if (!userId) return json({ error: 'unauthorized' }, 401, origin);

  let body;
  try { body = await request.json(); } catch { return json({ error: 'invalid_json' }, 400, origin); }

  const sub = body && body.subscription;
  if (!sub || !sub.endpoint || !sub.keys || !sub.keys.p256dh || !sub.keys.auth) {
    return json({ error: 'invalid_subscription' }, 400, origin);
  }

  // Cap endpoint length to avoid abuse
  if (typeof sub.endpoint !== 'string' || sub.endpoint.length > 1000) {
    return json({ error: 'invalid_endpoint' }, 400, origin);
  }

  const ua = (request.headers.get('User-Agent') || '').slice(0, 300);

  await env.DB.prepare(
    `INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth, user_agent)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(endpoint) DO UPDATE SET
       user_id      = excluded.user_id,
       p256dh       = excluded.p256dh,
       auth         = excluded.auth,
       user_agent   = excluded.user_agent,
       last_seen_at = unixepoch(),
       revoked_at   = NULL`
  ).bind(userId, sub.endpoint, sub.keys.p256dh, sub.keys.auth, ua).run();

  return json({ ok: true, userId }, 200, origin);
}

async function handleUnsubscribe(request, env, origin) {
  const userId = await verifyUser(request, env);
  if (!userId) return json({ error: 'unauthorized' }, 401, origin);

  let body;
  try { body = await request.json(); } catch { return json({ error: 'invalid_json' }, 400, origin); }

  const endpoint = body && body.endpoint;
  if (!endpoint) return json({ error: 'missing_endpoint' }, 400, origin);

  await env.DB.prepare(
    `UPDATE push_subscriptions
     SET revoked_at = unixepoch()
     WHERE endpoint = ? AND user_id = ? AND revoked_at IS NULL`
  ).bind(endpoint, userId).run();

  return json({ ok: true }, 200, origin);
}

async function handleSend(request, env, origin) {
  if (!checkInternalAuth(request, env)) return json({ error: 'unauthorized' }, 401, origin);

  let body;
  try { body = await request.json(); } catch { return json({ error: 'invalid_json' }, 400, origin); }

  const userId = Number(body && body.user_id);
  if (!Number.isInteger(userId) || userId <= 0) {
    return json({ error: 'invalid_user_id' }, 400, origin);
  }
  if (!body.type || !isKnownType(body.type)) {
    return json({ error: 'unknown_type' }, 400, origin);
  }

  const payload = {
    type: body.type,
    title: body.title,
    body: body.body,
    url: body.url,
    tag: body.tag,
    data: body.data,
  };

  try {
    const result = await sendToUser(env, userId, payload);
    return json({ ok: true, ...result }, 200, origin);
  } catch (err) {
    console.error('send error', err);
    return json({ error: String(err && err.message || err) }, 500, origin);
  }
}

async function handleTest(request, env, origin) {
  const userId = await verifyUser(request, env);
  if (!userId) return json({ error: 'unauthorized' }, 401, origin);

  const result = await sendToUser(env, userId, {
    type: 'message',
    title: 'DateWizza test',
    body: 'If you can see this, push is wired up correctly.',
    url: '/dashboard/#settings',
    tag: 'tt-test-' + Date.now(),
  });

  return json({ ok: true, ...result }, 200, origin);
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const url = new URL(request.url);
    const path = url.pathname;

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }

    if (path === '/push-api/vapid-public-key' && request.method === 'GET') {
      return json({ publicKey: env.VAPID_PUBLIC_KEY }, 200, origin);
    }

    if (path === '/push-api/health' && request.method === 'GET') {
      return json({ ok: true, service: 'traffic-torch-push' }, 200, origin);
    }

    if (path === '/push-api/subscribe'   && request.method === 'POST') return handleSubscribe(request, env, origin);
    if (path === '/push-api/unsubscribe' && request.method === 'POST') return handleUnsubscribe(request, env, origin);
    if (path === '/push-api/send'        && request.method === 'POST') return handleSend(request, env, origin);
    if (path === '/push-api/test'        && request.method === 'POST') return handleTest(request, env, origin);

    return json({ error: 'not_found' }, 404, origin);
  },
};
