/* The service worker: the delve, offline.
 *
 * Cache-first over the whole shell, because none of it changes between
 * deploys -- and because the point of installing this is a game that opens on
 * a train. The atlas alone is 1.6MB; fetching it over a phone connection every
 * launch is the difference between "a game" and "a web page".
 *
 * VERSION is stamped by tools/deploy.js from the build's own content. A cache
 * keyed by hand is a cache someone forgets to bump, and a forgotten bump means
 * a player stuck on an old build with no way to know it -- the same class of
 * mistake as the stale bundle and the stale core, and the one with the longest
 * blast radius, because it lands on a device you cannot reach.
 */
const VERSION = 'dev';
const CACHE = 'rivenmark-' + VERSION;

// Everything needed to boot with no network at all. Listed rather than
// discovered: a worker that caches whatever happens to be requested caches a
// half-loaded first visit and then serves it forever.
const SHELL = [
  './',
  'index.html',
  'host-stubs.js',
  'host-real.js',
  'core.js',
  'bundle.js',
  'atlas.png',
  'atlas.json',
  'manifest.json',
  'app.webmanifest',
  'icon-192.png',
  'icon-512.png'
];

self.addEventListener('install', e => {
  // Take over at once rather than waiting for every tab to close. A game is
  // one tab, and the alternative is an update that lands whenever.
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)));
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    // Drop every older build's cache. Two full copies of a 3MB shell on a
    // phone is not free, and a stale one can never be served by accident.
    for (const k of await caches.keys()) if (k !== CACHE) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;   // never touch anything remote

  e.respondWith((async () => {
    const hit = await caches.match(req, { ignoreSearch: true });
    if (hit) return hit;
    try {
      const res = await fetch(req);
      // Only opaque-free, same-origin, actually-OK responses are worth keeping;
      // caching a 404 is how a deploy that half-succeeded becomes permanent.
      if (res && res.ok && res.type === 'basic') {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(req, copy));
      }
      return res;
    } catch (err) {
      // Offline and not in the cache. For a navigation that means the app
      // shell, which always is; for anything else there is nothing honest to
      // return, so let it fail rather than hand back a plausible-looking body.
      if (req.mode === 'navigate') {
        const shell = await caches.match('index.html', { ignoreSearch: true });
        if (shell) return shell;
      }
      throw err;
    }
  })());
});
