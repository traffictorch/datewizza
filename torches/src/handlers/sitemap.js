import { fetchSitemapData } from '../lib/api.js';
import { xmlHeaders, CACHE } from '../lib/cache.js';
import { xmlEscape } from '../lib/escape.js';

const SITE = 'https://datewizza.com';

function isoDate(ms) {
  const d = new Date(typeof ms === 'number' && ms < 1e10 ? ms * 1000 : ms);
  if (isNaN(d.getTime())) return new Date().toISOString().slice(0, 10);
  return d.toISOString().slice(0, 10);
}

function urlEntry({ loc, lastmod, changefreq, priority }) {
  const parts = [`  <url>`, `    <loc>${xmlEscape(SITE + loc)}</loc>`];
  if (lastmod) parts.push(`    <lastmod>${lastmod}</lastmod>`);
  if (changefreq) parts.push(`    <changefreq>${changefreq}</changefreq>`);
  if (priority) parts.push(`    <priority>${priority}</priority>`);
  parts.push(`  </url>`);
  return parts.join('\n');
}

function wrapUrlset(entries) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries.join('\n')}
</urlset>`;
}

export async function handleSitemapIndex(request, env) {
  const today = new Date().toISOString().slice(0, 10);
  const body = `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <sitemap>
    <loc>${SITE}/sitemap-static.xml</loc>
    <lastmod>${today}</lastmod>
  </sitemap>
  <sitemap>
    <loc>${SITE}/sitemap-profiles.xml</loc>
    <lastmod>${today}</lastmod>
  </sitemap>
  <sitemap>
    <loc>${SITE}/sitemap-torches.xml</loc>
    <lastmod>${today}</lastmod>
  </sitemap>
</sitemapindex>`;
  return new Response(body, { headers: xmlHeaders(CACHE.sitemap) });
}

export async function handleSitemap(request, env, type) {
  let entries = [];
  try {
    const data = await fetchSitemapData(env, type);
    const rows = data.rows || [];

    if (type === 'static') {
      entries = rows.map(r => urlEntry({
        loc: r.loc,
        lastmod: new Date().toISOString().slice(0, 10),
        changefreq: 'weekly',
        priority: r.priority || '0.5',
      }));
    } else if (type === 'profiles') {
      entries = rows.map(r => urlEntry({
        loc: `/torcher/${r.username}/`,
        lastmod: isoDate(r.last_torch || r.created_at),
        changefreq: 'weekly',
        priority: '0.6',
      }));
    } else if (type === 'torches') {
      entries = rows.map(r => urlEntry({
        loc: `/torch/${r.id}/`,
        lastmod: isoDate(r.created_at),
        changefreq: 'monthly',
        priority: '0.7',
      }));
    }
  } catch (err) {
    console.error(`sitemap ${type} failed:`, err.message);
  }

  return new Response(wrapUrlset(entries), { headers: xmlHeaders(CACHE.sitemap) });
}
