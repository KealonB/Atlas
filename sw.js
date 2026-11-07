/* ATLAS offline cache: app shell + vendored pdf.js / pdf-lib. User data lives in IndexedDB, never in this cache. */
const CACHE = "atlas-shell-v0.3.0";
const SHELL = ["./", "./index.html", "./style.css?v=0.2.0", "./atlas-pro.css?v=0.3.0", "./app.js?v=0.3.0", "./atlas-ids.js?v=0.3.0", "./atlas-pro.js?v=0.3.0",
  "./atlas-export.js?v=0.3.0", "./manifest.webmanifest", "./icons/atlas-192.png", "./icons/atlas-512.png", "./icons/atlas-180.png",
  "./vendor/pdf.min.js", "./vendor/pdf.worker.min.js", "./vendor/pdf-lib.min.js"];
self.addEventListener("install", (e) => e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())));
self.addEventListener("activate", (e) => e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET" || new URL(req.url).origin !== location.origin) return; // fonts/CDN: browser default
  if (req.mode === "navigate") { // network first so updates land, cached shell when offline
    e.respondWith(fetch(req).then((r) => { const copy = r.clone(); caches.open(CACHE).then((c) => c.put("./index.html", copy)); return r; }).catch(() => caches.match("./index.html")));
    return;
  }
  e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((r) => { if (r.ok) { const copy = r.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); } return r; })));
});
