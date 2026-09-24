import test from "node:test";
import assert from "node:assert/strict";

import { closingBell, dailySpan, officialClose, officialCloses } from "../lib/market/official-close.ts";

/* "What was the official close of New York day D?"
 *
 * Two sources answer it, and each is right only some of the time (measured
 * 24 Sep 2026, AAPL, through the gateway's Polygon proxy):
 *
 *   - A PAST day's daily bar is the official close: 338.98 (21 Sep), 339.75
 *     (22 Sep), 337.02 (23 Sep). Daily bars are stamped at Eastern midnight —
 *     04:00Z in summer, 05:00Z in winter — so a day is found by its Eastern
 *     date, never by position: the last bar in the answer is TODAY's running
 *     bar (336.158 at 06:00 ET on the 24th, 2,318 pre-market trades).
 *   - TODAY's daily bar is an all-hours running bar, so after the bell its
 *     close is a post-market trade. The official close is the open of the bar
 *     that starts exactly at the bell (the closing cross): 337.02 on 23 Sep at
 *     every width — 1, 5, 15 and 30 minutes.
 *
 * Fixtures below are the real bars, trimmed to the fields the helper reads.
 */

const daily = (iso: string, c: number, o = c) => ({ t: Date.parse(iso), o, h: c, l: c, c, v: 1 });

/* AAPL's daily answer for 21-24 Sep 2026, as it came back at 06:00 ET on the
   24th: summer stamps at 04:00Z, today's running bar last. */
const AAPL_DAILY = [
  daily("2026-09-21T04:00:00Z", 338.98, 335.28),
  daily("2026-09-22T04:00:00Z", 339.75, 340.135),
  daily("2026-09-23T04:00:00Z", 337.02, 341.075),
  daily("2026-09-24T04:00:00Z", 336.158, 336.794),
];

const bar = (iso: string, o: number, c: number) => ({ t: Date.parse(iso), o, h: Math.max(o, c), l: Math.min(o, c), c, v: 1 });

/* 23 Sep 2026 around the bell, one-minute bars (EDT: 16:00 ET = 20:00Z). */
const AAPL_SEP23_MINUTES = [
  bar("2026-09-23T19:58:00Z", 336.85, 336.88),
  bar("2026-09-23T19:59:00Z", 336.86, 336.95), // 15:59, the last continuous trade
  bar("2026-09-23T20:00:00Z", 337.02, 336.88), // 16:00, opens on the closing cross
  bar("2026-09-23T20:01:00Z", 336.7008, 336.77),
  bar("2026-09-23T23:59:00Z", 336.9, 336.91), // 19:59, the last post-market print
];

const ET = (iso: string) => Date.parse(iso);

/* ---------- the bell ---------- */

test("the bell is 16:00 New York: 20:00Z in summer, 21:00Z in winter", () => {
  assert.equal(closingBell("2026-09-23"), ET("2026-09-23T20:00:00Z"));
  assert.equal(closingBell("2026-01-21"), ET("2026-01-21T21:00:00Z"));
});

test("on a half-day the bell is 13:00 New York", () => {
  // Fri 27 Nov 2026, the day after Thanksgiving: EST, 13:00 ET = 18:00Z.
  assert.equal(closingBell("2026-11-27"), ET("2026-11-27T18:00:00Z"));
  // Thu 3 Jul 2025, before Independence Day: EDT, 13:00 ET = 17:00Z.
  assert.equal(closingBell("2025-07-03"), ET("2025-07-03T17:00:00Z"));
});

test("something that is not a date has no bell", () => {
  assert.equal(closingBell("23/09/2026"), null);
  assert.equal(closingBell(""), null);
});

/* ---------- a past day ---------- */

const PRE_MARKET_24 = ET("2026-09-24T10:00:00Z"); // 06:00 ET, Thu 24 Sep

test("a past day's close is its own daily bar, found by date rather than position", () => {
  assert.equal(officialClose("2026-09-23", AAPL_DAILY, [], PRE_MARKET_24), 337.02);
  assert.equal(officialClose("2026-09-22", AAPL_DAILY, [], PRE_MARKET_24), 339.75);
  assert.equal(officialClose("2026-09-21", AAPL_DAILY, [], PRE_MARKET_24), 338.98);
});

test("the order the bars arrive in does not matter", () => {
  const shuffled = [AAPL_DAILY[3], AAPL_DAILY[1], AAPL_DAILY[2], AAPL_DAILY[0]];
  assert.equal(officialClose("2026-09-23", shuffled, [], PRE_MARKET_24), 337.02);
});

test("winter daily bars are stamped at 05:00Z and still belong to their own day", () => {
  const winter = [daily("2026-01-20T05:00:00Z", 246.7), daily("2026-01-21T05:00:00Z", 247.65)];
  const now = ET("2026-01-22T15:00:00Z");
  assert.equal(officialClose("2026-01-21", winter, [], now), 247.65);
  assert.equal(officialClose("2026-01-20", winter, [], now), 246.7);
});

test("a past day with no daily bar has no close", () => {
  assert.equal(officialClose("2026-09-18", AAPL_DAILY, AAPL_SEP23_MINUTES, PRE_MARKET_24), null);
});

test("a day in the future has no close", () => {
  assert.equal(officialClose("2026-09-25", AAPL_DAILY, [], PRE_MARKET_24), null);
});

/* The daily bar of a day that has just ended is still RUNNING until Polygon
   finalizes it: its close is whatever printed last in post-market. That is
   recognisable without knowing when finalization happens — the bar's close IS
   the day's last post-bell trade and NOT the closing cross — and the cross is
   then the better answer. */
