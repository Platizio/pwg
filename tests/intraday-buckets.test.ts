import test from "node:test";
import assert from "node:assert/strict";

import { bucketIntraday, SESSIONS_KEPT, sessionsAt, pickSessions, aggsToColumns, columnsToRows, withOfficialClose, withOfficialCloses, startsInRegularSession } from "../lib/market/intraday-buckets.ts";
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

/* Seven TRADING days, weekends excluded — nine calendar days for seven
 * sessions. The window and the retention have to agree: keep fewer than the
 * chart draws and the far end is discarded before it can ever appear. */
test("a week is seven trading sessions, with the weekends excluded", () => {
  const week = [
    Date.parse("2026-09-14T13:30:00Z"), // Mon
    Date.parse("2026-09-15T13:30:00Z"), // Tue
    Date.parse("2026-09-16T13:30:00Z"), // Wed
    Date.parse("2026-09-17T13:30:00Z"), // Thu
    Date.parse("2026-09-18T13:30:00Z"), // Fri — the weekend leaves no bars at all
    Date.parse("2026-09-21T13:30:00Z"), // Mon
    Date.parse("2026-09-22T13:30:00Z"), // Tue
  ];
  assert.equal(sessionsAt(week), 7);
  assert.equal(SESSIONS_KEPT, 7, "retention has to hold exactly the window the chart draws");
});

/* ---------- which source draws each session ---------- */

/* The gateway's archive has holes — 16 Sep 2026 held 18 bars for AAPL against
 * a session's 391 — while the store's buckets were captured from the live
 * session. Each day is drawn from whichever covers more minutes. */
const minute = (iso: string, price = 100) => ({ date: iso, price, opening: price, high: price, low: price, volume: 1 });

/* Against a FULL stored day — 40 ten-minute buckets, 09:30 to 16:00. The first
   version scored that at 40 x 10 = 400 minutes, beat the archive's 391 and drew
   every day from buckets; a test with a one-bucket store could not see it. */
test("a complete archive day beats a complete stored day", () => {
  const g = Array.from({ length: 391 }, (_, i) => minute(new Date(Date.parse("2026-09-15T13:30:00Z") + i * 60_000).toISOString()));
  const b = Array.from({ length: 40 }, (_, i) => new Date(Date.parse("2026-09-15T13:30:00Z") + i * 600_000).toISOString());
  const stored = { date: b, price: b.map(() => 1), opening: b.map(() => 1), high: b.map(() => 1), low: b.map(() => 1), volume: b.map(() => 1) };
  const out = pickSessions(["2026-09-15"], [{ rows: g as never, width: 1 }, { rows: columnsToRows(stored), width: 10 }]);
  assert.equal(out.length, 391, "the one-minute bars, not the forty buckets");
});

test("a day the archive lost is drawn from the store instead", () => {
  const thin = [minute("2026-09-16T13:32:00Z"), minute("2026-09-16T19:44:00Z")];
  const buckets = Array.from({ length: 39 }, (_, i) => new Date(Date.parse("2026-09-16T13:30:00Z") + i * 600_000).toISOString());
  const stored = { date: buckets, price: buckets.map(() => 2), opening: buckets.map(() => 2), high: buckets.map(() => 2), low: buckets.map(() => 2), volume: buckets.map(() => 1) };
  const out = pickSessions(["2026-09-16"], [{ rows: thin as never, width: 1 }, { rows: columnsToRows(stored), width: 10 }]);
  assert.equal(out.length, 39, "39 ten-minute buckets cover more than 2 stray minutes");
});

test("with nothing better, a thin day is still drawn rather than dropped", () => {
  const thin = [minute("2026-09-16T13:32:00Z"), minute("2026-09-16T19:44:00Z")];
  assert.equal(pickSessions(["2026-09-16"], [{ rows: thin as never, width: 1 }, { rows: [], width: 10 }]).length, 2);
});

