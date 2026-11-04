import { studyArt } from "./art.js";
// The deck and its card art, shared by the in-browser app and the server functions.
// Lifted from the original single-file game so both modes draw the same cards.
const Q = {
 "know": [
  "What's a small thing that instantly makes your day better?",
  "What did you want to be at ten — and how much of that kid is still in you?",
  "What's your usual café order, and what does it say about you?",
  "Which song has been on repeat for you lately?",
  "What's something you're weirdly good at?",
  "Who in your family are you most like?",
  "What's the best trip you've ever taken, and who were you with?",
  "What's a hill you would happily die on?",
  "What did you notice about me first?",
  "What's your comfort movie or show?",
  "What's on your bucket list that you've never said out loud?",
  "How do your friends describe you when you're not in the room?",
  "What food did you hate as a kid but love now?",
  "What does a perfect lazy Sunday look like for you?",
  "What's the last thing that made you laugh until it hurt?",
  "If you could master one skill overnight, what would it be?",
  "What were you like at sixteen?",
  "What's a tiny luxury you refuse to give up?",
  "How do you like to be looked after when you're sick?",
  "What's something you're looking forward to this month?",
  "What's the first concert you ever went to?",
  "Which app do you open most, and are you proud of it?",
  "What's your love language — and is it the same one you give and receive?",
  "What's the best compliment you've ever received?",
  "Which season are you, and why?",
  "What were you obsessed with last year that you've already moved on from?",
  "What's a smell that takes you straight back to childhood?",
  "Who was your first celebrity crush?",
  "What's your most-used emoji or sticker?",
  "Do you plan everything or figure it out as you go?",
  "What's a job you'd be terrible at?",
  "What's the last thing you bought that genuinely made you happy?",
  "What's your favourite thing to cook — or to order?",
  "What's something about you that surprises people?",
  "How do you recharge after a long week?",
  "What's a book, film or song that changed how you saw things?",
  "What did you do on your best birthday?",
  "What's your opinion on pineapple on pizza? Defend it.",
  "What's the most spontaneous thing you've ever done?",
  "Which of your friends would you call at 3am, and why them?",
  "Which three words would you want people to use about you?",
  "What's a hobby you'd love to pick up if time were no issue?"
 ],
 "play": [
  "Would you rather: a week with no phone, or a week with no music?",
  "Describe our first date in exactly five words.",
  "Do your best impression of me. Go.",
  "Guess my favourite colour, food and childhood cartoon. One point each.",
  "We're a duo in a heist movie. Who's the brains, who's the distraction?",
  "Would you rather always be 10 minutes late or 20 minutes early?",
  "Pick who plays you in the movie about us.",
  "Teach me something in 60 seconds.",
  "What's a red flag you secretly find charming?",
  "Rank these: cuddles, food, sleep, adventure.",
  "Plan our next date in three words.",
  "Two truths and a lie. Your turn.",
  "What would your autobiography be called?",
  "We get a pet tomorrow. What is it and what's its name?",
  "What's the strangest thing you've ever eaten?",
  "Sing the chorus of the last song you listened to.",
  "Would you rather read my mind for a day, or have me read yours?",
  "What's your most useless talent? Demonstrate.",
  "Show me the last photo you took and explain it.",
  "What's the most dramatic thing you've done for a crush?",
  "Would you rather live by the sea or in the mountains?",
  "Guess my go-to karaoke song. Wrong answer: you sing it.",
  "What's your zombie apocalypse role in our team?",
  "Describe me as if you were writing my dating profile.",
  "Would you rather give up coffee or dessert forever?",
  "Act out your morning routine in 20 seconds — no words.",
  "What's the worst pickup line you know? Use it on me.",
  "If we opened a café together, what's it called and what's on the menu?",
  "Would you rather know the future or change the past?",
  "Make up a secret handshake with me right now.",
  "What's the pettiest thing that annoys you?",
  "Name three things in this room you'd save in a fire.",
  "Would you rather be famous for your cooking or for your dancing?",
  "What's a conspiracy theory you half believe?",
  "Rate your own texting style out of 10. I'll rate it too.",
  "Which cartoon character are you most like?",
  "Would you rather have a rewind button or a pause button for life?",
  "Show me your best dance move. Yes, now.",
  "Guess how many unread messages I have.",
  "If our relationship were a film genre, which one so far?",
  "Would you rather explore space or the deep ocean?",
  "What's the first thing you'd buy if you won the lottery?"
 ],
 "deep": [
  "What's something you're still learning to forgive yourself for?",
  "When do you feel most like yourself?",
  "What's a belief you've changed your mind about?",
  "What does feeling safe with someone look like to you?",
  "What do you wish people asked you about more?",
  "What did love look like in the house you grew up in?",
  "What part of yourself are you most protective of?",
  "What's a fear you've never fully said out loud?",
  "How do you know when you're truly happy, not just fine?",
  "What's a moment that changed the direction of your life?",
  "When you're overwhelmed, do you need space or someone close?",
  "What do you hope I'll understand about you a year from now?",
  "Which relationship taught you the most, and what was the lesson?",
  "What are you proud of that no one ever congratulated you for?",
  "What does a good apology sound like to you?",
  "What's something you're carrying right now that I don't know about?",
  "In what ways are you still the kid you were?",
  "What's one thing you've been nervous to ask me?",
  "What do you think we could teach each other?",
  "What's the kindest thing a stranger has ever done for you?",
  "What does home mean to you — a place, a person, a feeling?",
  "What's a dream you gave up on, and do you miss it?",
  "How do you usually react when you're hurt, and how would you like to react?",
  "What makes you feel truly seen by someone?",
  "What's a pattern from past relationships you don't want to repeat?",
  "Who do you go to when things fall apart?",
  "What's something your parents got right that you want to keep?",
  "What's something you'd like to do differently from your parents?",
  "When was the last time you cried, and what was it about?",
  "What do you need to hear more often?",
  "What's a version of your life you sometimes imagine?",
  "How do you show care when words are hard?",
  "What's the hardest goodbye you've ever had?",
  "What does being a good partner mean to you?",
  "What's something you're still figuring out about yourself?",
  "What would you do if you weren't afraid?",
  "What's a small moment from these two weeks you keep thinking about?",
  "How do you handle disagreements — and how do you want us to?",
  "What's a part of your story you rarely tell?",
  "What does a meaningful life look like to you?",
  "What are you most grateful for right now?",
  "What do you want to feel when you're with me?"
 ],
 "world": [
  "What's a German word that has no good English translation? Explain it.",
  "Teach me a Mandarin or Taiwanese phrase you grew up hearing at home.",
  "What's a food from home you'd want me to try first?",
  "What's something about the other's culture that surprised you?",
  "What was dinner like in your family growing up — loud, quiet, long, quick?",
  "How do people in your culture show love without saying \"I love you\"?",
  "What's a holiday tradition you'd want to share with me?",
  "What's a stereotype about your country that's true for you — and one that's totally wrong?",
  "What's a moment you felt like a foreigner, and how did it feel?",
  "Directness vs. politeness: how do you say no in your culture?",
  "Which of your family's expectations would you want me to know about early?",
  "What's your favourite night-market or Christmas-market food? Convince me.",
  "What does being on time mean where you grew up?",
  "What's a childhood snack you'd hunt down if you went home tomorrow?",
  "Which language do you dream in? Which one do you swear in?",
  "What's a song from home that makes you emotional?",
  "What did your parents teach you about money?",
  "What's a superstition from home you secretly still follow?",
  "How do families where you're from talk about feelings?",
  "Is there something about your culture you're still unpacking?",
  "What do you love most about where you grew up?",
  "Teach me how to say \"you're cute\" in your language. I'll repeat it.",
  "What's a gesture or habit that means something different in our cultures?",
  "Bread or rice: which one is home for you, and why?",
  "What would your grandparents think of us?",
  "What's a phrase your mum or dad always said?",
  "What would a perfect day in your home city look like? Plan it for me.",
  "How is dating different where you grew up?",
  "What's something you've adapted to living abroad or among other cultures?",
  "Which festival from the other's culture do you most want to experience?",
  "How do people in your culture handle conflict in families?",
  "What's a kind of humour from home that doesn't translate?",
  "What's one thing you'd like us to blend from both cultures if we built a home?",
  "What's your relationship with your home country right now?",
  "What do you miss most when you're far from home?",
  "What's the most \"German\" or most \"Taiwanese\" thing about you?",
  "How would you introduce me to your family?",
  "What did school feel like where you grew up?",
  "What do you wish people understood about your culture?",
  "Which misunderstanding between us so far was actually funny?",
  "Pick a word in your language that describes how you feel tonight."
 ],
 "wild": [
  "Hold eye contact for 30 seconds. No talking.",
  "Give each other a 10-second compliment. No pausing.",
  "Both write one word that describes tonight. Reveal together.",
  "Tell your partner one thing you appreciate about them that isn't about looks.",
  "Swap phones and pick each other's next song.",
  "Hold hands for the next three cards.",
  "Both answer: what's one thing you're looking forward to doing together?",
  "Draw a portrait of each other in 60 seconds. Show and tell.",
  "Each teach the other one word in your language. Use it in the next answer.",
  "Both say a first impression you had of the other.",
  "Plan a mini date for this week together, right now.",
  "Write each other a three-line note. Read it out loud.",
  "Both name a song that reminds you of the other.",
  "Take a photo together to remember tonight.",
  "Say one thing you want to learn about the other's culture.",
  "Both pick a card you want to come back to later."
 ]
};
const META = {
  know: { num: "01", name: "Know", desc: "Easy openers to learn the basics.", label: "Level 01 · Know", bg: "var(--card-face)", fg: "var(--card-ink)" },
  play: { num: "02", name: "Play", desc: "Games, dares and would-you-rathers.", label: "Level 02 · Play", bg: "var(--card-face)", fg: "var(--card-ink)" },
  world: { num: "03", name: "Worlds", desc: "Taiwan meets Germany. Language, family, food, home.", label: "Level 03 · Worlds", bg: "var(--card-face)", fg: "var(--card-ink)" },
  deep: { num: "04", name: "Deeper", desc: "Slow down. Real answers only.", label: "Level 04 · Deeper", bg: "var(--card-face)", fg: "var(--card-ink)" },
  mix:  { num: "05", name: "Mix", desc: "Shuffle all four levels.", label: "Mix" }
};
const JORDER = ["know", "play", "world", "deep"];
const FINAL_TEXT = "Each write the other a short note: what you learned tonight, and one thing you still want to know. Swap. Read them tomorrow.";
const FINAL = { label: "Final card", bg: "var(--color-accent-fill)", fg: "var(--color-text)" };
const WILD = { label: "Wild card", bg: "#2b2627", fg: "var(--color-text)", ground: "#352f30" };
// Card art: a small folded-paper object per card, picked from what the card asks. Every card gets its own seeded layout.
const PAL = { brick: "#a53c2a", teal: "#6fa6ab", cream: "#d6c48f", creamL: "#f3dfa2", ink: "#231f20", face: "#e5ddd4", faceD: "#ddd3c8" };
// Faceted fills from the key visual: each half of a shape is its own gradient, at its own angle, like folded paper.
const GRAD = {
  brick: ["#842c1e", "#a53c2a", 40], brickF: ["#943323", "#b4513e", 220],
  teal: ["#3e7479", "#6fa6ab", 140], tealF: ["#4d8489", "#84b4b7", -40],
  cream: ["#bca466", "#d6c48f", 60], creamF: ["#cbb579", "#e8d7a3", 240]
};
const gradDefs = () => Object.entries(GRAD).map(([k, [a, b, deg]]) => `<linearGradient id="${k}" gradientTransform="rotate(${deg} .5 .5)"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient>`).join("");
const hash = s => { let h = 2166136261; for (const ch of s) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0; return h; };
const rng = seed => () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
const f1 = n => Math.round(n * 10) / 10;

