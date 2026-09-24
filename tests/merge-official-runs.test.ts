import test from "node:test";
import assert from "node:assert/strict";

import { mergeOfficial, settleHistory, sinceLastSeam } from "../lib/api/normalize/daily-bars.ts";
import { parseFeedDate } from "../lib/api/normalize/time.ts";

/* The merge judged by RUNS of days, not one day at a time.
 *
 * Every row below is a real one, measured 24 Sep 2026: the gateway's
 * /historical row and Polygon's official daily bar for the same date. */

const gw = (mdy: string, price: number, open: number, high: number, low: number) => ({
  date: `${mdy} 00:00:00 EDT`, // the gateway stamps every row EDT, winter included
  price,
  opening: open,
  high,
  low,
  volume: 1,
});
/* Polygon stamps a daily bar at midnight ET: 04:00Z in summer, 05:00Z in winter. */
const pg = (isoDay: string, o: number, h: number, l: number, c: number, utcHour: number) => ({
  t: Date.parse(`${isoDay}T0${utcHour}:00:00Z`),
  o,
  h,
  l,
  c,
  v: 1000,
});
const NOW = Date.parse("2026-09-24T09:00:00Z");
const closes = (bars: { price: number }[]) => bars.map((b) => b.price);

/* NOW split 5-for-1 on 18 Dec 2025. The gateway never applied it: its rows up
   to the 16th are in the old share count, five times Polygon's adjusted bars,
   so every one of them failed the 15% test and its own (not official) close
   was kept — the 1Y return read -26.28% against a true -24.12%. */
const NOW_GW = [
  gw("12/11/2025", 866.14, 870.06, 873.62, 865.322),
  gw("12/12/2025", 864.25, 867.39, 874.63, 857.91),
  gw("12/15/2025", 769.88, 769, 777.78, 765.2),
  gw("12/16/2025", 783.05, 784.32, 792.839, 780.11),
  gw("12/17/2025", 157.48, 158.6, 158.6, 154.001),
  gw("12/18/2025", 152.57, 154, 157.5, 152.5),
  gw("12/19/2025", 155.96, 152.97, 156.16, 152.54),
  gw("12/22/2025", 156.5, 155.77, 157.41, 152.6),
];
const NOW_PG = [
  pg("2025-12-11", 170.6, 175, 170.224, 173.498, 5),
  pg("2025-12-12", 173.478, 174.926, 171.582, 173.012, 5),
  pg("2025-12-15", 159.6, 160.68, 152.106, 153.04, 5),
  pg("2025-12-16", 154.894, 157.2146, 153.914, 156.224, 5),
  pg("2025-12-17", 157, 161.932, 156.29, 156.478, 5),
  pg("2025-12-18", 156.51, 157.7799, 151.15, 153.38, 5),
  pg("2025-12-19", 152.97, 156.16, 152.54, 155.31, 5),
  pg("2025-12-22", 156.86, 157.155, 153.15, 156.68, 5),
];
const NOW_OFFICIAL = [173.498, 173.012, 153.04, 156.224, 156.478, 153.38, 155.31, 156.68];

test("a split the gateway never applied still takes Polygon's adjusted bars before it", () => {
  const out = mergeOfficial(NOW_GW, NOW_PG, NOW);
  assert.deepEqual(closes(out), NOW_OFFICIAL);
  assert.equal(out[0].low, 170.224, "the official range, not the gateway's scaled one");
});

test("Polygon's sessions lead a gateway series whose first day is in the old share count", () => {
  const out = mergeOfficial(NOW_GW.slice(1), NOW_PG, NOW);
  assert.deepEqual(closes(out), NOW_OFFICIAL);
});

test("a gateway-only row in the old share count is restated with the rest", () => {
  // The same stretch with Polygon starting a session after the gateway: the
  // gateway's first row stands, but in today's share count, not five times it.
  const out = mergeOfficial(NOW_GW, NOW_PG.slice(1), NOW);
  assert.equal(out[0].date, "12/11/2025 00:00:00 EST");
  assert.ok(Math.abs(out[0].price - 866.14 / 5) < 1e-9, `11 Dec reads ${out[0].price}`);
  assert.deepEqual(closes(out.slice(1)), NOW_OFFICIAL.slice(1));
});

/* META before June 2022: Polygon's bars are the Roundhill ETF, about 1/24th of
   Facebook's price and steady at that ratio for days — a ratio that could pass
   for a split. It is not one: Polygon's own series jumps from $12.31 to
   $194.28 across the seam, and a split never moves the adjusted series. */