test("only the requested sessions come back, in order", () => {
  const rows = [minute("2026-09-14T14:00:00Z"), minute("2026-09-15T14:00:00Z"), minute("2026-09-16T14:00:00Z")];
  const out = pickSessions(["2026-09-15", "2026-09-16"], [{ rows: rows as never, width: 1 }, { rows: [], width: 10 }]);
  assert.deepEqual(out.map((r) => r.date), ["2026-09-15T14:00:00Z", "2026-09-16T14:00:00Z"]);
});

/* ---------- Polygon aggregates into the chart's columns ---------- */

/* 2026-09-22 is EDT: 09:30 ET = 13:30Z, 16:00 ET = 20:00Z. */
const agg = (iso: string, c = 1) => ({ t: Date.parse(iso), o: c, h: c, l: c, c, v: 1 });

test("only buckets that START inside the regular session are drawn", () => {
  const c = aggsToColumns(
    [
      agg("2026-09-22T13:00:00Z"), // 09:00 — pre-market
      agg("2026-09-22T13:30:00Z"), // 09:30 — the open
      agg("2026-09-22T19:30:00Z"), // 15:30 — its close is the closing print
      agg("2026-09-22T20:00:00Z"), // 16:00 — post-market from its first second
    ],
    ["2026-09-22"],
  );
  assert.deepEqual(c.date, ["2026-09-22T13:30:00.000Z", "2026-09-22T19:30:00.000Z"]);
});

test("only the requested trading days, in order, without the chunks' overlaps", () => {
  const c = aggsToColumns(
    [agg("2026-09-22T14:00:00Z", 2), agg("2026-09-21T14:00:00Z", 1), agg("2026-09-22T14:00:00Z", 2), agg("2026-09-18T14:00:00Z", 9)],
    ["2026-09-21", "2026-09-22"],
  );
  assert.deepEqual(c.price, [1, 2]);
});

/* Polygon leads for the day and the week: it has every minute, where the
   archive lags a day and has holes. A complete Polygon day is drawn from it
   even when the archive holds the same day in full. */
test("of three complete sources, the first listed draws the day", () => {
  const minutes = (price: number) => Array.from({ length: 391 }, (_, i) => minute(new Date(Date.parse("2026-09-23T13:30:00Z") + i * 60_000).toISOString(), price));
  const out = pickSessions(["2026-09-23"], [
    { rows: minutes(1) as never, width: 1 },
    { rows: minutes(2) as never, width: 1 },
    { rows: [], width: 10 },
  ]);
  assert.equal(out.length, 391);
  assert.equal(out[0].price, 1, "the first source");
});

test("a day the first source lacks is taken from the next one that has it", () => {
  const minutes = Array.from({ length: 391 }, (_, i) => minute(new Date(Date.parse("2026-09-23T13:30:00Z") + i * 60_000).toISOString(), 2));
  const out = pickSessions(["2026-09-23"], [
    { rows: [], width: 1 },
    { rows: minutes as never, width: 1 },
  ]);
  assert.equal(out.length, 391);
});

/* ---------- ending a finished session on its official close ---------- */

/* Polygon's minute bars stop at 15:59, whose close is the last continuous
 * trade (336.95 on 23 Sep 2026). The official close prints at 16:00:00 in the
 * closing cross (337.02) — the number the "Previous close" card shows. Drawn
 * without it, the day chart ended a few cents away from the figure printed
 * beneath it. */
const cols = (isos: string[], prices: number[]) => ({
  date: isos, price: prices, opening: prices, high: prices, low: prices, volume: prices.map(() => 1),
});

test("a finished session ends on its official close at 16:00 New York", () => {
  const s = withOfficialClose(cols(["2026-09-23T13:30:00.000Z", "2026-09-23T19:59:00.000Z"], [339.89, 336.95]), "2026-09-23", 337.02);
  assert.equal(s.date.at(-1), "2026-09-23T20:00:00.000Z", "16:00 EDT");
  assert.equal(s.price.at(-1), 337.02);
  assert.equal(s.date.length, 3);
});