const circle = (cx, cy, r) => `M${f1(cx - r)} ${f1(cy)}a${f1(r)} ${f1(r)} 0 1 0 ${f1(2 * r)} 0a${f1(r)} ${f1(r)} 0 1 0 ${f1(-2 * r)} 0Z`;
const poly = (cx, cy, r, n, rot) => "M" + [...Array(n)].map((_, i) => { const a = (rot + i * 360 / n) * Math.PI / 180; return f1(cx + r * Math.cos(a)) + " " + f1(cy + r * Math.sin(a)); }).join("L") + "Z";
const arch = (cx, cy, r, rot) => { const a = rot * Math.PI / 180, c = Math.cos(a), s = Math.sin(a), p = (x, y) => f1(cx + x * c - y * s) + " " + f1(cy + x * s + y * c); return `M${p(-r, r * 0.35)}L${p(-r, 0)}A${f1(r)} ${f1(r)} 0 0 1 ${p(r, 0)}L${p(r, r * 0.35)}Z`; };

// Little folded-paper objects. Each motif is a few pieces drawn in a unit box (x about -1.8..1.8, y -1..1, y down),
// then placed on the 400x220 art panel. Where a brick and a teal piece cross, the overlap turns cream.
GRAD.olive = ["#4f5f35", "#768650", 120]; GRAD.oliveF = ["#5d6d3c", "#8b9a60", -60];
GRAD.ink = ["#1e1a1b", "#3a3333", 90]; GRAD.inkF = ["#2a2526", "#4a4243", 270];

