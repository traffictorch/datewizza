import { handleMessageRoutes, handleCleanupMessages } from './messages.js';
import { UserInbox } from './durable/UserInbox.js';
import { handleAvatarRoutes } from './avatar.js';

export { UserInbox };

// ============================================================
// TRAFFIC TORCH – AUTH WORKER (FULL GA4 + REALTIME + CACHE + NOTIFICATIONS + POINTS)
// ============================================================
// Env: JWT_SECRET, RESEND_API_KEY, STRIPE_SECRET_KEY,
//      STRIPE_WEBHOOK_SECRET, STRIPE_PRICE_ID,
//      GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, ENCRYPTION_KEY
// D1 binding: MY_BINDING
// ============================================================

function corsResponse(body, status = 200, headers = {}) {
  const h = new Headers(headers);
  h.set('Access-Control-Allow-Origin', '*');
  h.set('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
  h.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-fingerprint');
  return new Response(body, { status, headers: h });
}

async function sha256(str) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function signJWT(payload, secret, expiresIn = '7d') {
  const header = { alg: 'HS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  let ttl = 7 * 86400;
  if (expiresIn === '7d') ttl = 7 * 86400;
  else if (expiresIn === '1h') ttl = 3600;
  else if (typeof expiresIn === 'number') ttl = expiresIn;
  const exp = now + ttl;
  const payloadWithExp = { ...payload, iat: now, exp };
  const encHeader = btoa(JSON.stringify(header)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const encPayload = btoa(JSON.stringify(payloadWithExp)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const data = `${encHeader}.${encPayload}`;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data));
  const encSig = btoa(String.fromCharCode(...new Uint8Array(sig))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `${data}.${encSig}`;
}

async function verifyJWT(token, secret) {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const [headerB64, payloadB64, signatureB64] = parts;
    const data = `${headerB64}.${payloadB64}`;
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
    const sig = Uint8Array.from(atob(signatureB64.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
    const valid = await crypto.subtle.verify('HMAC', key, sig, new TextEncoder().encode(data));
    if (!valid) return null;
    const payload = JSON.parse(atob(payloadB64.replace(/-/g, '+').replace(/_/g, '/')));
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch { return null; }
}

async function generateOAuthState(userId, provider, secret) {
  const nonce = crypto.randomUUID();
  return await signJWT({ uid: userId, provider, nonce, purpose: 'oauth_state' }, secret, '1h');
}

async function verifyOAuthState(state, provider, secret) {
  if (!state) return null;
  const payload = await verifyJWT(state, secret);
  if (!payload) return null;
  if (payload.purpose !== 'oauth_state') return null;
  if (payload.provider !== provider) return null;
  return payload;
}

async function hashPassword(password) {
  const salt = crypto.randomUUID().slice(0, 16);
  const combined = salt + password;
  const hash = await sha256(combined);
  return `$2a$10$${salt}$${hash}`;
}

async function comparePassword(password, storedHash) {
  try {
    const parts = storedHash.split('$');
    if (parts.length < 4) return false;
    let salt, hash;
    if (parts.length === 5) { salt = parts[3]; hash = parts[4]; }
    else if (parts.length === 4) { const combined = parts[3]; salt = combined.slice(0, 16); hash = combined.slice(16); }
    else return false;
    const computed = await sha256(salt + password);
    return computed === hash;
  } catch { return false; }
}

function getTierLimit(tier) {
  switch (tier) {
    case 'enterprise': return 300;
    case 'pro': return 24;
    default: return 3;
  }
}

function encrypt(text) { return btoa(text); }
function decrypt(encoded) { return atob(encoded); }

async function exchangeCodeForTokens(code, env) {
  const params = new URLSearchParams({
    code,
    client_id: env.GOOGLE_CLIENT_ID,
    client_secret: env.GOOGLE_CLIENT_SECRET,
    redirect_uri: 'https://traffic-torch-auth.traffictorch.workers.dev/api/ga4/callback',
    grant_type: 'authorization_code'
  });
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString()
  });
  if (!res.ok) throw new Error(`Token exchange failed: ${await res.text()}`);
  return await res.json();
}

async function exchangeCodeForTokensGSC(code, env) {
  const params = new URLSearchParams({
    code,
    client_id: env.GOOGLE_CLIENT_ID,
    client_secret: env.GOOGLE_CLIENT_SECRET,
    redirect_uri: 'https://traffic-torch-auth.traffictorch.workers.dev/api/gsc/callback',
    grant_type: 'authorization_code'
  });
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString()
  });
  if (!res.ok) throw new Error(`GSC token exchange failed: ${await res.text()}`);
  return await res.json();
}

async function fetchGSCReport(accessToken, siteUrl, dimensions, startDate, endDate, limit = 25) {
  const body = { startDate, endDate, dimensions, rowLimit: limit };
  const url = `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!res.ok) throw new Error(`GSC API error: ${await res.text()}`);
  return res.json();
}

async function getCachedGSCReport(userId, reportType, startDate, endDate, env) {
  try {
    const record = await env.MY_BINDING.prepare(
      'SELECT data FROM gsc_cache WHERE user_id = ? AND report_type = ? AND start_date = ? AND end_date = ?'
    ).bind(userId, reportType, startDate, endDate).first();
    return record ? JSON.parse(record.data) : null;
  } catch (e) { console.error('getCachedGSCReport error:', e.message); return null; }
}

async function setCachedGSCReport(userId, reportType, startDate, endDate, data, env) {
  try {
    await env.MY_BINDING.prepare(
      `INSERT OR REPLACE INTO gsc_cache (user_id, report_type, start_date, end_date, data) VALUES (?, ?, ?, ?, ?)`
    ).bind(userId, reportType, startDate, endDate, JSON.stringify(data)).run();
  } catch (e) { console.error('setCachedGSCReport error:', e.message); }
}

async function refreshAccessToken(refreshToken, env) {
  const params = new URLSearchParams({
    refresh_token: refreshToken,
    client_id: env.GOOGLE_CLIENT_ID,
    client_secret: env.GOOGLE_CLIENT_SECRET,
    grant_type: 'refresh_token'
  });
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString()
  });
  if (!res.ok) throw new Error(`Token refresh failed: ${await res.text()}`);
  const data = await res.json();
  return data.access_token;
}

async function fetchGA4Report(accessToken, propertyId, dimensions, metrics, days = 7, startDate = null, endDate = null) {
  const body = {
    dimensions: dimensions.map(d => ({ name: d })),
    metrics: metrics.map(m => ({ name: m })),
    dateRanges: [{ startDate: startDate || `${days}daysAgo`, endDate: endDate || 'yesterday' }],
    limit: 100
  };
  const res = await fetch(`https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!res.ok) throw new Error(`GA4 API error: ${await res.text()}`);
  return res.json();
}

async function fetchGA4Realtime(accessToken, propertyId, type = 'overview') {
  let body = {};
  switch (type) {
    case 'overview': body = { metrics: [{ name: 'activeUsers' }, { name: 'eventCount' }], limit: 10 }; break;
    case 'minutes': body = { dimensions: [{ name: 'minutesAgo' }], metrics: [{ name: 'activeUsers' }], orderBys: [{ dimension: { dimensionName: 'minutesAgo' }, desc: false }], limit: 30 }; break;
    case 'devices': body = { dimensions: [{ name: 'deviceCategory' }], metrics: [{ name: 'activeUsers' }], orderBys: [{ metric: { metricName: 'activeUsers' }, desc: true }], limit: 5 }; break;
    case 'events': body = { dimensions: [{ name: 'eventName' }], metrics: [{ name: 'eventCount' }], orderBys: [{ metric: { metricName: 'eventCount' }, desc: true }], limit: 10 }; break;
    case 'countries': body = { dimensions: [{ name: 'country' }], metrics: [{ name: 'activeUsers' }], orderBys: [{ metric: { metricName: 'activeUsers' }, desc: true }], limit: 10 }; break;
    default: throw new Error('Invalid realtime type');
  }
  const res = await fetch(`https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runRealtimeReport`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!res.ok) throw new Error(`GA4 realtime error: ${await res.text()}`);
  return res.json();
}

async function ensureTables(env) {
  await env.MY_BINDING.prepare(
    `CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE,
      password_hash TEXT,
      name TEXT,
      subscription_status TEXT DEFAULT 'free',
      pro_since TIMESTAMP,
      stripe_customer_id TEXT,
      tier TEXT DEFAULT 'free',
      ga4_property_id TEXT
    )`
  ).run();
  await env.MY_BINDING.prepare(
    `CREATE TABLE IF NOT EXISTS user_gsc (
      user_id INTEGER PRIMARY KEY,
      refresh_token TEXT NOT NULL,
      site_url TEXT NOT NULL,
      connected_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )`
  ).run();
  await env.MY_BINDING.prepare(
    `CREATE TABLE IF NOT EXISTS gsc_cache (
      user_id INTEGER NOT NULL,
      report_type TEXT NOT NULL,
      start_date TEXT NOT NULL,
      end_date TEXT NOT NULL,
      data TEXT NOT NULL,
      cached_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (user_id, report_type, start_date, end_date)
    )`
  ).run();
  try { await env.MY_BINDING.prepare(`ALTER TABLE users ADD COLUMN ga4_property_id TEXT`).run(); } catch (e) {}
  await env.MY_BINDING.prepare(
    `CREATE TABLE IF NOT EXISTS magic_links (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL,
      token_hash TEXT NOT NULL UNIQUE,
      expires_at INTEGER NOT NULL,
      used INTEGER DEFAULT 0
    )`
  ).run();
  await env.MY_BINDING.prepare(
    `CREATE TABLE IF NOT EXISTS password_reset_tokens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      token TEXT NOT NULL UNIQUE,
      expires_at TIMESTAMP NOT NULL
    )`
  ).run();
  await env.MY_BINDING.prepare(
    `CREATE TABLE IF NOT EXISTS usage_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      tool_run_date TEXT,
      run_count INTEGER,
      tool_name TEXT,
      identifier TEXT
    )`
  ).run();
  try { await env.MY_BINDING.prepare(`ALTER TABLE usage_logs ADD COLUMN identifier TEXT`).run(); } catch (e) {}
  await env.MY_BINDING.prepare(
    `CREATE TABLE IF NOT EXISTS audit_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      url TEXT NOT NULL,
      tool_name TEXT NOT NULL,
      score INTEGER,
      timestamp INTEGER NOT NULL
    )`
  ).run();
  await env.MY_BINDING.prepare(
    `CREATE TABLE IF NOT EXISTS user_ga4 (
      user_id INTEGER PRIMARY KEY,
      refresh_token TEXT NOT NULL,
      property_id TEXT,
      connected_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )`
  ).run();
  await env.MY_BINDING.prepare(
    `CREATE TABLE IF NOT EXISTS ga4_cache (
      user_id INTEGER NOT NULL,
      report_type TEXT NOT NULL,
      days INTEGER NOT NULL,
      start_date TEXT,
      end_date TEXT,
      report_date TEXT NOT NULL,
      data TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (user_id, report_type, days, start_date, end_date)
    )`
  ).run();
  await env.MY_BINDING.prepare(
    `CREATE TABLE IF NOT EXISTS api_keys (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      key_hash TEXT NOT NULL UNIQUE,
      key_prefix TEXT NOT NULL,
      name TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      last_used_at TIMESTAMP,
      is_active INTEGER DEFAULT 1,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )`
  ).run();
  try { await env.MY_BINDING.prepare(`ALTER TABLE api_keys ADD COLUMN key_prefix TEXT`).run(); } catch (e) {}
  try { await env.MY_BINDING.prepare(`ALTER TABLE api_keys ADD COLUMN name TEXT`).run(); } catch (e) {}
  try { await env.MY_BINDING.prepare(`ALTER TABLE api_keys ADD COLUMN last_used_at TIMESTAMP`).run(); } catch (e) {}
  try { await env.MY_BINDING.prepare(`ALTER TABLE api_keys ADD COLUMN is_active INTEGER DEFAULT 1`).run(); } catch (e) {}
  await env.MY_BINDING.prepare(
    `CREATE TABLE IF NOT EXISTS api_usage (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      api_key_id INTEGER NOT NULL,
      endpoint TEXT NOT NULL,
      request_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      response_status INTEGER,
      FOREIGN KEY (api_key_id) REFERENCES api_keys(id) ON DELETE CASCADE
    )`
  ).run();
  await env.MY_BINDING.prepare(
    `CREATE TABLE IF NOT EXISTS webhooks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      url TEXT NOT NULL,
      events TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )`
  ).run();
  await env.MY_BINDING.prepare(
    `CREATE TABLE IF NOT EXISTS contributions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      type TEXT DEFAULT 'bug',
      subject TEXT,
      message TEXT NOT NULL,
      tool TEXT,
      page_url TEXT,
      status TEXT DEFAULT 'published',
      points INTEGER DEFAULT 25,
      created_at INTEGER NOT NULL
    )`
  ).run();
  await env.MY_BINDING.prepare(
    `CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      type TEXT NOT NULL,
      actor_id INTEGER,
      subject_type TEXT,
      subject_id INTEGER,
      message TEXT NOT NULL,
      link TEXT,
      is_read INTEGER DEFAULT 0,
      created_at INTEGER NOT NULL
    )`
  ).run();
  try { await env.MY_BINDING.prepare(`CREATE INDEX IF NOT EXISTS idx_notif_user ON notifications(user_id, created_at DESC)`).run(); } catch (e) {}
  try { await env.MY_BINDING.prepare(`CREATE INDEX IF NOT EXISTS idx_notif_unread ON notifications(user_id, is_read)`).run(); } catch (e) {}
  try { await env.MY_BINDING.prepare(`ALTER TABLE users ADD COLUMN notify_comments INTEGER DEFAULT 1`).run(); } catch (e) {}
  try { await env.MY_BINDING.prepare(`ALTER TABLE users ADD COLUMN notify_network INTEGER DEFAULT 1`).run(); } catch (e) {}
  try { await env.MY_BINDING.prepare(`ALTER TABLE users ADD COLUMN notify_leaderboard INTEGER DEFAULT 1`).run(); } catch (e) {}
  try { await env.MY_BINDING.prepare(`ALTER TABLE users ADD COLUMN notify_messages INTEGER DEFAULT 1`).run(); } catch (e) {}
  try { await env.MY_BINDING.prepare(`ALTER TABLE users ADD COLUMN push_comments INTEGER DEFAULT 1`).run(); } catch (e) {}
  try { await env.MY_BINDING.prepare(`ALTER TABLE users ADD COLUMN push_network INTEGER DEFAULT 1`).run(); } catch (e) {}
  try { await env.MY_BINDING.prepare(`ALTER TABLE users ADD COLUMN push_leaderboard INTEGER DEFAULT 1`).run(); } catch (e) {}
  try { await env.MY_BINDING.prepare(`ALTER TABLE users ADD COLUMN push_messages INTEGER DEFAULT 1`).run(); } catch (e) {}
  await env.MY_BINDING.prepare(
    `CREATE TABLE IF NOT EXISTS user_points (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      event_type TEXT NOT NULL,
      points INTEGER NOT NULL,
      reference_id INTEGER,
      created_at INTEGER NOT NULL
    )`
  ).run();
  try { await env.MY_BINDING.prepare(`CREATE INDEX IF NOT EXISTS idx_user_points_user ON user_points(user_id)`).run(); } catch (e) {}
  try { await env.MY_BINDING.prepare(`CREATE INDEX IF NOT EXISTS idx_user_points_event ON user_points(user_id, event_type)`).run(); } catch (e) {}
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
  try { await env.MY_BINDING.prepare(`ALTER TABLE users ADD COLUMN avatar_r2_key TEXT`).run(); } catch (e) {}
  try { await env.MY_BINDING.prepare(`ALTER TABLE users ADD COLUMN avatar_updated_at INTEGER`).run(); } catch (e) {}
  try { await env.MY_BINDING.prepare(`ALTER TABLE users ADD COLUMN message_policy TEXT DEFAULT 'all'`).run(); } catch (e) {}
  try { await env.MY_BINDING.prepare(`ALTER TABLE users ADD COLUMN messages_blocked INTEGER DEFAULT 0`).run(); } catch (e) {}
  // ── Phase B: Advanced profile columns ──
  try { await env.MY_BINDING.prepare(`ALTER TABLE users ADD COLUMN verified_domain TEXT`).run(); } catch (e) {}
  try { await env.MY_BINDING.prepare(`ALTER TABLE users ADD COLUMN verified_token TEXT`).run(); } catch (e) {}
  try { await env.MY_BINDING.prepare(`ALTER TABLE users ADD COLUMN verified_at INTEGER`).run(); } catch (e) {}
  try { await env.MY_BINDING.prepare(`ALTER TABLE users ADD COLUMN skills TEXT`).run(); } catch (e) {}
  // ── Social expansion ──
  try { await env.MY_BINDING.prepare(`ALTER TABLE posts ADD COLUMN post_type TEXT DEFAULT 'audit'`).run(); } catch (e) {}
  try { await env.MY_BINDING.prepare(`ALTER TABLE posts ADD COLUMN images TEXT`).run(); } catch (e) {}
  try { await env.MY_BINDING.prepare(`ALTER TABLE comments ADD COLUMN images TEXT`).run(); } catch (e) {}
  try { await env.MY_BINDING.prepare(`ALTER TABLE posts ADD COLUMN workflow_meta TEXT`).run(); } catch (e) {}
  try { await env.MY_BINDING.prepare(`CREATE TABLE IF NOT EXISTS og_cache (url TEXT PRIMARY KEY, title TEXT, description TEXT, image TEXT, site_name TEXT, fetched_at INTEGER NOT NULL)`).run(); } catch (e) {}
  try { await env.MY_BINDING.prepare(`ALTER TABLE posts ADD COLUMN title TEXT`).run(); } catch (e) {}
  try { await env.MY_BINDING.prepare(`ALTER TABLE posts ADD COLUMN body_md TEXT`).run(); } catch (e) {}
  try { await env.MY_BINDING.prepare(`ALTER TABLE posts ADD COLUMN visibility TEXT DEFAULT 'public'`).run(); } catch (e) {}
  try { await env.MY_BINDING.prepare(`ALTER TABLE posts ADD COLUMN before_score INTEGER`).run(); } catch (e) {}
  try { await env.MY_BINDING.prepare(`ALTER TABLE comments ADD COLUMN body_md TEXT`).run(); } catch (e) {}
  try { await env.MY_BINDING.prepare(`CREATE INDEX IF NOT EXISTS idx_comments_post_created ON comments(post_id, created_at DESC)`).run(); } catch (e) {}
  try { await env.MY_BINDING.prepare(`CREATE INDEX IF NOT EXISTS idx_posts_type_cat_created ON posts(post_type, category, created_at DESC)`).run(); } catch (e) {}
  try { await env.MY_BINDING.prepare(`ALTER TABLE users ADD COLUMN contacts TEXT`).run(); } catch (e) {}
  try { await env.MY_BINDING.prepare(`ALTER TABLE users ADD COLUMN contacts_visibility TEXT DEFAULT 'click'`).run(); } catch (e) {}
  try { await env.MY_BINDING.prepare(`ALTER TABLE users ADD COLUMN available_for_hire INTEGER DEFAULT 0`).run(); } catch (e) {}
  try { await env.MY_BINDING.prepare(`ALTER TABLE users ADD COLUMN hire_headline TEXT`).run(); } catch (e) {}
  try { await env.MY_BINDING.prepare(`ALTER TABLE users ADD COLUMN hire_services TEXT`).run(); } catch (e) {}
  try { await env.MY_BINDING.prepare(`ALTER TABLE users ADD COLUMN contact_email TEXT`).run(); } catch (e) {}
  // Phase D: torch endorsements
  try {
    await env.MY_BINDING.prepare(
      `CREATE TABLE IF NOT EXISTS torch_endorsements (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        torch_id INTEGER NOT NULL,
        endorser_id INTEGER NOT NULL,
        author_id INTEGER NOT NULL,
        created_at INTEGER NOT NULL,
        UNIQUE(torch_id, endorser_id)
      )`
    ).run();
    await env.MY_BINDING.prepare(`CREATE INDEX IF NOT EXISTS idx_endorse_torch ON torch_endorsements(torch_id)`).run();
    await env.MY_BINDING.prepare(`CREATE INDEX IF NOT EXISTS idx_endorse_author ON torch_endorsements(author_id)`).run();
    await env.MY_BINDING.prepare(`CREATE INDEX IF NOT EXISTS idx_endorse_endorser ON torch_endorsements(endorser_id, created_at DESC)`).run();
  } catch (e) { console.error('endorse table:', e.message); }
}

// ============================================================
// ensureTables runs once per Worker instance, not per request.
// The first request in a cold instance pays the cost; every
// request after that gets an instant Promise.resolve().
// If the first run fails, we clear the cache so the next
// request retries instead of being permanently broken.
// ============================================================
let _tablesEnsured = null;
function ensureTablesOnce(env) {
  if (!_tablesEnsured) {
    _tablesEnsured = ensureTables(env).catch(err => {
      _tablesEnsured = null;
      throw err;
    });
  }
  return _tablesEnsured;
}