test("in winter 16:00 New York is 21:00Z", () => {
  const s = withOfficialClose(cols(["2026-01-21T20:59:00.000Z"], [100]), "2026-01-21", 101);
  assert.equal(s.date.at(-1), "2026-01-21T21:00:00.000Z");
});

test("a session that already ends at 16:00 is left alone", () => {
  const before = cols(["2026-09-23T19:59:00.000Z", "2026-09-23T20:00:00.000Z"], [336.95, 337.02]);
  assert.equal(withOfficialClose(before, "2026-09-23", 337.02).date.length, 2);
});

test("no official close, or no bars, changes nothing", () => {
  const before = cols(["2026-09-23T19:59:00.000Z"], [336.95]);
  assert.equal(withOfficialClose(before, "2026-09-23", null).date.length, 1);
  assert.equal(withOfficialClose(cols([], []), "2026-09-23", 337.02).date.length, 0);
});

/* A session still running has no official close: a partial daily bar's "close"
   is only the latest trade, and drawing it at 16:00 would invent the ending. */
test("a session still running is not given a close", () => {
  const live = cols(["2026-09-24T13:30:00.000Z", "2026-09-24T15:00:00.000Z"], [336, 335]);
  const at1100 = Date.parse("2026-09-24T15:00:00Z"); // 11:00 ET
  assert.equal(withOfficialClose(live, "2026-09-24", 335.5, at1100).date.length, 2);
  const after = Date.parse("2026-09-24T20:30:00Z"); // 16:30 ET
  assert.equal(withOfficialClose(live, "2026-09-24", 335.5, after).date.length, 3);
});

/* ---------- half-days ---------- */

/* On a half-day the regular session ends at 13:00 and the closing auction runs
 * then. Measured on AAPL, Fri 28 Nov 2025: the 13:00 minute opened at 278.86
 * against an official 278.85, and post-market printed from 16:00 to 16:59. A
 * chart that kept everything before 16:00 drew the 13:00 bar as session. */

/* Fri 27 Nov 2026 is a half-day, in EST: 13:00 ET = 18:00Z. */
test("on a half-day only buckets that start before 13:00 are drawn", () => {
  const c = aggsToColumns(
    [
      agg("2026-11-27T14:30:00Z"), // 09:30
      agg("2026-11-27T17:30:00Z"), // 12:30 — its close is the last print before the auction
      agg("2026-11-27T18:00:00Z"), // 13:00 — the auction and after
      agg("2026-11-27T21:00:00Z"), // 16:00 — post-market
    ],
    ["2026-11-27"],
  );
  assert.deepEqual(c.date, ["2026-11-27T14:30:00.000Z", "2026-11-27T17:30:00.000Z"]);
});

test("a half-day session ends on its official close at 13:00 New York", () => {
  const s = withOfficialClose(cols(["2026-11-27T17:59:00.000Z"], [278.86]), "2026-11-27", 278.85);
  assert.equal(s.date.at(-1), "2026-11-27T18:00:00.000Z");
  assert.equal(s.price.at(-1), 278.85);
});

test("a half-day's close is not drawn before 13:00, and is after it", () => {
  const live = cols(["2026-11-27T14:30:00.000Z", "2026-11-27T17:00:00.000Z"], [280, 279]);
  assert.equal(withOfficialClose(live, "2026-11-27", 278.85, Date.parse("2026-11-27T17:30:00Z")).date.length, 2, "12:30 ET");
  assert.equal(withOfficialClose(live, "2026-11-27", 278.85, Date.parse("2026-11-27T18:05:00Z")).date.length, 3, "13:05 ET");
});

/* ---------- which rows count as the session ---------- */

/* A row is judged by where it STARTS. The gateway's own 16:00 minute is a
   post-market print, not the close (measured 23 Sep 2026), so it is dropped
   with the rest of post-market and the official close is drawn in its place. */
