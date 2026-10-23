import './pwa-dock.js';

const API_BASE = 'https://datewizza-auth.traffictorch.workers.dev';

// ==========================================================
// 1. Theme Toggle & OS Preference
// ==========================================================
document.addEventListener('DOMContentLoaded', () => {
  const html = document.documentElement;
  const toggle = document.getElementById('themeToggle');
  
  // Check local storage, otherwise use OS preference
  const savedTheme = localStorage.getItem('theme');
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  
  if (savedTheme === 'dark' || (!savedTheme && prefersDark)) {
    html.classList.add('dark');
    if (toggle) toggle.textContent = '☀️';
  } else {
    html.classList.remove('dark');
    if (toggle) toggle.textContent = '🌙';
  }

  if (toggle) {
    toggle.addEventListener('click', () => {
      html.classList.toggle('dark');
      const isDark = html.classList.contains('dark');
      localStorage.setItem('theme', isDark ? 'dark' : 'light');
      toggle.textContent = isDark ? '☀️' : '🌙';
    });
  }
});

// ==========================================================
// 2. PWA Install Prompt (iOS & Android)
// ==========================================================
let deferredPrompt = null;
const isInStandaloneMode = () => window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;

function isIOS() {
  return /iphone|ipad|ipod/.test(navigator.userAgent.toLowerCase()) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

window.triggerPWAInstall = () => {
  if (isIOS()) {
    showIOSInstallPrompt();
  } else if (deferredPrompt) {
    deferredPrompt.prompt();
    deferredPrompt.userChoice.then(() => { deferredPrompt = null; });
  } else {
    alert('To install, tap your browser menu and select "Add to Home Screen".');
  }
};

function showIOSInstallPrompt() {
  if (document.getElementById('ios-install-modal')) return;
  const modal = document.createElement('div');
  modal.id = 'ios-install-modal';
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.8);display:flex;align-items:center;justify-content:center;z-index:2147483647;padding:20px;backdrop-filter:blur(8px);';
  modal.innerHTML = `
    <div style="background:#fff;color:#000;padding:24px;border-radius:16px;max-width:340px;text-align:center;position:relative;">
      <button data-close-ios style="position:absolute;top:12px;right:12px;background:none;border:none;font-size:24px;cursor:pointer;color:#666;">×</button>
      <h3 style="margin-top:0;font-weight:bold;font-size:1.2rem;">Install DateWizza</h3>
      <p style="font-size:0.9rem;color:#555;line-height:1.5;">Install this app on your iPhone for quick access.</p>
      <div style="display:flex;align-items:center;justify-content:center;gap:8px;margin:16px 0;font-weight:bold;">
        <span>Tap the Share icon</span>
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#007AFF" stroke-width="2"><path d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg>
      </div>
      <p style="font-size:0.9rem;color:#555;">Then tap <strong>Add to Home Screen</strong></p>
    </div>
  `;
  document.body.appendChild(modal);
  document.body.style.overflow = 'hidden';
  
  modal.addEventListener('click', (e) => {
    if (e.target === modal || e.target.hasAttribute('data-close-ios') || e.target.closest('[data-close-ios]')) {
      modal.remove();
      document.body.style.overflow = '';
    }
  });
}

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
});

// ==========================================================
// 3. Mobile Menu & Sidebar Toggles
// ==========================================================
document.addEventListener('DOMContentLoaded', () => {
  const menuToggle = document.getElementById('menuToggle');
  const mobileMenu = document.getElementById('mobileMenu');
  
  if (menuToggle && mobileMenu) {
    menuToggle.addEventListener('click', () => {
      mobileMenu.classList.toggle('hidden');
      document.body.classList.toggle('overflow-hidden');
    });
  }
});

// ==========================================================
// 4. Auth & Token Refresh
// ==========================================================
document.addEventListener('DOMContentLoaded', () => {
  const token = localStorage.getItem('authToken');
  if (token) {
    // Optional: Add token refresh logic here if needed
    console.log("User is logged in.");
  }
});


// ==========================================================
// 5. Load Shared Components (Menus & Footer) - TT Clone Logic
// ==========================================================
document.addEventListener('DOMContentLoaded', () => {
  // Desktop Menu
  fetch('/desktop-menu.html')
    .then(res => res.ok ? res.text() : '')
    .then(html => {
      const el = document.getElementById('desktop-menu-placeholder');
      if (el) el.innerHTML = html;
    }).catch(() => {});

  // Mobile Menu
  fetch('/mobile-menu.html')
    .then(res => res.ok ? res.text() : '')
    .then(html => {
      const el = document.getElementById('mobile-menu-placeholder');
      if (el) el.innerHTML = html;
    }).catch(() => {});

  // Footer (Wizza Hub)
  fetch('/footer.html')
    .then(res => res.ok ? res.text() : '')
    .then(html => {
      const el = document.getElementById('footer-placeholder');
      if (el) el.innerHTML = html;
      // Update year in footer
      const yearEl = document.getElementById('year');
      if (yearEl) yearEl.textContent = new Date().getFullYear();
    }).catch(() => {});
});

