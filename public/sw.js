/*
 * Galerija service worker — minimal, auth-safe.
 *
 * Galerija is a force-dynamic, cookie-authenticated, personalized app, so this
 * worker deliberately NEVER caches HTML/navigation responses or API routes —
 * doing so could serve one user's page to another or show stale data. It only:
 *   - precaches a static offline fallback page, and
 *   - cache-firsts genuinely immutable, same-origin static assets
 *     (hashed /_next/static/* build output, /icons/*, the manifest).
 * Navigations are network-first; when the network is unavailable the offline
 * fallback is shown. Bump CACHE_VERSION to invalidate old caches on deploy.
 */
const CACHE_VERSION = 'galerija-v1';
const OFFLINE_URL = '/offline.html';
const PRECACHE = [OFFLINE_URL, '/icons/icon-192.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_VERSION)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

/** Same-origin, immutable static assets that are safe to cache-first. */
function isCacheableStatic(url) {
  return (
    url.pathname.startsWith('/_next/static/') ||
    url.pathname.startsWith('/icons/') ||
    url.pathname === '/manifest.webmanifest'
  );
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // ignore cross-origin

  // Navigations: network-first, fall back to the offline page when offline.
  // The HTML response is never stored (avoids stale/cross-user content).
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() =>
        caches.match(OFFLINE_URL, { ignoreSearch: true }),
      ),
    );
    return;
  }

  // Immutable static assets: cache-first, then populate the cache.
  if (isCacheableStatic(url)) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request).then((response) => {
            if (response && response.ok) {
              const copy = response.clone();
              caches
                .open(CACHE_VERSION)
                .then((cache) => cache.put(request, copy));
            }
            return response;
          }),
      ),
    );
    return;
  }

  // Everything else (APIs, dynamic data): straight to the network, no caching.
});
