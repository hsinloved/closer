import { admin, pushTo, json } from "./_lib.js";
import { pickCard, localDay } from "../shared/pick.js";

// Deals the daily card. Run it every hour (see .github/workflows/daily-card.yml); for each couple with the
// daily rhythm on, it deals once their local clock has passed their chosen hour, and does nothing otherwise.
// If one of you opened the app first and the card already exists, it stays quiet: the app told the other already.
export default async function handler(req, res) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.authorization !== `Bearer ${secret}`) return json(res, 401, { error: "Unauthorized" });

  const db = admin();
  const { data: couples, error } = await db.from("couples").select("id, daily_hour, time_zone").eq("daily_enabled", true);
  if (error) return json(res, 500, { error: error.message });

  const dealt = [];
  for (const c of couples) {
    const { day, hour } = localDay(c.time_zone);
    if (hour < c.daily_hour) continue;
    const { data: past } = await db.from("rounds").select("lv, idx, day").eq("couple_id", c.id);
    if (past.some(r => r.day === day)) continue;
    const card = pickCard(past.map(r => r.lv + ":" + r.idx));
    const { error: insertError } = await db.from("rounds").insert({ couple_id: c.id, day, ...card });
    if (insertError) continue; // the app dealt it a moment ago (unique couple + day)
    const { data: members } = await db.from("members").select("user_id").eq("couple_id", c.id);
    await pushTo(db, members.map(m => m.user_id), { title: "Today's card is here", body: "Open Closer to see it.", tag: `day-${day}`, url: "/" });
    dealt.push(c.id);
  }
  return json(res, 200, { dealt: dealt.length });
}
