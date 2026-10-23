// /apps/apps.js — delegates install to main.js's shared handler

const ua = navigator.userAgent.toLowerCase();
const isIOS = /iphone|ipad|ipod/.test(ua) ||
              (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const isAndroid = /android/.test(ua);
const isStandalone =
  window.matchMedia('(display-mode: standalone)').matches ||
  window.navigator.standalone === true;

// Store button "coming soon" messages
function initComingSoon() {
  document.querySelectorAll('[data-coming-soon]').forEach(btn => {
    btn.addEventListener('click', () => {
      const which = btn.dataset.comingSoon === 'ios' ? 'App Store' : 'Google Play';
      alert(`Native ${which} app is coming soon. Install the PWA now for the full experience.`);
    });
  });
}

// Uninstall tabs (iOS / Android / Desktop)
function initUninstallTabs() {
  const tabs = document.querySelectorAll('[data-os-tab]');
  const panels = document.querySelectorAll('[data-os-panel]');
  if (!tabs.length) return;

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const target = tab.dataset.osTab;
      tabs.forEach(t => {
        const on = t === tab;
        t.setAttribute('aria-selected', on ? 'true' : 'false');
        t.classList.toggle('border-orange-500', on);
        t.classList.toggle('text-orange-600', on);
        t.classList.toggle('dark:text-orange-400', on);
        t.classList.toggle('border-transparent', !on);
        t.classList.toggle('text-gray-600', !on);
        t.classList.toggle('dark:text-gray-400', !on);
      });
      panels.forEach(p => {
        p.classList.toggle('hidden', p.dataset.osPanel !== target);
      });
    });
  });

  if (isIOS) tabs[0]?.click();
  else if (isAndroid) tabs[1]?.click();
  else tabs[2]?.click();
}

// Wire up the install buttons
document.addEventListener('DOMContentLoaded', () => {
  const clickHandler = () => {
    if (typeof window.triggerPWAInstall === 'function') {
      window.triggerPWAInstall();
    }
  };

  document.getElementById('tt-install-trigger')?.addEventListener('click', clickHandler);
  document.getElementById('tt-install-trigger-footer')?.addEventListener('click', clickHandler);

  initUninstallTabs();
  initComingSoon();

  // Already installed → swap button for green banner
  if (isStandalone) {
    document.getElementById('installed-banner')?.classList.remove('hidden');
    document.getElementById('install-cta-zone')?.classList.add('hidden');
  }
});