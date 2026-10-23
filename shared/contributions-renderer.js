// /shared/contributions-renderer.js
// Canonical contributor card renderer for every tool page + /contributors/.
// Prepends site-wide contributors, fetches profile data once per username,
// uses ttAvatarSrc() so real photos show everywhere.

import { siteContributors } from '/contributors/site-contributors.js';

const AUTH = 'https://datewizza-auth.traffictorch.workers.dev';
const _profileCache = new Map();

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function keyOf(c) { return ((c && (c.username || c.handle)) || '').toLowerCase(); }

async function fetchProfile(username) {
  if (!username) return null;
  if (_profileCache.has(username)) return _profileCache.get(username);
  try {
    const r = await fetch(`${AUTH}/api/torcher/${encodeURIComponent(username)}`);
    const d = r.ok ? await r.json() : null;
    const p = d && d.profile ? d.profile : null;
    _profileCache.set(username, p);
    return p;
  } catch { _profileCache.set(username, null); return null; }
}

const ICONS = {
  website: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-4 h-4"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>'
};
function domainLabel(url) {
  try {
    const h = new URL(url).hostname.replace(/^www\./, '');
    const p = h.split('.');
    const n = p.length > 1 ? p[p.length - 2] : p[0];
    return n.charAt(0).toUpperCase() + n.slice(1);
  } catch { return 'Link'; }
}

function resolveLinks(c) {
  const p = c._profile || {};
  if (c.username) {
    const out = [];
    if (p.social1_url) out.push({ label: domainLabel(p.social1_url), href: p.social1_url, icon: ICONS.website });
    if (p.social2_url) out.push({ label: domainLabel(p.social2_url), href: p.social2_url, icon: ICONS.website });
    if (p.website_url) out.push({ label: domainLabel(p.website_url), href: p.website_url, icon: ICONS.website });
    return out;
  }
  return Object.entries(c.links || {}).filter(([, v]) => v)
    .map(([k, v]) => ({ label: k, href: v, icon: ICONS.website }));
}

function card(c, { showToolHeader = true } = {}) {
  const p = c._profile || {};
  const displayName = c.name || p.display_name || c.handle || 'Anonymous';
  const handle = c.username ? c.username : (c.handle || '');
  const hasTtProfile = !!c.username;
  const src = (hasTtProfile && typeof window.ttAvatarSrc === 'function') ? window.ttAvatarSrc(p) : null;
  const profileUrl = c.username ? `/torcher/${esc(c.username)}/` : null;
  const points = typeof p.total_points === 'number' ? p.total_points : 0;
  const links = resolveLinks(c);

  const avatarHtml = (hasTtProfile && src)
    ? `<img src="${esc(src)}" alt="" class="w-16 h-16 rounded-2xl object-cover flex-shrink-0 shadow-md" loading="lazy" onerror="this.onerror=null;this.src='/images/avatars/${esc(p.avatar_preset || 'owner')}.svg';">`
    : `<div class="w-16 h-16 rounded-2xl bg-gradient-to-br ${c.avatarColor || 'from-gray-500 to-gray-700'} flex items-center justify-center text-white text-2xl font-black flex-shrink-0 shadow-md">${esc(c.avatarInitial || (displayName[0] || '?'))}</div>`;

  const profilePill = profileUrl
    ? `<a href="${profileUrl}" class="inline-flex items-center gap-1.5 mt-1.5 px-3 py-1 rounded-full bg-gradient-to-r from-orange-500 to-pink-600 text-white text-xs font-bold hover:brightness-110 transition shadow">🏅 ${points} points · View profile →</a>`
    : '';

  const contribs = (c.contributions || []).map(x => {
    const text = String(x.text || '');
    const LIMIT = 220;
    if (text.length <= LIMIT) {
      return `<li class="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
        <a href="/${esc(x.slug)}/" class="font-semibold text-orange-600 dark:text-orange-400 hover:underline">${esc(x.tool)}</a>
        — ${esc(text)}
      </li>`;
    }
    const preview = text.slice(0, LIMIT).replace(/\s+\S*$/, '') + '…';
    return `<li class="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
      <a href="/${esc(x.slug)}/" class="font-semibold text-orange-600 dark:text-orange-400 hover:underline">${esc(x.tool)}</a>
      — <span class="contrib-preview">${esc(preview)}</span><span class="contrib-full" hidden>${esc(text)}</span>
      <button type="button" class="contrib-more text-xs font-semibold text-orange-600 dark:text-orange-400 hover:underline ml-1">read more</button>
    </li>`;
  }).join('');

  const header = showToolHeader
    ? `<p class="text-xs uppercase tracking-widest text-gray-500 dark:text-gray-400 mb-3 font-bold">Contributions</p>`
    : '';

  const linkButtons = links.map(l =>
    `<a href="${esc(l.href)}" target="_blank" rel="noopener noreferrer" class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-100 dark:bg-gray-800 hover:bg-orange-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 text-xs font-medium transition">${l.icon}<span>${esc(l.label)}</span></a>`
  ).join('');

  return `
    <article class="rounded-3xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-lg overflow-hidden flex flex-col">
      <div class="p-6 flex items-start gap-4">
        ${avatarHtml}
        <div class="min-w-0 flex-1">
          <h3 class="text-xl font-black text-gray-900 dark:text-gray-100">${esc(displayName)}</h3>
          <p class="text-sm font-semibold text-orange-600 dark:text-orange-400">u/${esc(handle)}</p>
          ${profilePill}
          <p class="text-sm text-gray-600 dark:text-gray-400 mt-1">${esc(c.role || '')}</p>
          ${c.subtitle ? `<p class="text-xs text-gray-500 dark:text-gray-500 mt-0.5">${esc(c.subtitle)}</p>` : ''}
          ${c.location ? `<p class="text-xs text-gray-500 dark:text-gray-500 mt-0.5">📍 ${esc(c.location)}</p>` : ''}
        </div>
      </div>
      <div class="px-6 pb-4 flex-1">
        ${header}
        <ul class="space-y-3">${contribs}</ul>
      </div>
      ${c.allTags && c.allTags.length ? `<div class="px-6 pb-4 flex flex-wrap gap-1.5">${[...c.allTags].map(t => `<span class="px-2 py-0.5 rounded-md bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300 text-[11px] font-semibold uppercase tracking-wide">${esc(t)}</span>`).join('')}</div>` : ''}
      ${linkButtons ? `<div class="px-6 pb-6 flex flex-wrap gap-2 border-t border-gray-100 dark:border-gray-800 pt-4">${linkButtons}</div>` : ''}
    </article>`;
}