// Mobile Menu Toggle (same as TT)
document.addEventListener('DOMContentLoaded', () => {
  const btn = document.getElementById('menuToggle');
  const menu = document.getElementById('mobileMenu');
  if (btn && menu) {
    btn.addEventListener('click', () => {
      menu.classList.toggle('hidden');
      document.body.classList.toggle('overflow-hidden');
    });
  }
});

// ==========================================================
// FORCE TAB SWITCHING (DateWizza Dashboard)
// ==========================================================
document.addEventListener('click', (e) => {
  const tabLink = e.target.closest('[data-tab]');
  if (tabLink) {
    // Only run on the dashboard
    if (window.location.pathname.includes('/dashboard/')) {
      const tabId = tabLink.dataset.tab;
      if (tabId && typeof window.activateTab === 'function') {
        e.preventDefault();
        window.activateTab(tabId);
        // Update URL hash without jumping
        history.pushState(null, null, '#' + tabId);
      }
    }
  }
});

// ==========================================================
// BULLETPROOF FALLBACKS (For Local Testing & Stuck States)
// ==========================================================

// 1. Update Wizza Hub Status
document.addEventListener('DOMContentLoaded', () => {
  setTimeout(() => {
    const hubText = document.getElementById('hubStatusText');
    if (hubText) {
      const token = localStorage.getItem('authToken');
      hubText.innerHTML = (token && token !== 'undefined')
        ? '<span class="text-emerald-400 font-bold">User Authenticated</span> — All systems operational.'
        : '<span class="text-amber-400 font-bold">Guest Mode</span> — Log in to access your calendar.';
    }
  }, 1000); // Wait 1s for footer to inject
});

// 2. Force Tab Switching (Independent of calendar-app.js)
document.addEventListener('click', (e) => {
  const tabLink = e.target.closest('[data-tab]');
  if (tabLink) {
    const tabId = tabLink.dataset.tab;
    if (tabId) {
      e.preventDefault();
      
      // Try to call the native function if it exists
      if (typeof window.activateTab === 'function') {
        window.activateTab(tabId);
      } else {
        // Fallback: Manually hide all tabs and show the clicked one
        document.querySelectorAll('.dw-tab-panel').forEach(panel => {
          panel.classList.add('hidden');
          panel.classList.remove('flex');
        });
        const target = document.getElementById('tab-' + tabId);
        if (target) {
          target.classList.remove('hidden');
          target.classList.add('flex');
        }
      }
      
      // Update URL
      history.pushState(null, null, '#' + tabId);
    }
  }
});


// ==========================================================
// BULLETPROOF UI LOGIC (Overrides any previous handlers)
// ==========================================================
document.addEventListener('DOMContentLoaded', () => {
  // 1. Force Theme Toggle to work
  const themeBtn = document.getElementById('themeToggle');
  if (themeBtn) {
    // Clone the node to remove all existing event listeners
    const newThemeBtn = themeBtn.cloneNode(true);
    themeBtn.parentNode.replaceChild(newThemeBtn, themeBtn);
    
    newThemeBtn.addEventListener('click', (e) => {
      e.preventDefault();
      const html = document.documentElement;
      html.classList.toggle('dark');
      const isDark = html.classList.contains('dark');
      localStorage.setItem('theme', isDark ? 'dark' : 'light');
      newThemeBtn.textContent = isDark ? '☀️' : '🌙';
    });
  }

  // 2. Force Tab Switching to work via Event Delegation
  document.addEventListener('click', (e) => {
    const tabLink = e.target.closest('[data-tab]');
    if (tabLink) {
      e.preventDefault();
      const tabId = tabLink.dataset.tab;
      
      // Hide all tabs
      document.querySelectorAll('.dw-tab-panel').forEach(panel => {
        panel.classList.add('hidden');
        panel.classList.remove('flex');
      });
      
      // Show target tab
      const target = document.getElementById('tab-' + tabId);
      if (target) {
        target.classList.remove('hidden');
        target.classList.add('flex');
      }
      
      // Tell calendar-app.js to load data
      document.dispatchEvent(new CustomEvent('switchTab', { detail: { tab: tabId } }));
      
      // Update URL
      history.pushState(null, null, '#' + tabId);
    }
  });
});
