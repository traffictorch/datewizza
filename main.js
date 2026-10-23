import './shared/ai-assistant.js';
import './shared/footer-beacon.js';

// Follow OS dark/light preference when user hasn't manually chosen a theme
(function () {
  if (typeof window === 'undefined' || !window.matchMedia) return;
  var mq = window.matchMedia('(prefers-color-scheme: dark)');
  mq.addEventListener('change', function (e) {
    if (!localStorage.getItem('theme')) {
      document.documentElement.classList.toggle('dark', e.matches);
    }
  });
})();

// Global Main JS

import './pwa-dock.js';

const API_BASE = 'https://datewizza-auth.traffictorch.workers.dev';

// Messages module — script-tag injected so Vite doesn't try to bundle it
(function () {
  const s = document.createElement('script');
  s.src = '/messages.js?v=13';
  s.defer = true;
  document.head.appendChild(s);
})();

// Day Night Mode
document.addEventListener('DOMContentLoaded', () => {
  const html = document.documentElement;
  const toggle = document.getElementById('themeToggle');
  // Immediate + short aggressive token refresh on every page load
  const token = localStorage.getItem('authToken');
  if (token) {
    // Flag to know if we just came from Stripe checkout (set in upgradeToPro after payment)
    const justUpgraded = localStorage.getItem('just_upgraded') === 'true';
    // Show activating message if fresh from upgrade
    if (justUpgraded) {
      const activating = document.createElement('div');
      activating.id = 'activating-pro';
      activating.className = 'fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-[10000]';
      activating.innerHTML = `
        <div class="bg-gray-900 text-white p-8 rounded-2xl text-center max-w-sm mx-4">
          <div class="animate-spin h-10 w-10 border-4 border-blue-500 border-t-transparent rounded-full mx-auto mb-4"></div>
          <h3 class="text-xl font-bold mb-2">Activating Pro Access</h3>
          <p class="text-gray-300">This usually takes 5–15 seconds after payment…</p>
          <p class="text-sm text-gray-500 mt-4">Don't close this page</p>
        </div>`;
      document.body.appendChild(activating);
      // Auto-remove after 20s max
      setTimeout(() => activating.remove(), 20000);
    }
    // Immediate refresh (aggressive – try right now after tiny render delay)
    setTimeout(async () => {
      try {
        const res = await fetch(`${API_BASE}/api/refresh-token`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) {
          const data = await res.json();
          if (data.token) {
            localStorage.setItem('authToken', data.token);
            localStorage.removeItem('just_upgraded');
            document.getElementById('activating-pro')?.remove();
            if (typeof updateRunsBadge === 'function') updateRunsBadge();
          }
        }
      } catch (err) {}
    }, 1500); // 1.5s delay – gives page time to render + webhook a head-start
    // Short fallback poll only if needed (max ~15s total)
    let attempts = 0;
    const poll = setInterval(async () => {
      attempts++;
      const currentToken = localStorage.getItem('authToken');
      try {
        const res = await fetch(`${API_BASE}/api/refresh-token`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${currentToken}` }
        });
        if (res.ok) {
          const data = await res.json();
          if (data.token) {
            localStorage.setItem('authToken', data.token);
            localStorage.removeItem('just_upgraded');
            document.getElementById('activating-pro')?.remove();
            if (typeof updateRunsBadge === 'function') updateRunsBadge();
            clearInterval(poll);
          }
        }
      } catch (err) {}
      if (attempts >= 5) { // ~15s total polling window (5 × 3s)
        clearInterval(poll);
        localStorage.removeItem('just_upgraded');
        document.getElementById('activating-pro')?.remove();
      }
    }, 3000); // every 3 seconds
  }
  // Apply saved theme (or default to light if none)
  const saved = localStorage.getItem('theme');
  if (saved === 'dark') {
    html.classList.add('dark');
  } else {
    html.classList.remove('dark');
  }
  if (toggle) {
    // Set icon
    toggle.textContent = html.classList.contains('dark') ? '☀️' : '🌙';
    // Toggle handler
    toggle.addEventListener('click', () => {
      html.classList.toggle('dark');
      const isDark = html.classList.contains('dark');
      localStorage.setItem('theme', isDark ? 'dark' : 'light');
      toggle.textContent = isDark ? '☀️' : '🌙';
    });
  }
});

// PWA Install
let deferredPrompt = null;
const isInStandaloneMode = () =>
  window.matchMedia('(display-mode: standalone)').matches ||
  window.navigator.standalone === true ||
  document.referrer.includes('ios-app://');

function isIOS() {
  return /iphone|ipad|ipod/.test(navigator.userAgent.toLowerCase()) ||
         (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

window.triggerPWAInstall = () => {
  const btn = document.getElementById('pwa-install-btn');
  if (isIOS()) {
    showIOSInstallInstructions();
  } else if (deferredPrompt) {
    deferredPrompt.prompt();
    deferredPrompt.userChoice.then(() => {
      deferredPrompt = null;
      btn?.remove();
    });
  } else {
    alert('Installation ready! Check your browser menu (usually in address bar) for Install option.');
  }
};

function createInstallButton() {
  if (isInStandaloneMode()) return;
  document.querySelectorAll('#pwa-install-btn').forEach(el => el.remove());
  const btn = document.createElement('button');
  btn.id = 'pwa-install-btn';
  btn.textContent = '📱 Install Apps 💻';
  btn.className =
    'fixed bottom-6 right-6 z-[9999] ' +
    'px-7 py-3.5 md:px-8 md:py-4 ' +
    'bg-gradient-to-r from-orange-500 to-pink-600 ' +
    'text-white font-bold text-base md:text-lg ' +
    'rounded-full shadow-2xl hover:shadow-[0_20px_35px_-10px_rgba(249,115,22,0.5),0_10px_15px_-6px_rgba(236,72,153,0.5)] ' +
    'transition-all duration-200 ease-out ' +
    'hover:scale-105 active:scale-95 transform-gpu pointer-events-auto';
  btn.style.position = 'fixed';
  btn.style.inset = 'auto 1.5rem 1.5rem auto';
  btn.style.zIndex = '9999';
  btn.style.transform = 'translate3d(0,0,0)';
  btn.style.willChange = 'transform';
btn.addEventListener('click', () => window.triggerPWAInstall());
  document.documentElement.appendChild(btn);
}

function showIOSInstallInstructions() {
  if (document.getElementById('ios-install-modal')) return;
  const modal = document.createElement('div');
  modal.id = 'ios-install-modal';
  modal.style.position = 'fixed';
  modal.style.inset = '0';
  modal.style.background = 'rgba(0,0,0,0.8)';
  modal.style.display = 'flex';
  modal.style.alignItems = 'center';
  modal.style.justifyContent = 'center';
  modal.style.zIndex = '2147483647';
  modal.style.overflow = 'hidden';
  modal.style.padding = '20px';
  modal.style.boxSizing = 'border-box';
  modal.style.backdropFilter = 'blur(8px)';
  modal.style.transition = 'opacity 300ms';
  modal.innerHTML = `
    <div style="background: rgba(17,24,39,0.95); backdrop-filter: blur(16px); border-radius: 24px; padding: 28px 24px; max-width: 440px; width: 100%; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.6); border: 1px solid rgba(165,180,252,0.2); animation: slide-up 0.3s ease-out; box-sizing: border-box;">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px;">
        <h3 style="font-size: 20px; font-weight: 700; color: #ffffff; margin: 0;">Install DateWizza</h3>
        <button type="button" data-close-ios style="font-size: 32px; line-height: 1; color: #9ca3af; background: none; border: none; cursor: pointer; padding: 0 4px;">×</button>
      </div>
      <ol style="color: #f3f4f6; margin: 0; padding-left: 20px; font-size: 17px; line-height: 1.6; font-weight: 500;">
        <li style="display: flex; align-items: flex-start; gap: 14px; margin-bottom: 20px;">
          <span style="font-weight: 700; color: #a5b4fc; flex-shrink: 0;">1.</span>
          <div style="color: #f3f4f6;">
            In Safari tap the <strong style="color: #ffffff; font-weight: 600;">Share</strong> button
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#00eaff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" style="display: inline; vertical-align: middle; margin-left: 6px;">
              <rect x="3" y="11" width="18" height="10" rx="2" ry="2"></rect>
              <path d="M12 14V1"></path>
              <path d="m8 5 4-4 4 4"></path>
            </svg>
            <div style="font-size: 12.5px; color: #9ca3af; font-weight: 400; font-style: italic; margin-top: 6px;">Depending on iOS version, it may be in the bottom bar or hidden in the <strong style="color:#c7d2fe; font-style:normal;">⋯</strong> menu.</div>
          </div>
        </li>
        <li style="display: flex; align-items: flex-start; gap: 14px;">
          <span style="font-weight: 700; color: #a5b4fc; flex-shrink: 0;">2.</span>
          <div style="display: flex; align-items: center; gap: 10px; flex-wrap: wrap; color: #f3f4f6;">
            Scroll down and tap Add to Home Screen
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#00eaff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" style="display: inline; vertical-align: middle;">
              <rect x="3" y="3" width="18" height="18" rx="4" ry="4"></rect>
              <path d="M12 7v10"></path>
              <path d="M7 12h10"></path>
            </svg>
          </div>
        </li>
      </ol>
      <p style="margin-top: 28px; text-align: center; font-size: 14px; color: #9ca3af;">
        PWA quick access apps! 📱 💻
      </p>
    </div>
  `;
  document.body.appendChild(modal);
  document.body.style.overflow = 'hidden';
  const close = (e) => {
    if (e.target === modal || e.target.closest('[data-close-ios]')) {
      modal.remove();
      document.body.style.overflow = '';
    }
  };
  modal.addEventListener('click', close);
  document.addEventListener('keydown', function onEsc(e) {
    if (e.key === 'Escape') { modal.remove(); document.body.style.overflow = ''; document.removeEventListener('keydown', onEsc); }
  });
}

// ── Event Listeners ─────────────────────────────────────────────────────
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  createInstallButton();
});
window.addEventListener('load', () => {
  setTimeout(() => {
    if (!document.getElementById('pwa-install-btn')) {
      createInstallButton();
    }
  }, 5000);
});
window.addEventListener('appinstalled', () => {
  document.getElementById('pwa-install-btn')?.remove();
  deferredPrompt = null;
});

// Minimal service worker registration
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js?v=14')
      .then(reg => {})
      .catch(err => {});
  });
} 

// Mobile menu – with close button + body scroll lock + delegated close on link clicks
document.addEventListener('DOMContentLoaded', () => {
  const button = document.getElementById('menuToggle');
  const menu = document.getElementById('mobileMenu');
  const closeBtn = document.getElementById('close-mobile-menu');
  if (!button || !menu) return;
  // Open / toggle
  button.addEventListener('click', () => {
    menu.classList.toggle('hidden');
    document.body.classList.toggle('overflow-hidden');
    const expanded = button.getAttribute('aria-expanded') === 'true';
    button.setAttribute('aria-expanded', !expanded);
  });
  // Close via × button
  if (closeBtn) {
    closeBtn.addEventListener('click', () => {
      menu.classList.add('hidden');
      document.body.classList.remove('overflow-hidden');
      button.setAttribute('aria-expanded', 'false');
    });
  }
  // ✅ Close mobile menu when any link inside it is clicked (delegated)
  menu.addEventListener('click', function(e) {
    const link = e.target.closest('a');
    if (link && menu.contains(link)) {
      menu.classList.add('hidden');
      document.body.classList.remove('overflow-hidden');
      if (button) button.setAttribute('aria-expanded', 'false');
    }
  });
});

// Desktop Sidebar Collapse - Icons + Centered Logo Only (No Title Text)
const sidebar = document.getElementById('desktopSidebar');
const collapseBtn = document.getElementById('sidebarCollapse');
const desktopMenuToggle = document.getElementById('desktopMenuToggle');
if (sidebar && (collapseBtn || desktopMenuToggle)) {
  const toggleSidebar = () => {
    sidebar.classList.toggle('collapsed');
    const isCollapsed = sidebar.classList.contains('collapsed');
    // Button icons
    if (collapseBtn) {
      collapseBtn.textContent = isCollapsed ? '→' : '←';
    }
    if (desktopMenuToggle) {
      desktopMenuToggle.textContent = isCollapsed ? '☰' : '✖';
    }
  };
  collapseBtn?.addEventListener('click', toggleSidebar);
  desktopMenuToggle?.addEventListener('click', toggleSidebar);
  // Public-facing pages (/torcher/*, /torch/*) start collapsed by default.
  // All other pages start expanded.
  const isPublicPage = /^\/(torcher|torch)\//.test(window.location.pathname);
  if (isPublicPage) {
    if (!sidebar.classList.contains('collapsed')) toggleSidebar();
  } else {
    if (sidebar.classList.contains('collapsed')) toggleSidebar();
  }
}

// Login/Register Modal (mobile-first, Tailwind, dark mode)
function showLoginModal() {
  const modal = document.createElement('div');
  modal.className = 'fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4';
  modal.innerHTML = `
    <div class="bg-white dark:bg-gray-900 rounded-xl shadow-2xl max-w-md w-full text-gray-800 dark:text-gray-200">
      <div class="p-6">
        <h2 class="text-2xl font-bold mb-6 text-center">Login or Register</h2>
        <input id="email" type="email" placeholder="Email" class="w-full p-3 mb-4 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500">
        <input id="password" type="password" placeholder="Password" class="w-full p-3 mb-6 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500">
        <div class="flex flex-col sm:flex-row gap-4">
<button onclick="handleAuth('login', event)" class="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 px-6 rounded-lg transition">Login</button>
<button onclick="handleAuth('register', event)" class="flex-1 bg-green-600 hover:bg-green-700 text-white font-medium py-3 px-6 rounded-lg transition">Register</button>
        </div>
        <button onclick="this.closest('.fixed').remove()" class="mt-6 text-center w-full text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400">Close</button>
      </div>
    </div>`;
  document.body.appendChild(modal);
}

async function handleAuth(mode, evt) {
  const button = evt?.currentTarget || window.event?.target;
  const originalText = button.textContent;
  button.textContent = 'Logging in...';
  button.disabled = true;
  const email = document.getElementById('email')?.value.trim();
  const password = document.getElementById('password')?.value;
  if (!email || !password) {
    alert('Please enter email and password');
    button.textContent = originalText;
    button.disabled = false;
    return;
  }
  try {
    const response = await fetch(`${API_BASE}/api/${mode}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        email, 
        password,
        turnstile_token: window.turnstile ? window.turnstile.getResponse() : 'test-bypass-token'
      })
    });
    const data = await response.json();
if (response.ok && data.token) {
  localStorage.setItem('authToken', data.token);
  document.dispatchEvent(new CustomEvent('loginStatusChanged'));
  alert(mode === 'login' ? 'Logged in successfully!' : 'Registered & logged in!');
  document.querySelector('.fixed')?.remove();
} else {
      alert(data.error || 'Authentication failed');
      document.querySelector('.fixed')?.remove();
    }
  } catch (err) {
    alert('Connection error: ' + err.message);
    document.querySelector('.fixed')?.remove();
  } finally {
    button.textContent = originalText;
    button.disabled = false;
  }
}

async function upgradeToPro() {
  const token = localStorage.getItem('authToken') || localStorage.getItem('torch_token');
  if (!token) return alert('Please login first');
  try {
    const container = document.getElementById('checkout-container');
    if (!container) throw new Error('Checkout container not found – add <div id="checkout-container"> to the page');
    container.classList.remove('hidden');
    const stripe = Stripe(window.STRIPE_PUBLISHABLE_KEY);
    const fetchClientSecret = async () => {
      const response = await fetch(`${API_BASE}/api/upgrade`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      if (!response.ok) {
        const errText = await response.text();
        throw new Error(errText || 'Failed to create checkout session');
      }
      const data = await response.json();
      if (!data.clientSecret) throw new Error('No clientSecret returned from server');
      return data.clientSecret;
    };
    const checkout = await stripe.initEmbeddedCheckout({ fetchClientSecret });
    checkout.mount('#checkout-container');
    // Set flag so activating overlay shows on redirect/refresh
    localStorage.setItem('just_upgraded', 'true');
    // Auto-refresh token after payment (waits for webhook) – keep original as backup
    setTimeout(async () => {
      const currentToken = localStorage.getItem('authToken') || localStorage.getItem('traffic_torch_jwt');
      if (!currentToken) return;
      try {
        const res = await fetch(`${API_BASE}/api/refresh-token`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${currentToken}` }
        });
        if (!res.ok) throw new Error('Refresh failed');
        const data = await res.json();
        if (data.token) {
          localStorage.setItem('authToken', data.token);
          document.querySelector('.upgrade-modal, .fixed')?.remove();
          alert('Pro activated! You now have 25 daily runs.');
        }
      } catch (err) {
        setTimeout(() => {
          if (confirm('Upgrade complete! Please log in again to activate Pro.')) {
            localStorage.removeItem('authToken');
            showLoginModal();
          }
        }, 15000);
      }
    }, 12000); // 12 seconds delay – kept as fallback
  } catch (err) {
    alert('Upgrade failed: ' + err.message);
    document.getElementById('checkout-container')?.classList.add('hidden');
  }
}

function updateRunsBadge(remaining) {
  const desktopBadge = document.getElementById('runs-left');
  const mobileBadge = document.getElementById('runs-left-mobile');
  const text = remaining === undefined ? '' : `Runs left today: ${remaining}`;
  if (desktopBadge) {
    desktopBadge.textContent = text;
    if (remaining !== undefined) desktopBadge.classList.remove('hidden');
  }
  if (mobileBadge) {
    mobileBadge.textContent = text;
  }
}

// === UPDATED CANRUNTOOL WITH COMBINED LIMITING START (IndexedDB fingerprint – survives localStorage clear) ===
const FINGERPRINT_KEY = 'tt_fingerprint';
let currentFingerprint = null;

async function getOrCreateFingerprint() {
  if (currentFingerprint) return currentFingerprint;

  // Try IndexedDB first (persists even after localStorage/site data clear)
  const fpFromDB = await new Promise(resolve => {
    const req = indexedDB.open('TrafficTorchDB', 1);
    req.onupgradeneeded = e => e.target.result.createObjectStore('fingerprints');
    req.onsuccess = e => {
      const db = e.target.result;
      const tx = db.transaction('fingerprints', 'readonly');
      const store = tx.objectStore('fingerprints');
      const getReq = store.get(FINGERPRINT_KEY);
      getReq.onsuccess = () => resolve(getReq.result);
      getReq.onerror = () => resolve(null);
    };
    req.onerror = () => resolve(null);
  });

  if (fpFromDB) {
    currentFingerprint = fpFromDB;
    return currentFingerprint;
  }

  // Generate new fingerprint (same canvas + hardware hash as before)
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  canvas.width = 240;
  canvas.height = 60;
  ctx.textBaseline = 'top';
  ctx.font = 'bold 16px Arial';
  ctx.fillStyle = '#4f46e5';
  ctx.fillText('DateWizza 2026', 12, 12);
  ctx.fillStyle = '#ec4899';
  ctx.fillRect(15, 35, 200, 15);
  ctx.strokeStyle = '#f97316';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(30, 50);
  ctx.quadraticCurveTo(100, 45, 210, 50);
  ctx.stroke();

  const dataURL = canvas.toDataURL('image/png');
  const extra = navigator.platform + navigator.hardwareConcurrency + screen.width + screen.height;
  const encoder = new TextEncoder();
  const data = encoder.encode(dataURL + extra);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  currentFingerprint = hashArray.map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 16);

  // Save to IndexedDB
  await new Promise(resolve => {
    const req = indexedDB.open('TrafficTorchDB', 1);
    req.onsuccess = e => {
      const db = e.target.result;
      const tx = db.transaction('fingerprints', 'readwrite');
      const store = tx.objectStore('fingerprints');
      store.put(currentFingerprint, FINGERPRINT_KEY);
      tx.oncomplete = () => resolve();
    };
  });

  return currentFingerprint;
}

export async function canRunTool(toolName = 'default') {
  const token = localStorage.getItem('authToken') || localStorage.getItem('traffic_torch_jwt');
  
  // Lazy load fingerprint (no top-level await – fixes site break)
  if (!currentFingerprint) {
    await getOrCreateFingerprint();
  }
  
  const fingerprint = currentFingerprint;

  try {
    const res = await fetch(`${API_BASE}/api/check-rate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-fingerprint': fingerprint,
        ...(token && { 'Authorization': `Bearer ${token}` })
      },
      body: JSON.stringify({ toolName })
    });
    if (!res.ok) {
      showUpgradeModal('Could not check run limit – please try again.');
      return false;
    }
    const data = await res.json();
    if (data.allowed === true) {
      if (data.remaining !== undefined) updateRunsBadge?.(data.remaining);
      return true;
    }
    showUpgradeModal(data.message || 'Upgrade to DateWizza Pro');
    return false;
  } catch (err) {
    showUpgradeModal('Connection error – please try again.');
    return false;
  }
}

// Poll for webhook completion & replace token automatically
async function pollForProUpgrade(sessionId) {
  const token = localStorage.getItem('authToken') || localStorage.getItem('traffic_torch_jwt');
  if (!token) return;
  const interval = setInterval(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/session-status?session_id=${sessionId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.status === 'complete') {
        localStorage.removeItem('authToken');
        localStorage.removeItem('traffic_torch_jwt');
        alert('Upgrade successful! Logging you back in with Pro access...');
        showLoginModal();
        clearInterval(interval);
      }
    } catch (err) {}
  }, 5000);
  // Stop polling after 5 min max
  setTimeout(() => clearInterval(interval), 300000);
}

// Shared Footer File
document.addEventListener('DOMContentLoaded', () => {
  fetch('/footer.html')
    .then(response => response.text())
    .then(data => {
      document.getElementById('footer-placeholder').innerHTML = data;
    })
    .catch(error => {});
});

// ==========================================================
// Pro Portal dot – green when logged in, red when logged out
// ==========================================================
let _proDotRan = false;
function updateProPortalDot() {
  const token = localStorage.getItem('authToken') || 
                localStorage.getItem('traffic_torch_jwt') || 
                localStorage.getItem('torch_token');
  const isLoggedIn = token && token !== 'null' && token !== 'undefined';

  document.querySelectorAll('.pro-menu-link').forEach(link => {
    let badge = link.querySelector('.pro-badge');
    if (!badge) {
      const slot = link.querySelector('[data-pro-badge-slot]');
      if (!slot) return;
      badge = document.createElement('span');
      badge.className = 'pro-badge';
      slot.appendChild(badge);
    }
    const nextClass = `pro-badge inline-block w-2.5 h-2.5 rounded-full ${isLoggedIn ? 'bg-green-500' : 'bg-red-500'}`;
    if (badge.className !== nextClass) badge.className = nextClass;
  });
}

// Wait for menus to appear, then run once. No infinite interval.
function waitForMenus(cb, timeoutMs = 8000) {
  const start = Date.now();
  const iv = setInterval(() => {
    const dp = document.getElementById('desktop-menu-placeholder');
    const mp = document.getElementById('mobile-menu-placeholder');
    const ready = dp && mp && dp.innerHTML.trim() && mp.innerHTML.trim();
    if (ready) { clearInterval(iv); cb(); }
    else if (Date.now() - start > timeoutMs) { clearInterval(iv); }
  }, 200);
}

document.addEventListener('DOMContentLoaded', () => {
  waitForMenus(() => {
    updateProPortalDot();
    updatePortalCount();
    updateAuthMenu();
  });
});

document.addEventListener('loginStatusChanged', () => {
  updateProPortalDot();
  updatePortalCount();
  updateAuthMenu();
});

// Portal unread count badge
async function updatePortalCount() {
  const token = localStorage.getItem('authToken');
  const els = document.querySelectorAll('[data-portal-count]');
  if (!token) {
    els.forEach(el => {
      if (el.textContent !== '') el.textContent = '';
      if (!el.classList.contains('hidden')) el.classList.add('hidden');
    });
    return;
  }
  try {
    const res = await fetch('https://datewizza-auth.traffictorch.workers.dev/api/notifications', {
      headers: { 'Authorization': 'Bearer ' + token }
    });
    if (!res.ok) return;
    const data = await res.json();
    const unread = data.unread || 0;
    els.forEach(el => {
      const next = String(unread);
      const hide = unread <= 0;
      if (el.textContent !== next) el.textContent = next;
      if (hide && !el.classList.contains('hidden')) el.classList.add('hidden');
      if (!hide && el.classList.contains('hidden')) el.classList.remove('hidden');
    });
  } catch {}
}
window.updatePortalCount = updatePortalCount;

// Jump to notifications section from the sidebar Portal badge
window.handleNotifJump = function(e) {
  if (e) e.stopPropagation();
  const path = window.location.pathname;
  const onDash = false;
  if (onDash) {
    document.dispatchEvent(new CustomEvent('switchTab', { detail: { tab: 'profile' } }));
    setTimeout(() => {
      const el = document.getElementById('notifications-section');
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 250);
  } else {
    window.location.href = '/dashboard/#calendar';
  }
};

// ==========================================================
// Auth-aware menu (Login/Register ↔ Logout)
// ==========================================================
function getAuthToken() {
  return localStorage.getItem('authToken') ||
         localStorage.getItem('traffic_torch_jwt') ||
         localStorage.getItem('torch_token');
}

function isLoggedIn() {
  const t = getAuthToken();
  return !!t && t !== 'null' && t !== 'undefined';
}

function updateAuthMenu() {
  const loggedIn = isLoggedIn();

  document.querySelectorAll('[data-auth="out"]').forEach(el => {
    el.classList.toggle('hidden', loggedIn);
  });
  document.querySelectorAll('[data-auth="in"]').forEach(el => {
    el.classList.toggle('hidden', !loggedIn);
  });

  // Show email from JWT payload (no extra API call)
  if (loggedIn) {
    let email = '';
    try {
      const t = getAuthToken();
      const payload = JSON.parse(
        atob(t.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))
      );
      email = payload.email || payload.sub || '';
    } catch {}
    document.querySelectorAll('[data-auth-email]').forEach(el => {
      el.textContent = email || 'Signed in';
    });
  }
}

// Global logout — delegated, works on any page + any menu
document.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-auth-logout]');
  if (!btn) return;
  e.preventDefault();
  if (!confirm('Log out of DateWizza?')) return;

  localStorage.removeItem('authToken');
  localStorage.removeItem('traffic_torch_jwt');
  localStorage.removeItem('torch_token');

  document.dispatchEvent(new CustomEvent('loginStatusChanged'));
  window.location.href = '/login/';
});

