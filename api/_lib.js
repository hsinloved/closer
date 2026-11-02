import { createClient } from "@supabase/supabase-js";
import webpush from "web-push";

// Server-side Supabase client. The service role key skips row-level security, so it lives only in
// Vercel's environment and is never sent to a browser.
export function admin() {
  const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

let vapidReady = false;
function vapid() {
  if (vapidReady) return;
  const pub = process.env.VAPID_PUBLIC_KEY, priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) throw new Error("VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY must be set");
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || "mailto:closer@example.com", pub, priv);
  vapidReady = true;
}

// Push one notification to every device a person has turned notifications on for.
// Subscriptions the push service says are gone (the app was removed, permission revoked) are deleted.
export async function pushTo(db, userIds, message) {
  vapid();
  const { data: subs, error } = await db.from("push_subscriptions").select("endpoint, p256dh, auth").in("user_id", userIds);
  if (error) throw error;
  const payload = JSON.stringify(message);
  const results = await Promise.allSettled(subs.map(s =>
    webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 60 * 60 * 12 })));
  const gone = subs.filter((s, i) => results[i].status === "rejected" && [404, 410].includes(results[i].reason?.statusCode)).map(s => s.endpoint);
  if (gone.length) await db.from("push_subscriptions").delete().in("endpoint", gone);
  return { sent: results.filter(r => r.status === "fulfilled").length, failed: results.filter(r => r.status === "rejected").length };
}

export function json(res, status, body) {
  res.statusCode = status;
  res.setHeader("content-type", "application/json");
  res.end(JSON.stringify(body));
}
