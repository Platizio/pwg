import { parseFeedDate } from "./time.ts";
import type { RawHistoryPoint } from "../clients/quotes.ts";

/* Price rows into chart points, from either feed.

   The two history endpoints disagree about dates. The daily one writes
   "08/21/2026 16:00:00 EDT"; the intraday one writes ISO-8601 with an offset.
   parseFeedDate deliberately refuses the second rather than guessing at it —
   a lenient parser here would fall back to the server's own timezone and shift
   every point by however many hours the host happens to be from New York.

   Both feeds do carry full OHLC. The chart used to keep only the close and
   synthesise candles where open, high and low were all equal to it, which drew
   a row of flat dashes and called it a candlestick view. */

export type PricePoint = {
  at: number;
  /** The close, or the last trade within the minute. */
  price: number;
  open: number | null;
  high: number | null;
  low: number | null;
  volume: number | null;
};

const num = (v: number | null | undefined): number | null =>
  typeof v === "number" && Number.isFinite(v) ? v : null;

/** Epoch ms from whichever of the two formats this row uses. */
function timeOf(date: string): number | null {
  const feed = parseFeedDate(date);
  if (feed !== null) return feed;
  // ISO-8601 carries its own offset, so Date.parse is unambiguous here.
  const iso = Date.parse(date);
  return Number.isFinite(iso) ? iso : null;
}

export function toPricePoints(rows: readonly RawHistoryPoint[]): PricePoint[] {
  const out: PricePoint[] = [];

  for (const r of rows) {
    const at = timeOf(r.date);
    // A non-positive price is a data hole, not a valuation.
    if (at === null || !(r.price > 0)) continue;
    out.push({
      at,
      price: r.price,
      open: num(r.opening),
      high: num(r.high),
      low: num(r.low),
      volume: num(r.volume),
    });
  }

  /* Sorted rather than trusted: the daily feed arrives ascending and the
     polygon endpoints elsewhere document the opposite, so order is not worth
     assuming of either. */
  return out.sort((a, b) => a.at - b.at);
}