// Re-run whenever login state changes anywhere
document.addEventListener('loginStatusChanged', updateAuthMenu);
window.updateAuthMenu = updateAuthMenu;

// ==========================================================
// NEW: Event delegation for [data-tab] links (desktop + mobile)
// ==========================================================
document.addEventListener('click', (e) => {
  const tabLink = e.target.closest('[data-tab]');
  if (tabLink) {
    const currentPath = window.location.pathname;
    // Only intercept if we are on the dashboard page
    if (currentPath === '/dashboard/' || currentPath === '/dashboard' || currentPath === '/pro/' || currentPath === '/pro') {
      e.preventDefault();
      const tabId = tabLink.dataset.tab;
      if (tabId) {
        const event = new CustomEvent('switchTab', { detail: { tab: tabId } });
        document.dispatchEvent(event);
      }
    }
    // otherwise, do nothing – let the link navigate normally
  }
});

// ==========================================================
// Toggle function – reusable for both desktop and mobile
// ==========================================================
function attachMenuToggles(containerId) {
  const container = document.getElementById(containerId);
  if (!container) {
    return;
  }
  container.querySelectorAll('button[data-category]').forEach(btn => {
    btn.addEventListener('click', () => {
      const cat = btn.dataset.category;
      const content = container.querySelector(`[data-category-content="${cat}"]`);
      if (!content) return;
      const isExpanded = btn.getAttribute('aria-expanded') === 'true';
      const newExpanded = !isExpanded;
      btn.setAttribute('aria-expanded', newExpanded);
      content.classList.toggle('hidden', !newExpanded);
      const arrow = btn.querySelector('span.transition-transform');
      if (arrow) {
        arrow.style.transform = newExpanded ? 'rotate(180deg)' : 'rotate(0deg)';
      }
    });
  });
}

