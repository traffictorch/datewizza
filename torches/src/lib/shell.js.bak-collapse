// Fetch the Vite-built HTML shell from origin, cache in memory per-isolate.
// Shell is /profile.html for now; other pages will add their own shells.

const SHELL_CACHE = new Map();
const SHELL_TTL_MS = 5 * 60 * 1000; // 5 min

export async function getShell(env, path) {
  const key = path;
  const cached = SHELL_CACHE.get(key);
  if (cached && Date.now() - cached.time < SHELL_TTL_MS) return cached.text;

  const url = `${env.SITE_ORIGIN}${path}?shell=1`;
  const res = await fetch(url, {
    headers: { 'User-Agent': 'TrafficTorch-Render/1.0' },
    cf: { cacheTtl: 300, cacheEverything: true },
  });
  if (!res.ok) throw new Error(`Shell fetch failed: ${res.status} ${url}`);
  const text = await res.text();
  SHELL_CACHE.set(key, { text, time: Date.now() });
  return text;
}
