import { parseFeedDate } from "./time.ts";
import type { RawHistoryPoint } from "../clients/quotes.ts";

/* One-year and five-year performance, from a single five-year history.

   The gateway charges a call per symbol per range, and the sector table wants
   both figures for every name in the sector. Asking for `1y` and `5y`
   separately would double a job that already runs to thousands of calls — so
   the five-year series answers both, each read against a calendar anchor (see
   calendarWindow below).

   The distinction the reference table gets wrong is worth keeping straight:
   a cumulative five-year return and a compound annual rate are different
   numbers, and quoting the first under the second's name overstates a
   holding's yearly performance several times over. Both are returned; the
   column decides which it means. */

const YEAR_MS = 365.25 * 86_400_000;

export type Split = {
  /** ISO date the new share count took effect. */
  execution_date: string;
  split_from: number;
  split_to: number;
};

/* Repairing a split the vendor missed — and only that.

   The gateway's history is already split-adjusted for almost everything. The
   exception is rare and silent: XLK split two-for-one in December 2025 and its
   earlier prices were left at the old share count, so the fund read as though
   it had fallen twenty-nine per cent across a year it rose forty.

   Adjusting every split on record fixed XLK and broke a third of the universe
   — NVDA, whose series was already correct, came out ten times too high. So
   the series has to be asked rather than assumed: a split is applied only
   where the prices visibly step by that split's own ratio on that split's own
   date. Everything else is left exactly as it came.

   The guard matters in both directions. A stock that genuinely halved on bad
   news has not split, and restating it would erase a real loss. */

/** How close an observed step must be to a split's ratio to be that split. */
const STEP_TOLERANCE = 0.06;
/** The recorded execution date and the price break can differ by a session. */
const DATE_SLACK_MS = 4 * 86_400_000;

export function repairSplitBreaks(
  points: readonly RawHistoryPoint[],
  splits: readonly Split[],
): RawHistoryPoint[] {
  if (points.length < 2 || splits.length === 0) return points as RawHistoryPoint[];

  const dated = points
    .map((p) => ({ p, at: parseFeedDate(p.date) }))
    .filter((x): x is { p: RawHistoryPoint; at: number } => x.at !== null && x.p.price > 0)
    .sort((a, b) => a.at - b.at);
  if (dated.length < 2) return points as RawHistoryPoint[];

  const factors = new Map<RawHistoryPoint, number>();

  for (const split of splits) {
    const ratio = split.split_to / split.split_from;
    const at = Date.parse(`${split.execution_date}T00:00:00Z`);
    if (!Number.isFinite(ratio) || ratio <= 0 || ratio === 1 || !Number.isFinite(at)) continue;

    /* The step an unapplied split leaves behind: prices divide by the same
       ratio the share count multiplied by. */
    const expected = 1 / ratio;

    let breakAt: number | null = null;
    for (let i = 1; i < dated.length; i += 1) {
      if (Math.abs(dated[i].at - at) > DATE_SLACK_MS) continue;
      const step = dated[i].p.price / dated[i - 1].p.price;
      if (Math.abs(step - expected) / expected <= STEP_TOLERANCE) {
        breakAt = dated[i].at;
        break;
      }
    }
    if (breakAt === null) continue; // already adjusted, or no such break

    for (const { p, at: pointAt } of dated) {
      if (pointAt < breakAt) factors.set(p, (factors.get(p) ?? 1) * ratio);
    }
  }

  if (factors.size === 0) return points as RawHistoryPoint[];
  /* The whole bar, not only its close. The open, high and low are prices in
     the same pre-split share count, and the 52-week range and the ATR read
     them: restating the close alone left a 2-for-1's highs at twice the close,
     a 52-week high the stock never traded at. Volume is left as it came — the
     feed's volume is not consistent enough to restate (see the baseline guard
     in derive-technicals.ts). */
  const scaled = (v: number | null, f: number) => (v === null ? null : v / f);
  return points.map((p) => {
    const f = factors.get(p);
    return f === undefined
      ? p
      : { ...p, price: p.price / f, opening: scaled(p.opening, f), high: scaled(p.high, f), low: scaled(p.low, f) };
  });
}

