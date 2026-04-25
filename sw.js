// UrbanGlass Canvas — Service Worker v2.0
// Strategy:
//   App shell (index.html, manifest, icons) → cache-first, pre-cached on install
//   Google Fonts CSS + font files          → cache-first (stale-while-revalidate)
//   Everything else                        → cache-first, falling back to network

const CACHE_VERSION = 'urbanglass-v2';
const FONT_CACHE    = 'urbanglass-fonts-v2';
const GHPATH        = '/UrbanGlass_Canvas';

// All files that must be cached at install time for the app to work offline.
// index.html contains ALL JS/CSS inline, so this is the complete shell.
const PRECACHE_URLS = [
  `${GHPATH}/`,
  `${GHPATH}/index.html`,
  `${GHPATH}/manifest.json`,
  `${GHPATH}/icon-192.png`,
  `${GHPATH}/icon-512.png`,
];

// ── Install: pre-cache the app shell ──────────────────────────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_VERSION)
      .then(cache => {
        // Use individual adds so one missing icon doesn't abort the whole install
        return Promise.allSettled(
          PRECACHE_URLS.map(url =>
            cache.add(url).catch(err => console.warn('[SW] pre-cache miss:', url, err))
          )
        );
      })
      .then(() => self.skipWaiting())   // activate immediately, don't wait for old SW to die
  );
});

// ── Activate: delete stale caches from previous versions ─────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys =>
        Promise.all(
          keys
            .filter(k => k !== CACHE_VERSION && k !== FONT_CACHE)
            .map(k => {
              console.log('[SW] deleting old cache:', k);
              return caches.delete(k);
            })
        )
      )
      .then(() => self.clients.claim())  // take control of all open tabs immediately
  );
});

// ── Fetch: serve from cache, fall back to network ────────────────────────────
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Only handle GET requests — pass everything else straight through
  if (event.request.method !== 'GET') return;

  // ── Google Fonts: cache-first with background revalidation ──────────────
  // Fonts are large and rarely change; serve from cache instantly and
  // refresh in the background so the next visit gets updated files.
  if (
    url.hostname === 'fonts.googleapis.com' ||
    url.hostname === 'fonts.gstatic.com'
  ) {
    event.respondWith(
      caches.open(FONT_CACHE).then(async cache => {
        const cached = await cache.match(event.request);
        // Revalidate in background regardless of hit/miss
        const networkFetch = fetch(event.request)
          .then(response => {
            if (response && response.status === 200) {
              cache.put(event.request, response.clone());
            }
            return response;
          })
          .catch(() => null);

        // Return cached version immediately if we have it; otherwise wait for network
        return cached || networkFetch;
      })
    );
    return;
  }

  // ── Anthropic API calls: always network, never cache ────────────────────
  // The in-app Claude API calls must always go to the network.
  if (url.hostname === 'api.anthropic.com') {
    return; // let the browser handle it natively
  }

  // ── App shell & same-origin assets: cache-first ─────────────────────────
  // Since index.html is self-contained (all JS/CSS inline), a cached hit
  // means the app loads fully even with no network connection.
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(event.request).then(cached => {
        if (cached) return cached;

        // Not in cache — fetch from network and store for next time
        return fetch(event.request)
          .then(response => {
            if (response && response.status === 200) {
              const toCache = response.clone();
              caches.open(CACHE_VERSION).then(cache => cache.put(event.request, toCache));
            }
            return response;
          })
          .catch(() => {
            // Network failed — for navigation requests serve the cached shell
            if (event.request.mode === 'navigate') {
              return caches.match(`${GHPATH}/index.html`)
                  || caches.match(`${GHPATH}/`);
            }
            // For other assets (images etc.) just return nothing gracefully
            return new Response('', { status: 408, statusText: 'Offline' });
          });
      })
    );
    return;
  }

  // ── Cross-origin requests (CDN scripts etc.): cache-first ───────────────
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request)
        .then(response => {
          if (response && response.status === 200) {
            const toCache = response.clone();
            caches.open(CACHE_VERSION).then(cache => cache.put(event.request, toCache));
          }
          return response;
        })
        .catch(() => new Response('', { status: 408, statusText: 'Offline' }));
    })
  );
});
