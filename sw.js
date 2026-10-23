const CACHE_NAME = 'datewizza-v3'; // BUMP THIS VERSION TO FORCE UPDATE
const ASSETS = [
  '/',
  '/dashboard/',
  '/index.html',
  '/style.css',
  '/main.js'
];

// Install Event (Cache new files)
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS).catch(err => console.warn('Cache addAll failed', err));
    }).then(() => self.skipWaiting()) // Force new SW to take over immediately
  );
});

// Activate Event (Delete old caches)
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            console.log('Deleting old cache:', key);
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim()) // Take control of open pages
  );
});

// Fetch Event (Network First, Cache Fallback)
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  // Do not cache API calls
  if (e.request.url.includes('api.datewizza.com')) return;

  e.respondWith(
    fetch(e.request)
      .then((response) => {
        // Clone the response and update cache dynamically
        const resClone = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(e.request, resClone));
        return response;
      })
      .catch(() => caches.match(e.request))
  );
});
