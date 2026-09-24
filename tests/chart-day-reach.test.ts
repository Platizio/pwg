import test from "node:test";
import assert from "node:assert/strict";

import {
  coversSessions,
  easternDayOf,
  endOnClose,
  pickDaySeries,
  regularSessionOnly,
  sessionTick,
  withLiveSession,
  withTick,
} from "../lib/market/regular-session.ts";
import { liveTail } from "../lib/market/chart-tail.ts";
import { tradingDays } from "../lib/market/session-window.ts";

/* Which copy of today a chart draws, and where the live tick joins it.
 *
 * Measured 24 Sep 2026 at 06:44-06:55 ET: the gateway's live /intraday had
 * AAPL through 06:22-06:34 and SPY through 06:24-06:35 (20-22 minutes behind),
 * while Polygon's 1-minute aggregates had all three names through 06:41-06:54
 * (about 1.5 minutes behind). The day chart preferred the gateway whenever it
 * had anything, so at 09:30 ET — when its only regular-session point was the
 * websocket tick — the whole day chart was that one point, and all session it
 * drew a series twenty minutes old with one straight line up to the tick. */

const ET = (iso: string) => Date.parse(iso); // pass explicit offsets
const pt = (at: number, price: number) => ({
  at,
  price,
  open: price,
  high: price,
  low: price,
  volume: 1,
});

/** One point a minute from `from` to `to`, exclusive. */
function minutes(from: string, to: string, price = 336) {
  const out = [];
  for (let t = ET(from); t < ET(to); t += 60_000) out.push(pt(t, price));
  return out;
}

/* The composition instrument-view.tsx runs for 1D: the choice first, over real
   bars only, then the finished session's close, then the tick. */
function dayChart(
  gateway: ReturnType<typeof minutes>,
  fetched: ReturnType<typeof minutes>,
  tick: { at: number; price: number } | null,
  close: number | null = null,
) {
  const liveBars = regularSessionOnly(gateway, { close: "exclude" });
  const chosen = pickDaySeries(liveBars, fetched);
  const fromStore = chosen !== liveBars && chosen.length > 0;
  const ended = fromStore ? endOnClose(chosen, close, Number.POSITIVE_INFINITY) : chosen;
  return { series: liveTail(ended as ReturnType<typeof minutes>, sessionTick(tick)), fromStore };
}

/* Yesterday as the route serves it: every minute, then the official close
   stamped at the bell. */
const yesterday = [
  ...minutes("2026-09-23T09:30:00-04:00", "2026-09-23T16:00:00-04:00", 337),
  pt(ET("2026-09-23T16:00:00-04:00"), 337.02),
];

test("the open: a live session made only of the tick does not replace the fetched one", () => {
  /* 09:30:05 ET. The gateway still ends at 09:08, all of it pre-market. */
  const gateway = minutes("2026-09-24T04:00:00-04:00", "2026-09-24T09:09:00-04:00");
  const tick = { price: 337.5, at: ET("2026-09-24T09:30:04-04:00") };
  const { series, fromStore } = dayChart(gateway, yesterday, tick);
  assert.equal(fromStore, true);
  assert.equal(series.length, yesterday.length, "the whole last session, not one point");
  assert.equal(series.at(-1)?.price, 337.02, "ending on its official close");
  assert.equal(easternDayOf(series.at(-1)!.at), "2026-09-23", "and not bridged 17 hours to today's tick");
});

test("during the session the fetch that reaches further is the day, and the tick joins IT", () => {
  /* 10:26 ET: Polygon's minutes through 10:20, the gateway's through 10:05. */
  const fetched = minutes("2026-09-24T09:30:00-04:00", "2026-09-24T10:21:00-04:00", 338);
  const gateway = minutes("2026-09-24T04:00:00-04:00", "2026-09-24T10:06:00-04:00", 336);
  const tick = { price: 338.4, at: ET("2026-09-24T10:26:10-04:00") };
  const { series, fromStore } = dayChart(gateway, fetched, tick);
  assert.equal(fromStore, true);
  assert.equal(series.length, fetched.length + 1);
  assert.equal(series.at(-2)?.at, ET("2026-09-24T10:20:00-04:00"), "Polygon's 10:20, not the gateway's 10:05");
  assert.equal(series.at(-1)?.price, 338.4, "ending on the live price");
});

test("one session in both copies: the fetched one, carried on by the live bars past its end", () => {
  const fetched = minutes("2026-09-24T09:30:00-04:00", "2026-09-24T10:00:00-04:00", 338);
  const live = minutes("2026-09-24T09:30:00-04:00", "2026-09-24T10:03:00-04:00", 336);
  const out = pickDaySeries(live, fetched);
  assert.equal(out.length, 33);
  assert.equal(out[29].price, 338, "the fetched minutes stand where both have one");
  assert.equal(out[30].price, 336, "then the live minutes the fetch had not reached");
  assert.equal(pickDaySeries(live.slice(0, 20), fetched), fetched, "nothing newer: the fetched array itself");
});

test("a live session of a newer day than the fetch is the day", () => {
  const live = minutes("2026-09-24T09:30:00-04:00", "2026-09-24T09:33:00-04:00");
  assert.equal(pickDaySeries(live, yesterday), live);
});

