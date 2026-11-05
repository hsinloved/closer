import { admin, pushTo, json } from "./_lib.js";

// Called by the app right after you answer, comment on, draw, skip or bring back a card, join your partner (or to send yourself a test), with your sign-in token.
// Tells your partner, using only what the database confirms happened: nothing here trusts the request body
// beyond which round it was.
export default async function handler(req, res) {
  if (req.method !== "POST") return json(res, 405, { error: "POST only" });
  const token = (req.headers.authorization || "").replace(/^Bearer /, "");
  const { round_id: roundId, event } = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
  if (!token || !["answered", "commented", "drawn", "skipped", "restored", "joined", "test"].includes(event) || (["answered", "commented", "drawn", "skipped", "restored"].includes(event) && !roundId)) return json(res, 400, { error: "token, event and round_id are required" });

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

  const { data: round } = await db.from("rounds").select("id, couple_id, lv, day, drawn_by, written_by, answered_by, restored_by, restored_at").eq("id", roundId).single();
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
  } else if (event === "skipped") {
    // The new card is yours, and you skipped one in the last few minutes: only then is this a real skip.
    if (round.drawn_by !== me) return json(res, 409, { error: "You did not skip into this card" });
    const since = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const { data: skippedNow } = await db.from("rounds").select("lv").eq("couple_id", round.couple_id).eq("skipped_by", me).gte("skipped_at", since).order("skipped_at", { ascending: false }).limit(1);
    if (!skippedNow?.length) return json(res, 409, { error: "No recent skip" });
    message = skippedNow[0].lv === "own"
      ? { title: `${mine.name} swapped their question`, body: "There's a new card instead. Open Closer to see it.", tag: `round-${round.id}` }
      : { title: `${mine.name} skipped the card`, body: "Here's a new one. Open Closer to see it.", tag: `round-${round.id}` };
  } else if (event === "restored") {
    // You brought back a card your partner skipped, in the last few minutes.
    if (round.restored_by !== me || Date.now() - new Date(round.restored_at) > 10 * 60 * 1000) return json(res, 409, { error: "You did not just bring this card back" });
    message = { title: `${mine.name} brought the card back`, body: "They'd started answering it. Open Closer to see it.", tag: `round-${round.id}` };
  } else if (event === "commented") {
    const { data: comment } = await db.from("comments").select("created_at").eq("round_id", round.id).eq("author_id", me).maybeSingle();
    if (!comment) return json(res, 409, { error: "You have not commented on this card" });
    // Only for a fresh comment, so the same one can't be used to ping your partner again and again.
    if (Date.now() - new Date(comment.created_at) > 10 * 60 * 1000) return json(res, 409, { error: "Not a new comment" });
    message = { title: `${mine.name} commented on your answer`, body: "Open Closer to read it.", tag: `comment-${round.id}` };
  } else {
    if (round.drawn_by !== me) return json(res, 409, { error: "You did not draw this card" });
    // A question from your pool: whose it is, never what it says.
    const writer = round.written_by || round.drawn_by;
    message = round.lv === "own"
      ? { title: writer === partner.user_id ? "One of your questions came up" : `One of ${mine.name}'s questions came up`, body: round.day ? "It's today's card. Open Closer to answer it." : "Open Closer to answer it.", tag: round.day ? `day-${round.day}` : `round-${round.id}` }
      : round.day
      ? { title: "Today's card is here", body: "Open Closer to see it.", tag: `day-${round.day}` }
      : { title: `${mine.name} drew a new card`, body: "Open Closer to see it.", tag: `round-${round.id}` };
  }
  return json(res, 200, await pushTo(db, [partner.user_id], { ...message, url: "/" }));
}
