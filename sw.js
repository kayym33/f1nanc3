// Service worker: lets f1nanc3 open offline and be added to the home
// screen. Only the app's own files are cached; bank data never is (it
// goes straight to and from Supabase). Add new files to SHELL.
const CACHE = "f1nanc3-shell";
const SHELL = [
  "./", "index.html", "style.css", "manifest.webmanifest", "icons/icon-180.png", "icons/icon-192.png",
  "js/app.js", "js/categories.js", "js/cloud.js", "js/config.js", "js/csv.js", "js/data.js", "js/flow.js",
  "js/money.js", "js/summary.js", "js/theme.js", "js/ui.js", "js/wrapped.js",
  "js/views/importer.js", "js/views/me.js", "js/views/overview.js", "js/views/river.js", "js/views/transactions.js", "js/views/wrapped.js",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

// The network first, so a new version shows straight away; the cache
// when offline. Requests to other sites (Supabase) go straight through.
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET" || url.origin !== location.origin) return;
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(event.request, copy));
        }
        return response;
      })
      .catch(() => caches.match(event.request).then((cached) => cached ?? caches.match("index.html"))),
  );
});
