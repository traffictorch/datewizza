import { fetchFeed } from '../lib/api.js';
import { getShell } from '../lib/shell.js';
import { renderHeadTags } from '../lib/meta.js';
import { jsonLdScript } from '../lib/jsonld.js';
import { htmlHeaders, CACHE } from '../lib/cache.js';
import { htmlEscape } from '../lib/escape.js';
import { toolDisplay, TOOL_PATH } from '../lib/tools.js';

const SITE = 'https://datewizza.com';

function injectShell(html, { headTags, jsonLd }) {
  let out = html;
  out = out.replace(/<title>[^<]*<\/title>/i, '');
  out = out.replace(/<meta\s+name="description"[^>]*>/gi, '');
  out = out.replace(/<link\s+rel="canonical"[^>]*>/gi, '');
  out = out.replace(/<meta\s+name="robots"[^>]*>/gi, '');
  const block = `\n${headTags}\n${jsonLd}\n</head>`;
  return out.includes('</head>') ? out.replace('</head>', block) : out;
}

function buildMeta(tool, toolLabel) {
  const canonical = `${SITE}/tools/${tool}/torches/`;
  return {
    title: `${toolLabel} Torches — Community Audit Scores · DateWizza`,
    description: `Every ${toolLabel} audit shared by the DateWizza community, ranked newest first. Real scores, real sites, opt-in.`,
    canonical,
    ogImage: `${SITE}/images/traffic-torch-toolkit.webp`,
  };
}

function buildJsonLd(tool, toolLabel, posts) {
  const url = `${SITE}/tools/${tool}/torches/`;
  const items = (posts || []).slice(0, 20).map((p, i) => ({
    '@type': 'ListItem',
    position: i + 1,
    url: `${SITE}/torch/${p.id}/`,
    name: (p.page_title && p.page_title.trim()) || `Torch #${p.id}`,
  }));
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'CollectionPage',
        '@id': url,
        url,
        name: `${toolLabel} Torches`,
        description: `Community-shared ${toolLabel} audits ranked by newest first.`,
        isPartOf: { '@type': 'WebSite', url: SITE },
        mainEntity: { '@type': 'ItemList', itemListElement: items },
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Home', item: SITE + '/' },
          { '@type': 'ListItem', position: 2, name: 'Tools', item: `${SITE}/tools/` },
          { '@type': 'ListItem', position: 3, name: toolLabel, item: `${SITE}${TOOL_PATH[tool] || '/'}` },
          { '@type': 'ListItem', position: 4, name: 'Torches', item: url },
        ],
      },
    ],
  };
}

