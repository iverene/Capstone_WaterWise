const CACHE_NAME = "waterwise-app-shell-v1";
const PRECACHE = self.__WB_MANIFEST;

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE.map((entry) => entry.url)))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET" || new URL(event.request.url).pathname.startsWith("/api/")) return;
  event.respondWith(
    fetch(event.request).catch(async () => {
      const cached = await caches.match(event.request);
      return cached || caches.match("/index.html");
    }),
  );
});

self.addEventListener("push", (event) => {
  const payload = (() => {
    try { return event.data?.json() ?? {}; }
    catch { return { body: event.data?.text() ?? "You have a new WaterWise notification." }; }
  })();
  event.waitUntil(self.registration.showNotification(payload.title || "WaterWise", {
    body: payload.body || "You have a new notification.",
    icon: "/pwa-icon-192.svg",
    badge: "/pwa-icon-192.svg",
    tag: payload.tag,
    renotify: payload.priority === "critical",
    requireInteraction: payload.priority === "critical",
    data: { notificationId: payload.notificationId, url: payload.url || "/consumer/home" },
  }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || "/consumer/home", self.location.origin);
  if (event.notification.data?.notificationId) {
    target.searchParams.set("notificationId", event.notification.data.notificationId);
  }
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const existing = windows.find((client) => {
      const clientUrl = new URL(client.url);
      return clientUrl.origin === self.location.origin && clientUrl.pathname.startsWith("/consumer");
    });
    if (existing) {
      existing.postMessage({ type: "WATERWISE_PUSH_CLICK", url: target.href });
      return existing.focus();
    }
    const opened = await self.clients.openWindow(target.href);
    return opened?.focus();
  })());
});
