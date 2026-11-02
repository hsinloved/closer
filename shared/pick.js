import { Q } from "./deck.js";

const LEVELS = ["know", "play", "world", "deep"];

// Draw a card the two of you have not had yet. `used` holds "lv:idx" keys from earlier rounds.
// Wild cards turn up now and then; once a level is used up its cards can come round again.
export function pickCard(used, rand = Math.random, opts = {}) {
  const seen = new Set(used);
  const level = opts.level && opts.level !== "mix" ? opts.level : null;
  let lv = level || (rand() < (opts.wildChance ?? 0.1) ? "wild" : LEVELS[Math.floor(rand() * LEVELS.length)]);
  const fresh = Q[lv].map((_, i) => i).filter(i => !seen.has(lv + ":" + i));
  const from = fresh.length ? fresh : Q[lv].map((_, i) => i);
  return { lv, idx: from[Math.floor(rand() * from.length)] };
}

// The calendar day and hour where the two of you live, so "today's card" turns over at your midnight.
export function localDay(timeZone, now = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" })
    .formatToParts(now).map(p => [p.type, p.value]));
  return { day: `${parts.year}-${parts.month}-${parts.day}`, hour: Number(parts.hour) };
}

export const cardText = r => (Q[r.lv] || [])[r.idx] || "";