async function getCachedReport(userId, reportType, days, startDate, endDate, env) {
  try {
    const today = new Date().toISOString().split('T')[0];
    const record = await env.MY_BINDING.prepare(
      'SELECT data FROM ga4_cache WHERE user_id = ? AND report_type = ? AND days = ? AND start_date = ? AND end_date = ? AND report_date = ?'
    ).bind(userId, reportType, days, startDate || '', endDate || '', today).first();
    return record ? JSON.parse(record.data) : null;
  } catch (e) { console.error('getCachedReport error:', e.message); return null; }
}

async function setCachedReport(userId, reportType, days, startDate, endDate, data, env) {
  try {
    const today = new Date().toISOString().split('T')[0];
    await env.MY_BINDING.prepare(
      `INSERT OR REPLACE INTO ga4_cache (user_id, report_type, days, start_date, end_date, report_date, data) VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).bind(userId, reportType, days, startDate || '', endDate || '', today, JSON.stringify(data)).run();
  } catch (e) { console.error('setCachedReport error:', e.message); }
}

// ============================================================
// Shared constants + helpers
// ============================================================
const SLOT_MAP = { free: 5, pro: 10, enterprise: 300, guest: 5 };
const AVATARS = ['owner', 'designer', 'seo'];
const ROLES = ['ai-lens', 'owner', 'designer', 'seo', 'ai-director', 'developer', 'ai-conductor', 'context-engineer', 'other'];
const CATEGORIES = ['casual','websites','ux','seo','aeo'];

const POINTS_COMMENT      = 5;
const POINTS_POST         = 10;
const POINTS_LEADERBOARD  = 10;
const POINTS_CONTRIBUTION = 25;
const TOOL_PATHS = {
  'NUSA': '/',
  'OFUX': '/ofux-tool/',
  'Lighthouse Plus': '/lighthouse-plus-tool/',
  'AEO Performance': '/aeo-performance-tool/',
  'SEO Intent': '/seo-intent-tool/',
  'SEO + UX': '/seo-ux-tool/',
  'Local SEO': '/local-seo-tool/',
  'Product SEO': '/product-seo-tool/',
  'Entity Extractor': '/seo-entity-extractor-tool/',
  'Topical Authority': '/topical-authority-audit-tool/',
  'Schema Generator': '/schema-generator/',
  'AEO / AI Search': '/ai-search-optimization-tool/',
  'Voice Search': '/ai-voice-search-tool/',
  'AI Content Audit': '/ai-audit-tool/',
  'Quit Risk': '/quit-risk-tool/',
  'Keyword Research': '/keyword-research-tool/',
  'Keyword Placement': '/keyword-tool/'
};

const FEED_CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization'
};

function feedJson(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...FEED_CORS }
  });
}

async function purgeRenderWorker(env, paths) {
  if (!env.PURGE_SECRET || !paths || !paths.length) return;
  const url = 'https://torches-page-render.traffictorch.workers.dev/api/internal/purge';
  try {
    await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${env.PURGE_SECRET}`,
      },
      body: JSON.stringify({ paths }),
    });
  } catch (err) {
    console.error('purgeRenderWorker error:', err.message);
  }
}

async function getUserFromToken(request, env) {
  const auth = request.headers.get('Authorization') || '';
  const token = auth.replace('Bearer ', '').trim();
  if (!token) return null;
  try {
    const payload = await verifyJWT(token, env.JWT_SECRET);
    if (!payload) return null;
    const userId = payload.id || payload.userId || payload.sub;
    if (!userId) return null;
    const user = await env.MY_BINDING.prepare('SELECT * FROM users WHERE id = ?').bind(userId).first();
    return user || null;
  } catch { return null; }
}

function parseJsonArray(raw) {
  if (!raw) return [];
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}

function slugifyUsername(str) {
  return String(str || '')
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 30) || 'user';
}

// ============================================================
// Feature B — Discover: daily seed (resets 11:00 UTC)
// ============================================================
function _discoverSeed(viewerId, fresh = false) {
  const nowMs = Date.now();
  const key = fresh
    ? `${viewerId}:${nowMs}`
    : `${viewerId}:${Math.floor((nowMs - 11 * 3600 * 1000) / 86400000)}`;
  let h = 2166136261 >>> 0;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

async function ensureUsername(env, user) {
  if (user.username) return user.username;
  let base = slugifyUsername(user.name || user.email?.split('@')[0] || 'user');
  let candidate = base;
  let n = 1;
  while (true) {
    const clash = await env.MY_BINDING.prepare('SELECT id FROM users WHERE username = ?').bind(candidate).first();
    if (!clash) break;
    candidate = base + n;
    n++;
    if (n > 999) { candidate = base + Date.now().toString(36).slice(-4); break; }
  }
  await env.MY_BINDING.prepare('UPDATE users SET username = ? WHERE id = ?').bind(candidate, user.id).run();
  return candidate;
}

function withAvatarUrl(row) {
  if (!row) return row;
  const id = row.user_id != null ? row.user_id : row.id;
  if (id && row.avatar_r2_key) {
    row.avatar_url = `https://traffic-torch-auth.traffictorch.workers.dev/api/profile/avatar/${id}?v=${row.avatar_updated_at || 0}`;
  }
  if (row.actor_id && row.actor_avatar_r2_key) {
    row.actor_avatar_url = `https://traffic-torch-auth.traffictorch.workers.dev/api/profile/avatar/${row.actor_id}?v=${row.actor_avatar_updated_at || 0}`;
  }
  return row;
}

function withAvatars(rows) { return (rows || []).map(withAvatarUrl); }

function shapeProfile(user) {
  return {
    id: user.id,
    username: user.username,
    display_name: user.name || user.username,
    avatar_preset: user.avatar_preset || 'owner',
    avatar_r2_key: user.avatar_r2_key || null,
    avatar_updated_at: user.avatar_updated_at || null,
    avatar_url: user.avatar_r2_key
      ? `https://traffic-torch-auth.traffictorch.workers.dev/api/profile/avatar/${user.id}?v=${user.avatar_updated_at || 0}`
      : null,
    role: user.role || 'owner',
    tier: user.tier || 'free',
    verified_domain: user.verified_domain || null,
    verified_at: user.verified_at || null,
    skills: parseJsonArray(user.skills),
    contacts: parseJsonArray(user.contacts),
    contacts_visibility: user.contacts_visibility || 'click',
    available_for_hire: user.available_for_hire === 1 ? 1 : 0,
    hire_headline: user.hire_headline || '',
    hire_services: parseJsonArray(user.hire_services),
    contact_email: user.contact_email || '',
    bio: user.bio || '',
    website_url: user.website_url || '',
    website_approved: user.website_approved || 0,
    social1_url: user.social1_url || '',
    social2_url: user.social2_url || '',
    job_title: user.job_title || '',
    company: user.company || '',
    location: user.location || '',
    auto_share: user.auto_share || 0,
    show_network: user.show_network !== 0 ? 1 : 0,
    allow_adds: user.allow_adds !== 0 ? 1 : 0,
    profile_public: user.profile_public !== 0 ? 1 : 0,
    notify_comments: user.notify_comments !== 0 ? 1 : 0,
    notify_network: user.notify_network !== 0 ? 1 : 0,
    notify_leaderboard: user.notify_leaderboard !== 0 ? 1 : 0,
    notify_messages: user.notify_messages !== 0 ? 1 : 0,
    push_comments: user.push_comments !== 0 ? 1 : 0,
    push_network: user.push_network !== 0 ? 1 : 0,
    push_leaderboard: user.push_leaderboard !== 0 ? 1 : 0,
    push_messages: user.push_messages !== 0 ? 1 : 0,
    activity_public: user.activity_public !== 0 ? 1 : 0,
    message_policy: user.message_policy || 'all',
    messages_blocked: user.messages_blocked || 0,
    created_at: user.created_at ? new Date(user.created_at).getTime() : null
  };
}

// ============================================================
// Points system
// ============================================================
async function awardPoints(env, { userId, type, points, referenceId }) {
  try {
    await env.MY_BINDING.prepare(
      `INSERT INTO user_points (user_id, event_type, points, reference_id, created_at)
       VALUES (?, ?, ?, ?, ?)`
    ).bind(userId, type, points, referenceId || null, Date.now()).run();

    const newTotal = await getUserTotalPoints(env, userId);
    const prevTotal = newTotal - points;
    const THRESHOLDS = [100, 500, 1000, 5000, 10000, 25000, 50000];
    for (const t of THRESHOLDS) {
      if (newTotal >= t && prevTotal < t) {
        await logActivity(env, userId, 'points_milestone', {
          targetLabel: `${t.toLocaleString()} points`,
          link: '/leader-board/'
        });
        break;
      }
    }
  } catch (e) { console.error('awardPoints error:', e.message); }
}

async function getUserTotalPoints(env, userId) {
  try {
    const row = await env.MY_BINDING.prepare(
      'SELECT COALESCE(SUM(points), 0) AS total FROM user_points WHERE user_id = ?'
    ).bind(userId).first();
    return row?.total || 0;
  } catch { return 0; }
}

async function getUserLeaderboardRank(env, userId) {
  try {
    const me = await getUserTotalPoints(env, userId);
    if (!me) return null;
    const row = await env.MY_BINDING.prepare(
      `SELECT COUNT(*) AS higher FROM (
         SELECT user_id, SUM(points) AS total FROM user_points GROUP BY user_id
       ) WHERE total > ?`
    ).bind(me).first();
    return (row?.higher || 0) + 1;
  } catch { return null; }
}

// ============================================================
// Feature C — Activity logger
// ============================================================
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

// ============================================================
// Profile routes
// ============================================================
async function handleProfileRoutes(request, env, url) {
  const user = await getUserFromToken(request, env);

  if (url.pathname === '/api/profile/me' && request.method === 'GET') {
    if (!user) return feedJson({ error: 'Unauthorized' }, 401);
    await ensureUsername(env, user);
    const fresh = await env.MY_BINDING.prepare('SELECT * FROM users WHERE id = ?').bind(user.id).first();
    const profile = shapeProfile(fresh);
    profile.total_points = await getUserTotalPoints(env, user.id);
    const endorseRow = await env.MY_BINDING.prepare(
      'SELECT COUNT(*) AS c FROM torch_endorsements WHERE author_id = ?'
    ).bind(user.id).first();
    profile.endorsement_count = (endorseRow && endorseRow.c) ? endorseRow.c : 0;
    return feedJson({ profile });
  }

  if (url.pathname === '/api/profile/me' && request.method === 'PATCH') {
    if (!user) return feedJson({ error: 'Unauthorized' }, 401);
    let body;
    try { body = await request.json(); } catch { return feedJson({ error: 'Invalid JSON' }, 400); }

    const fields = [];
    const params = [];

    if (typeof body.display_name === 'string') { fields.push('name = ?'); params.push(body.display_name.slice(0, 60)); }
    if (typeof body.username === 'string') {
      const clean = slugifyUsername(body.username);
      if (clean.length < 3) return feedJson({ error: 'Username too short' }, 400);
      const clash = await env.MY_BINDING.prepare('SELECT id FROM users WHERE username = ? AND id != ?').bind(clean, user.id).first();
      if (clash) return feedJson({ error: 'Username taken' }, 409);
      fields.push('username = ?'); params.push(clean);
    }
    if (AVATARS.includes(body.avatar_preset)) { fields.push('avatar_preset = ?'); params.push(body.avatar_preset); }
    if (ROLES.includes(body.role)) { fields.push('role = ?'); params.push(body.role); }
    if (typeof body.bio === 'string') { fields.push('bio = ?'); params.push(body.bio.slice(0, 160)); }
    if (typeof body.website_url === 'string') {
      fields.push('website_url = ?'); params.push(body.website_url.slice(0, 300));
      fields.push('website_approved = 1');
      fields.push('verified_domain = NULL');
      fields.push('verified_token = NULL');
      fields.push('verified_at = NULL');
    }
    if (typeof body.social1_url === 'string') { fields.push('social1_url = ?'); params.push(body.social1_url.slice(0, 300)); }
    if (typeof body.social2_url === 'string') { fields.push('social2_url = ?'); params.push(body.social2_url.slice(0, 300)); }
    if (typeof body.job_title === 'string') { fields.push('job_title = ?'); params.push(body.job_title.slice(0, 60)); }
    if (typeof body.company === 'string') { fields.push('company = ?'); params.push(body.company.slice(0, 60)); }
    if (typeof body.location === 'string') { fields.push('location = ?'); params.push(body.location.slice(0, 60)); }
    if (body.auto_share !== undefined) { fields.push('auto_share = ?'); params.push(body.auto_share ? 1 : 0); }
    if (body.show_network !== undefined) { fields.push('show_network = ?'); params.push(body.show_network ? 1 : 0); }
    if (body.allow_adds !== undefined) { fields.push('allow_adds = ?'); params.push(body.allow_adds ? 1 : 0); }
    if (body.profile_public !== undefined) { fields.push('profile_public = ?'); params.push(body.profile_public ? 1 : 0); }
    if (body.notify_comments !== undefined) { fields.push('notify_comments = ?'); params.push(body.notify_comments ? 1 : 0); }
    if (body.notify_network !== undefined) { fields.push('notify_network = ?'); params.push(body.notify_network ? 1 : 0); }
    if (body.notify_leaderboard !== undefined) { fields.push('notify_leaderboard = ?'); params.push(body.notify_leaderboard ? 1 : 0); }
    if (body.notify_messages !== undefined) { fields.push('notify_messages = ?'); params.push(body.notify_messages ? 1 : 0); }
    if (body.push_comments !== undefined) { fields.push('push_comments = ?'); params.push(body.push_comments ? 1 : 0); }
    if (body.push_network !== undefined) { fields.push('push_network = ?'); params.push(body.push_network ? 1 : 0); }
    if (body.push_leaderboard !== undefined) { fields.push('push_leaderboard = ?'); params.push(body.push_leaderboard ? 1 : 0); }
    if (body.push_messages !== undefined) { fields.push('push_messages = ?'); params.push(body.push_messages ? 1 : 0); }
    if (body.activity_public !== undefined) { fields.push('activity_public = ?'); params.push(body.activity_public ? 1 : 0); }
    // ── Phase B: Advanced profile fields ──
    if (body.skills !== undefined) {
      if (!Array.isArray(body.skills)) return feedJson({ error: 'skills must be an array' }, 400);
      const clean = body.skills.map(s => String(s || '').trim()).filter(Boolean).slice(0, 8).map(s => s.slice(0, 24));
      fields.push('skills = ?'); params.push(JSON.stringify(clean));
    }
    if (body.contacts !== undefined) {
      if (!Array.isArray(body.contacts)) return feedJson({ error: 'contacts must be an array' }, 400);
      const types = ['email','whatsapp','telegram','wechat','signal','phone','linkedin','x','other-url'];
      const clean = body.contacts.slice(0, 3).map(c => {
        if (!c || typeof c !== 'object') return null;
        const type = String(c.type || '').trim();
        if (!types.includes(type)) return null;
        return { type, value: String(c.value || '').trim().slice(0, 200), label: String(c.label || '').trim().slice(0, 40) };
      }).filter(c => c && c.value);
      fields.push('contacts = ?'); params.push(JSON.stringify(clean));
    }
    if (body.contacts_visibility !== undefined) {
      fields.push('contacts_visibility = ?'); params.push(body.contacts_visibility === 'public' ? 'public' : 'click');
    }
    if (body.available_for_hire !== undefined) { fields.push('available_for_hire = ?'); params.push(body.available_for_hire ? 1 : 0); }
    if (typeof body.hire_headline === 'string') { fields.push('hire_headline = ?'); params.push(body.hire_headline.slice(0, 60)); }
    if (body.hire_services !== undefined) {
      if (!Array.isArray(body.hire_services)) return feedJson({ error: 'hire_services must be an array' }, 400);
      const clean = body.hire_services.map(s => String(s || '').trim()).filter(Boolean).slice(0, 6).map(s => s.slice(0, 30));
      fields.push('hire_services = ?'); params.push(JSON.stringify(clean));
    }
    if (typeof body.contact_email === 'string') {
      const e = body.contact_email.trim().slice(0, 120);
      if (e && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) return feedJson({ error: 'Invalid contact_email' }, 400);
      fields.push('contact_email = ?'); params.push(e);
    }

    if (!fields.length) return feedJson({ error: 'Nothing to update' }, 400);

    params.push(user.id);
    await env.MY_BINDING.prepare(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`).bind(...params).run();
    const fresh = await env.MY_BINDING.prepare('SELECT * FROM users WHERE id = ?').bind(user.id).first();
    const profile = shapeProfile(fresh);
    profile.total_points = await getUserTotalPoints(env, user.id);
    return feedJson({ success: true, profile });
  }

  if (url.pathname === '/api/profile/verify-domain' && request.method === 'POST') {
    if (!user) return feedJson({ error: 'Unauthorized' }, 401);
    const fresh = await env.MY_BINDING.prepare('SELECT website_url, verified_token FROM users WHERE id = ?').bind(user.id).first();
    if (!fresh || !fresh.website_url) return feedJson({ error: 'Add a website URL to your profile first' }, 400);
    let targetHost;
    try { targetHost = new URL(fresh.website_url).hostname.replace(/^www\./, ''); }
    catch { return feedJson({ error: 'Your website URL is invalid' }, 400); }
    const token = fresh.verified_token || crypto.randomUUID().replace(/-/g, '');
    await env.MY_BINDING.prepare('UPDATE users SET verified_token = ? WHERE id = ?').bind(token, user.id).run();
    let html = '';
    try {
      const ctrl = new AbortController();
      const to = setTimeout(() => ctrl.abort(), 8000);
      const res = await fetch(fresh.website_url, { signal: ctrl.signal, headers: { 'User-Agent': 'TrafficTorch-Verify/1.0' } });
      clearTimeout(to);
      if (!res.ok) return feedJson({ error: 'Website returned HTTP ' + res.status, token }, 400);
      html = (await res.text()).slice(0, 500000);
    } catch (e) {
      return feedJson({ error: 'Could not reach website: ' + e.message, token }, 400);
    }
    const metaRe = new RegExp('<meta\\s+name=["\']traffic-torch-verify["\']\\s+content=["\']' + token + '["\']', 'i');
    if (!metaRe.test(html)) {
      return feedJson({ success: false, verified: false, token, message: 'Meta tag not found. Add the tag to your <head> and retry.' });
    }
    await env.MY_BINDING.prepare('UPDATE users SET verified_domain = ?, verified_at = ? WHERE id = ?').bind(targetHost, Date.now(), user.id).run();
    return feedJson({ success: true, verified: true, domain: targetHost });
  }

  if (url.pathname.startsWith('/api/torcher/') && request.method === 'GET') {
    const username = decodeURIComponent(url.pathname.replace('/api/torcher/', '').replace(/\/$/, ''));
    const target = await env.MY_BINDING.prepare('SELECT * FROM users WHERE username = ?').bind(username).first();
    if (!target || !target.profile_public) return feedJson({ error: 'Not found' }, 404);

    const profile = shapeProfile(target);
    profile.total_points = await getUserTotalPoints(env, target.id);
    delete profile.allow_adds;
    delete profile.auto_share;
    delete profile.notify_comments;
    delete profile.notify_network;
    delete profile.notify_leaderboard;
    // ── Phase C: public advanced fields ──
    delete profile.verified_token;
    profile.skills = Array.isArray(profile.skills) ? profile.skills : [];
    profile.verified_domain = profile.verified_domain || null;
    profile.verified_at = profile.verified_at || null;
    profile.available_for_hire = profile.available_for_hire === 1 ? 1 : 0;
    profile.hire_headline = profile.hire_headline || '';
    profile.hire_services = Array.isArray(profile.hire_services) ? profile.hire_services : [];
    profile.contact_email = profile.contact_email || '';
    const rawContacts = Array.isArray(profile.contacts) ? profile.contacts : [];
    const contactVisibility = profile.contacts_visibility || 'click';
    profile.contacts = rawContacts.map(c => {
      const v = String(c.value || '');
      if (contactVisibility === 'public') return { type: c.type, label: c.label || '', partA: v, partB: '' };
      const mid = Math.ceil(v.length / 2);
      return { type: c.type, label: c.label || '', partA: v.slice(0, mid), partB: v.slice(mid) };
    });
    delete profile.contacts_visibility;
    const totalEndorseRow = await env.MY_BINDING.prepare(
      'SELECT COUNT(*) AS c FROM torch_endorsements WHERE author_id = ?'
    ).bind(target.id).first();
    profile.endorsement_count = totalEndorseRow && totalEndorseRow.c ? totalEndorseRow.c : 0;

    const posts = await env.MY_BINDING.prepare(
      `SELECT id, category, post_type, title, body_md, note, tool, url, page_title, score, images, workflow_meta, domain_mode, domain_label, module_scores, created_at
         FROM posts WHERE user_id = ? AND status = 'published'
         ORDER BY created_at DESC LIMIT 30`
    ).bind(target.id).all();

    // Phase D: endorse counts per post
    if (posts.results && posts.results.length) {
      const ids = posts.results.map(p => p.id);
      const ph = ids.map(() => '?').join(',');
      const endorseRows = await env.MY_BINDING.prepare(
        `SELECT torch_id, COUNT(*) AS c FROM torch_endorsements WHERE torch_id IN (${ph}) GROUP BY torch_id`
      ).bind(...ids).all();
      const endorseMap = {};
      (endorseRows.results || []).forEach(r => { endorseMap[r.torch_id] = r.c; });
      posts.results.forEach(p => { p.endorse_count = endorseMap[p.id] || 0; });
    }

    let networkCount = 0;
    let networkList = [];
    if (profile.show_network) {
      const net = await env.MY_BINDING.prepare(
        `SELECT u.id, u.username, u.name AS display_name, u.avatar_preset,
                u.avatar_r2_key, u.avatar_updated_at, u.role
           FROM network n JOIN users u ON u.id = n.network_user_id
          WHERE n.user_id = ? LIMIT 60`
      ).bind(target.id).all();
      networkList = withAvatars(net.results);
      networkCount = networkList.length;
    }

    return feedJson({ profile, posts: posts.results || [], network: networkList, network_count: networkCount });
  }

  return null;
}

async function handleTorchRoutes(request, env, url) {
  const user = await getUserFromToken(request, env);
  if (url.pathname.match(/^\/api\/torch\/\d+$/) && request.method === 'GET') {
    const id = parseInt(url.pathname.split('/').pop(), 10);
    const post = await env.MY_BINDING.prepare(
      `SELECT p.id, p.user_id, p.category, p.post_type, p.title, p.body_md, p.note, p.tool, p.url, p.page_title, p.score, p.images, p.workflow_meta,
              p.domain_mode, p.domain_label, p.module_scores, p.status, p.created_at,
              u.username, u.name AS display_name, u.avatar_preset, u.avatar_r2_key, u.avatar_updated_at, u.role, u.verified_at, u.bio,
              u.website_url, u.website_approved, u.social1_url, u.social2_url,
              u.job_title, u.company, u.location, u.show_network, u.allow_adds,
              u.verified_at, u.verified_domain,
              u.created_at AS author_created_at,
              COALESCE((SELECT SUM(up.points) FROM user_points up WHERE up.user_id = u.id), 0) AS total_points,
              (SELECT COUNT(*) FROM posts p2 WHERE p2.user_id = u.id AND p2.status = 'published') AS audit_count
         FROM posts p
         JOIN users u ON u.id = p.user_id
        WHERE p.id = ? AND p.status = 'published'`
    ).bind(id).first();

    if (!post) return feedJson({ error: 'Not found' }, 404);

    if (post.domain_mode === 'hidden' && post.domain_label) {
      post.url = null;
    }

    const networkCountRow = await env.MY_BINDING.prepare(
      'SELECT COUNT(*) AS c FROM network WHERE user_id = ?'
    ).bind(post.user_id).first();
    const networkCount = networkCountRow?.c || 0;

    let networkList = [];
    if (post.show_network) {
      const net = await env.MY_BINDING.prepare(
        `SELECT u.id, u.username, u.name AS display_name, u.avatar_preset,
                u.avatar_r2_key, u.avatar_updated_at, u.role
           FROM network n JOIN users u ON u.id = n.network_user_id
          WHERE n.user_id = ? LIMIT 30`
      ).bind(post.user_id).all();
      networkList = withAvatars(net.results);
    }

    const moreByAuthor = await env.MY_BINDING.prepare(
      `SELECT id, tool, url, page_title, score, domain_mode, domain_label, created_at
         FROM posts
        WHERE user_id = ? AND status = 'published' AND id != ?
        ORDER BY created_at DESC LIMIT 3`
    ).bind(post.user_id, id).all();

    const since = Date.now() - 90 * 86400 * 1000;
    const related = await env.MY_BINDING.prepare(
      `SELECT p.id, p.tool, p.url, p.page_title, p.score, p.domain_mode, p.domain_label, p.created_at,
              u.username, u.name AS display_name, u.avatar_preset, u.avatar_r2_key, u.avatar_updated_at
         FROM posts p
         JOIN users u ON u.id = p.user_id
        WHERE p.tool = ? AND p.status = 'published'
          AND p.id != ? AND p.user_id != ?
          AND p.score BETWEEN ? AND ?
          AND p.created_at >= ?
        ORDER BY p.created_at DESC LIMIT 4`
    ).bind(
      post.tool, id, post.user_id,
      Math.max(0, post.score - 15), Math.min(100, post.score + 15),
      since
    ).all();

    // Phase D: endorsement counts
    const endorseCountRow = await env.MY_BINDING.prepare(
      'SELECT COUNT(*) AS c FROM torch_endorsements WHERE torch_id = ?'
    ).bind(id).first();
    post.endorse_count = endorseCountRow && endorseCountRow.c ? endorseCountRow.c : 0;
    if (user) {
      const viewerRow = await env.MY_BINDING.prepare(
        'SELECT id FROM torch_endorsements WHERE torch_id = ? AND endorser_id = ?'
      ).bind(id, user.id).first();
      post.viewer_endorsed = !!viewerRow;
    } else {
      post.viewer_endorsed = false;
    }

    return feedJson({
      post,
      author: {
        id: post.user_id, username: post.username, display_name: post.display_name,
        avatar_preset: post.avatar_preset,
        avatar_r2_key: post.avatar_r2_key || null,
        avatar_updated_at: post.avatar_updated_at || null,
        avatar_url: post.avatar_r2_key
          ? `https://traffic-torch-auth.traffictorch.workers.dev/api/profile/avatar/${post.user_id}?v=${post.avatar_updated_at || 0}`
          : null,
        role: post.role, bio: post.bio,
        website_url: post.website_url, website_approved: post.website_approved,
        social1_url: post.social1_url, social2_url: post.social2_url,
        job_title: post.job_title, company: post.company, location: post.location,
        show_network: post.show_network, allow_adds: post.allow_adds,
        verified_at: post.verified_at, verified_domain: post.verified_domain,
        total_points: post.total_points, created_at: post.author_created_at,
        audit_count: post.audit_count, network_count: networkCount,
      },
      author_network: networkList,
      more_by_author: moreByAuthor.results || [],
      related: related.results || [],
    });
  }
  return null;
}