// Move, scale, rotate and optionally mirror an absolute M/L/Q/C/A/Z path.
function tf(d, x, y, s, rot, mx, dp) {
  const a = (rot || 0) * Math.PI / 180, c = Math.cos(a), sn = Math.sin(a), m = mx ? -1 : 1, q = 10 ** (dp ?? 3);
  const r = v => Math.round(v * q) / q;
  const P = (px, py) => { px *= m; return r(x + s * (px * c - py * sn)) + " " + r(y + s * (px * sn + py * c)); };
  const tok = d.match(/[MLQCAZ]|-?\d*\.?\d+(?:e-?\d+)?/g); let out = "", i = 0;
  const n = () => parseFloat(tok[i++]);
  while (i < tok.length) {
    const k = tok[i++];
    if (k === "Z") { out += "Z"; continue; }
    if (k === "A") { const rx = n(), ry = n(), xr = n(), la = n(), sw = n(), ex = n(), ey = n(); out += `A${r(rx * s)} ${r(ry * s)} ${r(xr + (rot || 0))} ${la} ${mx ? 1 - sw : sw} ${P(ex, ey)}`; continue; }
    const cnt = k === "C" ? 3 : k === "Q" ? 2 : 1, pts = [];
    for (let j = 0; j < cnt; j++) pts.push(P(n(), n()));
    out += k + pts.join(" ");
  }
  return out;
}
// Rough centre of a path (mean of its points), for where its fold line goes.
const midOf = d => { const tok = d.match(/[MLQCAZ]|-?\d*\.?\d+(?:e-?\d+)?/g); let i = 0, sx = 0, sy = 0, k = 0;
  const add = (x, y) => { sx += x; sy += y; k++; };
  while (i < tok.length) { const c = tok[i++]; if (c === "Z") continue;
    if (c === "A") { i += 5; add(+tok[i], +tok[i + 1]); i += 2; continue; }
    const cnt = c === "C" ? 3 : c === "Q" ? 2 : 1; for (let j = 0; j < cnt; j++) { add(+tok[i], +tok[i + 1]); i += 2; } }
  return [sx / (k || 1), sy / (k || 1)]; };

