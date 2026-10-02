// Offline cache. Pri každej zmene súborov zvýš VERSION.
const VERSION = 'makra-v17';
const FILES = ['./', 'index.html', 'styles.css', 'app.js', 'calc.js', 'health.js', 'cloud.js', 'manifest.webmanifest',
  'icons/icon.svg', 'icons/icon-180.png', 'icons/icon-192.png', 'icons/icon-512.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});
// Najprv sieť (aby sa aktualizácie prejavili hneď), bez siete z cache
self.addEventListener('fetch', (e) => {
  // len súbory appky – volania na GitHub API (so zálohou a tokenom) sa nesmú cachovať
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== self.location.origin) return;
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        const copy = res.clone();
        caches.open(VERSION).then((c) => c.put(e.request, copy));
        return res;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true }))
  );
});
