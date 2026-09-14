import { test } from "node:test";
import assert from "node:assert/strict";
import { toTick, isFresh, carryBasis, basisOf, TICK_MAX_AGE_MS, type Tick } from "../lib/api/stream/tick.ts";

/* What the live stream actually sends, as observed against UAT rather than as
   documented. Two things in that sample decide this whole module:

     {"s":"DJCIT$","o":0,"h":699.883,"l":693.637,"c":0,"v":0,"t":...}

   a close of 0 is not a price, and some symbols arrive stamped a week old.
   Either one, written into a panel, is a wrong number wearing a real ticker —
   which is the single failure this codebase spends the most effort avoiding.
   So the gate lives here, in a pure function, with tests. */

const AT = 1788171214972;

test("a quote with a usable close becomes a tick", () => {
  const t = toTick({ s: "AAPL", o: 309.58, h: 311.8, l: 305.17, c: 306.007, v: 7820184, t: AT, pv: 308.91 });
  assert.ok(t);
  assert.equal(t.symbol, "AAPL");
  assert.equal(t.price, 306.007);
  assert.equal(t.at, AT);
});

test("a close of zero is rejected — the stream sends it for index rows", () => {
  assert.equal(toTick({ s: "DJCIT$", o: 0, h: 699.883, l: 693.637, c: 0, v: 0, t: AT }), null);
});

test("a missing or non-finite close is rejected", () => {
  assert.equal(toTick({ s: "AAPL", t: AT }), null);
  assert.equal(toTick({ s: "AAPL", c: Number.NaN, t: AT }), null);
  assert.equal(toTick({ s: "AAPL", c: Number.POSITIVE_INFINITY, t: AT }), null);
});

test("a negative close is rejected rather than rendered", () => {
  assert.equal(toTick({ s: "AAPL", c: -12, t: AT }), null);
});

test("a row with no symbol is rejected", () => {
  assert.equal(toTick({ s: "", c: 306, t: AT }), null);
  assert.equal(toTick({ c: 306, t: AT }), null);
});

test("an unusable timestamp is rejected — an undated tick cannot be aged", () => {
  assert.equal(toTick({ s: "AAPL", c: 306, t: 0 }), null);
  assert.equal(toTick({ s: "AAPL", c: 306 }), null);
});

test("zero volume is allowed; it is a quiet symbol, not a missing price", () => {
  const t = toTick({ s: "AAPL", c: 306.007, v: 0, t: AT });
  assert.ok(t);
  assert.equal(t.volume, 0);
});

test("change is computed only when the previous close can carry it", () => {
  const withPv = toTick({ s: "AAPL", c: 310, v: 1, t: AT, pv: 300 });
  assert.ok(withPv);
  assert.equal(withPv.previousClose, 300);
  assert.ok(Math.abs((withPv.changePercent ?? 0) - 3.3333333333) < 1e-6);

  const noPv = toTick({ s: "AAPL", c: 310, v: 1, t: AT });
  assert.ok(noPv);
  assert.equal(noPv.previousClose, null);
  assert.equal(noPv.changePercent, null);

  const zeroPv = toTick({ s: "AAPL", c: 310, v: 1, t: AT, pv: 0 });
  assert.ok(zeroPv);
  assert.equal(zeroPv.changePercent, null, "a zero previous close would divide by zero");
});

test("a tick from this moment is fresh", () => {
  const now = AT + 1000;
  assert.equal(isFresh({ symbol: "AAPL", price: 1, previousClose: null, change: null, changePercent: null, volume: null, at: AT }, now), true);
});

test("a week-old tick is not fresh — the stream replays them and they must not overwrite a live quote", () => {
  const now = AT + TICK_MAX_AGE_MS + 1;
  assert.equal(isFresh({ symbol: "AAPL", price: 1, previousClose: null, change: null, changePercent: null, volume: null, at: AT }, now), false);
});

test("a tick stamped slightly in the future is tolerated, not discarded", () => {
  // Clock skew between the gateway and this process is normal and small.
  const now = AT - 2000;
  assert.equal(isFresh({ symbol: "AAPL", price: 1, previousClose: null, change: null, changePercent: null, volume: null, at: AT }, now), true);
});

