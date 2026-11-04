// Card art: "Two-Body Studies" (see ART.md). Every card is a small plate from one long study: two presences,
// each a field of patient repeated marks (brick hairlines, teal points or rings), and the one place they overlap,
// in wheat. Each level has its own way of marking; each card is seeded, so it always draws the same plate.
// Returns a CSS url(...) holding an SVG, sized 400×220, transparent so the card's paper shows through.

const INK = "#231f20", BRICK = "#a53c2a", TEAL = "#3f8187", WHEAT = "#d6c48f";
const W = 400, H = 220, M = 20; // canvas and margin

const hash = s => { let h = 2166136261; for (const ch of s) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0; return h; };
const rng = seed => () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
const n2 = v => Math.round(v * 100) / 100;
const between = (R, a, b) => a + R() * (b - a);

// ---------------------------------------------------------------- shapes (as SVG elements, filled by reference)
const circle = (c, r) => `<circle cx="${n2(c[0])}" cy="${n2(c[1])}" r="${n2(r)}"/>`;
const square = (c, r, rot) => { const s = r * 1.62; return `<rect x="${n2(c[0] - s / 2)}" y="${n2(c[1] - s / 2)}" width="${n2(s)}" height="${n2(s)}" transform="rotate(${n2(rot)} ${n2(c[0])} ${n2(c[1])})"/>`; };
const slab = (c, r, rot) => { const w = r * 2.3, h = r * 1.25; return `<rect x="${n2(c[0] - w / 2)}" y="${n2(c[1] - h / 2)}" width="${n2(w)}" height="${n2(h)}" transform="rotate(${n2(rot)} ${n2(c[0])} ${n2(c[1])})"/>`; };
// A soft, irregular closed form, like a shape drawn by hand: smooth curve through jittered radial points.
function blob(c, r, R) {
  const k = 7, pts = [...Array(k)].map((_, i) => { const a = i / k * Math.PI * 2 + 0.3, rr = r * between(R, 0.8, 1.08); return [c[0] + rr * Math.cos(a), c[1] + rr * Math.sin(a)]; });
  let d = `M${n2((pts[0][0] + pts[1][0]) / 2)} ${n2((pts[0][1] + pts[1][1]) / 2)}`;
  for (let i = 1; i <= k; i++) { const p = pts[i % k], q = pts[(i + 1) % k]; d += `Q${n2(p[0])} ${n2(p[1])} ${n2((p[0] + q[0]) / 2)} ${n2((p[1] + q[1]) / 2)}`; }
  return `<path d="${d}Z"/>`;
}

// ---------------------------------------------------------------- mark systems (SVG patterns)
const hatch = (id, color, gap, angle, w) =>
  `<pattern id="${id}" width="${gap}" height="${gap}" patternUnits="userSpaceOnUse" patternTransform="rotate(${n2(angle)})"><line x1="${gap / 2}" y1="0" x2="${gap / 2}" y2="${gap}" stroke="${color}" stroke-width="${w}"/></pattern>`;
const grid = (id, color, gap, angle, w) =>
  `<pattern id="${id}" width="${gap}" height="${gap}" patternUnits="userSpaceOnUse" patternTransform="rotate(${n2(angle)})"><path d="M${gap / 2} 0V${gap}M0 ${gap / 2}H${gap}" stroke="${color}" stroke-width="${w}"/></pattern>`;
const dots = (id, color, gap, angle, r) =>
  `<pattern id="${id}" width="${gap}" height="${gap}" patternUnits="userSpaceOnUse" patternTransform="rotate(${n2(angle)})"><circle cx="${gap / 2}" cy="${gap / 2}" r="${r}" fill="${color}"/></pattern>`;
// Rings stepping outward from a centre, clipped to the body's own outline.
const rings = (c, r, color, step, w) => [...Array(Math.floor(r / step))].map((_, i) => `<circle cx="${n2(c[0])}" cy="${n2(c[1])}" r="${n2(r - i * step)}" fill="none" stroke="${color}" stroke-width="${w}"/>`).join("");