function renderCard(post) {
  const score = Number(post.score) || 0;
  const color = score >= 80 ? '#22c55e' : score >= 60 ? '#eab308' : '#ef4444';
  const domain = post.domain_mode === 'hidden'
    ? (post.domain_label || 'Hidden')
    : (post.url ? new URL(post.url).hostname.replace(/^www\./, '') : '');
  const title = (post.page_title && post.page_title.trim()) || (post.tool || 'Audit');
  const date = new Date(post.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  const displayName = post.display_name || post.username;

  return `<article class="glass rounded-2xl overflow-hidden border-l-4" style="border-left-color:${color}">
    <div class="p-4 pb-3">
      <div class="flex items-start gap-4">
        <div class="text-center flex-shrink-0" style="min-width:64px;">
          <p class="text-3xl font-black leading-none" style="color:${color}">${score}</p>
          <p class="text-[11px] font-bold text-gray-400 mt-1">/100</p>
        </div>
        <div class="flex-1 min-w-0">
          <h3 class="font-bold text-base leading-snug mb-1.5">
            <a href="/torch/${post.id}/" class="hover:text-orange-500 underline decoration-1 underline-offset-2">${htmlEscape(title)}</a>
          </h3>
          <p class="text-xs text-gray-500">
            ${htmlEscape(domain)}
            · by <a href="/torcher/${htmlEscape(post.username || '')}/" class="font-medium text-gray-600 dark:text-gray-400 hover:text-orange-500">${htmlEscape(displayName || '')}</a>
            · <span>${date}</span>
          </p>
          ${post.note && post.note !== post.page_title ? `<p class="text-sm leading-relaxed whitespace-pre-wrap mt-2 text-gray-700 dark:text-gray-300">${htmlEscape(post.note)}</p>` : ''}
        </div>
        <img src="${htmlEscape((post.avatar_url) || "/images/avatars/" + (post.avatar_preset || "owner") + ".svg")}" alt="" width="40" height="40" style="width:40px;height:40px;" class="rounded-full flex-shrink-0 object-cover">
      </div>
    </div>
  </article>`;
}

function buildSsrBlock(tool, toolLabel, posts) {
  const cards = posts.map(renderCard).join('\n');
  const empty = `<div class="glass rounded-2xl p-10 text-center">
    <p class="text-4xl mb-3">📭</p>
    <p class="text-gray-500">No ${htmlEscape(toolLabel)} torches yet — be the first.</p>
    <p class="text-sm text-gray-400 mt-2"><a href="${TOOL_PATH[tool] || '/'}" class="text-orange-500 hover:underline">Run the ${htmlEscape(toolLabel)} audit →</a></p>
  </div>`;

  return `<main class="container mx-auto px-4 py-8 flex-1 max-w-3xl" data-ssr="tool-feed">
  <nav aria-label="breadcrumb" class="text-sm text-gray-500 mb-4">
    <a href="/" class="hover:underline">Home</a> ›
    <a href="/community/" class="hover:underline">Community</a> ›
    <span>${htmlEscape(toolLabel)} Torches</span>
  </nav>
  <header class="mb-6">
    <h1 class="text-3xl font-black mb-2">${htmlEscape(toolLabel)} Torches</h1>
    <p class="text-gray-600 dark:text-gray-400">Every ${htmlEscape(toolLabel)} audit shared by the DateWizza community, newest first.</p>
    <p class="text-sm text-gray-500 mt-2"><a href="${TOOL_PATH[tool] || '/'}" class="text-orange-500 hover:underline">Run the ${htmlEscape(toolLabel)} audit yourself →</a></p>
  </header>
  <div class="space-y-4">
    ${posts.length ? cards : empty}
  </div>
  <div class="mt-8 text-center text-xs text-gray-500">
    <a href="/torches/feed.xml" class="hover:underline">RSS feed</a>
    · <a href="/tools/${htmlEscape(tool)}/torches/feed.xml" class="hover:underline">${htmlEscape(toolLabel)}-only RSS</a>
  </div>
</main>`;
}

export async function handleToolFeed(request, env) {
  const path = new URL(request.url).pathname;
  const segments = path.split('/').filter(Boolean);
  // Expected: ["tools", "<tool>", "torches"]
  const tool = segments[1];
  if (!tool) return new Response('Not found', { status: 404 });

  const toolLabel = toolDisplay(tool);

  let posts = [];
  try {
    const data = await fetchFeed(env, { tool, limit: 30 });
    posts = data.posts || [];
  } catch (err) {
    console.error('toolFeed fetch failed:', err.message);
  }

  const meta = buildMeta(tool, toolLabel);
  const jsonLd = jsonLdScript(buildJsonLd(tool, toolLabel, posts));
  const headTags = renderHeadTags(meta, { index: true, type: 'website' });

  const shell = await getShell(env, '/community/index.html');
  let html = injectShell(shell, { headTags, jsonLd });

  // Replace the whole main block with our SSR
  const mainStart = html.indexOf('<main ');
  const mainEnd = html.indexOf('</main>');
  if (mainStart !== -1 && mainEnd !== -1) {
    html = html.slice(0, mainStart) + buildSsrBlock(tool, toolLabel, posts) + html.slice(mainEnd + '</main>'.length);
  } else {
    html = html.replace('</head>', `\n${headTags}\n${jsonLd}\n</head>`);
  }

  return new Response(html, { status: 200, headers: htmlHeaders(CACHE.toolFeed) });
}