test("a steady ratio across a seam in Polygon's own series is not taken for a split", () => {
  const out = mergeOfficial(
    [
      gw("01/26/2022", 294.63, 307.01, 307.51, 290.85),
      gw("01/27/2022", 294.64, 297.752, 301.709, 294.26),
      gw("01/28/2022", 301.71, 295.6204, 301.9, 293.0333),
      gw("01/31/2022", 313.26, 300.68, 313.79, 299.32),
      gw("06/08/2022", 196.45, 194.67, 202.03, 194.41),
      gw("06/09/2022", 184, 194.28, 199.45, 183.68),
      gw("06/10/2022", 175.57, 183.04, 183.1, 175.02),
      gw("06/13/2022", 164.26, 170.59, 172.575, 164.03),
    ],
    [
      pg("2022-01-26", 12.8, 12.8426, 12.14, 12.28, 5),
      pg("2022-01-27", 12.43, 12.45, 11.93, 11.95, 5),
      pg("2022-01-28", 11.9979, 12.31, 11.73, 12.31, 5),
      pg("2022-06-09", 194.28, 199.45, 183.68, 184, 4),
      pg("2022-06-10", 183.04, 183.1, 175.02, 175.57, 4),
      pg("2022-06-13", 170.59, 172.575, 164.03, 164.26, 4),
    ],
    NOW,
  );
  assert.deepEqual(closes(out), [294.63, 294.64, 301.71, 313.26, 196.45, 184, 175.57, 164.26]);
});

/* Earnings days on which the gateway's WHOLE row — open included — is an
   after-hours print, so the per-day test kept it. */
test("an earnings day whose whole gateway row is after-hours takes the official bar", () => {
  // XYZ, 1 May 2025: the real -20.43% move was on the 2nd, not the 1st.
  const xyz = mergeOfficial(
    [
      gw("04/29/2025", 57.56, 59.24, 59.56, 57.5024),
      gw("04/30/2025", 59.51, 59.1, 60.5, 58.47),
      gw("05/01/2025", 46.18, 45.7, 54.33, 43.87),
      gw("05/02/2025", 46.38, 45.325, 47, 44.27),
      gw("05/05/2025", 45.71, 46.23, 46.77, 45.66),
    ],
    [
      pg("2025-04-29", 58.74, 59.82, 58.5, 59.56, 4),
      pg("2025-04-30", 57.02, 58.7, 56.4135, 58.47, 4),
      pg("2025-05-01", 59.02, 59.68, 58.21, 58.48, 4),
      pg("2025-05-02", 45.325, 47, 44.27, 46.53, 4),
      pg("2025-05-05", 45.92, 46.94, 45.025, 46.64, 4),
    ],
    NOW,
  );
  assert.deepEqual(closes(xyz), [59.56, 58.47, 58.48, 46.53, 46.64]);

  // AVGO, 3 Jun 2026: 416 drawn a session before the real gap.
  const avgo = mergeOfficial(
    [
      gw("06/01/2026", 488.67, 480.24, 494.95, 457.175),
      gw("06/02/2026", 492, 497.01, 499.03, 478.27),
      gw("06/03/2026", 416, 429.75, 488.28, 403.5),
      gw("06/04/2026", 408, 411.39, 423.685, 406.06),
      gw("06/05/2026", 385.02, 407.605, 410.5, 385.59),
    ],
    [
      pg("2026-06-01", 450.09, 466.05, 442.22, 459.97, 4),
      pg("2026-06-02", 488.79, 488.82, 470.459, 481.57, 4),
      pg("2026-06-03", 494.775, 495, 472.64, 479.23, 4),
      pg("2026-06-04", 408.99, 426.48, 403.0101, 418.91, 4),
      pg("2026-06-05", 407.605, 410.5, 385.59, 385.73, 4),
    ],
    NOW,
  );
  assert.deepEqual(closes(avgo), [459.97, 481.57, 479.23, 418.91, 385.73]);
});

