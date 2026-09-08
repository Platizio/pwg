import type { PricePoint } from "../api/normalize/series.ts";

/* Trend indicators, computed here rather than fetched.

   The instrument page already downloads five years of daily bars — about
   1,274 of them — to draw its chart, and then asked the gateway separately
   for three scalars: an RSI, a 50-day SMA and a 20-day EMA, latest value
   only. Three requests, three round trips, three more things to rate-limit,
   for numbers the bars in hand already contain. Worse, a scalar cannot be
   drawn: "RSI 63" says nothing about whether it has been falling for a
   fortnight. Everything in this module is a pure function of the series the
   page already has, so the Technicals panel costs no request of its own and
   gets a curve instead of a digit.

   The rules the rest of lib/api/normalize works to apply here unchanged:

   1. A window the data cannot cover returns an empty array. It does not pad,
      seed from a partial window, or extrapolate. A 200-day average drawn from
      60 bars is a different measure wearing the same label, and every reader
      of that panel would take it at its word. `returnsFrom` in
      lib/api/normalize/returns.ts refuses to report a year from ten months of
      history for the same reason; this is that refusal, applied to windows.

   2. A non-positive or non-finite close is a hole in the data, not a
      valuation. `toPricePoints` already drops those on the way in, but these
      functions are also called with hand-built and cached series, so the
      check is repeated rather than assumed. A zero close pulled into a
      50-day average moves it by two per cent and draws a step no market
      made.

   3. Every denominator is guarded. A flat series has zero variance and no
      losses; naively that is a Bollinger band of width NaN and an RSI of
      0/0. Both cases have a correct finite answer, decided below and pinned
      by tests, because a NaN reaching the chart renders as a gap and an
      Infinity renders as a spike, and neither announces itself as a bug.

   No imports beyond the PricePoint type: this has to run inside a server
   component and inside `node --test` with no setup between them. */

/** A single plotted reading. Same shape the technicals panel already draws. */
export type IndicatorPoint = { at: number; value: number };

/* A window has to be a whole positive number of bars. A fractional window is
   almost always a units mix-up upstream — weeks passed where sessions were
   wanted — and silently rounding it would produce a plausible-looking series
   computed over the wrong period, which is the worst of the available
   outcomes. Refuse it the way an over-long window is refused. */
function isWindow(n: number): boolean {
  return Number.isInteger(n) && n > 0;
}

type Close = { at: number; price: number };

/* Sorted rather than trusted, on the same reasoning as `returnsFrom` and
   `toIndicator`: the daily feed arrives ascending, the polygon endpoints are
   documented descending, and a moving average over a reversed series still
   renders — smoothly, with a plausible shape — while describing the period
   backwards. Nothing downstream would catch it. Sorting a copy costs one
   pass over 1,274 points and removes the whole class of bug. */
function usableCloses(points: readonly PricePoint[]): Close[] {
  const out: Close[] = [];
  for (const p of points) {
    if (!Number.isFinite(p.at)) continue;
    if (!(p.price > 0) || !Number.isFinite(p.price)) continue;
    out.push({ at: p.at, price: p.price });
  }
  return out.sort((a, b) => a.at - b.at);
}

/* ------------------------------------------------------------------ sma */

/** Simple moving average of the close, one point per bar with a full window. */
export function sma(points: readonly PricePoint[], window: number): IndicatorPoint[] {
  if (!isWindow(window)) return [];
  const closes = usableCloses(points);
  if (closes.length < window) return [];

  const out: IndicatorPoint[] = [];

  /* A running sum rather than re-averaging each window: over 1,274 bars and
     a 200-day window that is 1,274 additions instead of a quarter of a
     million, and this runs on every instrument page render. Floating-point
     drift from the rolling subtraction is bounded by the price scale and is
     orders of magnitude below the cent the panel rounds to. */
  let sum = 0;
  for (let i = 0; i < closes.length; i += 1) {
    sum += closes[i].price;
    if (i >= window) sum -= closes[i - window].price;
    // Stamped at the closing bar of the window, never at its midpoint: this
    // is a trailing average and the chart must not draw it ahead of itself.
    if (i >= window - 1) out.push({ at: closes[i].at, value: sum / window });
  }

  return out;
}

/* ------------------------------------------------------------------ ema */

/* The exponential average over a bare list of numbers, so the same code
   serves both the price ema and the macd signal line — the signal is an ema
   of the macd line, not of any price, and duplicating the recurrence for it
   is how the two quietly drift apart.

   Returns one value per input from index `window - 1` onward, so the caller
   pairs result[i] with input[i + window - 1]. */