/* Carrying the change basis forward, and refusing to carry it too far.
 *
 * The gateway sends a symbol's FULL record once and price-only deltas after.
 * Measured against production during pre-market: of 14 ticks, 3 carried `pv`
 * and all three were that symbol's FIRST. So the newest tick — the one every
 * surface reads — almost never carries its own basis, and the header read
 * "Delayed" over a price 3.7 seconds old.
 *
 * previousClose is yesterday's close: a per-session constant. Reusing the one
 * the gateway already sent is the same basis, not an older one.
 *
 * THE PART THAT MATTERS MORE. A basis kept past its session is worse than no
 * basis at all: a missing change renders a dash, a wrong change renders a
 * number. This process stays up for days, so the stamp is the row's OWN
 * Eastern trading day rather than wall-clock now — tick.ts already records
 * that the wildcard feed sends "rows stamped seven days old alongside rows
 * stamped this second", and stamping those with today's date would launder an
 * ancient basis into a current one.
 */

const DAY_MS = 86_400_000;
/* A Monday inside the US session, so +1 day stays inside the same week. */
const MON = Date.UTC(2026, 8, 14, 14, 0, 0);

const t = (over: Partial<Tick> & { symbol: string; price: number; at: number }): Tick => ({
  previousClose: null, change: null, changePercent: null, volume: null, ...over,
});

test("a row carrying a previous close contributes a basis stamped with its own day", () => {
  const b = basisOf(t({ symbol: "MSFT", price: 495, at: MON, previousClose: 495.63 }));
  assert.equal(b?.value, 495.63);
  assert.match(b!.day, /^\d{4}-\d{2}-\d{2}$/);
});

test("a row with no previous close contributes nothing", () => {
  assert.equal(basisOf(t({ symbol: "MSFT", price: 495, at: MON })), null);
  assert.equal(basisOf(t({ symbol: "MSFT", price: 495, at: MON, previousClose: 0 })), null);
});

test("a same-day delta inherits the basis, recomputed against the new price", () => {
  const b = basisOf(t({ symbol: "MSFT", price: 495.63, at: MON, previousClose: 495.63 }))!;
  const out = carryBasis(t({ symbol: "MSFT", price: 491.687, at: MON + 60_000 }), b);

  assert.equal(out.previousClose, 495.63);
  assert.ok(Math.abs(out.change! - (491.687 - 495.63)) < 1e-9, "recomputed, never copied");
  assert.ok(Math.abs(out.changePercent! - ((491.687 - 495.63) / 495.63) * 100) < 1e-9);
  assert.equal(out.price, 491.687);
});

test("a basis from another trading day is refused outright", () => {
  /* The failure this exists to prevent: an always-on process hands Monday's
     close to Wednesday's delta and prints a two-day move, often wrong-signed,
     beside a price from this second. */
  const monday = basisOf(t({ symbol: "AAPL", price: 330, at: MON, previousClose: 330 }))!;
  const wednesday = t({ symbol: "AAPL", price: 336, at: MON + 2 * DAY_MS });

  const out = carryBasis(wednesday, monday);
  assert.equal(out.previousClose, null, "a stale basis must not be applied");
  assert.equal(out.changePercent, null, "a dash is correct here; a number is not");
});

test("an ancient row cannot launder its basis into today", () => {
  /* The wildcard feed sends rows stamped a week old beside rows stamped this
     second. Stamping by the ROW's own time is what makes it safe to harvest a
     basis before the freshness gate — which is the only way a quiet name ever
     gets one at all. */
  const ancient = basisOf(t({ symbol: "QUIET", price: 10, at: MON - 7 * DAY_MS, previousClose: 9 }))!;
  const today = t({ symbol: "QUIET", price: 11, at: MON });
  assert.equal(carryBasis(today, ancient).changePercent, null);
});

test("a tick carrying its own basis is never overwritten", () => {
  const old = basisOf(t({ symbol: "NVDA", price: 200, at: MON, previousClose: 200 }))!;
  const fresh = t({ symbol: "NVDA", price: 212.25, at: MON + 1000, previousClose: 218.29, change: -6.04, changePercent: -2.766 });
  assert.equal(carryBasis(fresh, old).previousClose, 218.29);
});

test("with no basis known, nothing is invented", () => {
  const d = t({ symbol: "TSLA", price: 358.45, at: MON });
  assert.equal(carryBasis(d, null).changePercent, null);
  assert.equal(carryBasis(d, undefined).previousClose, null);
});
