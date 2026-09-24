import test from "node:test";
import assert from "node:assert/strict";

import { insightCandidates, quarterlyExpiry, type InsightInput } from "../lib/market/insights.ts";
import type { PricePoint } from "../lib/api/normalize/series.ts";
import { tradingDay } from "../lib/market/session.ts";

/* The quarterly expiry is the third Friday of March, June, September and
   December, or the trading day before it when that Friday is a holiday. Twice
   in this calendar Juneteenth IS that Friday: Fri 19 Jun 2026 (OCC moved the
   June 2026 standard expiration to Thu 18 Jun) and Fri 18 Jun 2027, the
   observed holiday on the NYSE calendar, so June 2027 expires Thu 17 Jun.
   Polygon's SPY daily bars have no 2026-06-19 bar, and 18 Jun traded 80.9M
   against 50-67M on the days around it. */

test("the third Friday of a quarter month is the expiry", () => {
  assert.equal(quarterlyExpiry("2026-09-18"), true);
  assert.equal(quarterlyExpiry("2026-03-20"), true);
  assert.equal(quarterlyExpiry("2026-12-18"), true);
});

test("when that Friday is a holiday the expiry moves to the Thursday before", () => {
  assert.equal(quarterlyExpiry("2026-06-18"), true);
  assert.equal(quarterlyExpiry("2027-06-17"), true);
  assert.equal(quarterlyExpiry("2026-06-19"), false, "a holiday has no session to expire in");
  assert.equal(quarterlyExpiry("2027-06-18"), false, "Juneteenth observed");
});

test("other days are not an expiry", () => {
  assert.equal(quarterlyExpiry("2026-09-17"), false, "the Thursday before an ordinary expiry");
  assert.equal(quarterlyExpiry("2026-09-11"), false, "the second Friday");
  assert.equal(quarterlyExpiry("2026-08-21"), false, "a monthly, not a quarterly");
  assert.equal(quarterlyExpiry("not a day"), false);
});

/* The volume insight names the day it calls an expiry, so a holiday expiry
   must not be called a Friday. Synthetic sessions: forty trading days of a
   flat 1M shares ending on Thu 18 Jun 2026, the last at 3M. */
function sessionsEndingOn(lastDay: string, count: number): PricePoint[] {
  const out: PricePoint[] = [];
  const [y, m, d] = lastDay.split("-").map(Number);
  for (let t = Date.UTC(y, m - 1, d); out.length < count; t -= 86_400_000) {
    const day = new Date(t).toISOString().slice(0, 10);
    if (tradingDay(day) === null) continue;
    // Midnight Eastern (EDT, UTC-4), the stamp a daily bar carries.
    const at = t + 4 * 3_600_000;
    const price = 100 + (out.length % 3) * 0.5;
    out.unshift({ at, price, open: price, high: price, low: price, volume: out.length === 0 ? 3_000_000 : 1_000_000 });
  }
  return out;
}

test("a spike on a holiday-shifted expiry is called a Thursday, not a Friday", () => {
  const input: InsightInput = {
    ticker: "TEST",
    daily: sessionsEndingOn("2026-06-18", 40),
    splitsKnown: true,
    market: null,
    sector: null,
    pe: null,
    evToEbitda: null,
    peers: [],
    sharesOutstanding: null,
    shortInterest: null,
    analyst: null,
    earnings: null,
    dividends: [],
    quoteAsOf: null,
    now: Date.UTC(2026, 5, 19, 12),
  };
  const volume = insightCandidates(input).find((i) => i.id === "volume");
  assert.ok(volume, "expected a volume insight");
  assert.equal(volume.asOf, "2026-06-18");
  assert.match(volume.body, / It was a quarterly options-expiry Thursday\.$/);
  assert.doesNotMatch(volume.body, /Friday/);
});
