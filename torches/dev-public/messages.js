// ============================================================
// DateWizza — Messages (vanilla JS, works on every page)
// iOS-optimized: compositor-safe drawer + inline image previews
// Phase 1: search, auto-open, optimistic send+retry, grouping,
//          draft persistence, export thread
// Phase 2: edit-within-5min, clear conversation, block from thread
// Phase 3: typing indicator (ephemeral, via Durable Object relay)
// FIX: MutationObserver runaway loop + idempotent badge painting
// ============================================================
(function () {
  'use strict';
  if (window.__ttMessagesLoaded) return;
  window.__ttMessagesLoaded = true;

  const API = 'https://datewizza-auth.traffictorch.workers.dev';
  const EMOJI = ['👍', '❤️', '😂', '🎉', '👀', '🙏'];
  const MAX_LEN = 2000;
  const MAX_FILE = 5 * 1024 * 1024;
  const EDIT_WINDOW_MS = 5 * 60 * 1000;
  const ALLOWED_TYPES = [
    'image/jpeg','image/png','image/gif','image/webp','image/svg+xml',
    'application/pdf','text/plain','text/markdown','text/csv',
    'text/html','text/css','text/javascript','application/javascript',
    'application/json','application/xml','text/xml',
    'application/zip','application/x-zip-compressed',
  ];
  const ACCEPT_ATTR = [
    'image/*','application/pdf','.txt','.md','.csv',
    '.html','.htm','.css','.js','.mjs','.json','.xml','.svg','.zip'
  ].join(',');

  const IMG_EXT_RE = /\.(jpe?g|png|gif|webp|avif|heic|heif|bmp|svg)$/i;
  const GROUP_WINDOW_MS = 5 * 60 * 1000;

  const getToken = () => localStorage.getItem('authToken');
  const decodeJwt = t => { try { return JSON.parse(atob(t.split('.')[1].replace(/-/g,'+').replace(/_/g,'/'))); } catch { return null; } };
  const isAuthed = () => {
    const t = getToken();
    if (!t) return false;
    const p = decodeJwt(t);
    return p && p.exp && p.exp * 1000 > Date.now();
  };

  const esc = s => String(s ?? '').replace(/[<>&"']/g, c => ({ '<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&#39;' }[c]));
  const isDark = () => document.documentElement.classList.contains('dark');
  const T = (dark, light) => isDark() ? dark : light;
  const relTime = ts => {
    if (!ts) return '';
    const d = Date.now() - ts, m = Math.floor(d / 60000);
    if (m < 1) return 'now';
    if (m < 60) return m + 'm';
    const h = Math.floor(m / 60); if (h < 24) return h + 'h';
    const dd = Math.floor(h / 24); if (dd < 7) return dd + 'd';
    return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  };
  const avatarFor = u => {
    if (!u) return '/images/avatars/owner.svg';
    if (u.avatar_url) return u.avatar_url;
    return '/images/avatars/' + (u.avatar_preset || 'owner') + '.svg';
  };
  const truncate = (s, n) => { s = String(s || ''); return s.length > n ? s.slice(0, n) + '…' : s; };

  const isImageAttachment = a => {
    if (!a) return false;
    const mime = (a.mime_type || a.mime || a.content_type || '').toLowerCase();
    if (mime.startsWith('image/')) return true;
    return IMG_EXT_RE.test(a.filename || '');
  };

  const CODE_EXT_RE = /\.(js|mjs|cjs|jsx|ts|tsx|css|scss|less|html?|xml|json|md|markdown|py|rb|go|rs|java|c|cc|cpp|h|hpp|cs|php|sh|bash|zsh|ps1|yml|yaml|toml|ini|sql|graphql|txt|log|csv|tsv|env|gitignore|dockerfile)$/i;
  const CODE_LANG_MAP = { js:'javascript', mjs:'javascript', cjs:'javascript', jsx:'javascript', ts:'typescript', tsx:'typescript', html:'xml', htm:'xml', xml:'xml', css:'css', scss:'scss', less:'less', json:'json', md:'markdown', markdown:'markdown', py:'python', rb:'ruby', go:'go', rs:'rust', java:'java', c:'c', cc:'cpp', cpp:'cpp', h:'c', hpp:'cpp', cs:'csharp', php:'php', sh:'bash', bash:'bash', zsh:'bash', ps1:'powershell', yml:'yaml', yaml:'yaml', toml:'ini', ini:'ini', sql:'sql', graphql:'graphql', txt:'plaintext', log:'plaintext', csv:'plaintext', tsv:'plaintext', env:'bash', gitignore:'plaintext' };

  function isCodeAttachment(a) {
    if (!a) return false;
    const mime = (a.content_type || a.mime_type || a.mime || '').toLowerCase();
    if (mime.startsWith('image/')) return false;
    if (mime === 'application/pdf') return false;
    if (mime.startsWith('text/')) return true;
    if (mime === 'application/json' || mime === 'application/xml' || mime === 'application/javascript') return true;
    const m = (a.filename || '').match(/\.([a-z0-9]+)$/i);
    return m ? CODE_EXT_RE.test('.' + m[1]) : false;
  }

  function codeLangFor(filename) {
    const m = (filename || '').match(/\.([a-z0-9]+)$/i);
    if (!m) return 'plaintext';
    return CODE_LANG_MAP[m[1].toLowerCase()] || 'plaintext';
  }

  async function fetchAttachmentText(id) {
    const t = getToken();
    const res = await fetch(`${API}/api/messages/attachments/${id}`, {
      headers: { Authorization: 'Bearer ' + t }
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return await res.text();
  }

  let _hljsPromise = null;
  function loadHljs() {
    if (_hljsPromise) return _hljsPromise;
    _hljsPromise = new Promise((resolve, reject) => {
      if (window.hljs) return resolve(window.hljs);
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = 'https://cdn.jsdelivr.net/gh/highlightjs/cdn-release@11.9.0/build/styles/atom-one-dark.min.css';
      document.head.appendChild(link);
      const s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/gh/highlightjs/cdn-release@11.9.0/build/highlight.min.js';
      s.onload = () => resolve(window.hljs);
      s.onerror = reject;
      document.head.appendChild(s);
    });
    return _hljsPromise;
  }

  let me = null;
  let unreadCount = 0;
  let threads = [];
  let activeThread = null;
  let pollTimer = null;
  let newMsgTimer = null;
  let ws = null;
  let wsReconnectTimer = null;
  let wsBackoff = 1000;
  let drawerBuilt = false;
  let _inboxSearch = '';

  // Typing indicator state
  let _typingSendTimer = null;
  let _typingStopTimer = null;
  let _typingLastSent = 0;
  let _typingIndicatorTimer = null;
  let _peerTyping = false;

  let _savedScrollY = 0;
  let _kbLocked = false;
  let _touchMoveHandler = null;
  let _syncRafId = null;

  const _blobCache = new Map();

  async function api(path, opts = {}) {
    const headers = Object.assign({}, opts.headers || {});
    const t = getToken();
    if (t) headers.Authorization = 'Bearer ' + t;
    if (opts.body && !(opts.body instanceof FormData)) headers['Content-Type'] = 'application/json';
    const res = await fetch(API + path, Object.assign({}, opts, { headers }));
    let data = null;
    try { data = await res.json(); } catch {}
    if (!res.ok) throw new Error((data && data.error) || ('HTTP ' + res.status));
    return data;
  }

  async function fetchAttachmentBlob(id) {
    if (_blobCache.has(id)) return _blobCache.get(id);
    const t = getToken();
    const res = await fetch(`${API}/api/messages/attachments/${id}`, {
      headers: { Authorization: 'Bearer ' + t }
    });
    if (!res.ok) {
      let msg = 'HTTP ' + res.status;
      try { const j = await res.json(); if (j.error) msg = j.error; } catch {}
      throw new Error(msg);
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    _blobCache.set(id, url);
    return url;
  }

  async function refreshUnread() {
    if (!isAuthed()) { unreadCount = 0; paintBadges(); return; }
    try { const d = await api('/api/messages/unread-count'); unreadCount = d.count || 0; }
    catch {}
    paintBadges();
  }

  // ── FIX: idempotent paint — only touches the DOM when the value actually changes.
  //    This prevents the MutationObserver from re-firing in a loop.
  function paintBadges() {
    ['tt-beams-count', 'tt-beams-count-mobile'].forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      const next = unreadCount > 0 ? (unreadCount > 99 ? '99+' : String(unreadCount)) : '';
      const hide = unreadCount <= 0;
      if (el.textContent !== next) el.textContent = next;
      if (hide && !el.classList.contains('hidden')) el.classList.add('hidden');
      if (!hide && el.classList.contains('hidden')) el.classList.remove('hidden');
    });
  }

  function wireStaticBeamsLinks() {
    const wire = (linkId) => {
      const btn = document.getElementById(linkId);
      if (!btn || btn.dataset.ttWired === '1') return;
      btn.dataset.ttWired = '1';
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const mm = document.getElementById('mobileMenu');
        if (mm && !mm.classList.contains('hidden')) {
          mm.classList.add('hidden');
          document.body.classList.remove('overflow-hidden');
        }
        openInbox();
      });
    };
    wire('tt-beams-inbox-link');
    wire('tt-beams-inbox-link-mobile');
    paintBadges();
  }

  function waitForBeamsLinks(cb) {
    const start = Date.now();
    const iv = setInterval(() => {
      if (document.getElementById('tt-beams-inbox-link') || document.getElementById('tt-beams-inbox-link-mobile')) {
        clearInterval(iv); cb();
      } else if (Date.now() - start > 8000) {
        clearInterval(iv); cb();
      }
    }, 100);
  }

  // ---------- Typing indicator helpers ----------
  function _emitTyping() {
    if (!activeThread || !ws || ws.readyState !== WebSocket.OPEN) return;
    const now = Date.now();
    if (now - _typingLastSent < 2000) return;
    _typingLastSent = now;
    try {
      ws.send(JSON.stringify({
        type: 'typing',
        to_user_id: activeThread.peer.id,
        active: true
      }));
    } catch {}
  }

  function _stopTyping() {
    if (!activeThread || !ws || ws.readyState !== WebSocket.OPEN) return;
    if (_typingLastSent === 0) return;
    _typingLastSent = 0;
    try {
      ws.send(JSON.stringify({
        type: 'typing',
        to_user_id: activeThread.peer.id,
        active: false
      }));
    } catch {}
  }

  function _renderTypingIndicator() {
    const body = document.querySelector('#tt-msg-panel [data-tt-thread-body]');
    if (!body) return;
    let el = body.querySelector('#tt-typing-indicator');
    if (!_peerTyping) {
      if (el) el.remove();
      return;
    }
    if (!el) {
      const nearBottom = body.scrollHeight - body.scrollTop - body.clientHeight < 80;
      el = document.createElement('div');
      el.id = 'tt-typing-indicator';
      el.innerHTML = '<span class="tt-typing-dot"></span><span class="tt-typing-dot"></span><span class="tt-typing-dot"></span>';
      body.appendChild(el);
      if (nearBottom) requestAnimationFrame(() => { body.scrollTop = body.scrollHeight; });
    }
  }

  function _handleInboundTyping(fromUserId, active) {
    if (!activeThread || activeThread.peer.id !== fromUserId) return;
    if (!active) {
      _peerTyping = false;
      clearTimeout(_typingIndicatorTimer);
      _renderTypingIndicator();
      return;
    }
    _peerTyping = true;
    _renderTypingIndicator();
    clearTimeout(_typingIndicatorTimer);
    _typingIndicatorTimer = setTimeout(() => {
      _peerTyping = false;
      _renderTypingIndicator();
    }, 3000);
  }

  function _ensureTypingCSS() {
    if (document.getElementById('tt-typing-css')) return;
    const s = document.createElement('style');
    s.id = 'tt-typing-css';
    s.textContent = `
      #tt-typing-indicator {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        padding: 10px 14px;
        border-radius: 16px;
        border-bottom-left-radius: 4px;
        background: ${T('#1f2937','#f3f4f6')};
        color: ${T('#f3f4f6','#111827')};
        width: fit-content;
        margin-top: 12px;
        align-self: flex-start;
        opacity: 0;
        animation: tt-typing-in 0.18s ease-out forwards;
      }
      @keyframes tt-typing-in { to { opacity: 1; } }
      #tt-typing-indicator .tt-typing-dot {
        display: inline-block;
        width: 6px;
        height: 6px;
        border-radius: 50%;
        background: currentColor;
        opacity: 0.35;
        animation: tt-typing-bounce 1.2s infinite ease-in-out;
      }
      #tt-typing-indicator .tt-typing-dot:nth-child(2) { animation-delay: 0.15s; }
      #tt-typing-indicator .tt-typing-dot:nth-child(3) { animation-delay: 0.3s; }
      @keyframes tt-typing-bounce {
        0%, 80%, 100% { opacity: 0.3; transform: translateY(0); }
        40% { opacity: 1; transform: translateY(-3px); }
      }
    `;
    document.head.appendChild(s);
  }

  function _saveDraft(peerId, text) {
    try {
      const key = 'tt_draft_' + peerId;
      if (text && text.length) localStorage.setItem(key, text);
      else localStorage.removeItem(key);
    } catch {}
  }
  function _loadDraft(peerId) {
    try { return localStorage.getItem('tt_draft_' + peerId) || ''; } catch { return ''; }
  }

  function _lockBody() {
    if (_kbLocked) return;
    _savedScrollY = window.scrollY || document.documentElement.scrollTop || 0;
    _kbLocked = true;

    document.documentElement.style.overflow = 'hidden';
    document.body.style.overflow = 'hidden';

    if (!_touchMoveHandler) {
      _touchMoveHandler = function (e) {
        const panel = document.getElementById('tt-msg-panel');
        if (panel && panel.contains(e.target)) return;
        if (e.cancelable) e.preventDefault();
      };
      document.addEventListener('touchmove', _touchMoveHandler, { passive: false });
    }
  }

  function _unlockBody() {
    if (!_kbLocked) return;
    _kbLocked = false;

    if (_touchMoveHandler) {
      document.removeEventListener('touchmove', _touchMoveHandler);
      _touchMoveHandler = null;
    }

    document.documentElement.style.overflow = '';
    document.body.style.overflow = '';

    requestAnimationFrame(() => {
      window.scrollTo(0, _savedScrollY);
    });
  }

  function buildDrawer() {
    if (drawerBuilt) return;
    drawerBuilt = true;
    const root = document.createElement('div');
    root.id = 'tt-msg-root';
    root.innerHTML = `
      <div id="tt-msg-overlay" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:99998;isolation:isolate;will-change:opacity;transform:translateZ(0);"></div>
      <aside id="tt-msg-panel" role="dialog" aria-label="Messages" style="display:none;position:fixed;top:0;right:0;height:100dvh;width:100%;max-width:420px;z-index:99999;flex-direction:column;overflow:hidden;isolation:isolate;will-change:transform;transform:translateX(100%) translateZ(0);transition:transform 0.22s ease-out;"></aside>
    `;
    document.body.appendChild(root);
    document.getElementById('tt-msg-overlay').addEventListener('click', closeInbox);
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && document.getElementById('tt-msg-panel').style.display !== 'none') closeInbox();
    });

    installKeyboardGuard();
  }

  function installKeyboardGuard() {
    const panel = document.getElementById('tt-msg-panel');
    if (!panel) return;

    const sync = () => {
      if (!window.visualViewport) return;
      if (panel.style.display === 'none') return;
      if (_syncRafId) return;
      _syncRafId = requestAnimationFrame(() => {
        _syncRafId = null;
        const vv = window.visualViewport;
        const fullHeight = window.innerHeight || document.documentElement.clientHeight;
        const keyboardGone = vv.height >= fullHeight - 50 && vv.offsetTop < 5;

        panel.style.transition = 'none';
        if (keyboardGone) {
          panel.style.height = '100dvh';
          panel.style.transform = 'translateX(0) translateZ(0)';
        } else {
          panel.style.height = Math.round(vv.height) + 'px';
          panel.style.transform = 'translate(0px, ' + Math.round(vv.offsetTop) + 'px) translateZ(0)';
        }
        requestAnimationFrame(() => { panel.style.transition = ''; });
      });
    };

    if (!panel.dataset.ttKbWired) {
      panel.dataset.ttKbWired = '1';

      panel.addEventListener('focusin', (e) => {
        const t = e.target;
        if (t && (t.tagName === 'TEXTAREA' || t.tagName === 'INPUT')) {
          _lockBody();
          sync();
          setTimeout(sync, 50);
          setTimeout(sync, 150);
          setTimeout(sync, 300);
          setTimeout(sync, 500);
          setTimeout(sync, 800);
        }
      }, true);

      panel.addEventListener('focusout', (e) => {
        const t = e.target;
        if (t && (t.tagName === 'TEXTAREA' || t.tagName === 'INPUT')) {
          setTimeout(() => {
            const active = document.activeElement;
            if (!active || !panel.contains(active)) {
              _unlockBody();
              panel.style.height = '100dvh';
              panel.style.transform = 'translateX(0) translateZ(0)';
            }
          }, 80);
          setTimeout(() => {
            const active = document.activeElement;
            if (!active || !panel.contains(active)) {
              panel.style.height = '100dvh';
              panel.style.transform = 'translateX(0) translateZ(0)';
              sync();
            }
          }, 500);
        }
      }, true);
    }

    if (window.visualViewport && !window.__ttVvWired) {
      window.__ttVvWired = true;
      window.visualViewport.addEventListener('resize', sync);
      window.visualViewport.addEventListener('scroll', sync);
    }
  }

  function openInbox() {
    if (!isAuthed()) { window.location.href = '/login/'; return; }
    buildDrawer();
    activeThread = null;
    renderPanelContent();
    const root = document.getElementById('tt-msg-root');
    const ov = document.getElementById('tt-msg-overlay');
    const panel = document.getElementById('tt-msg-panel');

    panel.style.height = '';
    panel.style.transform = 'translateX(100%) translateZ(0)';

    root.style.display = 'block';
    ov.style.display = 'block';
    panel.style.display = 'flex';

    void panel.offsetWidth;

    _lockBody();

    requestAnimationFrame(() => {
      panel.style.transform = 'translateX(0) translateZ(0)';
    });
    loadThreads().then(() => {
      if (activeThread) return;
      const unread = threads.find(t => t.unread_count > 0);
      if (unread) openThread(unread.peer);
    });
  }

  function closeInbox() {
    const panel = document.getElementById('tt-msg-panel');
    const ov = document.getElementById('tt-msg-overlay');
    const root = document.getElementById('tt-msg-root');
    if (!panel) return;

    if (activeThread) {
      const inp = panel.querySelector('[data-tt-input]');
      if (inp) _saveDraft(activeThread.peer.id, inp.value);
    }
    clearTimeout(_typingStopTimer);
    _stopTyping();
    _peerTyping = false;
    clearTimeout(_typingIndicatorTimer);

    if (document.activeElement && panel.contains(document.activeElement) && document.activeElement.blur) {
      document.activeElement.blur();
    }

    ['tt-lightbox','tt-file-viewer','tt-code-viewer','tt-thread-menu','tt-edit-modal'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.remove();
    });

    panel.style.height = '';
    panel.style.transform = 'translateX(100%) translateZ(0)';

    requestAnimationFrame(() => {
      _unlockBody();
    });

    setTimeout(() => {
      panel.style.display = 'none';
      ov.style.display = 'none';
      root.style.display = 'none';
      panel.style.transform = 'translateX(100%) translateZ(0)';
      panel.style.height = '';
    }, 260);
  }

  function renderPanelContent() {
    const panel = document.getElementById('tt-msg-panel');
    panel.style.background = T('#111827', '#ffffff');
    panel.style.color = T('#f3f4f6', '#111827');
    if (activeThread) {
      panel.innerHTML = renderThreadView(activeThread);
      wireThreadView(panel);
    } else {
      panel.innerHTML = renderThreadList();
      wireThreadList(panel);
    }
  }

  function headerHTML(title, showBack, muted) {
    return `
      <div style="display:flex;align-items:center;gap:10px;padding:14px 16px;border-bottom:1px solid ${T('#374151','#e5e7eb')};">
        ${showBack ? `<button data-tt-back style="background:none;border:none;font-size:22px;cursor:pointer;color:inherit;padding:0 4px;">←</button>` : ''}
        <h2 style="margin:0;font-size:16px;font-weight:800;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(title)}</h2>
        ${muted !== undefined ? `<button data-tt-mute title="${muted ? 'Unmute' : 'Mute'}" style="background:none;border:1px solid ${T('#4b5563','#d1d5db')};border-radius:8px;padding:4px 8px;font-size:14px;cursor:pointer;color:inherit;">${muted ? '🔇' : '🔔'}</button>` : ''}
        ${showBack && muted !== undefined ? `<button data-tt-more title="More options" style="background:none;border:1px solid ${T('#4b5563','#d1d5db')};border-radius:8px;padding:4px 10px;font-size:16px;cursor:pointer;color:inherit;line-height:1;">⋯</button>` : ''}
        <button data-tt-close style="background:none;border:none;font-size:24px;cursor:pointer;color:inherit;line-height:1;padding:0 4px;">×</button>
      </div>`;
  }

  function renderThreadList() {
    const q = (_inboxSearch || '').trim().toLowerCase();
    const match = (t) => {
      if (!q) return true;
      const name = (t.peer.display_name || '').toLowerCase();
      const uname = (t.peer.username || '').toLowerCase();
      const last = (t.last_message && t.last_message.body || '').toLowerCase();
      return name.includes(q) || uname.includes(q) || last.includes(q);
    };

    let body = '';
    if (!threads.length) {
      body = `<div style="padding:48px 24px;text-align:center;color:${T('#9ca3af','#6b7280')};">
        <p style="font-size:36px;margin:0 0 12px;">📬</p>
        <p style="margin:0;font-weight:600;">No messages yet</p>
        <p style="margin:8px 0 0;font-size:13px;">Start a conversation from someone's profile.</p>
      </div>`;
    } else {
      body = threads.map(t => {
        const unread = t.unread_count > 0;
        const visible = match(t);
        return `<button data-tt-thread="${t.peer.id}" style="display:${visible ? 'flex' : 'none'};gap:12px;align-items:center;width:100%;padding:12px 16px;text-align:left;background:${unread ? T('rgba(249,115,22,0.10)','rgba(249,115,22,0.06)') : 'transparent'};border:none;border-bottom:1px solid ${T('#1f2937','#f3f4f6')};cursor:pointer;color:inherit;font-family:inherit;">
          <img src="${avatarFor(t.peer)}" width="44" height="44" style="width:44px;height:44px;border-radius:50%;flex-shrink:0;object-fit:cover;" alt="">
          <div style="flex:1;min-width:0;">
            <div style="display:flex;justify-content:space-between;gap:8px;align-items:baseline;">
              <span style="font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(t.peer.display_name || t.peer.username)}</span>
              <span style="font-size:11px;color:${T('#9ca3af','#6b7280')};flex-shrink:0;">${relTime(t.last_message && t.last_message.created_at)}</span>
            </div>
            <div style="font-size:13px;color:${T('#9ca3af','#6b7280')};overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(truncate(t.last_message && t.last_message.body, 60))}</div>
          </div>
          ${unread ? `<span style="min-width:20px;height:20px;padding:0 6px;font-size:11px;font-weight:800;border-radius:9999px;background:#f97316;color:#fff;display:inline-flex;align-items:center;justify-content:center;flex-shrink:0;">${t.unread_count}</span>` : ''}
        </button>`;
      }).join('');
      body += `<div data-tt-search-empty style="display:${q && !threads.some(match) ? 'block' : 'none'};padding:32px 24px;text-align:center;color:${T('#9ca3af','#6b7280')};">
        <p style="margin:0;font-size:13px;">No threads match your search.</p>
      </div>`;
    }

    const searchBar = threads.length ? `
      <div style="padding:8px 12px;border-bottom:1px solid ${T('#374151','#e5e7eb')};">
        <input data-tt-search type="search" value="${esc(_inboxSearch)}" placeholder="Search threads…" autocorrect="off" autocapitalize="off" spellcheck="false"
               style="width:100%;box-sizing:border-box;padding:8px 12px;border:1px solid ${T('#4b5563','#d1d5db')};border-radius:8px;background:${T('#0f172a','#ffffff')};color:inherit;font-family:inherit;font-size:14px;outline:none;">
      </div>` : '';

    return headerHTML('Beams 🔦', false) +
      searchBar +
      `<div data-tt-inbox-list style="flex:1;overflow-y:auto;contain:content;-webkit-overflow-scrolling:touch;">${body}</div>`;
  }

  function renderAttachmentHTML(a) {
    if (isImageAttachment(a)) {
      return `<div data-tt-img-wrap="${a.id}" style="margin-top:6px;">
        <img data-tt-img="${a.id}" data-tt-filename="${esc(a.filename)}" alt="${esc(a.filename)}"
             style="max-width:100%;max-height:260px;border-radius:10px;display:block;cursor:pointer;background:transparent;opacity:0;transition:opacity 0.18s ease;" loading="lazy">
      </div>`;
    }
    const mime = a.mime_type || a.mime || a.content_type || '';
    return `<a data-tt-att="${a.id}" data-tt-filename="${esc(a.filename)}" data-tt-mime="${esc(mime)}" href="#" style="display:block;font-size:12px;text-decoration:underline;color:inherit;margin-top:4px;cursor:pointer;">📎 ${esc(a.filename)}</a>`;
  }

  function renderThreadView(th) {
    const peer = th.peer || {};
    const msgs = th.messages || [];
    let listHTML = '';
    if (th.hasMore) {
      listHTML += `<button data-tt-load-older style="display:block;width:100%;padding:10px;background:none;border:none;color:#f97316;cursor:pointer;font-family:inherit;font-size:13px;">Load older messages</button>`;
    }
    if (!msgs.length) {
      listHTML += `<p style="text-align:center;color:${T('#9ca3af','#6b7280')};padding:32px 16px;font-size:14px;">No messages yet. Say hi 👋</p>`;
    }
    const myId = me && me.id;
    const now = Date.now();
    let prev = null;
    msgs.forEach(m => {
      const mine = m.from_user_id === myId;
      const grouped = prev
        && prev.from_user_id === m.from_user_id
        && (m.created_at - prev.created_at) < GROUP_WINDOW_MS;
      prev = m;

      const bubbleBg = mine ? '#f97316' : T('#1f2937','#f3f4f6');
      const bubbleFg = mine ? '#ffffff' : T('#f3f4f6','#111827');
      const attachments = (m.attachments || []).map(renderAttachmentHTML).join('');
      const reactions = (m.reactions || []).length
        ? `<div style="display:flex;flex-wrap:wrap;gap:4px;margin-top:6px;">` + m.reactions.map(r =>
            `<button data-tt-react="${m.id}" data-tt-emoji="${esc(r.emoji)}" style="padding:2px 8px;font-size:11px;border-radius:9999px;border:1px solid ${r.mine ? 'rgba(255,255,255,0.7)' : 'transparent'};background:rgba(0,0,0,0.15);color:inherit;cursor:pointer;font-family:inherit;">${esc(r.emoji)} ${r.count}</button>`
          ).join('') + `</div>` : '';
      const replyIndicator = m.reply_to_id
        ? `<div style="font-size:10px;opacity:0.7;margin-bottom:4px;border-left:2px solid currentColor;padding-left:6px;">↩ reply</div>`
        : '';

      const editable = mine && !m._status && !m.is_deleted
        && (now - m.created_at) < EDIT_WINDOW_MS;

      const statusParts = [];
      if (m._status === 'sending') statusParts.push('<span style="opacity:0.9;">⏳</span>');
      if (m._status === 'failed') statusParts.push('<span style="color:#7f1d1d;background:#fecaca;padding:1px 6px;border-radius:4px;font-weight:700;opacity:1;">⚠ Not sent</span>');
      if (mine && m.is_read && !m._status) statusParts.push('<span>✓</span>');
      if (m.edited_at) statusParts.push('<span style="opacity:0.75;font-style:italic;">· edited</span>');

      const delBtn = (mine && !m._status)
        ? `<button data-tt-del="${m.id}" style="background:none;border:none;color:inherit;cursor:pointer;font-size:11px;opacity:0.7;">🗑</button>`
        : '';
      const editBtn = editable
        ? `<button data-tt-edit="${m.id}" style="background:none;border:none;color:inherit;cursor:pointer;font-size:11px;opacity:0.85;text-decoration:underline;">Edit</button>`
        : '';
      const retryBtn = (m._status === 'failed')
        ? `<button data-tt-retry="${m._tempId}" style="background:none;border:none;color:inherit;cursor:pointer;font-size:11px;font-weight:700;opacity:1;text-decoration:underline;">Retry</button>`
        : '';
      const replyBtn = !m._status
        ? `<button data-tt-reply="${m.id}" style="background:none;border:none;color:inherit;cursor:pointer;font-size:11px;opacity:0.7;">↩</button>`
        : '';

      listHTML += `<div style="display:flex;justify-content:${mine ? 'flex-end' : 'flex-start'};margin-top:${grouped ? '2px' : '12px'}">
        <div style="max-width:80%;background:${bubbleBg};color:${bubbleFg};padding:8px 12px;border-radius:16px;${mine ? 'border-bottom-right-radius:4px;' : 'border-bottom-left-radius:4px;'}">
          ${replyIndicator}
          <div style="font-size:14px;white-space:pre-wrap;word-break:break-word;">${esc(m.body)}</div>
          ${attachments}
          ${reactions}
          <div style="position:relative;margin-top:4px;">
            ${!m._status ? `<button data-tt-picker="${m.id}" style="background:none;border:none;color:inherit;opacity:0.6;cursor:pointer;font-size:12px;padding:2px 4px;font-family:inherit;">+😀</button>` : ''}
          </div>
          <div style="display:flex;gap:8px;align-items:center;margin-top:6px;font-size:10px;opacity:0.7;">
            <span>${relTime(m.created_at)}</span>
            ${statusParts.join('')}
            <span style="margin-left:auto;display:flex;gap:8px;align-items:center;">
              ${editBtn}
              ${delBtn}
              ${retryBtn}
              ${replyBtn}
            </span>
          </div>
        </div>
      </div>`;
    });

    let replyQuote = '';
    if (th.reply_to_id) {
      const parent = (th.messages || []).find(x => x.id === th.reply_to_id);
      const preview = parent ? (parent.body || '').slice(0, 80) : '(message)';
      replyQuote = `<div style="font-size:11px;color:${T('#9ca3af','#6b7280')};margin-bottom:6px;padding:6px 8px;background:${T('#1f2937','#f3f4f6')};border-left:3px solid #f97316;border-radius:4px;display:flex;justify-content:space-between;gap:8px;">
        <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;"><strong>Replying:</strong> ${esc(preview)}</span>
        <button data-tt-cancel-reply style="background:none;border:none;color:#f97316;cursor:pointer;font-family:inherit;font-size:11px;flex-shrink:0;">Cancel</button>
      </div>`;
    }

    const draft = _loadDraft(th.peer.id);
    const composeBar = `
      <div style="border-top:1px solid ${T('#374151','#e5e7eb')};padding:12px;">
        ${replyQuote}
        ${th.attachments && th.attachments.length ? th.attachments.map(a => `<div style="font-size:12px;margin-bottom:6px;">📎 ${esc(a.filename)} <button data-tt-remove-att="${esc(a.key)}" style="background:none;border:none;color:#ef4444;cursor:pointer;font-family:inherit;">×</button></div>`).join('') : ''}
        <div style="display:flex;gap:8px;align-items:flex-end;">
          <label style="cursor:pointer;padding:8px;border-radius:8px;background:${T('#1f2937','#f3f4f6')};color:inherit;font-size:16px;">
            📎<input data-tt-file type="file" style="display:none;" accept="${ACCEPT_ATTR}">
          </label>
          <textarea data-tt-input maxlength="${MAX_LEN}" rows="1" placeholder="Message…" style="flex:1;padding:8px;border:1px solid ${T('#4b5563','#d1d5db')};border-radius:8px;background:${T('#0f172a','#ffffff')};color:inherit;font-family:inherit;font-size:16px;resize:none;outline:none;">${esc(draft)}</textarea>
          <button data-tt-send style="padding:8px 16px;border:none;border-radius:8px;background:linear-gradient(135deg,#f97316,#ec4899);color:#fff;font-weight:700;cursor:pointer;font-family:inherit;">Send</button>
        </div>
        <p data-tt-error style="color:#ef4444;font-size:12px;margin:6px 0 0;display:none;"></p>
      </div>`;

    return headerHTML(peer.display_name || peer.username || 'Thread', true, th.muted) +
      `<div data-tt-thread-body style="flex:1 1 0;min-height:0;overflow-y:auto;padding:16px;display:flex;flex-direction:column;gap:0;contain:content;-webkit-overflow-scrolling:touch;">${listHTML}</div>` +
      composeBar;
  }

  function openLightbox(url, filename) {
    const existing = document.getElementById('tt-lightbox');
    if (existing) existing.remove();
    const box = document.createElement('div');
    box.id = 'tt-lightbox';
    box.style.cssText = 'position:fixed;inset:0;z-index:2147483645;background:rgba(0,0,0,0.94);display:flex;align-items:center;justify-content:center;padding:16px;isolation:isolate;';
    box.innerHTML = `
      <img src="${url}" alt="${esc(filename)}" style="max-width:100%;max-height:calc(100% - 80px);object-fit:contain;border-radius:8px;user-select:none;-webkit-user-select:none;-webkit-touch-callout:default;">
      <button data-tt-lb-close aria-label="Close" style="position:absolute;top:14px;right:14px;background:rgba(255,255,255,0.15);color:#fff;border:0;width:44px;height:44px;border-radius:50%;font-size:24px;cursor:pointer;">×</button>
      <div style="position:absolute;bottom:20px;left:0;right:0;display:flex;flex-direction:column;align-items:center;gap:8px;pointer-events:none;">
        <p style="margin:0;color:rgba(255,255,255,0.7);font-size:12px;font-family:system-ui,-apple-system,sans-serif;pointer-events:none;">Long-press the image to save to Photos</p>
        <a href="${url}" download="${esc(filename)}" style="pointer-events:auto;background:linear-gradient(135deg,#f97316,#ec4899);color:#fff;padding:10px 22px;border-radius:9999px;font-weight:700;text-decoration:none;font-size:14px;font-family:system-ui,-apple-system,sans-serif;">Save / Download</a>
      </div>
    `;
    document.documentElement.appendChild(box);
    box.querySelector('[data-tt-lb-close]').addEventListener('click', () => box.remove());
    box.addEventListener('click', (e) => { if (e.target === box) box.remove(); });
  }

  function openFileViewer(url, filename, mime) {
    const existing = document.getElementById('tt-file-viewer');
    if (existing) existing.remove();
    const box = document.createElement('div');
    box.id = 'tt-file-viewer';
    box.style.cssText = 'position:fixed;inset:0;z-index:2147483645;background:rgba(0,0,0,0.94);display:flex;flex-direction:column;align-items:center;justify-content:center;padding:24px 16px;isolation:isolate;gap:18px;';
    box.innerHTML = `
      <div style="background:rgba(255,255,255,0.08);border-radius:14px;padding:28px 32px;text-align:center;max-width:340px;width:100%;">
        <div style="font-size:56px;line-height:1;margin-bottom:14px;">📎</div>
        <p style="margin:0 0 6px;color:#fff;font-weight:700;font-size:15px;word-break:break-all;font-family:system-ui,-apple-system,sans-serif;">${esc(filename)}</p>
        <p style="margin:0;color:rgba(255,255,255,0.5);font-size:12px;font-family:system-ui,-apple-system,sans-serif;">${esc(mime || 'file')}</p>
      </div>
      <div style="display:flex;flex-direction:column;gap:10px;width:100%;max-width:340px;">
        <a href="${url}" target="_blank" rel="noopener" style="background:linear-gradient(135deg,#f97316,#ec4899);color:#fff;padding:13px 22px;border-radius:9999px;font-weight:700;text-decoration:none;font-size:15px;text-align:center;font-family:system-ui,-apple-system,sans-serif;">Open in new tab</a>
        <a href="${url}" download="${esc(filename)}" style="background:rgba(255,255,255,0.15);color:#fff;padding:13px 22px;border-radius:9999px;font-weight:700;text-decoration:none;font-size:15px;text-align:center;font-family:system-ui,-apple-system,sans-serif;">Download / Save</a>
        <button data-tt-fv-close style="background:transparent;color:rgba(255,255,255,0.65);border:0;padding:10px;font-size:14px;cursor:pointer;font-family:system-ui,-apple-system,sans-serif;">Close</button>
      </div>
      <button data-tt-fv-x aria-label="Close" style="position:absolute;top:14px;right:14px;background:rgba(255,255,255,0.15);color:#fff;border:0;width:44px;height:44px;border-radius:50%;font-size:24px;cursor:pointer;">×</button>
    `;
    document.documentElement.appendChild(box);
    const close = () => box.remove();
    box.querySelector('[data-tt-fv-close]').addEventListener('click', close);
    box.querySelector('[data-tt-fv-x]').addEventListener('click', close);
    box.addEventListener('click', (e) => { if (e.target === box) close(); });
  }

  async function openCodeViewer(attachment) {
    const existing = document.getElementById('tt-code-viewer');
    if (existing) existing.remove();

    const id = attachment.id;
    const filename = attachment.filename || 'file';
    const lang = codeLangFor(filename);

    const box = document.createElement('div');
    box.id = 'tt-code-viewer';
    box.style.cssText = 'position:fixed;inset:0;z-index:2147483646;background:#1e1e1e;display:flex;flex-direction:column;isolation:isolate;';
    box.innerHTML = `
      <div style="display:flex;align-items:center;gap:10px;padding:12px 16px;background:#141414;color:#e5e7eb;border-bottom:1px solid #333;font-family:system-ui,-apple-system,sans-serif;flex-shrink:0;">
        <span style="font-weight:700;font-size:14px;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(filename)}</span>
        <span style="font-size:11px;text-transform:uppercase;padding:2px 8px;border-radius:4px;background:rgba(249,115,22,0.2);color:#fb923c;font-weight:700;">${esc(lang)}</span>
        <button data-tt-cv-copy style="background:#f97316;color:#fff;border:0;padding:6px 14px;border-radius:6px;font-weight:700;font-size:12px;cursor:pointer;font-family:inherit;">Copy all</button>
        <button data-tt-cv-close aria-label="Close" style="background:rgba(255,255,255,0.12);color:#fff;border:0;width:32px;height:32px;border-radius:6px;font-size:20px;cursor:pointer;line-height:1;">×</button>
      </div>
      <div data-tt-cv-body style="flex:1;overflow:auto;display:flex;background:#1e1e1e;color:#e5e7eb;font-family:'SF Mono',Menlo,Consolas,monospace;font-size:13px;line-height:1.55;user-select:text;-webkit-user-select:text;-webkit-overflow-scrolling:touch;">
        <div data-tt-cv-gutter style="flex-shrink:0;padding:16px 12px 16px 16px;text-align:right;color:#6b7280;user-select:none;-webkit-user-select:none;white-space:pre;font-family:inherit;font-size:inherit;line-height:inherit;border-right:1px solid #2a2a2a;"></div>
        <pre style="flex:1;margin:0;padding:16px;overflow:visible;white-space:pre;font-family:inherit;font-size:inherit;line-height:inherit;"><code data-tt-cv-code style="font-family:inherit;font-size:inherit;line-height:inherit;background:transparent;">Loading…</code></pre>
      </div>
    `;
    document.documentElement.appendChild(box);

    const close = () => {
      document.removeEventListener('keydown', escClose);
      box.remove();
    };
    const escClose = (e) => { if (e.key === 'Escape') close(); };
    box.querySelector('[data-tt-cv-close]').addEventListener('click', close);
    document.addEventListener('keydown', escClose);

    let rawText = '';
    try {
      rawText = await fetchAttachmentText(id);
    } catch (err) {
      box.querySelector('[data-tt-cv-body]').innerHTML =
        '<div style="padding:24px;color:#ef4444;font-family:system-ui,sans-serif;">Could not load file: ' + esc(err.message) + '</div>';
      return;
    }

    const lines = rawText.split('\n');
    box.querySelector('[data-tt-cv-gutter]').textContent = lines.map((_, i) => i + 1).join('\n');

    const codeEl = box.querySelector('[data-tt-cv-code]');
    codeEl.textContent = rawText;

    try {
      const hljs = await loadHljs();
      if (lang !== 'plaintext' && hljs.getLanguage(lang)) {
        codeEl.className = 'hljs language-' + lang;
        codeEl.innerHTML = hljs.highlight(rawText, { language: lang, ignoreIllegals: true }).value;
      } else {
        codeEl.className = 'hljs';
        codeEl.innerHTML = hljs.highlightAuto(rawText).value;
      }
    } catch {
      codeEl.textContent = rawText;
    }

    const copyBtn = box.querySelector('[data-tt-cv-copy]');
    copyBtn.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(rawText);
      } catch {
        const ta = document.createElement('textarea');
        ta.value = rawText;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        try { document.execCommand('copy'); } catch {}
        ta.remove();
      }
      const prev = copyBtn.textContent;
      copyBtn.textContent = 'Copied ✓';
      setTimeout(() => { copyBtn.textContent = prev; }, 1500);
    });
  }

  function openThreadMenu() {
    const existing = document.getElementById('tt-thread-menu');
    if (existing) existing.remove();
    if (!activeThread) return;

    const peer = activeThread.peer || {};
    const username = peer.username || 'this user';

    const box = document.createElement('div');
    box.id = 'tt-thread-menu';
    box.style.cssText = 'position:fixed;inset:0;z-index:2147483645;background:rgba(0,0,0,0.55);display:flex;align-items:center;justify-content:center;padding:24px;isolation:isolate;';
    box.innerHTML = `
      <div style="background:${T('#111827','#ffffff')};color:${T('#f3f4f6','#111827')};border-radius:14px;max-width:340px;width:100%;overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,0.5);font-family:system-ui,-apple-system,sans-serif;">
        <div style="padding:16px;border-bottom:1px solid ${T('#374151','#e5e7eb')};">
          <p style="margin:0;font-weight:700;font-size:15px;">Thread options</p>
          <p style="margin:4px 0 0;font-size:12px;opacity:0.65;">With @${esc(username)}</p>
        </div>
        <button data-tt-menu-export style="display:block;width:100%;padding:14px 16px;background:none;border:none;border-bottom:1px solid ${T('#1f2937','#f3f4f6')};text-align:left;font-size:14px;color:inherit;cursor:pointer;font-family:inherit;">⤓ Export conversation (.txt)</button>
        <button data-tt-menu-clear style="display:block;width:100%;padding:14px 16px;background:none;border:none;border-bottom:1px solid ${T('#1f2937','#f3f4f6')};text-align:left;font-size:14px;color:#ef4444;cursor:pointer;font-family:inherit;">🗑 Clear conversation</button>
        <button data-tt-menu-block style="display:block;width:100%;padding:14px 16px;background:none;border:none;border-bottom:1px solid ${T('#1f2937','#f3f4f6')};text-align:left;font-size:14px;color:#ef4444;cursor:pointer;font-family:inherit;">🚫 Block @${esc(username)}</button>
        <button data-tt-menu-cancel style="display:block;width:100%;padding:14px 16px;background:none;border:none;text-align:center;font-size:14px;color:inherit;cursor:pointer;font-family:inherit;opacity:0.75;">Cancel</button>
      </div>
    `;
    document.documentElement.appendChild(box);

    const close = () => box.remove();
    box.addEventListener('click', (e) => { if (e.target === box) close(); });
    box.querySelector('[data-tt-menu-cancel]').addEventListener('click', close);
    box.querySelector('[data-tt-menu-export]').addEventListener('click', () => { close(); exportThread(); });
    box.querySelector('[data-tt-menu-clear]').addEventListener('click', () => { close(); clearThread(); });
    box.querySelector('[data-tt-menu-block]').addEventListener('click', () => { close(); blockCurrentPeer(); });
  }

  async function clearThread() {
    if (!activeThread) return;
    const peer = activeThread.peer || {};
    const label = peer.username || peer.display_name || 'this user';
    if (!confirm(`Clear your conversation with ${label}? This only affects your side — they will still see the messages. New messages will reappear here.`)) return;

    try {
      await api('/api/messages/thread/' + encodeURIComponent(peer.username) + '/clear', { method: 'POST' });
      activeThread = null;
      _saveDraft(peer.id, '');
      renderPanelContent();
      loadThreads();
    } catch (e) {
      alert('Could not clear: ' + e.message);
    }
  }

  async function blockCurrentPeer() {
    if (!activeThread) return;
    const peer = activeThread.peer || {};
    const label = peer.username || peer.display_name || 'this user';
    if (!confirm(`Block ${label}? They won't be able to message you, and this thread will be removed.`)) return;

    try {
      await api('/api/messages/block/' + peer.id, { method: 'POST' });
      activeThread = null;
      _saveDraft(peer.id, '');
      threads = threads.filter(t => t.peer.id !== peer.id);
      renderPanelContent();
      loadThreads();
    } catch (e) {
      alert('Could not block: ' + e.message);
    }
  }

  function openEditModal(messageId) {
    if (!activeThread) return;
    const msg = activeThread.messages.find(m => String(m.id) === String(messageId));
    if (!msg) return;

    const existing = document.getElementById('tt-edit-modal');
    if (existing) existing.remove();

    const box = document.createElement('div');
    box.id = 'tt-edit-modal';
    box.style.cssText = 'position:fixed;inset:0;z-index:2147483646;background:rgba(0,0,0,0.6);display:flex;align-items:center;justify-content:center;padding:20px;isolation:isolate;';
    box.innerHTML = `
      <div style="background:${T('#111827','#ffffff')};color:${T('#f3f4f6','#111827')};border-radius:14px;max-width:420px;width:100%;padding:18px;box-shadow:0 20px 60px rgba(0,0,0,0.5);font-family:system-ui,-apple-system,sans-serif;">
        <p style="margin:0 0 12px;font-weight:700;font-size:15px;">Edit message</p>
        <textarea data-tt-edit-input maxlength="${MAX_LEN}" rows="4" style="width:100%;box-sizing:border-box;padding:10px;border:1px solid ${T('#4b5563','#d1d5db')};border-radius:8px;background:${T('#0f172a','#ffffff')};color:inherit;font-family:inherit;font-size:15px;resize:vertical;outline:none;"></textarea>
        <p data-tt-edit-count style="margin:6px 0 0;font-size:11px;text-align:right;opacity:0.6;">0 / ${MAX_LEN}</p>
        <p data-tt-edit-error style="margin:8px 0 0;font-size:12px;color:#ef4444;display:none;"></p>
        <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:14px;">
          <button data-tt-edit-cancel style="padding:9px 16px;border-radius:8px;border:1px solid ${T('#4b5563','#d1d5db')};background:transparent;color:inherit;font-weight:600;cursor:pointer;font-family:inherit;">Cancel</button>
          <button data-tt-edit-save style="padding:9px 20px;border-radius:8px;border:none;background:linear-gradient(135deg,#f97316,#ec4899);color:#fff;font-weight:700;cursor:pointer;font-family:inherit;">Save</button>
        </div>
      </div>
    `;
    document.documentElement.appendChild(box);

    const ta = box.querySelector('[data-tt-edit-input]');
    const count = box.querySelector('[data-tt-edit-count]');
    const err = box.querySelector('[data-tt-edit-error]');
    const saveBtn = box.querySelector('[data-tt-edit-save]');
    const cancelBtn = box.querySelector('[data-tt-edit-cancel]');

    ta.value = msg.body || '';
    count.textContent = ta.value.length + ' / ' + MAX_LEN;
    ta.focus();
    try { ta.setSelectionRange(ta.value.length, ta.value.length); } catch {}

    ta.addEventListener('input', () => { count.textContent = ta.value.length + ' / ' + MAX_LEN; });

    const close = () => box.remove();
    const onKey = (e) => {
      if (e.key === 'Escape') { document.removeEventListener('keydown', onKey); close(); }
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') doSave();
    };
    document.addEventListener('keydown', onKey);
    cancelBtn.addEventListener('click', () => { document.removeEventListener('keydown', onKey); close(); });
    box.addEventListener('click', (e) => { if (e.target === box) { document.removeEventListener('keydown', onKey); close(); } });

    async function doSave() {
      const newBody = (ta.value || '').trim();
      if (!newBody) { err.textContent = 'Message cannot be empty.'; err.style.display = 'block'; return; }
      if (newBody === (msg.body || '')) { document.removeEventListener('keydown', onKey); close(); return; }

      saveBtn.disabled = true;
      saveBtn.textContent = 'Saving…';
      err.style.display = 'none';

      try {
        const d = await api('/api/messages/' + msg.id, {
          method: 'PATCH',
          body: JSON.stringify({ body: newBody })
        });
        const i = activeThread.messages.findIndex(m => m.id === msg.id);
        if (i >= 0) activeThread.messages[i] = d.message;
        document.removeEventListener('keydown', onKey);
        close();
        renderPanelContent();
      } catch (e) {
        err.textContent = e.message || 'Could not save';
        err.style.display = 'block';
        saveBtn.disabled = false;
        saveBtn.textContent = 'Save';
      }
    }

    saveBtn.addEventListener('click', doSave);
  }

  function showEmojiPicker(anchor, messageId) {
    const existing = document.getElementById('tt-emoji-picker');
    if (existing) existing.remove();
    const picker = document.createElement('div');
    picker.id = 'tt-emoji-picker';
    const dark = isDark();
    picker.style.cssText = `position:fixed;background:${dark ? '#1f2937' : '#ffffff'};border:1px solid ${dark ? '#374151' : '#e5e7eb'};border-radius:10px;box-shadow:0 8px 24px rgba(0,0,0,0.25);padding:6px;display:flex;gap:4px;z-index:2147483647;`;
    EMOJI.forEach(em => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = em;
      btn.style.cssText = `background:none;border:none;font-size:22px;cursor:pointer;padding:4px 6px;border-radius:6px;font-family:inherit;`;
      btn.addEventListener('mouseenter', () => { btn.style.background = dark ? '#374151' : '#f3f4f6'; });
      btn.addEventListener('mouseleave', () => { btn.style.background = 'none'; });
      btn.addEventListener('click', async () => {
        picker.remove();
        await toggleReaction(messageId, em);
      });
      picker.appendChild(btn);
    });
    const r = anchor.getBoundingClientRect();
    picker.style.top = Math.max(8, r.top - 52) + 'px';
    picker.style.left = Math.min(r.left, window.innerWidth - 260) + 'px';
    document.documentElement.appendChild(picker);
    setTimeout(() => {
      const close = (ev) => {
        if (!picker.contains(ev.target)) { picker.remove(); document.removeEventListener('click', close); }
      };
      document.addEventListener('click', close);
    }, 10);
  }

  function wireThreadList(panel) {
    panel.querySelector('[data-tt-close]').addEventListener('click', closeInbox);

    const searchInput = panel.querySelector('[data-tt-search]');
    if (searchInput) {
      searchInput.addEventListener('input', () => {
        _inboxSearch = searchInput.value;
        const q = _inboxSearch.trim().toLowerCase();
        let anyVisible = false;
        panel.querySelectorAll('[data-tt-thread]').forEach(btn => {
          const id = parseInt(btn.getAttribute('data-tt-thread'));
          const t = threads.find(x => x.peer.id === id);
          if (!t) { btn.style.display = 'none'; return; }
          const name = (t.peer.display_name || '').toLowerCase();
          const uname = (t.peer.username || '').toLowerCase();
          const last = (t.last_message && t.last_message.body || '').toLowerCase();
          const visible = !q || name.includes(q) || uname.includes(q) || last.includes(q);
          btn.style.display = visible ? 'flex' : 'none';
          if (visible) anyVisible = true;
        });
        const emptyEl = panel.querySelector('[data-tt-search-empty]');
        if (emptyEl) emptyEl.style.display = (q && !anyVisible) ? 'block' : 'none';
      });
    }

    panel.querySelectorAll('[data-tt-thread]').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = parseInt(btn.getAttribute('data-tt-thread'));
        const t = threads.find(x => x.peer.id === id);
        if (t) openThread(t.peer);
      });
    });
  }

  function wireThreadView(panel) {
    panel.querySelector('[data-tt-close]').addEventListener('click', closeInbox);
    const back = panel.querySelector('[data-tt-back]');
    if (back) back.addEventListener('click', () => {
      clearTimeout(_typingStopTimer);
      _stopTyping();
      _peerTyping = false;
      clearTimeout(_typingIndicatorTimer);
      if (activeThread) {
        const inp = panel.querySelector('[data-tt-input]');
        if (inp) _saveDraft(activeThread.peer.id, inp.value);
      }
      if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
      _unlockBody();
      panel.style.height = '';
      panel.style.transform = 'translateX(0) translateZ(0)';
      activeThread = null;
      renderPanelContent();
      loadThreads();
    });
    const mute = panel.querySelector('[data-tt-mute]');
    if (mute) mute.addEventListener('click', toggleMute);
    const moreBtn = panel.querySelector('[data-tt-more]');
    if (moreBtn) moreBtn.addEventListener('click', openThreadMenu);
    const older = panel.querySelector('[data-tt-load-older]');
    if (older) older.addEventListener('click', loadOlder);

    panel.querySelectorAll('[data-tt-del]').forEach(b => b.addEventListener('click', () => deleteMsg(parseInt(b.getAttribute('data-tt-del')))));
    panel.querySelectorAll('[data-tt-retry]').forEach(b => b.addEventListener('click', () => retrySend(b.getAttribute('data-tt-retry'))));
    panel.querySelectorAll('[data-tt-edit]').forEach(b => b.addEventListener('click', () => openEditModal(b.getAttribute('data-tt-edit'))));
    panel.querySelectorAll('[data-tt-reply]').forEach(b => b.addEventListener('click', () => {
      activeThread.reply_to_id = parseInt(b.getAttribute('data-tt-reply'));
      renderPanelContent();
    }));
    panel.querySelectorAll('[data-tt-react]').forEach(b => b.addEventListener('click', () => {
      toggleReaction(parseInt(b.getAttribute('data-tt-react')), b.getAttribute('data-tt-emoji'));
    }));
    panel.querySelectorAll('[data-tt-picker]').forEach(b => {
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        const msgId = parseInt(b.getAttribute('data-tt-picker'));
        showEmojiPicker(b, msgId);
      });
    });

    panel.querySelectorAll('[data-tt-img]').forEach(img => {
      const id = parseInt(img.getAttribute('data-tt-img'));
      const filename = img.getAttribute('data-tt-filename');
      fetchAttachmentBlob(id).then(url => {
        img.addEventListener('load', () => { img.style.opacity = '1'; }, { once: true });
        img.addEventListener('error', () => {
          img.style.opacity = '1';
          img.alt = 'Image failed to load';
          img.style.padding = '16px';
          img.style.fontSize = '12px';
          img.style.color = 'rgba(255,255,255,0.7)';
        }, { once: true });
        img.src = url;
        img.addEventListener('click', () => openLightbox(url, filename));
      }).catch(() => {
        img.style.opacity = '1';
        img.alt = 'Failed to load ' + filename;
        img.style.padding = '16px';
        img.style.fontSize = '12px';
        img.style.color = 'rgba(255,255,255,0.7)';
      });
    });

    panel.querySelectorAll('[data-tt-att]').forEach(a => {
      a.addEventListener('click', async (e) => {
        e.preventDefault();
        const id = parseInt(a.getAttribute('data-tt-att'));
        const filename = a.getAttribute('data-tt-filename');
        const mime = a.getAttribute('data-tt-mime') || '';
        const att = { id, filename, content_type: mime };

        if (isCodeAttachment(att)) {
          openCodeViewer(att);
          return;
        }
        try {
          const url = await fetchAttachmentBlob(id);
          openFileViewer(url, filename, mime);
        } catch (err) {
          alert('Could not open: ' + err.message);
        }
      });
    });

    const cancelReply = panel.querySelector('[data-tt-cancel-reply]');
    if (cancelReply) cancelReply.addEventListener('click', () => { activeThread.reply_to_id = null; renderPanelContent(); });
    panel.querySelectorAll('[data-tt-remove-att]').forEach(b => b.addEventListener('click', () => {
      activeThread.attachments = (activeThread.attachments || []).filter(a => a.key !== b.getAttribute('data-tt-remove-att'));
      renderPanelContent();
    }));
    const file = panel.querySelector('[data-tt-file]');
    if (file) file.addEventListener('change', onFilePicked);
    const send = panel.querySelector('[data-tt-send]');
    const input = panel.querySelector('[data-tt-input]');
    if (send) send.addEventListener('click', sendCurrent);
    if (input) {
      input.addEventListener('keydown', e => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendCurrent(); }
      });
      let draftTimer = null;
      input.addEventListener('input', () => {
        clearTimeout(draftTimer);
        const val = input.value;
        draftTimer = setTimeout(() => {
          if (activeThread) _saveDraft(activeThread.peer.id, val);
        }, 300);
        _emitTyping();
        clearTimeout(_typingStopTimer);
        _typingStopTimer = setTimeout(_stopTyping, 2000);
      });
      input.addEventListener('blur', () => {
        if (activeThread) _saveDraft(activeThread.peer.id, input.value);
        clearTimeout(_typingStopTimer);
        _stopTyping();
      });
      input.focus();
      const len = input.value.length;
      if (len) try { input.setSelectionRange(len, len); } catch {}
    }
    const body = panel.querySelector('[data-tt-thread-body]');
    if (body) {
      requestAnimationFrame(() => { body.scrollTop = body.scrollHeight; });

      if (!body.dataset.ttOverscrollWired) {
        body.dataset.ttOverscrollWired = '1';
        let startY = 0;
        body.addEventListener('touchstart', (e) => {
          startY = e.touches[0].clientY;
        }, { passive: true });
        body.addEventListener('touchmove', (e) => {
          const delta = e.touches[0].clientY - startY;
          const atTop = body.scrollTop <= 0;
          const atBottom = body.scrollTop + body.clientHeight >= body.scrollHeight - 1;
          if ((atTop && delta > 0) || (atBottom && delta < 0)) {
            if (e.cancelable) e.preventDefault();
          }
        }, { passive: false });
      }

      if (_peerTyping) _renderTypingIndicator();
    }
  }

  async function loadThreads() {
    try {
      const d = await api('/api/messages/inbox?limit=50');
      threads = d.threads || [];
    } catch (e) { threads = []; }
    if (!activeThread) renderPanelContent();
  }

  async function openThread(peer) {
    clearTimeout(_typingStopTimer);
    _stopTyping();
    _peerTyping = false;
    clearTimeout(_typingIndicatorTimer);
    const _pnl = document.getElementById('tt-msg-panel');
    if (_pnl && activeThread && activeThread.peer.id !== peer.id) {
      const _inp = _pnl.querySelector('[data-tt-input]');
      if (_inp) _saveDraft(activeThread.peer.id, _inp.value);
    }
    activeThread = { peer, messages: [], hasMore: false, cursor: null, muted: false, reply_to_id: null, attachments: [] };
    renderPanelContent();
    try {
      const d = await api(`/api/messages/thread/${encodeURIComponent(peer.username)}?limit=50`);
      activeThread.messages = d.messages || [];
      activeThread.hasMore = !!d.has_more;
      activeThread.cursor = d.cursor || null;
      activeThread.muted = !!d.muted;
      await api('/api/messages/read', { method: 'POST', body: JSON.stringify({ from_user_id: peer.id }) });
      const t = threads.find(x => x.peer.id === peer.id);
      if (t) t.unread_count = 0;
      refreshUnread();
    } catch (e) {
      alert('Could not load thread: ' + e.message);
    }
    renderPanelContent();
  }

  async function loadOlder() {
    if (!activeThread || !activeThread.hasMore) return;
    try {
      const d = await api(`/api/messages/thread/${encodeURIComponent(activeThread.peer.username)}?limit=50&before=${activeThread.cursor}`);
      activeThread.messages = [...(d.messages || []), ...activeThread.messages];
      activeThread.hasMore = !!d.has_more;
      activeThread.cursor = d.cursor || null;
      renderPanelContent();
    } catch (e) { alert(e.message); }
  }

  async function retrySend(tempId) {
    if (!activeThread) return;
    const idx = activeThread.messages.findIndex(m => m._tempId === tempId);
    if (idx < 0) return;
    const msg = activeThread.messages[idx];
    if (!msg._payload) return;
    msg._status = 'sending';
    renderPanelContent();
    try {
      const d = await api('/api/messages/send', {
        method: 'POST',
        body: JSON.stringify(msg._payload)
      });
      activeThread.messages[idx] = d.message;
      renderPanelContent();
    } catch (e) {
      activeThread.messages[idx]._status = 'failed';
      renderPanelContent();
    }
  }

  async function sendCurrent() {
    const panel = document.getElementById('tt-msg-panel');
    const input = panel.querySelector('[data-tt-input]');
    const err = panel.querySelector('[data-tt-error]');
    const body = (input && input.value || '').trim();
    if (!body) return;
    err.style.display = 'none';

    const tempId = 'temp_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
    const payload = {
      to_user_id: activeThread.peer.id,
      body,
      reply_to_id: activeThread.reply_to_id || null,
      attachment_keys: (activeThread.attachments || []).map(a => a.key)
    };

    const tempMsg = {
      id: tempId,
      _tempId: tempId,
      _status: 'sending',
      _payload: payload,
      from_user_id: (me && me.id) || null,
      to_user_id: activeThread.peer.id,
      body,
      reply_to_id: payload.reply_to_id,
      created_at: Date.now(),
      attachments: (activeThread.attachments || []).map(a => ({
        id: a.key, filename: a.filename, content_type: a.content_type,
        size_bytes: a.size_bytes, _local: true
      })),
      reactions: []
    };

    activeThread.messages.push(tempMsg);
    if (input) input.value = '';
    _saveDraft(activeThread.peer.id, '');
    clearTimeout(_typingStopTimer);
    _stopTyping();
    activeThread.reply_to_id = null;
    activeThread.attachments = [];
    renderPanelContent();

    try {
      const d = await api('/api/messages/send', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      const i = activeThread.messages.findIndex(m => m._tempId === tempId);
      if (i >= 0) activeThread.messages[i] = d.message;
      renderPanelContent();
    } catch (e) {
      const i = activeThread.messages.findIndex(m => m._tempId === tempId);
      if (i >= 0) activeThread.messages[i]._status = 'failed';
      renderPanelContent();
    }
  }

  async function exportThread() {
    if (!activeThread) return;
    const panel = document.getElementById('tt-msg-panel');

    try {
      let all = activeThread.messages.filter(m => !m._tempId && m._status !== 'failed');
      let cursor = activeThread.cursor;
      let hasMore = activeThread.hasMore;
      const peer = activeThread.peer;
      let page = 0;
      while (hasMore && cursor && page < 50) {
        const d = await api(`/api/messages/thread/${encodeURIComponent(peer.username)}?limit=50&before=${cursor}`);
        const older = d.messages || [];
        all = [...older, ...all];
        hasMore = !!d.has_more;
        cursor = d.cursor || null;
        page++;
      }

      const meId = me && me.id;
      const lines = all.map(m => {
        const ts = new Date(m.created_at);
        const stamp = ts.toISOString().slice(0, 16).replace('T', ' ');
        const who = m.from_user_id === meId ? 'me' : '@' + (peer.username || 'them');
        const edited = m.edited_at ? ' (edited)' : '';
        const body = (m.body || '').replace(/\r?\n/g, '\n  ');
        return `[${stamp}] ${who}${edited}: ${body}`;
      });

      const header = [
        `=== Beams with @${peer.username || peer.display_name || 'user'} ===`,
        `Exported: ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`,
        `Messages: ${all.length}`,
        '',
      ].join('\n');

      const text = header + lines.join('\n') + '\n';
      const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `beams-${(peer.username || 'thread')}-${new Date().toISOString().slice(0, 10)}.txt`;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 1500);
    } catch (e) {
      alert('Export failed: ' + e.message);
    }
  }

  async function downloadAttachment(id, filename) {
    try {
      const url = await fetchAttachmentBlob(id);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename || 'file';
      document.body.appendChild(a);
      a.click();
      setTimeout(() => a.remove(), 500);
    } catch (e) {
      alert('Could not download: ' + e.message);
    }
  }

  async function deleteMsg(id) {
    if (!confirm('Delete this message?')) return;
    try {
      await api('/api/messages/' + id, { method: 'DELETE' });
      activeThread.messages = activeThread.messages.filter(m => m.id !== id);
      renderPanelContent();
    } catch (e) { alert(e.message); }
  }

  async function toggleReaction(id, emoji) {
    const m = activeThread && activeThread.messages.find(x => x.id === id);
    if (!m) return;
    const mine = (m.reactions || []).find(r => r.emoji === emoji && r.mine);
    try {
      await api('/api/messages/' + id + '/react', {
        method: mine ? 'DELETE' : 'POST',
        body: JSON.stringify({ emoji })
      });
      m.reactions = m.reactions || [];
      const ex = m.reactions.find(r => r.emoji === emoji);
      if (mine) {
        if (ex) { ex.count = Math.max(0, ex.count - 1); ex.mine = false; if (!ex.count) m.reactions = m.reactions.filter(r => r.emoji !== emoji); }
      } else if (ex) { ex.count++; ex.mine = true; }
      else { m.reactions.push({ emoji, count: 1, mine: true }); }
      renderPanelContent();
    } catch (e) { alert(e.message); }
  }

  async function onFilePicked(ev) {
    const file = ev.target.files && ev.target.files[0];
    ev.target.value = '';
    if (!file) return;
    if (file.size > MAX_FILE) { alert('File too large (max 5 MB)'); return; }
    if (!ALLOWED_TYPES.includes(file.type)) { alert('Unsupported file type'); return; }
    if ((activeThread.attachments || []).length >= 3) { alert('Max 3 attachments'); return; }
    const fd = new FormData(); fd.append('file', file);
    try {
      const d = await api('/api/messages/upload', { method: 'POST', body: fd });
      activeThread.attachments = [...(activeThread.attachments || []), d];
      renderPanelContent();
    } catch (e) { alert('Upload failed: ' + e.message); }
  }

  async function toggleMute() {
    if (!activeThread) return;
    const willMute = !activeThread.muted;
    try {
      await api('/api/messages/mute/' + activeThread.peer.id, { method: willMute ? 'POST' : 'DELETE' });
      activeThread.muted = willMute;
      renderPanelContent();
    } catch (e) { alert(e.message); }
  }

  function showToast(peer, msg) {
    const existing = document.getElementById('tt-msg-toast');
    if (existing) existing.remove();
    const dark = isDark();
    const el = document.createElement('div');
    el.id = 'tt-msg-toast';
    el.style.cssText = `position:fixed;bottom:24px;right:24px;width:380px;max-width:calc(100vw - 32px);
      background:${dark ? 'rgba(17,24,39,0.96)' : 'rgba(255,255,255,0.98)'};
      color:${dark ? '#f3f4f6' : '#111827'};
      border:1px solid ${dark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)'};
      border-radius:14px;padding:12px 14px;display:flex;gap:10px;align-items:flex-start;
      box-shadow:0 20px 50px rgba(0,0,0,0.35);
      z-index:2147483647;font-family:inherit;opacity:0;transform:translateY(12px) translateZ(0);
      transition:opacity 0.2s,transform 0.2s;`;
    el.innerHTML = `
      <img src="${avatarFor(peer)}" width="40" height="40" style="width:40px;height:40px;border-radius:50%;flex-shrink:0;object-fit:cover;" alt="">
      <div style="flex:1;min-width:0;">
        <div style="font-weight:700;font-size:14px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(peer.display_name || peer.username)}</div>
        <div style="font-size:13px;opacity:0.75;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin-top:2px;">${esc((msg.body || '').slice(0, 80))}</div>
        <div style="display:flex;gap:8px;margin-top:8px;">
          <button data-tt-toast-view style="padding:4px 12px;border-radius:6px;border:none;background:linear-gradient(135deg,#f97316,#ec4899);color:#fff;font-weight:700;cursor:pointer;font-size:12px;font-family:inherit;">View</button>
          <button data-tt-toast-close style="padding:4px 8px;border-radius:6px;border:none;background:transparent;color:inherit;opacity:0.6;cursor:pointer;font-size:12px;font-family:inherit;">×</button>
        </div>
      </div>`;
    document.documentElement.appendChild(el);
    requestAnimationFrame(() => { el.style.opacity = '1'; el.style.transform = 'translateY(0) translateZ(0)'; });
    el.querySelector('[data-tt-toast-view]').addEventListener('click', () => { el.remove(); openThread(peer); });
    el.querySelector('[data-tt-toast-close]').addEventListener('click', () => el.remove());
    setTimeout(() => el.remove(), 8000);
  }

  async function pollForNew() {
    if (!isAuthed()) return;
    const panel = document.getElementById('tt-msg-panel');
    if (panel && panel.style.display === 'flex') return;
    try {
      const d = await api('/api/messages/unread-count');
      const c = d.count || 0;
      if (c > unreadCount) {
        const inbox = await api('/api/messages/inbox?limit=1');
        const t = (inbox.threads || [])[0];
        if (t && t.last_message) showToast(t.peer, t.last_message);
      }
      unreadCount = c;
      paintBadges();
    } catch {}
  }

  window.ttOpenBeams = function (peerId) {
    if (!isAuthed()) { window.location.href = '/login/'; return; }
    openInbox();
    if (peerId) {
      setTimeout(async () => {
        try {
          const t = threads.find(x => x.peer.id === peerId);
          if (t) { openThread(t.peer); return; }
          const all = await api('/api/messages/inbox?limit=100');
          const match = (all.threads || []).find(x => x.peer.id === peerId);
          if (match) openThread(match.peer);
        } catch {}
      }, 300);
    }
  };

  async function connectWS() {
    if (!isAuthed()) return;
    if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return;
    try {
      const t = await api('/api/messages/ws-ticket', { method: 'POST' });
      if (!t.ticket) throw new Error('no ticket');
      const wsUrl = API.replace(/^https/, 'wss') + '/api/messages/connect?ticket=' + encodeURIComponent(t.ticket);
      ws = new WebSocket(wsUrl);
      ws.addEventListener('open', () => { wsBackoff = 1000; });
      ws.addEventListener('message', (ev) => {
        let data;
        try { data = JSON.parse(ev.data); } catch { return; }
        if (data.type === 'new_message' && data.message && data.peer) {
          handleInboundMessage(data.message, data.peer);
          return;
        }
        if (data.type === 'typing' && data.from_user_id) {
          _handleInboundTyping(data.from_user_id, data.active !== false);
          return;
        }
      });
      ws.addEventListener('close', () => { ws = null; scheduleReconnect(); });
      ws.addEventListener('error', () => { try { ws.close(); } catch {} });
    } catch (e) {
      scheduleReconnect();
    }
  }

  function scheduleReconnect() {
    if (wsReconnectTimer) return;
    if (!isAuthed()) return;
    wsReconnectTimer = setTimeout(() => {
      wsReconnectTimer = null;
      connectWS();
    }, wsBackoff);
    wsBackoff = Math.min(wsBackoff * 2, 60000);
  }

  function handleInboundMessage(msg, peer) {
    unreadCount = (unreadCount || 0) + 1;
    paintBadges();
    const panel = document.getElementById('tt-msg-panel');
    const drawerOpen = panel && panel.style.display === 'flex';
    if (activeThread && activeThread.peer.id === peer.id) {
      _peerTyping = false;
      clearTimeout(_typingIndicatorTimer);
      activeThread.messages.push(msg);
      renderPanelContent();
      api('/api/messages/read', {
        method: 'POST',
        body: JSON.stringify({ from_user_id: peer.id })
      }).then(refreshUnread).catch(() => {});
      return;
    }
    if (drawerOpen) { loadThreads(); return; }
    showToast(peer, msg);
  }

  async function init() {
    if (!isAuthed()) return;
    me = decodeJwt(getToken());
    _ensureTypingCSS();
    buildDrawer();

    try {
      const params = new URLSearchParams(window.location.search);
      if (params.get('openbeams') === '1') {
        const clean = window.location.pathname + window.location.hash;
        window.history.replaceState({}, '', clean);
        setTimeout(() => window.ttOpenBeams(), 400);
      }
    } catch {}
    await refreshUnread();
    waitForBeamsLinks(wireStaticBeamsLinks);
    document.addEventListener('loginStatusChanged', async () => {
      if (!isAuthed() && ws) {
        try { ws.close(); } catch {}
        ws = null;
        if (wsReconnectTimer) { clearTimeout(wsReconnectTimer); wsReconnectTimer = null; }
      } else if (isAuthed() && !ws) {
        connectWS();
      }
      await refreshUnread();
      waitForBeamsLinks(wireStaticBeamsLinks);
    });
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = setInterval(refreshUnread, 60000);
    if (newMsgTimer) clearInterval(newMsgTimer);
    newMsgTimer = setInterval(() => {
      if (!ws || ws.readyState !== WebSocket.OPEN) pollForNew();
    }, 30000);
    connectWS();
  }

  const mo = new MutationObserver(() => {
    if (!isAuthed()) return;
    if (document.getElementById('tt-beams-inbox-link') || document.getElementById('tt-beams-inbox-link-mobile')) {
      wireStaticBeamsLinks();
    }
  });
  setTimeout(() => {
    if (document.body) mo.observe(document.body, { childList: true, subtree: true });
  }, 500);

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();