const U = {
  heart: "M0 0.95C-0.2 0.78-1.05 0.25-1.05-0.3C-1.05-0.75-0.55-1-0.25-0.85C-0.12-0.78-0.04-0.68 0-0.58C0.04-0.68 0.12-0.78 0.25-0.85C0.55-1 1.05-0.75 1.05-0.3C1.05 0.25 0.2 0.78 0 0.95Z",
  cloud: "M-1 0.45A0.4 0.4 0 0 1-0.7-0.2A0.5 0.5 0 0 1 0.1-0.6A0.48 0.48 0 0 1 0.85-0.1A0.32 0.32 0 0 1 1 0.45Z",
  moon: "M0.4-0.917A1 1 0 1 0 0.4 0.917A1 1 0 0 1 0.4-0.917Z",
  drop: "M0-1.05C0.35-0.5 0.75-0.1 0.75 0.3A0.75 0.75 0 0 1-0.75 0.3C-0.75-0.1-0.35-0.5 0-1.05Z",
  bubble: "M-0.95-0.35Q-0.95-0.8-0.5-0.8L0.5-0.8Q0.95-0.8 0.95-0.35L0.95 0.15Q0.95 0.6 0.5 0.6L-0.1 0.6L-0.55 0.98L-0.45 0.6Q-0.95 0.6-0.95 0.15Z",
  leaf: "M-1 0Q0-0.62 1 0Q0 0.62-1 0Z",
  eye: "M-1.1 0Q0-1.05 1.1 0Q0 1.05-1.1 0Z",
  sparkle: "M0-1.1Q0.12-0.12 1.1 0Q0.12 0.12 0 1.1Q-0.12 0.12-1.1 0Q-0.12-0.12 0-1.1Z",
  pebble: "M-0.9 0.1C-1-0.55-0.35-0.95 0.25-0.85C0.85-0.75 1.05-0.2 0.9 0.3C0.75 0.85 0.1 0.95-0.35 0.8C-0.7 0.68-0.85 0.45-0.9 0.1Z",
  tulip: "M-0.42-0.05L-0.5-0.78L-0.2-0.52L0-0.88L0.2-0.52L0.5-0.78L0.42-0.05Q0-0.33-0.42-0.05ZM-0.42-0.05Q0 0.28 0.42-0.05Z",
  bowl: "M-1-0.05L1-0.05A1 1 0 0 1-1-0.05Z"
};
const r3 = v => Math.round(v * 1000) / 1000;
const ring = (n, ri, f) => { const a0 = -Math.PI / 2, st = 2 * Math.PI / n, pt = a => r3(ri * Math.cos(a)) + " " + r3(ri * Math.sin(a)); return "M" + pt(a0 - st / 2) + [...Array(n)].map((_, i) => f(i, a0 + i * st, st, pt)).join("") + "Z"; };
U.star = ring(5, 0.5, (i, a, st, pt) => `Q${r3(1.45 * Math.cos(a))} ${r3(1.45 * Math.sin(a))} ${pt(a + st / 2)}`);
U.sun = ring(12, 0.84, (i, a, st, pt) => `A0.23 0.23 0 1 1 ${pt(a + st / 2)}`);
const HALF_UP = "M-1 0A1 1 0 0 1 1 0Z";
const C = (x, y, r) => `M${r3(x - r)} ${r3(y)}A${r3(r)} ${r3(r)} 0 1 0 ${r3(x + r)} ${r3(y)}A${r3(r)} ${r3(r)} 0 1 0 ${r3(x - r)} ${r3(y)}Z`;
const Pg = pts => "M" + pts.map(p => p.map(r3).join(" ")).join("L") + "Z";
const Rr = (x0, y0, x1, y1, k) => `M${x0 + k} ${y0}L${x1 - k} ${y0}Q${x1} ${y0} ${x1} ${y0 + k}L${x1} ${y1 - k}Q${x1} ${y1} ${x1 - k} ${y1}L${x0 + k} ${y1}Q${x0} ${y1} ${x0} ${y1 - k}L${x0} ${y0 + k}Q${x0} ${y0} ${x0 + k} ${y0}Z`;
// A thin bar from one point to another, for stems, chopsticks and lashes.
const Bar = (x0, y0, x1, y1, w) => { const dx = x1 - x0, dy = y1 - y0, l = Math.hypot(dx, dy), nx = -dy / l * w / 2, ny = dx / l * w / 2; return Pg([[x0 + nx, y0 + ny], [x1 + nx, y1 + ny], [x1 - nx, y1 - ny], [x0 - nx, y0 - ny]]); };
const at = (k, x, y, s, rot, mx) => tf(U[k], x, y, s, rot, mx);
const pc = (k, d) => ({ k, d });

