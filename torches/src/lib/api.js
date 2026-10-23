// Fetch via Service Binding when available (bypasses .workers.dev zone routing),
// falls back to public fetch for local/external calls.

function bindingFetch(env, pathAndQuery, options = {}) {
  if (env.AUTH && typeof env.AUTH.fetch === 'function') {
    // Service binding fetch: URL host is ignored, only path matters
    const u = new URL(env.AUTH_API);
    const req = new Request(`https://${u.hostname}${pathAndQuery}`, options);
    return env.AUTH.fetch(req);
  }
  return fetch(`${env.AUTH_API}${pathAndQuery}`, options);
}

async function fetchJson(env, pathAndQuery, options = {}) {
  const res = await bindingFetch(env, pathAndQuery, {
    ...options,
    headers: {
      'User-Agent': 'TrafficTorch-Render/1.0 (+https://datewizza.com)',
      'Accept': 'application/json',
      ...(options.headers || {}),
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw Object.assign(new Error(`API ${res.status}: ${text.slice(0, 200)}`), { status: res.status });
  }
  return res.json();
}

export async function fetchProfile(env, username) {
  return fetchJson(env, `/api/torcher/${encodeURIComponent(username)}`);
}

export async function fetchTorch(env, id) {
  return fetchJson(env, `/api/torch/${id}`);
}

export async function fetchFeed(env, { tool, cursor, limit } = {}) {
  const p = new URLSearchParams();
  if (tool) p.set('tool', tool);
  if (cursor) p.set('cursor', cursor);
  p.set('limit', String(limit || 20));
  return fetchJson(env, `/api/feed?${p.toString()}`);
}

export async function fetchSitemapData(env, type) {
  return fetchJson(env, `/api/sitemap/${type}`);
}

export async function fetchUserPoints(env, username) {
  try {
    const data = await fetchProfile(env, username);
    return data?.profile?.total_points ?? 0;
  } catch { return 0; }
}
