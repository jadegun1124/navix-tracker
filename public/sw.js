// Umap PWA. Same-origin GET is network first. Family sync is cross-origin and must not be intercepted:
// a service worker that forwards PUT bodies can drop the live location publish.
const CACHE_NAME = 'umap-pwa-v2';

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  if (event.request.method !== 'GET') return;
  if (url.pathname.includes('/v1/')) return;
  if (url.hostname.includes('vworld.kr') || event.request.destination === 'image') return;
  event.respondWith(fetch(event.request).catch(() => caches.match(event.request)));
});

self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = {};
  }
  const title = typeof payload.title === 'string' && payload.title ? payload.title : 'Umap';
  const body = typeof payload.body === 'string' ? payload.body : '';
  const alert = {
    id: payload.id,
    kind: payload.kind,
    code: payload.code,
    at: payload.at,
    from: payload.from,
    body,
  };
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const visible = windows.some((client) => client.visibilityState === 'visible');
    if (visible) {
      await Promise.all(windows.map((client) => client.postMessage({ type: 'umap-alert', alert })));
      return;
    }
    await self.registration.showNotification(title, {
      body,
      tag: typeof payload.id === 'string' ? payload.id : 'umap-alert',
      renotify: true,
      data: alert,
    });
  })());
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = new URL('./?app=1', self.location.href).href;
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of windows) {
      if ('focus' in client) {
        await client.focus();
        return;
      }
    }
    if (self.clients.openWindow) await self.clients.openWindow(target);
  })());
});
