// UrbanGlass Canvas — Service Worker v1.0
// Strategy: Cache-first for app shell, network-first for fonts

const CACHE_NAME = 'urbanglass-v1';
const FONT_CACHE = 'urbanglass-fonts-v1';

const APP_SHELL = [
  './index.html',
  './manifest.json',
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache =>
      Promise.allSettled(APP_SHELL.map(url => cache.add(url).catch(() => {})))
    ).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME && k !== FONT_CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(
      caches.open(FONT_CACHE).then(cache =>
        fetch(event.request).then(r => { cache.put(event.request, r.clone()); return r; }).catch(() => cache.match(event.request))
      )
    );
    return;
  }

  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(event.request).then(cached => {
        if (cached) return cached;
        return fetch(event.request).then(r => {
          if (r && r.status === 200) caches.open(CACHE_NAME).then(c => c.put(event.request, r.clone()));
          return r;
        }).catch(() => event.request.mode === 'navigate' ? caches.match('./index.html') : undefined);
      })
    );
    return;
  }

  event.respondWith(fetch(event.request).catch(() => caches.match(event.request)));
});

// ServiceWorker
var GHPATH = '/UrbanGlass_Canvas';

var APP_PREFIX = 'UrbanGlass';

var VERSION = 'version_0.1-alpha';

var URLS = [    
  `${GHPATH}/`,
  `${GHPATH}/index.html`,
  `${GHPATH}/icon-192.png`,
  `${GHPATH}/icon-512.png`,
  `${GHPATH}/manifest.json`,
  `${GHPATH}/sw.js`,