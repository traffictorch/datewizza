import { jsonHeaders } from '../lib/cache.js';

export async function handlePurge(request, env) {
  if (request.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }
  const auth = request.headers.get('Authorization') || '';
  const token = auth.replace('Bearer ', '').trim();
  if (!env.PURGE_SECRET || token !== env.PURGE_SECRET) {
    return new Response('Unauthorized', { status: 401 });
  }

  let body;
  try { body = await request.json(); } catch {
    return new Response('Invalid JSON', { status: 400, headers: jsonHeaders('no-store') });
  }

  const paths = Array.isArray(body.paths) ? body.paths.slice(0, 50) : [];
  const origin = env.SITE_ORIGIN || 'https://datewizza.com';
  let purged = 0;

  for (const p of paths) {
    if (typeof p !== 'string' || !p.startsWith('/')) continue;
    try {
      const url = `${origin}${p}`;
      const deleted = await caches.default.delete(new Request(url, { method: 'GET' }));
      if (deleted) purged++;
    } catch (err) {
      console.error('purge failed for', p, err.message);
    }
  }

  return new Response(JSON.stringify({ ok: true, purged, total: paths.length }), {
    headers: jsonHeaders('no-store'),
  });
}