test("a row starting at the bell is post-market; 15:59 is the session's last", () => {
  assert.equal(startsInRegularSession(Date.parse("2026-09-23T13:29:00Z")), false, "09:29");
  assert.equal(startsInRegularSession(Date.parse("2026-09-23T13:30:00Z")), true, "09:30");
  assert.equal(startsInRegularSession(Date.parse("2026-09-23T19:59:00Z")), true, "15:59");
  assert.equal(startsInRegularSession(Date.parse("2026-09-23T20:00:00Z")), false, "16:00");
  assert.equal(startsInRegularSession(Date.parse("2026-11-27T17:59:00Z")), true, "12:59 on a half-day");
  assert.equal(startsInRegularSession(Date.parse("2026-11-27T18:00:00Z")), false, "13:00 on a half-day");
  assert.equal(startsInRegularSession(Number.NaN), false);
});

/* ---------- every session of a multi-day range ends on its close ---------- */

test("each drawn session gains its own close at its own bell", () => {
  const series = cols(
    [
      "2026-09-22T13:30:00.000Z", "2026-09-22T19:30:00.000Z", // 22 Sep, 09:30 and 15:30
      "2026-09-23T13:30:00.000Z", "2026-09-23T19:30:00.000Z", // 23 Sep
    ],
    [340.1, 339.6, 341, 336.95],
  );
  const s = withOfficialCloses(series, new Map([["2026-09-22", 339.75], ["2026-09-23", 337.02]]));
  assert.deepEqual(s.date, [
    "2026-09-22T13:30:00.000Z", "2026-09-22T19:30:00.000Z", "2026-09-22T20:00:00.000Z",
    "2026-09-23T13:30:00.000Z", "2026-09-23T19:30:00.000Z", "2026-09-23T20:00:00.000Z",
  ]);
  assert.deepEqual(s.price, [340.1, 339.6, 339.75, 341, 336.95, 337.02]);
  assert.equal(s.price.at(-1), 337.02, "the whole series ends on the last session's close");
  assert.deepEqual(
    [s.opening[2], s.high[2], s.low[2], s.volume[2]],
    [339.75, 339.75, 339.75, 0],
    "a point at the close, not a bar with a range",
  );
});

test("a session with no known close is left as drawn", () => {
  const series = cols(["2026-09-22T19:30:00.000Z", "2026-09-23T19:30:00.000Z"], [339.6, 336.95]);
  const s = withOfficialCloses(series, new Map([["2026-09-23", 337.02]]));
  assert.deepEqual(s.price, [339.6, 336.95, 337.02]);
});

test("a close for a day with nothing drawn does not become a lone point", () => {
  const series = cols(["2026-09-23T19:30:00.000Z"], [336.95]);
  const s = withOfficialCloses(series, new Map([["2026-09-22", 339.75], ["2026-09-23", 337.02]]));
  assert.deepEqual(s.date, ["2026-09-23T19:30:00.000Z", "2026-09-23T20:00:00.000Z"]);
});

test("a session that already reaches its bell is left alone", () => {
  const series = cols(["2026-09-23T19:59:00.000Z", "2026-09-23T20:00:00.000Z"], [336.95, 337.02]);
  assert.equal(withOfficialCloses(series, new Map([["2026-09-23", 337.02]])).date.length, 2);
});

test("a half-day in a multi-day range closes at 13:00", () => {
  const series = cols(["2026-11-25T20:30:00.000Z", "2026-11-27T17:30:00.000Z"], [280, 279]);
  const s = withOfficialCloses(series, new Map([["2026-11-25", 280.5], ["2026-11-27", 278.85]]));
  assert.deepEqual(s.date, [
    "2026-11-25T20:30:00.000Z", "2026-11-25T21:00:00.000Z", // Wed 25 Nov, EST: 16:00 = 21:00Z
    "2026-11-27T17:30:00.000Z", "2026-11-27T18:00:00.000Z", // Fri 27 Nov: 13:00 = 18:00Z
  ]);
});
