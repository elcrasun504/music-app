const CACHE_NAME = 'cholumusica-shell-v7';
const PRECACHE_URLS = [
  '/public/offline.html',
  '/public/manifest.webmanifest',
  '/public/css/style.css?v=20260946',
  '/public/js/pwa.js?v=20260938',
  '/public/js/offline-player.js?v=20260940',
  '/public/icons/icon-180.png',
  '/public/icons/icon-192.png',
  '/public/icons/icon-512.png',
  '/pwa/site.css',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys
        .filter((key) => key.startsWith('cholumusica-') && key !== CACHE_NAME)
        .map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const requestUrl = new URL(request.url);

  if (request.method !== 'GET' || requestUrl.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(async () => (await caches.match('/public/offline.html')) || Response.error())
    );
    return;
  }

  if (requestUrl.pathname === '/pwa/site.css') {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      const cached = await cache.match(requestUrl.pathname);
      try {
        const response = await fetch(request);
        if (response.ok) await cache.put(requestUrl.pathname, response.clone());
        return response;
      } catch (error) {
        return cached || Response.error();
      }
    })());
    return;
  }

  const staticAsset = requestUrl.pathname.startsWith('/public/')
    && ['style', 'script', 'image', 'font', 'manifest'].includes(request.destination);
  if (!staticAsset) return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(request);
    if (cached) return cached;

    const response = await fetch(request);
    if (response.ok) await cache.put(request, response.clone());
    return response;
  })());
});