function mergeForTool(flat) {
  const byHandle = new Map();
  for (const c of flat) {
    const k = keyOf(c); if (!k) continue;
    if (!byHandle.has(k)) byHandle.set(k, { ...c, tools: [], contributions: [], allTags: new Set(c.tags || []), _seen: new Set(), _siteWide: !!c._siteWide });
    const m = byHandle.get(k);
    if (!m.tools.some(x => x.slug === c._tool.slug)) m.tools.push({ tool: c._tool.tool, slug: c._tool.slug });
    const t = (c._tool.contribution || '').trim();
    if (t && !m._seen.has(t)) { m._seen.add(t); m.contributions.push({ tool: c._tool.tool, slug: c._tool.slug, text: t }); }
    for (const x of c.tags || []) m.allTags.add(x);
  }
  return [...byHandle.values()].map(m => { const { _seen, ...r } = m; return { ...r, allTags: [...m.allTags] }; });
}

export async function renderToolContributions(toolContributors, containerId = 'contributions-section', opts = {}) {
  const container = document.getElementById(containerId);
  if (!container) return;

  const slug = opts.toolSlug || location.pathname.split('/').filter(Boolean)[0] || '';
  const name = opts.toolName || slug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

  const flat = [];
  for (const c of (toolContributors || [])) flat.push({ ...c, _tool: { tool: name, slug, contribution: c.contribution || '' } });
  for (const s of siteContributors) flat.push({ ...s, _siteWide: true, _tool: { tool: name, slug, contribution: s.contribution || '' } });

  const merged = mergeForTool(flat);
  if (!merged.length) { container.remove(); return; }

  // Hydrate profiles (parallel, cached)
  await Promise.all(merged.map(async c => { c._profile = c.username ? await fetchProfile(c.username) : null; }));

  // Sort: site-wide first (in listed order), then by points desc
  const siteOrder = new Map(siteContributors.map((s, i) => [keyOf(s), i]));
  merged.sort((a, b) => {
    const aSite = siteOrder.has(keyOf(a)), bSite = siteOrder.has(keyOf(b));
    if (aSite && bSite) return siteOrder.get(keyOf(a)) - siteOrder.get(keyOf(b));
    if (aSite) return -1; if (bSite) return 1;
    const ap = (a._profile && a._profile.total_points) || 0;
    const bp = (b._profile && b._profile.total_points) || 0;
    if (ap !== bp) return bp - ap;
    return (a.name || '').localeCompare(b.name || '');
  });

  container.innerHTML = `
    <section class="max-w-6xl mx-auto my-16 px-2">
      <div class="text-center mb-10">
        <h2 class="text-3xl md:text-4xl font-black bg-gradient-to-r from-orange-400 to-pink-600 bg-clip-text text-transparent">
          Built With The Community
        </h2>
        <p class="text-base md:text-lg text-gray-600 dark:text-gray-400 mt-3 max-w-2xl mx-auto">
          This tool exists because people who run it for real told us what was missing. Their feedback shaped the architecture.
        </p>
      </div>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
        ${merged.map(c => card(c, { showToolHeader: !c._siteWide })).join('')}
      </div>
    </section>`;

  container.querySelectorAll('.contrib-more').forEach(btn => {
    btn.addEventListener('click', () => {
      const li = btn.closest('li');
      const prev = li.querySelector('.contrib-preview');
      const full = li.querySelector('.contrib-full');
      const expanded = !full.hidden;
      full.hidden = expanded;
      prev.hidden = !expanded;
      btn.textContent = expanded ? 'read more' : 'read less';
    });
  });
}