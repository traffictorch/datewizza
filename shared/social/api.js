// shared/social/api.js
// Single source of truth for the API base + auth-token injection.
// No side effects, no DOM access. Every module that hits the API goes through here.

export const API_BASE = 'https://datewizza-auth.traffictorch.workers.dev';

export function getToken() {
  try { return localStorage.getItem('authToken') || ''; } catch { return ''; }
}

export function isLoggedIn() {
  return !!getToken();
}

export function authHeaders() {
  const t = getToken();
  return t ? { Authorization: 'Bearer ' + t } : {};
}

/**
 * Fetch JSON from the API. Throws on non-2xx with a useful message.
 * @param {string} path  e.g. '/api/feed?limit=20' or full URL
 * @param {RequestInit} [opts]
 * @returns {Promise<any>}
 */
export async function apiFetch(path, opts = {}) {
  const url = /^https?:\/\//.test(path) ? path : API_BASE + path;
  const headers = { ...authHeaders(), ...(opts.headers || {}) };
  const res = await fetch(url, { ...opts, headers });
  if (!res.ok) {
    let detail = '';
    try { detail = JSON.stringify(await res.clone().json()); } catch { /* not JSON */ }
    const err = new Error(`API ${res.status} ${res.statusText}${detail ? ' — ' + detail : ''}`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

/** POST JSON helper. */
export function apiPost(path, body) {
  return apiFetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
}

/** PATCH JSON helper. */
export function apiPatch(path, body) {
  return apiFetch(path, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
}

/** DELETE helper. */
export function apiDelete(path) {
  return apiFetch(path, { method: 'DELETE' });
}
