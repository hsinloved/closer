import { admin, pushTo, json } from "./_lib.js";

// Called by the app right after you answer or draw a card, join your partner (or to send yourself a test), with your sign-in token.
// Tells your partner, using only what the database confirms happened: nothing here trusts the request body
// beyond which round it was.
export default async function handler(req, res) {
  if (req.method !== "POST") return json(res, 405, { error: "POST only" });
  const token = (req.headers.authorization || "").replace(/^Bearer /, "");
  const { round_id: roundId, event } = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
  if (!token || !["answered", "drawn", "joined", "test"].includes(event) || (["answered", "drawn"].includes(event) && !roundId)) return json(res, 400, { error: "token, event and round_id are required" });

  const db = admin();
  const { data: auth, error: authError } = await db.auth.getUser(token);
  if (authError || !auth?.user) return json(res, 401, { error: "Not signed in" });
  const me = auth.user.id;
  // A test goes to your own devices, so you can check notifications work before your partner joins.
  if (event === "test") return json(res, 200, await pushTo(db, [me], { title: "Notifications are on", body: "This is how Closer will tap you on the shoulder.", tag: "test", url: "/" }));

  // The second of you just entered the invite code: tell the first. Only the newer member can send it, and only
  // in the minutes after joining, so it can't be replayed later.
  if (event === "joined") {
    const { data: mine } = await db.from("members").select("couple_id, name, created_at").eq("user_id", me).maybeSingle();
    if (!mine) return json(res, 403, { error: "Not paired" });
    const { data: partner } = await db.from("members").select("user_id, created_at").eq("couple_id", mine.couple_id).neq("user_id", me).maybeSingle();
    if (!partner) return json(res, 200, { sent: 0, reason: "no partner yet" });
    if (new Date(mine.created_at) < new Date(partner.created_at) || Date.now() - new Date(mine.created_at) > 10 * 60 * 1000) return json(res, 409, { error: "Not a new pairing" });
    return json(res, 200, await pushTo(db, [partner.user_id], { title: `${mine.name} joined you on Closer`, body: "You're paired. Open Closer for your first card.", tag: "paired", url: "/" }));
  }

  const { data: round } = await db.from("rounds").select("id, couple_id, day, drawn_by, answered_by").eq("id", roundId).single();
  if (!round) return json(res, 404, { error: "No such card" });
  const { data: members } = await db.from("members").select("user_id, name").eq("couple_id", round.couple_id);
  const mine = members?.find(m => m.user_id === me), partner = members?.find(m => m.user_id !== me);
  if (!mine) return json(res, 403, { error: "Not your card" });
  if (!partner) return json(res, 200, { sent: 0, reason: "no partner yet" });

  let message;
  if (event === "answered") {
    if (!round.answered_by.includes(me)) return json(res, 409, { error: "You have not answered this card" });
    message = round.answered_by.includes(partner.user_id)
      ? { title: `${mine.name} answered too`, body: "You've both answered. Open Closer to reveal.", tag: `round-${round.id}` }
      : { title: `${mine.name} answered ${round.day ? "today's card" : "a card"}`, body: "Write yours to unlock it.", tag: `round-${round.id}` };
  } else {
    if (round.drawn_by !== me) return json(res, 409, { error: "You did not draw this card" });
    message = round.day
      ? { title: "Today's card is here", body: "Open Closer to see it.", tag: `day-${round.day}` }
      : { title: `${mine.name} drew a new card`, body: "Open Closer to see it.", tag: `round-${round.id}` };
  }
  return json(res, 200, await pushTo(db, [partner.user_id], { ...message, url: "/" }));
}
