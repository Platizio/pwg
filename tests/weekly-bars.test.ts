import test from "node:test";
import assert from "node:assert/strict";

import { weeklyBars } from "../lib/market/weekly-bars.ts";

/* Stamped at noon UTC, which is the same Eastern date all year. The feed's
   real stamp is Eastern midnight — 04:00Z in summer but 05:00Z in winter — and
   04:00Z in November is 23:00 the previous evening in New York, which is how
   this helper first put a Monday into the week before. */
const day = (iso: string, o: number, h: number, l: number, c: number, v = 10) => ({
  at: Date.parse(`${iso}T12:00:00Z`), open: o, high: h, low: l, price: c, volume: v,
});

test("a trading week becomes one candle: first open, last close, extremes between", () => {
  const w = weeklyBars([
    day("2026-09-14", 100, 105, 99, 104),  // Mon
    day("2026-09-15", 104, 110, 103, 108), // Tue — the week's high
    day("2026-09-16", 108, 109, 95, 97),   // Wed — the week's low
    day("2026-09-17", 97, 101, 96, 100),
    day("2026-09-18", 100, 102, 98, 101),  // Fri
  ]);
  assert.equal(w.length, 1);
  assert.deepEqual(
    { open: w[0].open, high: w[0].high, low: w[0].low, close: w[0].price, volume: w[0].volume },
    { open: 100, high: 110, low: 95, close: 101, volume: 50 },
  );
  assert.equal(w[0].at, Date.parse("2026-09-14T12:00:00Z"), "stamped at the week's first session");
});

test("the weekend splits weeks, Monday to Sunday", () => {
  const w = weeklyBars([day("2026-09-18", 1, 1, 1, 1), day("2026-09-21", 2, 2, 2, 2)]);
  assert.equal(w.length, 2, "Friday and the next Monday are different weeks");
});

test("a holiday-short week is still one candle", () => {
  const w = weeklyBars([day("2026-11-23", 1, 3, 1, 2), day("2026-11-24", 2, 4, 2, 3), day("2026-11-25", 3, 5, 1, 4), day("2026-11-27", 4, 6, 3, 5)]);
  assert.equal(w.length, 1);
  assert.equal(w[0].high, 6);
  assert.equal(w[0].low, 1);
});

test("five years of sessions come out as about two hundred and sixty weeks", () => {
  const pts = [];
  let t = Date.parse("2021-09-20T04:00:00Z");
  while (pts.length < 1275) {
    const dow = new Date(t).getUTCDay();
    if (dow !== 0 && dow !== 6) pts.push({ at: t, open: 1, high: 1, low: 1, price: 1, volume: 1 });
    t += 86_400_000;
  }
  const n = weeklyBars(pts).length;
  assert.ok(n >= 250 && n <= 262, `expected ~255-261 weeks, got ${n}`);
});

test("nothing in, nothing out", () => {
  assert.deepEqual(weeklyBars([]), []);
});