const MOTIFS = {
  // Abstract on purpose: two or three plain pieces that hint at the subject, crossing in cream like the two discs.
  discs: (R, lv) => { const g = { know: 1.62, play: 1.25, world: 0.95, deep: 0.72 }[lv] || 1.2, r = 0.66, t = (-28 + R() * 56) * Math.PI / 180, dx = Math.cos(t) * g * r / 2, dy = Math.sin(t) * g * r / 2;
    return { p: [pc("brick", C(-dx, -dy, r)), pc("teal", C(dx, dy, r))], x: [[0, 1]] }; },
  hearts: (R, lv) => lv === "final"
    ? { p: [pc("brick", at("heart", -0.3, 0, 0.8, -8)), pc("teal", at("heart", 0.3, 0.02, 0.8, 8))], x: [[0, 1]] }
    : { p: [pc("brick", at("heart", -0.25, 0, 0.82, -6)), pc("teal", C(0.62, 0.18, 0.5))], x: [[0, 1]] },
  tulips: () => ({ p: [pc("brick", tf(HALF_UP, -0.2, -0.3, 0.75, 180)), pc("teal", at("eye", 0.3, 0.35, 0.72, -35))], x: [[0, 1]] }),
  notes: () => ({ p: [pc("ink", Bar(-0.7, -0.22, 0.82, -0.46, 0.2)), pc("brick", C(-0.5, 0.32, 0.5)), pc("teal", C(0.55, 0.12, 0.5))], x: [[1, 2]] }),
  house: () => ({ p: [pc("brick", Pg([[-0.7, -0.15], [0.7, -0.15], [0.7, 0.95], [-0.7, 0.95]])), pc("teal", Pg([[-0.95, 0.15], [0, -0.95], [0.95, 0.15]]))], x: [[0, 1]] }),
  bowl: () => ({ p: [pc("teal", tf(U.bowl, 0, 0.15, 0.9, 0)), pc("brick", C(0.05, -0.18, 0.48))], x: [[0, 1]] }),
  bubbles: () => ({ p: [pc("brick", C(-0.42, -0.08, 0.62)), pc("teal", Rr(0.0, -0.35, 1.15, 0.6, 0.28))], x: [[0, 1]] }),
  moon: () => ({ p: [pc("teal", at("moon", -0.2, 0, 0.85, -18)), pc("brick", C(0.75, -0.35, 0.3))] }),
  star: () => ({ p: [pc("teal", C(0.45, 0.2, 0.55)), pc("brick", at("sparkle", -0.25, -0.05, 0.85, 8))], x: [[0, 1]] }),
  drops: () => ({ p: [pc("teal", at("drop", -0.3, 0.05, 0.8, -12)), pc("brick", at("drop", 0.35, 0, 0.62, 14))], x: [[0, 1]] }),
  sun: () => ({ p: [pc("brick", tf(HALF_UP, 0, 0.35, 0.72, 0)), pc("teal", "M-1.6 0.95Q0 -0.65 1.6 0.95Z")], x: [[0, 1]] }),
  sprig: () => ({ p: [pc("teal", at("eye", -0.3, 0.05, 0.85, -32)), pc("brick", at("eye", 0.42, -0.05, 0.66, 38))], x: [[0, 1]] }),
  eye: () => ({ p: [pc("teal", at("eye", 0, 0, 1.15)), pc("brick", C(0.12, 0, 0.42))], x: [[0, 1]] }),
  camera: () => ({ p: [pc("brick", Rr(-1, -0.5, 0.7, 0.7, 0.16)), pc("teal", C(0.35, 0.05, 0.5))], x: [[0, 1]] }),
  gift: () => ({ p: [pc("brick", Pg([[-0.7, -0.35], [0.7, -0.35], [0.7, 0.9], [-0.7, 0.9]])), pc("teal", C(0, -0.45, 0.42))], x: [[0, 1]] }),
  mountains: () => ({ p: [pc("teal", Pg([[-1.5, 0.9], [-0.35, -0.8], [0.8, 0.9]])), pc("brick", Pg([[-0.3, 0.9], [0.7, -0.45], [1.7, 0.9]]))], x: [[0, 1]] }),
  tree: () => ({ p: [pc("brick", Pg([[-0.14, -0.1], [0.14, -0.1], [0.14, 0.95], [-0.14, 0.95]])), pc("teal", C(0, -0.3, 0.62))], x: [[0, 1]] }),
  confetti: R => { const p = [], cols = ["brick", "teal", "cream", "brick", "teal"];
    for (let gx = 0; gx < 4; gx++) for (let gy = 0; gy < 2; gy++) { if (R() < 0.25) continue; const x = -1.25 + gx * 0.83 + (R() - 0.5) * 0.3, y = -0.42 + gy * 0.84 + (R() - 0.5) * 0.25, s = 0.26 + R() * 0.12, rot = R() * 360, k = Math.floor(R() * 3);
      p.push(pc(cols[Math.floor(R() * cols.length)], k === 0 ? C(x, y, s) : k === 1 ? tf(Pg([[0, -1], [0.9, 0.6], [-0.9, 0.6]]), x, y, s * 1.2, rot) : tf(HALF_UP, x, y, s * 1.1, rot))); }
    return { p, noFold: true }; }
};

