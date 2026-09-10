const CACHE_NAME = "waterwise-app-shell-v2";
const PRECACHE = self.__WB_MANIFEST ?? [];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      try {
        const cache = await caches.open(CACHE_NAME);
        const urls = PRECACHE.map((entry) => (typeof entry === "string" ? entry : entry.url)).filter(Boolean);
        if (urls.length > 0) {
          await cache.addAll(urls.map((url) => new Request(url, { cache: "reload" })));
        }
      } catch {
        // Precaching is best-effort (e.g. dev mode with an empty manifest).
        // The fetch fallback below still serves navigations from cache/network.
      }
      await self.skipWaiting();
    })(),
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
  let requestUrl;
  try {
    requestUrl = new URL(event.request.url);
  } catch {
    return;
  }
  // Only handle same-origin http(s) GET requests. Leave API, POST, and
  // cross-origin requests to the network so auth cookies/CORS stay intact.
  if (event.request.method !== "GET") return;
  if (!["http:", "https:"].includes(requestUrl.protocol)) return;
  if (requestUrl.origin !== self.location.origin) return;
  if (requestUrl.pathname.startsWith("/api/")) return;

  event.respondWith(
    (async () => {
      try {
        return await fetch(event.request);
      } catch {
        // Network failed (offline/dev restart): fall back to cache.
        try {
          const isNavigation =
            event.request.mode === "navigate" ||
            (event.request.headers.get("accept") ?? "").includes("text/html");
          if (isNavigation) {
            const shell = await caches.match("/index.html");
            if (shell) return shell;
          } else {
            const cached = await caches.match(event.request);
            if (cached) return cached;
            // Navigation-style URLs without mode=navigate still get the shell.
            const shell = await caches.match("/index.html");
            if (shell) return shell;
          }
        } catch {
          // Ignore cache errors and fall through to the offline response.
        }
        return new Response("WaterWise is offline. Reconnect and try again.", {
          status: 503,
          statusText: "Service Unavailable",
          headers: { "Content-Type": "text/plain" },
        });
      }
    })(),
  );
});

self.addEventListener("push", (event) => {
  const payload = (() => {
    try { return event.data?.json() ?? {}; }
    catch { return { body: event.data?.text() ?? "You have a new WaterWise notification." }; }
  })();
  event.waitUntil(self.registration.showNotification(payload.title || "WaterWise", {
    body: payload.body || "You have a new notification.",
    icon: "/pwa-icon-192.png",
    badge: "/pwa-icon-192.png",
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
