// /contributors/contributors-page.js
// Aggregates contributor cards across every tool in /contributors/manifest.js.
// Site-wide contributors come from /contributors/site-contributors.js.
// Profile fields (avatar, points, links) are pulled live from /api/torcher/{username}.
// Manual `links` are used ONLY for entries with no DateWizza account.

import { TOOLS } from './manifest.js';
import { siteContributors } from './site-contributors.js';

const AUTH = 'https://datewizza-auth.traffictorch.workers.dev';

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function keyOf(c) {
  return ((c && (c.username || c.handle)) || '').toLowerCase();
}

async function loadAllTools() {
  const results = await Promise.all(TOOLS.map(async (t) => {
    try {
      const mod = await import(/* @vite-ignore */ t.path + '?v=1.0');
      const list = Array.isArray(mod.contributors) ? mod.contributors : [];
      return list.map(c => ({
        ...c,
        _tool: { tool: t.name, slug: t.slug, contribution: c.contribution || '' }
      }));
    } catch (e) {
      console.warn('[contributors] load failed for', t.slug, e.message);
      return [];
    }
  }));
  return results.flat();
}

// Merge site-wide contributors into each tool's list (unless already there).
function withSiteContributors(perTool) {
  const byTool = new Map();
  for (const c of perTool) {
    if (!byTool.has(c._tool.slug)) byTool.set(c._tool.slug, []);
    byTool.get(c._tool.slug).push(c);
  }
  const out = [];
  for (const t of TOOLS) {
    const existing = byTool.get(t.slug) || [];
    const existingKeys = new Set(existing.map(keyOf));
    for (const s of siteContributors) {
      if (existingKeys.has(keyOf(s))) continue;
      out.push({
        ...s,
        _tool: { tool: t.name, slug: t.slug, contribution: s.contribution || '' }
      });
    }
    out.push(...existing);
  }
  return out;
}

// One card per person — collect all tools + dedup identical contribution text.
function mergeByIdentity(flat) {
  const byHandle = new Map();
  for (const c of flat) {
    const k = keyOf(c);
    if (!k) continue;
    if (!byHandle.has(k)) {
      byHandle.set(k, {
        ...c,
        tools: [],
        contributions: [],
        allTags: new Set(c.tags || []),
        _seenText: new Set()
      });
    }
    const m = byHandle.get(k);
    if (!m.tools.some(x => x.slug === c._tool.slug)) {
      m.tools.push({ tool: c._tool.tool, slug: c._tool.slug });
    }
    const textKey = (c._tool.contribution || '').trim();
    if (textKey && !m._seenText.has(textKey)) {
      m._seenText.add(textKey);
      m.contributions.push({ tool: c._tool.tool, slug: c._tool.slug, text: c._tool.contribution });
    }
    for (const t of c.tags || []) m.allTags.add(t);
  }
  return [...byHandle.values()].map(m => {
    const { _seenText, ...rest } = m;
    return { ...rest, allTags: [...m.allTags] };
  });
}

async function hydrateProfiles(contributors) {
  const withUser = contributors.filter(c => c.username);
  if (!withUser.length) return;
  const results = await Promise.all(withUser.map(async (c) => {
    try {
      const r = await fetch(`${AUTH}/api/torcher/${encodeURIComponent(c.username)}`);
      if (!r.ok) return null;
      const d = await r.json();
      return d.profile || null;
    } catch { return null; }
  }));
  const byUsername = new Map();
  withUser.forEach((c, i) => { if (results[i]) byUsername.set(c.username, results[i]); });
  for (const c of contributors) {
    c._profile = c.username ? (byUsername.get(c.username) || null) : null;
  }
}

const ICONS = {
  linkedin: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="w-4 h-4"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.063 2.063 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>',
  github:   '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="w-4 h-4"><path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.4 3-.405 1.02.005 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12"/></svg>',
  reddit:   '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="w-4 h-4"><path d="M12 0C5.373 0 0 5.373 0 12c0 3.314 1.343 6.314 3.515 8.485l-2.286 2.286C.775 23.225 1.097 24 1.738 24H12c6.627 0 12-5.373 12-12S18.627 0 12 0Z"/></svg>',
  website:  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-4 h-4"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>'
};

