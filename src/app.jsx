import { useEffect, useMemo, useRef, useState, useCallback } from "preact/hooks";
import { supabase, configured, notify } from "./supabase.js";
import { pushSupported, pushState, enablePush, disablePush, isStandalone, isIOS, keepPushFresh } from "./push.js";
import { META, WILD, artFor } from "../shared/deck.js";
import { pickCard, localDay, cardText } from "../shared/pick.js";

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

// ---------------------------------------------------------------- drafts
// Anything half-written (an answer, a comment, a question for the pool) is kept on this phone as you type, so
// leaving the app, switching tabs, tapping a notification or the phone closing Closer in the background
// loses nothing. A draft goes away once it's saved, cancelled or emptied, and after a month at the latest.
const DRAFT_PREFIX = "closer:draft:", DRAFT_MS = 30 * 24 * 60 * 60 * 1000;
function readDraft(key) {
  try {
    const d = JSON.parse(localStorage.getItem(DRAFT_PREFIX + key) || "null");
    return d && typeof d.text === "string" && d.text.trim() && Date.now() - d.at < DRAFT_MS ? d.text : "";
  } catch { return ""; }
}
function writeDraft(key, text) {
  try { text && text.trim() ? localStorage.setItem(DRAFT_PREFIX + key, JSON.stringify({ text, at: Date.now() })) : localStorage.removeItem(DRAFT_PREFIX + key); } catch {}
}
function pruneDrafts() {
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (k && k.startsWith(DRAFT_PREFIX) && !readDraft(k.slice(DRAFT_PREFIX.length))) localStorage.removeItem(k);
    }
  } catch {}
}
// Like useState for a text box, but kept as a draft under `key`. `saved` is what's already saved (an answer
// you're editing): the draft is only kept while it differs. Returns [text, setText, discard, hadDraft].
function useDraft(key, saved = "") {
  const [initial] = useState(() => readDraft(key));
  const [text, setTextState] = useState(initial || saved);
  const setText = t => { setTextState(t); writeDraft(key, t === saved ? "" : t); };
  const discard = () => { writeDraft(key, ""); setTextState(saved); };
  return [text, setText, discard, Boolean(initial) && initial !== saved];
}

