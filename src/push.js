import { supabase } from "./supabase.js";

const VAPID = import.meta.env.VITE_VAPID_PUBLIC_KEY;
// Remembers "Turn off" on this phone, so opening the app never quietly turns notifications back on.
const OFF_KEY = "closer:push-off";
const setOff = on => { try { on ? localStorage.setItem(OFF_KEY, "1") : localStorage.removeItem(OFF_KEY); } catch {} };
const isOff = () => { try { return localStorage.getItem(OFF_KEY) === "1"; } catch { return false; } };

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

// Must run from a tap, and the permission request must come first: iPhones only show the prompt when it is asked
// for straight away in response to the tap, not after other waiting (setting up the service worker) has happened.
export async function enablePush(userId) {
  if (!VAPID) throw new Error("Notifications aren't set up on the server yet (VITE_VAPID_PUBLIC_KEY is missing).");
  const permission = await Notification.requestPermission();
  if (permission !== "granted") throw new Error("Notifications were not allowed. You can turn them on in iPhone Settings › Notifications › Closer.");
  setOff(false);
  await subscribe(userId);
}

async function subscribe(userId) {
  await navigator.serviceWorker.register("/sw.js");
  const reg = await navigator.serviceWorker.ready;
  const sub = (await reg.pushManager.getSubscription()) || await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(VAPID) });
  const j = sub.toJSON();
  const { error } = await supabase.from("push_subscriptions").upsert({ endpoint: j.endpoint, user_id: userId, p256dh: j.keys.p256dh, auth: j.keys.auth });
  if (error) throw error;
}

// Each time the app opens: if this phone has already allowed notifications, make sure it is still subscribed and
// that the server has its current address (iPhones sometimes renew it, and a re-added home-screen app starts over).
export async function keepPushFresh(userId) {
  try {
    if (!VAPID || !pushSupported() || Notification.permission !== "granted" || isOff()) return;
    await subscribe(userId);
  } catch { /* best effort: Settings still offers the button */ }
}

export async function disablePush() {
  setOff(true);
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
