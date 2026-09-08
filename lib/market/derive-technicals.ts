import {
  atr,
  bollinger,
  crossover,
  ema,
  macd,
  relativeVolume,
  rsi,
  sma,
  type IndicatorPoint,
} from "./indicators.ts";
import type { PricePoint } from "../api/normalize/series.ts";
import type { InstrumentSnapshot } from "./instrument.ts";

/* The Technicals panel's readings, drawn from the bars rather than the stubs.

   The panel this feeds used to render five scalars. Three of them were the
   gateway's own `technical.*.latest` — one RSI, one 50-day average, one
   20-day — each the tip of a ten-point series the page never drew, and each
   costing a request of its own. The other two were a 52-week position and a
   beta. Under them sat a verbatim copy of the Overview panel's returns block,
   which is also the Performance tab's returns block: three renderings of the
   same four numbers on one instrument.

   Everything here is instead a pure function of `history.daily` — 1,274
   split-repaired bars, five years, oldest first — put through
   lib/market/indicators.ts. No new request, and a curve instead of a digit.

   Two rules run through all of it, and they are the same two the rest of
   lib/api/normalize works to:

   1. A reading the history cannot support is null and says what it would have
      needed. Never zero, never a partial window wearing a full window's
      label. This matters more here than anywhere else on the page because the
      output is drawn: an empty series rendered as a line along the bottom of
      its box is indistinguishable from a security that has genuinely not
      moved, and the reader has no way to tell one from the other. A flat line
      at zero is a claim about the market.

   2. Every denominator is guarded, and the answer at the degenerate point is
      decided here rather than left to IEEE 754. A NaN reaching an SVG path
      truncates the line silently — no console error, no visual complaint,
      just a shorter line than the data behind it.

   Nothing in this module knows a colour or a class name. The states it
   returns are market states; the panel decides what they look like. */

/* ------------------------------------------------------------- constants */

const DAY_MS = 86_400_000;

/* Sessions drawn in a sparkline: about six months of trading.

   The series behind these is five years long, and drawing all of it into a
   120-pixel box compresses two hundred RSI oscillations into a grey band with
   no shape at all. Six months is the shortest window in which "it has been
   falling for a fortnight" is legible, which is the entire reason the panel
   draws a line rather than printing a number. */
export const SPARK_SESSIONS = 120;

/** Sessions of ATR the current reading is ranked against: a trading year. */
const ATR_LOOKBACK = 252;

/* A percentile over three readings is noise wearing a statistic's clothes,
   and "the calmest it has been all year" is a strong sentence to print off
   one. Below this many prior readings the rank is withheld. */
const ATR_PERCENTILE_MIN = 20;

/** Sessions over which the RSI's own drift is measured, for the trend arrow. */
const RSI_DRIFT = 10;

/* Wilder's thresholds, duplicated from lib/api/normalize/technicals.ts, which
   does not export them. Duplicated rather than re-imagined: 70 and 30 are
   vocabulary, not a tuning knob, and a panel that moved them would relabel
   the same number against every other terminal — and against the Overview
   tab's insights(), which reads the same index off the same page. */
const OVERBOUGHT = 70;
const OVERSOLD = 30;

/* --------------------------------------------------------------- helpers */

type Close = { at: number; price: number };

/* indicators.ts filters each series down to the bars it will actually use,
   and does not export that filter. This repeats it — for the counting only,
   never for the arithmetic — because the shortfall sentences below quote a
   number of sessions "on file", and if that count included rows the indicator
   silently drops, the panel would say "Needs 200 sessions; 214 on file"
   directly beside a dash. A message that contradicts the thing next to it is
   worse than no message. */
function closesOf(points: readonly PricePoint[]): Close[] {
  const out: Close[] = [];
  for (const p of points) {
    if (!Number.isFinite(p.at)) continue;
    if (!(p.price > 0) || !Number.isFinite(p.price)) continue;
    out.push({ at: p.at, price: p.price });
  }
  return out.sort((a, b) => a.at - b.at);
}

