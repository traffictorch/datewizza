// DateWizza PWA floating dock — mobile + standalone only
// Auto-injects itself, wires into existing main.js helpers.

(function () {
  'use strict';
  if (window.__ttDockLoaded) return;
  window.__ttDockLoaded = true;

  const isMobile = () => window.matchMedia('(max-width: 767px)').matches;
  const isStandalone = () =>
    window.matchMedia('(display-mode: standalone)').matches ||
    window.navigator.standalone === true;

    const TOOLS = [
    { em: '📅', nm: 'Calendar',   ds: 'Schedule',   url: '/dashboard/#calendar' },
    { em: '✅', nm: 'Tasks',      ds: 'To-do',      url: '/dashboard/#tasks' },
    { em: '🌐', nm: 'Community',  ds: 'Events',     url: '/dashboard/#community' },
    { em: '🔑', nm: 'Resources',  ds: 'Bookings',   url: '/dashboard/#resources' },
    { em: '👤', nm: 'Profile',    ds: 'Settings',   url: '/profile.html' },
  ];

  const LS_RECENT = 'tt-recent-tools';
  const LS_FAVS   = 'tt-favourite-tools';

  const $ = (sel, root) => (root || document).querySelector(sel);
  const el = (tag, cls, html) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (html != null) n.innerHTML = html;
    return n;
  };

  /* ---------- Toast ---------- */
  let toastEl, toastTimer;
  function toast(msg) {
    if (!toastEl) {
      toastEl = el('div', 'tt-pwa-toast');
      document.body.appendChild(toastEl);
    }
    toastEl.textContent = msg;
    toastEl.classList.add('tt-show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('tt-show'), 1800);
  }

  /* ---------- Recent Tools ---------- */
  function getRecent() {
    try { return JSON.parse(localStorage.getItem(LS_RECENT) || '[]'); } catch { return []; }
  }
  function pushRecent(url) {
    if (!url || url === location.pathname) return;
    const list = getRecent().filter(u => u !== url);
    list.unshift(url);
    localStorage.setItem(LS_RECENT, JSON.stringify(list.slice(0, 10)));
  }
  // Record every tool visit
  TOOLS.forEach(t => { if (location.pathname.startsWith(t.url)) pushRecent(t.url); });

  /* ---------- Sheets ---------- */
  function makeSheet(id, title, bodyNode) {
    const wrap = el('div', 'tt-pwa-sheet');
    wrap.id = id;
    wrap.innerHTML = `
      <div class="tt-pwa-sheet-bd" data-close></div>
      <div class="tt-pwa-sheet-pn" role="dialog" aria-modal="true" aria-label="${title}">
        <div class="tt-pwa-sheet-hd">
          <h3>${title}</h3>
          <button class="tt-pwa-sheet-close" data-close aria-label="Close">×</button>
        </div>
      </div>`;
    $('.tt-pwa-sheet-pn', wrap).appendChild(bodyNode);
    wrap.addEventListener('click', e => {
      if (e.target.closest('[data-close]')) closeSheet(wrap);
    });
    document.body.appendChild(wrap);
    return wrap;
  }
  function openSheet(s) { s.classList.add('tt-open'); document.body.style.overflow = 'hidden'; }
  function closeSheet(s) { s.classList.remove('tt-open'); document.body.style.overflow = ''; }

  /* ---------- Tools Sheet ---------- */
  function buildToolsSheet() {
    const body = el('div', 'tt-pwa-grid');
    TOOLS.forEach(t => {
      const a = el('a', 'tt-pwa-tool');
      a.href = t.url;
      a.innerHTML = `<span class="em">${t.em}</span><span class="nm">${t.nm}<small>${t.ds}</small></span>`;
      body.appendChild(a);
    });
    return makeSheet('ttPwaToolsSheet', '🔥 Tools', body);
  }

  /* ---------- Menu Sheet ---------- */
  function buildMenuSheet() {
    const body = el('div');
    const list = el('ul', 'tt-pwa-menu-list');

    const item = (em, label, opts) => {
      opts = opts || {};
      const li = el('li');
      const node = opts.href ? el('a', 'tt-pwa-menu-item') : el('button', 'tt-pwa-menu-item');
      if (opts.href) node.href = opts.href;
      if (opts.disabled) { node.classList.add('is-off'); node.disabled = true; }
      node.innerHTML = `<span class="em">${em}</span><span>${label}</span>` +
        (opts.meta ? `<span class="meta">${opts.meta}</span>` : '');
      if (opts.onClick) node.addEventListener('click', opts.onClick);
      li.appendChild(node);
      return li;
    };

    // Recent tools submenu — hide section entirely when empty
    const recent = getRecent().slice(0, 5);
    if (recent.length) {
      recent.forEach(url => {
        const t = TOOLS.find(x => url.startsWith(x.url));
        list.appendChild(item(t ? t.em : '🔗', t ? t.nm : url, { href: url }));
      });
      list.appendChild(el('div', 'tt-pwa-menu-sep'));
    }

    list.appendChild(item('📋', 'Copy Current URL', {
      onClick: async () => {
        try { await navigator.clipboard.writeText(location.href); toast('URL copied'); }
        catch { toast('Copy failed'); }
        closeSheet(document.getElementById('ttPwaMenuSheet'));
      }
    }));
    list.appendChild(item('🌙', 'Toggle Theme', {
      onClick: () => {
        const btn = document.getElementById('themeToggle');
        if (btn) btn.click(); else toast('Theme toggle unavailable');
      }
    }));
    list.appendChild(item('⚙️', 'Settings', { href: '/dashboard/#settings' }));
    list.appendChild(item('⭐', 'Favourite Tools', { disabled: true, meta: 'soon' }));

    list.appendChild(el('div', 'tt-pwa-menu-sep'));

    // Main navigation
    list.appendChild(item('🔥', 'All Tools', {
      onClick: () => {
        closeSheet(document.getElementById('ttPwaMenuSheet'));
        setTimeout(() => openSheet(document.getElementById('ttPwaToolsSheet') || buildToolsSheet()), 180);
      }
    }));
    list.appendChild(item('📚', 'Help Guides', { href: '/ai-ux-seo-help-guides/' }));
    list.appendChild(item('📰', 'News & Blog', { href: '/blog/' }));
    list.appendChild(item('🏆', 'Leaderboard', { href: '/leader-board/' }));
    list.appendChild(item('💎', 'Go Pro',      { href: '/pro/' }));
    list.appendChild(item('👤', 'Profile',     { href: '/profile.html' }));
    list.appendChild(item('📊', 'Whitepaper',  { href: '/research/traffic-torch-whitepaper/' }));

    body.appendChild(list);
    return makeSheet('ttPwaMenuSheet', '☰ Menu', body);
  }

  /* ---------- Dock ---------- */
  function buildDock() {
    const dock = el('nav', 'tt-pwa-dock');
    dock.setAttribute('aria-label', 'Quick actions');

    const btn = (cls, ico, lbl) => {
      const b = el('button');
      b.type = 'button';
      b.className = cls;
      b.innerHTML = `<span class="tt-ico">${ico}</span><span class="tt-lbl">${lbl}</span>`;
      return b;
    };

    const back    = btn('tt-act-back',    '◀', 'Back');
    const fwd     = btn('tt-act-fwd',     '▶', 'Forward');
    const share   = btn('tt-act-share',   '📤', 'Share');
    const menu    = btn('tt-act-menu',    '☰', 'Menu');

    // Install / Notifications — one slot, swaps on state
    const standalone = isStandalone();
    let loggedIn = false;
    try { loggedIn = !!localStorage.getItem('authToken'); } catch {}
    let instBtn = null;
    if (standalone && loggedIn) {
      instBtn = btn('tt-act-bell', '🔔', 'Alerts');
      instBtn.addEventListener('click', () => { location.href = '/dashboard/#notifications-section'; });
    } else if (!standalone) {
      instBtn = btn('tt-act-install', '📲', 'Install');
      instBtn.addEventListener('click', () => {
        if (typeof window.triggerPWAInstall === 'function') window.triggerPWAInstall();
        else toast('Install via browser menu');
      });
    }
    const offlineDot = el('span', 'tt-offline-dot');
    offlineDot.hidden = true;
    $('.tt-ico', menu).appendChild(offlineDot);
    const syncOnlineDot = () => { offlineDot.hidden = navigator.onLine; };
    syncOnlineDot();
    window.addEventListener('online',  syncOnlineDot);
    window.addEventListener('offline', syncOnlineDot);

    // Back/Forward state
    const refreshNav = () => {
      back.disabled = history.length <= 1;
      // can't reliably detect forward — enable by default, disable after click attempt
      fwd.disabled = false;
    };

    back.addEventListener('click', () => { if (history.length > 1) history.back(); });
    fwd.addEventListener('click',  () => { history.forward(); });
    menu.addEventListener('click',  () => openSheet(document.getElementById('ttPwaMenuSheet')  || buildMenuSheet()));

    share.addEventListener('click', async () => {
      const data = { title: document.title, text: document.title, url: location.href };
      if (navigator.share) {
        try { await navigator.share(data); } catch { /* cancelled */ }
      } else {
        try { await navigator.clipboard.writeText(location.href); toast('URL copied'); }
        catch { toast('Share unavailable'); }
      }
    });

    const items = [back, fwd];
    if (instBtn) items.push(instBtn);
    items.push(share, menu);
    dock.append(...items);
    document.body.appendChild(dock);

    // Slide-in
    requestAnimationFrame(() => {
      dock.classList.add('tt-show');
      requestAnimationFrame(() => dock.classList.add('tt-ready'));
    });

    refreshNav();
    window.addEventListener('popstate', refreshNav);

    // Hide on scroll-down, show on scroll-up. Works in browser + PWA identically.
    let lastY = window.scrollY;
    let ticking = false;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        const y = window.scrollY;
        const delta = y - lastY;
        if (y > 80 && delta > 6) {
          dock.classList.remove('tt-ready');
          dock.classList.add('tt-hide');
        } else if (delta < -6 || y <= 80) {
          dock.classList.remove('tt-hide');
          dock.classList.add('tt-ready');
        }
        lastY = y;
        ticking = false;
      });
    };
    window.addEventListener('scroll', onScroll, { passive: true });

    return dock;
  }

  /* ---------- Boot ---------- */
  function boot() {
    // Inject CSS if not already present
    if (!document.getElementById('tt-pwa-dock-css')) {
      const link = el('link');
      link.id = 'tt-pwa-dock-css';
      link.rel = 'stylesheet';
      link.href = '/pwa-dock.css?v=1';
      document.head.appendChild(link);
    }

    if (!isMobile() && !isStandalone()) return; // desktop non-PWA: skip entirely

    document.body.classList.add('tt-has-dock');
    buildDock();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
