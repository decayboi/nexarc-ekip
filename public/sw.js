/* Nexarc PWA service worker — uygulama kabuğunu önbelleğe alır */
const CACHE = 'nexarc-v1';
const ASSETS = [
  './',
  'index.html',
  'style.css',
  'app.js',
  'logo.png',
  'manifest.json',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'fonts/SpaceGrotesk-Variable.ttf',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  // Socket.IO ve yüklemeler her zaman ağdan
  if (url.pathname.includes('/socket.io') || url.pathname.startsWith('/uploads') || url.pathname.startsWith('/gifs')) return;
  e.respondWith(
    caches.match(e.request).then((hit) => hit || fetch(e.request).then((res) => {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {});
      return res;
    }))
  );
});