/** Bars carrying a usable high and low — the only ones ATR can measure. */
function rangeBarCount(points: readonly PricePoint[]): number {
  let n = 0;
  for (const p of points) {
    if (!Number.isFinite(p.at)) continue;
    if (!(p.price > 0) || !Number.isFinite(p.price)) continue;
    if (p.high === null || p.low === null) continue;
    if (!Number.isFinite(p.high) || !Number.isFinite(p.low)) continue;
    if (p.high < p.low) continue;
    n += 1;
  }
  return n;
}

/* Volume is the one field where zero is data rather than a hole: a session in
   which nothing traded is a fact about the security. This admits it for the
   same reason relativeVolume does, and rejects only what cannot be a volume
   at all. Returned rather than counted because the baseline check below needs
   the figures themselves, not just how many there are. */
function volumesOf(points: readonly PricePoint[]): number[] {
  const out: number[] = [];
  for (const p of points) {
    if (!Number.isFinite(p.at)) continue;
    if (p.volume === null || !Number.isFinite(p.volume) || p.volume < 0) continue;
    out.push(p.volume);
  }
  return out;
}

/**
 * The sentence a panel prints where a reading would have been, or null when
 * there is a reading. Naming the shortfall is the difference between "this
 * company has no 200-day average" and "this company listed eight months ago".
 */
function shortfallOf(have: number, need: number): string | null {
  if (have >= need) return null;
  return `Needs ${need} sessions; ${have} on file.`;
}

function tail<T>(xs: readonly T[], n: number): T[] {
  return xs.slice(Math.max(0, xs.length - n));
}

function lastValue(xs: readonly IndicatorPoint[]): number | null {
  return xs.length === 0 ? null : xs[xs.length - 1].value;
}

/* Which side of a line something is on, and for how long, in the unit a
   sentence can use. The milliseconds crossover() returns are the gap between
   two bar timestamps, so this is calendar days and the panel says "days" —
   counting sessions would mean walking the series for a figure nobody reads
   differently. */
export type CrossRead = { state: "above" | "below" | null; sinceDays: number | null };

function daysSince(sinceMs: number | null): number | null {
  return sinceMs === null ? null : Math.round(sinceMs / DAY_MS);
}

/* ------------------------------------------------------------- sparkPath */

/** Two decimals is a tenth of a pixel at this size; the rest is payload. */
const round2 = (n: number): string => String(Math.round(n * 100) / 100);

/**
 * An indicator series as an SVG path, or null when there is nothing to draw.
 *
 * Points are spaced evenly by index rather than by timestamp. A true time axis
 * would open a two-day hole at every weekend and a four-day one at
 * Thanksgiving, which on a 120-pixel line reads as missing data rather than as
 * a closed market. This is a gesture at the shape of the series, not a chart.
 *
 * `bounds` fixes the vertical domain — RSI is drawn against 0-100 so the 30
 * and 70 rules beside it mean something. Without it the series scales to its
 * own extremes, which is what a sparkline of an unbounded quantity wants.
 */
export function sparkPath(
  points: readonly IndicatorPoint[],
  box: { width: number; height: number },
  bounds?: { min: number; max: number } | null,
): string | null {
  const { width, height } = box;
  if (!Number.isFinite(width) || !Number.isFinite(height)) return null;
  if (width <= 0 || height <= 0) return null;

  /* One point is a dot, not a line, and `M x y` on its own renders nothing at
     all — an empty box that looks identical to a broken one. Say null and let
     the caller print a dash it can explain. */
  if (points.length < 2) return null;

  /* A single NaN or Infinity truncates the whole path at the bad command:
     the browser draws everything up to it and stops, with no error. Half a
     line is worse than no line, because it looks like data. */
  for (const p of points) if (!Number.isFinite(p.value)) return null;

  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  if (bounds && Number.isFinite(bounds.min) && Number.isFinite(bounds.max)) {
    min = bounds.min;
    max = bounds.max;
  } else {
    for (const p of points) {
      if (p.value < min) min = p.value;
      if (p.value > max) max = p.value;
    }
  }

  const span = max - min;
  const step = width / (points.length - 1);

  let d = "";
  for (let i = 0; i < points.length; i += 1) {
    /* The last x is pinned to the edge rather than accumulated, so 120 steps
       of floating-point division cannot leave the newest session a third of a
       pixel short of the right-hand rule it is meant to sit on. */
    const x = i === points.length - 1 ? width : i * step;

    /* A flat series has zero span, and (v - min) / 0 is NaN for every point —
       the line vanishes rather than lying flat, which is the one outcome a
       reader cannot interpret. A series that did not move is drawn down the
       middle of its box, which is what it did. */
    const t = span > 0 ? (points[i].value - min) / span : 0.5;

    // Clamped so a value outside an explicit domain stays inside the box
    // instead of drawing across the panel beneath it.
    const y = height - Math.min(1, Math.max(0, t)) * height;
    d += `${i === 0 ? "M" : "L"}${round2(x)} ${round2(y)}`;
  }

  return d;
}