// ---------------------------------------------------------------- data for one couple, kept live
function useCouple(me) {
  const [state, setState] = useState({ loading: true });
  const load = useCallback(async () => {
    const { data: member } = await supabase.from("members").select("couple_id, name").eq("user_id", me.id).maybeSingle();
    if (!member) return setState({ loading: false, member: null });
    const [couple, members, rounds, answers, comments, writing, saved] = await Promise.all([
      supabase.from("couples").select("*").eq("id", member.couple_id).single(),
      supabase.from("members").select("user_id, name").eq("couple_id", member.couple_id),
      supabase.from("rounds").select("*").eq("couple_id", member.couple_id).order("created_at", { ascending: false }),
      supabase.from("answers").select("*"),
      supabase.from("comments").select("*"),
      supabase.from("writing").select("*"),
      supabase.from("saved").select("round_id")
    ]);
    // Skipped cards stay out of sight, but are kept so the deck doesn't deal them again soon.
    setState({ loading: false, member, couple: couple.data, members: members.data || [],
      rounds: (rounds.data || []).filter(r => !r.skipped_at), skipped: (rounds.data || []).filter(r => r.skipped_at),
      answers: answers.data || [], comments: comments.data || [], writing: writing.data || [],
      saved: new Set((saved.data || []).map(s => s.round_id)) });
  }, [me.id]);

  useEffect(() => { load(); }, [load]);
  const coupleId = state.member?.couple_id;
  useEffect(() => {
    if (!coupleId) return;
    const ch = supabase.channel(`couple-${coupleId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "rounds", filter: `couple_id=eq.${coupleId}` }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "answers" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "comments" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "writing" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "saved" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "members", filter: `couple_id=eq.${coupleId}` }, load)
      .subscribe();
    const onShow = () => document.visibilityState === "visible" && load();
    document.addEventListener("visibilitychange", onShow);
    return () => { supabase.removeChannel(ch); document.removeEventListener("visibilitychange", onShow); };
  }, [coupleId, load]);
  return [state, load];
}

function Home({ me }) {
  const [data, reload] = useCouple(me);
  useEffect(() => { keepPushFresh(me.id); pruneDrafts(); }, [me.id]);
  const [tab, setTab] = useState("today");
  const [, setSeen] = useState(0); // re-render the tab badge after a reveal
  if (data.loading) return <Frame />;
  if (!data.member) return <Pair onDone={reload} />;
  const partner = data.members.find(m => m.user_id !== me.id);
  const latest = data.rounds[0], unread = Boolean(latest && latest.answered_by.length >= 2 && !seenReveal(latest.id));
  return <>
    <Frame right={partner && <span class="muted">with <span class="hand" style="font-size:22px;color:var(--accent-ink)">{partner.name}</span></span>}>
      {tab === "today" && <Today me={me} data={data} partner={partner} reload={reload} onSeen={() => setSeen(n => n + 1)} />}
      {tab === "ours" && <Ours me={me} data={data} partner={partner} reload={reload} />}
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

const usedCards = data => [...data.rounds, ...(data.skipped || [])].map(r => r.lv + ":" + r.idx);
const SKIPS_PER_DAY = 3;
// Skips the two of you have used today, counted at your midnight like the daily card.
const skipsLeft = data => SKIPS_PER_DAY - (data.skipped || []).filter(r => localDay(data.couple.time_zone, new Date(r.skipped_at)).day === localDay(data.couple.time_zone).day).length;

// While you have an unsealed answer started, the database holds a "writing" mark for you on the card, which keeps
// your partner from skipping it. A mark older than the database's window (six hours) no longer counts.
const WRITING_MS = 6 * 60 * 60 * 1000, WRITING_REFRESH_MS = 60 * 1000;
const isWriting = (data, round, userId) => (data.writing || []).some(w => w.round_id === round.id && w.user_id === userId && Date.now() - new Date(w.at) < WRITING_MS);

// Every card is dealt by the database: it may swap the suggested deck card for a question from your pool.
async function draw(data, me, day) {
  const card = pickCard(usedCards(data));
  const { data: round, error } = await supabase.rpc("deal_card", { p_couple: data.member.couple_id, p_lv: card.lv, p_idx: card.idx, p_day: day || null });
  if (error) return null; // someone else dealt today's card a moment ago: the reload picks it up
  notify("drawn", round.id);
  return round;
}

// Skip a card nobody has answered yet: up to three a day between you. A question your partner wrote can't be
// skipped; whoever wrote one can withdraw it (that uses a skip too).
function SkipCard({ round, data, me, partner, reload, myDraft, onSkipped }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  if (round.lv === "own" && writerOf(round) !== me.id) return null;
  const left = skipsLeft(data), withdraw = round.lv === "own";
  // The database won't skip a card your partner has started answering; say so instead of offering it.
  if (isWriting(data, round, partner.user_id)) return <p class="note skip">{partner.name} has started an answer to this card, so it can't be skipped.</p>;
  if (left <= 0) return <p class="note skip">No skips left today.</p>;
  const skip = async () => {
    if (myDraft && !window.confirm("Skip this card? What you've written for it will be thrown away.")) return;
    setBusy(true); setError("");
    const card = pickCard(usedCards(data));
    const { data: fresh, error } = await supabase.rpc("skip_round", { p_round: round.id, p_lv: card.lv, p_idx: card.idx });
    setBusy(false);
    if (error) { setError(error.message); return reload(); }
    onSkipped();
    notify("skipped", fresh.id);
    reload();
  };
  return <div class="skip">
    <button class="link" disabled={busy} onClick={skip}>{busy ? "Finding another…" : withdraw ? "Withdraw my question" : "Skip this card"}</button>
    <span class="note"> ({left} {left === 1 ? "skip" : "skips"} left today)</span>
    {error && <p class="error" role="alert">{error}</p>}
  </div>;
}

// Your own questions go into a shared pool and turn up at random among the deck's cards (see deal_card).
// You see and can change your own waiting questions; of your partner's you only see how many are waiting.
const POOL_MAX = 5;
function QuestionPool({ data, me, partner }) {
  const [mine, setMine] = useState([]), [counts, setCounts] = useState({});
  const [text, setText, , hadDraft] = useDraft("pool");
  const [open, setOpen] = useState(hadDraft);
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const load = useCallback(async () => {
    const [{ data: qs }, { data: cs }] = await Promise.all([
      supabase.from("pool_questions").select("id, question, created_at").is("dealt_at", null).order("created_at"),
      supabase.rpc("pool_counts")
    ]);
    setMine(qs || []);
    setCounts(Object.fromEntries((cs || []).map(c => [c.author_id, c.waiting])));
  }, []);
  useEffect(() => { load(); }, [load, data.rounds.length]);

  const add = async e => {
    e.preventDefault(); setBusy(true); setError("");
    const { error } = await supabase.from("pool_questions").insert({ couple_id: data.member.couple_id, author_id: me.id, question: text.trim() });
    setBusy(false);
    if (error) return setError(error.message);
    setText(""); setOpen(false); load();
  };
  const remove = async id => {
    if (!window.confirm("Take this question out of the pool?")) return;
    await supabase.from("pool_questions").delete().eq("id", id); load();
  };
  const theirs = partner ? counts[partner.user_id] || 0 : 0, full = mine.length >= POOL_MAX;

  return <section class="pool">
    <div class="pool-head"><h2>Our question pool</h2>
      <span class="note">{partner ? `${partner.name}: ${theirs} waiting` : ""}</span></div>
    <p class="note">Questions you add are shuffled in with the deck and turn up now and then, taking turns between you. {partner ? `${partner.name} won't see yours until one comes up.` : ""}</p>
    {mine.length > 0 && <ol class="pool-list">{mine.map(q => <li><span>{q.question}</span><button class="link" onClick={() => remove(q.id)}>Remove</button></li>)}</ol>}
    {open ? <form onSubmit={add} class="page">
      <div class="field"><label for="own-q">A question for you both</label>
        <textarea id="own-q" class="textarea" maxLength={300} placeholder="What do you want to ask?" value={text} onInput={e => setText(e.target.value)} /></div>
      <button class="btn btn-primary btn-block" disabled={busy || !text.trim()}>{busy ? "Adding…" : "Add to the pool"}</button>
      <button type="button" class="btn btn-ghost" onClick={() => { setText(""); setOpen(false); setError(""); }}>Cancel</button>
    </form>
      : full ? <p class="note">You have {POOL_MAX} questions waiting. Add more once one has come up.</p>
      : <button class="btn btn-ghost btn-block" onClick={() => setOpen(true)}>Add a question ({mine.length} of {POOL_MAX})</button>}
    {error && <p class="error" role="alert">{error}</p>}
  </section>;
}

// "What's new": shown once on each phone after an update, until you tap "Got it". Bump NEWS_ID for the next one.
const NEWS_ID = "2026-11-05", NEWS_KEY = "closer:news-seen";
function WhatsNew() {
  const [seen, setSeen] = useState(() => { try { return localStorage.getItem(NEWS_KEY) === NEWS_ID; } catch { return true; } });
  if (seen) return null;
  const done = () => { try { localStorage.setItem(NEWS_KEY, NEWS_ID); } catch {} setSeen(true); };
  return <section class="panel news" aria-label="What's new">
    <h2>New in Closer</h2>
    <ul>
      <li><b>Nothing you write gets lost.</b> Half-written answers and comments are kept, even if you leave the app, switch tabs or tap a notification.</li>
      <li><b>No skipping mid-answer.</b> Once one of you starts writing, the card can't be skipped. If it was skipped anyway, you can bring it back.</li>
      <li><b>Save cards.</b> Tap ☆ Save on any card, and find it again under Saved in Ours.</li>
    </ul>
    <button class="btn btn-block" onClick={done}>Got it</button>
  </section>;
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
  if (!current) return <div class="center">
    <p class="card-q">Your first card is waiting.</p>
    <button class="btn btn-primary btn-block" onClick={() => draw(data, me).then(reload)}>Draw our first card</button>
    <QuestionPool data={data} me={me} partner={partner} />
  </div>;
  return <>
    <WhatsNew />
    <SkippedDraft data={data} me={me} partner={partner} current={current} reload={reload} />
    <Round key={current.id} round={current} data={data} me={me} partner={partner} answers={answers} comments={data.comments} couple={couple} today={today}
    onDraw={() => draw(data, me).then(reload)} reload={reload} onSeen={onSeen} />
    <QuestionPool data={data} me={me} partner={partner} />
  </>;
}

// Your partner skipped a card you'd started answering (before the database could stop them, or after your
// writing mark had gone stale). The draft is still on this phone: offer to bring the card back, copy it, or let it go.
function SkippedDraft({ data, me, partner, current, reload }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [copied, setCopied] = useState(false);
  const [, rerender] = useState(0);
  const r = (data.skipped || []).filter(s => s.skipped_by !== me.id && readDraft(`answer:${s.id}`))
    .sort((a, b) => b.skipped_at.localeCompare(a.skipped_at))[0];
  if (!r) return null;
  const key = `answer:${r.id}`, draft = readDraft(key);
  const withdrawn = r.lv === "own" && writerOf(r) === r.skipped_by; // they took their own question back
  const canRestore = !withdrawn && current && r.replaced_by === current.id && current.answered_by.length === 0;
  const restore = async () => {
    setBusy(true); setError("");
    const { error } = await supabase.rpc("restore_round", { p_round: r.id });
    setBusy(false);
    if (error) { setError(error.message); return reload(); }
    notify("restored", r.id);
    reload();
  };
  const copy = async () => {
    try { await navigator.clipboard.writeText(draft); setCopied(true); }
    catch { setError("Couldn't copy it. Select the text and copy it yourself."); }
  };
  const discard = () => {
    if (!window.confirm("Throw this draft away?")) return;
    writeDraft(key, ""); rerender(n => n + 1);
  };
  return <section class="panel">
    <p class="note"><b>{partner.name} {withdrawn ? "took back the question" : "skipped the card"} you were answering.</b> Your draft is kept here.</p>
    <p class="entry-q">{cardText(r)}</p>
    <div class="answer"><span class="who">Your draft</span><p>{draft}</p></div>
    <div class="row">
      {canRestore && <button class="btn btn-primary" disabled={busy} onClick={restore}>{busy ? "Bringing it back…" : "Bring that card back"}</button>}
      <button class="btn" onClick={copy}>{copied ? "Copied" : "Copy my draft"}</button>
      <button class="btn btn-ghost" onClick={discard}>Discard</button>
    </div>
    {error && <p class="error" role="alert">{error}</p>}
  </section>;
}

function Waiting({ code }) {
  return <div class="center">
    <p class="card-q">Nearly there.</p>
    <p>Give your partner this code. They sign in, choose "I have a code", and type it in.</p>
    <p class="input code" style="display:flex;align-items:center;justify-content:center" aria-label={`Invite code ${code.split("").join(" ")}`}>{code}</p>
  </div>;
}

// Who wrote a card of your own, as the card's label.
// Who wrote a question card: written_by for pool questions, drawn_by for the ones written before the pool.
const writerOf = round => round.written_by || round.drawn_by;
const ownLabel = (round, me, partner) => writerOf(round) === me?.id ? "Written by you" : `Written by ${partner?.name || "your partner"}`;

// Save a card to find it again under "Saved" in Ours. Only you see what you've saved.
function SaveCard({ round, data, me, reload }) {
  const [saved, setSaved] = useState(null), [error, setError] = useState(""); // null: go by what the database says
  const on = saved ?? data.saved.has(round.id);
  const toggle = async () => {
    setSaved(!on); setError("");
    const { error } = on
      ? await supabase.from("saved").delete().eq("round_id", round.id).eq("user_id", me.id)
      : await supabase.from("saved").insert({ round_id: round.id, user_id: me.id });
    if (error) { setSaved(on); setError(on ? "Couldn't unsave it." : "Couldn't save it."); }
    await reload(); setSaved(null);
  };
  return <span class="save">
    <button class="link save-btn" aria-pressed={on} onClick={toggle}>{on ? "★ Saved" : "☆ Save"}</button>
    {error && <span class="error" role="alert"> {error}</span>}
  </span>;
}

function Card({ round, me, partner }) {
  const wild = round.lv === "wild", m = round.lv === "own" ? { label: ownLabel(round, me, partner) } : wild ? WILD : META[round.lv];
  return <article class={"card" + (wild ? " wild" : "")} aria-label="Card">
    <div class="card-art" role="presentation" style={{ backgroundImage: artFor(round.lv, round.idx) }} />
    <div class="card-body">
      <div class="card-meta"><span>{m.label}</span><span>{round.day ? formatDay(round.day) : round.lv === "own" ? "" : "Drawn"}</span></div>
      <p class="card-q">{cardText(round)}</p>
    </div>
  </article>;
}

function Round({ round, data, me, partner, answers, comments, couple, today, onDraw, reload, onSeen }) {
  const mine = answers.find(a => a.round_id === round.id && a.user_id === me.id);
  const theirs = answers.find(a => a.round_id === round.id && a.user_id === partner.user_id);
  const partnerDone = round.answered_by.includes(partner.user_id);
  const revealed = Boolean(mine && partnerDone);
  const draftKey = `answer:${round.id}`;
  const [text, setText, , hadDraft] = useDraft(draftKey, mine?.body || "");
  const [editing, setEditing] = useState(!mine || hadDraft);
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [shown, setShown] = useState(() => seenReveal(round.id));
  useEffect(() => { if (!mine) setEditing(true); }, [mine]);

  // Tell the database you're writing (so your partner can't skip the card), refreshed while you type, and
  // cleared if you empty the box.
  const marked = useRef({ on: false, at: 0 });
  useEffect(() => {
    if (mine) return;
    const on = Boolean(text.trim()), last = marked.current;
    if (on === last.on && (!on || Date.now() - last.at < WRITING_REFRESH_MS)) return;
    marked.current = { on, at: Date.now() };
    supabase.rpc("mark_writing", { p_round: round.id, p_on: on });
  }, [text, mine]);

  const save = async e => {
    e.preventDefault(); setBusy(true); setError("");
    const body = text.trim();
    const { error } = mine
      ? await supabase.from("answers").update({ body }).eq("round_id", round.id).eq("user_id", me.id)
      : await supabase.from("answers").insert({ round_id: round.id, user_id: me.id, body });
    setBusy(false);
    if (error) return setError(error.message); // the draft stays, so nothing is lost
    writeDraft(draftKey, "");
    if (!mine) { notify("answered", round.id); supabase.rpc("mark_writing", { p_round: round.id, p_on: false }); }
    setEditing(false); reload();
  };
  const reveal = () => { markSeen(round.id); setShown(true); onSeen(); };
  const nextLabel = couple.daily_enabled ? "Draw a bonus card" : "Draw the next card";
  const nextDaily = couple.daily_enabled && round.day === today.day;

  return <>
    <Card round={round} me={me} partner={partner} />
    <SaveCard round={round} data={data} me={me} reload={reload} />
    <p class="status"><span class={"dot" + (mine ? " on" : "")} />You {mine ? "answered" : "haven't answered yet"}
      <span class={"dot" + (partnerDone ? " on" : "")} style="margin-left:var(--s3)" /><span><span class="hand" style="font-size:20px">{partner.name}</span> {partnerDone ? "answered" : "hasn't yet"}</span></p>

    {!mine && !partnerDone && <SkipCard round={round} data={data} me={me} partner={partner} reload={reload}
      myDraft={Boolean(text.trim())} onSkipped={() => writeDraft(draftKey, "")} />}

    {editing && !revealed && <form onSubmit={save} class="page">
      <label class="sr-only" for="answer">Your answer</label>
      <textarea id="answer" class="textarea" maxLength={4000} placeholder="Write your answer…" value={text} onInput={e => setText(e.target.value)} />
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
      <MyComment round={round} me={me} partner={partner} comments={comments} reload={reload} />
      <Answer name="You" body={mine.body} reveal />
      <TheirComment round={round} partner={partner} comments={comments} />
    </div>}

    {(revealed || !couple.daily_enabled) && <button class="btn btn-block" onClick={onDraw}>{nextLabel}</button>}
    {revealed && nextDaily && <p class="note">Tomorrow's card arrives at {String(couple.daily_hour).padStart(2, "0")}:00.</p>}
  </>;
}

function Answer({ name, body, reveal }) {
  return <div class={"answer" + (reveal ? " reveal" : "")}><span class="who">{name}</span><p>{body ?? "…"}</p></div>;
}

// ---------------------------------------------------------------- comments
// Once a card is revealed, each of you can leave one comment on the other's answer. There is no reply box:
// your partner reads your comment under their own answer, and can only leave their own on yours.
function MyComment({ round, me, partner, comments, reload }) {
  const mine = comments.find(c => c.round_id === round.id && c.author_id === me.id);
  const draftKey = `comment:${round.id}`;
  const [text, setText, , hadDraft] = useDraft(draftKey, mine?.body || "");
  const [editing, setEditing] = useState(hadDraft);
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const save = async e => {
    e.preventDefault(); setBusy(true); setError("");
    const body = text.trim();
    const { error } = mine
      ? await supabase.from("comments").update({ body }).eq("round_id", round.id).eq("author_id", me.id)
      : await supabase.from("comments").insert({ round_id: round.id, author_id: me.id, body });
    setBusy(false);
    if (error) return setError(error.message);
    writeDraft(draftKey, "");
    if (!mine) notify("commented", round.id);
    setEditing(false); reload();
  };
  const remove = async () => {
    if (!window.confirm("Delete your comment?")) return;
    const { error } = await supabase.from("comments").delete().eq("round_id", round.id).eq("author_id", me.id);
    if (error) setError(error.message); else { setText(""); setEditing(false); reload(); }
  };
  if (editing) return <form onSubmit={save} class="comment-form">
    <label class="sr-only" for={`c-${round.id}`}>Your comment on {partner.name}'s answer</label>
    <textarea id={`c-${round.id}`} class="textarea comment-input" maxLength={1000} placeholder={`Say something to ${partner.name}…`} value={text} onInput={e => setText(e.target.value)} />
    <div class="row">
      <button class="btn btn-primary" disabled={busy || !text.trim()}>{busy ? "Saving…" : "Save comment"}</button>
      <button type="button" class="btn btn-ghost" onClick={() => { setText(mine?.body || ""); setEditing(false); setError(""); }}>Cancel</button>
    </div>
    {error && <p class="error" role="alert">{error}</p>}
  </form>;
  if (mine) return <div class="comment">
    <span class="who">You, to {partner.name}</span><p>{mine.body}</p>
    <div class="comment-actions"><button class="link" onClick={() => setEditing(true)}>Edit</button><button class="link" onClick={remove}>Delete</button></div>
    {error && <p class="error" role="alert">{error}</p>}
  </div>;
  return <button class="link comment-add" onClick={() => setEditing(true)}>Comment on {partner.name}'s answer</button>;
}

function TheirComment({ round, partner, comments }) {
  const theirs = comments.find(c => c.round_id === round.id && c.author_id === partner.user_id);
  if (!theirs) return null;
  return <div class="comment"><span class="who">{partner.name}, to you</span><p>{theirs.body}</p></div>;
}

// ---------------------------------------------------------------- everything you've answered together
// Filters for Ours. The choice is remembered on this phone only.
const OURS_FILTERS = [["all", "All"], ["saved", "Saved"], ["own", "Our questions"], ["deck", "From the deck"]];
const FILTER_KEY = "closer:ours-filter";
const readFilter = () => { try { const f = localStorage.getItem(FILTER_KEY); return OURS_FILTERS.some(([k]) => k === f) ? f : "all"; } catch { return "all"; } };

function Ours({ me, data, partner, reload }) {
  const { rounds, answers, comments } = data;
  const [filter, setFilterState] = useState(readFilter);
  const setFilter = f => { setFilterState(f); try { localStorage.setItem(FILTER_KEY, f); } catch {} };
  if (!rounds.length) return <p class="note">Your cards will collect here.</p>;
  const shown = rounds.filter(r => filter === "all" || (filter === "saved" ? data.saved.has(r.id) : (filter === "own") === (r.lv === "own")));
  const counts = { own: rounds.filter(r => r.lv === "own").length, saved: rounds.filter(r => data.saved.has(r.id)).length };
  return <div class="history">
    <div class="chips" role="group" aria-label="Show">
      {OURS_FILTERS.map(([k, label]) => <button class="chip" aria-pressed={filter === k} onClick={() => setFilter(k)}>
        {label}{counts[k] > 0 && <span class="chip-count">{counts[k]}</span>}</button>)}
    </div>
    {!shown.length && <p class="note">{filter === "own" ? "No questions of your own yet. Write one from Today." : filter === "saved" ? "Nothing saved yet. Tap ☆ Save on any card to keep it here." : "Nothing here yet."}</p>}
    {shown.map(r => {
    const mine = answers.find(a => a.round_id === r.id && a.user_id === me.id);
    const theirs = partner && answers.find(a => a.round_id === r.id && a.user_id === partner.user_id);
    return <section class="entry">
      <div class="entry-head">
        <span class="kicker">{r.lv === "own" ? <span class="tag">{ownLabel(r, me, partner)}</span> : r.lv === "wild" ? "Wild" : META[r.lv].name} · {r.day ? formatDay(r.day) : formatDay(r.created_at.slice(0, 10))}</span>
        <SaveCard round={r} data={data} me={me} reload={reload} />
      </div>
      <p class="entry-q">{cardText(r)}</p>
      {theirs && <Answer name={partner.name} body={theirs.body} />}
      {theirs && mine && <MyComment round={r} me={me} partner={partner} comments={comments} reload={reload} />}
      {mine ? <Answer name="You" body={mine.body} /> : <p class="note">You haven't answered this one.</p>}
      {theirs && mine && <TheirComment round={r} partner={partner} comments={comments} />}
      {mine && !theirs && partner && <p class="note">{r.answered_by.includes(partner.user_id) ? "Sealed" : `Waiting for ${partner.name}`}.</p>}
    </section>;
  })}
  </div>;
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
