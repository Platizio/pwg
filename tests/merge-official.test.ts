import test from "node:test";
import assert from "node:assert/strict";

import { mergeOfficial } from "../lib/api/normalize/daily-bars.ts";

/* Two sources, each wrong in its own way, measured 24 Sep 2026.
 *
 * The gateway's /historical knows WHICH COMPANY a ticker was on each date —
 * META in Sep 2021 is Facebook at 352.96 — but its daily "price" is not the
 * official close (AAPL 22 Sep: 342.70 against 339.75).
 *
 * Polygon has the official closes, but its per-ticker history follows the
 * TICKER: META from Sep 2021 to Jan 2022 is the Roundhill metaverse ETF that
 * held the symbol then, at $14.99, joined to Facebook's prices after a gap.
 *
 * So the gateway's series is the skeleton, and each date takes Polygon's bar
 * only where the two plainly describe the same security. */

const gw = (mdy: string, price: number, open: number | null = price) => ({
  date: `${mdy} 00:00:00 EDT`, price, opening: open, high: Math.max(price, open ?? price), low: Math.min(price, open ?? price), volume: 1,
});
/* Polygon stamps a daily bar at midnight ET: 04:00Z in summer, 05:00Z in winter. */
const pg = (isoDay: string, o: number, h: number, l: number, c: number, utcHour = 4) => ({
  t: Date.parse(`${isoDay}T0${utcHour}:00:00Z`), o, h, l, c, v: 1000,
});
const NOW = Date.parse("2026-09-24T09:00:00Z");

test("the same security takes Polygon's official bar", () => {
  const [d] = mergeOfficial([gw("09/22/2026", 342.7, 339.84)], [pg("2026-09-22", 340.135, 345.34, 338.75, 339.75)], NOW);
  assert.equal(d.price, 339.75);
  assert.equal(d.opening, 340.135);
  assert.equal(d.high, 345.34);
  assert.equal(d.low, 338.75);
  assert.equal(d.date, "09/22/2026 00:00:00 EDT", "Polygon's own stamp, whose offset is that date's");
});

test("a ticker that belonged to another security keeps the gateway's bar", () => {
  const [d] = mergeOfficial([gw("09/24/2021", 352.96, 351.0)], [pg("2021-09-24", 15.1, 15.2, 14.9, 14.99)], NOW);
  assert.equal(d.price, 352.96, "Facebook, not the ETF that held the ticker");
});

/* On an earnings day the after-hours last can sit far from the official
   close, but the regular-session OPEN is the same on both sides. */
test("an earnings day still matches on the open", () => {
  const [d] = mergeOfficial([gw("07/30/2026", 150, 200)], [pg("2026-07-30", 200.5, 205, 198, 201)], NOW);
  assert.equal(d.price, 201);
});

test("dates Polygon lacks keep the gateway's bar", () => {
  const out = mergeOfficial([gw("09/21/2026", 340.04, 339.62), gw("09/22/2026", 342.7, 339.84)], [pg("2026-09-22", 340.135, 345.34, 338.75, 339.75)], NOW);
  assert.deepEqual(out.map((b) => b.price), [340.04, 339.75]);
});

/* Polygon has phantom prints too: VZ on 8 Jan 2026 carries a low of 10.60
   against a VWAP of 40.54. A wick more than half-way below the body is not a
   price anybody paid; it becomes "no figure" rather than a crash. */
test("an impossible wick is dropped, from either source", () => {
  const [a] = mergeOfficial([gw("01/08/2026", 40.57, 40.17)], [pg("2026-01-08", 40.17, 40.73, 10.5999, 40.57, 5)], NOW);
  assert.equal(a.low, 40.17, "the gateway's low stands in for Polygon's bad print");
  assert.equal(a.high, 40.73, "a sane wick survives");
  const [alone] = mergeOfficial([], [pg("2026-01-08", 40.17, 40.73, 10.5999, 40.57, 5)], NOW);
  assert.equal(alone.low, null, "with nothing to borrow, an impossible wick is no figure");
  const [b] = mergeOfficial([{ ...gw("09/21/2026", 100, 100), low: 40, high: 260 }], [], NOW);
  assert.equal(b.low, null);
  assert.equal(b.high, null);
});

