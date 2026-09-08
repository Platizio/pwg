/* Explicit .ts extensions, matching lib/api/ and instrument-derive.ts:
   Turbopack resolves without them but `node --test` does not, and a module
   that cannot be imported outside the bundler cannot be tested. */
import {
  annualisedVolatility,
  calendarYears,
  drawdownFromHigh,
  periodReturn,
  ytdReturn,
} from "../api/normalize/performance.ts";
import type { PricePoint } from "../api/normalize/series.ts";
import type { InstrumentSnapshot } from "./instrument.ts";

/* The Performance tab's readings.

   Pure functions of the snapshot, and of nothing else. There is no clock in
   here and no fetch: every figure is measured from the same split-repaired
   daily bars the chart above the tab already draws, so nothing on this page
   can disagree with the line the reader is looking at. The arithmetic itself
   lives in lib/api/normalize/performance.ts, which is tested against its own
   contract; this module composes it, joins it against the market proxy, and
   shapes the analyst state into something a panel can render honestly.

   The rule inherited from the whole data layer, and the one worth restating
   because every function below turns on it: A FIGURE THAT CANNOT BE MEASURED
   IS NULL, AND NULL SURVIVES TO THE PANEL, WHICH DRAWS A DASH. Nought is a
   reading. A missing market column that prints 0.0% says the S&P went nowhere
   that year; a missing analyst count that prints 0 says nobody rates the
   company; a five-year return extrapolated from eleven months of bars is a
   number nobody measured. All three render as an entirely ordinary page, and
   that is exactly what makes them dangerous.

   Nothing here includes dividends. Every percentage below is a PRICE return
   measured from `RawHistoryPoint.price` — the close — with splits repaired
   upstream, and there is no dividend adjustment anywhere in this repository.
   On a high-yield name held five years the gap between a price return and a
   dividend-inclusive one is material, so the panel states which of the two it
   is showing and must never imply the other. */

/* ── the market proxy ───────────────────────────────────────────────────── */

/* How far apart two records' last observations may sit and still be compared
   bar-for-bar. A long weekend with a holiday on either side is four days; more
   than that is not two views of the same week. */
const ALIGNMENT_SLACK_MS = 4 * 86_400_000;

/* The proxy's bars, but only where they can honestly stand beside the
   subject's.

   Every rolling window below is an INDEX lookback — 252 bars back on each
   series — and that compares like with like only while the two records are
   date-aligned. Today they are: `getInstrumentSnapshot` fetches both from the
   same history endpoint, for the same five-year range, in the same fan-out, so
   they arrive the same length with the same dates. But that is an observation
   about the data rather than a guarantee of the type. A proxy leg served from
   a stale cache, or a subject halted for a fortnight, would put the fund's
   2025 in the same row as the company's 2026 under one header — and the page
   would look completely normal while doing it.

   So the alignment is checked rather than assumed, and where it fails the
   market column is empty. A dash says "we are not showing you this"; a
   silently misaligned number says nothing at all. */
function comparableMarket(s: InstrumentSnapshot): PricePoint[] | null {
  const pts = s.history.daily;
  const mkt = s.market?.daily ?? null;
  if (mkt === null || mkt.length === 0 || pts.length === 0) return null;

  const drift = Math.abs(mkt[mkt.length - 1].at - pts[pts.length - 1].at);
  return drift <= ALIGNMENT_SLACK_MS ? mkt : null;
}

/* ── relative strength ─────────────────────────────────────────────────── */

/**
 * The subject's return expressed against the market's, in percent.
 *
 * COMPOUNDED, NOT SUBTRACTED, and the distinction is the whole point of the
 * column. A stock that quadrupled while the fund doubled is worth twice what
 * the fund is worth: +100% relative. Subtracting the two cumulative figures
 * instead — 300 less 100 — yields 200 "percentage points", which is not a
 * return anybody earned and is precisely the number a reader will read as one.
 *
 * The two conventions agree closely over a month and diverge without limit
 * over five years, which is why the wrong one survives review: the top of the
 * table looks right while the bottom of it is nonsense.
 *
 * Null when either leg is missing, and null when the market lost everything —
 * there is no dividing by a growth factor of nought, and an Infinity here
 * would reach the page as the text "Infinity%".
 */