// Guard the menu toggle: if the menu content hasn't loaded yet, load it
// on-demand before opening so the drawer is never blank.
document.addEventListener('DOMContentLoaded', () => {
  const button = document.getElementById('menuToggle');
  const menu = document.getElementById('mobileMenu');
  const placeholder = document.getElementById('mobile-menu-placeholder');
  if (!button || !menu || !placeholder) return;

  // Remember whether the initial fetch succeeded
  let menuLoaded = placeholder.innerHTML.trim().length > 0;

  // Watch for the async fetch to land
  const observer = new MutationObserver(() => {
    if (placeholder.innerHTML.trim().length > 0) {
      menuLoaded = true;
      observer.disconnect();
    }
  });
  observer.observe(placeholder, { childList: true, subtree: true });

  // Intercept the open tap
  button.addEventListener('click', async (e) => {
    // Only block if we're opening AND content hasn't loaded
    if (menu.classList.contains('hidden') && !menuLoaded) {
      e.stopImmediatePropagation();
      e.preventDefault();

      // Show a tiny loading hint inside the empty menu
      placeholder.innerHTML = '<p style="padding:2rem 1rem;text-align:center;color:#6b7280;">Loading menu…</p>';

      try {
        const r = await fetch('/mobile-menu.html', { cache: 'reload' });
        if (r.ok) {
          placeholder.innerHTML = await r.text();
          attachMenuToggles('mobileMenu');
          menuLoaded = true;
        } else {
          placeholder.innerHTML = '<p style="padding:2rem 1rem;text-align:center;color:#ef4444;">Menu failed to load. Close and reopen.</p>';
        }
      } catch {
        placeholder.innerHTML = '<p style="padding:2rem 1rem;text-align:center;color:#ef4444;">Menu unavailable. Check your connection.</p>';
      }

      // Now actually open the menu
      menu.classList.remove('hidden');
      document.body.classList.add('overflow-hidden');
      button.setAttribute('aria-expanded', 'true');
    }
  }, true);  // capture phase so this runs before the existing handler
}, true);