/* --------------------------------------------------------------- prices */

/**
 * The price every comparison on this panel is made against.
 *
 * The quote, when there is one, because that is the figure printed in the
 * header six inches above: a gap measured against some other price would have
 * the reader checking the arithmetic and finding it wrong. Where the quote is
 * missing it falls back to the last close of the same series the averages are
 * computed from, which is the only other price on the page that is real.
 */
export function referencePrice(s: InstrumentSnapshot): number | null {
  const quoted = s.profile.price;
  if (quoted !== null && Number.isFinite(quoted) && quoted > 0) return quoted;
  const closes = closesOf(s.history.daily);
  return closes.length === 0 ? null : closes[closes.length - 1].price;
}

/* -------------------------------------------------------------- momentum */

export type MomentumRead = {
  rsi: {
    latest: number | null;
    /** Points gained or lost by the index itself over ten sessions. */
    change: number | null;
    state: "overbought" | "oversold" | "neutral" | null;
    trace: IndicatorPoint[];
    shortfall: string | null;
  };
  macd: {
    line: number | null;
    signal: number | null;
    histogram: number | null;
    cross: CrossRead;
    /** The histogram, for drawing. Bars before the signal seeds are absent. */
    trace: IndicatorPoint[];
    shortfall: string | null;
  };
  /* The provider's own fourteen-day RSI, carried rather than restated.

     We prefer ours, and the reason is not that ours is better arithmetic —
     both are Wilder's. It is that ours is computed from `history.daily`,
     which getInstrumentSnapshot has already run through repairSplitBreaks,
     and the gateway's is computed from the vendor's unadjusted closes. Across
     an unapplied split the two disagree violently, and it was exactly that
     unrepaired series which once put Netflix at −93% on the peers table. Ours
     is also the series the chart above this panel draws, so a reader
     comparing the line to the reading is comparing like with like.

     It is carried anyway, and the panel prints it whenever the two differ by
     more than a point, because quietly publishing a different number from the
     one the data provider reports — with no acknowledgement anywhere — is how
     a reader loses trust in both. */
  gateway: { rsi: number | null; delta: number | null };
  /** Usable bars behind every reading here. */
  bars: number;
};