export function relativeReturn(stock: number | null, market: number | null): number | null {
  if (stock === null || market === null) return null;
  if (!Number.isFinite(stock) || !Number.isFinite(market)) return null;

  const marketFactor = 1 + market / 100;
  if (!(marketFactor > 0)) return null;

  const relative = ((1 + stock / 100) / marketFactor - 1) * 100;
  return Number.isFinite(relative) ? relative : null;
}

/* ── rolling periods ───────────────────────────────────────────────────── */

export type PeriodKey = "1m" | "3m" | "6m" | "ytd" | "1y" | "3y" | "5y";

export type PeriodRow = {
  key: PeriodKey;
  /** Matches the `PERIODS` label for every window measured in sessions. */
  label: string;
  /** Trading sessions in the lookback, or null where the window is a calendar boundary. */
  sessions: number | null;
  /** The subject's price return over the window, percent. */
  stock: number | null;
  /** The tracking fund's, over the same window. */
  market: number | null;
  /** The subject against the fund, compounded. See `relativeReturn`. */
  relative: number | null;
};

/* The windows this table shows.

   The session counts restate `PERIODS`, which is where they are defined, and
   tests/derive-performance.test.ts pins the two together so they cannot drift:
   a "1 year" here that is not the maths module's year would mean two tabs of
   this terminal quietly measuring different things under one word.

   They are restated rather than imported wholesale for two reasons. `PERIODS`
   opens with a one-week window, which on a page about multi-year performance
   is noise next to a five-year row. And year-to-date is not a session count at
   all — it is a calendar boundary — so it cannot live in that array, and
   `sessions: null` is how this row says so rather than claiming a length it
   does not have. */
const WINDOWS: ReadonlyArray<{ key: PeriodKey; label: string; sessions: number | null }> = [
  { key: "1m", label: "1 month", sessions: 21 },
  { key: "3m", label: "3 months", sessions: 64 },
  { key: "6m", label: "6 months", sessions: 126 },
  { key: "ytd", label: "Year to date", sessions: null },
  { key: "1y", label: "1 year", sessions: 252 },
  { key: "3y", label: "3 years", sessions: 756 },
  { key: "5y", label: "5 years", sessions: 1260 },
];

/**
 * Rolling returns over each window, with the market proxy beside them.
 *
 * `periodReturn` refuses a window the series does not reach, and that refusal
 * is carried straight through: a company listed eleven months ago has no
 * five-year row, and the honest cell is a dash rather than its whole listed
 * history relabelled. `returnsFrom` sets the same standard for the trailing
 * year elsewhere in this repo.
 */
export function rollingPeriods(s: InstrumentSnapshot): PeriodRow[] {
  const pts = s.history.daily;
  const mkt = comparableMarket(s);

  /* The series' own last timestamp, not a clock. A Date.now() in a render path
     is what the whole data layer is built to avoid: it makes the server and
     the client disagree about which year it is, and on the turn of a new year
     it would move the year-to-date boundary mid-hydration.

     Both legs are measured as of the SAME instant — the subject's last bar —
     so the two year-to-date figures cannot be struck from different years. */
  const asOf = pts.length ? pts[pts.length - 1].at : 0;

  const measure = (series: readonly PricePoint[], sessions: number | null) =>
    sessions === null ? ytdReturn(series, asOf) : periodReturn(series, sessions);

  return WINDOWS.map((w) => {
    const stock = pts.length ? measure(pts, w.sessions) : null;
    const market = mkt === null ? null : measure(mkt, w.sessions);
    return {
      key: w.key,
      label: w.label,
      sessions: w.sessions,
      stock,
      market,
      relative: relativeReturn(stock, market),
    };
  });
}

