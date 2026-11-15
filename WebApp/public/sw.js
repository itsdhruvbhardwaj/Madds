const SHELL = 'madds-shell-v1';
const IMAGES = 'madds-style-images-v1';
const LIMIT = 220;
self.addEventListener('install', event => {
  event.waitUntil(caches.open(SHELL).then(cache => cache.addAll(['/', '/assets/icon.png', '/assets/wordmark.png', '/manifest.webmanifest'])));
  self.skipWaiting();
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith('madds-') && ![SHELL, IMAGES].includes(k)).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || request.headers.has('Authorization') || url.pathname.startsWith('/api/')) return;
  if (url.hostname === 'res.cloudinary.com' && url.pathname.includes('/picmee/styles/')) {
    // Public style thumbnails only. Never cache user uploads or private results here.
    event.respondWith(caches.open(IMAGES).then(async cache => {
      const cached = await cache.match(request);
      if (cached) return cached;
      const response = await fetch(request);
      if (response.ok || response.type === 'opaque') {
        await cache.put(request, response.clone());
        const keys = await cache.keys();
        await Promise.all(keys.slice(0, Math.max(0, keys.length - LIMIT)).map(k => cache.delete(k)));
      }
      return response;
    }));
    return;
  }
  if (url.origin !== self.location.origin) return;
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).then(response => { if (response.ok) { const copy = response.clone(); event.waitUntil(caches.open(SHELL).then(cache => cache.put('/', copy))); } return response; }).catch(() => caches.match('/')));
  } else if (url.pathname.startsWith('/assets/')) {
    event.respondWith(caches.match(request).then(cached => cached || fetch(request).then(response => { if (response.ok) { const copy = response.clone(); event.waitUntil(caches.open(SHELL).then(cache => cache.put(request, copy))); } return response; })));
  }
});
