import type { RangeDef, RangeId } from "./types";

/* How far back the chart looks, and where each answer comes from.

   These definitions used to describe how to fabricate a series: a sample
   count, a volatility, a drift and a candle bucket size, all feeding a seeded
   generator. Nothing generates a price any more, so what a range needs to say
   now is simply which feed answers it and how much of that feed to show.

   Everything but the day is a slice of one five-year daily pull the snapshot
   already holds — asking the gateway for a week returns the same five rows
   that slice contains. Only the day needs its own call, because minute bars
   come from a different endpoint. */
export const RANGES: RangeDef[] = [
  { id: "1D", label: "1D", source: "intraday", intraday: true, interval: "1-minute bars" },
  { id: "1W", label: "1W", source: "daily", sessions: 5, intraday: false, interval: "daily closes" },
  { id: "1M", label: "1M", source: "daily", sessions: 21, intraday: false, interval: "daily closes" },
  { id: "3M", label: "3M", source: "daily", sessions: 64, intraday: false, interval: "daily closes" },
  { id: "1Y", label: "1Y", source: "daily", sessions: 252, intraday: false, interval: "daily closes" },
  { id: "5Y", label: "5Y", source: "daily", intraday: false, interval: "daily closes" },
];

/* A year, so a reader arriving while the market is shut still sees a chart:
   the day is the one range whose emptiness is a real state rather than a
   failure. */
export const DEFAULT_RANGE: RangeId = "1Y";

export function getRange(id: string): RangeDef {
  return RANGES.find((r) => r.id === id) ?? RANGES[4];
}

/* ------------------------------------------------------------------ */
/* What the chart says it is showing                                   */
/* ------------------------------------------------------------------ */

/* Market time, not the reader's and not UTC.
 *
 * Every timestamp on this chart was rendered in UTC with no suffix, so a US
 * equity's day axis opened at 13:30. A reader in Mumbai has no way to know
 * whether that is a US session hour, their own, or neither. The session is a
 * fact about New York, so the axis is New York and the caption says so. */
const ET_ZONE = "America/New_York";

const DAY = new Intl.DateTimeFormat("en-US", {
  timeZone: ET_ZONE,
  month: "short",
  day: "numeric",
});
const DAY_YEAR = new Intl.DateTimeFormat("en-US", {
  timeZone: ET_ZONE,
  month: "short",
  day: "numeric",
  year: "numeric",
});
const WEEKDAY = new Intl.DateTimeFormat("en-US", {
  timeZone: ET_ZONE,
  weekday: "short",
  month: "short",
  day: "numeric",
  year: "numeric",
});
const YEAR = new Intl.DateTimeFormat("en-US", { timeZone: ET_ZONE, year: "numeric" });
const COUNT = new Intl.NumberFormat("en-US");

/* Read off the plotted points, never computed from today. The window is a
   tail-slice of rows: if the feed's last row is Friday and today is Tuesday,
   1W is last Mon-Fri, and only the real first and last timestamps show it. */
function spanOf(firstMs: number | null, lastMs: number | null): string | null {
  if (firstMs === null || lastMs === null) return null;
  if (!Number.isFinite(firstMs) || !Number.isFinite(lastMs)) return null;

  const firstDay = WEEKDAY.format(firstMs);
  const lastDay = WEEKDAY.format(lastMs);
  /* One session is a date, not a range from a date to itself. */
  if (firstDay === lastDay) return lastDay;

  /* An en dash, and the year stated once when both ends share it. */
  const sameYear = YEAR.format(firstMs) === YEAR.format(lastMs);
  return `${sameYear ? DAY.format(firstMs) : DAY_YEAR.format(firstMs)} \u2013 ${DAY_YEAR.format(lastMs)}`;
}

/**
 * One line under the chart saying exactly what is drawn:
 *
 *     1M \u00b7 21 daily closes \u00b7 Aug 4 \u2013 Sep 1, 2026 \u00b7 ET
 *
 * `count` is the number of points actually plotted, not the range's nominal
 * `sessions` \u2014 a short feed draws fewer, and claiming 252 while drawing 200 is
 * the same class of untruth the rest of this file exists to avoid.
 */
export function rangeCaption(
  def: RangeDef,
  firstMs: number | null,
  lastMs: number | null,
  count: number,
): string {
  const parts: string[] = [def.label];

  parts.push(count > 0 ? `${COUNT.format(count)} ${def.interval}` : def.interval);

  const span = spanOf(firstMs, lastMs);
  /* No span means no dates to stamp, and a lone "ET" would be labelling
     nothing. An empty day says what it would have drawn and stops. */
  if (span) {
    parts.push(span);
    parts.push("ET");
  }

  return parts.join(" \u00b7 ");
}
