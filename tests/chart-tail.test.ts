import test from "node:test";
import assert from "node:assert/strict";

import { MAX_TAIL_GAP_MS, liveTail } from "../lib/market/chart-tail.ts";
import type { PricePoint } from "../lib/api/normalize/series.ts";

/* Keeping the day chart level with the headline price.
 *
 * The chart draws `history.intraday`, which is rendered on the server. The
 * headline price comes off the websocket, seconds old. Those two were already
 * out of step and the instrument TTL going from five minutes to fifteen made it
 * three times worse: on a moving name the chart's last point can sit a quarter
 * of an hour below a price that is ticking live, directly above it. Two numbers
 * for one stock on one screen is the failure this codebase keeps coming back to.
 *
 * So the live tick is folded onto the tail. The rules that matter are about
 * what NOT to draw: never move the series backwards, never invent a bar where
 * there is no session, and never run a line across a hole big enough to hide a
 * move.
 */

const P = (at: number, price: number, over: Partial<PricePoint> = {}): PricePoint => ({
  at, price, open: price, high: price, low: price, volume: 100, ...over,
});

const T0 = Date.UTC(2026, 8, 14, 14, 30, 0); // 09:30 ET
const MIN = 60_000;

test("a tick in a later minute extends the series", () => {
  const bars = [P(T0, 100), P(T0 + MIN, 101)];
  const out = liveTail(bars, { price: 102.5, at: T0 + 2 * MIN });
  assert.equal(out.length, 3);
  assert.equal(out.at(-1)!.price, 102.5);
  assert.equal(out.at(-1)!.at, T0 + 2 * MIN);
});

test("a tick inside the last minute updates that bar instead of adding one", () => {
  /* Otherwise a busy minute grows a dozen points the feed never published. */
  const bars = [P(T0, 100), P(T0 + MIN, 101)];
  const out = liveTail(bars, { price: 101.4, at: T0 + MIN + 20_000 });
  assert.equal(out.length, 2, "the minute already had a bar");
  assert.equal(out.at(-1)!.price, 101.4);
});

test("updating the last bar widens its high and low rather than flattening them", () => {
  const bars = [P(T0, 100), P(T0 + MIN, 101, { high: 101.5, low: 100.8 })];
  const up = liveTail(bars, { price: 102, at: T0 + MIN + 5_000 }).at(-1)!;
  assert.equal(up.high, 102, "a new high must be recorded");
  assert.equal(up.low, 100.8, "the existing low must survive");

  const down = liveTail(bars, { price: 100.1, at: T0 + MIN + 5_000 }).at(-1)!;
  assert.equal(down.low, 100.1);
  assert.equal(down.high, 101.5);
});

test("the series never moves backwards", () => {
  /* A replayed or late tick must not rewrite a bar that is already behind it. */
  const bars = [P(T0, 100), P(T0 + 5 * MIN, 105)];
  assert.equal(liveTail(bars, { price: 99, at: T0 + MIN }), bars, "same array back, untouched");
});

test("no session, no chart", () => {
  /* intraday is empty when the market is shut. One point is not a day. */
  const empty: PricePoint[] = [];
  assert.equal(liveTail(empty, { price: 100, at: T0 }), empty);
});

test("no tick leaves the series exactly as it was", () => {
  /* Identity, not a copy: the chart re-renders on a new array. */
  const bars = [P(T0, 100)];
  assert.equal(liveTail(bars, null), bars);
  assert.equal(liveTail(bars, undefined), bars);
});

test("a gap too big to draw across is left undrawn", () => {
  /* A line chart interpolates between its points, and over a minute that is
     fair. Over hours it asserts a shape nobody measured — it could run straight
     through a spike. Past the limit the chart honestly stops where the data
     stops, and the badge above it already says the page is behind. */
  const bars = [P(T0, 100)];
  const tooFar = liveTail(bars, { price: 130, at: T0 + MAX_TAIL_GAP_MS + 1 });
  assert.equal(tooFar, bars, "nothing drawn across the hole");

  const justInside = liveTail(bars, { price: 130, at: T0 + MAX_TAIL_GAP_MS - 1 });
  assert.equal(justInside.length, 2);
});

test("the input is never mutated", () => {
  const bars = [P(T0, 100), P(T0 + MIN, 101)];
  const before = JSON.stringify(bars);
  liveTail(bars, { price: 102, at: T0 + 2 * MIN });
  liveTail(bars, { price: 101.9, at: T0 + MIN + 1_000 });
  assert.equal(JSON.stringify(bars), before, "React state must not be written through");
});

test("a tick with no usable price is ignored", () => {
  const bars = [P(T0, 100)];
  assert.equal(liveTail(bars, { price: 0, at: T0 + MIN }), bars);
  assert.equal(liveTail(bars, { price: -5, at: T0 + MIN }), bars);
});
