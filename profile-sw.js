/* Cache only public static application assets. Never cache private API responses. */
const CACHE = 'axiom-profile-static-v2';
const STATIC = [
  './profile.html',
  './site.css',
  './profile.css',
  './profile.js',
  './api-config.js',
  './favicon.svg'
];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(STATIC)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(names =>
    Promise.all(names.filter(name => name.startsWith('axiom-profile-static-') && name !== CACHE)
      .map(name => caches.delete(name)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || request.method !== 'GET') return;
  if (!url.pathname.startsWith(new URL(self.registration.scope).pathname)) return;
  // Static files only; the account API uses a separate HTTPS origin and is never stored.
  if (request.mode === 'navigate' && url.pathname.endsWith('/profile.html')) {
    event.respondWith(fetch(request).catch(async () =>
      (await caches.match('./profile.html')) || Response.error()));
    return;
  }
  if (request.mode === 'navigate') return;
  if (!STATIC.some(file => url.pathname.endsWith('/' + file.replace('./','')))) return;
  event.respondWith(caches.match(request).then(hit => hit || fetch(request)));
});