function emaValues(values: readonly number[], window: number): number[] {
  if (!isWindow(window) || values.length < window) return [];

  /* The standard 2/(n+1) smoothing constant. It is not derived from anything
     — it is the convention that makes a "20-day ema" here the same number a
     20-day ema is in every other terminal. A different constant would be
     defensible in isolation and wrong the moment a reader compared it with
     their broker's chart. */
  const k = 2 / (window + 1);

  /* Seeded from the mean of the first full window rather than from the first
     close. Seeding from a single close makes the head of the curve a
     function of one arbitrary bar, and the error decays by (1-k) per step —
     for a 200-day ema that is still a third of the way present two hundred
     bars later, right across the part of the chart people actually read. */
  let acc = 0;
  for (let i = 0; i < window; i += 1) acc += values[i];
  acc /= window;

  const out: number[] = [acc];
  for (let i = window; i < values.length; i += 1) {
    acc = values[i] * k + acc * (1 - k);
    out.push(acc);
  }
  return out;
}

/** Exponential moving average of the close, seeded from the first window's sma. */
export function ema(points: readonly PricePoint[], window: number): IndicatorPoint[] {
  if (!isWindow(window)) return [];
  const closes = usableCloses(points);
  if (closes.length < window) return [];

  const values = emaValues(closes.map((c) => c.price), window);
  return values.map((value, i) => ({ at: closes[i + window - 1].at, value }));
}

/* ------------------------------------------------------------------ rsi */

/* The reading itself, with both degenerate cases decided explicitly.

   RSI is 100 - 100/(1 + avgGain/avgLoss), which is 0/0 for a series that has
   not moved and x/0 for one that has only risen. Left unguarded the first is
   NaN and the second is Infinity; NaN draws as a gap in the line and
   Infinity draws as a spike off the top, and neither says which of the two
   it was.

   No losses but real gains is not a division blowing up, it is the genuine
   limit of the measure: nothing has fallen, so the index is at its maximum,
   100. Symmetrically, no gains is 0.

   No gains AND no losses is different in kind, and getting it wrong is easy:
   check the denominator first and a flat series falls into the "no losses"
   branch and reports 100, so the panel badges a security that has not traded
   a cent away from its open as maximally overbought. A series with no
   directional pressure at all is the definition of balanced, and balanced on
   this scale is 50. */
function rsiReading(avgGain: number, avgLoss: number): number {
  if (avgLoss === 0) return avgGain === 0 ? 50 : 100;
  if (avgGain === 0) return 0;
  return 100 - 100 / (1 + avgGain / avgLoss);
}

/** Wilder's relative strength index over the close. */
export function rsi(points: readonly PricePoint[], window = 14): IndicatorPoint[] {
  if (!isWindow(window)) return [];
  const closes = usableCloses(points);
  /* An n-period rsi is built from n *changes*, and n changes need n+1 bars.
     Off-by-one here produces a series that is right in shape and wrong by one
     bar of smoothing throughout, which no eyeball catches. */
  if (closes.length < window + 1) return [];

  /* The seed, and the only plain mean in this function: Wilder's own
     initialisation is the simple average of the first n gains and the first n
     losses. Everything after it is smoothed. */
  let avgGain = 0;
  let avgLoss = 0;
  for (let i = 1; i <= window; i += 1) {
    const change = closes[i].price - closes[i - 1].price;
    if (change > 0) avgGain += change;
    else avgLoss -= change;
  }
  avgGain /= window;
  avgLoss /= window;

  const out: IndicatorPoint[] = [
    { at: closes[window].at, value: rsiReading(avgGain, avgLoss) },
  ];

  /* Wilder smoothing, not a rolling mean over the window. This is the single
     most-got-wrong line in technical analysis, and the failure is invisible:
     a rolling mean produces a curve of the right range and roughly the right
     shape, so it looks like an RSI and reads a few points off — enough to sit
     on the wrong side of 30 or 70 and flip the panel's badge.

     The two differ in what they remember. A rolling mean drops the change
     from n bars ago entirely, so a single large move exits the average in one
     step and the line jumps on a bar where nothing happened. Wilder's average
     is a recursive one with weight (n-1)/n on its own past, so every change
     ever seen still contributes, decaying geometrically — which is what makes
     the index respond to a shock and then relax, instead of twitching once
     when the shock arrives and again exactly n bars later when it falls out
     of the window.

     Note that the effective decay is 1/n, not the 2/(n+1) of an ema above.
     They are different smoothings and a 14-period Wilder average behaves like
     a 27-period ema; substituting one for the other is the other common way
     to get a plausible, wrong RSI. */
  for (let i = window + 1; i < closes.length; i += 1) {
    const change = closes[i].price - closes[i - 1].price;
    avgGain = (avgGain * (window - 1) + (change > 0 ? change : 0)) / window;
    avgLoss = (avgLoss * (window - 1) + (change < 0 ? -change : 0)) / window;
    out.push({ at: closes[i].at, value: rsiReading(avgGain, avgLoss) });
  }

  return out;
}

