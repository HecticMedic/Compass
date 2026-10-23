// Offline support: serve from cache, refresh the cache in the background.
// Bump VERSION when files change so phones pick up the new copy.
const VERSION = 'compass-v3';
const FILES = [
  './',
  'index.html',
  'manifest.webmanifest',
  'assets/style.css',
  'assets/common.js',
  'assets/ai.js',
  'assets/vendor/anthropic-sdk.js',
  'assets/icon.svg',
  'assets/icon-180.png',
  'assets/icon-192.png',
  'assets/icon-512.png',
  'meals/',
  'chores/',
  'budget/',
  'habits/',
  'pantry/',
  'assistant/',
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(VERSION).then(cache => cache.addAll(FILES)));
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    caches.open(VERSION).then(async cache => {
      const cached = await cache.match(event.request, { ignoreSearch: true });
      const network = fetch(event.request)
        .then(res => {
          if (res.ok) cache.put(event.request, res.clone());
          return res;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});
