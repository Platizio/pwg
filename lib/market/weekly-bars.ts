import type { PricePoint } from "../api/normalize/series.ts";

/* Five years as WEEKS.
 *
 * 1,275 daily candles on a chart a few hundred pixels wide are each narrower
 * than a pixel — the time scale's own 0.6px floor cannot even fit them — so
 * the five-year range draws one candle per trading week instead: about 261,
 * the same density as the year's daily candles.
 *
 * Aggregated, not invented: the week opens at its first session's open, closes
 * at its last session's close, and its high and low are the extremes of the
 * sessions inside it. A week that has lost a part (a session with no high, say)
 * uses the close in its place, as the daily candles do.
 */

const DAY_MS = 86_400_000;

const EASTERN_DAY = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/New_York",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/* Monday-based week number of the EASTERN calendar day. 1 Jan 1970 was a
   Thursday, so shifting by three makes each week run Monday to Sunday. */
function weekOf(atMs: number): number {
  const [y, m, d] = EASTERN_DAY.format(atMs).split("-").map(Number);
  return Math.floor((Date.UTC(y, m - 1, d) / DAY_MS + 3) / 7);
}

export function weeklyBars(points: readonly PricePoint[]): PricePoint[] {
  const out: PricePoint[] = [];
  let week = Number.NaN;
  for (const p of points) {
    if (!Number.isFinite(p.at) || !Number.isFinite(p.price)) continue;
    const w = weekOf(p.at);
    const last = out[out.length - 1];
    if (w !== week || !last) {
      week = w;
      out.push({
        at: p.at,
        open: p.open ?? p.price,
        high: p.high ?? p.price,
        low: p.low ?? p.price,
        price: p.price,
        volume: p.volume,
      });
      continue;
    }
    last.high = Math.max(last.high ?? last.price, p.high ?? p.price);
    last.low = Math.min(last.low ?? last.price, p.low ?? p.price);
    last.price = p.price;
    last.volume = last.volume === null && p.volume === null ? null : (last.volume ?? 0) + (p.volume ?? 0);
  }
  return out;
}
