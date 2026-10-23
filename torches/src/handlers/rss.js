import { fetchFeed, fetchProfile } from '../lib/api.js';
import { xmlHeaders, CACHE } from '../lib/cache.js';
import { xmlEscape } from '../lib/escape.js';

const SITE = 'https://datewizza.com';
const CHANNEL_TTL = 30;

function toRfc822(ms) {
  const d = new Date(typeof ms === 'number' && ms < 1e10 ? ms * 1000 : ms);
  return isNaN(d.getTime()) ? new Date().toUTCString() : d.toUTCString();
}

function torchItem(post) {
  const title = (post.page_title && post.page_title.trim())
    || (post.domain_mode === 'hidden' ? (post.domain_label || `Torch #${post.id}`) : `Torch #${post.id}`);
  const domain = post.domain_mode === 'hidden'
    ? (post.domain_label || 'Hidden site')
    : (post.url ? new URL(post.url).hostname.replace(/^www\./, '') : '');
  const desc = `${post.score}/100 · ${domain}${post.note ? ' — ' + post.note.slice(0, 200) : ''}`;
  const url = `${SITE}/torch/${post.id}/`;
  return `    <item>
      <title>${xmlEscape(title)}</title>
      <link>${url}</link>
      <guid isPermaLink="true">${url}</guid>
      <pubDate>${toRfc822(post.created_at)}</pubDate>
      <description>${xmlEscape(desc)}</description>
      <author>noreply@datewizza.com (${xmlEscape(post.display_name || post.username || 'DateWizza')})</author>
    </item>`;
}

function wrapChannel({ title, description, link, selfLink, items }) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${xmlEscape(title)}</title>
    <link>${link}</link>
    <description>${xmlEscape(description)}</description>
    <language>en</language>
    <ttl>${CHANNEL_TTL}</ttl>
    <atom:link href="${selfLink}" rel="self" type="application/rss+xml"/>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
${items.join('\n')}
  </channel>
</rss>`;
}

export async function handleGlobalRss(request, env) {
  let posts = [];
  try {
    const data = await fetchFeed(env, { limit: 50 });
    posts = data.posts || [];
  } catch (err) {
    console.error('rss global fetch failed:', err.message);
  }

  const body = wrapChannel({
    title: 'DateWizza — Community Torches',
    description: 'Latest audit scores shared by the DateWizza community.',
    link: `${SITE}/community/`,
    selfLink: `${SITE}/torches/feed.xml`,
    items: posts.map(torchItem),
  });

  return new Response(body, { headers: xmlHeaders(CACHE.rss) });
}

export async function handleUserRss(request, env) {
  const path = new URL(request.url).pathname;
  const username = path.replace('/torcher/', '').replace('/feed.xml', '');

  let profile = null;
  let posts = [];
  try {
    const data = await fetchProfile(env, username);
    profile = data.profile;
    posts = data.posts || [];
  } catch (err) {
    return new Response('Not found', { status: 404 });
  }

  if (!profile) return new Response('Not found', { status: 404 });

  const display = profile.display_name || username;
  const pointsBit = profile.total_points ? ` · 🏅 ${profile.total_points} points` : '';
  const bioBit = profile.bio ? ` ${profile.bio}` : '';

  const body = wrapChannel({
    title: `@${username} on DateWizza`,
    description: `${display}'s shared audits${pointsBit}.${bioBit}`,
    link: `${SITE}/torcher/${username}/`,
    selfLink: `${SITE}/torcher/${username}/feed.xml`,
    items: posts.map(torchItem),
  });

  return new Response(body, { headers: xmlHeaders(CACHE.rss) });
}

export async function handleToolRss(request, env) {
  const path = new URL(request.url).pathname;
  const tool = path.split('/')[2]; // /tools/:tool/torches/feed.xml

  let posts = [];
  try {
    const data = await fetchFeed(env, { tool, limit: 50 });
    posts = data.posts || [];
  } catch (err) {
    console.error('rss tool fetch failed:', err.message);
  }

  const toolLabel = tool.replace(/-tool$/, '').replace(/-/g, ' ');

  const body = wrapChannel({
    title: `DateWizza — ${toolLabel} Torches`,
    description: `Latest ${toolLabel} audit scores shared by the DateWizza community.`,
    link: `${SITE}/tools/${tool}/torches/`,
    selfLink: `${SITE}/tools/${tool}/torches/feed.xml`,
    items: posts.map(torchItem),
  });

  return new Response(body, { headers: xmlHeaders(CACHE.rss) });
}
