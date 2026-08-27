import type { PricePoint } from "./series.ts";

/* Performance, measured from the price series rather than asserted.

   Everything here is a pure function of the split-repaired daily history the
   snapshot already carries, so the Performance tab costs no request of its
   own. The rule throughout is that a window the data cannot cover returns
   null: reporting five years of return from one month of history would be a
   fabricated figure, and a dash is the honest answer. */

const TRADING_DAYS_A_YEAR = 252;

/** Percent change across the last `sessions` trading days. */
export function periodReturn(points: readonly PricePoint[], sessions: number): number | null {
  if (points.length < sessions + 1) return null;
  const last = points[points.length - 1].price;
  const prev = points[points.length - 1 - sessions].price;
  if (!(prev > 0) || !(last > 0)) return null;
  return (last / prev - 1) * 100;
}

/* Measured from the previous year's final close, which is what a year-to-date
   figure means — starting at January's open would silently drop the turn of
   the year, the one session most likely to have moved. */
export function ytdReturn(points: readonly PricePoint[], nowMs: number): number | null {
  if (points.length === 0) return null;
  const year = new Date(nowMs).getUTCFullYear();
  const boundary = Date.UTC(year, 0, 1);

  let base: number | null = null;
  for (const p of points) {
    if (p.at < boundary) base = p.price;
    else break;
  }
  const last = points[points.length - 1].price;
  if (base === null || !(base > 0) || !(last > 0)) return null;
  return (last / base - 1) * 100;
}

export type CalendarYear = { year: number; change: number | null };

/** One row per year the series covers, newest first. */
export function calendarYears(points: readonly PricePoint[]): CalendarYear[] {
  const byYear = new Map<number, { first: number; last: number }>();

  for (const p of points) {
    if (!(p.price > 0)) continue;
    const y = new Date(p.at).getUTCFullYear();
    const seen = byYear.get(y);
    if (seen) seen.last = p.price;
    else byYear.set(y, { first: p.price, last: p.price });
  }

  return [...byYear.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([year, { first, last }]) => ({
      year,
      change: first > 0 ? (last / first - 1) * 100 : null,
    }));
}

/* The standard deviation of daily returns, scaled to a year.

   Two series can start and end at the same price and be nothing alike; this is
   the figure that separates them. */
export function annualisedVolatility(points: readonly PricePoint[]): number | null {
  if (points.length < 21) return null;

  const returns: number[] = [];
  for (let i = 1; i < points.length; i += 1) {
    const prev = points[i - 1].price;
    if (prev > 0 && points[i].price > 0) returns.push(points[i].price / prev - 1);
  }
  if (returns.length < 20) return null;

  const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance =
    returns.reduce((acc, r) => acc + (r - mean) ** 2, 0) / (returns.length - 1);

  return Math.sqrt(variance) * Math.sqrt(TRADING_DAYS_A_YEAR) * 100;
}

/* How far below its twelve-month high the price sits. Never positive: a last
   price above its own recorded high is two feeds disagreeing, not a gain. */
export function drawdownFromHigh(price: number | null, high: number | null): number | null {
  if (price === null || high === null || !(high > 0) || !(price > 0)) return null;
  return Math.min(0, (price / high - 1) * 100);
}

/** The windows the Performance tab reports, in trading sessions. */
export const PERIODS = [
  { label: "1 week", sessions: 5 },
  { label: "1 month", sessions: 21 },
  { label: "3 months", sessions: 64 },
  { label: "6 months", sessions: 126 },
  { label: "1 year", sessions: TRADING_DAYS_A_YEAR },
  { label: "3 years", sessions: TRADING_DAYS_A_YEAR * 3 },
  { label: "5 years", sessions: TRADING_DAYS_A_YEAR * 5 },
] as const;