export type Returns = {
  /** Percent change over the trailing year. */
  ret1y: number | null;
  /** Cumulative percent change across the whole series. */
  ret5y: number | null;
  /** Compound annual growth rate over that same span, in percent. */
  cagr5y: number | null;
  /** The Eastern date ("yyyy-mm-dd") the five-year figure is struck from, when
      that is LATER than five calendar years back: the record opened after the
      anchor and its first close stood in (see REACH_GRACE_DAYS). Absent when
      the figure is exact or there is none, so a label reads "5 years" only
      when it is five years. */
  since5y?: string;
  /** The same for the trailing year: a company listed a year ago, give or
      take the grace, or a one-year record fetched a session short. */
  since1y?: string;
};

const EMPTY: Returns = { ret1y: null, ret5y: null, cagr5y: null };

type Point = { at: number; price: number };

/* ---------------------------------------------------------------------------
 * Calendar-anchored returns — the ONE definition of 1Y and 5Y in this app.
 *
 * 1Y is the latest close against the last close on or before the same
 * calendar date one year earlier; 5Y (and 3Y) likewise. It replaces two
 * definitions that printed different numbers under one label on one page: the
 * Overview read this module's "close nearest 365.25 days back", the
 * Performance tab read "the close 252 bars back", and a year with a holiday
 * fewer than usual or a stamp at a different hour put them a session apart.
 * returns.json (scripts/build-returns.mts), the snapshot, the store's derived
 * figures and the Performance tab all reach it now: through returnsFrom here,
 * or through rollingPeriods in lib/market/derive-performance.ts.
 *
 * Dates are the EXCHANGE'S: a daily bar is stamped at Eastern midnight, so its
 * Eastern date is the session it describes, whatever zone the host is in.
 * ------------------------------------------------------------------------- */

const ET_DAY = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/New_York",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** The exchange's calendar day for an instant, "yyyy-mm-dd". */
export const easternDay = (ms: number): string => ET_DAY.format(ms);

/** A "yyyy-mm-dd" moved by whole calendar years; 29 February lands on the 28th
    in a year that has none. */
export function shiftYears(day: string, years: number): string {
  const y = Number(day.slice(0, 4)) + years;
  let md = day.slice(4);
  const leap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
  if (md === "-02-29" && !leap) md = "-02-28";
  return `${String(y).padStart(4, "0")}${md}`;
}

const dayNumber = (day: string): number => Date.parse(`${day}T00:00:00Z`) / 86_400_000;

/* How far past the anchor a record may begin and still answer.

   Measured 24 Sep 2026: every five-year series (AAPL, MSFT, NVDA, SPY, META,
   JPM) starts on 24 Sep 2021 and ends on 23 Sep 2026, the last completed
   session. The feed opens its window on the FETCH date, and the last close is
   always at least a session older than that, so the 5Y anchor (23 Sep 2021) is
   one day before the first bar on every name, every day — and more across a
   weekend. A strict anchor would print a dash for every company. Within a
   week the record's first close is taken instead; that is the same week of
   grace the trailing year always had, and it can only ever move the base by
   the few sessions the fetch window clipped. Further out, the record simply
   does not reach, and the answer is null rather than a shorter window wearing
   the longer one's label.

   Polygon's lead-in (mergeOfficial in daily-bars.ts) now reaches past the
   anchor for most names, AAPL, GOOGL and SPY among them. It cannot for a
   renamed ticker or a name whose pre-split gateway prices do not match
   Polygon's adjusted ones. Measured 24 Sep 2026: META's first close is 24 Sep
   2021 at 352.96 against 345.96 on the anchor, so its 5Y read +110.82% where
   the true figure is +115.08%. NFLX, IBKR, FAST and NOW were a session or two
   late the same way. Inside the grace the window therefore says so
   (`anchored: false`), and a figure struck from a stand-in close wears that
   close's date instead of the longer window's name (sinceLabel). */
const REACH_GRACE_DAYS = 7;

/**
 * The two closes a calendar-anchored return is struck between, or null.
 *
 * `points` ascending by `at`, every price positive (toPricePoints and
 * returnsFrom both guarantee it). `endAt` pins the end to the last close at or
 * before that instant, so a benchmark can be measured over exactly the
 * subject's window rather than its own. `anchored` is false when the record
 * opens after the anchor and its first close stood in for the anchor's.
 */
