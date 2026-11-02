// Closer's service worker: shows the notifications the server pushes, and opens the app when one is tapped.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", e => e.waitUntil(self.clients.claim()));

self.addEventListener("push", e => {
  let m = {};
  try { m = e.data ? e.data.json() : {}; } catch { m = { title: "Closer", body: e.data && e.data.text() }; }
  e.waitUntil(self.registration.showNotification(m.title || "Closer", {
    body: m.body || "",
    tag: m.tag,
    icon: "/assets/icons/icon-192.png",
    badge: "/assets/icons/icon-192.png",
    data: { url: m.url || "/" }
  }));
});

self.addEventListener("notificationclick", e => {
  e.notification.close();
  const url = new URL(e.notification.data?.url || "/", self.location.origin).href;
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(list => {
    const open = list.find(c => c.url.startsWith(self.location.origin));
    return open ? open.focus().then(c => c.navigate ? c.navigate(url) : c) : self.clients.openWindow(url);
  }));
});
