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
const PREFIX = 'rivenmark-';
const CACHE = PREFIX + VERSION;

/* WHOSE CACHES THESE ARE. This game is served from a site that serves other
 * things too (the same origin carries other apps), and caches are per origin,
 * not per app. So this worker touches ONLY caches whose name it owns
 * (PREFIX), looks requests up in its OWN cache only, and keeps only what
 * lives under its own scope. It used to delete every cache but its current
 * one on activation -- other apps' offline copies included. */
const mine = k => k.startsWith(PREFIX);
const inScope = url => url.href.startsWith(self.registration.scope);

/* UNSTAMPED MEANS DEVELOPMENT, AND DEVELOPMENT MUST NOT BE CACHED.
 *
 * Only tools/deploy.js stamps VERSION. The copy in public/ -- the one
 * `npm run serve` hands a phone on the same wifi -- stays 'dev' forever, so
 * cache-first under a name that never changes meant the phone kept serving
 * the first bundle it ever saw, rebuild after rebuild, with nothing to say so.
 * Unstamped, this worker installs, clears every rivenmark cache it finds
 * (including one a phone is already stuck on), and lets every request go to
 * the network. */
const DEV = VERSION === 'dev';

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
  if (DEV) return;
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)));
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    // Drop every older build's cache. Two full copies of a 3MB shell on a
    // phone is not free, and a stale one can never be served by accident.
    for (const k of await caches.keys()) if (mine(k) && (DEV || k !== CACHE)) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', e => {
  if (DEV) return;                               // straight to the network
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;   // never touch anything remote
  if (!inScope(url)) return;                     // nor another app on this origin

  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const hit = await cache.match(req, { ignoreSearch: true });
    if (hit) return hit;
    try {
      const res = await fetch(req);
      // Only opaque-free, same-origin, actually-OK responses are worth keeping;
      // caching a 404 is how a deploy that half-succeeded becomes permanent.
      if (res && res.ok && res.type === 'basic') {
        const copy = res.clone();
        cache.put(req, copy);
      }
      return res;
    } catch (err) {
      // Offline and not in the cache. For a navigation that means the app
      // shell, which always is; for anything else there is nothing honest to
      // return, so let it fail rather than hand back a plausible-looking body.
      if (req.mode === 'navigate') {
        const shell = await cache.match('index.html', { ignoreSearch: true });
        if (shell) return shell;
      }
      throw err;
    }
  })());
});
