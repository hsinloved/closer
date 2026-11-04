import { test } from "node:test";
import assert from "node:assert/strict";
import { pickCard, localDay, cardText } from "../shared/pick.js";
import { Q } from "../shared/deck.js";

test("never repeats a card while the level has fresh ones", () => {
  const used = Q.know.slice(1).map((_, i) => "know:" + (i + 1));
  for (let n = 0; n < 50; n++) assert.deepEqual(pickCard(used, Math.random, { level: "know" }), { lv: "know", idx: 0 });
});

test("starts over once a level is used up", () => {
  const used = Q.know.map((_, i) => "know:" + i);
  const c = pickCard(used, Math.random, { level: "know" });
  assert.equal(c.lv, "know");
  assert.ok(c.idx >= 0 && c.idx < Q.know.length);
});

test("deals wild cards now and then, and every card has text", () => {
  const seen = new Set();
  for (let n = 0; n < 2000; n++) { const c = pickCard([]); seen.add(c.lv); assert.ok(cardText(c).length > 10); }
  assert.deepEqual([...seen].sort(), ["deep", "know", "play", "wild", "world"]);
});

test("today turns over at local midnight, not UTC", () => {
  const lateEvening = new Date("2026-11-02T23:30:00Z"); // 00:30 on the 3rd in Berlin
  assert.deepEqual(localDay("Europe/Berlin", lateEvening), { day: "2026-11-03", hour: 0 });
  assert.deepEqual(localDay("UTC", lateEvening), { day: "2026-11-02", hour: 23 });
});

test("a card you wrote shows your question, and doesn't upset the deck", () => {
  assert.equal(cardText({ lv: "own", idx: 0, question: "What made you smile today?" }), "What made you smile today?");
  const c = pickCard(["own:0", "own:1"], Math.random);
  assert.notEqual(c.lv, "own");
  assert.ok(cardText(c).length > 10);
});

test("never deals a card that needs you in the same room", async () => {
  const { IN_PERSON } = await import("../shared/pick.js");
  for (let n = 0; n < 5000; n++) {
    const c = pickCard([]);
    assert.ok(!(IN_PERSON[c.lv] || []).includes(c.idx), `dealt in-person card ${c.lv}:${c.idx}`);
  }
  // Even once every remote wild card has been used, it starts over among those, not the in-person ones.
  const usedWild = Q.wild.map((_, i) => "wild:" + i);
  for (let n = 0; n < 200; n++) {
    const c = pickCard(usedWild, Math.random, { level: "wild" });
    assert.ok(!IN_PERSON.wild.includes(c.idx));
  }
});
