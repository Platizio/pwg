import test from "node:test";
import assert from "node:assert/strict";

import { dailyBarsFromAggs } from "../lib/api/normalize/daily-bars.ts";
import { parseFeedDate } from "../lib/api/normalize/time.ts";

/* The daily series every surface is built on.
 *
 * It came from /quotes/equity/historical, whose "price" is NOT the official
 * close. Measured 24 Sep 2026 for AAPL against Polygon's official bars:
 *
 *   date     gateway "close"   official close
 *   09/18    334.80            336.13
 *   09/21    340.04            338.98     (and a "low" of 250.12)
 *   09/22    342.70            339.75
 *   09/23    336.936           337.02
 *
 * The open, high and low matched Polygon to the cent; the close did not. So the
 * chart's PREV CLOSE line read 342.70 for a session whose true prior close was
 * 339.75, and every return, drawdown and indicator was measured off it. */

/* Polygon stamps a daily bar at New York midnight: 04:00Z in summer. */
const bar = (isoDay: string, o: number, h: number, l: number, c: number, v = 1000, tz = "04") => ({
  t: Date.parse(`${isoDay}T${tz}:00:00Z`), o, h, l, c, v,
});

test("the close is the official close, not whatever printed last", () => {
  const [d] = dailyBarsFromAggs([bar("2026-09-22", 340.135, 345.34, 338.75, 339.75)], Date.parse("2026-09-24T09:00:00Z"));
  assert.equal(d.price, 339.75);
  assert.equal(d.opening, 340.135);
  assert.equal(d.high, 345.34);
  assert.equal(d.low, 338.75);
});

/* Every consumer parses the feed's "MM/DD/YYYY HH:MM:SS ZZZ" with
   parseFeedDate, so the new source must write exactly that — and land on the
   same Eastern midnight the old one did. */
test("dates are written in the feed's own format and parse to Eastern midnight", () => {
  /* Returned oldest first, so January precedes September. */
  const [winter, summer] = dailyBarsFromAggs(
    [bar("2026-09-22", 1, 1, 1, 1), bar("2026-01-21", 1, 1, 1, 1, 1000, "05")],
    Date.parse("2026-09-24T09:00:00Z"),
  );
  assert.equal(winter.date, "01/21/2026 00:00:00 EST");
  assert.equal(summer.date, "09/22/2026 00:00:00 EDT");
  assert.equal(parseFeedDate(summer.date), Date.parse("2026-09-22T04:00:00Z"));
  assert.equal(parseFeedDate(winter.date), Date.parse("2026-01-21T05:00:00Z"));
});

/* Today's bar is always left out: "the last daily bar" is read as the last
   COMPLETED session, and because these fetches are cached, a response taken
   mid-afternoon and served after the bell would carry a stale close. */
test("today's bar is left out, before the bell and after it", () => {
  const bars = [bar("2026-09-23", 1, 1, 1, 337.02), bar("2026-09-24", 336.79, 336.79, 334.9, 335.82)];
  for (const now of [Date.parse("2026-09-24T09:11:00Z"), Date.parse("2026-09-24T20:05:00Z")]) {
    assert.deepEqual(dailyBarsFromAggs(bars, now).map((b) => b.price), [337.02]);
  }
  /* And the next day, yesterday's bar is history like any other. */
  assert.deepEqual(
    dailyBarsFromAggs(bars, Date.parse("2026-09-25T09:00:00Z")).map((b) => b.price),
    [337.02, 335.82],
  );
});

test("oldest first, and bars without a usable close are dropped", () => {
  const out = dailyBarsFromAggs(
    [bar("2026-09-22", 1, 1, 1, 2), bar("2026-09-21", 1, 1, 1, 1), { t: Date.parse("2026-09-18T04:00:00Z"), o: 1, h: 1, l: 1, c: Number.NaN }],
    Date.parse("2026-09-24T09:00:00Z"),
  );
  assert.deepEqual(out.map((b) => b.price), [1, 2]);
});
