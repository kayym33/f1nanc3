// Service worker: lets f1nanc3 open offline and be added to the home
// screen, and shows notifications (supabase/functions/fin-alerts). Only
// the app's own files are cached; bank data never is (it goes straight to
// and from Supabase). Add new files to SHELL.
const CACHE = "f1nanc3-shell";
const SHELL = [
  "./", "index.html", "style.css", "manifest.webmanifest", "icons/icon-180.png", "icons/icon-192.png",
  "js/app.js", "js/ask.js", "js/balances.js", "js/bank.js", "js/budget.js", "js/categories.js", "js/chart.js", "js/chartstyle.js", "js/cloud.js", "js/config.js", "js/csv.js", "js/data.js", "js/income.js", "js/manual.js", "js/flow.js",
  "js/money.js", "js/push.js", "js/insights.js", "js/pin.js", "js/privacy.js", "js/payday.js", "js/services.js", "js/subscriptions.js", "js/summary.js", "js/trends.js", "js/theme.js", "js/ui.js", "js/whatif.js", "js/wrapped.js",
  "js/views/ask.js", "js/views/budget.js", "js/views/charts.js", "js/views/importer.js", "js/views/lock.js", "js/views/me.js", "js/views/overview.js", "js/views/river.js", "js/views/subs.js", "js/views/transactions.js", "js/views/whatif.js", "js/views/wrapped.js",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

// The network first, so a new version shows straight away; the cache
// when offline. "no-cache" makes the browser check with the server every
// time instead of trusting GitHub Pages' 10-minute cache (an unchanged
// file costs a tiny "not modified" reply), so a deploy shows on the next
// open. Requests to other sites (Supabase) go straight through.
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET" || url.origin !== location.origin) return;
  event.respondWith(
    fetch(event.request, { cache: "no-cache" })
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

self.addEventListener("push", (event) => {
  let message = {};
  try {
    message = event.data ? event.data.json() : {};
  } catch {
    message = { body: event.data?.text() ?? "" };
  }
  // iOS stops sending pushes to an app that gets one without showing a
  // notification, so always show one.
  event.waitUntil(self.registration.showNotification(message.title || "f1nanc3", {
    body: message.body || "",
    icon: "icons/icon-192.png",
    tag: message.tag,
    data: { url: message.url || "./" },
  }));
});

// A tap opens the page it's about, in the app if it's already open.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || "./", self.registration.scope).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
      const open = windows.find((client) => client.url.startsWith(self.registration.scope));
      if (open) {
        open.navigate(target).catch(() => {});
        return open.focus();
      }
      return self.clients.openWindow(target);
    }),
  );
});