test("a past day whose daily bar is still running ends on the closing cross", () => {
  const running = [daily("2026-09-23T04:00:00Z", 336.91, 341.075)];
  assert.equal(officialClose("2026-09-23", running, AAPL_SEP23_MINUTES, PRE_MARKET_24), 337.02);
});

/* The check above can only misfire where a FINALIZED close happens to equal
   the last post-market print — MSFT on 20 Aug 2026: 481.15 both, with the
   cross at 481.32. Once of 360 sessions measured, and it is confined to the day
   after the bell, the only time a daily bar can still be running. */
test("a day more than a day past its bell always takes its daily bar", () => {
  const finalized = [daily("2026-08-20T04:00:00Z", 481.15)];
  const minutes = [bar("2026-08-20T20:00:00Z", 481.32, 481.2), bar("2026-08-20T23:55:00Z", 481.1, 481.15)];
  assert.equal(officialClose("2026-08-20", finalized, minutes, ET("2026-08-21T10:00:00Z")), 481.32, "06:00 the next morning");
  assert.equal(officialClose("2026-08-20", finalized, minutes, ET("2026-08-21T20:00:00Z")), 481.15, "a day on");
  assert.equal(officialClose("2026-08-20", finalized, minutes, ET("2026-09-24T10:00:00Z")), 481.15, "a month on");
});

test("a finalized daily bar is trusted over the cross even when they differ", () => {
  /* SPY's cross sits a few cents off its official close; the daily bar wins
     whenever it is not simply the last post-market trade. */
  const spyDaily = [daily("2026-09-23T04:00:00Z", 661.1)];
  const spyMinutes = [bar("2026-09-23T20:00:00Z", 661.14, 661.05), bar("2026-09-23T23:59:00Z", 661.2, 661.22)];
  assert.equal(officialClose("2026-09-23", spyDaily, spyMinutes, PRE_MARKET_24), 661.1);
});

test("when the daily request failed, a past day falls back to its closing cross", () => {
  assert.equal(officialClose("2026-09-23", null, AAPL_SEP23_MINUTES, PRE_MARKET_24), 337.02);
  assert.equal(officialClose("2026-09-23", null, [], PRE_MARKET_24), null);
});

/* ---------- today ---------- */

test("today before the bell has no close, whatever the running bar says", () => {
  const at1500 = ET("2026-09-23T19:00:00Z"); // 15:00 ET on the 23rd
  assert.equal(officialClose("2026-09-23", AAPL_DAILY, AAPL_SEP23_MINUTES, at1500), null);
});

test("today after the bell closes on the bell bar's open, never the running bar's close", () => {
  const at1630 = ET("2026-09-23T20:30:00Z");
  const runningToday = [daily("2026-09-23T04:00:00Z", 336.77, 341.075)];
  assert.equal(officialClose("2026-09-23", runningToday, AAPL_SEP23_MINUTES, at1630), 337.02);
});

test("today after the bell with no bell bar yet has no close", () => {
  const at1630 = ET("2026-09-23T20:30:00Z");
  const beforeBell = AAPL_SEP23_MINUTES.slice(0, 2);
  assert.equal(officialClose("2026-09-23", AAPL_DAILY, beforeBell, at1630), null);
});

test("any bar width works: a bar that starts at the bell opens on the cross", () => {
  const at1700 = ET("2026-09-23T21:00:00Z");
  const thirty = [bar("2026-09-23T19:30:00Z", 336.33, 336.95), bar("2026-09-23T20:00:00Z", 337.02, 336.8308)];
  assert.equal(officialClose("2026-09-23", [], thirty, at1700), 337.02);
});

test("on a half-day today closes at 13:00, on the bar that starts then", () => {
  // Fri 27 Nov 2026, EST: 13:00 ET = 18:00Z.
  const minutes = [bar("2026-11-27T17:59:00Z", 278.89, 278.86), bar("2026-11-27T18:00:00Z", 278.85, 278.84)];
  assert.equal(officialClose("2026-11-27", [], minutes, ET("2026-11-27T17:30:00Z")), null, "12:30 ET");
  assert.equal(officialClose("2026-11-27", [], minutes, ET("2026-11-27T18:30:00Z")), 278.85, "13:30 ET");
});

/* ---------- several days at once ---------- */

test("closes for a window of days, only where there is one", () => {
  const at1630 = ET("2026-09-23T20:30:00Z");
  const running = [...AAPL_DAILY.slice(0, 2), daily("2026-09-23T04:00:00Z", 336.77, 341.075)];
  const closes = officialCloses(["2026-09-18", "2026-09-21", "2026-09-22", "2026-09-23"], running, AAPL_SEP23_MINUTES, at1630);
  assert.deepEqual([...closes.entries()], [
    ["2026-09-21", 338.98],
    ["2026-09-22", 339.75],
    ["2026-09-23", 337.02],
  ]);
});

/* Polygon reads a daily request's from/to as Eastern DATES. Noon UTC is the
   same calendar date in New York all year (07:00 or 08:00 there), so the span
   asks for exactly the window's first and last days. */
test("the daily request spans the window's first and last Eastern dates", () => {
  assert.deepEqual(dailySpan(["2026-09-14", "2026-09-23"]), {
    fromMs: ET("2026-09-14T12:00:00Z"),
    toMs: ET("2026-09-23T12:00:00Z"),
  });
  assert.equal(dailySpan([]), null);
});
