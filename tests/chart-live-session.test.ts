import test from "node:test";
import assert from "node:assert/strict";

import {
  bucketLast,
  endOnClose,
  lastSessions,
  pickDaySeries,
  withLiveSession,
} from "../lib/market/regular-session.ts";

/* How the long charts and the day chart meet the live session.
 *
 * Three complaints sit behind these tests. The 1W/1M/3M/1Y charts stood still
 * all session: they were drawn from a fetch cached for minutes to hours, so
 * the header ticked while the line under it did not. After the bell the day
 * chart kept the gateway's 16:00 minute, a post-market print, rather than the
 * official close. And with the market shut, a multi-day chart ended a few
 * cents from the "Previous close" printed on the same page. */

const at = (iso: string) => Date.parse(iso);
const pt = (iso: string, price: number) => ({
  at: at(iso),
  price,
  open: price,
  high: price,
  low: price,
  volume: 100,
});

/* ---------- the live tail, bucketed ---------- */

test("live minutes collapse to the range's spacing, keeping the LAST price of each bucket", () => {
  const live = [
    pt("2026-09-24T13:30:00Z", 336.0),
    { ...pt("2026-09-24T13:31:00Z", 336.4), high: 336.9 },
    { ...pt("2026-09-24T13:34:00Z", 336.2), low: 335.5 },
    pt("2026-09-24T13:35:00Z", 336.6),
    /* A websocket tick: stamped at its own second, not a minute boundary. */
    { at: at("2026-09-24T13:37:42Z"), price: 336.75, open: 336.75, high: 336.75, low: 336.75, volume: null },
  ];
  const out = bucketLast(live, 5);
  assert.deepEqual(
    out.map((p) => [new Date(p.at).toISOString(), p.price]),
    [
      ["2026-09-24T13:30:00.000Z", 336.2],
      ["2026-09-24T13:35:00.000Z", 336.75],
    ],
    "stamped at the bucket's start, like Polygon's aggregates, and ending on the live price",
  );
  assert.equal(out[0].open, 336.0, "the first open owns the bucket");
  assert.equal(out[0].high, 336.9);
  assert.equal(out[0].low, 335.5);
  assert.equal(out[0].volume, 300);
  assert.equal(out[1].volume, 100, "a tick's null volume adds nothing");
});

test("a bucketed empty series is empty", () => {
  assert.deepEqual(bucketLast([], 30), []);
});

/* ---------- replacing today's fetched points with the live ones ---------- */

const fetchedWeek = [
  pt("2026-09-22T13:30:00Z", 340.0),
  pt("2026-09-22T19:55:00Z", 339.7),
  pt("2026-09-23T13:30:00Z", 339.0),
  pt("2026-09-23T19:55:00Z", 337.0),
  /* Fetched mid-session today: stops at 10:30 and never moves again. */
  pt("2026-09-24T13:30:00Z", 336.0),
  pt("2026-09-24T14:30:00Z", 335.0),
];

const liveToday = [
  pt("2026-09-24T13:30:00Z", 336.1),
  pt("2026-09-24T14:30:00Z", 335.2),
  pt("2026-09-24T15:12:00Z", 335.9),
  { at: at("2026-09-24T15:14:31Z"), price: 336.05, open: 336.05, high: 336.05, low: 336.05, volume: null },
];

/* The fetch's own points of today stand: the live series is the slower copy
   (the gateway ran 20-22 minutes behind Polygon, measured 24 Sep 2026), so it
   only carries the fetch on past the end of its last bucket. */
test("today's fetched points stand, and the live session carries them on to the live price", () => {
  const out = withLiveSession(fetchedWeek, liveToday, 5);
  assert.deepEqual(
    out.slice(0, 4).map((p) => p.at),
    fetchedWeek.slice(0, 4).map((p) => p.at),
    "earlier sessions are untouched",
  );
  assert.deepEqual(
    out.slice(4).map((p) => [new Date(p.at).toISOString(), p.price]),
    [
      ["2026-09-24T13:30:00.000Z", 336.0],
      ["2026-09-24T14:30:00.000Z", 335.0],
      ["2026-09-24T15:10:00.000Z", 336.05],
    ],
  );
  assert.equal(out.at(-1)?.price, 336.05, "the last point is the live tick");
});