/* ----------------------------------------------------------------- macd */

export type MacdPoint = {
  at: number;
  /** Fast ema less slow ema. */
  macd: number;
  /** The ema of the macd line, or null on the bars before it can seed. */
  signal: number | null;
  /** macd - signal, and null wherever the signal is. */
  histogram: number | null;
};

/* Moving average convergence/divergence.

   Three windows, and the rows they can support start at three different
   bars: the fast ema at bar 11, the slow at bar 25, and the signal — an ema
   of the macd line, not of any price — nine macd values after that, at bar
   33. So the first eight rows of a default macd have a real macd value and
   no signal yet.

   Those eight rows are emitted with signal and histogram null rather than
   dropped or zero-filled. Zero-filling is the tempting shortcut and it is
   the worst option: a zero histogram is not "no reading", it is the exact
   value the histogram takes at a crossover, so eight fabricated crossovers
   would appear at the left edge of every chart. Dropping them instead throws
   away eight bars of a macd line that is genuinely known, and would leave
   the macd starting later than the panel's own slow-ema overlay for no
   reason a reader could see. Null is the only honest one, and the chart
   already knows how to break a line at a null. */
export function macd(
  points: readonly PricePoint[],
  fast = 12,
  slow = 26,
  signal = 9,
): MacdPoint[] {
  if (!isWindow(fast) || !isWindow(slow) || !isWindow(signal)) return [];
  /* A "fast" leg at least as long as the slow one inverts the indicator:
     every value is the negative of the macd the name promises, and the
     result is a smooth, entirely plausible curve pointing the wrong way.
     There is no reading of the parameters under which that is what the
     caller meant, so it is refused rather than computed. */
  if (fast >= slow) return [];

  const closes = usableCloses(points);
  if (closes.length < slow) return [];

  const prices = closes.map((c) => c.price);
  const fastEma = emaValues(prices, fast);
  const slowEma = emaValues(prices, slow);

  /* Both arrays are trailing-aligned to their own window, so the offset
     between them is the difference of the two windows, not zero. Lining them
     up by index is the bug that shifts the whole macd line by fourteen bars
     and still produces something that oscillates around zero convincingly. */
  const offset = slow - fast;
  const line: number[] = [];
  for (let i = 0; i < slowEma.length; i += 1) line.push(fastEma[i + offset] - slowEma[i]);

  const signalLine = emaValues(line, signal);
  // Where the signal starts, expressed as an index into the macd line.
  const signalFrom = signal - 1;

  return line.map((value, i) => {
    const s = i >= signalFrom ? signalLine[i - signalFrom] : null;
    return {
      at: closes[i + slow - 1].at,
      macd: value,
      signal: s,
      histogram: s === null ? null : value - s,
    };
  });
}

/* ------------------------------------------------------------ bollinger */

export type BollingerPoint = {
  at: number;
  upper: number;
  /** The simple moving average the bands are drawn around. */
  middle: number;
  lower: number;
};

/** Bollinger bands: an sma with a deviation-scaled envelope either side. */
export function bollinger(
  points: readonly PricePoint[],
  window = 20,
  stdDevs = 2,
): BollingerPoint[] {
  if (!isWindow(window)) return [];
  // A negative width would swap the bands and draw the envelope inside out;
  // a non-finite one would put both bands at infinity and blank the chart.
  if (!Number.isFinite(stdDevs) || stdDevs < 0) return [];

  const closes = usableCloses(points);
  if (closes.length < window) return [];

  const out: BollingerPoint[] = [];

  for (let i = window - 1; i < closes.length; i += 1) {
    const from = i - window + 1;

    let sum = 0;
    for (let j = from; j <= i; j += 1) sum += closes[j].price;
    const mean = sum / window;

    /* Divided by n, not by n-1.

       These are not the same statistic and the choice is not a matter of
       taste here. `annualisedVolatility` in lib/api/normalize/performance.ts
       divides by n-1 because it is estimating the volatility of a process
       from a sample of its returns. Bollinger bands are not estimating
       anything: the window IS the population, the bands are a description of
       those twenty closes and nothing else, and Bollinger's own definition
       divides by n. Using n-1 shifts a 20-day band by about 2.6% of its
       width — invisible on a chart, and wrong against every other terminal
       drawing the same window.

       Summed from the deviations rather than as E[x²]-E[x]²: the latter is
       one pass instead of two, and it is also the form that subtracts two
       nearly equal large numbers and returns a small negative variance for a
       near-flat window, whose square root is NaN. Two passes over twenty
       bars is not worth a NaN. */
    let acc = 0;
    for (let j = from; j <= i; j += 1) acc += (closes[j].price - mean) ** 2;

    /* Clamped at zero anyway: the deviations above are non-negative by
       construction, so this only defends against a rounding residue, but a
       single NaN here propagates to both bands and draws as a gap. */
    const sd = Math.sqrt(Math.max(0, acc / window));
    const spread = sd * stdDevs;

    out.push({
      at: closes[i].at,
      upper: mean + spread,
      middle: mean,
      lower: mean - spread,
    });
  }

  return out;
}