// ---------------------------------------------------------------- measuring marks: crop corners, a scale, a found centre
function marks(color, opacity, R, centre) {
  const c = 7, x0 = M - 8, y0 = M - 8, x1 = W - M + 8, y1 = H - M + 8;
  const corners = `M${x0} ${y0 + c}V${y0}H${x0 + c}M${x1 - c} ${y0}H${x1}V${y0 + c}M${x1} ${y1 - c}V${y1}H${x1 - c}M${x0 + c} ${y1}H${x0}V${y1 - c}`;
  // The scale runs along whichever bottom edge the forms leave free.
  const left = centre[0] > W / 2, sx = left ? x0 + 14 : x1 - 14 - 40, ticks = [...Array(11)].map((_, i) => `M${sx + i * 4} ${y1}V${y1 - (i % 5 === 0 ? 5 : 2.5)}`).join("");
  return `<path d="${corners}${ticks}" fill="none" stroke="${color}" stroke-width=".6" stroke-opacity="${opacity}"/>`;
}
const crosshair = (c, color, opacity) => `<path d="M${n2(c[0] - 4)} ${n2(c[1])}H${n2(c[0] + 4)}M${n2(c[0])} ${n2(c[1] - 4)}V${n2(c[1] + 4)}" stroke="${color}" stroke-width=".6" stroke-opacity="${opacity}"/>`;

// ---------------------------------------------------------------- composition
// Place two bodies off-centre so they overlap by a chosen share, and keep both inside the margins.
function place(R, rA, rB, share) {
  const tilt = between(R, -0.62, 0.62), d = (rA + rB) * share;
  let mx = W / 2 + between(R, -26, 26), my = H / 2 + between(R, -6, 6);
  let a = [mx - Math.cos(tilt) * d * rB / (rA + rB), my - Math.sin(tilt) * d * rB / (rA + rB)];
  let b = [mx + Math.cos(tilt) * d * rA / (rA + rB), my + Math.sin(tilt) * d * rA / (rA + rB)];
  if (R() < 0.5) [a, b] = [[2 * mx - a[0], a[1]], [2 * mx - b[0], b[1]]]; // brick on the left or the right
  // Nudge the pair back inside the margins if needed.
  const minX = Math.min(a[0] - rA, b[0] - rB), maxX = Math.max(a[0] + rA, b[0] + rB), minY = Math.min(a[1] - rA, b[1] - rB), maxY = Math.max(a[1] + rA, b[1] + rB);
  const dx = minX < M + 4 ? M + 4 - minX : maxX > W - M - 4 ? W - M - 4 - maxX : 0;
  const dy = minY < M + 2 ? M + 2 - minY : maxY > H - M - 2 ? H - M - 2 - maxY : 0;
  return [[a[0] + dx, a[1] + dy], [b[0] + dx, b[1] + dy]];
}

// The plate itself. A and B are the two shapes (SVG elements), fillA/fillB how each is marked.
function plate({ A, B, fillA, fillB, outA, outB, defs, wheat, under = "", over = "", markColor, markOpacity, centre }) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}"><defs>${defs}` +
    `<clipPath id="ca">${A}</clipPath><clipPath id="cb">${B}</clipPath></defs>` +
    under +
    `<g clip-path="url(#ca)">${fillA}</g><g clip-path="url(#cb)">${fillB}</g>` +
    `<g fill="none" stroke-width=".7">${outA}${outB}</g>` +
    // Where the two meet: the one clean, solid tone in the piece, laid over both fields.
    `<g clip-path="url(#ca)"><g clip-path="url(#cb)" fill="${wheat}"><rect width="${W}" height="${H}"/></g></g>` +
    over + marks(markColor, markOpacity, null, centre) + `</svg>`;
}

const outline = (shape, color, opacity) => shape.replace("/>", ` stroke="${color}" stroke-opacity="${opacity}"/>`);