test("a bad gateway row between two agreeing days takes the official bar", () => {
  // CKX, 23 Jan 2025: +39.58% then -28.06% on a stock that moved 1.6%.
  const out = mergeOfficial(
    [
      gw("01/21/2025", 10.43, 10.43, 10.43, 10.43),
      gw("01/22/2025", 11.6, 11.61, 14, 11.01),
      gw("01/23/2025", 16.61, 17.03, 17.03, 11.13),
      gw("01/24/2025", 11.8, 11.95, 12.04, 11.8),
      gw("01/27/2025", 11.61, 11.61, 17.03, 11.61),
    ],
    [
      pg("2025-01-21", 12.14, 12.54, 11.85, 11.86, 5),
      pg("2025-01-22", 11.85, 12.03, 11.85, 11.9, 5),
      pg("2025-01-23", 11.85, 11.95, 11.71, 11.71, 5),
      pg("2025-01-24", 11.95, 12.04, 11.8, 11.95, 5),
      pg("2025-01-27", 11.63, 11.9999, 11.522, 11.95, 5),
    ],
    NOW,
  );
  assert.deepEqual(closes(out), [11.86, 11.9, 11.71, 11.95, 11.95]);
});

test("an IPO day whose gateway row is after-hours takes the official bar", () => {
  // CRCL listed 5 Jun 2025 and closed at 83.23; the gateway says 98.23.
  const out = mergeOfficial(
    [
      gw("06/05/2025", 98.23, 90, 100.22, 87.83),
      gw("06/06/2025", 115.2, 96.39, 123.515, 92.95),
      gw("06/09/2025", 115.63, 117.49, 120.8, 115.25),
      gw("06/10/2025", 106.5, 107.7, 110.85, 104.05),
    ],
    [
      pg("2025-06-05", 69, 103.75, 64, 83.23, 4),
      pg("2025-06-06", 96.39, 123.515, 92.95, 107.7, 4),
      pg("2025-06-09", 132.72, 138.57, 108.4, 115.25, 4),
      pg("2025-06-10", 115, 115, 101.51, 105.91, 4),
    ],
    NOW,
  );
  assert.deepEqual(closes(out), [83.23, 107.7, 115.25, 105.91]);
});

test("a gateway series ending on an after-hours row still gets Polygon's newer session", () => {
  // The worker reads at 00:45: the gateway ends on the earnings day, Polygon
  // already has the next. The next session must not be dropped.
  const out = mergeOfficial(
    [
      gw("04/29/2025", 57.56, 59.24, 59.56, 57.5024),
      gw("04/30/2025", 59.51, 59.1, 60.5, 58.47),
      gw("05/01/2025", 46.18, 45.7, 54.33, 43.87),
    ],
    [
      pg("2025-04-29", 58.74, 59.82, 58.5, 59.56, 4),
      pg("2025-04-30", 57.02, 58.7, 56.4135, 58.47, 4),
      pg("2025-05-01", 59.02, 59.68, 58.21, 58.48, 4),
      pg("2025-05-02", 45.325, 47, 44.27, 46.53, 4),
    ],
    NOW,
  );
  assert.deepEqual(closes(out), [59.56, 58.47, 58.48, 46.53]);
});

/* The gateway says "EDT" all year. "01/15/2026 00:00:00 EDT" is 04:00Z, which
   is 23:00 on the 14th in New York (EST) — so every winter row read as the
   session before, and priorClose on the 15th returned the 15th's own close. */
test("every row carries the Eastern offset its own date had", () => {
  const out = mergeOfficial(
    [
      gw("01/13/2026", 260.4, 261.04, 261.05, 258.26),
      gw("01/14/2026", 260.099, 259.71, 260.562, 259.105),
      gw("01/15/2026", 257.44, 258.8, 258.8, 256.84),
      gw("01/16/2026", 255.25, 257.9, 258.9, 254.93),
    ],
    [
      pg("2026-01-13", 258.72, 261.81, 258.39, 261.05, 5),
      pg("2026-01-14", 259.49, 261.82, 256.71, 259.96, 5),
      pg("2026-01-15", 260.65, 261.04, 257.05, 258.21, 5),
    ],
    NOW,
  );
  assert.deepEqual(
    out.map((b) => b.date),
    ["01/13/2026 00:00:00 EST", "01/14/2026 00:00:00 EST", "01/15/2026 00:00:00 EST", "01/16/2026 00:00:00 EST"],
  );
  assert.equal(out[3].price, 255.25, "the 16th is the gateway's own row, re-stamped");
  assert.equal(parseFeedDate(out[2].date), Date.parse("2026-01-15T05:00:00Z"), "Eastern midnight of the 15th");
});

/* ---------------------------------------------------------------------------
 * Polygon alone, and what the worker may store.
 * ------------------------------------------------------------------------- */

/* META's Polygon history as the store held it on 24 Sep 2026: the ETF at
   $14.99 to $12.31, a four-month hole, then Facebook at $184. */