/* ------------------------------------------------------------------ atr */

type Bar = { at: number; high: number; low: number; close: number };

/* A bar can only contribute a true range if all three of its own numbers are
   real and its high is not below its low. `high` and `low` are nullable on
   PricePoint because the intraday feed omits them on thin minutes, and a
   null read as zero makes the true range the entire price of the security —
   one such bar would dominate a fourteen-period average for the rest of the
   series. The bar is dropped rather than repaired: there is no honest value
   to put there. */
function usableBars(points: readonly PricePoint[]): Bar[] {
  const out: Bar[] = [];
  for (const p of points) {
    if (!Number.isFinite(p.at)) continue;
    if (!(p.price > 0) || !Number.isFinite(p.price)) continue;
    if (p.high === null || p.low === null) continue;
    if (!Number.isFinite(p.high) || !Number.isFinite(p.low)) continue;
    // An inverted range is a corrupt row, not a negative-width day.
    if (p.high < p.low) continue;
    out.push({ at: p.at, high: p.high, low: p.low, close: p.price });
  }
  return out.sort((a, b) => a.at - b.at);
}

/** Wilder's average true range, from high, low and the previous close. */
export function atr(points: readonly PricePoint[], window = 14): IndicatorPoint[] {
  if (!isWindow(window)) return [];
  const bars = usableBars(points);
  /* True range is defined against the *previous* close, so the first bar has
     none — there is no prior session to have gapped from. Many
     implementations quietly use its high-low as the first term; that puts a
     value in the seed which the definition does not supply, and it biases
     the whole series low, because high-low is by construction the smallest
     of the three candidates. n true ranges therefore need n+1 bars. */
  if (bars.length < window + 1) return [];

  /* Wilder's three candidates. The two gap terms are why this is not just
     the average daily range: a stock that opens ten points above yesterday's
     close and then trades in a one-point band had a violent session, and
     high-low alone would report it as the quietest name on the screen. */
  const trueRange = (bar: Bar, prevClose: number): number =>
    Math.max(
      bar.high - bar.low,
      Math.abs(bar.high - prevClose),
      Math.abs(bar.low - prevClose),
    );

  let acc = 0;
  for (let i = 1; i <= window; i += 1) acc += trueRange(bars[i], bars[i - 1].close);
  acc /= window;

  const out: IndicatorPoint[] = [{ at: bars[window].at, value: acc }];

  // The same recursive average as the rsi above, and for the same reason:
  // Wilder's, so a shock decays out of the reading instead of dropping out
  // of a window all at once n bars later.
  for (let i = window + 1; i < bars.length; i += 1) {
    acc = (acc * (window - 1) + trueRange(bars[i], bars[i - 1].close)) / window;
    out.push({ at: bars[i].at, value: acc });
  }

  return out;
}

/* ------------------------------------------------------- relativeVolume */

type Turnover = { at: number; volume: number };

/* Volume is the one field here where zero is data rather than a hole. A
   close of zero is impossible and means the row is broken; a volume of zero
   means the security did not trade that session, which happens and matters.
   So the filter admits zero and rejects only what cannot be a volume at
   all — absent, non-finite, or negative. */
function usableVolumes(points: readonly PricePoint[]): Turnover[] {
  const out: Turnover[] = [];
  for (const p of points) {
    if (!Number.isFinite(p.at)) continue;
    if (p.volume === null || !Number.isFinite(p.volume) || p.volume < 0) continue;
    out.push({ at: p.at, volume: p.volume });
  }
  return out.sort((a, b) => a.at - b.at);
}

