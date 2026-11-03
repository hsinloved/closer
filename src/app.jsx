import { useEffect, useMemo, useRef, useState, useCallback } from "preact/hooks";
import { supabase, configured, notify } from "./supabase.js";
import { pushSupported, pushState, enablePush, disablePush, isStandalone, isIOS } from "./push.js";
import { META, WILD, artFor, customArt, BACK_ART } from "../shared/deck.js";
import { pickCard, localDay, cardText, usedKeys } from "../shared/pick.js";

export function App() {
  const [session, setSession] = useState(undefined);
  useEffect(() => {
    if (!configured) return;
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);
  if (!configured) return <Frame><div class="center"><p>Closer isn't connected to its database yet.</p><p class="note">Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY, then rebuild.</p></div></Frame>;
  if (session === undefined) return <Frame />;
  if (!session) return <SignIn />;
  return <Home me={session.user} />;
}

function Frame({ children, right }) {
  return <div class="shell"><header class="top"><h1 class="logo">Closer</h1>{right}</header><main class="page">{children}</main></div>;
}

// ---------------------------------------------------------------- sign in: email, then the six-digit code
// A code rather than a link, because a link opens Safari, not the home-screen app, and would sign in the wrong place.
// Remember that a code is on its way, so leaving to check email (and coming back to a reloaded page, or tapping
// the link again) lands on the code box rather than the email box. Codes last an hour, and so does this.
const PENDING_KEY = "closer:pending-sign-in", PENDING_MS = 60 * 60 * 1000;
function readPending() {
  try {
    const p = JSON.parse(localStorage.getItem(PENDING_KEY) || "null");
    return p && typeof p.email === "string" && Date.now() - p.at < PENDING_MS ? p.email : "";
  } catch { return ""; }
}
function writePending(email) {
  try { email ? localStorage.setItem(PENDING_KEY, JSON.stringify({ email, at: Date.now() })) : localStorage.removeItem(PENDING_KEY); } catch {}
}

function SignIn() {
  const pending = readPending();
  const [email, setEmail] = useState(pending), [code, setCode] = useState(""), [sent, setSent] = useState(Boolean(pending));
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const send = async e => {
    e.preventDefault(); setBusy(true); setError("");
    const { error } = await supabase.auth.signInWithOtp({ email: email.trim(), options: { shouldCreateUser: true } });
    setBusy(false); if (error) setError(error.message); else { writePending(email.trim()); setSent(true); }
  };
  const verify = async e => {
    e.preventDefault(); setBusy(true); setError("");
    const { error } = await supabase.auth.verifyOtp({ email: email.trim(), token: code.trim(), type: "email" });
    setBusy(false); if (error) setError(error.message); else writePending("");
  };
  const resend = async () => {
    setBusy(true); setError(""); setCode("");
    const { error } = await supabase.auth.signInWithOtp({ email: email.trim(), options: { shouldCreateUser: true } });
    setBusy(false); if (error) setError(error.message); else writePending(email.trim());
  };
  return <Frame><div class="center">
    <p class="card-q">One question a day. Answers stay sealed until you've both written.</p>
    {!sent ? <form onSubmit={send} class="page">
      <div class="field"><label for="email">Your email</label><input id="email" class="input" type="email" autocomplete="email" inputmode="email" required value={email} onInput={e => setEmail(e.target.value)} /></div>
      <button class="btn btn-primary btn-block" disabled={busy}>{busy ? "Sending…" : "Email me a code"}</button>
    </form> : <form onSubmit={verify} class="page">
      <div class="field"><label for="code">The code we emailed to {email}</label><input id="code" class="input code" inputmode="numeric" autocomplete="one-time-code" maxLength={6} required value={code} onInput={e => setCode(e.target.value.replace(/\D/g, ""))} /></div>
      <button class="btn btn-primary btn-block" disabled={busy || code.length < 6}>{busy ? "Checking…" : "Sign in"}</button>
      <p class="muted">Check your email, then come back here. No need to open the link again.</p>
      <button type="button" class="btn btn-ghost" disabled={busy} onClick={resend}>Send a new code</button>
      <button type="button" class="btn btn-ghost" onClick={() => { writePending(""); setSent(false); setCode(""); }}>Use a different email</button>
    </form>}
    {error && <p class="error" role="alert">{error}</p>}
  </div></Frame>;
}

// ---------------------------------------------------------------- data for one couple, kept live
function useCouple(me) {
  const [state, setState] = useState({ loading: true });
  const load = useCallback(async () => {
    const { data: member } = await supabase.from("members").select("couple_id, name").eq("user_id", me.id).maybeSingle();
    if (!member) return setState({ loading: false, member: null });
    const [couple, members, rounds, answers, questions, pending] = await Promise.all([
      supabase.from("couples").select("*").eq("id", member.couple_id).single(),
      supabase.from("members").select("user_id, name").eq("couple_id", member.couple_id),
      supabase.from("rounds").select("*").eq("couple_id", member.couple_id).order("created_at", { ascending: false }),
      supabase.from("answers").select("*"),
      // Your own waiting questions; of your partner's, only how many.
      supabase.from("questions").select("*").order("created_at"),
      supabase.rpc("pending_questions")
    ]);
    setState({ loading: false, member, couple: couple.data, members: members.data || [], rounds: rounds.data || [], answers: answers.data || [],
      questions: questions.data || [], pending: pending.data || [] });
  }, [me.id]);

  useEffect(() => { load(); }, [load]);
  const coupleId = state.member?.couple_id;
  useEffect(() => {
    if (!coupleId) return;
    const ch = supabase.channel(`couple-${coupleId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "rounds", filter: `couple_id=eq.${coupleId}` }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "answers" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "members", filter: `couple_id=eq.${coupleId}` }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "questions", filter: `couple_id=eq.${coupleId}` }, load)
      .subscribe();
    const onShow = () => document.visibilityState === "visible" && load();
    document.addEventListener("visibilitychange", onShow);
    return () => { supabase.removeChannel(ch); document.removeEventListener("visibilitychange", onShow); };
  }, [coupleId, load]);
  return [state, load];
}

function Home({ me }) {
  const [data, reload] = useCouple(me);
  const [tab, setTab] = useState("today");
  const [, setSeen] = useState(0); // re-render the tab badge after a reveal
  if (data.loading) return <Frame />;
  if (!data.member) return <Pair onDone={reload} />;
  const partner = data.members.find(m => m.user_id !== me.id);
  const latest = data.rounds[0], unread = Boolean(latest && latest.answered_by.length >= 2 && !seenReveal(latest.id));
  return <>
    <Frame right={partner && <span class="muted">with <span class="hand" style="font-size:22px;color:var(--accent-ink)">{partner.name}</span></span>}>
      {tab === "today" && <Today me={me} data={data} partner={partner} reload={reload} onSeen={() => setSeen(n => n + 1)} />}
      {tab === "ours" && <Ours me={me} data={data} partner={partner} />}
      {tab === "settings" && <Settings me={me} data={data} partner={partner} reload={reload} />}
    </Frame>
    <nav class="tabs" aria-label="Sections">
      {[["today", "Today"], ["ours", "Ours"], ["settings", "Settings"]].map(([k, label]) =>
        <button class="tab" aria-current={tab === k ? "page" : undefined} onClick={() => setTab(k)}>{label}{k === "today" && unread && <span class="badge" aria-label="new" />}</button>)}
    </nav>
  </>;
}

// ---------------------------------------------------------------- pairing
function Pair({ onDone }) {
  const [name, setName] = useState(""), [code, setCode] = useState(""), [mode, setMode] = useState("start");
  const [error, setError] = useState(""), [busy, setBusy] = useState(false);
  const run = async fn => { setBusy(true); setError(""); const { error } = await fn(); setBusy(false); if (error) setError(error.message); else onDone(); };
  const create = e => { e.preventDefault(); run(() => supabase.rpc("create_couple", { p_name: name })); };
  // Joining completes the pair, so let the first of you know (their phone, if they've turned notifications on).
  const join = e => { e.preventDefault(); run(async () => { const r = await supabase.rpc("join_couple", { p_code: code, p_name: name }); if (!r.error) notify("joined"); return r; }); };
  return <Frame><div class="center">
    <div class="field"><label for="name">What should Closer call you?</label><input id="name" class="input" autocomplete="given-name" maxLength={40} value={name} onInput={e => setName(e.target.value)} /></div>
    {mode === "start" && <>
      <button class="btn btn-primary btn-block" disabled={!name.trim() || busy} onClick={create}>I'm first: make our pair</button>
      <button class="btn btn-block" disabled={!name.trim()} onClick={() => setMode("join")}>I have a code from my partner</button>
    </>}
    {mode === "join" && <form onSubmit={join} class="page">
      <div class="field"><label for="pair">Their six-character code</label><input id="pair" class="input code" maxLength={6} autocapitalize="characters" value={code} onInput={e => setCode(e.target.value)} /></div>
      <button class="btn btn-primary btn-block" disabled={!name.trim() || code.trim().length < 6 || busy}>Join</button>
      <button type="button" class="btn btn-ghost" onClick={() => setMode("start")}>Back</button>
    </form>}
    {error && <p class="error" role="alert">{error}</p>}
  </div></Frame>;
}

// ---------------------------------------------------------------- today's card
const seenKey = id => `closer-revealed-${id}`;
function seenReveal(id) { try { return localStorage.getItem(seenKey(id)) === "1"; } catch { return true; } }
function markSeen(id) { try { localStorage.setItem(seenKey(id), "1"); } catch {} }

// The database deals: on a daily card it may pick a waiting question instead of this deck card.
async function draw(data, me, day) {
  const card = pickCard(usedKeys(data.rounds));
  const { data: round, error } = await supabase.rpc("deal_round", { p_day: day || null, p_lv: card.lv, p_idx: card.idx });
  if (error || !round?.id) return null; // someone else dealt today's card a moment ago: the reload picks it up
  notify("drawn", round.id);
  return round;
}

function Today({ me, data, partner, reload, onSeen }) {
  const { couple, rounds, answers } = data;
  const today = localDay(couple.time_zone);
  const current = rounds[0];
  const dueToday = couple.daily_enabled && today.hour >= couple.daily_hour && !rounds.some(r => r.day === today.day);
  const dealing = useRef(false);

  // The daily card: whoever opens the app first after the chosen hour deals it (the hourly job does the same).
  useEffect(() => {
    if (!dueToday || !partner || dealing.current) return;
    dealing.current = true;
    draw(data, me, today.day).then(reload).finally(() => { dealing.current = false; });
  }, [dueToday, partner]);

  if (!partner) return <Waiting code={couple.invite_code} />;
  // Asking now puts a new card on top, so like a bonus draw it waits until you've both answered this one.
  const canAskNow = !current || current.answered_by.length >= 2 || !couple.daily_enabled;
  const ask = <AskBar me={me} data={data} partner={partner} canAskNow={canAskNow} reload={reload} />;
  if (!current) return <div class="center">
    <p class="card-q">Your first card is waiting.</p>
    <button class="btn btn-primary btn-block" onClick={() => draw(data, me).then(reload)}>Draw our first card</button>
    {ask}
  </div>;
  return <>
    <Round key={current.id} round={current} me={me} partner={partner} answers={answers} couple={couple} today={today}
      onDraw={() => draw(data, me).then(reload)} reload={reload} onSeen={onSeen} />
    {ask}
  </>;
}

function Waiting({ code }) {
  return <div class="center">
    <p class="card-q">Nearly there.</p>
    <p>Give your partner this code. They sign in, choose "I have a code", and type it in.</p>
    <p class="input code" style="display:flex;align-items:center;justify-content:center" aria-label={`Invite code ${code.split("").join(" ")}`}>{code}</p>
  </div>;
}

// A question one of you wrote: "From Celeste", or "Your question" on the asker's own phone.
const askedLabel = (r, me, members) => r.asked_by === me.id ? "Your question" : `From ${members.find(m => m.user_id === r.asked_by)?.name || "your partner"}`;
const customArtCache = new Map();
function roundArt(r) {
  if (!r.body) return artFor(r.lv, r.idx);
  const k = r.lv + "|" + r.id + "|" + r.body;
  if (!customArtCache.has(k)) customArtCache.set(k, customArt(r.lv, r.id, r.body));
  return customArtCache.get(k);
}

function Card({ round, me, members, right }) {
  const wild = round.lv === "wild", m = wild ? WILD : META[round.lv], asked = Boolean(round.body);
  return <article class={"card" + (wild ? " wild" : "") + (asked ? " asked" : "")} aria-label="Card">
    <div class="card-art" role="presentation" style={{ backgroundImage: roundArt(round) }} />
    <div class="card-body">
      <div class="card-meta"><span>{asked ? <span class="from">{askedLabel(round, me, members)}</span> : m.label}</span><span>{right ?? (round.day ? formatDay(round.day) : "Drawn")}</span></div>
      <p class="card-q">{cardText(round)}</p>
    </div>
  </article>;
}

function Round({ round, me, partner, answers, couple, today, onDraw, reload, onSeen }) {
  const members = [{ user_id: me.id }, partner];
  const mine = answers.find(a => a.round_id === round.id && a.user_id === me.id);
  const theirs = answers.find(a => a.round_id === round.id && a.user_id === partner.user_id);
  const partnerDone = round.answered_by.includes(partner.user_id);
  const revealed = Boolean(mine && partnerDone);
  const [editing, setEditing] = useState(!mine);
  const [text, setText] = useState(mine?.body || "");
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [shown, setShown] = useState(() => seenReveal(round.id));
  useEffect(() => { if (!mine) setEditing(true); }, [mine]);

  const save = async e => {
    e.preventDefault(); setBusy(true); setError("");
    const body = text.trim();
    const { error } = mine
      ? await supabase.from("answers").update({ body }).eq("round_id", round.id).eq("user_id", me.id)
      : await supabase.from("answers").insert({ round_id: round.id, user_id: me.id, body });
    setBusy(false);
    if (error) return setError(error.message);
    if (!mine) notify("answered", round.id);
    setEditing(false); reload();
  };
  const reveal = () => { markSeen(round.id); setShown(true); onSeen(); };
  const nextLabel = couple.daily_enabled ? "Draw a bonus card" : "Draw the next card";
  const nextDaily = couple.daily_enabled && round.day === today.day;

  return <>
    <Card round={round} me={me} members={members} />
    <p class="status"><span class={"dot" + (mine ? " on" : "")} />You {mine ? "answered" : "haven't answered yet"}
      <span class={"dot" + (partnerDone ? " on" : "")} style="margin-left:var(--s3)" /><span><span class="hand" style="font-size:20px">{partner.name}</span> {partnerDone ? "answered" : "hasn't yet"}</span></p>

    {editing && !revealed && <form onSubmit={save} class="page">
      <label class="sr-only" for="answer">Your answer</label>
      <textarea id="answer" class="textarea" maxLength={4000} placeholder={round.asked_by === me.id ? "You asked this one. What's your answer?" : "Write your answer…"} value={text} onInput={e => setText(e.target.value)} />
      <button class="btn btn-primary btn-block" disabled={busy || !text.trim()}>{busy ? "Sealing…" : mine ? "Save changes" : partnerDone ? "Seal mine and reveal both" : "Seal my answer"}</button>
      {mine && <button type="button" class="btn btn-ghost" onClick={() => { setText(mine.body); setEditing(false); }}>Cancel</button>}
      {error && <p class="error" role="alert">{error}</p>}
    </form>}

    {mine && !editing && !revealed && <>
      <Answer name="You" body={mine.body} />
      <div class="answer sealed"><span class="hand" style="font-size:22px">{partner.name}</span><p>Sealed until {partner.name} answers. We'll let them know it's their turn.</p></div>
      <button class="btn btn-ghost" onClick={() => setEditing(true)}>Edit my answer</button>
    </>}

    {revealed && !shown && <button class="btn btn-primary btn-block" onClick={reveal}>You've both answered. Reveal</button>}
    {revealed && shown && <div class="page">
      <Answer name={partner.name} body={theirs?.body} reveal />
      <Answer name="You" body={mine.body} reveal />
    </div>}

    {(revealed || !couple.daily_enabled) && <button class="btn btn-block" onClick={onDraw}>{nextLabel}</button>}
    {revealed && nextDaily && <p class="note">Tomorrow's card arrives at {String(couple.daily_hour).padStart(2, "0")}:00.</p>}
  </>;
}

function Answer({ name, body, reveal }) {
  return <div class={"answer" + (reveal ? " reveal" : "")}><span class="who">{name}</span><p>{body ?? "…"}</p></div>;
}

// ---------------------------------------------------------------- questions from each other
// Either of you can slip up to five questions into the deck. They wait face down, unreadable to the other, until
// a daily card picks one up (see deal() in the database), or you ask one now.
const ASK_MAX = 5, ASK_LEN = 280, TONES = ["know", "play", "world", "deep"];
const DRAFT_KEY = "closer:draft-question";
function readDraft() {
  try { const d = JSON.parse(localStorage.getItem(DRAFT_KEY) || "null"); return d && typeof d.body === "string" ? d : null; } catch { return null; }
}
function writeDraft(d) {
  try { d && d.body.trim() ? localStorage.setItem(DRAFT_KEY, JSON.stringify(d)) : localStorage.removeItem(DRAFT_KEY); } catch {}
}
function useDebounced(value, ms) {
  const [v, setV] = useState(value);
  useEffect(() => { const t = setTimeout(() => setV(value), ms); return () => clearTimeout(t); }, [value, ms]);
  return v;
}

function AskBar({ me, data, partner, canAskNow, reload }) {
  const [open, setOpen] = useState(false);
  const theirs = data.pending.find(p => p.author_id === partner.user_id)?.waiting || 0;
  const mine = data.questions.length;
  return <section class="ask" aria-label="Questions from each other">
    {theirs > 0 && <div class="facedown">
      <span class="backs" aria-hidden="true">{Array.from({ length: Math.min(theirs, 3) }, (_, i) => <span class="back" style={{ backgroundImage: BACK_ART, "--i": i }} />)}</span>
      <p><span class="hand">{partner.name}</span> slipped {theirs === 1 ? "a card" : `${theirs} cards`} into the deck for you.</p>
    </div>}
    <button class="btn btn-block" onClick={() => setOpen(true)}>Ask {partner.name} something{mine ? ` · ${mine} waiting` : ""}</button>
    {open && <Composer me={me} data={data} partner={partner} canAskNow={canAskNow} reload={reload} onClose={() => setOpen(false)} />}
  </section>;
}

function Composer({ me, data, partner, canAskNow, reload, onClose }) {
  const ref = useRef(null);
  const [draft] = useState(readDraft);
  const [editing, setEditing] = useState(null); // the waiting question being edited, if any
  const [body, setBody] = useState(draft?.body || ""), [lv, setLv] = useState(draft?.lv || "know");
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [msg, setMsg] = useState("");
  const [seed] = useState(() => String(Math.random()));
  const preview = useDebounced(body.trim(), 250);
  const mine = data.questions;
  const text = body.trim(), full = mine.length >= ASK_MAX && !editing;

  useEffect(() => { ref.current?.showModal(); }, []);
  // A half-written question survives closing the sheet; an edit to a waiting one doesn't overwrite it.
  useEffect(() => { if (!editing) writeDraft({ body, lv }); }, [body, lv, editing]);

  const run = async fn => {
    setBusy(true); setError(""); setMsg("");
    const r = await fn(); setBusy(false);
    if (r.error) { setError(r.error.message); return null; }
    return r;
  };
  const clear = () => { setEditing(null); setBody(""); setLv("know"); writeDraft(null); };
  const add = async e => {
    e.preventDefault();
    const r = await run(() => editing
      ? supabase.from("questions").update({ body: text, lv }).eq("id", editing)
      : supabase.from("questions").insert({ couple_id: data.member.couple_id, author_id: me.id, body: text, lv }));
    if (!r) return;
    setMsg(editing ? "Saved." : `In the deck. ${partner.name} won't see it until it's dealt.`);
    clear(); reload();
  };
  const askNow = async () => {
    const r = await run(() => supabase.rpc("ask_now", { p_body: text, p_lv: lv }));
    if (!r?.data?.id) return;
    if (editing) await supabase.from("questions").delete().eq("id", editing);
    notify("asked", r.data.id);
    clear(); reload(); ref.current?.close();
  };
  const edit = q => { setEditing(q.id); setBody(q.body); setLv(q.lv); setMsg(""); setError(""); ref.current?.querySelector("textarea")?.focus(); };
  const cancelEdit = () => { const d = readDraft(); setEditing(null); setBody(d?.body || ""); setLv(d?.lv || "know"); };
  const remove = async q => {
    if (!window.confirm("Take this question out of the deck?")) return;
    if (!await run(() => supabase.from("questions").delete().eq("id", q.id))) return;
    if (editing === q.id) cancelEdit();
    reload();
  };

  return <dialog ref={ref} class="sheet" aria-labelledby="ask-title" onClose={onClose}
    onClick={e => { if (e.target === ref.current) ref.current.close(); }}>
    <div class="sheet-body">
      <header class="sheet-top">
        <h2 id="ask-title">{editing ? "Edit your question" : `Ask ${partner.name}`}</h2>
        <button type="button" class="btn btn-ghost" onClick={() => ref.current.close()}>Close</button>
      </header>
      <Card round={{ id: editing || seed, lv, body: preview || "Your question will appear here.", asked_by: me.id }} me={me} members={data.members} right={META[lv].name} />
      <form onSubmit={add} class="page">
        <div class="field">
          <label for="ask-q">Your question</label>
          <textarea id="ask-q" class="textarea" rows={3} autoFocus maxLength={ASK_LEN} value={body} onInput={e => setBody(e.target.value)}
            placeholder={`Something you've wondered about ${partner.name}…`} />
          <span class="count">{body.length}/{ASK_LEN}</span>
        </div>
        <fieldset class="chips">
          <legend class="sr-only">Tone</legend>
          {TONES.map(t => <label class="chip"><input type="radio" class="sr-only" name="ask-tone" checked={lv === t} onChange={() => setLv(t)} /><span>{META[t].name}</span></label>)}
        </fieldset>
        <p class="note">You'll answer it too. {partner.name} won't see it until it's dealt.</p>
        <button class="btn btn-primary btn-block" disabled={busy || !text || full}>{editing ? "Save changes" : "Add to our deck"}</button>
        <button type="button" class="btn btn-block" disabled={busy || !text || !canAskNow} onClick={askNow}>Ask now</button>
        {!canAskNow && <p class="note">Ask now opens once you've both answered today's card.</p>}
        {full && <p class="note">Five are waiting, the most at once. Ask one now, or take one out to add another.</p>}
        {editing && <button type="button" class="btn btn-ghost" onClick={cancelEdit}>Stop editing</button>}
        {error && <p class="error" role="alert">{error}</p>}
        {msg && <p class="note" role="status">{msg}</p>}
      </form>
      {mine.length > 0 && <section class="waiting">
        <h3 class="kicker">Waiting in the deck · {mine.length} of {ASK_MAX}</h3>
        <ul>{mine.map(q => <li class={"waiting-item" + (editing === q.id ? " editing" : "")}>
          <p>{q.body}</p>
          <div class="waiting-row"><span class="kicker">{META[q.lv].name}</span>
            <button type="button" class="btn btn-ghost" onClick={() => edit(q)}>Edit</button>
            <button type="button" class="btn btn-ghost" onClick={() => remove(q)}>Remove</button></div>
        </li>)}</ul>
      </section>}
    </div>
  </dialog>;
}

// ---------------------------------------------------------------- everything you've answered together
function Ours({ me, data, partner }) {
  const { answers, members } = data;
  const [onlyAsked, setOnlyAsked] = useState(false);
  if (!data.rounds.length) return <p class="note">Your cards will collect here.</p>;
  const rounds = onlyAsked ? data.rounds.filter(r => r.body) : data.rounds;
  return <div class="history">
    {data.rounds.some(r => r.body) && <div class="chips" role="group" aria-label="Show">
      <button class="chip" aria-pressed={!onlyAsked} onClick={() => setOnlyAsked(false)}>All cards</button>
      <button class="chip" aria-pressed={onlyAsked} onClick={() => setOnlyAsked(true)}>From us</button>
    </div>}
    {rounds.map(r => {
    const mine = answers.find(a => a.round_id === r.id && a.user_id === me.id);
    const theirs = partner && answers.find(a => a.round_id === r.id && a.user_id === partner.user_id);
    return <section class="entry">
      <span class="kicker">{r.body ? askedLabel(r, me, members) : r.lv === "wild" ? "Wild" : META[r.lv].name} · {r.day ? formatDay(r.day) : formatDay(r.created_at.slice(0, 10))}</span>
      <p class="entry-q">{cardText(r)}</p>
      {theirs && <Answer name={partner.name} body={theirs.body} />}
      {mine ? <Answer name="You" body={mine.body} /> : <p class="note">You haven't answered this one.</p>}
      {mine && !theirs && partner && <p class="note">{r.answered_by.includes(partner.user_id) ? "Sealed" : `Waiting for ${partner.name}`}.</p>}
    </section>;
  })}</div>;
}

// ---------------------------------------------------------------- settings
function Settings({ me, data, partner, reload }) {
  const { couple, member } = data;
  const [name, setName] = useState(member.name);
  const [push, setPush] = useState({ permission: "default", subscribed: false });
  const [msg, setMsg] = useState(""), [busy, setBusy] = useState(false);
  const phoneTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  useEffect(() => { pushState().then(setPush); }, []);

  const saveCouple = async patch => { await supabase.from("couples").update(patch).eq("id", couple.id); reload(); };
  const saveName = async () => { if (name.trim() && name.trim() !== member.name) { await supabase.from("members").update({ name: name.trim() }).eq("user_id", me.id); reload(); } };
  const turnOn = async () => {
    setBusy(true); setMsg("");
    try { await enablePush(me.id); setPush(await pushState()); const r = await notify("test"); setMsg(r?.sent ? "Done. A test notification is on its way." : "Turned on. If no test arrives, check the server setup."); }
    catch (e) { setMsg(e.message); }
    setBusy(false);
  };
  const turnOff = async () => { await disablePush(); setPush(await pushState()); setMsg("Notifications are off on this phone."); };
  // Ends the pair for both of you, cards and answers included, so whoever pairs next starts with a clean slate.
  const resetPairing = async () => {
    const warning = partner
      ? `Reset your pairing with ${partner.name}?\n\nThis unpairs you both and deletes every card and answer you've shared. It can't be undone.`
      : "Reset your pairing? Your invite code will stop working and you can start again.";
    if (!window.confirm(warning)) return;
    setBusy(true); setMsg("");
    const { error } = await supabase.rpc("reset_couple");
    setBusy(false);
    if (error) setMsg(error.message); else reload();
  };

  return <div class="page">
    <section class="panel"><h2>You</h2>
      <div class="field"><label for="me">Your name</label><input id="me" class="input" maxLength={40} value={name} onInput={e => setName(e.target.value)} onBlur={saveName} /></div>
      {partner ? <p class="note">Paired with <span class="hand" style="font-size:20px;color:var(--accent-ink)">{partner.name}</span>.</p>
        : <p class="note">Waiting for your partner. Their code: <b>{couple.invite_code}</b></p>}
      <button class="btn btn-ghost" disabled={busy} onClick={resetPairing}>Reset pairing</button>
    </section>

    <section class="panel"><h2>Daily card</h2>
      <label class="switch"><span>A new card every day</span><input type="checkbox" checked={couple.daily_enabled} onChange={e => saveCouple({ daily_enabled: e.target.checked })} /></label>
      {couple.daily_enabled && <div class="field"><label for="hour">It arrives at</label>
        <select id="hour" class="input" value={couple.daily_hour} onChange={e => saveCouple({ daily_hour: Number(e.target.value) })}>
          {Array.from({ length: 24 }, (_, h) => <option value={h}>{String(h).padStart(2, "0")}:00</option>)}
        </select></div>}
      <p class="note">{couple.daily_enabled ? "Either of you can still draw a bonus card once you've both answered." : "No daily card: draw a new one whenever you like."}</p>
      {phoneTz && phoneTz !== couple.time_zone && <button class="btn" onClick={() => saveCouple({ time_zone: phoneTz })}>Use this phone's time zone ({phoneTz})</button>}
    </section>

    <section class="panel"><h2>Questions from each other</h2>
      <div class="field"><label for="rhythm">Questions you write take the daily card</label>
        <select id="rhythm" class="input" value={couple.ask_rhythm} onChange={e => saveCouple({ ask_rhythm: e.target.value })}>
          <option value="alternate">Every other day, when one is waiting</option>
          <option value="whenever">Any day one is waiting</option>
          <option value="asked">Never: only when we ask now</option>
        </select></div>
      <p class="note">{couple.daily_enabled ? "On the other days the card comes from the deck." : "With no daily card, they come up when you draw the next card."}</p>
    </section>

    <section class="panel"><h2>Notifications</h2>
      {!pushSupported() || (isIOS() && !isStandalone())
        ? <p class="note">On iPhone, add Closer to your home screen first: tap Share, then "Add to Home Screen", and open it from there.</p>
        : push.subscribed
          ? <><p class="note">On for this phone.</p><div class="row"><button class="btn" onClick={() => notify("test").then(r => setMsg(r?.sent ? "Test sent." : "Couldn't send a test."))}>Send a test</button><button class="btn" onClick={turnOff}>Turn off</button></div></>
          : <button class="btn btn-primary" disabled={busy} onClick={turnOn}>Turn on notifications</button>}
      {msg && <p class="note" role="status">{msg}</p>}
    </section>

    <section class="panel"><h2>Together</h2>
      <p class="note">Sitting side by side? The in-person game is still here.</p>
      <a class="btn" href="/together.html">Open the in-person game</a>
    </section>

    <button class="btn btn-ghost" onClick={() => supabase.auth.signOut()}>Sign out</button>
  </div>;
}

function formatDay(iso) {
  const d = new Date(iso + "T12:00:00");
  return d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
}