export function calendarWindow<P extends Point>(
  points: readonly P[],
  years: number,
  endAt?: number,
): { from: P; to: P; anchored: boolean } | null {
  let end = points.length - 1;
  if (endAt !== undefined) {
    while (end >= 0 && points[end].at > endAt) end -= 1;
  }
  if (end < 1) return null;
  const to = points[end];
  const anchor = shiftYears(easternDay(to.at), -years);

  /* The last close on or before the anchor. Binary search: the Eastern date is
     monotonic in `at`, and a five-year scan formatting every bar's date on each
     render of the Performance tab is 1,250 Intl calls per window. */
  let lo = 0;
  let hi = end;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (easternDay(points[mid].at) <= anchor) {
      found = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }

  let from: P | null = found >= 0 ? points[found] : null;
  if (from === null) {
    const first = points[0];
    if (dayNumber(easternDay(first.at)) - dayNumber(anchor) <= REACH_GRACE_DAYS) from = first;
  }
  if (from === null || from.at >= to.at || !(from.price > 0) || !(to.price > 0)) return null;
  return { from, to, anchored: found >= 0 };
}

const SINCE = new Intl.DateTimeFormat("en-US", {
  timeZone: "UTC",
  month: "short",
  day: "numeric",
  year: "numeric",
});

/** "Since Sep 24, 2021", for an Eastern "yyyy-mm-dd": what a window that could
    not reach its anchor is called instead of "5 years". Read at UTC midnight,
    so the date is the session's own in every zone. */
export const sinceLabel = (day: string): string => `Since ${SINCE.format(Date.parse(`${day}T00:00:00Z`))}`;

/** Percent change over `years` calendar years to the latest close, or null. */
export function calendarReturn(
  points: readonly Point[],
  years: number,
  endAt?: number,
): number | null {
  const w = calendarWindow(points, years, endAt);
  return w === null ? null : (w.to.price / w.from.price - 1) * 100;
}

export function returnsFrom(points: readonly RawHistoryPoint[]): Returns {
  const series: Point[] = [];
  for (const p of points) {
    const at = parseFeedDate(p.date);
    // A non-positive price is a data hole, not a valuation.
    if (at === null || !(p.price > 0)) continue;
    series.push({ at, price: p.price });
  }
  /* Sorted rather than trusted: the gateway's polygon endpoints document a
     descending order elsewhere, and order is not worth assuming. */
  series.sort((a, b) => a.at - b.at);
  return returnsOver(series);
}

/**
 * The same three figures over a series already in hand: ascending by `at`,
 * every price positive, as toPricePoints hands them over.
 *
 * Separate from returnsFrom so a series that has been carried a session
 * further than the feed's — the instrument page ends its daily bars on the
 * card's official close, as the chart and the Performance tab do — is
 * measured by exactly the rule the feed's own series is.
 */
export function returnsOver(series: readonly Point[]): Returns {
  if (series.length < 2) return EMPTY;

  const pct = (from: number, to: number) => (to / from - 1) * 100;

  /* Neither figure is extrapolated: a record that does not reach the anchor
     (give or take the grace above) answers null. A "five-year" column drawn
     from four years of history would be a different measure wearing the same
     label, and so would a year drawn from ten months. */
  const one = calendarWindow(series, 1);
  const five = calendarWindow(series, 5);

  const out: Returns = {
    ret1y: one === null ? null : pct(one.from.price, one.to.price),
    ret5y: five === null ? null : pct(five.from.price, five.to.price),
    /* Compounded over the span the cumulative figure actually covers, which is
       five calendar years give or take the grace — not over a nominal five. */
    cagr5y:
      five === null
        ? null
        : ((five.to.price / five.from.price) ** (YEAR_MS / (five.to.at - five.from.at)) - 1) * 100,
  };
  if (one !== null && !one.anchored) out.since1y = easternDay(one.from.at);
  if (five !== null && !five.anchored) out.since5y = easternDay(five.from.at);
  return out;
}