test("a live session the fetch has not reached yet is appended", () => {
  /* Fetched before the open: tradingDays leaves today out until 09:30. */
  const out = withLiveSession(fetchedWeek.slice(0, 4), liveToday, 30);
  assert.equal(out.length, 4 + 3, "13:30, 14:30 and 15:00");
  assert.equal(out.at(-1)?.price, 336.05);
  assert.equal(new Date(out.at(-1)!.at).toISOString(), "2026-09-24T15:00:00.000Z");
});

/* The route ends every session it serves on an official-close point at the
   bell — today's too, once the bell has rung. The live session stops at the
   last trade before the bell, so after it the fetch is the better copy of
   today and must not be thrown away for the live one. */
test("after the bell, a fetched day that reaches its official close is kept over the live one", () => {
  const closedToday = [
    ...fetchedWeek.slice(0, 4),
    pt("2026-09-24T19:30:00Z", 336.4),
    pt("2026-09-24T20:00:00Z", 336.52),
  ];
  const liveAfterBell = [pt("2026-09-24T13:30:00Z", 336.1), pt("2026-09-24T19:59:00Z", 336.45)];
  assert.equal(withLiveSession(closedToday, liveAfterBell, 30), closedToday);
  assert.equal(withLiveSession(closedToday, liveAfterBell, 30, 1).length, 2, "still held to its size");
});

test("nothing live leaves the fetched series exactly as it was", () => {
  assert.equal(withLiveSession(fetchedWeek, [], 5), fetchedWeek);
});

test("a live session OLDER than the fetch is ignored rather than spliced in", () => {
  const yesterday = [pt("2026-09-23T15:00:00Z", 1)];
  assert.equal(withLiveSession(fetchedWeek, yesterday, 5), fetchedWeek);
});

test("the window stays its size: the live day pushes the oldest session out", () => {
  /* 1W is SEVEN trading days. Fetched before the open it is seven sessions
     ending yesterday; adding today's live session must not make it eight. */
  const seven = [
    "2026-09-14", "2026-09-15", "2026-09-16", "2026-09-17", "2026-09-18", "2026-09-21", "2026-09-22",
  ].map((d) => pt(`${d}T15:00:00Z`, 1));
  const out = withLiveSession(seven, [pt("2026-09-23T15:00:00Z", 2)], 5, 7);
  assert.equal(out.length, 7);
  assert.equal(new Date(out[0].at).toISOString(), "2026-09-15T15:00:00.000Z");
  assert.equal(out.at(-1)?.price, 2);
});

test("lastSessions counts New York days, not the reader's", () => {
  /* 01:00 in India on the 24th is 15:30 ET on the 23rd — one session. */
  const pts = [
    pt("2026-09-22T19:00:00Z", 1),
    pt("2026-09-23T13:30:00Z", 2),
    pt("2026-09-23T19:30:00Z", 3),
  ];
  assert.deepEqual(lastSessions(pts, 1).map((p) => p.price), [2, 3]);
  assert.equal(lastSessions(pts, 2), pts, "nothing to drop: the same array back");
});

/* ---------- which series the day chart draws ---------- */

const liveSession = [pt("2026-09-23T13:30:00Z", 339.0), pt("2026-09-23T19:59:00Z", 336.95)];
const fetchedPartial = [pt("2026-09-23T13:30:00Z", 339.0), pt("2026-09-23T19:40:00Z", 337.1)];
const fetchedClosed = [
  pt("2026-09-23T13:30:00Z", 339.0),
  pt("2026-09-23T19:59:00Z", 336.95),
  /* The route's official-close point, stamped at the bell. */
  pt("2026-09-23T20:00:00Z", 337.02),
];

