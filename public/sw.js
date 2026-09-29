/**
 * PATENTE PRO service worker.
 *
 * Strategy:
 * - App shell (HTML/CSS/JS/manifest/icons): network-first with cache
 *   fallback, so code updates land immediately while offline still works.
 * - Static data (questions, theory, dictionary, manifest, sign images):
 *   stale-while-revalidate — instant from cache, refreshed in background.
 * - GET /api/progress: network-first with cache fallback so the dashboard
 *   renders offline with the last known state.
 * - Mutations (POST/PUT/DELETE): network only, never cached. Offline
 *   ANSWERS are queued by the app (state.js localStorage queue) and
 *   replayed when the server responds again; other mutations error.
 */

const VERSION = 'v47';
const SHELL_CACHE = `shell-${VERSION}`;
const DATA_CACHE = `data-${VERSION}`;

const SHELL = [
  '/',
  '/styles.css',
  '/js/main.js',
  '/js/views.js',
  '/js/views/common.js',
  '/js/views/search.js',
  '/js/views/dictionary.js',
  '/js/views/settings.js',
  '/js/views/stats.js',
  '/js/views/onboarding.js',
  '/js/views/dashboard.js',
  '/js/views/theory.js',
  '/js/views/exam.js',
  '/js/views/practice.js',
  '/js/views/review.js',
  '/js/state.js',
  '/js/api.js',
  '/js/ui.js',
  '/js/sound.js',
  '/js/local-progress.js',
  '/js/install.js',
  '/js/domain/progress.js',
  '/js/domain/translations.js',
  '/js/theory-map.js',
  '/manifest.webmanifest',
  '/credits.html',
  '/privacy.html',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon-maskable-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== SHELL_CACHE && k !== DATA_CACHE).map((k) => caches.delete(k))),
    ).then(() => self.clients.claim()),
  );
});

function isStaticData(url) {
  return (
    url.pathname.startsWith('/images/') ||
    url.pathname.startsWith('/data/')
  );
}

function isShell(url) {
  return SHELL.includes(url.pathname);
}

async function networkFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const fresh = await fetch(request);
    if (fresh.ok) cache.put(request, fresh.clone());
    return fresh;
  } catch (err) {
    const cached = await cache.match(request);
    if (cached) return cached;
    throw err;
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(DATA_CACHE);
  const cached = await cache.match(request);
  const refresh = fetch(request)
    .then((fresh) => {
      if (fresh.ok) cache.put(request, fresh.clone());
      return fresh;
    })
    .catch(() => null);
  return cached || refresh.then((fresh) => {
    if (!fresh) throw new Error('offline and not cached');
    return fresh;
  });
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return; // mutations go straight to the network
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    // Any route (hash routing → always "/") falls back to the cached shell.
    event.respondWith(
      networkFirst(new Request('/'), SHELL_CACHE).catch(() => caches.match('/')),
    );
    return;
  }
  if (isShell(url)) {
    event.respondWith(networkFirst(request, SHELL_CACHE));
    return;
  }
  if (isStaticData(url)) {
    event.respondWith(staleWhileRevalidate(request));
    return;
  }
  if (url.pathname === '/api/progress') {
    event.respondWith(networkFirst(request, DATA_CACHE));
  }
  // everything else (e.g. /api/health): default network behaviour
});
