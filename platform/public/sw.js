/* MakeReady service worker — installable PWA + graceful offline.
 * Deliberately conservative: it caches static, hashed assets and an offline
 * fallback page, but NEVER caches authenticated HTML responses (navigations are
 * network-first), so a shared device can't serve one user's data to another. */
const CACHE = "makeready-v3";
const PRECACHE = [
  "/offline.html",
  "/manifest.webmanifest",
  "/icon-192.png",
  "/icon-512.png",
  "/apple-touch-icon.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(PRECACHE)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Hashed, immutable static assets → cache-first (fast repeat loads, offline).
  const isStatic = url.pathname.startsWith("/_next/static/") ||
    /\.(?:png|jpe?g|svg|gif|webp|ico|woff2?)$/.test(url.pathname);
  if (isStatic) {
    event.respondWith(
      caches.match(request).then((hit) =>
        hit ||
        fetch(request).then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((cache) => cache.put(request, copy));
          return res;
        }).catch(() => hit)
      )
    );
    return;
  }

  // Page navigations → network-first; show the offline page only if the network
  // is unreachable. Authenticated HTML is never written to the cache.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(() => caches.match("/offline.html"))
    );
  }
});
