import type { RawHistoryPoint } from "../clients/quotes.ts";

/* Polygon's official daily bars, in the feed's own shape.
 *
 * WHY. The daily series came from /quotes/equity/historical, whose "price" is
 * not the official close — measured for AAPL on 24 Sep 2026: 342.70 for a
 * 22 Sep session that closed at 339.75, 340.04 for one that closed at 338.98
 * (beside a "low" of 250.12). Its open, high and low matched Polygon to the
 * cent; only the close was wrong, and the close is the number the whole app
 * reads: the PREV CLOSE line, every return and drawdown, the indicators.
 *
 * SHAPE. Every consumer parses "MM/DD/YYYY HH:MM:SS ZZZ" with parseFeedDate,
 * so these bars are written exactly that way, at the same Eastern midnight the
 * old source used — a drop-in, not a new contract.
 *
 * TODAY is always left out. "The last daily bar" is read across the app as
 * the last COMPLETED session, so a partial one there becomes the previous
 * close. Leaving it out only until 16:00 would not be enough: these fetches
 * are cached, and a response taken at 15:00 and served at 16:05 would carry a
 * mid-afternoon price as the close. Today's bar joins the series tomorrow,
 * which is when the worker reads it (publication, ~00:45 New York).
 */

export type RawAggBar = { t: number; o: number; h: number; l: number; c: number; v?: number };

const ET = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  timeZoneName: "short",
});

function eastern(ms: number) {
  const parts = ET.formatToParts(ms);
  const get = (t: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === t)?.value ?? "";
  return {
    ymd: `${get("year")}-${get("month")}-${get("day")}`,
    mdy: `${get("month")}/${get("day")}/${get("year")}`,
    zone: get("timeZoneName"),
  };
}

export function dailyBarsFromAggs(bars: readonly RawAggBar[], nowMs: number): RawHistoryPoint[] {
  const today = eastern(nowMs).ymd;
  return bars
    .filter((b) => Number.isFinite(b?.t) && Number.isFinite(b?.c) && b.c > 0)
    .filter((b) => eastern(b.t).ymd !== today)
    .sort((a, b) => a.t - b.t)
    .map((b) => {
      const e = eastern(b.t);
      return {
        date: `${e.mdy} 00:00:00 ${e.zone}`,
        price: b.c,
        opening: Number.isFinite(b.o) ? b.o : null,
        high: Number.isFinite(b.h) ? b.h : null,
        low: Number.isFinite(b.l) ? b.l : null,
        volume: Number.isFinite(b.v) ? (b.v as number) : null,
      };
    });
}
