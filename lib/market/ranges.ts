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
  /* Five daily closes until 2026-09-21 — five points for a week, which is the
     straight line readers kept reporting. It is a week of ten-minute buckets
     now, fetched from the stored sessions: no `sessions` slice, because the
     fetched series IS the week and slicing five rows off it would draw the
     last fifty minutes. */
  { id: "1W", label: "1W", source: "daily", intraday: false, interval: "10-minute bars" },
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

/* The reader's clock, and the zone named so it cannot be mistaken.
 *
 * Every timestamp here was UTC with no suffix once, so a US equity's day axis
 * opened at 13:30 and a reader in Mumbai could not tell whether that was a New
 * York hour, their own, or neither. The fix then was to state New York.
 *
 * That was still the wrong clock for the person reading it. A reader in India
 * watches the US session between 7pm and 1:30am — that is when they are at the
 * screen, that is what their own clock says, and an axis labelled 09:30 while
 * they sit down at 19:00 is asking them to do the arithmetic on every glance.
 * So the axis is THEIR zone, and the caption names it, which is what makes the
 * change safe: the previous fault was never the zone, it was the silence about
 * which zone.
 *
 * ET remains the fallback for the one case that cannot be asked — a runtime
 * that will not resolve a zone — because the session is a fact about New York
 * and a wrong guess about the reader is worse than an honest default.
 *
 * Safe to read at module scope only because the chart is client-only
 * (`dynamic(..., { ssr: false })` in instrument-view.tsx). Resolved lazily all
 * the same: this module is imported by lib/market/instrument.ts on the server,
 * where the answer would be the host's UTC and quietly wrong if it were ever
 * used there. */
const ET_ZONE = "America/New_York";

export function readerZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || ET_ZONE;
  } catch {
    return ET_ZONE;
  }
}

/* Built per zone rather than per call: constructing an Intl formatter is the
   expensive part, and the chart re-captions on every tick. */
const FORMATTERS = new Map<string, Intl.DateTimeFormat[]>();

function formattersFor(zone: string): Intl.DateTimeFormat[] {
  const held = FORMATTERS.get(zone);
  if (held) return held;
  const made = [
    new Intl.DateTimeFormat("en-US", { timeZone: zone, month: "short", day: "numeric" }),
    new Intl.DateTimeFormat("en-US", {
      timeZone: zone,
      month: "short",
      day: "numeric",
      year: "numeric",
    }),
    new Intl.DateTimeFormat("en-US", {
      timeZone: zone,
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
    }),
    new Intl.DateTimeFormat("en-US", { timeZone: zone, year: "numeric" }),
  ];
  FORMATTERS.set(zone, made);
  return made;
}

/**
 * What to call the zone in the caption.
 *
 * The reader's own locale, not the fixed en-US the dates use: an Indian
 * browser says "IST" where en-US says "GMT+5:30", and the point of this label
 * is to be recognised at a glance by the person reading it. Falls back to the
 * offset form, which is unambiguous even when it is ugly.
 */
export function zoneLabel(zone: string = readerZone(), at: number = Date.now()): string {
  try {
    const parts = new Intl.DateTimeFormat(undefined, {
      timeZone: zone,
      timeZoneName: "short",
    }).formatToParts(at);
    return parts.find((p) => p.type === "timeZoneName")?.value ?? zone;
  } catch {
    return zone;
  }
}

const COUNT = new Intl.NumberFormat("en-US");

/* Read off the plotted points, never computed from today. The window is a
   tail-slice of rows: if the feed's last row is Friday and today is Tuesday,
   1W is last Mon-Fri, and only the real first and last timestamps show it. */
function spanOf(firstMs: number | null, lastMs: number | null, zone: string): string | null {
  if (firstMs === null || lastMs === null) return null;
  if (!Number.isFinite(firstMs) || !Number.isFinite(lastMs)) return null;

  const [DAY, DAY_YEAR, WEEKDAY, YEAR] = formattersFor(zone);
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
 *     1M \u00b7 21 daily closes \u00b7 Aug 4 \u2013 Sep 1, 2026 \u00b7 IST
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
  /* Injected so a test can pin a zone rather than inherit the machine's. */
  zone: string = readerZone(),
): string {
  const parts: string[] = [def.label];

  parts.push(count > 0 ? `${COUNT.format(count)} ${def.interval}` : def.interval);

  const span = spanOf(firstMs, lastMs, zone);
  /* No span means no dates to stamp, and a lone zone name would be labelling
     nothing. An empty day says what it would have drawn and stops. */
  if (span) {
    parts.push(span);
    parts.push(zoneLabel(zone, lastMs ?? undefined));
  }

  return parts.join(" \u00b7 ");
}

/* ------------------------------------------------------------------ */
/* Which ranges the page does not carry                                */
/* ------------------------------------------------------------------ */

/**
 * The ranges fetched on demand rather than shipped with the page.
 *
 * The instrument page carries the range it OPENS with — a year of daily bars —
 * and 1M and 3M are slices of that same year, so they need no request and stay
 * instant. What is left is the three it genuinely does not hold: the week and
 * the day, which are drawn from stored intraday sessions, and five years,
 * which is thirteen hundred bars nobody should download to look at a one-year
 * chart.
 *
 * The page used to ship all of them at once — the company's five years and the
 * benchmark's, 2,549 bars, 234KB of a 438KB payload, on every click — and on a
 * 512MB instance three such renders were enough to kill the process.
 */
export const FETCHED_RANGES = ["1D", "1W", "5Y"] as const;

export type FetchedRange = (typeof FETCHED_RANGES)[number];

/**
 * The range a caller asked for, or null.
 *
 * 1M, 3M and 1Y are refused rather than merely absent from the list, and the
 * difference is worth stating: they are valid ranges that this path must not
 * answer for, because answering would spend a request on bars the reader is
 * already holding.
 *
 * Nothing is defaulted. A typo that silently fetched something would have that
 * something charted as though it were what was asked for.
 */
export function parseFetchedRange(value: string | null | undefined): FetchedRange | null {
  return typeof value === "string" && (FETCHED_RANGES as readonly string[]).includes(value)
    ? (value as FetchedRange)
    : null;
}
