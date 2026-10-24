// Minimal Service Worker for umap PWA Installation
const CACHE_NAME = 'umap-pwa-v1';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  // Let network fetch proceed directly
  event.respondWith(fetch(event.request).catch(() => caches.match(event.request)));
});