/* ── calendar years ────────────────────────────────────────────────────── */

export type CalendarRow = {
  year: number;
  /** First close to last close within the year, percent. */
  stock: number | null;
  market: number | null;
  relative: number | null;
  /* True where the record does not span the whole year, so the figure is a
     part-year change rather than a calendar-year return. */
  partial: boolean;
};

/* How much of January may be missing before the opening year counts as
   partial, and how much of December before the closing one does. A record
   whose first bar is the 6th lost a holiday and a weekend, not a month. */
const OPENS_BY_DAY = 10;
const CLOSES_FROM_DAY = 24;

/**
 * One row per calendar year the record covers, newest first, with the market's
 * own year beside it.
 *
 * The two are joined BY YEAR rather than by position, because the proxy's
 * record may not open in the same year the subject's does — a company listed
 * two years ago sits inside five years of fund history. A year the proxy does
 * not reach is null: nought in that column would tell a reader the S&P was
 * flat that year, which is a claim about the index that nobody made.
 *
 * `partial` exists because a five-year window opens and closes mid-year, so
 * the first and last rows of this table are not calendar-year returns at all.
 * Printed unmarked between four full years they invite a straight comparison
 * between a twelve-month figure and an eight-month one, and the eight-month
 * one always loses. The panel marks them.
 */
export function calendarYearRows(s: InstrumentSnapshot, limit = 6): CalendarRow[] {
  const pts = s.history.daily;
  if (pts.length === 0) return [];

  const first = pts[0];
  const last = pts[pts.length - 1];
  const firstYear = new Date(first.at).getUTCFullYear();
  const lastYear = new Date(last.at).getUTCFullYear();

  const isPartial = (year: number): boolean =>
    (year === firstYear && first.at > Date.UTC(year, 0, OPENS_BY_DAY)) ||
    (year === lastYear && last.at < Date.UTC(year, 11, CLOSES_FROM_DAY));

  /* A Map rather than a lookup with `?? 0`: `has` distinguishes "the proxy
     reported nothing for this year" from "the proxy reported a flat year", and
     those are different sentences. */
  const marketYears = new Map(
    calendarYears(comparableMarket(s) ?? []).map((y) => [y.year, y.change] as const),
  );

  return calendarYears(pts)
    .slice(0, limit)
    .map((y) => {
      const market = marketYears.has(y.year) ? (marketYears.get(y.year) ?? null) : null;
      return {
        year: y.year,
        stock: y.change,
        market,
        relative: relativeReturn(y.change, market),
        partial: isPartial(y.year),
      };
    });
}

/* ── risk ──────────────────────────────────────────────────────────────── */

export type RiskView = {
  /** Annualised standard deviation of daily returns across the whole record. */
  volatility: number | null;
  /** The same, over the last year of sessions only. */
  volatility1y: number | null;
  marketVolatility: number | null;
  marketVolatility1y: number | null;
  /** The deepest fall from a running peak in the record. Never positive. */
  maxDrawdown: number | null;
  /** When that trough was struck, and the peak it fell from. Epoch ms. */
  maxDrawdownAt: number | null;
  maxDrawdownPeakAt: number | null;
  marketMaxDrawdown: number | null;
  /** How far below the record's own highest close the last close sits. */
  currentDrawdown: number | null;
  marketCurrentDrawdown: number | null;
  /** The same measure against the quoted twelve-month high the header shows. */
  drawdownFrom52WeekHigh: number | null;
  beta: number | null;
  cagr5y: number | null;
  /** Daily bars the figures above were measured from. */
  sessions: number;
};

/** A year of sessions, plus the extra bar a return needs a predecessor for. */
const ONE_YEAR_WINDOW = 253;

type Drawdown = { worst: number | null; worstAt: number | null; peakAt: number | null; current: number | null };