export function momentum(s: InstrumentSnapshot): MomentumRead {
  const points = s.history.daily;
  const bars = closesOf(points).length;

  /* Fourteen changes need fifteen bars; indicators.ts is explicit about the
     off-by-one and these minimums must agree with it, or the panel promises a
     reading on the exact bar the series is still empty. */
  const rsiSeries = rsi(points, 14);
  const rsiLatest = lastValue(rsiSeries);

  /* The index's own ten-session drift. An RSI of 58 says almost nothing on
     its own; 58 having come down from 74 says what the reader came for.
     Null rather than zero when the series is too short to have a past — a
     zero here reads as "momentum unchanged", which is a finding. */
  const drift =
    rsiSeries.length > RSI_DRIFT
      ? rsiSeries[rsiSeries.length - 1].value - rsiSeries[rsiSeries.length - 1 - RSI_DRIFT].value
      : null;

  const macdRows = macd(points, 12, 26, 9);
  const macdLast = macdRows.length === 0 ? null : macdRows[macdRows.length - 1];

  /* Only the rows that have a signal can contribute a histogram. The rest are
     dropped from the trace rather than plotted at zero: zero is the value the
     histogram takes at a crossover, so zero-filling the seeding rows draws
     eight crossovers at the left edge of the sparkline that never happened. */
  const histogram: IndicatorPoint[] = [];
  const macdLine: IndicatorPoint[] = [];
  const signalLine: IndicatorPoint[] = [];
  for (const row of macdRows) {
    macdLine.push({ at: row.at, value: row.macd });
    if (row.signal !== null) signalLine.push({ at: row.at, value: row.signal });
    if (row.histogram !== null) histogram.push({ at: row.at, value: row.histogram });
  }

  /* The macd line against its own signal, paired by timestamp inside
     crossover() — which is why the two arrays may be different lengths here
     and it does not matter. */
  const macdCross = crossover(macdLine, signalLine);

  const gatewayRsi = s.technical.rsi.latest;

  return {
    rsi: {
      latest: rsiLatest,
      change: drift,
      state:
        rsiLatest === null
          ? null
          : rsiLatest >= OVERBOUGHT
            ? "overbought"
            : rsiLatest <= OVERSOLD
              ? "oversold"
              : "neutral",
      trace: tail(rsiSeries, SPARK_SESSIONS),
      shortfall: shortfallOf(bars, 15),
    },
    macd: {
      line: macdLast?.macd ?? null,
      signal: macdLast?.signal ?? null,
      histogram: macdLast?.histogram ?? null,
      cross: { state: macdCross.state, sinceDays: daysSince(macdCross.sinceMs) },
      trace: tail(histogram, SPARK_SESSIONS),
      /* 26 bars give a macd line; the signal is a nine-period ema OF that
         line and seeds eight rows later, at 34. The panel shows the line as
         soon as it exists and dashes the signal until then, so the shortfall
         quoted is the signal's — it is the one the reader is missing. */
      shortfall: shortfallOf(bars, 34),
    },
    gateway: {
      rsi: gatewayRsi,
      delta:
        gatewayRsi === null || rsiLatest === null ? null : Math.abs(rsiLatest - gatewayRsi),
    },
    bars,
  };
}

/* -------------------------------------------------------- movingAverages */

export type AverageRow = {
  label: string;
  value: number | null;
  /** Reference price against the average, percent. Signed. */
  gap: number | null;
  state: "above" | "below" | null;
  trace: IndicatorPoint[];
  /** The close over exactly the trace's bars, so the pair share one box. */
  price: IndicatorPoint[];
  shortfall: string | null;
};

export type AveragesRead = {
  rows: AverageRow[];
  /** The fifty-day against the two-hundred-day. */
  cross: CrossRead & { shortfall: string | null };
};

/* The close over the same bars the indicator covers, matched by timestamp and
   not by index. The two arrays happen to align at the tail today, and would
   go on aligning right up until a bar is dropped for a bad close — at which
   point the price line would be drawn one session out of step with the
   average it is being compared to, smoothly and unnoticeably. */
function priceAlong(closes: readonly Close[], trace: readonly IndicatorPoint[]): IndicatorPoint[] {
  if (trace.length === 0) return [];
  const byAt = new Map<number, number>();
  for (const c of closes) byAt.set(c.at, c.price);

  const out: IndicatorPoint[] = [];
  for (const p of trace) {
    const price = byAt.get(p.at);
    // A trace bar with no matching close cannot be drawn against one. Rather
    // than a shorter, silently misaligned overlay, the overlay is dropped.
    if (price === undefined) return [];
    out.push({ at: p.at, value: price });
  }
  return out;
}

