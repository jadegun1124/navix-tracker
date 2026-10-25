// Umap PWA. Network first, no offline cache of location data.
const CACHE_NAME = 'umap-pwa-v1';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  const url = event.request.url;
  const tile = url.includes('api.vworld.kr');
  if (tile || event.request.destination === 'image') return;
  event.respondWith(fetch(event.request).catch(() => caches.match(event.request)));
});
