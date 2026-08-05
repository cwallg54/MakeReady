/* MakeReady service worker — intentionally minimal and safe.
 *
 * It exists only to make the app installable and to show a friendly offline
 * page when the network is truly unreachable. It deliberately does NOT cache
 * the app's HTML or JS/CSS bundles: those are content-hashed and served with
 * immutable caching by the CDN already, and caching them in the SW risks
 * serving a stale/mismatched bundle after a deploy (the classic PWA white
 * screen). Network passes straight through; the SW never intercepts asset
 * loads, so it can't blank the app. */
const CACHE = "makeready-v5";
const OFFLINE = "/offline.html";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((c) => c.add(OFFLINE)).then(() => self.skipWaiting()).catch(() => self.skipWaiting())
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
  // Only ever touch top-level page navigations, and only to fall back to the
  // offline page if the network genuinely fails. Everything else (JS, CSS,
  // RSC, images, API) is left entirely to the browser/CDN.
  if (request.method !== "GET" || request.mode !== "navigate") return;

  event.respondWith(
    fetch(request).catch(async () => {
      const cached = await caches.match(OFFLINE);
      // Always return a real Response so the browser never shows a blank frame.
      return cached ?? new Response(
        "<!doctype html><meta charset=utf-8><title>Offline</title><body style='font-family:sans-serif;padding:2rem'>You're offline. <a href=''>Retry</a>.",
        { headers: { "Content-Type": "text/html; charset=utf-8" } }
      );
    })
  );
});
