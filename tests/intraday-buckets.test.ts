import test from "node:test";
import assert from "node:assert/strict";

import { bucketIntraday, SESSIONS_KEPT, sessionsAt } from "../lib/market/intraday-buckets.ts";
import { mergeIntradaySessions } from "../lib/market/store/sections.ts";

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

/* ---------- five sessions, merged ---------- */


/* The store keeps five sessions and the gateway hands over one, so every
   capture is a merge. Each rule below is a way of not losing bars that exist
   nowhere else — once a session ends there is no endpoint to fetch it back
   from. */
const session = (day: string, prices: number[]) => ({
  /* 18:00Z is 14:00 Eastern: inside the session, and on the same Eastern day
     as the UTC one, so these fixtures say what they look like they say. */
  date: prices.map((_, i) => `${day}T${String(18 + i).padStart(2, "0")}:00:00.000Z`),
  price: prices,
  opening: prices,
  high: prices,
  low: prices,
  volume: prices.map(() => 100),
});

test("a captured session is added to the ones already stored", () => {
  const out = mergeIntradaySessions(session("2026-09-16", [1, 2]), session("2026-09-17", [3, 4]));
  assert.deepEqual(out.price, [1, 2, 3, 4]);
});

test("an empty capture leaves what is stored alone", () => {
  /* The gateway answers an empty array outside a session. Writing it over a
     real day would erase bars nothing can fetch back. */
  const stored = session("2026-09-17", [3, 4]);
  const out = mergeIntradaySessions(stored, {
    date: [], price: [], opening: [], high: [], low: [], volume: [],
  });
  assert.deepEqual(out.price, [3, 4]);
});

test("re-capturing a day replaces it rather than doubling it", () => {
  /* Captures overlap: 15:55 and a retry at 15:58 are the same session. */
  const out = mergeIntradaySessions(session("2026-09-17", [3, 4]), session("2026-09-17", [3, 4, 5]));
  assert.deepEqual(out.price, [3, 4, 5]);
});

test("only the most recent sessions survive", () => {
  let stored = mergeIntradaySessions(null, session("2026-09-01", [99]));
  for (let d = 2; d <= 2 + SESSIONS_KEPT; d += 1) {
    stored = mergeIntradaySessions(stored, session(`2026-09-${String(d).padStart(2, "0")}`, [d]));
  }
  assert.equal(new Set(stored.date.map((d) => d.slice(0, 10))).size, SESSIONS_KEPT);
  assert.ok(!stored.price.includes(99), "the oldest session is evicted");
});

test("nothing stored yet is not a reason to refuse the first capture", () => {
  assert.deepEqual(mergeIntradaySessions(null, session("2026-09-17", [7])).price, [7]);
});

/* ---------- how many sessions are actually here ---------- */

/* The week chart has to know whether it has a week. Capture started on
 * 2026-09-21, so for the first four days the store held ONE session of
 * ten-minute buckets — and 1W drew it, which made 1W and 1D the same chart
 * with different labels on it.
 *
 * Counted in EASTERN days. A US session is 13:30 to 05:30 the next morning in
 * India, so counting in the reader's zone turns one session into two days and
 * a week into ten — which would have let a single day pass as a full week. */
test("one session is one session, however many reader-days it straddles", () => {
  const session = [
    Date.parse("2026-09-21T08:00:00Z"), // 04:00 ET, pre-market — 13:30 IST
    Date.parse("2026-09-21T13:30:00Z"), // 09:30 ET, the bell
    Date.parse("2026-09-21T19:30:00Z"), // 15:30 ET — already 01:00 IST on the 22nd
  ];
  assert.equal(sessionsAt(session), 1);
});

test("separate trading days are counted apart", () => {
  assert.equal(
    sessionsAt([
      Date.parse("2026-09-21T13:30:00Z"),
      Date.parse("2026-09-22T13:30:00Z"),
      Date.parse("2026-09-23T13:30:00Z"),
    ]),
    3,
  );
});

test("nothing is no sessions, and junk is not a session", () => {
  assert.equal(sessionsAt([]), 0);
  assert.equal(sessionsAt([Number.NaN, Number.POSITIVE_INFINITY]), 0);
});