// ==========================================================
// Load shared menus + attach toggles after loading
// ==========================================================
document.addEventListener('DOMContentLoaded', () => {
  // Desktop menu
  fetch('/desktop-menu.html?v=2.0')
    .then(response => {
      if (!response.ok) throw new Error('Desktop menu fetch failed: ' + response.status);
      return response.text();
    })
    .then(html => {
      const placeholder = document.getElementById('desktop-menu-placeholder');
      placeholder.innerHTML = html;
      // Trigger fade-in after a tiny delay (helps perceived smoothness)
      setTimeout(() => {
        placeholder.classList.add('loaded');
      }, 50);
      attachMenuToggles('desktopSidebar');
    })
    .catch(err => console.error('Desktop menu error:', err));

  // Mobile menu
  fetch('/mobile-menu.html')
    .then(response => {
      if (!response.ok) throw new Error('Mobile menu fetch failed: ' + response.status);
      return response.text();
    })
    .then(html => {
      document.getElementById('mobile-menu-placeholder').innerHTML = html;
      attachMenuToggles('mobileMenu');
    })
    .catch(err => console.error('Mobile menu error:', err));
});

// showUpgradeModal
function showUpgradeModal(message) {
  const modal = document.getElementById('upgradeModal');
  if (!modal) return;

  // Optionally override the default "Daily Limit Reached" subtitle
  const msgEl = modal.querySelector('#upgradeModalContent p');
  if (msgEl && message) msgEl.textContent = message;

  modal.classList.remove('hidden');
  const content = document.getElementById('upgradeModalContent');
  requestAnimationFrame(() => {
    content.classList.remove('scale-95', 'opacity-0');
    content.classList.add('scale-100', 'opacity-100');
  });
}