// ============================================================
// Sitemap data routes
// ============================================================
async function handleSitemapRoutes(request, env, url) {
  if (url.pathname === '/api/sitemap/profiles' && request.method === 'GET') {
    const rows = await env.MY_BINDING.prepare(
      `SELECT u.username,
              MAX(COALESCE(p.created_at, 0)) AS last_torch,
              u.created_at
         FROM users u
         LEFT JOIN posts p ON p.user_id = u.id AND p.status = 'published'
        WHERE u.profile_public = 1 AND u.username IS NOT NULL
        GROUP BY u.id
        ORDER BY u.created_at DESC
        LIMIT 45000`
    ).all();
    return feedJson({ rows: rows.results || [] });
  }

  if (url.pathname === '/api/sitemap/torches' && request.method === 'GET') {
    const rows = await env.MY_BINDING.prepare(
      `SELECT id, created_at
         FROM posts
        WHERE status = 'published' AND domain_mode != 'hidden'
        ORDER BY created_at DESC
        LIMIT 45000`
    ).all();
    return feedJson({ rows: rows.results || [] });
  }

  if (url.pathname === '/api/sitemap/static' && request.method === 'GET') {
    return feedJson({
      rows: [
        // ── Core pages ──
        { loc: '/',                                  priority: '1.0', changefreq: 'weekly' },
        { loc: '/community/',                        priority: '0.9', changefreq: 'daily' },
        { loc: '/leader-board/',                     priority: '0.9', changefreq: 'daily' },
        { loc: '/news/',                             priority: '0.8', changefreq: 'weekly' },
        { loc: '/ai-ux-seo-help-guides/',            priority: '0.8', changefreq: 'weekly' },
        { loc: '/ai-seo-ux-tools/',                  priority: '0.8', changefreq: 'weekly' },
        { loc: '/apps/',                             priority: '0.6', changefreq: 'monthly' },
        { loc: '/about/',                            priority: '0.6', changefreq: 'monthly' },
        { loc: '/contact/',                          priority: '0.5', changefreq: 'monthly' },
        { loc: '/research/traffic-torch-whitepaper/',priority: '0.6', changefreq: 'monthly' },
        { loc: '/pro/',                              priority: '0.7', changefreq: 'monthly' },
        { loc: '/upgrade/',                          priority: '0.6', changefreq: 'monthly' },
        { loc: '/privacy/',                          priority: '0.3', changefreq: 'yearly' },
        { loc: '/terms/',                            priority: '0.3', changefreq: 'yearly' },

        // ── Tool pages ──
        { loc: '/ofux-tool/',                        priority: '0.9', changefreq: 'monthly' },
        { loc: '/lighthouse-plus-tool/',             priority: '0.9', changefreq: 'monthly' },
        { loc: '/topical-authority-audit-tool/',     priority: '0.8', changefreq: 'monthly' },
        { loc: '/seo-entity-extractor-tool/',        priority: '0.8', changefreq: 'monthly' },
        { loc: '/seo-ux-tool/',                      priority: '0.9', changefreq: 'monthly' },
        { loc: '/schema-generator/',                 priority: '0.8', changefreq: 'monthly' },
        { loc: '/local-seo-tool/',                   priority: '0.8', changefreq: 'monthly' },
        { loc: '/seo-intent-tool/',                  priority: '0.8', changefreq: 'monthly' },
        { loc: '/product-seo-tool/',                 priority: '0.8', changefreq: 'monthly' },
        { loc: '/aeo-performance-tool/',             priority: '0.8', changefreq: 'monthly' },
        { loc: '/ai-search-optimization-tool/',      priority: '0.8', changefreq: 'monthly' },
        { loc: '/ai-voice-search-tool/',             priority: '0.8', changefreq: 'monthly' },
        { loc: '/ai-audit-tool/',                    priority: '0.8', changefreq: 'monthly' },
        { loc: '/quit-risk-tool/',                   priority: '0.8', changefreq: 'monthly' },
        { loc: '/keyword-research-tool/',            priority: '0.8', changefreq: 'monthly' },
        { loc: '/keyword-tool/',                     priority: '0.8', changefreq: 'monthly' },
        { loc: '/keyword-vs-tool/',                  priority: '0.8', changefreq: 'monthly' },

        // ── Integrations ──
        { loc: '/integrations/',                     priority: '0.6', changefreq: 'monthly' },
        { loc: '/integrations/developer/api/',       priority: '0.6', changefreq: 'monthly' },
        { loc: '/integrations/developer-tools/',     priority: '0.5', changefreq: 'monthly' },
        { loc: '/integrations/browser-extensions/',  priority: '0.5', changefreq: 'monthly' },
        { loc: '/integrations/plugins/',             priority: '0.5', changefreq: 'monthly' },

        // ── Help guides (blog posts) ──
        { loc: '/blog/posts/social-help-guide/',                     priority: '0.8', changefreq: 'monthly' },
        { loc: '/blog/posts/nusa-tool-help-guide/',                  priority: '0.8', changefreq: 'monthly' },
        { loc: '/blog/posts/lighthouse-plus-help-guide/',            priority: '0.7', changefreq: 'monthly' },
        { loc: '/blog/posts/aeo-performance-help-guide/',            priority: '0.7', changefreq: 'monthly' },
        { loc: '/blog/posts/pro-dashboard-ofux-ask-ai-help-guide/',  priority: '0.7', changefreq: 'monthly' },
        { loc: '/blog/posts/ofux-dashboard-announcement/',           priority: '0.6', changefreq: 'monthly' },
        { loc: '/blog/posts/ubi-is-coming/',                         priority: '0.5', changefreq: 'monthly' },
        { loc: '/blog/posts/roach-startup-help-guide/',              priority: '0.5', changefreq: 'monthly' },
        { loc: '/blog/posts/topical-authority-help-guide/',          priority: '0.7', changefreq: 'monthly' },
        { loc: '/blog/posts/semantic-entity-help-guide/',            priority: '0.7', changefreq: 'monthly' },
        { loc: '/blog/posts/ai-voice-search-help-guide/',            priority: '0.7', changefreq: 'monthly' },
        { loc: '/blog/posts/schema-markup-help-guide/',              priority: '0.7', changefreq: 'monthly' },
        { loc: '/blog/posts/state-of-seo-geo-2026/',                 priority: '0.7', changefreq: 'monthly' },
        { loc: '/blog/posts/seo-ux-audit-help-guide/',               priority: '0.7', changefreq: 'monthly' },
        { loc: '/blog/posts/local-seo-help-guide/',                  priority: '0.7', changefreq: 'monthly' },
        { loc: '/blog/posts/seo-intent-help-guide/',                 priority: '0.7', changefreq: 'monthly' },
        { loc: '/blog/posts/product-seo-help-guide/',                priority: '0.7', changefreq: 'monthly' },
        { loc: '/blog/posts/user-experience-help-guide/',            priority: '0.7', changefreq: 'monthly' },
        { loc: '/blog/posts/seo-keyword-help-guide/',                priority: '0.7', changefreq: 'monthly' },
        { loc: '/blog/posts/seo-keyword-competition-help-guide/',    priority: '0.7', changefreq: 'monthly' },
        { loc: '/blog/posts/ai-search-optimization-help-guide/',     priority: '0.7', changefreq: 'monthly' },
        { loc: '/blog/posts/ai-content-detection-guide/',            priority: '0.7', changefreq: 'monthly' },
        { loc: '/blog/posts/developing-traffic-torch-tools/',        priority: '0.6', changefreq: 'monthly' },
        { loc: '/blog/posts/traffic-torch-seo-ux-analysis-tool-build/', priority: '0.6', changefreq: 'monthly' },
      ],
    });
  }

  return null;
}

// ============================================================
// Network routes
// ============================================================
async function handleNetworkRoutes(request, env, url) {
  const user = await getUserFromToken(request, env);

  if (url.pathname === '/api/network/add' && request.method === 'POST') {
    if (!user) return feedJson({ error: 'Unauthorized' }, 401);
    let body; try { body = await request.json(); } catch { return feedJson({ error: 'Invalid JSON' }, 400); }
    const targetId = parseInt(body.user_id, 10);
    if (!targetId || targetId === user.id) return feedJson({ error: 'Invalid target' }, 400);
    const target = await env.MY_BINDING.prepare('SELECT id, allow_adds, profile_public FROM users WHERE id = ?').bind(targetId).first();
    if (!target || !target.profile_public) return feedJson({ error: 'User not available' }, 404);
    if (target.allow_adds === 0) return feedJson({ error: 'This user is not accepting network adds' }, 403);
    const blocked = await env.MY_BINDING.prepare('SELECT 1 FROM blocks WHERE (user_id = ? AND blocked_user_id = ?) OR (user_id = ? AND blocked_user_id = ?)')
      .bind(user.id, targetId, targetId, user.id).first();
    if (blocked) return feedJson({ error: 'Unavailable' }, 403);
    await env.MY_BINDING.prepare('INSERT OR IGNORE INTO network (user_id, network_user_id, created_at) VALUES (?, ?, ?)')
      .bind(user.id, targetId, Date.now()).run();

    const me = await env.MY_BINDING.prepare('SELECT name, username FROM users WHERE id = ?').bind(user.id).first();
    const actorName = me?.name || me?.username || 'Someone';
    await createNotification(env, {
      userId: targetId,
      type: 'network',
      actorId: user.id,
      subjectType: 'user',
      subjectId: user.id,
      message: `${actorName} added you to their network`,
      link: `/torcher/${me?.username || ''}/`
    });

    const targetUser = await env.MY_BINDING.prepare('SELECT name, username FROM users WHERE id = ?').bind(targetId).first();
    await logActivity(env, user.id, 'network', {
      targetId,
      targetLabel: targetUser?.name || targetUser?.username || 'someone',
      link: `/torcher/${targetUser?.username || ''}/`
    });

    return feedJson({ success: true });
  }

  if (url.pathname === '/api/network/remove' && request.method === 'POST') {
    if (!user) return feedJson({ error: 'Unauthorized' }, 401);
    let body; try { body = await request.json(); } catch { return feedJson({ error: 'Invalid JSON' }, 400); }
    const targetId = parseInt(body.user_id, 10);
    if (!targetId) return feedJson({ error: 'Invalid target' }, 400);
    await env.MY_BINDING.prepare('DELETE FROM network WHERE user_id = ? AND network_user_id = ?').bind(user.id, targetId).run();
    return feedJson({ success: true });
  }

  if (url.pathname === '/api/network/list' && request.method === 'GET') {
    if (!user) return feedJson({ error: 'Unauthorized' }, 401);
    const rows = await env.MY_BINDING.prepare(
      `SELECT u.id, u.username, u.name AS display_name, u.avatar_preset, u.avatar_r2_key, u.avatar_updated_at, u.role, u.verified_at, n.created_at,
              COALESCE((SELECT SUM(up.points) FROM user_points up WHERE up.user_id = u.id), 0) AS total_points
         FROM network n JOIN users u ON u.id = n.network_user_id
        WHERE n.user_id = ? ORDER BY n.created_at DESC`
    ).bind(user.id).all();
    return feedJson({ network: withAvatars(rows.results) });
  }

  if (url.pathname === '/api/network/invite' && request.method === 'POST') {
    if (!user) return feedJson({ error: 'Unauthorized' }, 401);
    let body; try { body = await request.json(); } catch { return feedJson({ error: 'Invalid JSON' }, 400); }
    const email = String(body.email || '').trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return feedJson({ error: 'Invalid email' }, 400);

    const today = new Date().toISOString().split('T')[0];
    const countRow = await env.MY_BINDING.prepare(
      `SELECT COUNT(*) AS c FROM usage_logs WHERE user_id = ? AND tool_name = 'invite' AND tool_run_date = ?`
    ).bind(user.id, today).first();
    if ((countRow?.c || 0) >= 10) return feedJson({ error: 'Daily invite limit reached (10)' }, 429);

    const inviterName = user.name || user.username || 'A Traffic Torch user';
    const inviterUsername = user.username || '';
    const profileUrl = inviterUsername ? `https://traffictorch.net/torcher/${inviterUsername}/` : 'https://traffictorch.net';
    const signupUrl = 'https://traffictorch.net/login/?tab=register';

    try {
      const resendRes = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${env.RESEND_API_KEY}`
        },
        body: JSON.stringify({
          from: 'Traffic Torch <support@traffictorch.net>',
          to: email,
          subject: `${inviterName} invited you to Traffic Torch`,
          html: `
            <div style="font-family:system-ui,-apple-system,sans-serif;max-width:520px;margin:0 auto;padding:2rem 1.5rem;color:#111;">
              <h2 style="font-size:1.4rem;margin:0 0 0.75rem;">You're invited to Traffic Torch</h2>
              <p style="margin:0 0 1rem;color:#4b5563;line-height:1.55;">
                <strong>${inviterName}</strong> thinks you'd like Traffic Torch — free SEO, UX and AEO audit tools.
              </p>
              <p style="text-align:center;margin:1.5rem 0;">
                <a href="${signupUrl}" style="display:inline-block;padding:0.85rem 2rem;background:linear-gradient(135deg,#f97316,#ec4899);color:#fff;font-weight:700;border-radius:0.6rem;text-decoration:none;">
                  Create your free account →
                </a>
              </p>
              <p style="color:#6b7280;font-size:0.85rem;margin:1.5rem 0 0;">
                See ${inviterName}'s profile: <a href="${profileUrl}" style="color:#ea580c;">${profileUrl}</a>
              </p>
              <p style="color:#9ca3af;font-size:0.8rem;margin:1rem 0 0;border-top:1px solid #e5e7eb;padding-top:1rem;">
                You received this because someone entered your email on Traffic Torch. If this wasn't expected, you can safely ignore this message.
              </p>
            </div>
          `
        })
      });

      if (!resendRes.ok) {
        const errText = await resendRes.text();
        console.error('Resend invite error:', errText);
        return feedJson({ error: 'Failed to send invite' }, 500);
      }
    } catch (err) {
      console.error('Invite send error:', err.message);
      return feedJson({ error: 'Failed to send invite' }, 500);
    }

    await env.MY_BINDING.prepare(
      `INSERT INTO usage_logs (user_id, tool_run_date, run_count, tool_name, identifier) VALUES (?, ?, ?, 'invite', ?)`
    ).bind(user.id, today, 1, String(user.id)).run().catch(() => {});

    return feedJson({ success: true, message: 'Invite sent' });
  }

  // GET /api/users/search?q=...&limit=20
  if (url.pathname === '/api/users/search' && request.method === 'GET') {
    const q = (url.searchParams.get('q') || '').trim().toLowerCase();
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '20', 10) || 20, 50);
    if (q.length < 2) return feedJson({ users: [] });

    const like = '%' + q.replace(/[%_]/g, '') + '%';
    const rows = await env.MY_BINDING.prepare(
      `SELECT id, username, name AS display_name, avatar_preset, avatar_r2_key, avatar_updated_at, role,
              COALESCE((SELECT SUM(up.points) FROM user_points up WHERE up.user_id = users.id), 0) AS total_points
         FROM users
        WHERE profile_public = 1
          AND username IS NOT NULL
          AND (LOWER(username) LIKE ? OR LOWER(name) LIKE ?)
        ORDER BY username ASC
        LIMIT ?`
    ).bind(like, like, limit).all();

    const list = withAvatars(rows.results);

    if (user && list.length) {
      const ids = list.map(u => u.id);
      const net = await env.MY_BINDING.prepare(
        `SELECT network_user_id FROM network WHERE user_id = ? AND network_user_id IN (${ids.map(() => '?').join(',')})`
      ).bind(user.id, ...ids).all();
      const inNet = new Set((net.results || []).map(r => r.network_user_id));
      list.forEach(u => { u.in_network = inNet.has(u.id); });
    }

    return feedJson({ users: list });
  }

  return null;
}

// ---------- Push fan-out ----------
async function firePush(env, { userId, type, title, body, url, tag, data }) {
  if (!env.PUSH_SECRET) return;
  try {
    await fetch('https://traffictorch.net/push-api/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${env.PUSH_SECRET}`,
      },
      body: JSON.stringify({ user_id: userId, type, title, body, url, tag, data }),
    });
  } catch (err) {
    console.error('firePush error:', err.message);
  }
}

