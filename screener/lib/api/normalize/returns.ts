import { parseFeedDate } from "./time.ts";
import type { RawHistoryPoint } from "../clients/quotes.ts";

/* One-year and five-year performance, from a single five-year history.

   The gateway charges a call per symbol per range, and the sector table wants
   both figures for every name in the sector. Asking for `1y` and `5y`
   separately would double a job that already runs to thousands of calls — so
   the five-year series answers both, with the one-year figure read from the
   point closest to a year back.

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
  return points.map((p) => {
    const f = factors.get(p);
    return f === undefined ? p : { ...p, price: p.price / f };
  });
}

export type Returns = {
  /** Percent change over the trailing year. */
  ret1y: number | null;
  /** Cumulative percent change across the whole series. */
  ret5y: number | null;
  /** Compound annual growth rate over that same span, in percent. */
  cagr5y: number | null;
};

const EMPTY: Returns = { ret1y: null, ret5y: null, cagr5y: null };

type Point = { at: number; price: number };

export function returnsFrom(points: readonly RawHistoryPoint[]): Returns {
  const series: Point[] = [];
  for (const p of points) {
    const at = parseFeedDate(p.date);
    // A non-positive price is a data hole, not a valuation.
    if (at === null || !(p.price > 0)) continue;
    series.push({ at, price: p.price });
  }
  if (series.length < 2) return EMPTY;

  /* Sorted rather than trusted: the gateway's polygon endpoints document a
     descending order elsewhere, and order is not worth assuming. */
  series.sort((a, b) => a.at - b.at);

  const last = series[series.length - 1];
  const first = series[0];
  const span = last.at - first.at;

  const pct = (from: number, to: number) => (to / from - 1) * 100;

  /* Nearest point to a year back, and only if the series actually reaches
     there — extrapolating a year from ten months is a fabricated figure.

     A week of grace, because a date exactly a year ago may have been a
     weekend or a holiday, and the nearest session can sit several days the
     wrong side of it. */
  const REACH_GRACE_MS = 7 * 86_400_000;
  const target = last.at - YEAR_MS;
  let ret1y: number | null = null;
  if (first.at <= target + REACH_GRACE_MS) {
    let best = series[0];
    for (const p of series) {
      if (Math.abs(p.at - target) < Math.abs(best.at - target)) best = p;
    }
    ret1y = pct(best.price, last.price);
  }

  /* A "five-year" column drawn from four years of history would be a
     different measure wearing the same label. */
  const years = span / YEAR_MS;
  if (years < 4.5) return { ret1y, ret5y: null, cagr5y: null };

  return {
    ret1y,
    ret5y: pct(first.price, last.price),
    cagr5y: ((last.price / first.price) ** (1 / years) - 1) * 100,
  };
}
