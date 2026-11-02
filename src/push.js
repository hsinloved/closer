import { supabase } from "./supabase.js";

const VAPID = import.meta.env.VITE_VAPID_PUBLIC_KEY;

export const pushSupported = () => "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
// iPhones only allow web notifications for apps added to the home screen.
export const isStandalone = () => window.navigator.standalone === true || window.matchMedia("(display-mode: standalone)").matches;
export const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent);

export async function pushState() {
  if (!pushSupported()) return { permission: "unsupported", subscribed: false };
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = reg && await reg.pushManager.getSubscription();
  return { permission: Notification.permission, subscribed: Boolean(sub) };
}

// Must run from a tap: browsers only show the permission prompt in response to one.
export async function enablePush(userId) {
  if (!VAPID) throw new Error("Notifications aren't set up on the server yet (VITE_VAPID_PUBLIC_KEY is missing).");
  const reg = await navigator.serviceWorker.register("/sw.js");
  await navigator.serviceWorker.ready;
  const permission = await Notification.requestPermission();
  if (permission !== "granted") throw new Error("Notifications were not allowed. You can turn them on in Settings › Notifications › Closer.");
  const sub = (await reg.pushManager.getSubscription()) || await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(VAPID) });
  const j = sub.toJSON();
  const { error } = await supabase.from("push_subscriptions").upsert({ endpoint: j.endpoint, user_id: userId, p256dh: j.keys.p256dh, auth: j.keys.auth });
  if (error) throw error;
}

export async function disablePush() {
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = reg && await reg.pushManager.getSubscription();
  if (!sub) return;
  await supabase.from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
  await sub.unsubscribe();
}

function b64ToBytes(s) {
  const pad = "=".repeat((4 - s.length % 4) % 4), raw = atob((s + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, c => c.charCodeAt(0));
}