const NO_DRAWDOWN: Drawdown = { worst: null, worstAt: null, peakAt: null, current: null };

/* The deepest peak-to-trough fall in a record, and where the price sits
   against its high today.

   Measured from a RUNNING peak, which is the only definition that means
   anything. Against the first price of the record instead, a stock that opened
   the window at its cheapest would report no drawdown at all however far it
   fell later; against the final high, every fall before the last peak
   disappears. The running peak is what an investor actually experienced: the
   worst it got, from the best it had been at the time.

   `drawdownFromHigh` does the arithmetic and the clamping, so a price above
   its own recorded high — two feeds disagreeing, not a gain — cannot come back
   positive from here either. */
function drawdownOf(points: readonly PricePoint[]): Drawdown {
  if (points.length === 0) return NO_DRAWDOWN;

  let peak = 0;
  let peakAt: number | null = null;
  let worst: number | null = null;
  let worstAt: number | null = null;
  let worstPeakAt: number | null = null;
  let current: number | null = null;

  for (const p of points) {
    if (p.price > peak) {
      peak = p.price;
      peakAt = p.at;
    }

    /* Null here means a non-positive price or peak. `toPricePoints` already
       drops those, so this is belt and braces — but recording it as 0 would
       claim the instrument was sitting exactly on its high, which is the one
       reading a data hole must never masquerade as. */
    const fall = drawdownFromHigh(p.price, peak);
    if (fall === null) continue;

    current = fall;
    if (worst === null || fall < worst) {
      worst = fall;
      worstAt = p.at;
      worstPeakAt = peakAt;
    }
  }

  return { worst, worstAt, peakAt: worstPeakAt, current };
}

/**
 * Volatility and drawdown, for the subject and for the market proxy beside it.
 *
 * Volatility is reported over two spans on purpose. The five-year figure is
 * the character of the instrument; the trailing year is the character of it
 * now, and a name that has calmed down or come apart in the last twelve months
 * shows the difference between them. `annualisedVolatility` needs twenty
 * sessions to say anything and returns null below that rather than annualising
 * a fortnight, which would produce a large and entirely invented number.
 */
export function riskProfile(s: InstrumentSnapshot): RiskView {
  const pts = s.history.daily;
  const mkt = comparableMarket(s);

  const fall = drawdownOf(pts);
  const marketFall = mkt === null ? NO_DRAWDOWN : drawdownOf(mkt);

  return {
    volatility: annualisedVolatility(pts),
    volatility1y: annualisedVolatility(pts.slice(-ONE_YEAR_WINDOW)),
    marketVolatility: mkt === null ? null : annualisedVolatility(mkt),
    marketVolatility1y: mkt === null ? null : annualisedVolatility(mkt.slice(-ONE_YEAR_WINDOW)),

    maxDrawdown: fall.worst,
    maxDrawdownAt: fall.worstAt,
    maxDrawdownPeakAt: fall.peakAt,
    marketMaxDrawdown: marketFall.worst,

    currentDrawdown: fall.current,
    marketCurrentDrawdown: marketFall.current,

    /* The quoted twelve-month high, which is a different number from the
       record's own highest close: it comes from the quote feed rather than
       from these bars, and it is the one the price header shows. Keeping both
       lets the two agree in public rather than quietly diverge. */
    drawdownFrom52WeekHigh: drawdownFromHigh(s.profile.price, s.profile.high52),

    beta: s.profile.beta,
    cagr5y: s.returns.cagr5y,
    sessions: pts.length,
  };
}

/* ── the underwater curve ──────────────────────────────────────────────── */

export type DrawdownPoint = { at: number; pct: number };

