import { sendPushBatch, WebPushError } from '@mmmike/web-push/send';
import { getVapidConfig } from './vapid.js';

// Whitelist of notification types → maps to a users.notify_<type> column.
// Adding a new type = add here + add the DB column. Nothing else changes.
const TYPE_TO_PREF_COLUMN = {
  comment:     'push_comments',
  network:     'push_network',
  leaderboard: 'push_leaderboard',
  message:     'push_messages',
  system:      'push_messages',
};

export function isKnownType(type) {
  return Object.prototype.hasOwnProperty.call(TYPE_TO_PREF_COLUMN, type);
}

async function userAllowsType(env, userId, type) {
  const col = TYPE_TO_PREF_COLUMN[type];
  if (!col) return false;
  const row = await env.DB
    .prepare(`SELECT ${col} AS allow FROM users WHERE id = ?`)
    .bind(userId)
    .first();
  if (!row) return false;
  // NULL or 1 → allow (default on). Only explicit 0 blocks.
  return row.allow === null || row.allow === 1 || row.allow === undefined;
}

async function loadActiveSubscriptions(env, userId) {
  const { results } = await env.DB
    .prepare(`SELECT id, endpoint, p256dh, auth
              FROM push_subscriptions
              WHERE user_id = ? AND revoked_at IS NULL`)
    .bind(userId)
    .all();
  return results || [];
}

async function markGone(env, endpoints) {
  if (!endpoints || endpoints.length === 0) return 0;
  const placeholders = endpoints.map(() => '?').join(',');
  const stmt = env.DB.prepare(
    `UPDATE push_subscriptions
     SET revoked_at = unixepoch()
     WHERE endpoint IN (${placeholders}) AND revoked_at IS NULL`
  );
  const res = await stmt.bind(...endpoints).run();
  return res.meta?.changes || 0;
}

async function bumpLastSeen(env, endpoints) {
  if (!endpoints || endpoints.length === 0) return;
  const placeholders = endpoints.map(() => '?').join(',');
  await env.DB.prepare(
    `UPDATE push_subscriptions
     SET last_seen_at = unixepoch()
     WHERE endpoint IN (${placeholders})`
  ).bind(...endpoints).run();
}

/**
 * Send a notification to every active device belonging to a user.
 * Respects the user's notify_<type> preferences.
 *
 * @returns {Promise<{delivered:number, gone:number, failed:number, skipped?:string, total:number}>}
 */
export async function sendToUser(env, userId, payload) {
  if (!payload || typeof payload !== 'object' || !payload.title) {
    throw new Error('payload must be an object with at least { title }');
  }
  const type = payload.type || 'system';
  if (!isKnownType(type)) {
    throw new Error(`unknown notification type: ${type}`);
  }

  const allowed = await userAllowsType(env, userId, type);
  if (!allowed) {
    return { delivered: 0, gone: 0, failed: 0, total: 0, skipped: 'pref_disabled' };
  }

  const subs = await loadActiveSubscriptions(env, userId);
  if (subs.length === 0) {
    return { delivered: 0, gone: 0, failed: 0, total: 0, skipped: 'no_subscriptions' };
  }

  const vapid = getVapidConfig(env);

  // Only pass the fields the service worker reads.
  const cleanPayload = {
    title: String(payload.title).slice(0, 120),
    body: payload.body ? String(payload.body).slice(0, 240) : undefined,
    url: payload.url ? String(payload.url).slice(0, 500) : '/',
    tag: payload.tag ? String(payload.tag).slice(0, 60) : undefined,
    type,
    data: payload.data && typeof payload.data === 'object' ? payload.data : undefined,
  };

  // @mmmike/web-push expects the browser shape: { endpoint, keys: { p256dh, auth } }.
  // Our DB stores flat columns, so remap before sending.
  const subsForLib = subs.map((s) => ({
    endpoint: s.endpoint,
    keys: { p256dh: s.p256dh, auth: s.auth },
  }));

  const { delivered, gone, failed } = await sendPushBatch(subsForLib, cleanPayload, vapid);

  // Normalise: gone may be strings or objects depending on library version.
  const goneEndpoints = (gone || []).map((g) => (typeof g === 'string' ? g : g.endpoint));
  const failedEndpoints = (failed || []).map((f) => f.endpoint);

  await markGone(env, goneEndpoints);

  const deliveredEndpoints = subs
    .map((s) => s.endpoint)
    .filter((e) => !goneEndpoints.includes(e) && !failedEndpoints.includes(e));
  await bumpLastSeen(env, deliveredEndpoints);

  // Log failures for observability — but never log endpoints themselves
  for (const { error } of (failed || [])) {
    if (error instanceof WebPushError) {
      console.log(JSON.stringify({
        event: 'push_failed',
        userId,
        type,
        statusCode: error.statusCode,
        retryAfterMs: error.retryAfterMs,
      }));
    } else {
      console.log(JSON.stringify({
        event: 'push_failed',
        userId,
        type,
        error: String(error),
      }));
    }
  }

  return { delivered, gone: gone.length, failed: failed.length, total: subs.length };
}
