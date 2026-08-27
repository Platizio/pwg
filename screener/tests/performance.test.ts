import { test } from "node:test";
import assert from "node:assert/strict";
import {
  annualisedVolatility,
  calendarYears,
  drawdownFromHigh,
  periodReturn,
  ytdReturn,
} from "../lib/api/normalize/performance.ts";
import type { PricePoint } from "../lib/api/normalize/series.ts";

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 7, 24);

/** A daily series ending today, oldest first, at a fixed compound rate. */
function series(days: number, from = 100, to = 200): PricePoint[] {
  const out: PricePoint[] = [];
  for (let i = days - 1; i >= 0; i -= 1) {
    const t = (days - 1 - i) / Math.max(1, days - 1);
    const price = from * (to / from) ** t;
    out.push({ at: NOW - i * DAY, price, open: price, high: price, low: price, volume: 1 });
  }
  return out;
}

test("a period return measures back by trading sessions, not calendar days", () => {
  const pts = series(30, 100, 130);
  const r = periodReturn(pts, 5);
  assert.ok(r !== null);
  // Five sessions back on a smooth curve is a small slice of the whole move.
  assert.ok(r > 0 && r < 10, `expected a small positive move, got ${r}`);
});

test("a window longer than the series yields null rather than the whole move", () => {
  // Reporting five years of return from one month of data is a fabricated figure.
  assert.equal(periodReturn(series(20), 252), null);
  assert.equal(periodReturn([], 5), null);
});

test("year to date starts at the last close of the previous year", () => {
  const pts: PricePoint[] = [
    { at: Date.UTC(2025, 11, 31), price: 100, open: 100, high: 100, low: 100, volume: 1 },
    { at: Date.UTC(2026, 0, 2), price: 110, open: 110, high: 110, low: 110, volume: 1 },
    { at: NOW, price: 150, open: 150, high: 150, low: 150, volume: 1 },
  ];
  const r = ytdReturn(pts, NOW);
  assert.ok(r !== null);
  // 100 -> 150 measured from the prior year's close, not from January's open.
  assert.ok(Math.abs(r - 50) < 0.001, `expected +50%, got ${r}`);
});

test("year to date is null when the series does not reach the year boundary", () => {
  const pts = series(10);
  assert.equal(ytdReturn(pts, NOW), null);
});

test("calendar years report one complete row per year, newest first", () => {
  const pts: PricePoint[] = [];
  for (const y of [2023, 2024, 2025]) {
    pts.push({ at: Date.UTC(y, 0, 3), price: 100, open: 100, high: 100, low: 100, volume: 1 });
    pts.push({ at: Date.UTC(y, 11, 29), price: 120, open: 120, high: 120, low: 120, volume: 1 });
  }
  const years = calendarYears(pts);
  assert.deepEqual(years.map((y) => y.year), [2025, 2024, 2023]);
  assert.ok(years.every((y) => y.change !== null));
});

test("volatility is annualised and zero for a flat series", () => {
  const flat: PricePoint[] = Array.from({ length: 60 }, (_, i) => ({
    at: NOW - (59 - i) * DAY, price: 100, open: 100, high: 100, low: 100, volume: 1,
  }));
  assert.equal(annualisedVolatility(flat), 0);

  /* A series that alternates by one percent a day is far more volatile than a
     smooth one that ends at the same place — a measure that cannot tell them
     apart is measuring the wrong thing. */
  const choppy: PricePoint[] = Array.from({ length: 60 }, (_, i) => ({
    at: NOW - (59 - i) * DAY,
    price: i % 2 === 0 ? 100 : 101,
    open: 100, high: 101, low: 100, volume: 1,
  }));
  const v = annualisedVolatility(choppy);
  assert.ok(v !== null && v > annualisedVolatility(series(60))!);
});

test("volatility needs enough sessions to mean anything", () => {
  assert.equal(annualisedVolatility(series(5)), null);
});

test("drawdown is the fall from the high, and never positive", () => {
  assert.ok(Math.abs(drawdownFromHigh(80, 100)! - -20) < 1e-9);
  assert.equal(drawdownFromHigh(100, 100), 0);
  // A price above its own 52-week high is a data disagreement, not a gain.
  assert.equal(drawdownFromHigh(110, 100), 0);
  assert.equal(drawdownFromHigh(null, 100), null);
  assert.equal(drawdownFromHigh(80, null), null);
});
