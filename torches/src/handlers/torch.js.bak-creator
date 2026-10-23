import { fetchTorch } from '../lib/api.js';
import { getShell } from '../lib/shell.js';
import { buildTorchMeta, renderHeadTags } from '../lib/meta.js';
import { torchJsonLd, jsonLdScript } from '../lib/jsonld.js';
import { htmlHeaders, CACHE } from '../lib/cache.js';
import { htmlEscape } from '../lib/escape.js';
import { toolDisplay, toolRunUrl } from '../lib/tools.js';
import TORCH_PAGE_JS from '../static/torch-page.js.txt';

const SITE = 'https://traffictorch.net';

const MD_CSS = `<style>
.md-body { line-height: 1.65; overflow-wrap: anywhere; word-break: break-word; }
.md-body > *:first-child { margin-top: 0; }
.md-body > *:last-child { margin-bottom: 0; }
.md-body p { margin: 0.6em 0; }
.md-body h1, .md-body h2, .md-body h3, .md-body h4 { font-weight: 800; margin: 1em 0 0.5em; line-height: 1.25; }
.md-body h1 { font-size: 1.5em; }
.md-body h2 { font-size: 1.3em; }
.md-body h3 { font-size: 1.1em; }
.md-body h4 { font-size: 1em; }
.md-body ul, .md-body ol { padding-left: 1.5em; margin: 0.6em 0; }
.md-body li { margin: 0.25em 0; }
.md-body a { color: #f97316; text-decoration: underline; overflow-wrap: anywhere; }
.md-body a:hover { color: #ea580c; }
.md-body blockquote { border-left: 3px solid rgba(249,115,22,0.5); padding-left: 0.9em; margin: 0.7em 0; color: #6b7280; font-style: italic; }
.dark .md-body blockquote { color: #9ca3af; }
.md-body code { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 0.88em; padding: 0.15em 0.4em; border-radius: 0.3em; background: rgba(0,0,0,0.06); }
.dark .md-body code { background: rgba(255,255,255,0.08); }
.md-body pre { margin: 0.8em 0; padding: 0.9em 1em; border-radius: 0.6em; background: #0f172a; color: #e5e7eb; overflow-x: auto; font-size: 0.85em; line-height: 1.5; }
.md-body pre code { background: transparent; padding: 0; font-size: 1em; color: inherit; }
.md-body table { width: 100%; border-collapse: collapse; margin: 0.8em 0; font-size: 0.9em; }
.md-body th, .md-body td { padding: 0.4em 0.7em; border: 1px solid rgba(0,0,0,0.1); text-align: left; }
.dark .md-body th, .dark .md-body td { border-color: rgba(255,255,255,0.1); }
.md-body th { background: rgba(0,0,0,0.03); font-weight: 700; }
.dark .md-body th { background: rgba(255,255,255,0.04); }
.md-body hr { border: none; border-top: 1px solid rgba(0,0,0,0.1); margin: 1em 0; }
.dark .md-body hr { border-top-color: rgba(255,255,255,0.1); }
.md-body img { max-width: 100%; height: auto; border-radius: 0.5em; margin: 0.5em 0; }
.md-body pre .hljs-keyword, .md-body pre .hljs-built_in, .md-body pre .hljs-type { color: #c792ea; }
.md-body pre .hljs-string, .md-body pre .hljs-attr { color: #c3e88d; }
.md-body pre .hljs-number, .md-body pre .hljs-literal { color: #f78c6c; }
.md-body pre .hljs-comment { color: #6b7280; font-style: italic; }
.md-body pre .hljs-function, .md-body pre .hljs-title { color: #82aaff; }
.md-body pre .hljs-variable, .md-body pre .hljs-params { color: #e5e7eb; }
.md-body pre .hljs-tag, .md-body pre .hljs-name { color: #f07178; }
.md-body pre .hljs-attribute { color: #ffcb6b; }
</style>`;

function injectHead(html, { headTags, jsonLd }) {
  let out = html;
  out = out.replace(/<title>[^<]*<\/title>/i, '');
  out = out.replace(/<meta\s+name="description"[^>]*>/gi, '');
  out = out.replace(/<link\s+rel="canonical"[^>]*>/gi, '');
  out = out.replace(/<meta\s+name="robots"[^>]*>/gi, '');
  // Prepend dependency scripts BEFORE Alpine so torchPage() is defined first
  const prepend = '<script defer src="https://cdn.jsdelivr.net/npm/markdown-it@14.1.0/dist/markdown-it.min.js"></script>\n' +
    '<script defer src="https://cdn.jsdelivr.net/npm/@highlightjs/cdn-assets@11.9.0/highlight.min.js"></script>\n' +
    '<script defer src="/torch-page.js"></script>\n';
  out = out.replace(/<head>/i, '<head>\n' + prepend);
  const block = `\n${headTags}\n${jsonLd}\n${MD_CSS}\n</head>`;
  return out.includes('</head>') ? out.replace('</head>', block) : out;
}