// ============================================================
// Notification helper
// ============================================================
async function createNotification(env, { userId, type, actorId, subjectType, subjectId, message, link }) {
  try {
    const col = type === 'comment' ? 'notify_comments'
              : type === 'network' ? 'notify_network'
              : type === 'leaderboard' ? 'notify_leaderboard'
              : type === 'message' ? 'notify_messages'
              : type === 'endorse' ? 'notify_leaderboard'
              : null;
    if (col) {
      const u = await env.MY_BINDING.prepare(`SELECT ${col} AS pref FROM users WHERE id = ?`).bind(userId).first();
      if (u && u.pref === 0) return;
    }
    if (actorId && actorId === userId) return;

    await env.MY_BINDING.prepare(
      `INSERT INTO notifications (user_id, type, actor_id, subject_type, subject_id, message, link, is_read, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?)`
    ).bind(userId, type, actorId || null, subjectType || null, subjectId || null, message, link || null, Date.now()).run();

        // Fan out to Web Push (fire-and-forget; honours notify_* prefs on the push worker too)
    const pushType = type === 'comment' ? 'comment'
                   : type === 'network' ? 'network'
                   : type === 'leaderboard' ? 'leaderboard'
                   : type === 'endorse' ? 'leaderboard'
                   : 'message';
    await firePush(env, {
      userId,
      type: pushType,
      title: pushType === 'comment' ? 'New comment on your torch'
           : pushType === 'network' ? 'New network connection'
           : pushType === 'leaderboard' ? 'Leaderboard update'
           : 'Traffic Torch',
      body: message,
      url: link || '/dashboard/#profile',
      tag: pushType + '-' + (subjectId || userId),
    }); 
    
    const count = await env.MY_BINDING.prepare('SELECT COUNT(*) AS c FROM notifications WHERE user_id = ?').bind(userId).first();
    if ((count?.c || 0) > 24) {
      await env.MY_BINDING.prepare(
        `DELETE FROM notifications WHERE id IN (
           SELECT id FROM notifications WHERE user_id = ? ORDER BY created_at ASC LIMIT ?
         )`
      ).bind(userId, (count.c - 24)).run();
    }
  } catch (e) {
    console.error('createNotification error:', e.message);
  }
}

// ============================================================
// Feature B — Discover: GET /api/users/discover
// ============================================================
async function handleDiscoverRoutes(request, env, url) {
  if (url.pathname !== '/api/users/discover' || request.method !== 'GET') return null;

  const user = await getUserFromToken(request, env);
  if (!user) return feedJson({ error: 'Unauthorized' }, 401);

  const seedMode = (url.searchParams.get('seed') || 'today').toLowerCase();
  const limit    = Math.min(Math.max(parseInt(url.searchParams.get('limit')  || '24', 10) || 24, 1), 48);
  const offset   = Math.max(parseInt(url.searchParams.get('offset') || '0', 10) || 0, 0);

  const seed        = _discoverSeed(user.id, seedMode === 'fresh');
  const activeSince = Date.now() - 30 * 86400 * 1000;
  const viewerId    = user.id;

  const sql = `
    WITH exclude_ids AS (
      SELECT ? AS id
      UNION SELECT network_user_id FROM network WHERE user_id = ?
      UNION SELECT user_id         FROM network WHERE network_user_id = ?
      UNION SELECT blocked_user_id FROM blocks  WHERE user_id = ?
      UNION SELECT user_id         FROM blocks  WHERE blocked_user_id = ?
    ),
    candidates AS (
      SELECT
        u.id,
        u.username,
        COALESCE(u.name, u.username)       AS display_name,
        COALESCE(u.avatar_preset, 'owner') AS avatar_preset,
        u.avatar_r2_key AS avatar_r2_key,
        u.avatar_updated_at AS avatar_updated_at,
        COALESCE(u.role, 'owner')          AS role,
        COALESCE((SELECT SUM(points) FROM user_points WHERE user_id = u.id), 0) AS total_points,
        COALESCE((SELECT COUNT(*) FROM posts WHERE user_id = u.id AND status = 'published'), 0) AS torch_count,
        (SELECT MAX(created_at) FROM posts WHERE user_id = u.id AND status = 'published') AS last_post_at
      FROM users u
      WHERE u.profile_public = 1
        AND u.username IS NOT NULL
        AND u.id NOT IN (SELECT id FROM exclude_ids)
    )
    SELECT * FROM candidates
    ORDER BY
      CASE WHEN last_post_at > ? THEN 0 ELSE 1 END,
      ((id * 2654435761 + ?) % 2147483647),
      id
    LIMIT ? OFFSET ?
  `;

  const rows = await env.MY_BINDING.prepare(sql).bind(
    viewerId, viewerId, viewerId, viewerId, viewerId,
    activeSince,
    seed,
    limit + 1,
    offset
  ).all();

  const results = rows.results || [];
  const hasMore = results.length > limit;
  if (hasMore) results.pop();

  return feedJson({
    users: results,
    seed: seedMode,
    limit,
    offset,
    has_more: hasMore
  });
}