test("with no live session the day chart is the fetched one", () => {
  assert.equal(pickDaySeries([], fetchedClosed), fetchedClosed);
  assert.equal(pickDaySeries([], []).length, 0);
});

test("during the session a fetch that reaches further is the day", () => {
  const fetchedAhead = [pt("2026-09-24T13:30:00Z", 1), pt("2026-09-24T14:31:00Z", 2)];
  const live = [pt("2026-09-24T13:30:00Z", 1), pt("2026-09-24T14:30:00Z", 3)];
  assert.equal(pickDaySeries(live, fetchedAhead), fetchedAhead);
});

test("after the bell, a fetched session that ends on the official close wins", () => {
  assert.equal(pickDaySeries(liveSession, fetchedClosed), fetchedClosed);
});

test("after the bell, a fetched session short of it is carried on by the live bars past its end", () => {
  const out = pickDaySeries(liveSession, fetchedPartial);
  assert.deepEqual(
    out.map((p) => p.price),
    [339.0, 337.1, 336.95],
    "the fetch to 15:40, then the live 15:59",
  );
});

test("a fetch of a newer session than the live one wins", () => {
  const next = [pt("2026-09-24T13:30:00Z", 1)];
  assert.equal(pickDaySeries(liveSession, next), next);
});

/* ---------- ending a finished session on its official close ---------- */

const buckets = [pt("2026-09-23T19:00:00Z", 337.4), pt("2026-09-23T19:30:00Z", 336.95)];
const afterBell = at("2026-09-24T10:00:00Z");

test("a finished session gains its official close at the bell", () => {
  const out = endOnClose(buckets, 337.02, afterBell);
  assert.equal(out.length, 3);
  assert.equal(new Date(out[2].at).toISOString(), "2026-09-23T20:00:00.000Z");
  assert.equal(out[2].price, 337.02);
  assert.equal(out[2].volume, null, "no volume is invented for it");
});

test("a point already at the bell is corrected to the official close, not duplicated", () => {
  const out = endOnClose([...buckets, pt("2026-09-23T20:00:00Z", 336.8)], 337.02, afterBell);
  assert.equal(out.length, 3);
  assert.equal(out[2].price, 337.02);
});

test("a session still running has no official close yet", () => {
  assert.equal(endOnClose(buckets, 337.02, at("2026-09-23T19:45:00Z")), buckets);
});

test("no close known, nothing added", () => {
  assert.equal(endOnClose(buckets, null, afterBell), buckets);
  assert.equal(endOnClose([], 337.02, afterBell).length, 0);
});

test("a half-day's close lands at 13:00", () => {
  const half = [pt("2026-11-27T17:30:00Z", 100)];
  const out = endOnClose(half, 101, at("2026-11-27T19:00:00Z"));
  assert.equal(new Date(out.at(-1)!.at).toISOString(), "2026-11-27T18:00:00.000Z");
});

test("a daily series takes the close as that day's bar, stamped at New York midnight", () => {
  const daily = [pt("2026-09-21T04:00:00Z", 338.98), pt("2026-09-22T04:00:00Z", 342.7)];
  const appended = endOnClose(daily, 337.02, afterBell, { daily: true, day: "2026-09-23" });
  assert.equal(appended.length, 3);
  assert.equal(new Date(appended[2].at).toISOString(), "2026-09-23T04:00:00.000Z");
  assert.equal(appended[2].price, 337.02);

  const corrected = endOnClose(daily, 339.75, afterBell, { daily: true, day: "2026-09-22" });
  assert.equal(corrected.length, 2);
  assert.equal(corrected[1].price, 339.75, "the same day's bar takes the official close");

  assert.equal(
    endOnClose(daily, 1, afterBell, { daily: true, day: "2026-09-18" }),
    daily,
    "a close for a day the series is already past is not spliced into its middle",
  );
});
