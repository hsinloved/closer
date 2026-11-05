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
  // If Closer is already open on that page, just bring it forward: navigating would reload it and throw away
  // whatever you were typing. The app refreshes its cards by itself when it comes back into view.
  const same = c => { const a = new URL(c.url), b = new URL(url); return a.origin === b.origin && a.pathname === b.pathname; };
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(list => {
    const here = list.find(same);
    if (here) return here.focus();
    const open = list.find(c => c.url.startsWith(self.location.origin));
    return open ? open.focus().then(c => c.navigate ? c.navigate(url) : c) : self.clients.openWindow(url);
  }));
});
