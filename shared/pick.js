import { Q } from "./deck.js";

const LEVELS = ["know", "play", "world", "deep", "ahead"];

// Cards that need you in the same room (eye contact, singing, swapping phones, "show me"). They stay in the
// in-person game (together.html, which has its own copy of the deck) but are never dealt in the app.
export const IN_PERSON = {
  play: [2, 7, 15, 17, 18, 21, 25, 29, 31, 37],
  // 2 impression of me · 7 teach me in 60s · 15 sing · 17 demonstrate a talent · 18 show me a photo
  // 21 karaoke forfeit · 25 act out · 29 handshake · 31 things in this room · 37 dance
  wild: [0, 1, 4, 5, 7, 11, 13, 15]
  // 0 eye contact · 1 spoken compliment · 4 swap phones · 5 hold hands · 7 draw portraits
  // 11 read a note aloud · 13 photo together · 15 pick a card to come back to
};
const inPerson = (lv, i) => (IN_PERSON[lv] || []).includes(i);

// Choose the next level so the deck feels balanced rather than streaky. `recent` lists the levels of the cards
// you've had, newest first. A level never comes twice in a row, at most twice in any five cards, and the longer
// a level has been away the likelier it is, so every level comes round regularly but not in a fixed order.
function chooseLevel(recent, rand) {
  const deck = recent.filter(l => LEVELS.includes(l));
  const gap = l => { const i = deck.indexOf(l); return i === -1 ? LEVELS.length * 2 : i; };
  let ok = LEVELS.filter(l => gap(l) !== 0 && deck.slice(0, 4).filter(x => x === l).length < 2);
  if (!ok.length) ok = LEVELS;
  const weights = ok.map(l => 1 + gap(l)), total = weights.reduce((a, b) => a + b, 0);
  let r = rand() * total;
  for (let i = 0; i < ok.length; i++) { r -= weights[i]; if (r < 0) return ok[i]; }
  return ok[ok.length - 1];
}

// Draw a card the two of you have not had yet, leaving out the ones only for the in-person game. `used` holds "lv:idx" keys from earlier rounds.
// Wild cards turn up now and then (never twice running); once a level is used up its cards can come round again.
// opts.recent: the levels of your cards so far, newest first, to keep the levels balanced (see chooseLevel).
export function pickCard(used, rand = Math.random, opts = {}) {
  const seen = new Set(used), recent = opts.recent || [];
  const level = opts.level && opts.level !== "mix" ? opts.level : null;
  let lv = level || (recent[0] !== "wild" && rand() < (opts.wildChance ?? 0.1) ? "wild" : chooseLevel(recent, rand));
  const remote = Q[lv].map((_, i) => i).filter(i => !inPerson(lv, i));
  const fresh = remote.filter(i => !seen.has(lv + ":" + i));
  const from = fresh.length ? fresh : remote;
  return { lv, idx: from[Math.floor(rand() * from.length)] };
}

// The calendar day and hour where the two of you live, so "today's card" turns over at your midnight.
export function localDay(timeZone, now = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" })
    .formatToParts(now).map(p => [p.type, p.value]));
  return { day: `${parts.year}-${parts.month}-${parts.day}`, hour: Number(parts.hour) };
}

// A card you wrote yourselves carries its own question; the rest come from the deck.
export const cardText = r => r.lv === "own" ? r.question || "" : (Q[r.lv] || [])[r.idx] || "";
