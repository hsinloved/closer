import { useEffect, useMemo, useRef, useState, useCallback } from "preact/hooks";
import { supabase, configured, notify } from "./supabase.js";
import { pushSupported, pushState, enablePush, disablePush, isStandalone, isIOS } from "./push.js";
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
function SignIn() {
  const [email, setEmail] = useState(""), [code, setCode] = useState(""), [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const send = async e => {
    e.preventDefault(); setBusy(true); setError("");
    const { error } = await supabase.auth.signInWithOtp({ email: email.trim(), options: { shouldCreateUser: true } });
    setBusy(false); if (error) setError(error.message); else setSent(true);
  };
  const verify = async e => {
    e.preventDefault(); setBusy(true); setError("");
    const { error } = await supabase.auth.verifyOtp({ email: email.trim(), token: code.trim(), type: "email" });
    setBusy(false); if (error) setError(error.message);
  };
  return <Frame><div class="center">
    <p class="card-q">One question a day. Answers stay sealed until you've both written.</p>
    {!sent ? <form onSubmit={send} class="page">
      <div class="field"><label for="email">Your email</label><input id="email" class="input" type="email" autocomplete="email" inputmode="email" required value={email} onInput={e => setEmail(e.target.value)} /></div>
      <button class="btn btn-primary btn-block" disabled={busy}>{busy ? "Sending…" : "Email me a code"}</button>
    </form> : <form onSubmit={verify} class="page">
      <div class="field"><label for="code">The code we emailed to {email}</label><input id="code" class="input code" inputmode="numeric" autocomplete="one-time-code" maxLength={6} required value={code} onInput={e => setCode(e.target.value.replace(/\D/g, ""))} /></div>
      <button class="btn btn-primary btn-block" disabled={busy || code.length < 6}>{busy ? "Checking…" : "Sign in"}</button>
      <button type="button" class="btn btn-ghost" onClick={() => { setSent(false); setCode(""); }}>Use a different email</button>
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
    const [couple, members, rounds, answers] = await Promise.all([
      supabase.from("couples").select("*").eq("id", member.couple_id).single(),
      supabase.from("members").select("user_id, name").eq("couple_id", member.couple_id),
      supabase.from("rounds").select("*").eq("couple_id", member.couple_id).order("created_at", { ascending: false }),
      supabase.from("answers").select("*")
    ]);
    setState({ loading: false, member, couple: couple.data, members: members.data || [], rounds: rounds.data || [], answers: answers.data || [] });
  }, [me.id]);

  useEffect(() => { load(); }, [load]);
  const coupleId = state.member?.couple_id;
  useEffect(() => {
    if (!coupleId) return;
    const ch = supabase.channel(`couple-${coupleId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "rounds", filter: `couple_id=eq.${coupleId}` }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "answers" }, load)
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
  const join = e => { e.preventDefault(); run(() => supabase.rpc("join_couple", { p_code: code, p_name: name })); };
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

async function draw(data, me, day) {
  const card = pickCard(data.rounds.map(r => r.lv + ":" + r.idx));
  const { data: round, error } = await supabase.from("rounds").insert({ couple_id: data.member.couple_id, drawn_by: me.id, day: day || null, ...card }).select().single();
  if (error) return null; // someone else dealt today's card a moment ago: the reload picks it up
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
  if (!current) return <div class="center">
    <p class="card-q">Your first card is waiting.</p>
    <button class="btn btn-primary btn-block" onClick={() => draw(data, me).then(reload)}>Draw our first card</button>
  </div>;
  return <Round key={current.id} round={current} me={me} partner={partner} answers={answers} couple={couple} today={today}
    onDraw={() => draw(data, me).then(reload)} reload={reload} onSeen={onSeen} />;
}

function Waiting({ code }) {
  return <div class="center">
    <p class="card-q">Nearly there.</p>
    <p>Give your partner this code. They sign in, choose "I have a code", and type it in.</p>
    <p class="input code" style="display:flex;align-items:center;justify-content:center" aria-label={`Invite code ${code.split("").join(" ")}`}>{code}</p>
  </div>;
}

function Card({ round }) {
  const wild = round.lv === "wild", m = wild ? WILD : META[round.lv];
  return <article class={"card" + (wild ? " wild" : "")} aria-label="Card">
    <div class="card-art" role="presentation" style={{ backgroundImage: artFor(round.lv, round.idx) }} />
    <div class="card-body">
      <div class="card-meta"><span>{m.label}</span><span>{round.day ? formatDay(round.day) : "Drawn"}</span></div>
      <p class="card-q">{cardText(round)}</p>
    </div>
  </article>;
}

function Round({ round, me, partner, answers, couple, today, onDraw, reload, onSeen }) {
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
    <Card round={round} />
    <p class="status"><span class={"dot" + (mine ? " on" : "")} />You {mine ? "answered" : "haven't answered yet"}
      <span class={"dot" + (partnerDone ? " on" : "")} style="margin-left:var(--s3)" /><span><span class="hand" style="font-size:20px">{partner.name}</span> {partnerDone ? "answered" : "hasn't yet"}</span></p>

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
      <Answer name="You" body={mine.body} reveal />
    </div>}

    {(revealed || !couple.daily_enabled) && <button class="btn btn-block" onClick={onDraw}>{nextLabel}</button>}
    {revealed && nextDaily && <p class="note">Tomorrow's card arrives at {String(couple.daily_hour).padStart(2, "0")}:00.</p>}
  </>;
}

function Answer({ name, body, reveal }) {
  return <div class={"answer" + (reveal ? " reveal" : "")}><span class="who">{name}</span><p>{body ?? "…"}</p></div>;
}

// ---------------------------------------------------------------- everything you've answered together
function Ours({ me, data, partner }) {
  const { rounds, answers } = data;
  if (!rounds.length) return <p class="note">Your cards will collect here.</p>;
  return <div class="history">{rounds.map(r => {
    const mine = answers.find(a => a.round_id === r.id && a.user_id === me.id);
    const theirs = partner && answers.find(a => a.round_id === r.id && a.user_id === partner.user_id);
    return <section class="entry">
      <span class="kicker">{r.lv === "wild" ? "Wild" : META[r.lv].name} · {r.day ? formatDay(r.day) : formatDay(r.created_at.slice(0, 10))}</span>
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

  return <div class="page">
    <section class="panel"><h2>You</h2>
      <div class="field"><label for="me">Your name</label><input id="me" class="input" maxLength={40} value={name} onInput={e => setName(e.target.value)} onBlur={saveName} /></div>
      {partner ? <p class="note">Paired with <span class="hand" style="font-size:20px;color:var(--accent-ink)">{partner.name}</span>.</p>
        : <p class="note">Waiting for your partner. Their code: <b>{couple.invite_code}</b></p>}
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