const META_POLYGON = [
  pg("2021-09-14", 15.1, 15.2, 14.9, 14.99, 4),
  pg("2021-09-15", 15, 15.1, 14.8, 14.95, 4),
  pg("2022-01-27", 12.43, 12.45, 11.93, 11.95, 5),
  pg("2022-01-28", 11.9979, 12.31, 11.73, 12.31, 5),
  pg("2022-06-09", 194.28, 199.45, 183.68, 184, 4),
  pg("2022-06-10", 183.04, 183.1, 175.02, 175.57, 4),
];

test("Polygon alone never carries another security's history across a seam", () => {
  const out = mergeOfficial([], META_POLYGON, NOW);
  assert.deepEqual(closes(out), [184, 175.57]);
});

test("a stored series is served from after its last seam", () => {
  const stored = [
    { date: "09/14/2021 00:00:00 EDT", price: 14.99, opening: 15.1, high: 15.2, low: 14.9, volume: 1 },
    { date: "01/28/2022 00:00:00 EST", price: 12.31, opening: 12, high: 12.31, low: 11.73, volume: 1 },
    { date: "06/09/2022 00:00:00 EDT", price: 184, opening: 194.28, high: 199.45, low: 183.68, volume: 1 },
    { date: "06/10/2022 00:00:00 EDT", price: 175.57, opening: 183.04, high: 183.1, low: 175.02, volume: 1 },
  ];
  assert.deepEqual(closes(sinceLastSeam(stored)), [184, 175.57]);
  // A real one-day crash is not a seam; neither is an ordinary weekend.
  const crash = [
    { date: "03/07/2025 00:00:00 EST", price: 30, opening: 30, high: 30, low: 30, volume: 1 },
    { date: "03/10/2025 00:00:00 EDT", price: 6, opening: 7, high: 8, low: 5, volume: 1 },
  ];
  assert.equal(sinceLastSeam(crash), crash);
});

const answered = <T>(data: T) => ({ ok: true as const, data, status: 200, ms: 5 });
const failed = (status: number, error = "upstream") => ({ ok: false as const, error, status, ms: 5 });
const AAPL_GW = [gw("09/22/2026", 342.7, 339.84, 345.34, 338.75)];
const AAPL_PG = { results: [pg("2026-09-21", 335.28, 339.64, 333.05, 338.98, 4), pg("2026-09-22", 340.135, 345.34, 338.75, 339.75, 4)] };

test("for the store, a failure from either source is a failure, whatever its status", () => {
  // A 200 whose body was not JSON arrives as ok:false with status 200.
  assert.equal(settleHistory(answered(AAPL_GW), failed(200, "Response was not valid JSON"), NOW, true).ok, false);
  assert.equal(settleHistory(answered(AAPL_GW), failed(404), NOW, true).ok, false);
  assert.equal(settleHistory(failed(401), answered(AAPL_PG), NOW, true).ok, false);
  assert.equal(settleHistory(failed(403), answered(AAPL_PG), NOW, true).ok, false);
  // A throttle body under HTTP 200 is not a series.
  assert.equal(settleHistory(answered({ message: "Too many requests" }), answered(AAPL_PG), NOW, true).ok, false);
});

test("a page degrades to whichever source answered", () => {
  const onlyPolygon = settleHistory(failed(401), answered(AAPL_PG), NOW, false);
  assert.ok(onlyPolygon.ok);
  assert.deepEqual(closes(onlyPolygon.data), [338.98, 339.75]);
  const onlyGateway = settleHistory(answered(AAPL_GW), failed(404), NOW, false);
  assert.ok(onlyGateway.ok);
  assert.deepEqual(closes(onlyGateway.data), [342.7]);
});

test("a symbol the gateway has no history for is stored from Polygon, from its last seam", () => {
  // Measured: /historical answers 200 [] for a symbol it does not carry.
  const plain = settleHistory(answered([]), answered(AAPL_PG), NOW, true);
  assert.ok(plain.ok);
  assert.deepEqual(closes(plain.data), [338.98, 339.75]);
  const reused = settleHistory(answered([]), answered({ results: META_POLYGON }), NOW, true);
  assert.ok(reused.ok);
  assert.deepEqual(closes(reused.data), [184, 175.57], "never the ETF that held the ticker");
});

test("both sources answering merges them", () => {
  const both = settleHistory(answered(AAPL_GW), answered(AAPL_PG), NOW, true);
  assert.ok(both.ok);
  assert.deepEqual(closes(both.data), [338.98, 339.75]);
});
