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
  let text = await res.text();
  // Pre-collapse the desktop sidebar so there is no layout shift on first paint.
  // main.js will expand it again on non-public pages, so this is safe globally.
  text = text.replace(
    /(<aside id="desktopSidebar" class="hidden md:flex)/,
    '$1 collapsed'
  );
  SHELL_CACHE.set(key, { text, time: Date.now() });
  return text;
}