function stripProfileShell(html) {
  // Swap Alpine factory so the whole shell is in torchPage() scope
  html = html.replace(/ x-data="profilePage\(\)"/, ' x-data="torchPage()"');
  html = html.replace(
    /<script>\s*const API_BASE = [\s\S]*?window\.profilePage = profilePage;\s*<\/script>/,
    ''
  );
  // Remove the two shell-level Alpine lightboxes. Torch pages use a vanilla-JS onclick lightbox,
  // so these would fire "imageLightbox/avatarLightbox/avatarSrc/profile is not defined" every load.
  html = html.replace(/<template x-teleport="body">\s*<div id="tt-profile-image-lightbox"[\s\S]*?<\/template>/, '');
  html = html.replace(/<template x-teleport="body">\s*<div x-show="avatarLightbox"[\s\S]*?<\/template>/, '');
  return html;
}

function scoreColor(s) { return s >= 80 ? '#22c55e' : s >= 60 ? '#eab308' : '#ef4444'; }
function scoreClass(s) { return s >= 80 ? 'text-green-500' : s >= 60 ? 'text-yellow-500' : 'text-red-500'; }
function monthsSince(ts) {
  if (!ts) return 0;
  const t = typeof ts === 'number' ? ts : new Date(ts).getTime();
  if (!Number.isFinite(t)) return 0;
  return Math.max(0, Math.floor((Date.now() - t) / (86400000 * 30)));
}
function fmtDate(ts) { try { return new Date(ts).toLocaleDateString('en-GB', { year: 'numeric', month: 'short', day: 'numeric' }); } catch { return '—'; } }

function torchLabel(post) {
  if (post.post_type === 'workflow' && post.title && post.title.trim()) return post.title;
  if (post.page_title && post.page_title.trim()) return post.page_title;
  if (post.domain_mode === 'hidden') return post.domain_label || 'Hidden site';
  if (post.url) return new URL(post.url).hostname.replace(/^www\./, '');
  return `Torch #${post.id}`;
}
function plainExcerptServer(text, max = 600) {
  if (!text) return '';
  const stripped = String(text)
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/_([^_]+)_/g, '$1')
    .replace(/\x60([^\x60]+)\x60/g, '$1')
    .replace(/\x60\x60\x60[\s\S]*?\x60\x60\x60/g, '[code]')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/^\s*[-*+]\s+/gm, '')
    .replace(/^\s*\d+\.\s+/gm, '')
    .replace(/^\s*>\s+/gm, '');
  const trimmed = stripped.trim();
  return trimmed.length <= max ? trimmed : trimmed.slice(0, max).replace(/\s+\S*$/, '') + '…';
}

function domainOf(post) {
  if (post.domain_mode === 'hidden') return post.domain_label || 'Hidden site';
  if (post.url) return new URL(post.url).hostname.replace(/^www\./, '');
  return 'Unknown';
}

function roleLabel(role) {
  const m = { 'ai-lens': 'AI Lenzer', owner: 'Website Owner', designer: 'Web Designer', seo: 'SEO Professional', 'ai-director': 'AI Director', developer: 'Developer', 'ai-conductor': 'AI Conductor', 'context-engineer': 'Context Engineer', other: 'Member' };
  return m[role] || 'Member';
}

function renderMiniCard(post, { showAuthor } = {}) {
  const sc = Number(post.score) || 0;
  const author = showAuthor && post.username
    ? `<a href="/torcher/${htmlEscape(post.username)}/" class="text-xs text-gray-500 hover:text-orange-500">@${htmlEscape(post.username)}</a>`
    : '';
  return `<a href="/torch/${post.id}/" class="glass rounded-xl overflow-hidden flex flex-col hover:bg-white/10 transition group">
    <img src="/og/${(post.tool && post.tool.trim()) ? 'torch' : 'discussion'}/${post.id}.png"
         alt=""
         loading="lazy"
         class="w-full object-cover bg-gray-100 dark:bg-gray-800"
         style="aspect-ratio: 1200 / 630;">
    <span class="p-3 flex flex-col gap-2 min-w-0">
      <span class="flex items-baseline gap-2">
        <span class="text-3xl font-black ${scoreClass(sc)} leading-none">${sc}</span>
        <span class="text-[10px] font-bold text-gray-400">/100</span>
      </span>
      <span class="block text-sm font-medium leading-snug group-hover:text-orange-500 transition" style="display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;min-height:2.4em;">${htmlEscape(torchLabel(post))}</span>
      ${author}
    </span>
  </a>`;
}

