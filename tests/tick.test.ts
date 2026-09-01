import { test } from "node:test";
import assert from "node:assert/strict";
import { toTick, isFresh, TICK_MAX_AGE_MS } from "../lib/api/stream/tick.ts";

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
