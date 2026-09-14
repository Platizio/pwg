import { test } from "node:test";
import assert from "node:assert/strict";
import { toTick, isFresh, carryBasis, TICK_MAX_AGE_MS, type Tick } from "../lib/api/stream/tick.ts";

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

/* Carrying the change basis forward.
 *
 * The gateway sends a symbol's FULL record once and then price-only deltas.
 * Measured against production during pre-market: of 14 ticks, 3 carried
 * `pv` and 11 did not — and the ones that did were the FIRST for each symbol
 * (MSFT first=495.63, NVDA first=218.29). So the newest tick for a symbol
 * almost never carries a basis.
 *
 * That made the instrument header read "Delayed" over a price 3.7 seconds old,
 * because the badge asks for a changePercent before it will call a tick live.
 *
 * previousClose is YESTERDAY'S CLOSE. It cannot change during a session, so
 * reusing the one we were already given is not pairing a live price with a
 * stale basis — it is the same basis, which is the only correct one.
 */

const base = (over: Partial<Tick> & { symbol: string; price: number; at: number }): Tick => ({
  previousClose: null,
  change: null,
  changePercent: null,
  volume: null,
  ...over,
});

test("a price-only delta inherits the basis it was already given", () => {
  const first = base({ symbol: "MSFT", price: 495.63, at: 1_000, previousClose: 495.63, change: 0, changePercent: 0 });
  const delta = base({ symbol: "MSFT", price: 491.687, at: 2_000 });

  const out = carryBasis(delta, first);
  assert.equal(out.previousClose, 495.63);
  /* Recomputed against the NEW price, never copied from the old tick. */
  assert.ok(Math.abs(out.change! - (491.687 - 495.63)) < 1e-9);
  assert.ok(Math.abs(out.changePercent! - ((491.687 - 495.63) / 495.63) * 100) < 1e-9);
  assert.equal(out.price, 491.687, "the price is the new one");
  assert.equal(out.at, 2_000, "the stamp is the new one");
});

test("a tick carrying its own basis is never overwritten by an older one", () => {
  /* A new session's close must win. Copying the previous tick's basis over a
     fresh one would pin the page to yesterday's yesterday. */
  const prev = base({ symbol: "NVDA", price: 218.29, at: 1_000, previousClose: 200, change: 18.29, changePercent: 9.145 });
  const fresh = base({ symbol: "NVDA", price: 212.25, at: 2_000, previousClose: 218.29, change: -6.04, changePercent: -2.766 });

  assert.equal(carryBasis(fresh, prev).previousClose, 218.29);
});

test("with nothing known, nothing is invented", () => {
  const delta = base({ symbol: "TSLA", price: 358.45, at: 2_000 });
  assert.equal(carryBasis(delta, undefined).changePercent, null);
  assert.equal(carryBasis(delta, null).previousClose, null);
  assert.equal(carryBasis(delta, base({ symbol: "TSLA", price: 1, at: 1 })).changePercent, null);
});

test("a carried basis never produces a change from a zero close", () => {
  /* toTick already refuses pv <= 0, but this must not be the one place that
     reintroduces an Infinity wearing a percent sign. */
  const prev = base({ symbol: "X", price: 5, at: 1, previousClose: 0 });
  assert.equal(carryBasis(base({ symbol: "X", price: 5, at: 2 }), prev).changePercent, null);
});