/**
 * The record as a drawdown series — how far below its running peak the price
 * sat on each day — downsampled for drawing.
 *
 * Downsampled BY BUCKET MINIMUM, not by taking every Nth bar. The obvious
 * implementation is the one that deletes the crash: a −50% session that falls
 * between two sampled points simply is not in the output, and the chart draws
 * a calm five years straight over the worst week in the record. Taking the
 * worst point in each bucket is the only sampling that cannot make an
 * instrument look safer than it was.
 *
 * The final bar is then appended in its own right, because the right-hand edge
 * of this curve is the reader's "and where are we now" — and it has to agree
 * with the drawdown figure printed beside the chart. A bucket minimum there
 * would draw the instrument deeper underwater than it currently is.
 */
export function drawdownCurve(s: InstrumentSnapshot, samples = 180): DrawdownPoint[] {
  const pts = s.history.daily;
  if (pts.length === 0) return [];

  const full: DrawdownPoint[] = [];
  let peak = 0;
  for (const p of pts) {
    if (p.price > peak) peak = p.price;
    const fall = drawdownFromHigh(p.price, peak);
    // See drawdownOf: a hole is skipped, never drawn as a day at the high.
    if (fall !== null) full.push({ at: p.at, pct: fall });
  }

  const buckets = Math.max(1, Math.floor(samples));
  if (full.length <= buckets) return full;

  const out: DrawdownPoint[] = [];
  const size = full.length / buckets;
  for (let b = 0; b < buckets; b += 1) {
    const start = Math.floor(b * size);
    const end = Math.min(full.length, Math.floor((b + 1) * size));
    if (end <= start) continue;

    let worst = full[start];
    for (let i = start + 1; i < end; i += 1) {
      if (full[i].pct < worst.pct) worst = full[i];
    }
    out.push(worst);
  }

  const final = full[full.length - 1];
  if (out.length === 0 || out[out.length - 1].at !== final.at) out.push(final);
  return out;
}

/* ── the analyst view ──────────────────────────────────────────────────── */

export type AnalystRatingSplit = {
  buy: number | null;
  hold: number | null;
  sell: number | null;
  total: number | null;
  /** The vendor's own `total_analysts`, for the disagreement below. */
  reportedTotal: number | null;
  totalDisputed: boolean;
  /* Each bucket as a percent of the covered street, for the distribution bar.
     Null unless all three counts are present and at least one analyst sits in
     them. */
  shares: { buy: number; hold: number; sell: number } | null;
};

export type AnalystTargetView = {
  consensus: number | null;
  low: number | null;
  high: number | null;
  /** ISO 4217, or null where the gateway did not say. NEVER defaulted to USD. */
  currency: string | null;
  /** Where the last price sits inside low–high, 0–100, clamped. */
  pricePosition: number | null;
  /** Where the consensus target sits on the same rail. */
  consensusPosition: number | null;
  /** True where the price sits outside the published range and was clamped. */
  priceOutsideRange: boolean;
};

/* What the panel renders, one closed union, mirroring `AnalystAvailability`.

   The four states stay four states. `not-entitled` is a fact about this
   account — the endpoint exists, our subscription does not reach it.
   `no-coverage` is a fact about this company — we asked with a valid
   entitlement and the street had nothing. `unavailable` is a fact about the
   request — it failed, and we do not know which of the other two is true.
   Collapsing any pair of them publishes a claim nobody made, and the worst of
   those claims is telling a reader that no analyst covers Apple because our
   subscription is short.

   No prose lives in these variants, for the same reason none lives in
   `AnalystAvailability`: wording belongs to the panel, which knows its own
   tone and column width. */
export type AnalystView =
  | {
      state: "available";
      /** The vendor's label, verbatim and untranslated. */
      label: string | null;
      ratings: AnalystRatingSplit;
      target: AnalystTargetView;
      /* The DERIVED upside, computed by `toAnalystConsensus` from the target
         and this repo's own price. `vendorUpsideUnverified` is deliberately
         not carried onto this view at all: its unit is unconfirmed — 12.4 and
         0.124 mean the same thing and nobody has seen a live body to settle
         which arrives — and a hundredfold error in an upside column is
         invisible on the page. It cannot be bound to by accident if it is not
         here to bind to. */
      upsidePct: number | null;
      /* The price that upside was struck against, so the panel can show the
         basis rather than asking the reader to take the percentage on trust.
         It is `profile.price`, the same figure `toAnalystConsensus` was handed
         when this snapshot was assembled. */
      price: number | null;
    }
  | { state: "not-entitled"; status: number }
  | { state: "no-coverage" }
  | { state: "unavailable"; status: number };

