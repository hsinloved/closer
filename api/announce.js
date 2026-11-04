import { admin, pushTo, json } from "./_lib.js";

// Sends one notification to everyone who has turned notifications on: for news such as a new feature.
// Guarded by the same secret as the daily job; run it from GitHub (Actions → Announce → Run workflow).
export default async function handler(req, res) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.authorization !== `Bearer ${secret}`) return json(res, 401, { error: "Unauthorized" });
  if (req.method !== "POST") return json(res, 405, { error: "POST only" });
  const { title, body } = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
  if (typeof title !== "string" || !title.trim() || title.length > 80 || typeof body !== "string" || body.length > 200)
    return json(res, 400, { error: "title (up to 80 characters) and body (up to 200) are required" });

  const db = admin();
  const { data: subs, error } = await db.from("push_subscriptions").select("user_id");
  if (error) return json(res, 500, { error: error.message });
  const people = [...new Set(subs.map(s => s.user_id))];
  if (!people.length) return json(res, 200, { people: 0, sent: 0 });
  const result = await pushTo(db, people, { title: title.trim(), body: body.trim(), tag: "news", url: "/" });
  return json(res, 200, { people: people.length, ...result });
}