// ============================================================
// Feature C — Activity endpoints
// ============================================================
async function handleActivityRoutes(request, env, url) {
  if (request.method !== 'GET') return null;
  const path = url.pathname;
  const isMe      = path === '/api/activity/me';
  const isNetwork = path === '/api/activity/network';
  const isUser    = path.startsWith('/api/activity/user/');
  if (!isMe && !isNetwork && !isUser) return null;

  const user = await getUserFromToken(request, env);
  if (!user && !isUser) return feedJson({ error: 'Unauthorized' }, 401);

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
       if (target.id !== (user?.id || 0) && target.activity_public === 0) {
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
           COALESCE(u.avatar_preset, 'owner') AS avatar_preset,
           u.avatar_r2_key AS avatar_r2_key,
           u.avatar_updated_at AS avatar_updated_at,
           tp.page_title         AS target_title,
           tp.score              AS target_score,
           tp.domain_mode        AS target_domain_mode,
           tp.domain_label       AS target_domain_label,
           tp.user_id            AS target_user_id,
           tu.username           AS target_author_username,
           COALESCE(tu.name, tu.username) AS target_author_name
      FROM user_activity a
      JOIN users u ON u.id = a.user_id
      LEFT JOIN posts tp ON tp.id = a.target_id AND a.event_type IN ('torch', 'comment')
      LEFT JOIN users tu ON tu.id = tp.user_id
     WHERE ${where}
     ORDER BY a.created_at DESC
     LIMIT ?
  `;
  args.push(limit + 1);

  const rows = await env.MY_BINDING.prepare(sql).bind(...args).all();
  const items = withAvatars(rows.results);
  let nextCursor = null;
  if (items.length > limit) { items.pop(); nextCursor = items[items.length - 1].created_at; }

  const viewerId = user?.id || 0;
  items.forEach(item => {
    item.is_your_target = !!(viewerId && item.target_user_id === viewerId && item.user_id !== viewerId);
  });

  return new Response(JSON.stringify({ items, cursor: nextCursor, has_more: !!nextCursor, scope }), {
    status: 200,
    headers: { 'Content-Type': 'application/json', ...FEED_CORS, 'Cache-Control': 'public, max-age=60' }
  });
}

// ============================================================
// Feed + comments + notifications + points routes
// ===========================================================
async function handleFeedRoutes(request, env, url) {
  const user = await getUserFromToken(request, env);

  // GET /api/feed
  if (url.pathname === '/api/feed' && request.method === 'GET') {
    const category = url.searchParams.get('category');
    const cursor = parseInt(url.searchParams.get('cursor') || '0', 10) || 0;
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '20', 10) || 20, 30);
    const toolFilter = url.searchParams.get('tool');
    const postTypeFilter = url.searchParams.get('post_type');

    const args = [];
    let where = "p.status = 'published'";
    if (CATEGORIES.includes(category)) { where += ' AND p.category = ?'; args.push(category); }
    if (toolFilter) { where += ' AND p.tool = ?'; args.push(toolFilter); }
    if (postTypeFilter && ['audit','discussion','workflow'].includes(postTypeFilter)) { where += ' AND p.post_type = ?'; args.push(postTypeFilter); }
    if (cursor) { where += ' AND p.created_at < ?'; args.push(cursor); }

    if (user) {
      const blocks = await env.MY_BINDING.prepare('SELECT blocked_user_id FROM blocks WHERE user_id = ?').bind(user.id).all();
      const blockedIds = (blocks.results || []).map(r => r.blocked_user_id);
      if (blockedIds.length) {
        where += ` AND p.user_id NOT IN (${blockedIds.map(() => '?').join(',')})`;
        args.push(...blockedIds);
      }
    }

    const sql = `
            SELECT p.id, p.user_id, p.category, p.post_type, p.title, p.body_md, p.note, p.tool, p.url, p.page_title, p.score, p.images, p.workflow_meta,
             p.domain_mode, p.domain_label, p.module_scores, p.created_at,
             u.username, u.name AS display_name, u.avatar_preset, u.avatar_r2_key, u.avatar_updated_at, u.role, u.verified_at,
             COALESCE((SELECT SUM(up.points) FROM user_points up WHERE up.user_id = p.user_id), 0) AS total_points,
             (SELECT COUNT(*) FROM comments c WHERE c.post_id = p.id AND c.status = 'published') AS comment_count
        FROM posts p
        JOIN users u ON u.id = p.user_id
       WHERE ${where}
       ORDER BY p.created_at DESC
       LIMIT ?`;
    args.push(limit + 1);

    const rows = await env.MY_BINDING.prepare(sql).bind(...args).all();
    const results = withAvatars(rows.results);
    let nextCursor = null;
    if (results.length > limit) { results.pop(); nextCursor = results[results.length - 1].created_at; }

    if (user && results.length) {
      const ids = [...new Set(results.map(r => r.user_id))];
      const net = await env.MY_BINDING.prepare(
        `SELECT network_user_id FROM network WHERE user_id = ? AND network_user_id IN (${ids.map(() => '?').join(',')})`
      ).bind(user.id, ...ids).all();
      const inNet = new Set((net.results || []).map(r => r.network_user_id));
      results.forEach(r => { r.in_network = inNet.has(r.user_id); });
      // Phase D: endorse counts per post
      const postIds = results.map(r => r.id);
      const ph = postIds.map(() => '?').join(',');
      const endorseRows = await env.MY_BINDING.prepare(
        `SELECT torch_id, COUNT(*) AS c FROM torch_endorsements WHERE torch_id IN (${ph}) GROUP BY torch_id`
      ).bind(...postIds).all();
      const endorseMap = {};
      (endorseRows.results || []).forEach(r => { endorseMap[r.torch_id] = r.c; });
      const viewerRows = await env.MY_BINDING.prepare(
        `SELECT torch_id FROM torch_endorsements WHERE endorser_id = ? AND torch_id IN (${ph})`
      ).bind(user.id, ...postIds).all();
      const viewerSet = new Set((viewerRows.results || []).map(r => r.torch_id));
      results.forEach(r => {
        r.endorse_count = endorseMap[r.id] || 0;
        r.viewer_endorsed = viewerSet.has(r.id);
      });
    } else {
      results.forEach(r => { r.endorse_count = 0; r.viewer_endorsed = false; });
    }

    let slots = { used: 0, max: 5 };
    if (user) {
      const tier = (user.tier || 'free').toLowerCase();
      const max = SLOT_MAP[tier] || 5;
      const used = await env.MY_BINDING.prepare('SELECT COUNT(*) AS c FROM posts WHERE user_id = ?').bind(user.id).first();
      slots = { used: used?.c || 0, max };
    }

    return feedJson({ posts: results, cursor: nextCursor, slots });
  }

  // POST /api/posts
  if (url.pathname === '/api/posts' && request.method === 'POST') {
    if (!user) return feedJson({ error: 'Unauthorized' }, 401);
    let body; try { body = await request.json(); } catch { return feedJson({ error: 'Invalid JSON' }, 400); }
    const category = CATEGORIES.includes(body.category) ? body.category : 'casual';
    const postType = ['audit','discussion','workflow'].includes(body.post_type) ? body.post_type : 'audit';
    const note = String(body.note || '').slice(0, 6000);
    const bodyMd = body.body_md ? String(body.body_md).slice(0, 6000) : null;
    const title = body.title ? String(body.title).slice(0, 120) : null;
    const tool = String(body.tool || '').slice(0, 60);
    const urlVal = String(body.url || '').slice(0, 500);
    const pageTitle = postType === 'discussion' ? (title || '') : String(body.page_title || '').slice(0, 200);
    const score = postType === 'discussion' ? 0 : Math.max(0, Math.min(100, parseInt(body.score, 10) || 0));

    if (postType === 'discussion' && !bodyMd && !note) return feedJson({ error: 'Discussion body required' }, 400);
    const domainMode = ['domain', 'hidden', 'full'].includes(body.domain_mode) ? body.domain_mode : 'domain';
    const domainLabel = body.domain_label ? String(body.domain_label).slice(0, 60) : null;
    const moduleScores = body.module_scores ? JSON.stringify(body.module_scores).slice(0, 3000) : null;

    const tier = (user.tier || 'free').toLowerCase();
    const max = SLOT_MAP[tier] || 5;
    const count = await env.MY_BINDING.prepare('SELECT COUNT(*) AS c FROM posts WHERE user_id = ?').bind(user.id).first();
    if ((count?.c || 0) >= max) {
      const oldest = await env.MY_BINDING.prepare('SELECT id FROM posts WHERE user_id = ? ORDER BY created_at ASC LIMIT 1').bind(user.id).first();
      if (oldest) await env.MY_BINDING.prepare('DELETE FROM posts WHERE id = ?').bind(oldest.id).run();
    }

    const now = Date.now();
    const workflowMeta = body.workflow_meta && typeof body.workflow_meta === 'object' ? JSON.stringify(body.workflow_meta).slice(0, 8000) : null;
    const imagesJson = Array.isArray(body.images) && body.images.length ? JSON.stringify(body.images.slice(0, 5)) : null;
    const ins = await env.MY_BINDING.prepare(
      `INSERT INTO posts (user_id, category, post_type, title, body_md, note, tool, url, page_title, score, domain_mode, domain_label, module_scores, images, workflow_meta, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'published', ?)`
    ).bind(user.id, category, postType, title, bodyMd, note, tool, urlVal, pageTitle, score, domainMode, domainLabel, moduleScores, imagesJson, workflowMeta, now).run();

    const postId = ins.meta?.last_row_id || null;
    await awardPoints(env, { userId: user.id, type: 'post', points: POINTS_POST, referenceId: postId });
    await logActivity(env, user.id, 'torch', {
      category, tool,
      targetId: postId,
      targetLabel: pageTitle || tool,
      link: `/torch/${postId}/`
    });
    const total = await getUserTotalPoints(env, user.id);

    if (postId) {
      await purgeRenderWorker(env, [
        `/torch/${postId}/`,
        `/og/torch/${postId}.png`,
        `/torcher/${user.username}/`,
        `/torcher/${user.username}/feed.xml`,
        '/community/',
        '/torches/feed.xml',
        '/sitemap-torches.xml',
        '/sitemap-profiles.xml',
      ]);
    }

    return feedJson({ success: true, post_id: postId, total_points: total });
  }

  // PATCH /api/posts/:id
  if (url.pathname.match(/^\/api\/posts\/\d+$/) && request.method === 'PATCH') {
    if (!user) return feedJson({ error: 'Unauthorized' }, 401);
    const id = parseInt(url.pathname.split('/').pop(), 10);
    const post = await env.MY_BINDING.prepare('SELECT user_id FROM posts WHERE id = ?').bind(id).first();
    if (!post || post.user_id !== user.id) return feedJson({ error: 'Not found' }, 404);
    let body; try { body = await request.json(); } catch { return feedJson({ error: 'Invalid JSON' }, 400); }
    const fields = []; const params = [];
    if (typeof body.note === 'string') { fields.push('note = ?'); params.push(body.note.slice(0, 6000)); }
    if (typeof body.body_md === 'string') { fields.push('body_md = ?'); params.push(body.body_md.slice(0, 6000)); }
    if (body.workflow_meta && typeof body.workflow_meta === 'object') { fields.push('workflow_meta = ?'); params.push(JSON.stringify(body.workflow_meta).slice(0, 8000)); }
    if (typeof body.title === 'string') { fields.push('title = ?'); params.push(body.title.slice(0, 120)); }
    if (typeof body.page_title === 'string') { fields.push('page_title = ?'); params.push(body.page_title.slice(0, 200)); }
    if (CATEGORIES.includes(body.category)) { fields.push('category = ?'); params.push(body.category); }
    if (typeof body.domain_mode === 'string' && ['domain','hidden','full'].includes(body.domain_mode)) {
      fields.push('domain_mode = ?'); params.push(body.domain_mode);
    }
    if (typeof body.domain_label === 'string') { fields.push('domain_label = ?'); params.push(body.domain_label.slice(0, 60)); }
    if (!fields.length) return feedJson({ error: 'Nothing to update' }, 400);
    params.push(id);
    await env.MY_BINDING.prepare(`UPDATE posts SET ${fields.join(', ')} WHERE id = ?`).bind(...params).run();

    const owner = await env.MY_BINDING.prepare('SELECT username FROM users WHERE id = ?').bind(user.id).first();
    await purgeRenderWorker(env, [
      `/torch/${id}/`,
      `/og/torch/${id}.png`,
      `/torcher/${owner?.username || user.username}/`,
      '/community/',
      '/torches/feed.xml',
    ]);

    return feedJson({ success: true });
  }

  // DELETE /api/posts/:id
  if (url.pathname.match(/^\/api\/posts\/\d+$/) && request.method === 'DELETE') {
    if (!user) return feedJson({ error: 'Unauthorized' }, 401);
    const id = parseInt(url.pathname.split('/').pop(), 10);
    const post = await env.MY_BINDING.prepare('SELECT user_id FROM posts WHERE id = ?').bind(id).first();
    if (!post || post.user_id !== user.id) return feedJson({ error: 'Not found' }, 404);
    await env.MY_BINDING.prepare("UPDATE posts SET status = 'removed' WHERE id = ?").bind(id).run();

    await purgeRenderWorker(env, [
      `/torch/${id}/`,
      `/og/torch/${id}.png`,
      `/torcher/${user.username}/`,
      '/community/',
      '/torches/feed.xml',
      '/sitemap-torches.xml',
    ]);

    return feedJson({ success: true });
  }

  // GET /api/posts/:id/comments  (paginated, default 30/page)
  if (url.pathname.match(/^\/api\/posts\/\d+\/comments$/) && request.method === 'GET') {
    const id = parseInt(url.pathname.split('/')[3], 10);
    const qs = new URL(request.url).searchParams;
    const offset = Math.max(0, parseInt(qs.get('offset') || '0', 10) || 0);
    const limit = Math.min(100, Math.max(1, parseInt(qs.get('limit') || '30', 10) || 30));
    const rows = await env.MY_BINDING.prepare(
      `SELECT c.id, c.post_id, c.user_id, c.body, c.images, c.created_at,
              u.username, u.name AS display_name, u.avatar_preset, u.avatar_r2_key, u.avatar_updated_at,
              COALESCE((SELECT SUM(up.points) FROM user_points up WHERE up.user_id = c.user_id), 0) AS total_points
         FROM comments c JOIN users u ON u.id = c.user_id
        WHERE c.post_id = ? AND c.status = 'published'
        ORDER BY c.created_at ASC LIMIT ? OFFSET ?`
    ).bind(id, limit, offset).all();
    const totalRow = await env.MY_BINDING.prepare(
      "SELECT COUNT(*) AS c FROM comments WHERE post_id = ? AND status = 'published'"
    ).bind(id).first();
    const total = totalRow?.c || 0;
    return feedJson({
      comments: withAvatars(rows.results),
      total, offset, limit,
      has_more: offset + rows.results.length < total
    });
  }
  // POST /api/posts/:id/comments
  if (url.pathname.match(/^\/api\/posts\/\d+\/comments$/) && request.method === 'POST') {
    if (!user) return feedJson({ error: 'Unauthorized' }, 401);
    const id = parseInt(url.pathname.split('/')[3], 10);
    let body; try { body = await request.json(); } catch { return feedJson({ error: 'Invalid JSON' }, 400); }
    const text = String(body.body || '').trim();
    if (!text || text.length > 6000) return feedJson({ error: 'Comment must be 1–6000 chars' }, 400);
    if ((text.match(/https?:\/\//gi) || []).length > 10) return feedJson({ error: 'Max 10 links per comment' }, 400);
    const post = await env.MY_BINDING.prepare("SELECT id FROM posts WHERE id = ? AND status = 'published'").bind(id).first();
    if (!post) return feedJson({ error: 'Post not found' }, 404);
    const now = Date.now();
    const commentImages = Array.isArray(body.images) && body.images.length ? JSON.stringify(body.images.slice(0, 3)) : null;
    const ins = await env.MY_BINDING.prepare(
      'INSERT INTO comments (post_id, user_id, body, images, status, created_at) VALUES (?, ?, ?, ?, ?, ?)'
    ).bind(id, user.id, text, commentImages, 'published', now).run();

    await awardPoints(env, { userId: user.id, type: 'comment', points: POINTS_COMMENT, referenceId: ins.meta?.last_row_id || null });
    await logActivity(env, user.id, 'comment', {
      targetId: id,
      targetLabel: text.slice(0, 60),
      link: `/torch/${id}/`
    });
    const total = await getUserTotalPoints(env, user.id);

    const postOwner = await env.MY_BINDING.prepare('SELECT user_id, page_title FROM posts WHERE id = ?').bind(id).first();
    if (postOwner && postOwner.user_id !== user.id) {
      const actorName = user.name || user.username || 'Someone';
      await createNotification(env, {
        userId: postOwner.user_id,
        type: 'comment',
        actorId: user.id,
        subjectType: 'post',
        subjectId: id,
        message: `${actorName} commented on your post: "${text.slice(0, 80)}${text.length > 80 ? '…' : ''}"`,
          link: `/torch/${id}/`
      });
    }

    const comment = {
      id: ins.meta?.last_row_id, post_id: id, user_id: user.id, body: text, created_at: now,
      username: user.username, display_name: user.name || user.username, avatar_preset: user.avatar_preset || 'owner',
      total_points: total
    };
    return feedJson({ success: true, comment, total_points: total });
  }

  // PATCH /api/comments/:id
  if (url.pathname.match(/^\/api\/comments\/\d+$/) && request.method === 'PATCH') {
    if (!user) return feedJson({ error: 'Unauthorized' }, 401);
    const id = parseInt(url.pathname.split('/').pop(), 10);
    const c = await env.MY_BINDING.prepare('SELECT user_id FROM comments WHERE id = ?').bind(id).first();
    if (!c || c.user_id !== user.id) return feedJson({ error: 'Not found' }, 404);
    let body; try { body = await request.json(); } catch { return feedJson({ error: 'Invalid JSON' }, 400); }
    const text = String(body.body || '').trim();
    if (!text || text.length > 6000) return feedJson({ error: 'Comment must be 1–6000 chars' }, 400);
    if ((text.match(/https?:\/\//gi) || []).length > 10) return feedJson({ error: 'Max 10 links per comment' }, 400);
    await env.MY_BINDING.prepare('UPDATE comments SET body = ? WHERE id = ?').bind(text, id).run();
    return feedJson({ success: true });
  }

  // DELETE /api/comments/:id
  if (url.pathname.match(/^\/api\/comments\/\d+$/) && request.method === 'DELETE') {
    if (!user) return feedJson({ error: 'Unauthorized' }, 401);
    const id = parseInt(url.pathname.split('/').pop(), 10);
    const c = await env.MY_BINDING.prepare('SELECT user_id FROM comments WHERE id = ?').bind(id).first();
    if (!c || c.user_id !== user.id) return feedJson({ error: 'Not found' }, 404);
    await env.MY_BINDING.prepare("UPDATE comments SET status = 'removed' WHERE id = ?").bind(id).run();
    return feedJson({ success: true });
  }

  // POST /api/posts/:id/endorse
  if (url.pathname.match(/^\/api\/posts\/\d+\/endorse$/) && request.method === 'POST') {
    if (!user) return feedJson({ error: 'Unauthorized' }, 401);
    const postId = parseInt(url.pathname.split('/')[3], 10);
    const post = await env.MY_BINDING.prepare(
      "SELECT id, user_id, score, page_title, tool, category FROM posts WHERE id = ? AND status = 'published'"
    ).bind(postId).first();
    if (!post) return feedJson({ error: 'Torch not found' }, 404);
    if ((post.score || 0) < 80) return feedJson({ error: 'Only torches scoring 80+ can be endorsed' }, 400);
    if (post.user_id === user.id) return feedJson({ error: 'You cannot endorse your own torch' }, 400);

    const accountRow = await env.MY_BINDING.prepare('SELECT created_at FROM users WHERE id = ?').bind(user.id).first();
    const ageMs = Date.now() - new Date((accountRow && accountRow.created_at) || Date.now()).getTime();
    if (ageMs < 24 * 3600 * 1000) return feedJson({ error: 'Your account must be 24 hours old to endorse' }, 403);

    const existing = await env.MY_BINDING.prepare(
      'SELECT id FROM torch_endorsements WHERE torch_id = ? AND endorser_id = ?'
    ).bind(postId, user.id).first();
    if (existing) return feedJson({ error: 'You already endorsed this torch' }, 409);

    const since = Date.now() - 24 * 3600 * 1000;
    const recent = await env.MY_BINDING.prepare(
      'SELECT id FROM torch_endorsements WHERE endorser_id = ? AND created_at > ? LIMIT 1'
    ).bind(user.id, since).first();
    if (recent) return feedJson({ error: 'You can only endorse one torch per day' }, 429);

    const now = Date.now();
    await env.MY_BINDING.prepare(
      'INSERT INTO torch_endorsements (torch_id, endorser_id, author_id, created_at) VALUES (?, ?, ?, ?)'
    ).bind(postId, user.id, post.user_id, now).run();

    await awardPoints(env, { userId: post.user_id, type: 'endorse', points: 36, referenceId: postId });

    await logActivity(env, user.id, 'endorse', {
      category: post.category,
      tool: post.tool,
      targetId: postId,
      targetLabel: post.page_title || post.tool || ('Torch #' + postId),
      link: '/torch/' + postId + '/'
    });

    const endorserName = user.name || user.username || 'Someone';
    await createNotification(env, {
      userId: post.user_id,
      type: 'endorse',
      actorId: user.id,
      subjectType: 'post',
      subjectId: postId,
      message: endorserName + ' endorsed your torch (+36 points)',
      link: '/torch/' + postId + '/'
    });

    const countRow = await env.MY_BINDING.prepare(
      'SELECT COUNT(*) AS c FROM torch_endorsements WHERE torch_id = ?'
    ).bind(postId).first();
    return feedJson({ success: true, endorse_count: (countRow && countRow.c) || 1 });
  }

  // POST /api/reports
  if (url.pathname === '/api/reports' && request.method === 'POST') {
    if (!user) return feedJson({ error: 'Unauthorized' }, 401);
    let body; try { body = await request.json(); } catch { return feedJson({ error: 'Invalid JSON' }, 400); }
    const type = ['post', 'comment', 'user'].includes(body.type) ? body.type : null;
    if (!type) return feedJson({ error: 'Invalid type' }, 400);
    const targetId = parseInt(body.target_id, 10);
    if (!targetId) return feedJson({ error: 'Invalid target' }, 400);
    const reason = String(body.reason || '').slice(0, 400);
    await env.MY_BINDING.prepare(
      'INSERT INTO reports (type, target_id, reporter_id, reason, status, created_at) VALUES (?, ?, ?, ?, ?, ?)'
    ).bind(type, targetId, user.id, reason, 'open', Date.now()).run();
    return feedJson({ success: true });
  }

  // POST /api/blocks
  if (url.pathname === '/api/blocks' && request.method === 'POST') {
    if (!user) return feedJson({ error: 'Unauthorized' }, 401);
    let body; try { body = await request.json(); } catch { return feedJson({ error: 'Invalid JSON' }, 400); }
    const targetId = parseInt(body.user_id, 10);
    if (!targetId || targetId === user.id) return feedJson({ error: 'Invalid target' }, 400);
    await env.MY_BINDING.prepare('INSERT OR IGNORE INTO blocks (user_id, blocked_user_id, created_at) VALUES (?, ?, ?)')
      .bind(user.id, targetId, Date.now()).run();
    return feedJson({ success: true });
  }

  // POST /api/contributions
  if (url.pathname === '/api/contributions' && request.method === 'POST') {
    if (!user) return feedJson({ error: 'Unauthorized' }, 401);
    let body; try { body = await request.json(); } catch { return feedJson({ error: 'Invalid JSON' }, 400); }
    
    const type = ['bug', 'feature', 'feedback', 'docs'].includes(body.type) ? body.type : 'bug';
    // Accept both 'subject' and 'name' for compatibility
    const subject = String(body.subject || body.name || '').slice(0, 160);
    // Accept both 'message' and 'details' for compatibility
    const message = String(body.message || body.details || '').trim().slice(0, 6000); 
    const tool = String(body.tool || '').slice(0, 60);
    const pageUrl = String(body.page_url || '').slice(0, 500);
    
    const senderName = body.name || user.name || user.username || 'Anonymous';
    const senderEmail = body.email || user.email || 'support@traffictorch.net';

    if (message.length < 10) return feedJson({ error: 'Please describe the issue (10+ chars)' }, 400);
    
    const now = Date.now();
    const ins = await env.MY_BINDING.prepare(
      `INSERT INTO contributions (user_id, type, subject, message, tool, page_url, status, points, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 'published', ?, ?)`
    ).bind(user.id, type, subject, message, tool, pageUrl, POINTS_CONTRIBUTION, now).run();

    const contributionId = ins.meta?.last_row_id || null;
    await awardPoints(env, { userId: user.id, type: 'contribution', points: POINTS_CONTRIBUTION, referenceId: contributionId });

    // Send email via Resend
    let emailSuccess = false;
    let emailError = null;
    try {
      const resendRes = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${env.RESEND_API_KEY}`
        },
        body: JSON.stringify({
          from: 'Traffic Torch <support@traffictorch.net>',
          to: 'support@traffictorch.net', 
          reply_to: senderEmail,
          subject: `New Contribution: ${subject || type}`,
          html: `
            <h2>New Contribution Submitted</h2>
            <p><strong>Name:</strong> ${senderName}</p>
            <p><strong>Email:</strong> ${senderEmail}</p>
            <p><strong>Type:</strong> ${type}</p>
            <p><strong>Tool:</strong> ${tool || 'N/A'}</p>
            <p><strong>Page URL:</strong> ${pageUrl || 'N/A'}</p>
            <hr>
            <p><strong>Details:</strong></p>
            <p style="white-space: pre-wrap; font-family: monospace;">${message.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p>
          `
        })
      });

      if (resendRes.ok) {
        emailSuccess = true;
      } else {
        const errText = await resendRes.text();
        emailError = `Resend API error: ${resendRes.status} - ${errText}`;
        console.error(emailError);
      }
    } catch (emailErr) {
      emailError = emailErr.message;
      console.error('Failed to send contribution email:', emailError);
    }

    const total = await getUserTotalPoints(env, user.id);
    const countRow = await env.MY_BINDING.prepare(
      `SELECT COUNT(*) AS c FROM user_points WHERE user_id = ? AND event_type = 'contribution'`
    ).bind(user.id).first();

    // Return email status so the frontend can show an error if it failed
    return feedJson({
      success: true,
      contribution_id: contributionId,
      total_points: total,
      contribution_count: countRow?.c || 0,
      email_sent: emailSuccess,
      email_error: emailError
    });
  }

  // GET /api/contributions/leaderboard
  if (url.pathname === '/api/contributions/leaderboard' && request.method === 'GET') {
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '12', 10) || 12, 30);
    const rows = await env.MY_BINDING.prepare(
      `SELECT u.id, u.username, u.name AS display_name, u.avatar_preset, u.avatar_r2_key, u.avatar_updated_at, u.role, u.verified_at,
              u.bio, u.website_url, u.website_approved, u.job_title, u.company, u.location,
              COALESCE((SELECT SUM(up.points) FROM user_points up WHERE up.user_id = u.id), 0) AS total_points,
              (SELECT COUNT(*) FROM user_points up WHERE up.user_id = u.id AND up.event_type = 'contribution') AS contribution_count,
              (SELECT MAX(up.created_at) FROM user_points up WHERE up.user_id = u.id) AS last_contribution
         FROM users u
        WHERE EXISTS (SELECT 1 FROM user_points up WHERE up.user_id = u.id)
        ORDER BY total_points DESC, contribution_count DESC, u.id ASC
        LIMIT ?`
    ).bind(limit).all();
    return feedJson({ results: rows.results || [], count: (rows.results || []).length });
  }

  // POST /api/user-points/leaderboard-award
  if (url.pathname === '/api/user-points/leaderboard-award' && request.method === 'POST') {
    if (!user) return feedJson({ error: 'Unauthorized' }, 401);
    let body = {}; try { body = await request.json(); } catch {}
    const refId = body.reference_id ? parseInt(body.reference_id, 10) : null;
    const beforeRank = await getUserLeaderboardRank(env, user.id);
    await awardPoints(env, { userId: user.id, type: 'leaderboard', points: POINTS_LEADERBOARD, referenceId: refId });
    const afterRank = await getUserLeaderboardRank(env, user.id);
    if (beforeRank && afterRank && beforeRank !== afterRank) {
      await logActivity(env, user.id, 'rank_change', {
        targetLabel: `#${beforeRank} → #${afterRank}`,
        link: '/leader-board/'
      });
    }
    const total = await getUserTotalPoints(env, user.id);
    return feedJson({ success: true, total_points: total });
  }

  // GET /api/user-points/me
  if (url.pathname === '/api/user-points/me' && request.method === 'GET') {
    if (!user) return feedJson({ error: 'Unauthorized' }, 401);
    const total = await getUserTotalPoints(env, user.id);
    return feedJson({ total_points: total });
  }

  // GET /api/notifications
  if (url.pathname === '/api/notifications' && request.method === 'GET') {
    if (!user) return feedJson({ error: 'Unauthorized' }, 401);
    const rows = await env.MY_BINDING.prepare(
      `SELECT n.id, n.type, n.actor_id, n.subject_type, n.subject_id, n.message, n.link, n.is_read, n.created_at,
              u.username AS actor_username, u.name AS actor_display_name, u.avatar_preset AS actor_avatar,
              u.avatar_r2_key AS actor_avatar_r2_key, u.avatar_updated_at AS actor_avatar_updated_at,
              COALESCE((SELECT SUM(up.points) FROM user_points up WHERE up.user_id = n.actor_id), 0) AS actor_total_points
         FROM notifications n
         LEFT JOIN users u ON u.id = n.actor_id
        WHERE n.user_id = ?
        ORDER BY n.created_at DESC
        LIMIT 24`
    ).bind(user.id).all();
    const list = withAvatars(rows.results);
    const unread = list.filter(n => !n.is_read).length;
    return feedJson({ notifications: list, unread });
  }

  // POST /api/notifications/read
  if (url.pathname === '/api/notifications/read' && request.method === 'POST') {
    if (!user) return feedJson({ error: 'Unauthorized' }, 401);
    let body = {};
    try { body = await request.json(); } catch {}
    if (body.id) {
      await env.MY_BINDING.prepare('UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?').bind(body.id, user.id).run();
    } else {
      await env.MY_BINDING.prepare('UPDATE notifications SET is_read = 1 WHERE user_id = ?').bind(user.id).run();
    }
    return feedJson({ success: true });
  }

  // DELETE /api/notifications/:id
  if (url.pathname.match(/^\/api\/notifications\/\d+$/) && request.method === 'DELETE') {
    if (!user) return feedJson({ error: 'Unauthorized' }, 401);
    const id = parseInt(url.pathname.split('/').pop(), 10);
    await env.MY_BINDING.prepare('DELETE FROM notifications WHERE id = ? AND user_id = ?').bind(id, user.id).run();
    return feedJson({ success: true });
  }

  // POST /api/notifications/clear
  if (url.pathname === '/api/notifications/clear' && request.method === 'POST') {
    if (!user) return feedJson({ error: 'Unauthorized' }, 401);
    await env.MY_BINDING.prepare('DELETE FROM notifications WHERE user_id = ?').bind(user.id).run();
    return feedJson({ success: true });
  }

  return null;
}

// ============================================================
// Router for new routes
// ============================================================
async function handleNewRoutes(request, env, url) {
  const p = url.pathname;
  const isNew =
    p === '/api/profile/me' ||
    p === '/api/profile/verify-domain' ||
    p.startsWith('/api/torcher/') ||
    /^\/api\/torch\/\d+$/.test(p) ||
    p === '/api/sitemap/static' ||
    p === '/api/sitemap/profiles' ||
    p === '/api/sitemap/torches' ||
    p.startsWith('/api/network/') ||
    p === '/api/feed' ||
    p === '/api/posts' ||
    /^\/api\/posts\/\d+(\/comments|\/endorse)?$/.test(p) ||
    /^\/api\/comments\/\d+$/.test(p) ||
    p === '/api/reports' ||
    p === '/api/blocks' ||
    p === '/api/contributions' ||
    p === '/api/contributions/leaderboard' ||
    p === '/api/notifications' ||
    p === '/api/notifications/read' ||
    p === '/api/notifications/clear' ||
    p === '/api/users/search' ||
    p === '/api/users/discover' ||
    p === '/api/activity/me' ||
    p === '/api/activity/network' ||
    p.startsWith('/api/activity/user/') ||
    p === '/api/user-points/me' ||
    p === '/api/user-points/leaderboard-award' ||
    /^\/api\/notifications\/\d+$/.test(p);

  if (!isNew) return null;
  if (request.method === 'OPTIONS') return new Response(null, { headers: FEED_CORS });

  try {
    return (await handleProfileRoutes(request, env, url))
        || (await handleTorchRoutes(request, env, url))
        || (await handleDiscoverRoutes(request, env, url))
        || (await handleActivityRoutes(request, env, url))
        || (await handleNetworkRoutes(request, env, url))
        || (await handleFeedRoutes(request, env, url))
        || (await handleSitemapRoutes(request, env, url));
  } catch (err) {
    console.error('handleNewRoutes error:', err.message, err.stack);
    return feedJson({ error: 'Server error: ' + err.message }, 500);
  }
} 


