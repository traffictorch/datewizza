// DateWizza Shared: Google Analytics 4 – Deferred + Reliable
export default function initGA() {
  const enableGA = true; // Set to false for local testing
  const MEASUREMENT_ID = 'G-Q747FK7MRC';

  function loadGA() {
    if (window.gtag) return;

    const script = document.createElement('script');
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${MEASUREMENT_ID}`;
    document.head.appendChild(script);

    script.onload = function() {
      window.dataLayer = window.dataLayer || [];
      function gtag(){dataLayer.push(arguments);}
      window.gtag = gtag;

      gtag('js', new Date());
      
      gtag('config', MEASUREMENT_ID, {
        cookie_expires: 63072000,   // 2 years – prevents expires warning
        cookie_prefix: '_ga',
        send_page_view: true
      });
    };
  }

  let fired = false;
  function fireOnce() {
    if (fired) return;
    fired = true;
    loadGA();
    cleanup();
  }

  const events = ['scroll', 'pointerdown', 'keydown', 'touchstart'];
  events.forEach(ev => window.addEventListener(ev, fireOnce, { once: true, passive: true }));

  setTimeout(fireOnce, 4500);

  function cleanup() {
    events.forEach(ev => window.removeEventListener(ev, fireOnce));
  }
}

// Auto-init when module loads
initGA();