/** Position on a low–high rail, 0–100, or null where the rail is not real. */
function railPosition(
  value: number | null,
  low: number | null,
  high: number | null,
): { position: number | null; outside: boolean } {
  /* A range of no width has no denominator, and a rail drawn from one puts a
     marker at an arbitrary point on a line that means nothing. */
  if (value === null || low === null || high === null || !(high > low)) {
    return { position: null, outside: false };
  }

  const raw = ((value - low) / (high - low)) * 100;
  if (!Number.isFinite(raw)) return { position: null, outside: false };

  return { position: Math.max(0, Math.min(100, raw)), outside: raw < 0 || raw > 100 };
}

/**
 * `snapshot.analyst`, shaped for rendering — and kept honest on the way.
 *
 * This is the only section of the Performance tab that is not derived from the
 * price record, which makes it the only section that can be wrong about
 * something outside this terminal. Today every analyst path on this account
 * answers 403/4031, so `not-entitled` is the branch every ticker takes and the
 * rest of this function has never run against a live body. It is written
 * anyway, because the day the entitlement lands it must fill itself correctly
 * rather than plausibly. See the re-check list at the top of
 * lib/api/normalize/analyst.ts before trusting any of it.
 */
export function analystView(s: InstrumentSnapshot): AnalystView {
  const availability = s.analyst;

  switch (availability.state) {
    case "not-entitled":
      return { state: "not-entitled", status: availability.status };
    case "no-coverage":
      return { state: "no-coverage" };
    case "unavailable":
      return { state: "unavailable", status: availability.status };
  }

  const { label, ratings, target, upsidePct } = availability.consensus;

  /* A distribution bar needs all three buckets. Drawn from two, it scales the
     two it has to the full width of the street and hides the third entirely —
     a company with twelve sells and an unreported hold count would render as
     two-thirds buy. Null here, and the panel prints the counts it has without
     the bar.

     The denominator is the sum of the three rather than `total`, so the
     segments add up to exactly the bar that is drawn. Where the breakdown is
     complete the two are the same number by construction: `total` IS the sum
     whenever all three are present. */
  const { buy, hold, sell } = ratings;
  const rated = buy !== null && hold !== null && sell !== null ? buy + hold + sell : null;
  const shares =
    rated !== null && rated > 0
      ? {
          buy: ((buy as number) / rated) * 100,
          hold: ((hold as number) / rated) * 100,
          sell: ((sell as number) / rated) * 100,
        }
      : null;

  const price = railPosition(s.profile.price, target.low, target.high);
  const consensusMark = railPosition(target.consensus, target.low, target.high);

  return {
    state: "available",
    label,
    ratings: {
      buy,
      hold,
      sell,
      total: ratings.total,
      reportedTotal: ratings.reportedTotal,
      totalDisputed: ratings.totalDisputed,
      shares,
    },
    target: {
      consensus: target.consensus,
      low: target.low,
      high: target.high,
      currency: target.currency,
      pricePosition: price.position,
      /* A consensus outside its own published low–high is an internally
         inconsistent record. Clamping it would draw a marker hard against a
         label reading "$350" while the figure beside it says "$400" and leave
         the reader to resolve the contradiction. The range and the figure both
         survive; the marker does not. */
      consensusPosition: consensusMark.outside ? null : consensusMark.position,
      priceOutsideRange: price.outside,
    },
    upsidePct,
    price: s.profile.price,
  };
}
