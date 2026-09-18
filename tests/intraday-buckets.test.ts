import test from "node:test";
import assert from "node:assert/strict";

import { bucketIntraday } from "../lib/market/intraday-buckets.ts";

/* Minute bars reduced to the grid a chart can draw.
 *
 * A bucket is an OHLCV aggregate and every field aggregates differently: the
 * open is the FIRST open in the bucket, the close the LAST price, the high the
 * maximum, the low the minimum, the volume the sum. Getting any one of them
 * wrong draws a candle that never traded, which is worse than drawing nothing
 * — nobody can tell by looking that it is wrong.
 */

const bar = (
  iso: string,
  price: number,
  extra: { opening?: number; high?: number; low?: number; volume?: number } = {},
) => ({
  date: iso,
  price,
  opening: extra.opening ?? price,
  high: extra.high ?? price,
  low: extra.low ?? price,
  volume: extra.volume ?? 100,
});

test("a bucket takes the first open, last close, extreme high and low, and summed volume", () => {
  const rows = [
    bar("2026-09-18T09:30:00.000-0400", 100, { opening: 99, high: 101, low: 98, volume: 10 }),
    bar("2026-09-18T09:34:00.000-0400", 104, { opening: 100, high: 106, low: 97, volume: 20 }),
    bar("2026-09-18T09:39:00.000-0400", 103, { opening: 104, high: 105, low: 102, volume: 30 }),
  ];

  const out = bucketIntraday(rows, 10);

  assert.equal(out.date.length, 1, "all three minutes fall in one ten-minute bucket");
  assert.equal(out.opening[0], 99, "the first bar's open, not the last");
  assert.equal(out.price[0], 103, "the last bar's price, not the first");
  assert.equal(out.high[0], 106, "the highest high across the bucket");
  assert.equal(out.low[0], 97, "the lowest low across the bucket");
  assert.equal(out.volume[0], 60, "the summed volume");
});

test("minutes in different buckets do not merge", () => {
  const out = bucketIntraday(
    [bar("2026-09-18T09:30:00.000-0400", 100), bar("2026-09-18T09:41:00.000-0400", 200)],
    10,
  );
  assert.deepEqual(out.price, [100, 200]);
});

/* A thin or halted name simply has no trades for stretches of the session.
   Filling those minutes with the last price would invent the flat lines this
   whole change exists to remove — the same complaint, in reverse. */
test("a gap in trading leaves a gap, not a fabricated bucket", () => {
  const out = bucketIntraday(
    [bar("2026-09-18T09:30:00.000-0400", 100), bar("2026-09-18T11:30:00.000-0400", 120)],
    10,
  );
  assert.equal(out.date.length, 2, "two buckets, not the twelve between them");
});

test("an empty session yields empty columns rather than a throw", () => {
  assert.deepEqual(bucketIntraday([], 10), {
    date: [],
    price: [],
    opening: [],
    high: [],
    low: [],
    volume: [],
  });
});

/* Stamped at the bucket's own boundary rather than at the first bar inside it,
   so two sessions land on the same grid and a week's x-axis is even. */
test("a bucket is stamped at the boundary it starts on", () => {
  const out = bucketIntraday([bar("2026-09-18T09:34:00.000-0400", 100)], 10);
  assert.equal(new Date(out.date[0]).getTime() % (10 * 60_000), 0);
});

test("rows arriving out of order are bucketed by time, not by position", () => {
  const out = bucketIntraday(
    [bar("2026-09-18T09:41:00.000-0400", 200), bar("2026-09-18T09:30:00.000-0400", 100)],
    10,
  );
  assert.deepEqual(out.price, [100, 200], "sorted onto the grid");
});

/* The gateway's own rows are not guaranteed well formed — it writes "_" for a
   missing company name elsewhere in this API, and a bar with no price is not a
   bar. Dropping them is right; letting a NaN through would poison the axis. */
test("a row with no usable price is dropped rather than charted", () => {
  const out = bucketIntraday(
    [
      { date: "2026-09-18T09:30:00.000-0400", price: null } as never,
      bar("2026-09-18T09:31:00.000-0400", 100),
      { date: "not a date", price: 50 } as never,
    ],
    10,
  );
  assert.deepEqual(out.price, [100]);
});