function renderComments() {
  return `
  <section class="glass rounded-2xl p-5 mt-6">
    <h2 class="text-lg font-bold mb-4">Comments <span class="text-sm font-normal text-gray-500">(<span x-text="comments.length">0</span><template x-if="commentMeta.total > comments.length"><span> of <span x-text="commentMeta.total"></span></span></template>)</span></h2>
    <div x-show="commentsLoading" class="text-center py-6"><div class="spinner mx-auto"></div></div>
    <div x-show="!commentsLoading && comments.length === 0" class="text-center text-sm text-gray-500 py-4">No comments yet — be the first.</div>
    <div class="space-y-3" x-show="!commentsLoading">
      <template x-for="c in comments" :key="c.id">
        <div class="flex gap-3 items-start">
          <img :src="(c.avatar_url || '/images/avatars/' + (c.avatar_preset || 'owner') + '.svg')" width="36" height="36" style="width:36px;height:36px;" class="rounded-full flex-shrink-0 object-cover" alt="">
          <div class="flex-1 min-w-0 bg-gray-100 dark:bg-gray-800/60 rounded-xl px-3 py-2">
            <div class="flex items-baseline gap-2 flex-wrap">
              <a :href="'/torcher/' + (c.username || '') + '/'" class="text-xs font-bold hover:text-orange-500" x-text="c.display_name || c.username"></a>
              <span class="text-[10px] text-gray-500" x-text="formatTime(c.created_at)"></span>
              <template x-if="c.user_id === myUserId">
                <div class="ml-auto flex gap-2 text-[10px]">
                  <button @click="editComment(c)" class="text-gray-400 hover:text-orange-500">Edit</button>
                  <button @click="deleteComment(c.id)" class="text-gray-400 hover:text-red-500">Delete</button>
                </div>
              </template>
            </div>
            <div :class="!c._expanded && shouldCollapse(c.body, 600) ? 'relative max-h-[10rem] overflow-hidden' : ''">
              <div class="md-body text-sm mt-1 break-words" x-html="renderMarkdown(c.body)"></div>
              <div x-show="!c._expanded && shouldCollapse(c.body, 600)" x-cloak class="absolute bottom-0 left-0 right-0 h-12 bg-gradient-to-t from-gray-100 dark:from-gray-800/60 to-transparent pointer-events-none"></div>
            </div>
            <button x-show="shouldCollapse(c.body, 600)" @click="c._expanded = !c._expanded" type="button" class="text-xs font-semibold text-orange-500 hover:underline mt-1" x-text="c._expanded ? 'Show less ▲' : 'Read more ▼'"></button>
            <template x-if="c.images">
              <div class="mt-2 flex flex-wrap gap-1.5">
                <template x-for="(img, idx) in parseImages(c.images)" :key="'ci-' + c.id + '-' + idx">
                  <a :data-tt-lightbox="img.url" class="cursor-zoom-in" role="button" tabindex="0">
                    <img :src="img.url" loading="lazy" alt="" class="rounded-md object-cover border border-gray-200 dark:border-gray-700 hover:opacity-90 transition" style="width:80px;height:80px;">
                  </a>
                </template>
              </div>
            </template>
            <template x-if="c.files">
              <div class="mt-2 flex flex-wrap gap-1.5">
                <template x-for="(f, idx) in parseImages(c.files)" :key="'cf-' + c.id + '-' + idx">
                  <a :href="f.url" target="_blank" rel="noopener" download class="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-gray-200 dark:bg-gray-700 text-xs text-gray-700 dark:text-gray-300 hover:bg-orange-500/20 transition">
                    <span>📎</span><span x-text="f.name || 'file'"></span>
                  </a>
                </template>
              </div>
            </template>
          </div>
        </div>
      </template>
      <div x-show="commentMeta.has_more" class="text-center pt-2">
        <button @click="loadMoreComments()" :disabled="commentMeta.loading" type="button" class="px-4 py-1.5 text-xs font-semibold rounded-lg border border-orange-500 text-orange-500 hover:bg-orange-500 hover:text-white transition disabled:opacity-50">
          <span x-show="!commentMeta.loading">Load more comments</span>
          <span x-show="commentMeta.loading">Loading…</span>
        </button>
      </div>
    </div>
    <div x-show="!isAuthenticated" class="mt-5 text-center text-sm text-gray-500">
      <a href="/login/" class="text-orange-500 hover:underline">Log in</a> to comment.
    </div>
    <div x-show="isAuthenticated" class="mt-5 flex gap-2 items-start">
      <img :src="(window.__ttProfile && window.__ttProfile.avatar_url) || ('/images/avatars/' + (myAvatar || 'owner') + '.svg')" width="36" height="36" style="width:36px;height:36px;" class="rounded-full flex-shrink-0 object-cover" alt="">
      <div class="flex-1 flex gap-2">
        <textarea rows="3" maxlength="6000" x-model="draft" @keydown.enter.exact.prevent="submitComment()" @keydown.meta.enter.prevent="submitComment()" @keydown.ctrl.enter.prevent="submitComment()" placeholder="Leave a comment… (6000 chars) · Markdown supported · Cmd/Ctrl+Enter · +5 pts" class="flex-1 p-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white/50 dark:bg-black/50 focus:ring-2 focus:ring-orange-500 outline-none resize-y min-h-[60px]"></textarea>
        <button type="button" @click="submitComment()" :disabled="submitting || !draft.trim()" class="px-4 py-2 bg-orange-500 text-white text-xs font-bold rounded-lg hover:bg-orange-600 transition disabled:opacity-50">
          <span x-show="!submitting">Post +5</span>
          <span x-show="submitting">…</span>
        </button>
      </div>
    </div>
    <p x-show="commentError" class="text-red-500 text-sm mt-2" x-text="commentError"></p>
  </section>`;
}

