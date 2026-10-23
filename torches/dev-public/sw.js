// PWA-ready service worker – network-only, no caching + Web Push receiver
self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

const BYPASS = [
  'datewizza-auth.traffictorch.workers.dev',
  'datewizza.workers.dev',
  'static.cloudflareinsights.com',
  'stripe.network',
  'stripe.com',
  'googletagmanager.com',
  'google-analytics.com',
  'googlesyndication.com',
];

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = req.url;
  if (BYPASS.some(h => url.includes(h))) return;

if (req.mode === 'navigate') {
  event.respondWith(
    fetch(req, { cache: 'no-store' }).catch(() => new Response('Offline', { status: 503, statusText: 'Offline' }))
  );
  return;
}

  event.respondWith(
    fetch(req, { cache: 'no-store' }).catch(() =>
      new Response('Offline', { status: 503, statusText: 'Offline' })
    )
  );
});

// ============================================================
// Web Push receiver
// ============================================================
self.addEventListener('push', (event) => {
  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
  } catch {
    payload = { title: 'DateWizza', body: event.data.text() };
  }

  const title = payload.title || 'DateWizza';
  const options = {
    body: payload.body || '',
    tag: payload.tag || 'tt-default',
    data: {
      url: payload.url || '/',
      type: payload.type || 'system',
      ...(payload.data || {}),
    },
    icon: '/logo-160w.webp',
    badge: '/logo-100w.webp',
    requireInteraction: false,
    renotify: false,
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || '/';

  event.waitUntil((async () => {
    const allClients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const absoluteTarget = new URL(targetUrl, self.location.origin);

    for (const client of allClients) {
      const clientUrl = new URL(client.url);
      if (clientUrl.origin === absoluteTarget.origin && clientUrl.pathname === absoluteTarget.pathname) {
        await client.focus();
        if ('navigate' in client) {
          try { await client.navigate(absoluteTarget.href); } catch {}
        }
        return;
      }
    }

    if (self.clients.openWindow) {
      await self.clients.openWindow(absoluteTarget.href);
    }
  })());
});