export function movingAverages(s: InstrumentSnapshot): AveragesRead {
  const points = s.history.daily;
  const closes = closesOf(points);
  const bars = closes.length;
  const price = referencePrice(s);

  const sma50 = sma(points, 50);
  const sma200 = sma(points, 200);
  const ema20 = ema(points, 20);

  const row = (
    label: string,
    window: number,
    series: IndicatorPoint[],
  ): AverageRow => {
    const value = lastValue(series);
    const gap = value === null || price === null || value <= 0 ? null : (price / value - 1) * 100;
    const trace = tail(series, SPARK_SESSIONS);
    return {
      label,
      value,
      gap,
      /* Exactly on the average is neither side of it. crossover() makes the
         same call for the same reason: answering with whichever way a >= falls
         prints a directional word about a security sitting precisely on its
         own mean. */
      state: gap === null || gap === 0 ? null : gap > 0 ? "above" : "below",
      trace,
      price: priceAlong(closes, trace),
      shortfall: shortfallOf(bars, window),
    };
  };

  const cross = crossover(sma50, sma200);

  return {
    rows: [row("EMA (20)", 20, ema20), row("SMA (50)", 50, sma50), row("SMA (200)", 200, sma200)],
    cross: {
      state: cross.state,
      /* Null where the crossing predates the overlap. Five years of history
         in which the fifty has never been below the two hundred is not a
         crossing five years ago; the side is known, the age is not, and
         printing the length of the fixture as the age of a signal is exactly
         the kind of confident wrong number this panel exists to stop. */
      sinceDays: daysSince(cross.sinceMs),
      // The long average is what gates the read, so it is what is quoted.
      shortfall: shortfallOf(bars, 200),
    },
  };
}

/* ------------------------------------------------------------ volatility */

export type VolatilityRead = {
  bands: {
    upper: number | null;
    middle: number | null;
    lower: number | null;
    /** Where the reference price sits across the envelope, percent. Unclamped. */
    position: number | null;
    /** The envelope's width as a percent of its middle band. */
    width: number | null;
    state: "above" | "inside" | "below" | null;
    shortfall: string | null;
  };
  atr: {
    latest: number | null;
    /** The same figure as a percent of price, which compares across names. */
    ofPrice: number | null;
    /** Where today's range sits against its own trailing year, 0-100. */
    percentile: number | null;
    trace: IndicatorPoint[];
    shortfall: string | null;
  };
  volume: {
    /** Multiples of the 30-bar baseline. 1 is an ordinary session. */
    latest: number | null;
    trace: IndicatorPoint[];
    shortfall: string | null;
    /** Why a reading is withheld despite there being sessions enough for one. */
    unreliable: string | null;
  };
};

/* Whether the baseline window describes a typical session.

   This guard is here because the daily feed's volume field is not
   trustworthy on its own terms. AAPL is reported trading 243,582 shares on 25
   August and 53,167,388 on 1 September; NVDA the same, most sessions carrying
   what looks like one venue's tape and the occasional bar carrying the
   consolidated figure. The arithmetic downstream is exact and the result is
   still meaningless: the mean of thirty such bars came to 11.9M against a
   real average nearer 50M, so the one bar in the window with a true volume
   divided by a baseline built mostly from fragments and reported 4.45x. Both
   instruments would have worn a HEAVY badge, every day, off a number that
   measures nothing but the feed's inconsistency.

   Mean against median is the standard way to ask whether a mean is
   representative, and it is not a vendor-specific patch: a ratio to an
   average is only a reading if the average describes an ordinary session. A
   real thirty-session window sits near 1 even through an earnings spike —
   one big day among thirty barely moves a median and lifts the mean by a
   tenth. The window above sits near 12. Four is well clear of anything the
   market produces and far below what a broken feed does. */
const MAX_BASELINE_SKEW = 4;

function baselineSkew(volumes: readonly number[]): number | null {
  if (volumes.length === 0) return null;
  const sorted = [...volumes].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  const median =
    sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  const mean = volumes.reduce((a, b) => a + b, 0) / volumes.length;

  /* A window in which nothing traded has no skew to measure and no baseline
     either; relativeVolume already declines to report those bars. A median of
     zero with a positive mean is the pathology at its most extreme — most of
     the window is empty and one bar carries everything. */
  if (median <= 0) return mean > 0 ? Number.POSITIVE_INFINITY : null;
  return mean / median;
}

/* Ranked against the readings BEFORE it, not against a sample containing
   itself. A percentile that includes the point being ranked can never reach
   100 however extreme the point is — the widest session in five years would
   report 99.6 — and "the most volatile it has been all year" is precisely the
   sentence this figure exists to license. */
function percentileAgainstPast(history: readonly number[], latest: number): number | null {
  if (history.length < ATR_PERCENTILE_MIN) return null;
  let below = 0;
  for (const v of history) if (v < latest) below += 1;
  return (below / history.length) * 100;
}