function domainLabel(url) {
  try {
    const host = new URL(url).hostname.replace(/^www\./, '');
    const parts = host.split('.');
    const name = parts.length > 1 ? parts[parts.length - 2] : parts[0];
    return name.charAt(0).toUpperCase() + name.slice(1);
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
  return Object.entries(c.links || {}).filter(([, v]) => v).map(([k, v]) => ({
    label: k, href: v, icon: ICONS[k] || ICONS.website
  }));
}

function card(c) {
  const p = c._profile || {};
  const displayName = p.display_name || c.name || c.handle || 'Anonymous';
  const hasTtProfile = !!c.username;
  const avatarSrc = (hasTtProfile && typeof window.ttAvatarSrc === 'function') ? window.ttAvatarSrc(p) : null;
  const profileUrl = c.username ? `/torcher/${esc(c.username)}/` : null;
  const points = typeof p.total_points === 'number' ? p.total_points : 0;
  const links = resolveLinks(c);

  const avatarHtml = (hasTtProfile && avatarSrc)
    ? `<img src="${esc(avatarSrc)}" alt="" class="w-16 h-16 rounded-2xl object-cover flex-shrink-0 shadow-md" loading="lazy" onerror="this.onerror=null;this.src='/images/avatars/${esc(p.avatar_preset || 'owner')}.svg';">`
    : `<div class="w-16 h-16 rounded-2xl bg-gradient-to-br ${c.avatarColor || 'from-gray-500 to-gray-700'} flex items-center justify-center text-white text-2xl font-black flex-shrink-0 shadow-md">${esc(c.avatarInitial || '?')}</div>`;

  const profilePill = profileUrl
    ? `<a href="${profileUrl}" class="inline-flex items-center gap-1.5 mt-1.5 px-3 py-1 rounded-full bg-gradient-to-r from-orange-500 to-pink-600 text-white text-xs font-bold hover:brightness-110 transition shadow">🏅 ${points} points · View profile →</a>`
    : '';

  const contribs = c.contributions.map(x => {
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

  const linkButtons = links.map(l =>
    `<a href="${esc(l.href)}" target="_blank" rel="noopener noreferrer" class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-100 dark:bg-gray-800 hover:bg-orange-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 text-xs font-medium transition">${l.icon}<span>${esc(l.label)}</span></a>`
  ).join('');

  return `
    <article class="rounded-3xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-lg overflow-hidden flex flex-col">
      <div class="p-6 flex items-start gap-4">
        ${avatarHtml}
        <div class="min-w-0 flex-1">
          <h3 class="text-xl font-black text-gray-900 dark:text-gray-100 flex items-center gap-2 flex-wrap">
            <span>${esc(displayName)}</span>
            ${p.verified_at ? `<svg viewBox="0 0 24 24" aria-label="Verified website owner" xmlns="http://www.w3.org/2000/svg" style="width:22px;height:22px;flex-shrink:0;display:inline-block;vertical-align:middle;"><circle cx="12" cy="12" r="11" fill="#22c55e"/><path d="M6.8 12.4l3.4 3.4 6.9-6.9" stroke="#fff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg>` : ''}
          </h3>
		  <p class="text-sm font-semibold text-orange-600 dark:text-orange-400">u/${esc(c.username || c.handle)}</p>
          ${profilePill}
          <p class="text-sm text-gray-600 dark:text-gray-400 mt-1">${esc(c.role || '')}</p>
          ${c.subtitle ? `<p class="text-xs text-gray-500 dark:text-gray-500 mt-0.5">${esc(c.subtitle)}</p>` : ''}
          ${c.location ? `<p class="text-xs text-gray-500 dark:text-gray-500 mt-0.5">📍 ${esc(c.location)}</p>` : ''}
        </div>
      </div>
      <div class="px-6 pb-4 flex-1">
        <p class="text-xs uppercase tracking-widest text-gray-500 dark:text-gray-400 mb-3 font-bold">Contributions to ${c.tools.length} tool${c.tools.length === 1 ? '' : 's'}</p>
        <ul class="space-y-3">${contribs}</ul>
      </div>
      ${c.allTags.length ? `<div class="px-6 pb-4 flex flex-wrap gap-1.5">${c.allTags.map(t => `<span class="px-2 py-0.5 rounded-md bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300 text-[11px] font-semibold uppercase tracking-wide">${esc(t)}</span>`).join('')}</div>` : ''}
      ${linkButtons ? `<div class="px-6 pb-6 flex flex-wrap gap-2 border-t border-gray-100 dark:border-gray-800 pt-4">${linkButtons}</div>` : ''}
    </article>`;
}

export async function renderContributorsPage(rootId = 'contributors-root') {
  const root = document.getElementById(rootId);
  if (!root) return;
  root.innerHTML = '<p class="text-center text-gray-500 dark:text-gray-400 py-12">Loading contributors…</p>';

  let flat = [];
  try { flat = await loadAllTools(); } catch (e) { console.warn('[contributors]', e); }
  flat = withSiteContributors(flat);
  const merged = mergeByIdentity(flat);

  if (!merged.length) {
    root.innerHTML = '<p class="text-center text-gray-500 dark:text-gray-400 py-12">No contributors yet.</p>';
    return;
  }

  await hydrateProfiles(merged);
  root.innerHTML = `<div class="grid grid-cols-1 md:grid-cols-2 gap-6">${merged.map(card).join('')}</div>`;

  root.querySelectorAll('.contrib-more').forEach(btn => {
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