function study(lv, idx) {
  const R = rng(hash("study:" + lv + ":" + idx));
  // One presence is usually a little larger than the other; which one is left to the seed.
  const big = between(R, 52, 68), small = big * between(R, 0.6, 0.95), swap = R() < 0.5;
  const rA = swap ? small : big, rB = swap ? big : small;
  const fieldA = `<rect width="${W}" height="${H}" fill="url(#pa)"/>`, fieldB = `<rect width="${W}" height="${H}" fill="url(#pb)"/>`;
  const angle = between(R, 28, 62) * (R() < 0.5 ? 1 : -1);

  if (lv === "wild") {
    // After dark: the same two bodies as outlines in a field of points, joined by one hairline.
    const [a, b] = place(R, rA * 0.9, rB * 0.9, between(R, 0.55, 0.72));
    const stars = [...Array(70)].map(() => `<circle cx="${n2(between(R, M, W - M))}" cy="${n2(between(R, M, H - M))}" r="${n2(between(R, 0.35, 1.05))}" fill="${WHEAT}" fill-opacity="${n2(between(R, 0.25, 0.7))}"/>`).join("");
    const A = circle(a, rA * 0.9), B = circle(b, rB * 0.9);
    return plate({
      A, B, defs: "", wheat: WHEAT,
      under: stars,
      fillA: rings(a, rA * 0.9, "#c4614c", 6, 0.6), fillB: rings(b, rB * 0.9, "#7fb3b7", 6, 0.6),
      outA: outline(A, "#c4614c", 0.9), outB: outline(B, "#7fb3b7", 0.9),
      over: `<path d="M${n2(a[0])} ${n2(a[1])}L${n2(b[0])} ${n2(b[1])}" stroke="${WHEAT}" stroke-width=".6" stroke-opacity=".8"/>` +
        `<circle cx="${n2(a[0])}" cy="${n2(a[1])}" r="1.8" fill="${WHEAT}"/><circle cx="${n2(b[0])}" cy="${n2(b[1])}" r="1.8" fill="${WHEAT}"/>`,
      markColor: WHEAT, markOpacity: 0.4, centre: a
    });
  }

  if (lv === "deep") {
    // Two sets of rings, like tide lines, crossing slowly.
    const [a, b] = place(R, rA, rB, between(R, 0.62, 0.78));
    const A = circle(a, rA), B = circle(b, rB), step = between(R, 4.2, 5.2);
    return plate({
      A, B, defs: "", wheat: WHEAT,
      fillA: rings(a, rA, BRICK, step, 0.85), fillB: rings(b, rB, TEAL, step, 0.85),
      outA: "", outB: "",
      over: crosshair(a, INK, 0.55),
      markColor: INK, markOpacity: 0.32, centre: a
    });
  }

  if (lv === "world") {
    // Two grids at different angles: each system true to itself, meeting in a moiré.
    const [a, b] = place(R, rA, rB, between(R, 0.5, 0.66));
    const A = slab(a, rA * 0.95, between(R, -8, 8)), B = circle(b, rB);
    return plate({
      A, B, wheat: WHEAT,
      defs: grid("pa", BRICK, 6, 0, 0.7) + grid("pb", TEAL, 5.5, between(R, 22, 38), 0.7),
      fillA: fieldA, fillB: fieldB,
      outA: outline(A, BRICK, 0.9), outB: outline(B, TEAL, 0.9),
      over: crosshair(b, INK, 0.55),
      markColor: INK, markOpacity: 0.32, centre: b
    });
  }

  if (lv === "play") {
    // A tilted square and a circle, one hatched, one stippled: off-balance, on purpose.
    const [a, b] = place(R, rA, rB, between(R, 0.5, 0.7));
    const A = square(a, rA, between(R, 8, 36) * (R() < 0.5 ? 1 : -1)), B = circle(b, rB);
    return plate({
      A, B, wheat: WHEAT,
      defs: hatch("pa", BRICK, 3.4, angle, 1.05) + dots("pb", TEAL, 4.4, between(R, 0, 45), 1.15),
      fillA: fieldA, fillB: fieldB,
      outA: "", outB: outline(B, TEAL, 0.9),
      over: crosshair(a, INK, 0.55),
      markColor: INK, markOpacity: 0.32, centre: a
    });
  }

  if (lv === "own") {
    // A question you wrote: one form drawn as if by hand, met by a measured circle.
    const [a, b] = place(R, rA, rB * 0.9, between(R, 0.52, 0.68));
    const A = blob(a, rA, R), B = circle(b, rB * 0.9);
    return plate({
      A, B, wheat: WHEAT,
      defs: hatch("pa", BRICK, 3.2, angle, 1) + dots("pb", TEAL, 4.2, 45, 1.1),
      fillA: fieldA, fillB: fieldB,
      outA: outline(A, BRICK, 0.95), outB: "",
      over: crosshair(b, INK, 0.55),
      markColor: INK, markOpacity: 0.32, centre: b
    });
  }

  // know: first acquaintance. Two circles, hairlines and points, a modest overlap.
  const [a, b] = place(R, rA * 0.95, rB * 0.95, between(R, 0.58, 0.74));
  const A = circle(a, rA * 0.95), B = circle(b, rB * 0.95);
  return plate({
    A, B, wheat: WHEAT,
    defs: hatch("pa", BRICK, 3.2, angle, 1) + dots("pb", TEAL, 4.0, 0, 1.1),
    fillA: fieldA, fillB: fieldB,
    outA: outline(A, BRICK, 0.9), outB: "",
    over: crosshair(a, INK, 0.55),
    markColor: INK, markOpacity: 0.32, centre: a
  });
}

const cache = new Map();
export function studyArt(lv, idx) {
  const k = lv + ":" + idx;
  if (!cache.has(k)) cache.set(k, "url(\"data:image/svg+xml," + encodeURIComponent(study(lv, idx)) + "\")");
  return cache.get(k);
}
export const studySvg = study; // for the specimen sheet