test("today's partial bar is left out", () => {
  const out = mergeOfficial([gw("09/23/2026", 337.02), gw("09/24/2026", 335.82)], [], NOW);
  assert.deepEqual(out.map((b) => b.date.slice(0, 10)), ["09/23/2026"]);
});

test("with no gateway series at all, Polygon's bars stand alone", () => {
  const out = mergeOfficial([], [pg("2026-09-22", 340.135, 345.34, 338.75, 339.75)], NOW);
  assert.equal(out.length, 1);
  assert.equal(out[0].price, 339.75);
});

test("sessions the gateway has not published yet come from Polygon", () => {
  // Measured 24 Sep 2026: /historical ended on the 22nd; Polygon had the 23rd.
  const out = mergeOfficial(
    [gw("09/21/2026", 340.2), gw("09/22/2026", 342.7, 339.84)],
    [pg("2026-09-21", 340, 341, 339, 340.04), pg("2026-09-22", 340.135, 345.34, 338.75, 339.75), pg("2026-09-23", 341.075, 342, 336, 337.02)],
    NOW,
  );
  assert.deepEqual(out.map((p) => p.price), [340.04, 339.75, 337.02]);
  assert.equal(out[2].date, "09/23/2026 00:00:00 EDT");
});

test("a reused ticker's own sessions are not spliced into the company's", () => {
  const out = mergeOfficial(
    [gw("09/24/2021", 352.96, 343.24), gw("09/28/2021", 340.65, 347)],
    [pg("2021-09-24", 14.8, 15, 14.7, 14.91), pg("2021-09-27", 14.9, 15.1, 14.8, 15), pg("2021-09-28", 15, 15.2, 14.9, 15.1)],
    NOW,
  );
  assert.deepEqual(out.map((p) => p.price), [352.96, 340.65]);
});

/* The gateway's five years start a session late for a calendar-anchored
   return: measured 24 Sep 2026, AAPL's /historical?range=5y began on
   2021-09-24, the day AFTER the 5Y anchor for a series ending 2026-09-23,
   while Polygon's request reaches back ten days further. When the gateway's
   first day is plainly the same security as Polygon's, Polygon's sessions
   before it are that security too and lead the series. */
test("Polygon's days before the gateway's first lead it when the first day is the same security", () => {
  const out = mergeOfficial(
    [gw("09/22/2026", 342.7, 339.84)],
    [pg("2026-09-21", 340, 341, 339, 340.04), pg("2026-09-22", 340.135, 345.34, 338.75, 339.75)],
    NOW,
  );
  assert.deepEqual(out.map((p) => p.price), [340.04, 339.75]);
});

test("Polygon's days before the gateway's first are not added when the first day is another security", () => {
  // META: Polygon's 2021 history is the ETF that held the ticker.
  const out = mergeOfficial(
    [gw("09/24/2021", 352.96, 343.24)],
    [pg("2021-09-22", 14.6, 14.8, 14.5, 14.7), pg("2021-09-23", 14.7, 14.9, 14.6, 14.8), pg("2021-09-24", 14.8, 15, 14.7, 14.91)],
    NOW,
  );
  assert.deepEqual(out.map((p) => p.price), [352.96]);
});

test("the walk back before the gateway's first stops at a jump no one session makes", () => {
  // A ticker that changed hands a few sessions before the gateway's window:
  // the older bar is 11x away from the session after it, so it is not led in.
  const out = mergeOfficial(
    [gw("09/22/2026", 342.7, 339.84)],
    [
      pg("2026-09-17", 30, 31, 29, 30.5),
      pg("2026-09-18", 339, 342, 338, 341),
      pg("2026-09-21", 340, 341, 339, 340.04),
      pg("2026-09-22", 340.135, 345.34, 338.75, 339.75),
    ],
    NOW,
  );
  assert.deepEqual(out.map((p) => p.price), [341, 340.04, 339.75]);
});

test("nothing leads a gateway series whose first real day Polygon lacks", () => {
  const out = mergeOfficial(
    [gw("09/21/2026", 340.2, 339.9), gw("09/22/2026", 342.7, 339.84)],
    [pg("2026-09-18", 339, 342, 338, 341), pg("2026-09-22", 340.135, 345.34, 338.75, 339.75)],
    NOW,
  );
  assert.deepEqual(out.map((p) => p.price), [340.2, 339.75]);
});

