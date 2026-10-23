import { fetchFeed } from '../lib/api.js';
import { getShell } from '../lib/shell.js';
import { buildCommunityMeta, renderHeadTags } from '../lib/meta.js';
import { communityJsonLd, jsonLdScript } from '../lib/jsonld.js';
import { htmlHeaders, CACHE } from '../lib/cache.js';
import { htmlEscape } from '../lib/escape.js';

function injectShell(html, { headTags, jsonLd }) {
  let out = html;
  out = out.replace(/<title>[^<]*<\/title>/i, '');
  out = out.replace(/<meta\s+name="description"[^>]*>/gi, '');
  out = out.replace(/<link\s+rel="canonical"[^>]*>/gi, '');
  out = out.replace(/<meta\s+name="robots"[^>]*>/gi, '');
  const block = `\n${headTags}\n${jsonLd}\n</head>`;
  return out.includes('</head>') ? out.replace('</head>', block) : out;
}

function scoreColor(score) {
  return score >= 80 ? '#22c55e' : score >= 60 ? '#eab308' : '#ef4444';
}

function renderCard(post) {
  const score = Number(post.score) || 0;
  const color = scoreColor(score);
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

function buildSsrBlock(posts) {
  if (!posts.length) return '';
  const cards = posts.map(renderCard).join('\n');
  return `<div id="ssr-community-feed" class="space-y-4" aria-hidden="true">${cards}</div>
<script>
  (function() {
    function cleanup() {
      var ssr = document.getElementById('ssr-community-feed');
      if (ssr) ssr.remove();
    }
    if (window.Alpine && window.Alpine.version) { cleanup(); }
    else { document.addEventListener('alpine:init', cleanup); }
  })();
</script>`;
}

export async function handleCommunity(request, env) {
  let data;
  try {
    data = await fetchFeed(env, { limit: 20 });
  } catch (err) {
    console.error('community feed fetch failed:', err.message);
    data = { posts: [] };
  }

  const posts = data.posts || [];
  const meta = buildCommunityMeta();
  const jsonLd = jsonLdScript(communityJsonLd(posts));
  const headTags = renderHeadTags(meta, { index: true, type: 'website' });

  const shell = await getShell(env, '/community/index.html');
  let html = injectShell(shell, { headTags, jsonLd });

  // Inject SSR block right before the Alpine-driven feed container
  const marker = '<div class="space-y-4" x-show="!feed.loading">';
  if (html.includes(marker)) {
    html = html.replace(marker, buildSsrBlock(posts) + '\n' + marker);
  } else {
    // Fallback: inject before </main>
    html = html.replace('</main>', buildSsrBlock(posts) + '\n</main>');
  }

  return new Response(html, { status: 200, headers: htmlHeaders(CACHE.community) });
}