function closeUpgradeModal() {
  const modal = document.getElementById('upgradeModal');
  if (modal) {
    const content = document.getElementById('upgradeModalContent');
    content.classList.remove('scale-100', 'opacity-100');
    content.classList.add('scale-95', 'opacity-0');
    setTimeout(() => {
      modal.classList.add('hidden');
    }, 300);
  }
}

// Click outside to close
document.addEventListener('click', function(e) {
  const modal = document.getElementById('upgradeModal');
  if (modal && !modal.classList.contains('hidden')) {
    const content = document.getElementById('upgradeModalContent');
    if (!content.contains(e.target) && e.target !== modal) {
      closeUpgradeModal();
    }
  }
});

window.showUpgradeModal = showUpgradeModal;
window.closeUpgradeModal = closeUpgradeModal;

// Share buttons
(function initShare() {
  const run = () => {
    const canonical = document.querySelector('link[rel="canonical"]')?.href || location.href;
    const title = document.title;
    const desc = document.querySelector('meta[name="description"]')?.content || title;
    const enc = encodeURIComponent;

    // Native share (mobile)
    document.querySelectorAll('[data-native-share]').forEach(btn => {
      if (!navigator.share) return;
      btn.hidden = false;
      btn.addEventListener('click', () => {
        navigator.share({ title, text: desc, url: canonical }).catch(() => {});
      });
    });

    // Copy link
    document.querySelectorAll('[data-copy]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const status = btn.closest('.share-block')?.querySelector('.share-status');
        try { await navigator.clipboard.writeText(canonical); }
        catch {
          const i = document.createElement('input');
          i.value = canonical; document.body.appendChild(i);
          i.select(); document.execCommand('copy'); i.remove();
        }
        const old = btn.textContent;
        btn.textContent = 'Copied ✓';
        if (status) status.textContent = 'Link copied to clipboard';
        setTimeout(() => { btn.textContent = old; if (status) status.textContent = ''; }, 1600);
      });
    });
  };
  document.readyState === 'loading'
    ? document.addEventListener('DOMContentLoaded', run, { once: true })
    : run();
})();

