/* Service worker: makes the game installable and playable offline.
 * Network-first: when online you always get the latest build; when offline
 * it falls back to the cached copy. (Cache-first made updates hard to see.) */
const CACHE = "piggy-fly-v10";

// Paths are relative to the service worker's scope (the app folder),
// so this works whether hosted at a domain root or a /pig_fly/ subpath.
const ASSETS = [
  "./",
  "index.html",
  "style.css",
  "audio.js",
  "game.js",
  "manifest.webmanifest",
  "icons/icon-180.png",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "icons/icon-512-maskable.png"
];

self.addEventListener("install", (e) => {
  // Precache each asset independently so one bad/missing path can't fail the
  // whole install (which would leave no offline support at all).
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => Promise.allSettled(ASSETS.map((a) => c.add(a))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  if (new URL(e.request.url).origin !== self.location.origin) return; // let cross-origin pass through
  const fallback = () =>
    caches.match(e.request).then((hit) => hit || (e.request.mode === "navigate" ? caches.match("./index.html") : undefined));
  // Network-first: fetch fresh, update the cache, fall back to cache when the
  // network fails OR returns a broken (non-ok) response, e.g. a bad deploy.
  e.respondWith(
    fetch(e.request).then((res) => {
      if (res && res.ok) {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy));
        return res;
      }
      // Reachable but broken (404/500/503): prefer a good cached copy if we have one.
      return fallback().then((hit) => hit || res);
    }).catch(fallback)
  );
});
