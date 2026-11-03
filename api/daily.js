import { admin, pushTo, json, dailyMessage } from "./_lib.js";
import { pickCard, localDay, usedKeys } from "../shared/pick.js";

// Deals the daily card. Run it every hour (see .github/workflows/daily-card.yml); for each couple with the
// daily rhythm on, it deals once their local clock has passed their chosen hour, and does nothing otherwise.
// The database decides whether today is a question one of you wrote or the deck card picked here.
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
    const card = pickCard(usedKeys(past));
    const { data: round, error: dealError } = await db.rpc("deal", { p_couple: c.id, p_by: null, p_day: day, p_lv: card.lv, p_idx: card.idx });
    if (dealError || !round?.id) continue; // the app dealt it a moment ago
    const { data: members } = await db.from("members").select("user_id, name").eq("couple_id", c.id);
    for (const m of members) await pushTo(db, [m.user_id], dailyMessage(round, members, m.user_id));
    dealt.push(c.id);
  }
  return json(res, 200, { dealt: dealt.length });
}