// Create Fingerprint
window.getOrCreateFingerprint = getOrCreateFingerprint;

// Global "← Back" handler for blog posts (works in PWA standalone too)
document.addEventListener('click', (e) => {
  const link = e.target.closest('[data-back-link]');
  if (!link) return;
  if (history.length > 1) {
    e.preventDefault();
    history.back();
  }
  // else: default href="/" kicks in as fallback
});

// ============================================================
// Promo banner — Free Lifetime Pro for logged-out users
// Shows on every page (top bar). Delay + dismissal configurable.
// ============================================================
(function () {
  console.log('[promo] IIFE loaded');
  const PROMO_DELAY_MS   = 24000;                 // 2000 (test) → 24000 (prod)
  const DISMISS_KEY      = 'promoBannerDismissedUntil';
  const DISMISS_HOURS    = 24;
  const LOGIN_URL        = '/login/?tab=register';
  const SKIP_PATH_PREFIX = '/login';
  const PROMO_CODE       = 'datewizzapro';
  const BRAND_RED        = '#dc454d';

  function isLoggedIn() {
    const t = localStorage.getItem('authToken') || localStorage.getItem('torch_token');
    return t && t !== 'null' && t !== 'undefined';
  }
  function isDismissed() {
    try {
      const until = localStorage.getItem(DISMISS_KEY);
      return until && Date.now() < parseInt(until, 10);
    } catch (_) { return false; }
  }
  function dismiss() {
    const el = document.getElementById('promo-banner');
    if (el) el.remove();
    try { localStorage.setItem(DISMISS_KEY, String(Date.now() + DISMISS_HOURS * 3600 * 1000)); } catch (_) {}
  }

  function buildBanner() {
    const b = document.createElement('div');
    b.id = 'promo-banner';
    b.setAttribute('role', 'dialog');
    b.setAttribute('aria-label', 'Free Lifetime Pro offer for early adopters');
    b.className = 'fixed left-0 right-0 top-0 text-white shadow-lg px-4 py-2.5 md:py-2 -translate-y-full opacity-0 transition-all duration-300 ease-out';
    b.style.backgroundColor = BRAND_RED;
    b.style.zIndex = '60';

    b.innerHTML = `
      <div style="display: flex; flex-wrap: wrap; align-items: center; justify-content: center; gap: 12px 24px; width: 100%; padding: 0 24px; text-align: center;">
        <span style="font-weight: 600; font-size: 16px; line-height: 1.5; color: white; text-align: center;">🎁 Free Lifetime Pro for early adopters during Alpha/Beta.</span>
        
        <span style="display: flex; align-items: center; gap: 8px; line-height: 1.5;">
          <span style="opacity: 0.9; font-size: 16px; color: white;">Use code</span>
          <button type="button" data-promo-code
                  style="display: inline-flex; align-items: center; justify-content: center; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; font-weight: 700; background: rgba(255,255,255,0.2); border: 1px solid rgba(255,255,255,0.4); padding: 6px 12px; border-radius: 6px; color: white; font-size: 16px; cursor: pointer; box-shadow: 0 1px 2px rgba(0,0,0,0.05);"
                  title="Click to copy promo code">
            ${PROMO_CODE} 📋
          </button>
        </span>
        
        <a href="${LOGIN_URL}"
           style="display: inline-flex; align-items: center; justify-content: center; background: white; color: ${BRAND_RED}; font-weight: 700; padding: 6px 16px; border-radius: 8px; text-decoration: none; font-size: 16px; box-shadow: 0 1px 2px rgba(0,0,0,0.1);">
          Activate Pro →
        </a>
      </div>
      <button type="button" data-promo-close
              style="position: absolute; top: 50%; right: 16px; transform: translateY(-50%); padding: 8px; background: transparent; border: none; color: white; cursor: pointer; display: flex; align-items: center; justify-content: center; border-radius: 6px;"
              onmouseover="this.style.background='rgba(255,255,255,0.2)'" 
              onmouseout="this.style.background='transparent'"
              aria-label="Dismiss offer">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
          <path d="M18 6L6 18M6 6l12 12"/>
        </svg>
      </button>
    `;

    b.querySelector('[data-promo-close]').addEventListener('click', dismiss);

    const codeBtn = b.querySelector('[data-promo-code]');
    codeBtn.addEventListener('click', async () => {
      let copied = false;
      try {
        if (navigator.clipboard && window.isSecureContext) {
          await navigator.clipboard.writeText(PROMO_CODE);
          copied = true;
        }
      } catch (_) {}
      if (!copied) {
        try {
          const ta = document.createElement('textarea');
          ta.value = PROMO_CODE;
          ta.style.position = 'fixed';
          ta.style.opacity = '0';
          document.body.appendChild(ta);
          ta.select();
          document.execCommand('copy');
          ta.remove();
          copied = true;
        } catch (_) {}
      }
      const orig = codeBtn.innerHTML;
      codeBtn.innerHTML = copied ? '✓ Copied!' : '⚠ Copy failed';
      codeBtn.classList.add('bg-white/50');
      setTimeout(() => {
        codeBtn.innerHTML = orig;
        codeBtn.classList.remove('bg-white/50');
      }, 1600);
    });

    return b;
  }

  function show() {
    console.log('[promo] show() called', {
      loggedIn: isLoggedIn(),
      dismissed: isDismissed(),
      path: location.pathname,
      existing: !!document.getElementById('promo-banner')
    });
    if (isLoggedIn()) return;
    if (isDismissed()) return;
    if (location.pathname.startsWith(SKIP_PATH_PREFIX)) return;
    if (document.getElementById('promo-banner')) return;

    const b = buildBanner();
    document.body.appendChild(b);
    requestAnimationFrame(() => {
      b.classList.remove('-translate-y-full', 'opacity-0');
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(show, PROMO_DELAY_MS), { once: true });
  } else {
    setTimeout(show, PROMO_DELAY_MS);
  }
})();