// ============================================================
// Post/comment image uploads — R2-backed
// ============================================================
async function handleUploadRoutes(request, env, url) {
  // POST /api/uploads/image  — upload
  if (url.pathname === '/api/uploads/image' && request.method === 'POST') {
    const user = await getUserFromToken(request, env);
    if (!user) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' } });

    let form;
    try { form = await request.formData(); } catch { return new Response(JSON.stringify({ error: 'Invalid form data' }), { status: 400, headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' } }); }
    const file = form.get('file');
    if (!file || typeof file === 'string') return new Response(JSON.stringify({ error: 'No file provided' }), { status: 400, headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' } });
    if (file.size > 5 * 1024 * 1024) return new Response(JSON.stringify({ error: 'Max 5MB' }), { status: 413, headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' } });

    const allowed = ['image/webp', 'image/jpeg', 'image/png'];
    if (!allowed.includes(file.type)) return new Response(JSON.stringify({ error: 'Only webp/jpeg/png allowed' }), { status: 415, headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' } });

    const ext = file.type === 'image/webp' ? 'webp' : (file.type === 'image/png' ? 'png' : 'jpg');
    const uuid = crypto.randomUUID();
    const key = `posts/${user.id}/${uuid}.${ext}`;

    const buf = await file.arrayBuffer();
    await env.ATTACHMENTS.put(key, buf, {
      httpMetadata: { contentType: file.type, cacheControl: 'public, max-age=31536000, immutable' }
    });

    const publicUrl = `https://traffic-torch-auth.traffictorch.workers.dev/api/uploads/image/${key}`;
    return new Response(JSON.stringify({
      success: true,
      url: publicUrl,
      key,
      width: parseInt(form.get('width') || '0', 10) || 0,
      height: parseInt(form.get('height') || '0', 10) || 0
    }), { status: 200, headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' } });
  }

  // GET /api/uploads/image/posts/:userId/:uuid.ext — serve
  if (url.pathname.startsWith('/api/uploads/image/') && request.method === 'GET') {
    const key = url.pathname.replace('/api/uploads/image/', '');
    if (!key || key.includes('..')) return new Response('Not found', { status: 404 });
    const obj = await env.ATTACHMENTS.get(key);
    if (!obj) return new Response('Not found', { status: 404 });
    const headers = new Headers();
    obj.writeHttpMetadata(headers);
    headers.set('Cache-Control', 'public, max-age=31536000, immutable');
    headers.set('etag', obj.httpEtag);
    headers.set('Access-Control-Allow-Origin', '*');
    return new Response(obj.body, { status: 200, headers });
  }

  // DELETE /api/uploads/image  — body: { key }
  if (url.pathname === '/api/uploads/image' && request.method === 'DELETE') {
    const user = await getUserFromToken(request, env);
    if (!user) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' } });
    let body; try { body = await request.json(); } catch { return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400, headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' } }); }
    const key = String(body.key || '');
    if (!key.startsWith(`posts/${user.id}/`)) return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' } });
    await env.ATTACHMENTS.delete(key);
    return new Response(JSON.stringify({ success: true }), { status: 200, headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' } });
  }

  return null;
}



// ============================================================
// OG preview cards — fetch any URL, SSRF-guarded, D1-cached
// ============================================================
function ogIsPublicHost(host) {
  if (!host) return false;
  const h = host.toLowerCase();
  if (h === 'localhost' || h === '127.0.0.1' || h === '0.0.0.0' || h === '::1' || h === '[::1]') return false;
  if (h.endsWith('.local') || h.endsWith('.internal') || h.endsWith('.localhost')) return false;
  if (h === 'metadata' || h === 'metadata.google.internal') return false;
  const ipv4 = h.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (ipv4) {
    const a = Number(ipv4[1]), b = Number(ipv4[2]);
    if (a === 0 || a === 10 || a === 127) return false;
    if (a === 169 && b === 254) return false;
    if (a === 172 && b >= 16 && b <= 31) return false;
    if (a === 192 && b === 168) return false;
    if (a >= 224) return false;
  }
  if (h.startsWith('[') || h.includes(':')) {
    if (/^\[?f[cd]/i.test(h)) return false;
    if (/^\[?fe80/i.test(h)) return false;
  }
  return true;
}

function ogDecode(s) {
  return String(s || '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&apos;/g, "'");
}

function ogParse(html, url) {
  const pick = (re) => { const m = html.match(re); return m ? ogDecode(m[1].trim()) : ''; };
  const title = pick(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i)
             || pick(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:title["']/i)
             || pick(/<title[^>]*>([^<]+)<\/title>/i);
  const description = pick(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i)
                   || pick(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:description["']/i)
                   || pick(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i)
                   || pick(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']description["']/i);
  let image = pick(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)
           || pick(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i);
  const site_name = pick(/<meta[^>]+property=["']og:site_name["'][^>]+content=["']([^"']+)["']/i);
  if (image && !/^https?:\/\//.test(image)) {
    try { image = new URL(image, url).href; } catch { image = ''; }
  }
  return {
    title: (title || '').slice(0, 200),
    description: (description || '').slice(0, 300),
    image: (image || '').slice(0, 500),
    site_name: (site_name || '').slice(0, 60)
  };
}

async function handleOgPreviewRoutes(request, env, url) {
  if (url.pathname !== '/api/og-preview' || request.method !== 'GET') return null;
  const target = url.searchParams.get('url');
  if (!target) return new Response(JSON.stringify({ error: 'url required' }), { status: 400, headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' } });

  let parsed;
  try { parsed = new URL(target); } catch { return new Response(JSON.stringify({ error: 'invalid url' }), { status: 400, headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' } }); }
  if (!/^https?:$/.test(parsed.protocol)) return new Response(JSON.stringify({ error: 'http(s) only' }), { status: 400, headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' } });

  const host = parsed.hostname.toLowerCase();
  if (!ogIsPublicHost(host)) return new Response(JSON.stringify({ error: 'host not allowed' }), { status: 403, headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' } });

  const now = Date.now();
  try {
    const cached = await env.MY_BINDING.prepare(
      'SELECT title, description, image, site_name FROM og_cache WHERE url = ? AND fetched_at > ?'
    ).bind(target, now - 7 * 86400000).first();
    if (cached) {
      return new Response(JSON.stringify({
        url: target, domain: host.replace(/^www\./, ''),
        title: cached.title, description: cached.description,
        image: cached.image, site_name: cached.site_name, cached: true
      }), { status: 200, headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' } });
    }
  } catch (e) {}

  let html = '';
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(target, {
      method: 'GET',
      redirect: 'manual',
      signal: controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; TrafficTorchBot/1.0; +https://traffictorch.net)', 'Accept': 'text/html,application/xhtml+xml' }
    });
    clearTimeout(timer);
    if (res.status >= 300 && res.status < 400) return new Response(JSON.stringify({ error: 'redirect not followed' }), { status: 400, headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' } });
    if (!res.ok) return new Response(JSON.stringify({ error: 'fetch failed ' + res.status }), { status: 502, headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' } });
    const ct = (res.headers.get('content-type') || '').toLowerCase();
    if (!ct.includes('text/html') && !ct.includes('application/xhtml')) return new Response(JSON.stringify({ error: 'not html' }), { status: 415, headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' } });
    const reader = res.body.getReader();
    let chunks = [], total = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.length;
      if (total > 200000) { chunks.push(value.slice(0, Math.max(0, value.length - (total - 200000)))); break; }
      chunks.push(value);
    }
    const combined = new Uint8Array(chunks.reduce((s, c) => s + c.length, 0));
    let off = 0;
    for (const c of chunks) { combined.set(c, off); off += c.length; }
    html = new TextDecoder('utf-8', { fatal: false }).decode(combined);
  } catch (e) {
    return new Response(JSON.stringify({ error: 'fetch error: ' + e.message }), { status: 502, headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' } });
  }

  const meta = ogParse(html, target);
  try {
    await env.MY_BINDING.prepare(
      'INSERT OR REPLACE INTO og_cache (url, title, description, image, site_name, fetched_at) VALUES (?, ?, ?, ?, ?, ?)'
    ).bind(target, meta.title, meta.description, meta.image, meta.site_name, now).run();
    await env.MY_BINDING.prepare('DELETE FROM og_cache WHERE fetched_at < ?').bind(now - 30 * 86400000).run();
  } catch (e) {}

  return new Response(JSON.stringify({ url: target, domain: host.replace(/^www\./, ''), ...meta }), {
    status: 200, headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' }
  });
}


// ============================================================
// Main export
// ============================================================
export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // === AVATAR ROUTES — run first ===
    if (url.pathname.startsWith('/api/profile/avatar')) {
      try {
        const r = await handleAvatarRoutes(request, env, url);
        if (r) return r;
      } catch (e) {
        return new Response(JSON.stringify({ error: 'avatar threw: ' + e.message }),
          { status: 500, headers: { 'Content-Type': 'application/json' } });
      }
    }

    // === UPLOAD ROUTES ===
    if (url.pathname.startsWith('/api/uploads/image')) {
      try {
        const r = await handleUploadRoutes(request, env, url);
        if (r) return r;
      } catch (e) {
        return new Response(JSON.stringify({ error: 'upload threw: ' + e.message }),
          { status: 500, headers: { 'Content-Type': 'application/json' } });
      }
    }

    // === OG PREVIEW ===
    if (url.pathname === '/api/og-preview') {
      try {
        const r = await handleOgPreviewRoutes(request, env, url);
        if (r) return r;
      } catch (e) {
        return new Response(JSON.stringify({ error: 'og-preview threw: ' + e.message }),
          { status: 500, headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' } });
      }
    }

    const newRouteResponse = await handleNewRoutes(request, env, url);
    if (newRouteResponse) return newRouteResponse;

    const method = request.method;

    await ensureTablesOnce(env);

    if (method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-fingerprint',
          'Access-Control-Max-Age': '86400',
        },
      });
    }

    try {
      if (url.pathname === '/api/register' && method === 'POST') {
        const { name, email, password, promo_code } = await request.json().catch(() => ({}));
        if (!email || !password || password.length < 8) {
          return corsResponse(JSON.stringify({ error: 'Valid email and password (min 8 chars) required' }), 400);
        }
        const existing = await env.MY_BINDING.prepare('SELECT id FROM users WHERE email = ?').bind(email).first();
        if (existing) return corsResponse(JSON.stringify({ error: 'Email already registered' }), 409);
        const hash = await hashPassword(password);
        const result = await env.MY_BINDING.prepare(
          `INSERT INTO users (email, password_hash, name, subscription_status, tier)
           VALUES (?, ?, ?, 'free', 'free') RETURNING id`
        ).bind(email, hash, name || email.split('@')[0]).first();
        let status = 'free';
        let tier = 'free';
        if (promo_code === 'traffictorchpro') {
          status = 'pro'; tier = 'pro';
          await env.MY_BINDING.prepare('UPDATE users SET subscription_status = ?, tier = ?, pro_since = CURRENT_TIMESTAMP WHERE id = ?').bind(status, tier, result.id).run();
        }
        const token = await signJWT({ id: result.id, status, tier }, env.JWT_SECRET, '7d');
        return corsResponse(JSON.stringify({ token }));
      }

      if (url.pathname === '/api/login' && method === 'POST') {
        const { email, password } = await request.json().catch(() => ({}));
        if (!email || !password) return corsResponse(JSON.stringify({ error: 'Email and password required' }), 400);
        const user = await env.MY_BINDING.prepare(
          'SELECT id, password_hash, subscription_status, tier FROM users WHERE email = ?'
        ).bind(email).first();
        if (!user) return corsResponse(JSON.stringify({ error: 'Invalid email or password' }), 401);
        const valid = await comparePassword(password, user.password_hash);
        if (!valid) return corsResponse(JSON.stringify({ error: 'Invalid email or password' }), 401);
        const token = await signJWT({ id: user.id, status: user.subscription_status || 'free', tier: user.tier || 'free' }, env.JWT_SECRET, '7d');
        return corsResponse(JSON.stringify({ token }));
      }

      if (url.pathname === '/api/auth/magic-link' && method === 'POST') {
        const { email } = await request.json().catch(() => ({}));
        if (!email || !email.includes('@')) return corsResponse(JSON.stringify({ error: 'Valid email required' }), 400);
        const rawToken = crypto.randomUUID() + crypto.randomUUID();
        const tokenHash = await sha256(rawToken);
        const expiresAt = Math.floor(Date.now() / 1000) + 900;
        await env.MY_BINDING.prepare('DELETE FROM magic_links WHERE email = ? AND used = 0').bind(email).run();
        await env.MY_BINDING.prepare('INSERT INTO magic_links (email, token_hash, expires_at) VALUES (?, ?, ?)').bind(email, tokenHash, expiresAt).run();
        const link = `https://traffic-torch-auth.traffictorch.workers.dev/api/auth/verify?token=${rawToken}`;
        const resendRes = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${env.RESEND_API_KEY}` },
          body: JSON.stringify({
            from: 'support@traffictorch.net', to: email, subject: 'Your Traffic Torch Magic Link',
            html: `<p>Click <a href="${link}">here</a> to log in (expires in 15 min).</p>`
          })
        });
        if (!resendRes.ok) { console.error(await resendRes.text()); return corsResponse(JSON.stringify({ error: 'Failed to send email' }), 500); }
        return corsResponse(JSON.stringify({ message: 'Magic link sent!' }));
      }

      if (url.pathname === '/api/auth/verify' && method === 'GET') {
        const rawToken = url.searchParams.get('token');
        if (!rawToken) return new Response('Missing token', { status: 400 });
        const tokenHash = await sha256(rawToken);
        const now = Math.floor(Date.now() / 1000);
        const record = await env.MY_BINDING.prepare('SELECT email, expires_at FROM magic_links WHERE token_hash = ? AND used = 0').bind(tokenHash).first();
        if (!record) return new Response('Invalid or expired link', { status: 400 });
        if (record.expires_at < now) {
          await env.MY_BINDING.prepare('DELETE FROM magic_links WHERE token_hash = ?').bind(tokenHash).run();
          return new Response('Link expired', { status: 400 });
        }
        await env.MY_BINDING.prepare('UPDATE magic_links SET used = 1 WHERE token_hash = ?').bind(tokenHash).run();
        const email = record.email;
        let user = await env.MY_BINDING.prepare('SELECT id, subscription_status, tier FROM users WHERE email = ?').bind(email).first();
        if (!user) {
          const result = await env.MY_BINDING.prepare(
            `INSERT INTO users (email, name, subscription_status, tier) VALUES (?, ?, 'free', 'free') RETURNING id`
          ).bind(email, email.split('@')[0]).first();
          user = { id: result.id, subscription_status: 'free', tier: 'free' };
        }
        const jwt = await signJWT({ id: user.id, status: user.subscription_status, tier: user.tier }, env.JWT_SECRET, '7d');
        return Response.redirect(`https://traffictorch.net/dashboard/?magic_token=${jwt}`, 302);
      }

      if (url.pathname === '/api/forgot-password' && method === 'POST') {
        const { email } = await request.json().catch(() => ({}));
        if (!email || !email.includes('@')) return corsResponse(JSON.stringify({ error: 'Valid email required' }), 400);
        const user = await env.MY_BINDING.prepare('SELECT id FROM users WHERE email = ?').bind(email).first();
        if (!user) return corsResponse(JSON.stringify({ message: 'If an account exists, a reset link was sent.' }), 200);
        const rawToken = crypto.randomUUID() + crypto.randomUUID();
        const tokenHash = await sha256(rawToken);
        const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
        await env.MY_BINDING.prepare('DELETE FROM password_reset_tokens WHERE user_id = ?').bind(user.id).run();
        await env.MY_BINDING.prepare('INSERT INTO password_reset_tokens (user_id, token, expires_at) VALUES (?, ?, ?)').bind(user.id, tokenHash, expiresAt).run();
        const resetLink = `https://traffictorch.net/dashboard/?reset_token=${rawToken}`;
        const resendRes = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${env.RESEND_API_KEY}` },
          body: JSON.stringify({
            from: 'support@traffictorch.net', to: email, subject: 'Reset your Traffic Torch password',
            html: `<p>Click <a href="${resetLink}">here</a> to reset your password (expires in 1 hour).</p>`
          })
        });
        if (!resendRes.ok) { console.error(await resendRes.text()); return corsResponse(JSON.stringify({ error: 'Failed to send email' }), 500); }
        return corsResponse(JSON.stringify({ message: 'If an account exists, a reset link was sent.' }), 200);
      }

      if (url.pathname === '/api/reset-password' && method === 'POST') {
        const { token, password } = await request.json().catch(() => ({}));
        if (!token || !password || password.length < 8) return corsResponse(JSON.stringify({ error: 'Valid token and password (min 8 chars) required' }), 400);
        const tokenHash = await sha256(token);
        const now = new Date();
        const record = await env.MY_BINDING.prepare('SELECT user_id, expires_at FROM password_reset_tokens WHERE token = ?').bind(tokenHash).first();
        if (!record) return corsResponse(JSON.stringify({ error: 'Invalid or expired token' }), 400);
        if (new Date(record.expires_at) < now) {
          await env.MY_BINDING.prepare('DELETE FROM password_reset_tokens WHERE token = ?').bind(tokenHash).run();
          return corsResponse(JSON.stringify({ error: 'Token expired' }), 400);
        }
        const newHash = await hashPassword(password);
        await env.MY_BINDING.prepare('UPDATE users SET password_hash = ? WHERE id = ?').bind(newHash, record.user_id).run();
        await env.MY_BINDING.prepare('DELETE FROM password_reset_tokens WHERE token = ?').bind(tokenHash).run();
        return corsResponse(JSON.stringify({ message: 'Password reset successfully' }), 200);
      }

      if (url.pathname === '/api/account-info' && method === 'GET') {
        const auth = request.headers.get('Authorization');
        if (!auth || !auth.startsWith('Bearer ')) return corsResponse(JSON.stringify({ error: 'Unauthorized' }), 401);
        const token = auth.split(' ')[1];
        let decoded;
        try { decoded = await verifyJWT(token, env.JWT_SECRET); } catch { return corsResponse(JSON.stringify({ error: 'Invalid token' }), 401); }
        const user = await env.MY_BINDING.prepare('SELECT email, subscription_status, pro_since, tier, ga4_property_id FROM users WHERE id = ?').bind(decoded.id).first();
        if (!user) return corsResponse(JSON.stringify({ error: 'User not found' }), 404);
        const gscInfo = await env.MY_BINDING.prepare('SELECT site_url FROM user_gsc WHERE user_id = ?').bind(decoded.id).first();
        const gscConnected = !!gscInfo;
        const gscSiteUrl = gscInfo?.site_url || null;
        const isPro = user.subscription_status === 'pro';
        const tier = user.tier || 'free';
        const limit = getTierLimit(tier);
        const today = new Date().toISOString().split('T')[0];
        const log = await env.MY_BINDING.prepare('SELECT MAX(run_count) as run_count FROM usage_logs WHERE identifier = ? AND tool_run_date = ?').bind(decoded.id.toString(), today).first();
        const used = log?.run_count || 0;
        const totalPoints = await getUserTotalPoints(env, decoded.id);
        return corsResponse(JSON.stringify({
          email: user.email, isPro, proSince: user.pro_since, dailyUsed: used, dailyLimit: limit,
          dailyRemaining: limit - used, tier, ga4Connected: !!user.ga4_property_id,
          gscConnected, gscSiteUrl, total_points: totalPoints
        }));
      }

      if (url.pathname === '/api/check-rate' && method === 'POST') {
        const auth = request.headers.get('Authorization');
        let userId = null, isPro = false, tier = 'free';
        if (auth && auth.startsWith('Bearer ')) {
          const token = auth.split(' ')[1];
          try {
            const decoded = await verifyJWT(token, env.JWT_SECRET);
            userId = decoded.id; isPro = decoded.status === 'pro'; tier = decoded.tier || 'free';
          } catch {}
        }
        const limit = getTierLimit(tier);
        const today = new Date().toISOString().split('T')[0];
        const identifier = userId ? userId.toString() : request.headers.get('cf-connecting-ip') || 'anon';
        const log = await env.MY_BINDING.prepare('SELECT MAX(run_count) as run_count FROM usage_logs WHERE identifier = ? AND tool_run_date = ?').bind(identifier, today).first();
        const used = log?.run_count || 0;
        if (used >= limit) {
          return corsResponse(JSON.stringify({ allowed: false, remaining: 0, message: tier === 'free' ? 'Free limit reached – upgrade.' : 'Daily limit reached.' }));
        }
        const newCount = used + 1;
        await env.MY_BINDING.prepare('DELETE FROM usage_logs WHERE identifier = ? AND tool_run_date = ?').bind(identifier, today).run();
        await env.MY_BINDING.prepare('INSERT INTO usage_logs (user_id, tool_run_date, run_count, tool_name, identifier) VALUES (?, ?, ?, ?, ?)').bind(userId, today, newCount, 'limit', identifier).run();
        return corsResponse(JSON.stringify({ allowed: true, remaining: limit - newCount }));
      }

      if (url.pathname === '/api/upgrade' && method === 'POST') {
        const auth = request.headers.get('Authorization');
        if (!auth || !auth.startsWith('Bearer ')) return corsResponse(JSON.stringify({ error: 'Unauthorized' }), 401);
        const token = auth.split(' ')[1];
        let decoded;
        try { decoded = await verifyJWT(token, env.JWT_SECRET); } catch { return corsResponse(JSON.stringify({ error: 'Invalid token' }), 401); }
        const { plan } = await request.json().catch(() => ({}));
        let priceId;
        switch (plan) {
          case 'pro_6month': priceId = env.STRIPE_PRICE_PRO_6MONTH; break;
          case 'pro_yearly': priceId = env.STRIPE_PRICE_PRO_YEARLY; break;
          case 'pro_lifetime': priceId = env.STRIPE_PRICE_PRO_LIFETIME; break;
          case 'enterprise_monthly': priceId = env.STRIPE_PRICE_ENTERPRISE_MONTHLY; break;
          case 'enterprise_yearly': priceId = env.STRIPE_PRICE_ENTERPRISE_YEARLY; break;
          default: return corsResponse(JSON.stringify({ error: 'Invalid plan' }), 400);
        }
        if (!priceId) return corsResponse(JSON.stringify({ error: 'Price ID not configured for this plan' }), 500);
        try {
          const isLifetime = plan === 'pro_lifetime';
          const mode = isLifetime ? 'payment' : 'subscription';
          const stripeSecretKey = env.STRIPE_SECRET_KEY;
          const body = new URLSearchParams({
            'ui_mode': 'embedded', 'mode': mode, 'payment_method_types[]': 'card',
            'line_items[0][price]': priceId, 'line_items[0][quantity]': '1',
            'return_url': 'https://traffictorch.net/upgrade/?session_id={CHECKOUT_SESSION_ID}',
            'client_reference_id': decoded.id.toString(), 'metadata[plan]': plan, 'allow_promotion_codes': 'true',
          });
          const response = await fetch('https://api.stripe.com/v1/checkout/sessions', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${stripeSecretKey}`, 'Content-Type': 'application/x-www-form-urlencoded' },
            body: body.toString(),
          });
          const data = await response.json();
          if (!response.ok) { console.error('Stripe API error:', data); return corsResponse(JSON.stringify({ error: 'Stripe API error: ' + (data.error?.message || 'Unknown') }), 500); }
          if (!data.client_secret) return corsResponse(JSON.stringify({ error: 'No client_secret returned' }), 500);
          return corsResponse(JSON.stringify({ clientSecret: data.client_secret }));
        } catch (err) {
          console.error('Upgrade error:', err.message, err.stack);
          return corsResponse(JSON.stringify({ error: 'Upgrade failed: ' + err.message }), 500);
        }
      }

      if (url.pathname === '/api/session-status' && method === 'GET') {
        const sessionId = url.searchParams.get('session_id');
        if (!sessionId) return corsResponse(JSON.stringify({ error: 'Missing session_id' }), 400);
        const stripe = new (await import('stripe')).default(env.STRIPE_SECRET_KEY);
        const session = await stripe.checkout.sessions.retrieve(sessionId);
        return corsResponse(JSON.stringify({ status: session.status, customer_email: session.customer_details?.email }));
      }

      if (url.pathname === '/api/webhook' && method === 'POST') {
        const payload = await request.text();
        const sig = request.headers.get('stripe-signature');
        if (!sig) return corsResponse('Missing signature', 400);
        const stripe = new (await import('stripe')).default(env.STRIPE_SECRET_KEY);
        const event = await stripe.webhooks.constructEventAsync(
          payload, sig, env.STRIPE_WEBHOOK_SECRET,
          { cryptoProvider: (await import('stripe')).default.createSubtleCryptoProvider() }
        );
        if (event.type === 'checkout.session.completed') {
          const session = event.data.object;
          const userId = session.client_reference_id;
          await env.MY_BINDING.prepare(
            'UPDATE users SET subscription_status = "pro", pro_since = CURRENT_TIMESTAMP, stripe_customer_id = ?, tier = "pro" WHERE id = ?'
          ).bind(session.customer, userId).run();
        } else if (event.type === 'customer.subscription.deleted' || event.type === 'customer.subscription.updated') {
          const subscription = event.data.object;
          const customerId = subscription.customer;
          const status = subscription.status;
          if (['canceled', 'past_due', 'unpaid', 'incomplete_expired'].includes(status)) {
            await env.MY_BINDING.prepare(
              'UPDATE users SET subscription_status = "free", pro_since = NULL, tier = "free" WHERE stripe_customer_id = ?'
            ).bind(customerId).run();
          }
        }
        return corsResponse('Webhook received', 200);
      }

      if (url.pathname === '/api/portal' && method === 'GET') {
        const auth = request.headers.get('Authorization');
        if (!auth || !auth.startsWith('Bearer ')) return corsResponse(JSON.stringify({ error: 'Unauthorized' }), 401);
        const token = auth.split(' ')[1];
        let decoded;
        try { decoded = await verifyJWT(token, env.JWT_SECRET); } catch { return corsResponse(JSON.stringify({ error: 'Invalid token' }), 401); }
        const user = await env.MY_BINDING.prepare('SELECT stripe_customer_id, subscription_status FROM users WHERE id = ?').bind(decoded.id).first();
        if (!user || !user.stripe_customer_id) return corsResponse(JSON.stringify({ error: 'No active subscription' }), 403);
        if (user.subscription_status !== 'pro' && user.subscription_status !== 'enterprise') return corsResponse(JSON.stringify({ error: 'No active subscription' }), 403);
        const stripe = new (await import('stripe')).default(env.STRIPE_SECRET_KEY);
        const session = await stripe.billingPortal.sessions.create({
          customer: user.stripe_customer_id, return_url: 'https://traffictorch.net/dashboard/'
        });
        return corsResponse(JSON.stringify({ url: session.url }));
      }

      if (url.pathname === '/api/refresh-token' && method === 'POST') {
        const auth = request.headers.get('Authorization');
        if (!auth || !auth.startsWith('Bearer ')) return corsResponse(JSON.stringify({ error: 'Unauthorized' }), 401);
        const token = auth.split(' ')[1];
        let decoded;
        try { decoded = await verifyJWT(token, env.JWT_SECRET); } catch { return corsResponse(JSON.stringify({ error: 'Invalid token' }), 401); }
        const user = await env.MY_BINDING.prepare('SELECT id, subscription_status, tier FROM users WHERE id = ?').bind(decoded.id).first();
        if (!user) return corsResponse(JSON.stringify({ error: 'User not found' }), 404);
        const newToken = await signJWT({ id: user.id, status: user.subscription_status || 'free', tier: user.tier || 'free' }, env.JWT_SECRET, '7d');
        return corsResponse(JSON.stringify({ token: newToken }));
      }

      if (url.pathname === '/api/ga4/auth-url' && method === 'GET') {
        const auth = request.headers.get('Authorization');
        if (!auth || !auth.startsWith('Bearer ')) return corsResponse(JSON.stringify({ error: 'Unauthorized' }), 401);
        let decoded;
        try { decoded = await verifyJWT(auth.split(' ')[1], env.JWT_SECRET); } catch { return corsResponse(JSON.stringify({ error: 'Invalid token' }), 401); }
        const state = await generateOAuthState(decoded.id, 'ga4', env.JWT_SECRET);
        const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
        authUrl.searchParams.set('client_id', env.GOOGLE_CLIENT_ID);
        authUrl.searchParams.set('redirect_uri', 'https://traffic-torch-auth.traffictorch.workers.dev/api/ga4/callback');
        authUrl.searchParams.set('response_type', 'code');
        authUrl.searchParams.set('scope', 'https://www.googleapis.com/auth/analytics.readonly');
        authUrl.searchParams.set('access_type', 'offline');
        authUrl.searchParams.set('prompt', 'consent');
        authUrl.searchParams.set('state', state);
        return corsResponse(JSON.stringify({ authUrl: authUrl.toString() }));
      }

      if (url.pathname === '/api/ga4/callback' && method === 'GET') {
        const code = url.searchParams.get('code');
        const state = url.searchParams.get('state');
        const error = url.searchParams.get('error');
        if (error) return new Response(`Authorization failed: ${error}`, { status: 400 });
        if (!code) return new Response('Missing authorization code', { status: 400 });
        if (!state) return new Response('Missing state parameter', { status: 400 });
        const statePayload = await verifyOAuthState(state, 'ga4', env.JWT_SECRET);
        if (!statePayload) return new Response('Invalid or expired state parameter', { status: 400 });
        return Response.redirect(`https://traffictorch.net/dashboard/?ga4_code=${encodeURIComponent(code)}&state=${encodeURIComponent(state)}`, 302);
      }

      if (url.pathname === '/api/ga4/connect' && method === 'POST') {
        const auth = request.headers.get('Authorization');
        if (!auth || !auth.startsWith('Bearer ')) return corsResponse(JSON.stringify({ error: 'Unauthorized' }), 401);
        const token = auth.split(' ')[1];
        let decoded;
        try { decoded = await verifyJWT(token, env.JWT_SECRET); } catch { return corsResponse(JSON.stringify({ error: 'Invalid token' }), 401); }
        const { code, propertyId, state } = await request.json().catch(() => ({}));
        if (!code) return corsResponse(JSON.stringify({ error: 'Authorization code required' }), 400);
        if (!propertyId) return corsResponse(JSON.stringify({ error: 'GA4 Property ID required' }), 400);
        const statePayload = await verifyOAuthState(state, 'ga4', env.JWT_SECRET);
        if (!statePayload) return corsResponse(JSON.stringify({ error: 'Invalid or expired state parameter' }), 400);
        if (statePayload.uid !== decoded.id) return corsResponse(JSON.stringify({ error: 'State user mismatch' }), 403);
        try {
          const tokens = await exchangeCodeForTokens(code, env);
          const encryptedRefresh = encrypt(tokens.refresh_token);
          await env.MY_BINDING.prepare('INSERT OR REPLACE INTO user_ga4 (user_id, refresh_token, property_id) VALUES (?, ?, ?)').bind(decoded.id, encryptedRefresh, propertyId).run();
          await env.MY_BINDING.prepare('UPDATE users SET ga4_property_id = ? WHERE id = ?').bind(propertyId, decoded.id).run();
          return corsResponse(JSON.stringify({ success: true, message: 'GA4 connected' }));
        } catch (err) { return corsResponse(JSON.stringify({ error: err.message }), 500); }
      }

      if (url.pathname === '/api/ga4/disconnect' && method === 'POST') {
        const auth = request.headers.get('Authorization');
        if (!auth || !auth.startsWith('Bearer ')) return corsResponse(JSON.stringify({ error: 'Unauthorized' }), 401);
        const token = auth.split(' ')[1];
        let decoded;
        try { decoded = await verifyJWT(token, env.JWT_SECRET); } catch { return corsResponse(JSON.stringify({ error: 'Invalid token' }), 401); }
        await env.MY_BINDING.prepare('DELETE FROM user_ga4 WHERE user_id = ?').bind(decoded.id).run();
        await env.MY_BINDING.prepare('UPDATE users SET ga4_property_id = NULL WHERE id = ?').bind(decoded.id).run();
        await env.MY_BINDING.prepare('DELETE FROM ga4_cache WHERE user_id = ?').bind(decoded.id).run();
        return corsResponse(JSON.stringify({ success: true, message: 'GA4 disconnected' }));
      }

      if (url.pathname === '/api/ga4/cached-report' && method === 'GET') {
        const auth = request.headers.get('Authorization');
        if (!auth || !auth.startsWith('Bearer ')) return corsResponse(JSON.stringify({ error: 'Unauthorized' }), 401);
        const token = auth.split(' ')[1];
        let decoded;
        try { decoded = await verifyJWT(token, env.JWT_SECRET); } catch { return corsResponse(JSON.stringify({ error: 'Invalid token' }), 401); }
        const reportType = url.searchParams.get('type') || 'overview';
        let days = parseInt(url.searchParams.get('days')) || 7;
        const startDate = url.searchParams.get('start_date') || null;
        const endDate = url.searchParams.get('end_date') || null;
        const user = await env.MY_BINDING.prepare('SELECT tier, ga4_property_id FROM users WHERE id = ?').bind(decoded.id).first();
        if (!user || !user.ga4_property_id) return corsResponse(JSON.stringify({ error: 'GA4 not connected' }), 400);
        const tier = user.tier || 'free';
        let maxDays = 7;
        if (tier === 'pro') maxDays = 30;
        else if (tier === 'enterprise') maxDays = 365;
        if (days > maxDays) return corsResponse(JSON.stringify({ error: `Date range exceeds your tier limit (max ${maxDays} days)` }), 403);
        let cachedData = await getCachedReport(decoded.id, reportType, days, startDate, endDate, env);
        if (cachedData) return corsResponse(JSON.stringify({ cached: true, reportType, days, data: cachedData, cachedAt: new Date().toISOString() }));
        try {
          const ga4Data = await env.MY_BINDING.prepare('SELECT refresh_token, property_id FROM user_ga4 WHERE user_id = ?').bind(decoded.id).first();
          if (!ga4Data || !ga4Data.property_id) return corsResponse(JSON.stringify({ error: 'GA4 not connected' }), 400);
          const refreshToken = decrypt(ga4Data.refresh_token);
          const accessToken = await refreshAccessToken(refreshToken, env);
          let dimensions, metrics;
          switch (reportType) {
            case 'overview': dimensions = ['date']; metrics = ['sessions', 'totalUsers', 'screenPageViews']; break;
            case 'top-content': dimensions = ['pagePath', 'pageTitle']; metrics = ['screenPageViews', 'averageSessionDuration']; break;
            case 'traffic-sources': dimensions = ['sessionSource', 'sessionMedium']; metrics = ['sessions', 'keyEvents']; break;
            case 'device-breakdown': dimensions = ['deviceCategory']; metrics = ['sessions']; break;
            case 'countries': dimensions = ['country']; metrics = ['sessions']; break;
            case 'top-converting-pages': dimensions = ['pagePath', 'pageTitle']; metrics = ['keyEvents', 'sessions']; break;
            default: dimensions = ['date']; metrics = ['sessions'];
          }
          const data = await fetchGA4Report(accessToken, ga4Data.property_id, dimensions, metrics, days, startDate, endDate);
          const rows = data.rows || [];
          const transformed = rows.map(row => ({
            dimensions: row.dimensionValues?.map(d => d.value) || [],
            metrics: row.metricValues?.map(m => parseFloat(m.value) || 0) || []
          }));
          await setCachedReport(decoded.id, reportType, days, startDate, endDate, transformed, env);
          return corsResponse(JSON.stringify({ cached: false, reportType, days, data: transformed, cachedAt: new Date().toISOString() }));
        } catch (err) {
          if (err.message.includes('refresh_token')) {
            await env.MY_BINDING.prepare('DELETE FROM user_ga4 WHERE user_id = ?').bind(decoded.id).run();
            await env.MY_BINDING.prepare('UPDATE users SET ga4_property_id = NULL WHERE id = ?').bind(decoded.id).run();
            return corsResponse(JSON.stringify({ error: 'GA4 connection expired. Please reconnect.', needsReconnect: true }), 401);
          }
          return corsResponse(JSON.stringify({ error: err.message }), 500);
        }
      }

      if (url.pathname === '/api/keys' && method === 'GET') {
        const auth = request.headers.get('Authorization');
        if (!auth || !auth.startsWith('Bearer ')) return corsResponse(JSON.stringify({ error: 'Unauthorized' }), 401);
        const token = auth.split(' ')[1];
        let decoded;
        try { decoded = await verifyJWT(token, env.JWT_SECRET); } catch { return corsResponse(JSON.stringify({ error: 'Invalid token' }), 401); }
        const keys = await env.MY_BINDING.prepare(
          'SELECT id, key_prefix, name, created_at FROM api_keys WHERE user_id = ? AND is_active = 1 ORDER BY created_at DESC'
        ).bind(decoded.id).all();
        return corsResponse(JSON.stringify({ keys: keys.results }));
      }

      if (url.pathname === '/api/keys/generate' && method === 'POST') {
        const auth = request.headers.get('Authorization');
        if (!auth || !auth.startsWith('Bearer ')) return corsResponse(JSON.stringify({ error: 'Unauthorized' }), 401);
        const token = auth.split(' ')[1];
        let decoded;
        try { decoded = await verifyJWT(token, env.JWT_SECRET); } catch { return corsResponse(JSON.stringify({ error: 'Invalid token' }), 401); }
        const { name } = await request.json().catch(() => ({}));
        const rawKey = 'tt_' + crypto.randomUUID().replace(/-/g, '').substring(0, 32);
        const keyHash = await sha256(rawKey);
        const keyPrefix = rawKey.substring(0, 8);
        try {
          const result = await env.MY_BINDING.prepare(
            'INSERT INTO api_keys (user_id, key_hash, key_prefix, name) VALUES (?, ?, ?, ?) RETURNING id'
          ).bind(decoded.id, keyHash, keyPrefix, name || '').first();
          if (!result) throw new Error('No row returned from INSERT');
          return corsResponse(JSON.stringify({ key: rawKey, id: result.id }));
        } catch (dbErr) {
          console.error('DB error:', dbErr.message);
          return corsResponse(JSON.stringify({ error: 'Database error: ' + dbErr.message }), 500);
        }
      }

      if (url.pathname.startsWith('/api/keys/revoke/') && method === 'DELETE') {
        const auth = request.headers.get('Authorization');
        if (!auth || !auth.startsWith('Bearer ')) return corsResponse(JSON.stringify({ error: 'Unauthorized' }), 401);
        const token = auth.split(' ')[1];
        let decoded;
        try { decoded = await verifyJWT(token, env.JWT_SECRET); } catch { return corsResponse(JSON.stringify({ error: 'Invalid token' }), 401); }
        const id = parseInt(url.pathname.split('/').pop());
        if (isNaN(id)) return corsResponse(JSON.stringify({ error: 'Invalid ID' }), 400);
        const key = await env.MY_BINDING.prepare('SELECT user_id FROM api_keys WHERE id = ?').bind(id).first();
        if (!key) return corsResponse(JSON.stringify({ error: 'Key not found' }), 404);
        if (key.user_id !== decoded.id) return corsResponse(JSON.stringify({ error: 'Forbidden' }), 403);
        await env.MY_BINDING.prepare('UPDATE api_keys SET is_active = 0 WHERE id = ?').bind(id).run();
        return corsResponse(JSON.stringify({ success: true }));
      }

      if (url.pathname.startsWith('/api/tools/') && method === 'POST') {
        const apiKey = request.headers.get('X-API-Key');
        if (!apiKey) return corsResponse(JSON.stringify({ error: 'Missing X-API-Key header' }), 401);
        const keyHash = await sha256(apiKey);
        const keyRecord = await env.MY_BINDING.prepare(
          'SELECT id, user_id FROM api_keys WHERE key_hash = ? AND is_active = 1'
        ).bind(keyHash).first();
        if (!keyRecord) return corsResponse(JSON.stringify({ error: 'Invalid or revoked API key' }), 401);
        const user = await env.MY_BINDING.prepare('SELECT tier FROM users WHERE id = ?').bind(keyRecord.user_id).first();
        const tier = user?.tier || 'free';
        const limit = getTierLimit(tier);
        const today = new Date().toISOString().split('T')[0];
        const usage = await env.MY_BINDING.prepare(
          'SELECT COUNT(*) as count FROM api_usage WHERE api_key_id = ? AND DATE(request_at) = ?'
        ).bind(keyRecord.id, today).first();
        const used = usage?.count || 0;
        if (used >= limit) return corsResponse(JSON.stringify({ error: 'Daily rate limit exceeded' }), 429);
        const tool = url.pathname.split('/').pop();
        const body = await request.json().catch(() => ({}));
        const targetUrl = body.url;
        if (!targetUrl) return corsResponse(JSON.stringify({ error: 'Missing url in request body' }), 400);
        const toolMap = {
          'seo-intent': runSeoIntent, 'seo-ux': runSeoUx, 'local-seo': runLocalSeo, 'product-seo': runProductSeo,
          'entity': runEntityExtractor, 'topical': runTopicalAuthority, 'schema-generator': runSchemaGenerator,
          'ai-search': runAiSearch, 'ai-voice': runAiVoice, 'ai-audit': runAiAudit, 'quit-risk': runQuitRisk,
          'keyword-research': runKeywordResearch, 'keyword-placement': runKeywordPlacement,
        };
        const auditFn = toolMap[tool];
        if (!auditFn) return corsResponse(JSON.stringify({ error: 'Unknown tool' }), 400);
        try {
          const result = await auditFn(targetUrl, body);
          await env.MY_BINDING.prepare('INSERT INTO api_usage (api_key_id, endpoint, response_status) VALUES (?, ?, ?)').bind(keyRecord.id, url.pathname, 200).run();
          const webhooks = await env.MY_BINDING.prepare(
            'SELECT url FROM webhooks WHERE user_id = ? AND events LIKE ?'
          ).bind(keyRecord.user_id, '%audit.completed%').all();
          for (const wh of webhooks.results) {
            fetch(wh.url, {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ event: 'audit.completed', tool, url: targetUrl, result, timestamp: new Date().toISOString() })
            }).catch(() => {});
          }
          return corsResponse(JSON.stringify({ success: true, data: result }));
        } catch (err) {
          await env.MY_BINDING.prepare('INSERT INTO api_usage (api_key_id, endpoint, response_status) VALUES (?, ?, ?)').bind(keyRecord.id, url.pathname, 500).run();
          return corsResponse(JSON.stringify({ error: err.message }), 500);
        }
      }

      if (url.pathname === '/api/ga4/realtime' && method === 'GET') {
        const auth = request.headers.get('Authorization');
        if (!auth || !auth.startsWith('Bearer ')) return corsResponse(JSON.stringify({ error: 'Unauthorized' }), 401);
        const token = auth.split(' ')[1];
        let decoded;
        try { decoded = await verifyJWT(token, env.JWT_SECRET); } catch { return corsResponse(JSON.stringify({ error: 'Invalid token' }), 401); }
        const user = await env.MY_BINDING.prepare('SELECT tier, ga4_property_id FROM users WHERE id = ?').bind(decoded.id).first();
        if (!user || !user.ga4_property_id) return corsResponse(JSON.stringify({ error: 'GA4 not connected' }), 400);
        const tier = user.tier || 'free';
        if (tier === 'free') return corsResponse(JSON.stringify({ error: 'Realtime requires Pro or Enterprise' }), 403);
        const type = url.searchParams.get('type') || 'overview';
        try {
          const ga4Data = await env.MY_BINDING.prepare('SELECT refresh_token, property_id FROM user_ga4 WHERE user_id = ?').bind(decoded.id).first();
          if (!ga4Data || !ga4Data.property_id) return corsResponse(JSON.stringify({ error: 'GA4 not connected' }), 400);
          const refreshToken = decrypt(ga4Data.refresh_token);
          const accessToken = await refreshAccessToken(refreshToken, env);
          const data = await fetchGA4Realtime(accessToken, ga4Data.property_id, type);
          return corsResponse(JSON.stringify(data));
        } catch (err) { return corsResponse(JSON.stringify({ error: err.message }), 500); }
      }

      if (url.pathname === '/api/webhooks' && method === 'GET') {
        const auth = request.headers.get('Authorization');
        if (!auth || !auth.startsWith('Bearer ')) return corsResponse(JSON.stringify({ error: 'Unauthorized' }), 401);
        const token = auth.split(' ')[1];
        let decoded;
        try { decoded = await verifyJWT(token, env.JWT_SECRET); } catch { return corsResponse(JSON.stringify({ error: 'Invalid token' }), 401); }
        const rows = await env.MY_BINDING.prepare(
          'SELECT id, url, events, created_at FROM webhooks WHERE user_id = ? ORDER BY created_at DESC'
        ).bind(decoded.id).all();
        const webhooks = rows.results.map(w => ({ ...w, events: JSON.parse(w.events || '[]') }));
        return corsResponse(JSON.stringify({ webhooks }));
      }

      if (url.pathname === '/api/webhooks' && method === 'POST') {
        const auth = request.headers.get('Authorization');
        if (!auth || !auth.startsWith('Bearer ')) return corsResponse(JSON.stringify({ error: 'Unauthorized' }), 401);
        const token = auth.split(' ')[1];
        let decoded;
        try { decoded = await verifyJWT(token, env.JWT_SECRET); } catch { return corsResponse(JSON.stringify({ error: 'Invalid token' }), 401); }
        const { url: webhookUrl, events } = await request.json().catch(() => ({}));
        if (!webhookUrl || !events || !Array.isArray(events)) return corsResponse(JSON.stringify({ error: 'url and events array required' }), 400);
        const eventsJson = JSON.stringify(events);
        const result = await env.MY_BINDING.prepare(
          'INSERT INTO webhooks (user_id, url, events) VALUES (?, ?, ?) RETURNING id'
        ).bind(decoded.id, webhookUrl, eventsJson).first();
        return corsResponse(JSON.stringify({ id: result.id, success: true }));
      }

      if (url.pathname.startsWith('/api/webhooks/') && method === 'DELETE') {
        const auth = request.headers.get('Authorization');
        if (!auth || !auth.startsWith('Bearer ')) return corsResponse(JSON.stringify({ error: 'Unauthorized' }), 401);
        const token = auth.split(' ')[1];
        let decoded;
        try { decoded = await verifyJWT(token, env.JWT_SECRET); } catch { return corsResponse(JSON.stringify({ error: 'Invalid token' }), 401); }
        const id = parseInt(url.pathname.split('/').pop());
        if (isNaN(id)) return corsResponse(JSON.stringify({ error: 'Invalid ID' }), 400);
        const webhook = await env.MY_BINDING.prepare('SELECT user_id FROM webhooks WHERE id = ?').bind(id).first();
        if (!webhook) return corsResponse(JSON.stringify({ error: 'Webhook not found' }), 404);
        if (webhook.user_id !== decoded.id) return corsResponse(JSON.stringify({ error: 'Forbidden' }), 403);
        await env.MY_BINDING.prepare('DELETE FROM webhooks WHERE id = ?').bind(id).run();
        return corsResponse(JSON.stringify({ success: true }));
      }

      if (url.pathname === '/api/audit-history' && method === 'GET') {
        const auth = request.headers.get('Authorization');
        if (!auth || !auth.startsWith('Bearer ')) return corsResponse(JSON.stringify({ error: 'Unauthorized' }), 401);
        const token = auth.split(' ')[1];
        let decoded;
        try { decoded = await verifyJWT(token, env.JWT_SECRET); } catch { return corsResponse(JSON.stringify({ error: 'Invalid token' }), 401); }
        const userId = decoded.id;
        const rows = await env.MY_BINDING.prepare(
          'SELECT id, url, tool_name, score, timestamp FROM audit_history WHERE user_id = ? ORDER BY timestamp DESC'
        ).bind(userId).all();
        return corsResponse(JSON.stringify({ audits: rows.results }));
      }

      if (url.pathname === '/api/audit-history' && method === 'POST') {
        const auth = request.headers.get('Authorization');
        if (!auth || !auth.startsWith('Bearer ')) return corsResponse(JSON.stringify({ error: 'Unauthorized' }), 401);
        const token = auth.split(' ')[1];
        let decoded;
        try { decoded = await verifyJWT(token, env.JWT_SECRET); } catch { return corsResponse(JSON.stringify({ error: 'Invalid token' }), 401); }
        const userId = decoded.id;
        const body = await request.json().catch(() => ({}));
        const { url: auditUrl, tool_name, score } = body;
        if (!auditUrl || !tool_name) return corsResponse(JSON.stringify({ error: 'url and tool_name required' }), 400);
        const user = await env.MY_BINDING.prepare('SELECT tier FROM users WHERE id = ?').bind(userId).first();
        const tier = user?.tier || 'free';
        const limit = getTierLimit(tier);
        const countResult = await env.MY_BINDING.prepare('SELECT COUNT(*) as count FROM audit_history WHERE user_id = ?').bind(userId).first();
        const currentCount = countResult?.count || 0;
        const now = Math.floor(Date.now() / 1000);
        if (currentCount >= limit) {
          await env.MY_BINDING.prepare(
            'DELETE FROM audit_history WHERE user_id = ? AND id = (SELECT id FROM audit_history WHERE user_id = ? ORDER BY timestamp ASC LIMIT 1)'
          ).bind(userId, userId).run();
        }

        const prevAudit = await env.MY_BINDING.prepare(
          'SELECT score FROM audit_history WHERE user_id = ? AND url = ? AND tool_name = ? AND score IS NOT NULL ORDER BY timestamp DESC LIMIT 1'
        ).bind(userId, auditUrl, tool_name).first();
        const newScore = (score !== undefined && score !== null) ? parseInt(score, 10) : null;
        if (prevAudit && newScore !== null && prevAudit.score !== null && newScore > prevAudit.score) {
          const toolPath = TOOL_PATHS[tool_name] || '/';
          const rerunLink = toolPath + '?url=' + encodeURIComponent(auditUrl);
          await logActivity(env, userId, 'score_up', {
            tool: tool_name,
            targetLabel: `${prevAudit.score} → ${newScore}`,
            link: rerunLink
          });
        }

        const result = await env.MY_BINDING.prepare(
          'INSERT INTO audit_history (user_id, url, tool_name, score, timestamp) VALUES (?, ?, ?, ?, ?) RETURNING id'
        ).bind(userId, auditUrl, tool_name, newScore, now).first();
        return corsResponse(JSON.stringify({ id: result.id }));
      }

      if (url.pathname.startsWith('/api/audit-history/') && method === 'DELETE') {
        const auth = request.headers.get('Authorization');
        if (!auth || !auth.startsWith('Bearer ')) return corsResponse(JSON.stringify({ error: 'Unauthorized' }), 401);
        const token = auth.split(' ')[1];
        let decoded;
        try { decoded = await verifyJWT(token, env.JWT_SECRET); } catch { return corsResponse(JSON.stringify({ error: 'Invalid token' }), 401); }
        const userId = decoded.id;
        const id = url.pathname.split('/').pop();
        if (!id || isNaN(id)) return corsResponse(JSON.stringify({ error: 'Invalid id' }), 400);
        const audit = await env.MY_BINDING.prepare('SELECT user_id FROM audit_history WHERE id = ?').bind(parseInt(id)).first();
        if (!audit) return corsResponse(JSON.stringify({ error: 'Audit not found' }), 404);
        if (audit.user_id !== userId) return corsResponse(JSON.stringify({ error: 'Forbidden' }), 403);
        await env.MY_BINDING.prepare('DELETE FROM audit_history WHERE id = ?').bind(parseInt(id)).run();
        return corsResponse(JSON.stringify({ success: true }));
      }

      if (url.pathname === '/api/gsc/auth-url' && method === 'GET') {
        const auth = request.headers.get('Authorization');
        if (!auth || !auth.startsWith('Bearer ')) return corsResponse(JSON.stringify({ error: 'Unauthorized' }), 401);
        let decoded;
        try { decoded = await verifyJWT(auth.split(' ')[1], env.JWT_SECRET); } catch { return corsResponse(JSON.stringify({ error: 'Invalid token' }), 401); }
        const state = await generateOAuthState(decoded.id, 'gsc', env.JWT_SECRET);
        const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
        authUrl.searchParams.set('client_id', env.GOOGLE_CLIENT_ID);
        authUrl.searchParams.set('redirect_uri', 'https://traffic-torch-auth.traffictorch.workers.dev/api/gsc/callback');
        authUrl.searchParams.set('response_type', 'code');
        authUrl.searchParams.set('scope', 'https://www.googleapis.com/auth/webmasters.readonly');
        authUrl.searchParams.set('access_type', 'offline');
        authUrl.searchParams.set('prompt', 'consent');
        authUrl.searchParams.set('state', state);
        return corsResponse(JSON.stringify({ authUrl: authUrl.toString() }));
      }

      if (url.pathname === '/api/gsc/callback' && method === 'GET') {
        const code = url.searchParams.get('code');
        const state = url.searchParams.get('state');
        const error = url.searchParams.get('error');
        if (error) return new Response(`Authorization failed: ${error}`, { status: 400 });
        if (!code) return new Response('Missing authorization code', { status: 400 });
        if (!state) return new Response('Missing state parameter', { status: 400 });
        const statePayload = await verifyOAuthState(state, 'gsc', env.JWT_SECRET);
        if (!statePayload) return new Response('Invalid or expired state parameter', { status: 400 });
        return Response.redirect(`https://traffictorch.net/dashboard/?gsc_code=${encodeURIComponent(code)}&state=${encodeURIComponent(state)}`, 302);
      }

      if (url.pathname === '/api/gsc/connect' && method === 'POST') {
        const auth = request.headers.get('Authorization');
        if (!auth || !auth.startsWith('Bearer ')) return corsResponse(JSON.stringify({ error: 'Unauthorized' }), 401);
        const token = auth.split(' ')[1];
        let decoded;
        try { decoded = await verifyJWT(token, env.JWT_SECRET); } catch { return corsResponse(JSON.stringify({ error: 'Invalid token' }), 401); }
        const { code, siteUrl, state } = await request.json().catch(() => ({}));
        if (!code) return corsResponse(JSON.stringify({ error: 'Authorization code required' }), 400);
        if (!siteUrl) return corsResponse(JSON.stringify({ error: 'Site URL required (e.g., sc-domain:example.com)' }), 400);
        const statePayload = await verifyOAuthState(state, 'gsc', env.JWT_SECRET);
        if (!statePayload) return corsResponse(JSON.stringify({ error: 'Invalid or expired state parameter' }), 400);
        if (statePayload.uid !== decoded.id) return corsResponse(JSON.stringify({ error: 'State user mismatch' }), 403);
        try {
          const tokens = await exchangeCodeForTokensGSC(code, env);
          const encryptedRefresh = encrypt(tokens.refresh_token);
          await env.MY_BINDING.prepare('INSERT OR REPLACE INTO user_gsc (user_id, refresh_token, site_url) VALUES (?, ?, ?)').bind(decoded.id, encryptedRefresh, siteUrl).run();
          return corsResponse(JSON.stringify({ success: true, message: 'GSC connected' }));
        } catch (err) { return corsResponse(JSON.stringify({ error: err.message }), 500); }
      }

      if (url.pathname === '/api/gsc/disconnect' && method === 'POST') {
        const auth = request.headers.get('Authorization');
        if (!auth || !auth.startsWith('Bearer ')) return corsResponse(JSON.stringify({ error: 'Unauthorized' }), 401);
        const token = auth.split(' ')[1];
        let decoded;
        try { decoded = await verifyJWT(token, env.JWT_SECRET); } catch { return corsResponse(JSON.stringify({ error: 'Invalid token' }), 401); }
        await env.MY_BINDING.prepare('DELETE FROM user_gsc WHERE user_id = ?').bind(decoded.id).run();
        await env.MY_BINDING.prepare('DELETE FROM gsc_cache WHERE user_id = ?').bind(decoded.id).run();
        return corsResponse(JSON.stringify({ success: true, message: 'GSC disconnected' }));
      }

      if (url.pathname === '/api/gsc/cached-report' && method === 'GET') {
        const auth = request.headers.get('Authorization');
        if (!auth || !auth.startsWith('Bearer ')) return corsResponse(JSON.stringify({ error: 'Unauthorized' }), 401);
        const token = auth.split(' ')[1];
        let decoded;
        try { decoded = await verifyJWT(token, env.JWT_SECRET); } catch { return corsResponse(JSON.stringify({ error: 'Invalid token' }), 401); }
        const reportType = url.searchParams.get('type') || 'overview';
        let startDate = url.searchParams.get('start_date');
        let endDate = url.searchParams.get('end_date');
        let limit = parseInt(url.searchParams.get('limit')) || 10;
        if (!startDate || !endDate) {
          const end = new Date(); end.setDate(end.getDate() - 1);
          const start = new Date(); start.setDate(start.getDate() - 7);
          endDate = end.toISOString().split('T')[0];
          startDate = start.toISOString().split('T')[0];
        }
        const user = await env.MY_BINDING.prepare('SELECT tier FROM users WHERE id = ?').bind(decoded.id).first();
        if (!user) return corsResponse(JSON.stringify({ error: 'User not found' }), 404);
        const tier = user.tier || 'free';
        let maxDays = 7, maxLimit = 5;
        if (tier === 'pro') { maxDays = 28; maxLimit = 10; }
        else if (tier === 'enterprise') { maxDays = 365; maxLimit = 50; }
        const start = new Date(startDate);
        const end = new Date(endDate);
        const diffDays = Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1;
        if (diffDays > maxDays) return corsResponse(JSON.stringify({ error: `Date range exceeds your tier limit (max ${maxDays} days)` }), 403);
        if (limit > maxLimit) limit = maxLimit;
        if (reportType === 'overview') limit = Math.min(diffDays, 100);
        const cached = await getCachedGSCReport(decoded.id, reportType, startDate, endDate, env);
        if (cached) return corsResponse(JSON.stringify({ cached: true, type: reportType, startDate, endDate, data: cached, cachedAt: new Date().toISOString() }));
        try {
          const gscData = await env.MY_BINDING.prepare('SELECT refresh_token, site_url FROM user_gsc WHERE user_id = ?').bind(decoded.id).first();
          if (!gscData || !gscData.site_url) return corsResponse(JSON.stringify({ error: 'GSC not connected' }), 400);
          const refreshToken = decrypt(gscData.refresh_token);
          let accessToken;
          try { accessToken = await refreshAccessToken(refreshToken, env); }
          catch (err) {
            await env.MY_BINDING.prepare('DELETE FROM user_gsc WHERE user_id = ?').bind(decoded.id).run();
            await env.MY_BINDING.prepare('DELETE FROM gsc_cache WHERE user_id = ?').bind(decoded.id).run();
            return corsResponse(JSON.stringify({ error: 'GSC session expired. Please reconnect.', needsReconnect: true }), 401);
          }
          let dimensions;
          switch (reportType) {
            case 'overview': dimensions = ['date']; break;
            case 'queries': dimensions = ['query']; break;
            case 'pages': dimensions = ['page']; break;
            case 'countries': dimensions = ['country']; break;
            case 'devices': dimensions = ['device']; break;
            default: dimensions = ['date'];
          }
          const data = await fetchGSCReport(accessToken, gscData.site_url, dimensions, startDate, endDate, limit);
          const rows = data.rows || [];
          const transformed = rows.map(row => ({
            keys: row.keys || [], clicks: row.clicks || 0, impressions: row.impressions || 0,
            ctr: row.ctr || 0, position: row.position || 0
          }));
          await setCachedGSCReport(decoded.id, reportType, startDate, endDate, transformed, env);
          return corsResponse(JSON.stringify({ cached: false, type: reportType, startDate, endDate, data: transformed, cachedAt: new Date().toISOString() }));
        } catch (err) {
          return corsResponse(JSON.stringify({ error: err.message, stack: err.stack, type: reportType, startDate, endDate }), 500);
        }
      }

      if (url.pathname === '/api/user' && method === 'DELETE') {
        const auth = request.headers.get('Authorization');
        if (!auth || !auth.startsWith('Bearer ')) return corsResponse(JSON.stringify({ error: 'Unauthorized' }), 401);
        const token = auth.split(' ')[1];
        let decoded;
        try { decoded = await verifyJWT(token, env.JWT_SECRET); } catch { return corsResponse(JSON.stringify({ error: 'Invalid token' }), 401); }
        const userId = decoded.id;
        const user = await env.MY_BINDING.prepare('SELECT id FROM users WHERE id = ?').bind(userId).first();
        if (!user) return corsResponse(JSON.stringify({ error: 'User not found' }), 404);
        await env.MY_BINDING.prepare('DELETE FROM user_ga4 WHERE user_id = ?').bind(userId).run();
        await env.MY_BINDING.prepare('DELETE FROM user_gsc WHERE user_id = ?').bind(userId).run();
        await env.MY_BINDING.prepare('DELETE FROM ga4_cache WHERE user_id = ?').bind(userId).run();
        await env.MY_BINDING.prepare('DELETE FROM gsc_cache WHERE user_id = ?').bind(userId).run();
        await env.MY_BINDING.prepare('DELETE FROM audit_history WHERE user_id = ?').bind(userId).run();
        await env.MY_BINDING.prepare('DELETE FROM password_reset_tokens WHERE user_id = ?').bind(userId).run();
        await env.MY_BINDING.prepare('DELETE FROM magic_links WHERE email IN (SELECT email FROM users WHERE id = ?)').bind(userId).run();
        await env.MY_BINDING.prepare('DELETE FROM usage_logs WHERE user_id = ?').bind(userId).run();
        await env.MY_BINDING.prepare('DELETE FROM posts WHERE user_id = ?').bind(userId).run();
        await env.MY_BINDING.prepare('DELETE FROM comments WHERE user_id = ?').bind(userId).run();
        await env.MY_BINDING.prepare('DELETE FROM network WHERE user_id = ? OR network_user_id = ?').bind(userId, userId).run();
        await env.MY_BINDING.prepare('DELETE FROM blocks WHERE user_id = ? OR blocked_user_id = ?').bind(userId, userId).run();
        await env.MY_BINDING.prepare('DELETE FROM contributions WHERE user_id = ?').bind(userId).run();
        await env.MY_BINDING.prepare('DELETE FROM notifications WHERE user_id = ? OR actor_id = ?').bind(userId, userId).run();
        await env.MY_BINDING.prepare('DELETE FROM user_points WHERE user_id = ?').bind(userId).run();
        await env.MY_BINDING.prepare('DELETE FROM users WHERE id = ?').bind(userId).run();
        return corsResponse(JSON.stringify({ success: true, message: 'Account permanently deleted' }));
      }

      if (url.pathname === '/api/contact' && method === 'POST') {
        const formData = await request.formData();
        const name = formData.get('name') || 'Anonymous';
        const email = formData.get('email') || 'support@traffictorch.net';
        const message = formData.get('message') || 'No message';
        const subject = message.split('\n')[0].replace('Subject: ', '') || 'Feedback from Traffic Torch';
        const resendRes = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${env.RESEND_API_KEY}` },
          body: JSON.stringify({
            from: 'support@traffictorch.net', to: 'support@traffictorch.net', reply_to: email, subject,
            html: `<p><strong>Name:</strong> ${name}</p><p><strong>Email:</strong> ${email}</p><p><strong>Message:</strong><br>${message.replace(/Subject: .+\n/, '')}</p>`
          })
        });
        if (!resendRes.ok) return corsResponse(JSON.stringify({ success: false, error: await resendRes.text() }), 500);
        return corsResponse(JSON.stringify({ success: true }));
      }
      
      if (url.pathname.startsWith('/api/messages/')) {
        return await handleMessageRoutes(request, env, url, { verifyJWT, signJWT, createNotification, getUserFromToken });
      }
      if (url.pathname === '/api/internal/cleanup-messages') {
        return handleCleanupMessages(request, env);
      }

      return corsResponse('Not found', 404);
    } catch (err) {
      console.error(err);
      return corsResponse(JSON.stringify({ error: 'Internal server error' }), 500);
    }
  }
};

async function runSeoIntent(url, params) { return { tool: 'seo-intent', url, score: 85, summary: 'Stub' }; }
async function runSeoUx(url, params) { return { tool: 'seo-ux', url, score: 80, summary: 'Stub' }; }
async function runLocalSeo(url, params) { return { tool: 'local-seo', url, score: 75, summary: 'Stub' }; }
async function runProductSeo(url, params) { return { tool: 'product-seo', url, score: 70, summary: 'Stub' }; }
async function runEntityExtractor(url, params) { return { tool: 'entity', url, entities: ['Stub'], summary: 'Stub' }; }
async function runTopicalAuthority(url, params) { return { tool: 'topical', url, score: 82, summary: 'Stub' }; }
async function runSchemaGenerator(url, params) { return { tool: 'schema-generator', url, schema: {}, summary: 'Stub' }; }
async function runAiSearch(url, params) { return { tool: 'ai-search', url, score: 78, summary: 'Stub' }; }
async function runAiVoice(url, params) { return { tool: 'ai-voice', url, score: 72, summary: 'Stub' }; }
async function runAiAudit(url, params) { return { tool: 'ai-audit', url, issues: [], summary: 'Stub' }; }
async function runQuitRisk(url, params) { return { tool: 'quit-risk', url, risk: 'low', summary: 'Stub' }; }
async function runKeywordResearch(url, params) { return { tool: 'keyword-research', url, keywords: ['stub'], summary: 'Stub' }; }
async function runKeywordPlacement(url, params) { return { tool: 'keyword-placement', url, placements: [], summary: 'Stub' }; }