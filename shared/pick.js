import { Q } from "./deck.js";

const LEVELS = ["know", "play", "world", "deep"];

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

// Draw a card the two of you have not had yet, leaving out the ones only for the in-person game. `used` holds "lv:idx" keys from earlier rounds.
// Wild cards turn up now and then; once a level is used up its cards can come round again.
export function pickCard(used, rand = Math.random, opts = {}) {
  const seen = new Set(used);
  const level = opts.level && opts.level !== "mix" ? opts.level : null;
  let lv = level || (rand() < (opts.wildChance ?? 0.1) ? "wild" : LEVELS[Math.floor(rand() * LEVELS.length)]);
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