/**
 * Each bar's volume as a multiple of the average of the `window` bars before
 * it. 1 is an ordinary day; 3 is three times normal turnover.
 */
export function relativeVolume(points: readonly PricePoint[], window = 30): IndicatorPoint[] {
  if (!isWindow(window)) return [];
  const bars = usableVolumes(points);
  /* The baseline is the window *preceding* the bar, so a bar needs window+1
     rows to have one. Including the bar in its own average is the obvious
     implementation and it defeats the measure: a day trading five times
     normal on a 30-bar window dilutes its own baseline by 13%, and reports
     4.4x instead of 5x. The bigger the spike, the more it understates it,
     which is precisely backwards for something whose only job is to catch
     unusual turnover. */
  if (bars.length < window + 1) return [];

  const out: IndicatorPoint[] = [];

  let sum = 0;
  for (let i = 0; i < window; i += 1) sum += bars[i].volume;

  for (let i = window; i < bars.length; i += 1) {
    const baseline = sum / window;

    /* A window in which nothing traded at all — a halted name, a delisted
       one, a stretch the feed simply has no turnover for — has no average to
       be a multiple of. Infinity draws as a spike off the top of the panel
       and 0 claims the bar was quiet when it was the only activity in the
       window; neither is true, so the bar gets no row. This is the same
       refusal `returnsFrom` makes rather than extrapolate a year. */
    if (baseline > 0) out.push({ at: bars[i].at, value: bars[i].volume / baseline });

    // Roll the window forward past the bar just measured.
    sum += bars[i].volume - bars[i - window].volume;
  }

  return out;
}

/* ------------------------------------------------------------ crossover */

export type CrossoverRead = {
  /** Where the fast series sits relative to the slow one, now. */
  state: "above" | "below" | null;
  /** Milliseconds since the last crossing, or null when no crossing is visible. */
  sinceMs: number | null;
};

const UNDETERMINED: CrossoverRead = { state: null, sinceMs: null };

/**
 * Which of two indicator series is on top at the newest bar they share, and
 * how long it has been there.
 */
export function crossover(
  fast: readonly IndicatorPoint[],
  slow: readonly IndicatorPoint[],
): CrossoverRead {
  if (fast.length === 0 || slow.length === 0) return UNDETERMINED;

  /* Paired by timestamp, never by index.

     The two series almost never start at the same bar — that is the entire
     point of a fast and a slow average — so a 20-day sma and a 50-day one
     over the same history are offset by thirty entries. Zipping them by
     array position compares readings six weeks apart and reports crossings
     that never happened, on a chart where the two lines visibly do not
     touch. It is a bug that survives review because the output still looks
     like a crossover signal. */
  const bySlowAt = new Map<number, number>();
  for (const p of slow) {
    if (!Number.isFinite(p.at) || !Number.isFinite(p.value)) continue;
    bySlowAt.set(p.at, p.value);
  }

  /* +1 fast on top, -1 slow on top, 0 dead level. Sorted rather than
     trusted, for the same reason as everywhere else here: these usually come
     straight from the functions above and are already ascending, but this is
     exported and a caller with a reversed series would get the age of the
     *first* crossing reported as the age of the most recent one. */
  const signs: Array<{ at: number; sign: number }> = [];
  for (const p of [...fast].sort((a, b) => a.at - b.at)) {
    if (!Number.isFinite(p.at) || !Number.isFinite(p.value)) continue;
    const other = bySlowAt.get(p.at);
    if (other === undefined) continue;
    signs.push({ at: p.at, sign: Math.sign(p.value - other) });
  }
  if (signs.length === 0) return UNDETERMINED;

  const last = signs[signs.length - 1];
  /* Exactly level is neither above nor below. It is a real state — two
     averages over a flat series are equal to the bit — and answering it with
     whichever side a > or a >= happens to fall on would have the panel print
     a directional signal for a security that has not moved. */
  if (last.sign === 0) return UNDETERMINED;

  const state = last.sign > 0 ? "above" : "below";

  /* Walk back to the first bar of the run in force. The crossing is that
     bar: it is the first one on this side of the other line. */
  let start = signs.length - 1;
  while (start > 0 && signs[start - 1].sign === last.sign) start -= 1;

  /* If the run reaches the first bar the two series share, the crossing that
     began it happened before the overlap — or never did. Dating it from the
     first shared bar would report "above for five years" on nothing more
     than a five-year history, and that figure would be printed as fact. The
     side is known; the age is not, and null is how this codebase says so. */
  if (start === 0) return { state, sinceMs: null };

  return { state, sinceMs: last.at - signs[start].at };
}
