// shared/social/page-comments.js
// Self-mounting page-comments widget. Plain DOM, no Alpine, no globals.
// Server enforces: 24 cap, 30s rate limit, 500-char body, auth on write.
// Client mirrors the same UI shape via renderMarkdown + avatarSrc.

import { apiFetch, apiPost, apiDelete, getToken } from './api.js';
import { renderMarkdown } from './markdown.js';
import { formatRelativeTime } from './format.js';
import { avatarSrc } from './avatar.js';

const MAX_BODY = 1200;
const MAX_COMMENTS = 24;

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[c]);
}

function ensureStyles() {
  if (document.getElementById('pc-styles')) return;
  const st = document.createElement('style');
  st.id = 'pc-styles';
  st.textContent = `
    .pc-wrap .md-body { line-height: 1.6; overflow-wrap: anywhere; word-break: break-word; }
    .pc-wrap .md-body p { margin: 0.4em 0; }
    .pc-wrap .md-body a { color: #f97316; text-decoration: underline; }
    .pc-wrap .md-body code { font-family: ui-monospace, monospace; font-size: 0.9em; padding: 0.1em 0.35em; border-radius: 0.3em; background: rgba(0,0,0,0.06); }
    .dark .pc-wrap .md-body code { background: rgba(255,255,255,0.08); }
    .pc-wrap .md-body ul, .pc-wrap .md-body ol { padding-left: 1.3em; margin: 0.4em 0; }
    .pc-wrap .md-body blockquote { border-left: 3px solid rgba(249,115,22,0.5); padding-left: 0.7em; margin: 0.5em 0; color: #6b7280; font-style: italic; }
  `;
  document.head.appendChild(st);
}

export function mountPageComments(selector, pagePath) {
  const root = typeof selector === 'string' ? document.querySelector(selector) : selector;
  if (!root) return;
  ensureStyles();
  const page = pagePath || location.pathname;

  const state = { comments: [], submitting: false };

  root.innerHTML = `
    <div class="pc-wrap rounded-2xl border border-gray-200 dark:border-white/10 bg-white/60 dark:bg-black/30 backdrop-blur-xl p-4 sm:p-5">
      <div class="flex items-center justify-between gap-2 mb-3">
        <h3 class="text-lg font-bold flex items-center gap-2">💬 <span>Comments</span></h3>
        <span class="pc-count text-xs font-semibold text-gray-500"></span>
      </div>
      <form class="pc-form mb-4" autocomplete="off">
        <textarea class="pc-input w-full p-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white/70 dark:bg-black/40 outline-none resize-y min-h-[70px]" maxlength="${MAX_BODY}" rows="3" placeholder="Share a thought… (1200 chars max · Markdown supported)"></textarea>
        <div class="flex items-center justify-between gap-2 mt-2">
          <span class="pc-charcount text-xs text-gray-500">0 / ${MAX_BODY}</span>
          <button type="submit" class="pc-submit px-4 py-1.5 bg-gradient-to-r from-orange-500 to-pink-600 text-white text-xs font-bold rounded-lg disabled:opacity-40">Post</button>
        </div>
        <p class="pc-signin text-xs text-gray-500 mt-2 hidden"><a href="/login/" class="text-orange-500 hover:underline">Sign in</a> to comment.</p>
      </form>
      <ul class="pc-list space-y-3" aria-live="polite"></ul>
      <p class="pc-empty text-center text-sm text-gray-400 italic py-6 hidden">No comments yet. Be the first.</p>
      <p class="pc-error text-xs text-red-500 mt-2 hidden"></p>
    </div>
  `;

  const $count = root.querySelector('.pc-count');
  const $form = root.querySelector('.pc-form');
  const $input = root.querySelector('.pc-input');
  const $charCount = root.querySelector('.pc-charcount');
  const $submit = root.querySelector('.pc-submit');
  const $list = root.querySelector('.pc-list');
  const $empty = root.querySelector('.pc-empty');
  const $err = root.querySelector('.pc-error');
  const $signin = root.querySelector('.pc-signin');

  function applyAuthGate() {
    const authed = !!getToken();
    $form.classList.toggle('hidden', !authed);
    $signin.classList.toggle('hidden', authed);
  }

  function renderList() {
    $count.textContent = state.comments.length ? `${state.comments.length} / ${MAX_COMMENTS}` : '';
    $empty.classList.toggle('hidden', state.comments.length > 0);
    $list.innerHTML = state.comments.map(c => {
      const avatar = esc(avatarSrc(c));
      const name = esc(c.display_name || c.username || 'Member');
      const when = esc(formatRelativeTime(c.created_at));
      const body = renderMarkdown(c.body || '');
      const delBtn = c.can_delete
        ? `<button type="button" class="pc-del text-[11px] text-gray-400 hover:text-red-500 ml-auto" data-id="${esc(c.id)}">Delete</button>`
        : '';
      return `<li class="flex gap-2 items-start" data-cid="${esc(c.id)}">
        <img src="${avatar}" alt="" width="32" height="32" style="width:32px;height:32px;" class="rounded-full object-cover flex-shrink-0" onerror="this.onerror=null;this.src='/images/avatars/owner.svg';">
        <div class="flex-1 min-w-0 bg-gray-100 dark:bg-gray-800/60 rounded-xl px-3 py-2">
          <div class="flex items-baseline gap-2 flex-wrap">
            <span class="text-xs font-bold">${name}</span>
            <span class="text-[10px] text-gray-500">${when}</span>
            ${delBtn}
          </div>
          <div class="md-body text-sm mt-1 break-words">${body}</div>
        </div>
      </li>`;
    }).join('');
  }

  async function load() {
    $err.classList.add('hidden');
    try {
      const data = await apiFetch(`/api/page-comments?page=${encodeURIComponent(page)}`);
      state.comments = data.items || [];
      renderList();
    } catch (e) {
      $err.textContent = 'Could not load comments: ' + e.message;
      $err.classList.remove('hidden');
    }
  }

  $input.addEventListener('input', () => {
    $charCount.textContent = `${$input.value.length} / ${MAX_BODY}`;
    $submit.disabled = $input.value.trim().length === 0 || state.submitting;
  });

  $form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (state.submitting) return;
    const body = $input.value.trim();
    if (!body) return;
    state.submitting = true;
    $submit.disabled = true;
    $err.classList.add('hidden');
    try {
      const data = await apiPost('/api/page-comments', { page, body });
      if (data.success && data.comment) {
        state.comments.unshift(data.comment);
        if (state.comments.length > MAX_COMMENTS) state.comments.length = MAX_COMMENTS;
        $input.value = '';
        $charCount.textContent = `0 / ${MAX_BODY}`;
        renderList();
      } else {
        throw new Error(data.error || 'Post failed');
      }
    } catch (ex) {
      $err.textContent = ex.message;
      $err.classList.remove('hidden');
    } finally {
      state.submitting = false;
      $submit.disabled = $input.value.trim().length === 0;
    }
  });

  $list.addEventListener('click', async (e) => {
    const btn = e.target.closest('.pc-del');
    if (!btn) return;
    const id = btn.getAttribute('data-id');
    if (!id || !confirm('Delete this comment?')) return;
    try {
      await apiDelete(`/api/page-comments/${id}`);
      state.comments = state.comments.filter(c => String(c.id) !== String(id));
      renderList();
    } catch (ex) {
      $err.textContent = ex.message;
      $err.classList.remove('hidden');
    }
  });

  applyAuthGate();
  renderList();
  load();

  // Expose reload in case auth changes
  root._pageComments = { load, applyAuthGate };
  return root._pageComments;
}