// The card's object comes from what it asks about; otherwise from its level's set.
const THEMES = [
  [/\b(song|music|sing|concert|karaoke|danc|chorus)/, "notes"],
  [/\b(photo|picture|film|movie|show)\b/, "camera"],
  [/\b(food|eat|cook|caf|coffee|snack|dinner|rice|bread|pizza|menu|dessert|market|order)/, "bowl"],
  [/\b(home|house|grew up|where you're from)/, "house"],
  [/\b(family|parent|grandparent|mum|dad|kid|childhood)/, "tree"],
  [/\b(laugh|happy|smile|sun|sunday|birthday|season|weekend)/, "sun"],
  [/\b(love|heart|crush|compliment|cute|kiss|cuddle|partner|appreciate|kind)/, "hearts"],
  [/\b(say|word|language|phrase|talk|teach|swear|text|translat|out loud|ask|humour)/, "bubbles"],
  [/\b(dream|night|sleep|tonight|imagine)/, "moon"],
  [/\b(star|space|famous|wish|bucket list|lottery|future)/, "star"],
  [/\b(cr(y|ied)|tears|hurt|fear|afraid|sea|ocean|sick|overwhelm)\b/, "drops"],
  [/\b(grow|learn|chang|nature|forgive|figur)/, "sprig"],
  [/\b(see|seen|notice|look|eye|watch|impression)/, "eye"],
  [/\b(grateful|proud|gift|thank|bought|buy|luxury)/, "gift"],
  [/\b(travel|trip|abroad|country|city|place|foreign|mountain|explore|festival)/, "mountains"],
  [/\b(flower|bloom|spring|beautiful)/, "tulips"]
];
const POOL = { know: ["discs", "tulips", "sprig", "star", "confetti", "gift"], play: ["confetti", "star", "hearts", "discs", "tulips"], world: ["mountains", "bowl", "bubbles", "house", "tulips", "tree"], deep: ["discs", "moon", "drops", "eye", "sprig"] };
const MIXES = { house: ["house", "sun", "discs", "house", "mountains", "bowl"], tree: ["tree", "sprig", "discs", "tree", "hearts"] };
function motifFor(lv, idx, R) {
  if (lv === "final") return "hearts";
  const text = ((Q[lv] || [])[idx] || "").toLowerCase(), hit = THEMES.find(([re]) => re.test(text)), pool = POOL[lv] || POOL.know;
  if (!hit) return pool[hash(lv + idx) % pool.length];
  // Home and family come up so often that the same picture would repeat; let some of those cards borrow a related shape.
  const mix = MIXES[hit[1]];
  return mix ? mix[hash(lv + ":" + idx) % mix.length] : hit[1];
}

function cardArt(lv, idx, opts) {
  const o = opts || {}, W = 400, H = 220, R = rng(hash(lv + ":" + idx));
  const ground = o.ground || PAL.faceD;
  let body = "";
  const defs = [];
  if (lv === "wild") {
    // Wild: the card back's panels, re-cut per card and set in a disc, with a sparkle on top.
    const dcx = 200 + (R() - 0.5) * 40, x0 = dcx - 60 + R() * 30, x1 = x0 + 45 + R() * 30;
    defs.push(`<clipPath id="k"><circle cx="${f1(dcx)}" cy="110" r="96"/></clipPath>`);
    const tilt = -18 + R() * 36;
    body = `<g clip-path="url(#k)"><g transform="rotate(${f1(tilt)} 200 110)">` +
      `<rect x="-200" y="-200" width="${f1(x0 + 200)}" height="700" fill="url(#brick)"/>` +
      `<rect x="${f1(x0)}" y="-200" width="${f1(x1 - x0)}" height="700" fill="url(#cream)"/>` +
      `<rect x="${f1(x1)}" y="-200" width="600" height="700" fill="url(#teal)"/>` +
      `<rect x="-200" y="${f1(50 + R() * 40)}" width="800" height="${f1(10 + R() * 8)}" fill="${PAL.ink}"/></g><rect width="${W}" height="${H}" filter="url(#g)" opacity="0.6"/></g>` +
      `<path d="${tf(U[R() < 0.5 ? "sparkle" : "star"], dcx + (R() < 0.5 ? -1 : 1) * (95 + R() * 20), 40 + R() * 30, 22 + R() * 8, R() * 20 - 10, false, 1)}" fill="url(#creamF)"/>` +
      "";
  } else {
    const name = motifFor(lv, idx, R), m = MOTIFS[name](R, lv);
    const s = 92 * (0.94 + R() * 0.1), cx = W / 2 + (R() - 0.5) * 30, cy = H / 2 + (R() - 0.5) * 10, rot = (R() - 0.5) * 12, mx = name !== "notes" && name !== "bubbles" && R() < 0.5;
    const swap = R() < 0.3 && name !== "final", col = k => swap ? ({ brick: "teal", teal: "brick" }[k] || k) : k;
    const ps = m.p.map(q => ({ k: col(q.k), d: tf(q.d, cx, cy, s, rot, mx, 1) }));
    defs.push(`<clipPath id="all">${ps.map(q => `<path d="${q.d}"/>`).join("")}</clipPath>`);
    ps.forEach((q, i) => {
      const [px, py] = midOf(q.d), fold = R() * 180;
      body += `<path d="${q.d}" fill="url(#${q.k})"/>`;
      if (m.noFold) return;
      defs.push(`<clipPath id="h${i}"><rect x="${f1(px)}" y="${f1(py - 400)}" width="800" height="800" transform="rotate(${f1(fold)} ${f1(px)} ${f1(py)})"/></clipPath>`);
      body += `<g clip-path="url(#h${i})"><path d="${q.d}" fill="url(#${q.k}F)"/></g>`;
    });
    (m.x || []).forEach(([a, b], j) => {
      defs.push(`<clipPath id="x${j}"><path d="${ps[a].d}"/></clipPath>`);
      body += `<g clip-path="url(#x${j})"><path d="${ps[b].d}" fill="url(#cream)"/></g>`;
    });
    // grain lives inside the paper shapes, not on the card ground
    body += `<g clip-path="url(#all)"><rect width="${W}" height="${H}" filter="url(#g)" opacity="0.7"/></g>`;
  }
  // Grain: dark speckle from fractal noise, plus a soft airbrushed light falloff.
  defs.push(`<filter id="g" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="${idx % 97}" stitchTiles="stitch"/><feColorMatrix values="0 0 0 0 0.14 0 0 0 0 0.12 0 0 0 0 0.12 0.9 0 0 0 -0.2"/></filter>`,
    `<filter id="gw" x="-1200" y="-1200" width="2800" height="2620" filterUnits="userSpaceOnUse"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" stitchTiles="stitch"/><feColorMatrix values="0 0 0 0 0.14 0 0 0 0 0.12 0 0 0 0 0.12 0.9 0 0 0 -0.2"/></filter>`,
    `<radialGradient id="l" cx="${f1(0.25 + R() * 0.5)}" cy="0.2" r="0.9"><stop offset="0" stop-color="#fff" stop-opacity="0.16"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>`);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" overflow="visible"><defs>${gradDefs()}${defs.join("")}</defs>` +
    (ground === "none" ? body : `<rect x="-1200" y="-1200" width="2800" height="2620" fill="${ground}"/>${body}<rect x="-1200" y="-1200" width="2800" height="2620" fill="url(#l)"/>`) + `</svg>`;
  return "url(\"data:image/svg+xml," + encodeURIComponent(svg) + "\")";
}

// Card back: cream top, an ink band, then brick, a cream wedge and teal, as in the key visual.
function backArt() {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 250 350" preserveAspectRatio="xMidYMid slice"><defs>` +
    `<filter id="g" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" stitchTiles="stitch"/><feColorMatrix values="0 0 0 0 0.14 0 0 0 0 0.12 0 0 0 0 0.12 0.9 0 0 0 -0.2"/></filter>` +
    `<linearGradient id="l" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff" stop-opacity="0.12"/><stop offset="1" stop-color="#000" stop-opacity="0.1"/></linearGradient>${gradDefs()}<linearGradient id="ink" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#1e1a1b"/><stop offset="1" stop-color="#3a3333"/></linearGradient></defs>` +
    `<rect width="250" height="350" fill="${PAL.face}"/>` +
    `<path d="M0 128L250 62V350H0Z" fill="url(#ink)"/>` +
    `<path d="M0 146L250 80V350H0Z" fill="url(#teal)"/>` +
    `<path d="M0 146L118 116L186 350H0Z" fill="url(#cream)"/>` +
    `<path d="M0 146L76 127L134 350H0Z" fill="url(#brick)"/>` +
    `<rect width="250" height="350" fill="url(#l)"/><rect width="250" height="350" filter="url(#g)" opacity="0.55"/></svg>`;
  return "url(\"data:image/svg+xml," + encodeURIComponent(svg) + "\")";
}

// The suit pip from the key visual: two small discs, cream where they cross.
function pipArt() {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 34 20"><defs><clipPath id="a"><circle cx="11" cy="10" r="8"/></clipPath></defs><circle cx="11" cy="10" r="8" fill="${PAL.brick}"/><circle cx="23" cy="10" r="8" fill="${PAL.teal}"/><g clip-path="url(#a)"><circle cx="23" cy="10" r="8" fill="${PAL.cream}"/></g></svg>`;
  return "url(\"data:image/svg+xml," + encodeURIComponent(svg) + "\")";
}
const artCache = new Map();
// The app's cards use the "Two-Body Studies" plates (art.js, ART.md). cardArt above is the earlier folded-paper set.
const artFor = (lv, idx) => studyArt(lv, idx);
const BACK_ART = backArt(), PIP_ART = pipArt();

export { Q, META, JORDER, FINAL_TEXT, FINAL, WILD, PAL, cardArt, artFor, motifFor, BACK_ART, PIP_ART, hash };
