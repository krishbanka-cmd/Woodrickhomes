const CACHE = 'woodrick-app-v4-consistent-ui';
const APP_SHELL = ['/', '/manifest.webmanifest', '/app-icon.svg', '/offline.html'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== location.origin) return;
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/admin') || url.pathname === '/vendor' || url.pathname.startsWith('/vendor/')) return;

  // UI updates must not remain stuck behind an old offline stylesheet/script.
  // Keep a successful copy only as an offline fallback.
  if (request.destination === 'style' || request.destination === 'script' || /\.(?:css|m?js)$/.test(url.pathname)) {
    event.respondWith(caches.open(CACHE).then(async cache => {
      try {
        const response = await fetch(request, {cache: 'no-cache'});
        if (response.ok) await cache.put(request, response.clone());
        return response;
      } catch (error) {
        const saved = await cache.match(request);
        if (saved) return saved;
        throw error;
      }
    }));
    return;
  }

  if (url.pathname.startsWith('/catalogue-covers/')) {
    event.respondWith(
      caches.open(CACHE).then(async (cache) => {
        const cached = await cache.match(request);
        const fresh = fetch(request).then((response) => {
          if (response.ok) cache.put(request, response.clone());
          return response;
        });
        return cached || fresh;
      })
    );
    return;
  }

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok && !/no-store|private/i.test(response.headers.get('cache-control') || '')) {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(async () => (await caches.match(request)) || caches.match('/offline.html'))
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => cached || fetch(request).then((response) => {
      if (response.ok) {
        const copy = response.clone();
        caches.open(CACHE).then((cache) => cache.put(request, copy));
      }
      return response;
    }))
  );
});