test("the bell: a fetch short of its close still beats the lagging live series", () => {
  /* 16:00:30 ET: gateway rows to 15:38, Polygon to 15:58, no 16:00 bar yet. */
  const gateway = minutes("2026-09-24T09:30:00-04:00", "2026-09-24T15:39:00-04:00", 336);
  const fetched = minutes("2026-09-24T09:30:00-04:00", "2026-09-24T15:59:00-04:00", 338);
  const tick = { price: 338.2, at: ET("2026-09-24T16:00:25-04:00") };
  const { series } = dayChart(gateway, fetched, tick);
  assert.equal(series.at(-1)?.at, ET("2026-09-24T15:58:00-04:00"), "ends at 15:58, not 15:38");
  assert.equal(series.at(-1)?.price, 338, "and a post-market tick does not join the session");
});

test("after the bell a post-market tick never overwrites the official close", () => {
  const closed = [
    ...minutes("2026-09-24T15:50:00-04:00", "2026-09-24T16:00:00-04:00", 338),
    pt(ET("2026-09-24T16:00:00-04:00"), 338.11),
  ];
  const tick = { price: 339.9, at: ET("2026-09-24T16:00:40-04:00") };
  const { series } = dayChart([], closed, tick);
  assert.equal(series.at(-1)?.price, 338.11);
});

/* ---------- the tick itself ---------- */

test("only a regular-session tick is drawn: pre-market, the bell and after are prices, not session", () => {
  const tick = (iso: string) => ({ price: 1, at: ET(iso) });
  assert.equal(sessionTick(tick("2026-09-24T09:29:59-04:00")), null);
  assert.ok(sessionTick(tick("2026-09-24T09:30:00-04:00")));
  assert.ok(sessionTick(tick("2026-09-24T15:59:59-04:00")));
  assert.equal(sessionTick(tick("2026-09-24T16:00:00-04:00")), null);
  assert.equal(sessionTick(tick("2026-11-27T13:00:05-05:00")), null, "a half-day's bell is 13:00");
  assert.equal(sessionTick(null), null);
  assert.equal(sessionTick({ price: 0, at: ET("2026-09-24T10:00:00-04:00") }), null);
});

test("withTick: the tick is today's newest point, even as the only one", () => {
  const tick = { price: 337.5, at: ET("2026-09-24T09:30:04-04:00") };
  assert.deepEqual(
    withTick([], tick).map((p) => [p.at, p.price]),
    [[tick.at, 337.5]],
    "the long ranges get today's first price at the open",
  );
  const bars = minutes("2026-09-24T09:30:00-04:00", "2026-09-24T09:32:00-04:00");
  const same = withTick(bars, { price: 336.9, at: ET("2026-09-24T09:31:20-04:00") });
  assert.equal(same.length, 2, "inside the last minute: that minute moves");
  assert.equal(same.at(-1)?.price, 336.9);
  assert.equal(withTick(bars, null), bars);
  assert.equal(withTick(bars, { price: 1, at: bars[0].at }), bars, "never backwards");
});

/* ---------- the long ranges ---------- */

test("the long ranges keep the fetch's own copy of today and add only what is past it", () => {
  const week = [
    ...minutes("2026-09-23T09:30:00-04:00", "2026-09-23T09:40:00-04:00", 339),
    /* Polygon's five-minute buckets for today, through 10:15. */
    pt(ET("2026-09-24T09:30:00-04:00"), 338.0),
    pt(ET("2026-09-24T10:15:00-04:00"), 338.3),
  ];
  const live = [
    ...minutes("2026-09-24T09:30:00-04:00", "2026-09-24T09:56:00-04:00", 336),
    { ...pt(ET("2026-09-24T10:26:10-04:00"), 338.4), volume: null },
  ];
  const out = withLiveSession(week, live, 5);
  assert.deepEqual(
    out.slice(-3).map((p) => [new Date(p.at).toISOString(), p.price]),
    [
      ["2026-09-24T13:30:00.000Z", 338.0],
      ["2026-09-24T14:15:00.000Z", 338.3],
      ["2026-09-24T14:25:00.000Z", 338.4],
    ],
    "Polygon's 10:15 stands; the gateway's older minutes do not replace it",
  );
});

/* ---------- is the week a week ---------- */

test("the open: six fetched sessions and a running today are a whole week", () => {
  const now = ET("2026-09-24T09:30:10-04:00");
  const days = tradingDays(now, 7);
  assert.equal(days.at(-1), "2026-09-24");
  /* What the route can serve at 09:30: every window day but today. */
  const six = days.slice(0, -1).flatMap((d) => [
    pt(ET(`${d}T09:30:00-04:00`), 1),
    pt(ET(`${d}T16:00:00-04:00`), 1),
  ]);
  assert.equal(coversSessions(six, 7, "2026-09-24"), true, "today counts: it is running");
  assert.equal(coversSessions(six, 7, null), false, "with no session running, six are six");
  assert.equal(coversSessions(six.slice(2), 7, "2026-09-24"), false, "five and today are not a week");
  assert.equal(
    coversSessions([...six, pt(ET("2026-09-24T09:30:04-04:00"), 1)], 7, "2026-09-24"),
    true,
    "and today is not counted twice once it has a point",
  );
});
