// Minimal service worker — exists mainly so the browser considers the site
// installable (PWA "Add to Home Screen"). Deliberately conservative: it does
// NOT cache API responses or hashed JS/CSS bundles, since Poll Position's
// data (weeks, ballots, rankings) changes constantly and a stale cache would
// be actively wrong, not just slow. It only gives navigations an offline
// fallback to the cached app shell.
const CACHE = 'pollposition-shell-v1';
const SHELL = ['/', '/manifest.json', '/icon.svg'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  // Only handle top-level navigations — everything else (API calls, JS/CSS,
  // images) goes straight to the network untouched.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() => caches.match('/'))
    );
  }
});