test("the output is oldest first whatever order the gateway sent", () => {
  const out = mergeOfficial([gw("09/22/2026", 342.7, 339.84), gw("09/21/2026", 340.2)], [], NOW);
  assert.deepEqual(out.map((p) => p.price), [340.2, 342.7]);
});

test("Polygon's wick stands unless the gateway's shows it is a bad print", () => {
  // Polygon's NVDA bar for 10 Jun 2024 has a 195.95 high on a ~$121 day.
  const [a] = mergeOfficial(
    [{ ...gw("06/10/2024", 121.79, 120.37), high: 123.1, low: 117.01 }],
    [pg("2024-06-10", 120.37, 195.95, 117.01, 121.79)],
    NOW,
  );
  assert.equal(a.high, 123.1);
  assert.equal(a.low, 117.01);
  // An ordinary day keeps Polygon's official range, wider or not.
  const [b] = mergeOfficial(
    [{ ...gw("09/22/2026", 342.7, 339.84), high: 342.9, low: 339.5 }],
    [pg("2026-09-22", 340.135, 345.34, 338.75, 339.75)],
    NOW,
  );
  assert.equal(b.high, 345.34);
  assert.equal(b.low, 338.75);
  // And the gateway's own bad low (250.12) never displaces Polygon's.
  const [c] = mergeOfficial(
    [{ ...gw("09/21/2026", 339.1, 335.28), high: 339.64, low: 250.12 }],
    [pg("2026-09-21", 335.28, 339.64, 333.05, 338.98)],
    NOW,
  );
  assert.equal(c.low, 333.05);
});

test("a borrowed wick never cuts inside the official bar's body", () => {
  const [a] = mergeOfficial(
    [{ ...gw("06/10/2024", 121.79, 120.37), high: 100, low: 150 }],
    [pg("2024-06-10", 120.37, 195.95, 60, 121.79)],
    NOW,
  );
  assert.ok(a.high === null || a.high >= 121.79, `high ${a.high} under the body`);
  assert.ok(a.low === null || a.low <= 120.37, `low ${a.low} over the body`);
});

test("the gateway's holiday rows are dropped", () => {
  // Measured 24 Sep 2026: /historical emits a row on every exchange holiday
  // since Sep 2024 that repeats the session before (AAPL: 21 of them in 5y).
  const out = mergeOfficial(
    [gw("11/26/2025", 277.9, 276.96), gw("11/27/2025", 277.9, 276.96), gw("11/28/2025", 278.85, 277.26)],
    [pg("2025-11-26", 276.96, 279.53, 276.63, 277.55, 5), pg("2025-11-28", 277.26, 279, 275.99, 278.85, 5)],
    NOW,
  );
  assert.deepEqual(out.map((p) => p.date.slice(0, 10)), ["11/26/2025", "11/28/2025"]);
});

test("a gateway-only day inside a stretch Polygon covers is a day nothing traded", () => {
  // 2023 predates the holiday list; Polygon has every day the security traded.
  const out = mergeOfficial(
    [gw("07/03/2023", 192.46, 193.78), gw("07/04/2023", 192.46, 193.78), gw("07/05/2023", 191.33, 191.57)],
    [pg("2023-07-03", 193.78, 193.88, 191.76, 192.46), pg("2023-07-05", 191.57, 192.98, 190.62, 191.33)],
    NOW,
  );
  assert.deepEqual(out.map((p) => p.date.slice(0, 10)), ["07/03/2023", "07/05/2023"]);
});

test("while the ticker belonged to someone else, the gateway's own days all stand", () => {
  const out = mergeOfficial(
    [gw("09/23/2021", 345.96, 347), gw("09/24/2021", 352.96, 343.24), gw("09/27/2021", 353.58, 350)],
    [pg("2021-09-23", 14.7, 14.9, 14.6, 14.8), pg("2021-09-27", 15, 15.1, 14.9, 15)],
    NOW,
  );
  assert.deepEqual(out.map((p) => p.price), [345.96, 352.96, 353.58]);
});