function renderTorchBody(data) {
  const { post, author, more_by_author, related, author_network } = data;
  const isDiscussion = post.post_type === 'discussion';
  const isWorkflow = post.post_type === 'workflow';
  let wfMeta = null;
  if (isWorkflow && post.workflow_meta) {
    try { wfMeta = typeof post.workflow_meta === 'string' ? JSON.parse(post.workflow_meta) : post.workflow_meta; } catch (e) {}
  }
  let postImages = [];
  if (post.images) {
    try { const arr = typeof post.images === 'string' ? JSON.parse(post.images) : post.images; if (Array.isArray(arr)) postImages = arr; } catch (e) {}
  }
  const sc = Number(post.score) || 0;
  const domain = domainOf(post);
  const titleText = htmlEscape(torchLabel(post));
  const displayTitle = isDiscussion ? htmlEscape(post.title || 'Discussion') : titleText;
  let bodyMd = (isDiscussion || isWorkflow) ? (post.body_md || post.note || '') : (post.note || '');
  // Workflow posts store a UI-copy preamble in body_md. Strip it here so the real markdown shows.
  if (isWorkflow && bodyMd) {
    bodyMd = bodyMd
      .replace(/^Summary:[^\n]*\n/i, '')
      .replace(/^Category:[^\n]*\n/i, '')
      .replace(/Chips\s*[—-]\s*pick\/type these:[\s\S]*?Body \(step-by-step workflow\):\s*\n?(markdown\s*\n?)?/i, '')
      .trim();
  }
  const date = fmtDate(post.created_at);
  const toolName = toolDisplay(post.tool);
  const runUrl = post.url && post.tool ? toolRunUrl(post.tool, post.url) : null;

  let modules = [];
  try {
    const raw = typeof post.module_scores === 'string' ? JSON.parse(post.module_scores) : post.module_scores;
    if (Array.isArray(raw)) modules = raw;
  } catch {}

  const modulesHtml = modules.map((m) => {
    const s = Math.max(0, Math.min(100, Math.round(m.score || 0)));
    const cls = s >= 80 ? 'good' : s >= 60 ? 'mid' : 'bad';
    return `<div class="mod-row"><span class="mod-label">${htmlEscape(m.name)}</span><span class="mod-track"><span class="mod-fill ${cls}" style="width:${s}%"></span></span><span class="mod-score">${s}</span></div>`;
  }).join('');

  const moreHtml = (more_by_author || []).length
    ? `<section class="mt-8">
        <h2 class="text-lg font-bold mb-3">More by <a href="/torcher/${htmlEscape(author.username)}/" class="hover:text-orange-500">@${htmlEscape(author.username)}</a></h2>
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">${more_by_author.map(p => renderMiniCard(p)).join('')}</div>
      </section>` : '';

  const relatedHtml = !isDiscussion && (related || []).length
    ? `<section class="mt-8">
        <h2 class="text-lg font-bold mb-3">Similar scores with ${htmlEscape(toolName)}</h2>
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">${related.map(p => renderMiniCard(p, { showAuthor: true })).join('')}</div>
      </section>` : '';

  const socials = [
    author.website_url ? `<a href="${htmlEscape(author.website_url)}" target="_blank" rel="ugc nofollow noopener" class="link-btn">🔗 ${htmlEscape(domainOf({ url: author.website_url, domain_mode: 'full' }))}</a>` : '',
    author.social1_url ? `<a href="${htmlEscape(author.social1_url)}" target="_blank" rel="ugc nofollow noopener" class="link-btn">🔗 ${htmlEscape(domainOf({ url: author.social1_url, domain_mode: 'full' }))}</a>` : '',
    author.social2_url ? `<a href="${htmlEscape(author.social2_url)}" target="_blank" rel="ugc nofollow noopener" class="link-btn">🔗 ${htmlEscape(domainOf({ url: author.social2_url, domain_mode: 'full' }))}</a>` : '',
  ].filter(Boolean).join('');

  const networkCount = author.network_count || 0;
  const networkHtml = (author_network || []).length
    ? `<div class="grid grid-cols-1 sm:grid-cols-2 gap-3">${author_network.map(u => `<a href="/torcher/${htmlEscape(u.username)}/" class="glass rounded-xl p-3 flex items-center gap-3 hover:bg-white/10 transition"><img src="${htmlEscape((u.avatar_url) || '/images/avatars/' + (u.avatar_preset || 'owner') + '.svg')}" width="40" height="40" style="width:40px;height:40px;" class="rounded-full flex-shrink-0 object-cover" alt=""><div class="flex-1 min-w-0"><p class="font-bold text-sm truncate">${htmlEscape(u.display_name || u.username)}</p><p class="text-xs text-gray-500 capitalize">${htmlEscape(roleLabel(u.role))}</p></div></a>`).join('')}</div>`
    : `<div class="glass rounded-2xl p-8 text-center"><p class="text-4xl mb-3">👥</p><p class="text-gray-500">Network is private or empty.</p></div>`;
  
    return `<style>
    .score-circle {
      width: 132px;
      height: 132px;
      border-radius: 50%;
      background: conic-gradient(var(--color) calc(var(--sc) * 1%), rgba(148, 163, 184, 0.15) 0);
      padding: 8px;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: background 0.3s ease;
    }
    .score-inner {
      width: 100%;
      height: 100%;
      border-radius: 50%;
      background: rgba(255, 255, 255, 0.95);
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      line-height: 1;
    }
    .dark .score-inner { background: rgba(15, 23, 42, 0.95); }
    .score-num { font-size: 42px; font-weight: 900; letter-spacing: -1px; margin: 0; }
    .score-denom { font-size: 11px; font-weight: 700; color: #94a3b8; margin: 2px 0 0; letter-spacing: 0.5px; }
    @media (min-width: 640px) {
      .score-circle { width: 156px; height: 156px; }
      .score-num { font-size: 52px; }
      .score-denom { font-size: 12px; }
    }
  </style>
  <main class="container mx-auto px-4 py-8 flex-1 max-w-3xl" data-ssr="torch">
  <nav aria-label="breadcrumb" class="text-sm text-gray-500 mb-4">
    <a href="/" class="hover:underline">Home</a> ›
    <a href="/community/" class="hover:underline">Community</a> ›
    <a href="/torcher/${htmlEscape(author.username)}/" class="hover:underline">@${htmlEscape(author.username)}</a> ›
    <span>Torch #${post.id}</span>
  </nav>

  <article class="glass rounded-2xl overflow-hidden border-l-4" style="border-left-color:${isDiscussion ? '#f97316' : scoreColor(sc)}">
    <div class="p-6">
      ${isDiscussion ? '<p class="text-xs font-bold uppercase tracking-wider text-purple-500 mb-4 text-center sm:text-left">💬 Discussion</p>' : (isWorkflow ? '<p class="text-xs font-bold uppercase tracking-wider text-purple-500 mb-4 text-center sm:text-left">⚙️ Workflow' + (wfMeta && wfMeta.version ? ' · ' + htmlEscape(wfMeta.version) : '') + '</p>' : '<p class="text-xs font-bold uppercase tracking-wider text-gray-400 mb-4 text-center sm:text-left">' + htmlEscape(toolName) + '</p>')}

      <div class="flex flex-col items-center sm:flex-row sm:items-start gap-6 mb-4">
        ${(!isDiscussion && !isWorkflow) ? '<div class="flex-shrink-0 score-circle" style="--sc:' + sc + ';--color:' + scoreColor(sc) + ';"><div class="score-inner"><p class="score-num" style="color:' + scoreColor(sc) + ';">' + sc + '</p><p class="score-denom">/100</p></div></div>' : ''}
        <div class="flex-1 min-w-0 text-center sm:text-left">
          <h1 class="text-2xl sm:text-3xl font-black leading-tight mb-2">${displayTitle}</h1>
          <p class="text-sm text-gray-500">${(isDiscussion || isWorkflow) ? '<time datetime="' + new Date(post.created_at).toISOString() + '">' + date + '</time>' : htmlEscape(domain) + ' · <time datetime="' + new Date(post.created_at).toISOString() + '">' + date + '</time>'}</p>
        </div>
      </div>

      ${isWorkflow && wfMeta && wfMeta.summary ? '<p class="mt-3 text-sm leading-relaxed text-gray-700 dark:text-gray-300">' + htmlEscape(wfMeta.summary) + '</p>' : ''}
      ${(function() {
        if (!isWorkflow || !wfMeta) return '';
        var keys = ['ai_models','ai_tools','cloud','ide','hardware','databases','devops','terminal','os','other_tools'];
        var chips = [];
        for (var i = 0; i < keys.length; i++) {
          var arr = wfMeta[keys[i]];
          if (Array.isArray(arr)) for (var j = 0; j < arr.length; j++) { if (chips.length < 8) chips.push(arr[j]); }
        }
        if (!chips.length) return '';
        return '<div class="mt-3 flex flex-wrap gap-1.5">' + chips.map(function(c) { return '<span class="inline-flex px-2.5 py-1 rounded-full bg-purple-500/10 text-purple-600 dark:text-purple-300 text-[11px] font-bold border border-purple-500/20">' + htmlEscape(c) + '</span>'; }).join('') + '</div>';
      })()}
      ${(isDiscussion || isWorkflow) && bodyMd ? '<div class="mt-5 text-base leading-relaxed text-gray-700 dark:text-gray-300"><div :class="bodyExpanded ? \'\' : \'relative max-h-[28rem] overflow-hidden\'"><div class="md-body" x-html="renderMarkdown(bodyMd)">' + htmlEscape(plainExcerptServer(bodyMd, 2000)) + '</div><div x-show="!bodyExpanded" x-cloak class="absolute bottom-0 left-0 right-0 h-24 bg-gradient-to-t from-white dark:from-gray-950 to-transparent pointer-events-none"></div></div><button x-show="shouldCollapse(bodyMd, 1500)" type="button" @click="bodyExpanded = !bodyExpanded" class="text-sm font-semibold text-orange-500 hover:underline mt-2" x-text="bodyExpanded ? \'Show less ▲\' : \'Read more ▼\'"></button></div>' : ''}
      ${!isDiscussion && !isWorkflow && post.note ? '<p class="text-base leading-relaxed mt-3 text-gray-700 dark:text-gray-300 whitespace-pre-wrap">' + htmlEscape(post.note) + '</p>' : ''}
      ${postImages.length > 0 ? '<div class="mt-5 grid grid-cols-2 sm:grid-cols-3 gap-3">' + postImages.map(function(img, i) { var u = String(img.url).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/'/g,'&#39;'); return '<a data-tt-lightbox="' + u + '" class="cursor-zoom-in" role="button" tabindex="0"><img src="' + htmlEscape(img.url) + '" loading="lazy" alt="Image ' + (i+1) + '" class="w-full rounded-lg border border-gray-200 dark:border-gray-700 hover:opacity-90 transition" style="aspect-ratio:16/9;object-fit:cover;"></a>'; }).join('') + '</div>' : ''}
    </div>
    ${modulesHtml ? `<div class="border-t border-dashed border-gray-200 dark:border-gray-700"></div><div class="px-6 py-4 space-y-2">${modulesHtml}</div>` : ''}
  </article>

  <!-- Action row: author chip + share/copy/report -->
  <div class="glass rounded-2xl p-5 mt-6 flex flex-wrap items-center gap-3">
    <img src="${htmlEscape((author.avatar_url) || '/images/avatars/' + (author.avatar_preset || 'owner') + '.svg')}" alt="" width="48" height="48" style="width:48px;height:48px;" class="rounded-full object-cover flex-shrink-0">
    <div class="flex-1 min-w-0">
      <p class="font-bold flex items-center gap-1.5 min-w-0"><a href="/torcher/${htmlEscape(author.username)}/" class="hover:text-orange-500 truncate">${htmlEscape(author.display_name || author.username)}</a>${author.verified_at ? `<svg viewBox="0 0 24 24" aria-label="Verified website owner" xmlns="http://www.w3.org/2000/svg" style="width:22px;height:22px;flex-shrink:0;display:inline-block;vertical-align:middle;"><circle cx="12" cy="12" r="11" fill="#22c55e"/><path d="M6.8 12.4l3.4 3.4 6.9-6.9" stroke="#fff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg>` : ''}</p>
      <p class="text-xs text-gray-500">@${htmlEscape(author.username)} · 🏅 ${author.total_points || 0}</p>
    </div>
    <div class="flex gap-2 flex-wrap w-full sm:w-auto items-center">
      <button x-show="!isOwnTorch" type="button" @click="toggleNetwork()" class="px-3 py-2 rounded-xl font-bold text-xs transition border-2" :class="inNetwork ? 'border-green-500 text-green-500' : 'border-orange-500 text-orange-500 hover:bg-orange-500 hover:text-white'" x-text="inNetwork ? 'In Network ✓' : '+ Add to Network'"></button>
      <button x-show="!isOwnTorch" type="button" @click="report()" class="px-3 py-2 rounded-xl font-bold text-xs border border-gray-300 dark:border-gray-600 hover:border-red-500 hover:text-red-500 transition">⚑ Report</button>
      ${sc >= 80 ? `<button x-show="!isOwnTorch && !viewerEndorsed" type="button" @click="endorsePost()" :disabled="endorsing" class="px-3 py-2 rounded-xl font-bold text-xs transition border-2 border-pink-500 text-pink-500 hover:bg-pink-500 hover:text-white disabled:opacity-60" title="Endorse — author gets +36 points"><span x-text="endorsing ? '…' : '⭐ Endorse' + (endorseCount > 0 ? ' ' + endorseCount : '')"></span></button>
      <button x-show="!isOwnTorch && viewerEndorsed" type="button" class="px-3 py-2 rounded-xl font-bold text-xs border-2 border-pink-500 text-pink-500 bg-pink-500/10 cursor-default" title="You already endorsed this torch"><span x-text="'⭐ ' + endorseCount"></span></button>` : ''}
    </div>
  </div>
  
    <!-- Share -->
  <section class="share-block mt-6" aria-label="Share options">
    <div class="share-row">
      <button type="button" class="share-btn" data-native-share hidden>📤 Share?</button>
      <button type="button" class="share-btn" data-copy>Copy link 🔗</button>
    </div>
    <p class="share-status" aria-live="polite"></p>
  </section>

  <!-- Tabs -->
  <nav class="flex gap-2 mt-6 flex-wrap justify-center" aria-label="Torch sections">
    <button class="tab-btn" :class="activeTab === 'torch' ? 'active' : ''" @click="activeTab = 'torch'">Torch</button>
    <button class="tab-btn" :class="activeTab === 'author' ? 'active' : ''" @click="activeTab = 'author'">Author</button>
    <button class="tab-btn" :class="activeTab === 'network' ? 'active' : ''" @click="activeTab = 'network'">Network (${networkCount})</button>
  </nav>

  <!-- Tab: Torch -->
  <section x-show="activeTab === 'torch'">
    <div class="glass rounded-2xl p-6 mt-4">
      <h2 class="text-lg font-bold mb-3" x-text="postType === 'discussion' ? 'About this discussion' : (postType === 'workflow' ? '⚙️ Workflow details' : 'About this audit')">About this audit</h2>
      <div class="grid grid-cols-2 gap-3 text-sm">
        <div x-show="postType !== 'discussion'"><span class="text-gray-500">Tool:</span> <span class="font-medium">${htmlEscape(toolName)}</span></div>
        <div><span class="text-gray-500">Category:</span> <span class="font-medium uppercase">${htmlEscape(post.category || '')}</span></div>
        <div x-show="postType !== 'discussion'"><span class="text-gray-500">Score:</span> <span class="font-medium">${sc}/100</span></div>
        <div><span class="text-gray-500">Audited:</span> <span class="font-medium">${date}</span></div>
      </div>
      ${runUrl && (!isDiscussion && !isWorkflow) ? `<div class="mt-5"><a href="${runUrl}" target="_blank" rel="noopener" class="inline-block px-4 py-2 bg-gradient-to-r from-orange-500 to-pink-600 text-white text-sm font-bold rounded-xl hover:opacity-90 transition">▶ Run this audit yourself</a></div>` : ''}
    </div>
    ${renderComments()}
  </section>

  <!-- Tab: Author -->
  <section x-show="activeTab === 'author'" x-cloak>
    <div class="glass rounded-2xl p-6 mt-4">
      <div class="flex flex-col sm:flex-row sm:items-end gap-5">
        <div class="avatar-ring tier-${htmlEscape(author.tier || 'free')} role-${htmlEscape(author.role || 'owner')}" style="padding:6px;">
          <img src="${htmlEscape((author.avatar_url) || '/images/avatars/' + (author.avatar_preset || 'owner') + '.svg')}" alt="" width="96" height="96" style="width:96px;height:96px;" class="rounded-2xl object-cover">
          ${(author.tier && author.tier !== 'free') ? '<span class="tier-ribbon">' + (author.tier === 'pro' ? 'PRO' : 'EXPERT') + '</span>' : ''}
        </div>
        <div class="flex-1 min-w-0">
          <h2 class="text-2xl font-black flex items-center gap-2 flex-wrap min-w-0"><span class="truncate">${htmlEscape(author.display_name || author.username)}</span>${author.verified_at ? `<svg viewBox="0 0 24 24" aria-label="Verified website owner" xmlns="http://www.w3.org/2000/svg" style="width:22px;height:22px;flex-shrink:0;display:inline-block;vertical-align:middle;"><circle cx="12" cy="12" r="11" fill="#22c55e"/><path d="M6.8 12.4l3.4 3.4 6.9-6.9" stroke="#fff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg>` : ''}</h2>
          <p class="text-gray-500 flex items-center gap-2 flex-wrap">
            <span>@${htmlEscape(author.username)}</span>
            <span class="inline-block px-2 py-0.5 text-xs font-bold uppercase tracking-wide rounded-full bg-orange-500/20 text-orange-500">${htmlEscape(roleLabel(author.role))}</span>
          </p>
        </div>
        <a href="/torcher/${htmlEscape(author.username)}/" class="px-4 py-2 rounded-xl font-bold text-sm border-2 border-orange-500 text-orange-500 hover:bg-orange-500 hover:text-white transition whitespace-nowrap">View full profile →</a>
      </div>
      ${author.bio ? `<p class="mt-5 text-center text-gray-700 dark:text-gray-300 leading-relaxed">${htmlEscape(author.bio)}</p>` : ''}
      <div class="mt-5 flex flex-wrap items-center justify-center gap-y-2 text-sm text-gray-500">
        ${author.job_title ? `<span class="meta-item"><span class="emoji">💼</span>${htmlEscape(author.job_title)}</span>` : ''}
        ${author.company ? `<span class="meta-item"><span class="emoji">🏢</span>${htmlEscape(author.company)}</span>` : ''}
        ${author.location ? `<span class="meta-item"><span class="emoji">📍</span>${htmlEscape(author.location)}</span>` : ''}
        ${author.created_at ? `<span class="meta-item"><span class="emoji">📅</span>Member since ${fmtDate(author.created_at)}</span>` : ''}
      </div>
      ${socials ? `<div class="mt-5 flex flex-wrap items-center justify-center gap-3">${socials}</div>` : ''}
      <div class="mt-7 grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div class="text-center p-3 rounded-xl bg-gray-100 dark:bg-gray-900/60"><p class="text-2xl font-black text-orange-500">${author.audit_count || 0}</p><p class="text-xs uppercase tracking-wider text-gray-500 mt-1">Audits shared</p></div>
        <div class="text-center p-3 rounded-xl bg-gray-100 dark:bg-gray-900/60"><p class="text-2xl font-black text-orange-500">${networkCount}</p><p class="text-xs uppercase tracking-wider text-gray-500 mt-1">Network</p></div>
        <div class="text-center p-3 rounded-xl bg-gray-100 dark:bg-gray-900/60"><p class="text-2xl font-black text-orange-500">${author.total_points || 0}</p><p class="text-xs uppercase tracking-wider text-gray-500 mt-1">Points</p></div>
        <div class="text-center p-3 rounded-xl bg-gray-100 dark:bg-gray-900/60"><p class="text-2xl font-black text-orange-500">${monthsSince(author.created_at)}</p><p class="text-xs uppercase tracking-wider text-gray-500 mt-1">Months here</p></div>
      </div>
    </div>
  </section>

  <!-- Tab: Network -->
  <section x-show="activeTab === 'network'" x-cloak>
    <div class="mt-4">${networkHtml}</div>
  </section>

  ${moreHtml}
  ${relatedHtml}

  <div class="mt-8 text-center text-xs text-gray-500">
    <a href="/torches/feed.xml" class="hover:underline">RSS: all torches</a>
  </div>
</main>`;
}

function torchPageScript() {
  return `<script>
  document.addEventListener('alpine:init', function() {
    if (typeof window.torchPage !== 'function') return;
    var orig = window.torchPage;
    window.torchPage = function() {
      var obj = orig.apply(this, arguments);
      if (!obj.openImageLightbox) obj.openImageLightbox = function(u) { if (u) this.imageLightbox = u; };
      if (!obj.parseImages) obj.parseImages = function(raw) {
        if (!raw) return [];
        try { var a = typeof raw === 'string' ? JSON.parse(raw) : raw; return Array.isArray(a) ? a : []; } catch (e) { return []; }
      };
      if (!obj.formatTime && obj.formatRelativeTime) obj.formatTime = obj.formatRelativeTime;
      if (!obj.formatTime) obj.formatTime = function(ts) { try { return new Date(ts).toLocaleString(); } catch (e) { return ''; } };
      if (!obj.plainExcerpt) obj.plainExcerpt = function(t, m) { t = String(t || ''); m = m || 600; return t.length <= m ? t : t.slice(0, m).replace(/\s+\S*$/, '') + '\u2026'; };
      if (!obj.shouldCollapse) obj.shouldCollapse = function(t, m) { return !!t && String(t).length > (m || 600); };
      if (!obj.renderMarkdown) obj.renderMarkdown = function(t) {
        if (!t) return '';
        if (window.markdownit) {
          if (!window._ttMdTorch) {
            window._ttMdTorch = window.markdownit({ html: false, linkify: true, breaks: true });
            var defaultLink = window._ttMdTorch.renderer.rules.link_open || function(tokens, idx, options, env, self) { return self.renderToken(tokens, idx, options); };
            window._ttMdTorch.renderer.rules.link_open = function(tokens, idx, options, env, self) {
              tokens[idx].attrSet('target', '_blank');
              tokens[idx].attrSet('rel', 'nofollow ugc noopener');
              return defaultLink(tokens, idx, options, env, self);
            };
          }
          return window._ttMdTorch.render(String(t));
        }
        return '<p style="white-space:pre-wrap">' + String(t).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;') + '</p>';
      };
      return obj;
    };
  });
  
  // Delegated image-lightbox — CSP blocks inline onclick, so bind once
  document.addEventListener('click', function(e){
    var a = e.target.closest && e.target.closest('a[data-tt-lightbox]');
    if (!a) return;
    e.preventDefault();
    var b = document.getElementById('tt-image-lightbox-vanilla');
    if (b) { b.remove(); return; }
    b = document.createElement('div');
    b.id = 'tt-image-lightbox-vanilla';
    b.style.cssText = 'position:fixed;inset:0;z-index:2147483647;background:rgba(0,0,0,.88);display:flex;align-items:center;justify-content:center;padding:24px;cursor:zoom-out';
    b.onclick = function(){ b.remove(); };
    var im = document.createElement('img');
    im.style.cssText = 'max-width:95vw;max-height:90vh;border-radius:12px;background:#fff';
    im.src = a.getAttribute('data-tt-lightbox');
    b.appendChild(im);
    document.body.appendChild(b);
  }, true);
  document.addEventListener('keydown', function(e){
    if (e.key === 'Escape') { var b = document.getElementById('tt-image-lightbox-vanilla'); if (b) b.remove(); }
  });
</script>`;
}

export { TORCH_PAGE_JS };

export async function handleTorch(request, env) {
  const path = new URL(request.url).pathname;
  const idRaw = path.replace('/torch/', '').replace(/\/$/, '').split('/')[0];
  const id = parseInt(idRaw, 10);

  if (!id || String(id) !== idRaw) {
    return new Response('Not found', { status: 404, headers: htmlHeaders('public, s-maxage=60') });
  }

  let data;
  try {
    data = await fetchTorch(env, id);
  } catch (err) {
    if (err.status === 404) {
      const shell = await getShell(env, '/profile.html');
      return new Response(
        shell.replace(/<title>[^<]*<\/title>/i, '<title>Torch not found · Traffic Torch</title>')
             .replace('</head>', '<meta name="robots" content="noindex, follow">\n</head>'),
        { status: 404, headers: htmlHeaders('public, s-maxage=60') }
      );
    }
    throw err;
  }

  const { post, author } = data;
  const isHidden = post.domain_mode === 'hidden';

  const meta = buildTorchMeta(post, author, id);
  const jsonLd = jsonLdScript(torchJsonLd(post, author, id));
  const headTags = renderHeadTags(meta, { index: !isHidden, type: 'article' });

  const shell = await getShell(env, '/profile.html');
  let html = injectHead(shell, { headTags, jsonLd });
  html = stripProfileShell(html);

  const mainStart = html.indexOf('<main ');
  const mainEnd = html.indexOf('</main>');
  if (mainStart !== -1 && mainEnd !== -1) {
    const embedded = `<script id="torch-data" type="application/json">${JSON.stringify({ torch_id: id, author_id: author.id, author_username: author.username, endorse_count: post.endorse_count || 0, post_type: post.post_type || 'audit', title: post.title || null, body_md: post.body_md || post.note || null })}</script>`;
    const injected = `${renderTorchBody(data)}\n${embedded}\n${torchPageScript()}`;
    html = html.slice(0, mainStart) + injected + html.slice(mainEnd + '</main>'.length);
  }

  return new Response(html, {
    status: 200,
    headers: htmlHeaders(isHidden ? CACHE.torchHidden : CACHE.torch),
  });
}