export function volatility(s: InstrumentSnapshot): VolatilityRead {
  const points = s.history.daily;
  const closes = closesOf(points);
  const price = referencePrice(s);

  /* ---- bollinger (20, 2σ) ---- */
  const bands = bollinger(points, 20, 2);
  const band = bands.length === 0 ? null : bands[bands.length - 1];

  const spread = band === null ? null : band.upper - band.lower;
  /* A zero-width envelope has no inside. It happens on a series that has not
     moved for twenty sessions — a halted name, a fund that has not traded —
     and %B is then 0/0. Infinity fills the meter and 50 places the price
     mid-band on evidence that does not exist, so both the position and the
     verdict are withheld. The width itself is a measured zero and stays: the
     bands really are that narrow. */
  const position =
    band === null || price === null || spread === null || spread <= 0
      ? null
      : ((price - band.lower) / spread) * 100;

  /* ---- atr (14) ---- */
  const atrSeries = atr(points, 14);
  const atrLatest = lastValue(atrSeries);
  const atrYear = tail(atrSeries, ATR_LOOKBACK);
  const atrPast = atrYear.slice(0, -1).map((p) => p.value);

  /* ---- turnover against its own baseline ---- */
  const volumeSeries = relativeVolume(points, 30);

  /* The skew is read off the same thirty bars relativeVolume measured the
     newest one against — the window preceding it, never including it. Taking
     it from a different window would let a reading through on the strength of
     a window it was not computed from. */
  const volumeRows = volumesOf(points);
  const skew = baselineSkew(volumeRows.slice(-31, -1));
  const unreliable =
    skew !== null && skew > MAX_BASELINE_SKEW
      ? "The feed's turnover for this instrument swings by orders of magnitude between sessions, so its thirty-session baseline does not describe an ordinary day. A multiple of it would measure the feed rather than the market."
      : null;

  return {
    bands: {
      upper: band?.upper ?? null,
      middle: band?.middle ?? null,
      lower: band?.lower ?? null,
      position,
      width: band === null || band.middle <= 0 ? null : ((band.upper - band.lower) / band.middle) * 100,
      state:
        position === null || band === null || price === null
          ? null
          : price > band.upper
            ? "above"
            : price < band.lower
              ? "below"
              : "inside",
      shortfall: shortfallOf(closes.length, 20),
    },
    atr: {
      latest: atrLatest,
      ofPrice:
        atrLatest === null || price === null || price <= 0 ? null : (atrLatest / price) * 100,
      percentile: atrLatest === null ? null : percentileAgainstPast(atrPast, atrLatest),
      trace: tail(atrSeries, SPARK_SESSIONS),
      // True range is measured against the previous close, so fourteen of them
      // need fifteen bars — and only bars carrying a high and a low count.
      shortfall: shortfallOf(rangeBarCount(points), 15),
    },
    volume: {
      // The whole series goes, not just the newest reading: every bar in it
      // was divided by a window drawn from the same incoherent field.
      latest: unreliable === null ? lastValue(volumeSeries) : null,
      trace: unreliable === null ? tail(volumeSeries, SPARK_SESSIONS) : [],
      // The baseline excludes the bar it measures, so a bar needs 30 before it.
      shortfall: shortfallOf(volumeRows.length, 31),
      unreliable,
    },
  };
}

/* ------------------------------------------------------------- yearRange */

export type YearRange = {
  /** 0 at the year's low, 100 at its high, or null when either is missing. */
  position: number | null;
  low: number | null;
  high: number | null;
  price: number | null;
};

/**
 * Where the price sits in its twelve-month range.
 *
 * The position is taken from `technical.rangePosition` rather than recomputed.
 * toTechnicalRead already derives it from `profile.high52`/`low52` with the
 * clamp those two figures require — they come off the quote feed's daily
 * numbers while the price is the last trade, so a stock making a new high
 * arrives here priced above its own high, and unclamped that is 103% of a
 * range. A second implementation of that clamp in this file would be a second
 * thing to keep in step, and the day they drifted apart the Overview tab and
 * this one would print different positions for the same stock.
 */
export function yearRange(s: InstrumentSnapshot): YearRange {
  return {
    position: s.technical.rangePosition,
    low: s.profile.low52,
    high: s.profile.high52,
    price: referencePrice(s),
  };
}
