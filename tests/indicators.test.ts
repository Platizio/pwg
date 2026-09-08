import { test } from "node:test";
import assert from "node:assert/strict";
import {
  atr,
  bollinger,
  crossover,
  ema,
  macd,
  relativeVolume,
  rsi,
  sma,
} from "../lib/market/indicators.ts";
import type { IndicatorPoint } from "../lib/market/indicators.ts";
import type { PricePoint } from "../lib/api/normalize/series.ts";

const DAY = 86_400_000;
const T0 = Date.UTC(2026, 0, 5);

/** A bar whose OHLC all sit at `price` unless told otherwise. */
function bar(i: number, price: number, extra: Partial<PricePoint> = {}): PricePoint {
  return {
    at: T0 + i * DAY,
    price,
    open: price,
    high: price,
    low: price,
    volume: 1_000,
    ...extra,
  };
}

/** Bars from a list of closes, oldest first, one trading day apart. */
function closes(values: readonly number[]): PricePoint[] {
  return values.map((v, i) => bar(i, v));
}

/** Assert two floats agree to `eps`, reporting both when they do not. */
function near(actual: number, expected: number, eps = 1e-9): void {
  assert.ok(
    Math.abs(actual - expected) <= eps,
    `expected ${expected}, got ${actual} (delta ${Math.abs(actual - expected)})`,
  );
}

/* ------------------------------------------------------------------ sma */

test("sma averages each trailing window and stamps it at the closing bar", () => {
  /* Hand-computed, closes 1..5 with a three-bar window:
       (1+2+3)/3 = 2   at bar 2
       (2+3+4)/3 = 3   at bar 3
       (3+4+5)/3 = 4   at bar 4
     The first two bars have no complete window and so produce no point at
     all — the series starts where the average becomes real. */
  const out = sma(closes([1, 2, 3, 4, 5]), 3);
  assert.equal(out.length, 3);
  assert.deepEqual(out.map((p) => p.at), [T0 + 2 * DAY, T0 + 3 * DAY, T0 + 4 * DAY]);
  assert.deepEqual(out.map((p) => p.value), [2, 3, 4]);
});

test("sma refuses a window longer than the series rather than averaging what it has", () => {
  // A "50-day average" computed from 10 bars is a different number wearing
  // the same label; the panel gets nothing and prints a dash.
  assert.deepEqual(sma(closes([1, 2, 3]), 50), []);
  assert.deepEqual(sma([], 3), []);
  assert.deepEqual(sma(closes([1]), 1), [{ at: T0, value: 1 }]);
});

test("sma sorts the series rather than trusting the order it arrives in", () => {
  const scrambled = [bar(4, 5), bar(0, 1), bar(3, 4), bar(2, 3), bar(1, 2)];
  assert.deepEqual(sma(scrambled, 3).map((p) => p.value), [2, 3, 4]);
});

test("sma treats a non-positive or non-finite close as a hole, not as zero", () => {
  /* A zero close would drag a three-bar average down by a third and draw a
     cliff nothing in the market produced. The bar is dropped, so the window
     closes over the three surviving closes 1, 2, 4 -> 7/3. */
  const holed = [bar(0, 1), bar(1, 2), bar(2, 0), bar(3, 4), bar(4, Number.NaN)];
  const out = sma(holed, 3);
  assert.equal(out.length, 1);
  near(out[0].value, 7 / 3);
  assert.equal(out[0].at, T0 + 3 * DAY);
});

test("sma rejects a nonsensical window instead of inventing a shape for it", () => {
  assert.deepEqual(sma(closes([1, 2, 3]), 0), []);
  assert.deepEqual(sma(closes([1, 2, 3]), -3), []);
  assert.deepEqual(sma(closes([1, 2, 3]), 1.5), []);
});

/* ------------------------------------------------------------------ ema */

test("ema seeds from the first full window's mean and then smooths at 2/(n+1)", () => {
  /* Hand-computed, closes 2,4,6,8,10,12 with a three-bar window.
     k = 2/(3+1) = 0.5.
       seed at bar 2 = (2+4+6)/3      = 4
       bar 3         = 8*0.5 + 4*0.5  = 6
       bar 4         = 10*0.5 + 6*0.5 = 8
       bar 5         = 12*0.5 + 8*0.5 = 10 */
  const out = ema(closes([2, 4, 6, 8, 10, 12]), 3);
  assert.equal(out.length, 4);
  assert.deepEqual(out.map((p) => p.at), [
    T0 + 2 * DAY, T0 + 3 * DAY, T0 + 4 * DAY, T0 + 5 * DAY,
  ]);
  out.map((p) => p.value).forEach((v, i) => near(v, [4, 6, 8, 10][i]));
});

test("ema's first point is exactly the sma of the same window", () => {
  // Seeding from the first close instead of the window's mean makes the head
  // of the curve depend on one arbitrary bar and takes ~3n bars to wash out.
  const pts = closes([7, 3, 11, 5, 9, 2, 8]);
  const e = ema(pts, 4);
  const s = sma(pts, 4);
  assert.equal(e[0].at, s[0].at);
  near(e[0].value, s[0].value);
});

test("ema weights the newest bar more heavily than a plain average does", () => {
  /* The distinction that justifies having both: after a jump, the ema must
     sit closer to the new level than the sma over the same window. */
  const pts = closes([10, 10, 10, 10, 10, 20]);
  const e = ema(pts, 5);
  const s = sma(pts, 5);
  const last = (xs: IndicatorPoint[]) => xs[xs.length - 1].value;
  assert.ok(last(e) > last(s), `ema ${last(e)} should lead sma ${last(s)}`);
});

test("ema refuses a window longer than the series and handles the degenerate ones", () => {
  assert.deepEqual(ema(closes([1, 2, 3]), 50), []);
  assert.deepEqual(ema([], 3), []);
  assert.deepEqual(ema(closes([1, 2, 3]), 0), []);
  // k = 2/(1+1) = 1: a one-bar ema is the close itself, not a smoothed thing.
  assert.deepEqual(ema(closes([4, 9]), 1), [
    { at: T0, value: 4 },
    { at: T0 + DAY, value: 9 },
  ]);
});

test("ema of a flat series is that flat value, with no drift", () => {
  const out = ema(closes([50, 50, 50, 50, 50, 50, 50, 50]), 4);
  assert.equal(out.length, 5);
  for (const p of out) near(p.value, 50);
});

/* ------------------------------------------------------------------ rsi */

test("rsi smooths the way Wilder does, not as a rolling mean of the window", () => {
  /* Worked by hand, closes 10, 11, 10, 12, 13, 12 with window 3.
     Changes: +1, -1, +2, +1, -1.

     Seed (a plain mean of the first three changes, which is the only place a
     plain mean belongs):
       avgGain = (1 + 0 + 2)/3 = 1
       avgLoss = (0 + 1 + 0)/3 = 1/3
       RS = 3            RSI = 100 - 100/4 = 75            at bar 3

     Then Wilder smoothing, avg = (prev*(n-1) + current)/n:
       bar 4, change +1
         avgGain = (1*2 + 1)/3     = 1
         avgLoss = ((1/3)*2 + 0)/3 = 2/9
         RS = 4.5          RSI = 100 - 100/5.5 = 900/11 = 81.8181...
       bar 5, change -1
         avgGain = (1*2 + 0)/3       = 2/3
         avgLoss = ((2/9)*2 + 1)/3   = 13/27
         RS = 18/13        RSI = 100 - 1300/31 = 1800/31 = 58.0645...

     A rolling three-change mean would report 75 at every one of those bars,
     because the last three changes are the same multiset each time. That is
     the classic wrong implementation and this is the assertion that catches
     it. */
  const out = rsi(closes([10, 11, 10, 12, 13, 12]), 3);
  assert.equal(out.length, 3);
  assert.deepEqual(out.map((p) => p.at), [T0 + 3 * DAY, T0 + 4 * DAY, T0 + 5 * DAY]);
  near(out[0].value, 75);
  near(out[1].value, 900 / 11);
  near(out[2].value, 1800 / 31);
  assert.notEqual(out[1].value, 75, "a rolling mean would print 75 here");
});

test("rsi matches the standard 14-period worked example", () => {
  /* The textbook series. Its first fourteen changes give
       sum of gains  = 3.3374,  avgGain = 3.3374/14
       sum of losses = 1.3943,  avgLoss = 1.3943/14
       RS = 3.3374/1.3943 = 2.3936025
       RSI = 100 - 100*1.3943/4.7317 = 70.5327895
     and one Wilder step on the next change (46.0028 - 46.2820 = -0.2792):
       avgGain = 13*3.3374/196          = 43.3862/196
       avgLoss = (13*1.3943 + 3.9088)/196 = 22.0347/196
       RS = 43.3862/22.0347 = 1.9689946
       RSI = 100 - 100*22.0347/65.4209 = 66.3185619

     Both are written below as those exact quotients rather than as rounded
     decimals: carrying seven significant figures through the long division by
     hand loses the seventh, and a tolerance loose enough to absorb that is
     also loose enough to absorb a real smoothing bug. */
  const series14 = [
    44.3389, 44.0902, 44.1497, 43.6124, 44.3278, 44.8264, 45.0955, 45.4245,
    45.8433, 46.0826, 45.8931, 46.0328, 45.6140, 46.2820, 46.2820, 46.0028,
    46.0328, 46.4116, 46.2222, 45.6439, 46.2122, 46.2521, 45.7137, 46.4515,
    45.7835, 45.3548, 44.0288, 44.1783, 44.2181, 44.5672, 43.4205, 42.6628,
    43.1314,
  ];
  const out = rsi(closes(series14));
  // 33 closes, 32 changes, the first fourteen consumed by the seed.
  assert.equal(out.length, 19);
  near(out[0].value, 100 - 139.43 / 4.7317, 1e-9);
  near(out[1].value, 100 - 2203.47 / 65.4209, 1e-9);
  for (const p of out) assert.ok(p.value >= 0 && p.value <= 100, `out of range: ${p.value}`);
});

test("rsi of a flat series is 50, not 100 and not NaN", () => {
  /* Zero gains and zero losses is 0/0. Returning 100 — which is what
     "no losses, so RS is infinite" gives if the numerator is not checked
     first — would badge a security that has not moved a cent as maximally
     overbought, and the panel's overbought threshold would fire on it.
     No movement in either direction is the definition of balanced: 50. */
  const out = rsi(closes([25, 25, 25, 25, 25, 25]), 3);
  assert.equal(out.length, 3);
  for (const p of out) assert.equal(p.value, 50);
});

test("rsi is 100 with no losses and 0 with no gains", () => {
  // Genuinely one-directional, unlike the flat case: here RS really is
  // unbounded, and 100 is the defined limit rather than a division blowing up.
  for (const p of rsi(closes([1, 2, 3, 4, 5, 6]), 3)) assert.equal(p.value, 100);
  for (const p of rsi(closes([6, 5, 4, 3, 2, 1]), 3)) assert.equal(p.value, 0);
});

test("rsi needs a full window of changes, so window + 1 bars", () => {
  // Three bars give two changes; a three-period rsi needs three.
  assert.deepEqual(rsi(closes([1, 2, 3]), 3), []);
  assert.equal(rsi(closes([1, 2, 3, 4]), 3).length, 1);
  assert.deepEqual(rsi(closes([1, 2, 3]), 50), []);
  assert.deepEqual(rsi([], 14), []);
  assert.deepEqual(rsi(closes([5]), 14), []);
  assert.deepEqual(rsi(closes([1, 2, 3, 4]), 0), []);
});

test("rsi defaults to the fourteen periods every other terminal means by rsi", () => {
  const pts = closes(Array.from({ length: 40 }, (_, i) => 100 + Math.sin(i) * 5));
  assert.deepEqual(rsi(pts), rsi(pts, 14));
  assert.equal(rsi(pts).length, 40 - 14);
});

test("rsi drops a holed bar rather than reading it as a total collapse", () => {
  /* A zero close between two real ones would register as a -100% change and
     then a +infinity% recovery, pinning the indicator to an extreme for the
     whole smoothing tail. The bar is not data, so it is not a change. */
  const holed = [bar(0, 10), bar(1, 11), bar(2, 0), bar(3, 10), bar(4, 12), bar(5, 13)];
  const withHole = rsi(holed, 3);
  const withoutHole = rsi(closes([10, 11, 10, 12, 13]), 3);
  assert.equal(withHole.length, withoutHole.length);
  withHole.forEach((p, i) => near(p.value, withoutHole[i].value));
});

/* ----------------------------------------------------------------- macd */

test("macd is the fast ema less the slow one, with the signal an ema of that", () => {
  /* Worked by hand with fast 2, slow 3, signal 2 over closes 1,2,4,8,16,32
     — small enough that every step stays an exact fraction.

     ema(2), k = 2/3:  3/2, 19/6, 115/18, 691/54, 4147/162   (bars 1..5)
     ema(3), k = 1/2:  7/3, 31/6, 127/12, 511/24             (bars 2..5)
     macd = fast - slow, defined only from bar 2 where both exist:
       bar 2: 19/6 - 7/3     = 5/6
       bar 3: 115/18 - 31/6  = 11/9
       bar 4: 691/54 - 127/12 = 239/108
       bar 5: 4147/162 - 511/24 = 2791/648
     signal = ema(2) of that macd line, seeded from its first two values:
       bar 3: (5/6 + 11/9)/2                = 37/36
       bar 4: (2/3)(239/108) + (1/3)(37/36) = 589/324
       bar 5: (2/3)(2791/648) + (1/3)(589/324) = 845/243
     histogram = macd - signal:
       bar 3: 11/9 - 37/36      = 7/36
       bar 4: 239/108 - 589/324 = 32/81
       bar 5: 2791/648 - 845/243 = 1613/1944 */
  const out = macd(closes([1, 2, 4, 8, 16, 32]), 2, 3, 2);
  assert.equal(out.length, 4);
  assert.deepEqual(out.map((p) => p.at), [
    T0 + 2 * DAY, T0 + 3 * DAY, T0 + 4 * DAY, T0 + 5 * DAY,
  ]);

  near(out[0].macd, 5 / 6);
  near(out[1].macd, 11 / 9);
  near(out[2].macd, 239 / 108);
  near(out[3].macd, 2791 / 648);

  /* The first row has a macd but no signal yet: the signal ema needs two
     macd values before it can seed, and reporting 0 there would draw a
     histogram bar as tall as the macd itself on a bar where the crossover
     is simply not yet defined. */
  assert.equal(out[0].signal, null);
  assert.equal(out[0].histogram, null);
  near(out[1].signal!, 37 / 36);
  near(out[2].signal!, 589 / 324);
  near(out[3].signal!, 845 / 243);
  near(out[1].histogram!, 7 / 36);
  near(out[2].histogram!, 32 / 81);
  near(out[3].histogram!, 1613 / 1944);
});

test("macd defaults to 12/26/9 and starts where the slow ema does", () => {
  const pts = closes(Array.from({ length: 60 }, (_, i) => 100 + i + Math.sin(i) * 3));
  const out = macd(pts);
  // The slow ema seeds at bar 25, so 60 - 25 = 35 rows.
  assert.equal(out.length, 35);
  assert.equal(out[0].at, T0 + 25 * DAY);
  // The signal needs nine macd values, so the first eight rows carry none.
  assert.deepEqual(out.slice(0, 8).map((p) => p.signal), Array(8).fill(null));
  assert.ok(out[8].signal !== null);
  assert.ok(out.every((p) => Number.isFinite(p.macd)));
});

test("macd agrees with the ema functions it is defined in terms of", () => {
  // A consistency check, not the proof — the hand-worked case above is that.
  const pts = closes(Array.from({ length: 80 }, (_, i) => 50 + Math.cos(i / 4) * 8));
  const fast = ema(pts, 12);
  const slow = ema(pts, 26);
  const byHand = new Map(fast.map((p) => [p.at, p.value]));
  for (const s of slow) {
    const row = macd(pts).find((r) => r.at === s.at);
    assert.ok(row, `no macd row at ${s.at}`);
    near(row!.macd, byHand.get(s.at)! - s.value, 1e-9);
  }
});

test("macd of a flat series is zero throughout, never NaN", () => {
  const out = macd(closes(Array(40).fill(30)));
  assert.ok(out.length > 0);
  for (const p of out) {
    near(p.macd, 0);
    if (p.signal !== null) {
      near(p.signal, 0);
      near(p.histogram!, 0);
    }
  }
});

test("macd refuses a series too short for the slow window", () => {
  assert.deepEqual(macd(closes([1, 2, 3])), []);
  assert.deepEqual(macd([]), []);
  // Twenty-five bars cannot seed a twenty-six bar ema.
  assert.deepEqual(macd(closes(Array.from({ length: 25 }, (_, i) => i + 1))), []);
  assert.equal(macd(closes(Array.from({ length: 26 }, (_, i) => i + 1))).length, 1);
});

test("macd refuses a configuration where the fast leg is not the faster one", () => {
  /* A macd whose "fast" window is the longer of the two is the negation of
     the indicator everyone else means by the name, and it would render as a
     perfectly plausible curve pointing the wrong way. */
  const pts = closes(Array.from({ length: 60 }, (_, i) => 100 + i));
  assert.deepEqual(macd(pts, 26, 12), []);
  assert.deepEqual(macd(pts, 12, 12), []);
  assert.deepEqual(macd(pts, 0, 26), []);
  assert.deepEqual(macd(pts, 12, 26, 0), []);
  assert.deepEqual(macd(pts, 12.5, 26), []);
});

/* ------------------------------------------------------------ bollinger */

test("bollinger uses the population deviation Bollinger defined, not the sample one", () => {
  /* The textbook set 2,4,4,4,5,5,7,9 over an eight-bar window:
       mean = 40/8 = 5
       squared deviations: 9, 1, 1, 1, 0, 0, 4, 16  -> sum 32
       population variance = 32/8 = 4   -> sd = 2      (this is the one)
       sample variance     = 32/7       -> sd = 2.138  (this is not)
     So the bands sit at 5 +/- 2*2, exactly 9 and 1. The sample deviation
     would put them at 9.28 and 0.72 — close enough to look right on a chart
     and wrong against every other terminal's rendering of the same window. */
  const out = bollinger(closes([2, 4, 4, 4, 5, 5, 7, 9]), 8, 2);
  assert.equal(out.length, 1);
  near(out[0].middle, 5);
  near(out[0].upper, 9);
  near(out[0].lower, 1);
  assert.equal(out[0].at, T0 + 7 * DAY);
});

test("bollinger's middle band is exactly the sma of the same window", () => {
  const pts = closes([1, 2, 3, 4, 5]);
  const bands = bollinger(pts, 3, 2);
  const mid = sma(pts, 3);
  assert.equal(bands.length, mid.length);
  bands.forEach((b, i) => {
    assert.equal(b.at, mid[i].at);
    near(b.middle, mid[i].value);
    // Each window here is three consecutive integers: variance 2/3.
    near(b.upper, mid[i].value + 2 * Math.sqrt(2 / 3));
    near(b.lower, mid[i].value - 2 * Math.sqrt(2 / 3));
  });
});

test("bollinger collapses to a line on a flat series instead of producing NaN", () => {
  /* Zero variance is the case that bites: a naive sample deviation over a
     one-bar window divides by n-1 = 0, and any implementation that takes a
     square root of a slightly negative rounding residue returns NaN. Both
     render as a hole in the band and neither says so. A series that has not
     moved has bands of zero width, which is the truthful picture. */
  const out = bollinger(closes(Array(10).fill(42)), 5, 2);
  assert.equal(out.length, 6);
  for (const b of out) {
    assert.equal(b.upper, 42);
    assert.equal(b.middle, 42);
    assert.equal(b.lower, 42);
  }
});

test("bollinger keeps the bands ordered and defaults to 20 bars at two deviations", () => {
  const pts = closes(Array.from({ length: 50 }, (_, i) => 100 + Math.sin(i / 3) * 12));
  const out = bollinger(pts);
  assert.equal(out.length, 31);
  assert.deepEqual(out, bollinger(pts, 20, 2));
  for (const b of out) {
    assert.ok(b.lower <= b.middle && b.middle <= b.upper, `unordered: ${JSON.stringify(b)}`);
    assert.ok(Number.isFinite(b.upper) && Number.isFinite(b.lower));
  }
});

test("bollinger refuses an impossible window or a nonsensical width", () => {
  assert.deepEqual(bollinger(closes([1, 2, 3]), 20), []);
  assert.deepEqual(bollinger([], 20), []);
  assert.deepEqual(bollinger(closes([1, 2, 3]), 3, -2), []);
  assert.deepEqual(bollinger(closes([1, 2, 3]), 3, Number.NaN), []);
  assert.deepEqual(bollinger(closes([1, 2, 3]), 0), []);
});

/* ------------------------------------------------------------------ atr */

/** A bar with a real range, rather than the flat OHLC `bar` produces. */
function ohlcBar(i: number, high: number, low: number, close: number): PricePoint {
  return { at: T0 + i * DAY, price: close, open: low, high, low, volume: 1_000 };
}

test("atr averages the true range with Wilder smoothing", () => {
  /* Worked by hand with window 2:
       bar 0  h 10 l  8 c  9   no previous close, so no true range
       bar 1  h 11 l  9 c 10   max(11-9, |11-9|, |9-9|)   = 2
       bar 2  h 12 l 10 c 11   max(12-10, |12-10|, |10-10|) = 2
       bar 3  h 15 l 11 c 14   max(15-11, |15-11|, |11-11|) = 4
     seed at bar 2 = (2+2)/2 = 2
     bar 3 = (2*(2-1) + 4)/2 = 3 */
  const out = atr(
    [ohlcBar(0, 10, 8, 9), ohlcBar(1, 11, 9, 10), ohlcBar(2, 12, 10, 11), ohlcBar(3, 15, 11, 14)],
    2,
  );
  assert.equal(out.length, 2);
  assert.deepEqual(out.map((p) => p.at), [T0 + 2 * DAY, T0 + 3 * DAY]);
  near(out[0].value, 2);
  near(out[1].value, 3);
});

test("atr counts the overnight gap, not just the intraday range", () => {
  /* The whole point of true range over plain range. Bar 1 opens ten points
     above the previous close and trades in a one-point range: its intraday
     range is 1 and its true range is 10. An atr that missed this would tell
     a reader a gapping stock was the calmest thing on the screen.
       bar 1: max(20-19, |20-10|, |19-10|) = 10
       bar 2: max(21-20, |21-20|, |20-20|) = 1
       seed at bar 2 = (10+1)/2 = 5.5 */
  const out = atr([ohlcBar(0, 10, 9, 10), ohlcBar(1, 20, 19, 20), ohlcBar(2, 21, 20, 21)], 2);
  assert.equal(out.length, 1);
  near(out[0].value, 5.5);
});

test("atr needs a previous close, so window + 1 bars", () => {
  // The first bar has no true range at all: there is no prior close to gap
  // from, and calling its high-low the true range invents the seed's first
  // term out of a bar that cannot supply one.
  // Fourteen bars give thirteen true ranges: one short of a default window.
  const bars = Array.from({ length: 14 }, (_, i) => ohlcBar(i, 11, 9, 10));
  assert.equal(atr(bars).length, 0);
  assert.equal(atr([...bars, ohlcBar(14, 11, 9, 10)]).length, 1);
  assert.deepEqual(atr([], 14), []);
  assert.deepEqual(atr([ohlcBar(0, 1, 1, 1)], 14), []);
  assert.deepEqual(atr(closes([1, 2, 3, 4]), 0), []);
});

test("atr of a motionless series is zero, and stays finite", () => {
  const out = atr(Array.from({ length: 20 }, (_, i) => ohlcBar(i, 5, 5, 5)), 5);
  assert.equal(out.length, 15);
  for (const p of out) assert.equal(p.value, 0);
});

test("atr skips a bar whose high or low the feed did not send", () => {
  /* A null high is a missing field, not a high of zero. Treating it as zero
     would make the true range the whole price of the security. */
  const good = [ohlcBar(0, 10, 8, 9), ohlcBar(1, 11, 9, 10), ohlcBar(2, 12, 10, 11)];
  const holed = [
    good[0],
    { ...good[1], high: null },
    good[1],
    { ...good[2], low: null },
    good[2],
  ];
  const a = atr(holed, 2);
  const b = atr(good, 2);
  assert.equal(a.length, b.length);
  a.forEach((p, i) => near(p.value, b[i].value));
});

test("atr is never negative and defaults to fourteen periods", () => {
  const bars = Array.from({ length: 40 }, (_, i) => {
    const mid = 100 + Math.sin(i / 5) * 10;
    return ohlcBar(i, mid + 2, mid - 2, mid);
  });
  assert.deepEqual(atr(bars), atr(bars, 14));
  assert.equal(atr(bars).length, 26);
  for (const p of atr(bars)) assert.ok(p.value >= 0 && Number.isFinite(p.value));
});

/* ------------------------------------------------------- relativeVolume */

/** Bars that differ only in volume; the close is held flat deliberately. */
function volumes(vals: readonly (number | null)[]): PricePoint[] {
  return vals.map((v, i) => bar(i, 100, { volume: v }));
}

test("relative volume measures a bar against the window before it, not including it", () => {
  /* Hand-computed, volumes 100, 200, 300, 600 with a two-bar window:
       bar 2: 300 / ((100+200)/2) = 300/150 = 2
       bar 3: 600 / ((200+300)/2) = 600/250 = 2.4
     Folding the bar into its own baseline would report bar 2 as
     300/200 = 1.5 — the spike diluting the very average it is measured
     against, which is exactly backwards for the one thing this is for. */
  const out = relativeVolume(volumes([100, 200, 300, 600]), 2);
  assert.equal(out.length, 2);
  assert.deepEqual(out.map((p) => p.at), [T0 + 2 * DAY, T0 + 3 * DAY]);
  near(out[0].value, 2);
  near(out[1].value, 2.4);
});

test("relative volume is exactly 1 on a series that trades the same every day", () => {
  const out = relativeVolume(volumes(Array(10).fill(5_000)), 4);
  assert.equal(out.length, 6);
  for (const p of out) near(p.value, 1);
});

test("relative volume omits a bar whose baseline is zero rather than dividing by it", () => {
  /* A window in which nothing traded has no average to be a multiple of.
     Reporting Infinity would draw a spike off the top of the panel; reporting
     0 would claim the bar was quiet when it was the only activity there was.
     There is no honest number, so there is no row. */
  assert.deepEqual(relativeVolume(volumes([0, 0, 500]), 2), []);

  const out = relativeVolume(volumes([0, 0, 500, 600]), 2);
  assert.equal(out.length, 1);
  assert.equal(out[0].at, T0 + 3 * DAY);
  near(out[0].value, 600 / 250);
});

test("relative volume keeps a genuinely zero-volume bar, which is a reading of 0", () => {
  // Unlike a price, a volume of zero is real data: the bar did not trade.
  const out = relativeVolume(volumes([100, 100, 0]), 2);
  assert.equal(out.length, 1);
  assert.equal(out[0].value, 0);
});

test("relative volume drops a bar the feed sent no volume for", () => {
  const holed = relativeVolume(volumes([100, null, 200, 300]), 2);
  const clean = relativeVolume(volumes([100, 200, 300]), 2);
  assert.equal(holed.length, clean.length);
  holed.forEach((p, i) => near(p.value, clean[i].value));
  // A negative volume is not a volume.
  assert.deepEqual(relativeVolume(volumes([-5, -5, 100]), 2), []);
});

test("relative volume needs a full trailing window plus the bar it measures", () => {
  assert.deepEqual(relativeVolume(volumes([100, 200]), 30), []);
  assert.deepEqual(relativeVolume([], 30), []);
  assert.deepEqual(relativeVolume(volumes([100, 200, 300]), 0), []);
  const thirtyOne = volumes(Array(31).fill(1_000));
  assert.equal(relativeVolume(thirtyOne).length, 1);
  assert.deepEqual(relativeVolume(thirtyOne), relativeVolume(thirtyOne, 30));
  assert.deepEqual(relativeVolume(volumes(Array(30).fill(1_000))), []);
});

/* ------------------------------------------------------------ crossover */

/** An indicator series from bare values, one trading day apart. */
function line(values: readonly number[]): IndicatorPoint[] {
  return values.map((value, i) => ({ at: T0 + i * DAY, value }));
}

test("crossover reports which line is on top and how long it has been there", () => {
  /* fast 1,2,3,4,5 against a flat slow at 3:
       bar 0  1 < 3  below
       bar 1  2 < 3  below
       bar 2  3 = 3  level
       bar 3  4 > 3  above   <- the run in force now starts here
       bar 4  5 > 3  above
     So the state is "above" and it has held for one day. */
  const read = crossover(line([1, 2, 3, 4, 5]), line([3, 3, 3, 3, 3]));
  assert.equal(read.state, "above");
  assert.equal(read.sinceMs, DAY);
});

test("crossover reports below just as readily as above", () => {
  const read = crossover(line([9, 8, 2, 1]), line([5, 5, 5, 5]));
  assert.equal(read.state, "below");
  // Bar 2 is the first bar under the slow line, and bar 3 is the latest:
  // the age is measured from the crossing bar, so one day.
  assert.equal(read.sinceMs, DAY);
});

test("crossover dates a cross on the newest bar at zero, which is not the same as null", () => {
  /* Zero here is a reading, not a missing one: the lines crossed on the bar
     being reported, so "crossed today". Null means something else entirely —
     that no crossing is visible at all — and collapsing the two would either
     lose today's signal or invent an undated one. */
  assert.deepEqual(crossover(line([1, 2, 3, 4]), line([3, 3, 3, 3])), {
    state: "above",
    sinceMs: 0,
  });
});

test("crossover will not date a cross it never saw", () => {
  /* The fast line is above for the whole overlap. The last crossing happened
     before the data starts — or never — and inventing a duration from the
     first shared bar would report "above for 5 years" on a series that is
     merely five years long. The state is known; its age is not. */
  const read = crossover(line([5, 6, 7]), line([1, 2, 3]));
  assert.equal(read.state, "above");
  assert.equal(read.sinceMs, null);
});

test("crossover calls a dead-level pair undeterminable rather than picking one", () => {
  /* Two identical lines — an sma and an ema over a flat series are exactly
     equal — are neither above nor below. Returning "above" for a tie would
     make the panel print a trend signal for a security that has not moved. */
  const read = crossover(line([4, 4, 4]), line([4, 4, 4]));
  assert.equal(read.state, null);
  assert.equal(read.sinceMs, null);
});

test("crossover compares only the bars the two series share", () => {
  /* A 50-day sma starts thirty bars after a 20-day one. Comparing by array
     index instead of by timestamp would line up bars a month and a half
     apart and read a crossing off two unrelated days. */
  const fast: IndicatorPoint[] = [
    { at: T0, value: 1 },
    { at: T0 + DAY, value: 2 },
    { at: T0 + 2 * DAY, value: 9 },
    { at: T0 + 3 * DAY, value: 10 },
  ];
  const slow: IndicatorPoint[] = [
    { at: T0 + 2 * DAY, value: 5 },
    { at: T0 + 3 * DAY, value: 5 },
  ];
  const read = crossover(fast, slow);
  assert.equal(read.state, "above");
  // Only two shared bars, both above: no crossing is visible in the overlap.
  assert.equal(read.sinceMs, null);
});

test("crossover has nothing to say about series that do not overlap", () => {
  assert.deepEqual(crossover([], []), { state: null, sinceMs: null });
  assert.deepEqual(crossover(line([1, 2, 3]), []), { state: null, sinceMs: null });
  assert.deepEqual(
    crossover([{ at: T0, value: 1 }], [{ at: T0 + 99 * DAY, value: 2 }]),
    { state: null, sinceMs: null },
  );
});

test("crossover sorts its inputs and ignores unusable readings", () => {
  const scrambled: IndicatorPoint[] = [
    { at: T0 + 3 * DAY, value: 4 },
    { at: T0, value: 1 },
    { at: T0 + 4 * DAY, value: 5 },
    { at: T0 + 2 * DAY, value: 3 },
    { at: T0 + DAY, value: 2 },
  ];
  // The same series as the first case above, shuffled: same answer.
  assert.deepEqual(crossover(scrambled, line([3, 3, 3, 3, 3])), {
    state: "above",
    sinceMs: DAY,
  });
  // A NaN reading is not a position above or below anything.
  const holed = [...line([1, 2, 3, 4]).slice(0, 3), { at: T0 + 3 * DAY, value: Number.NaN }];
  assert.deepEqual(crossover(holed, line([3, 3, 3, 3])), { state: null, sinceMs: null });
});

test("crossover reads a golden cross off the moving averages themselves", () => {
  /* End to end against the module's own output: a series that falls for
     forty bars and then climbs for forty must leave the fast average above
     the slow one, having crossed somewhere in the middle. */
  const values = [
    ...Array.from({ length: 40 }, (_, i) => 200 - i * 2),
    ...Array.from({ length: 40 }, (_, i) => 120 + i * 2),
  ];
  const pts = closes(values);
  const read = crossover(ema(pts, 10), sma(pts, 30));
  assert.equal(read.state, "above");
  assert.ok(read.sinceMs !== null && read.sinceMs > 0, `expected a dated cross, got ${read.sinceMs}`);
  assert.ok(read.sinceMs! < 79 * DAY, "the cross should sit inside the series, not at its head");
});

/* ------------------------------------------------- the shared discipline */

/** Every series-returning export, called with its defaults. */
const SERIES_FUNCTIONS: Array<[string, (p: readonly PricePoint[]) => Array<{ at: number }>]> = [
  ["sma", (p) => sma(p, 20)],
  ["ema", (p) => ema(p, 20)],
  ["rsi", (p) => rsi(p)],
  ["macd", (p) => macd(p)],
  ["bollinger", (p) => bollinger(p)],
  ["atr", (p) => atr(p)],
  ["relativeVolume", (p) => relativeVolume(p)],
];

test("no indicator invents a series out of an empty one", () => {
  for (const [name, fn] of SERIES_FUNCTIONS) {
    assert.deepEqual(fn([]), [], `${name} should return nothing for no bars`);
  }
});

test("no indicator invents a series out of a single bar", () => {
  // One bar cannot support a twenty-bar window, a fourteen-period rsi, or a
  // true range — there is nothing before it to measure against.
  const one = [bar(0, 123)];
  for (const [name, fn] of SERIES_FUNCTIONS) {
    assert.deepEqual(fn(one), [], `${name} should return nothing for one bar`);
  }
});

test("no indicator invents a series out of bars that are all holes", () => {
  const rubbish: PricePoint[] = Array.from({ length: 60 }, (_, i) => ({
    at: T0 + i * DAY,
    price: i % 2 === 0 ? 0 : -1,
    open: null,
    high: null,
    low: null,
    volume: null,
  }));
  for (const [name, fn] of SERIES_FUNCTIONS) {
    assert.deepEqual(fn(rubbish), [], `${name} should return nothing for no usable bars`);
  }
});

test("no indicator ever emits a NaN or an Infinity, whatever it is handed", () => {
  /* The reason this sweep exists rather than trusting the per-function
     guards: a NaN reaching the chart draws as a gap and an Infinity draws as
     a spike off the top, and neither one announces itself as a bug. They are
     read as market events. Every finite-value guard in this module is here
     because one of these inputs would otherwise produce one. */
  const nasty: PricePoint[] = [
    ...Array.from({ length: 40 }, (_, i) => bar(i, 50)), // dead flat: zero variance
    bar(40, Number.POSITIVE_INFINITY),
    bar(41, Number.NaN),
    bar(42, 0),
    bar(43, -12),
    { at: Number.NaN, price: 10, open: 10, high: 10, low: 10, volume: 10 },
    bar(44, 50, { volume: 0 }),
    bar(45, 50, { volume: Number.POSITIVE_INFINITY }),
    bar(46, 50, { volume: null }),
    bar(47, 1e15, { high: Number.NaN, low: null }),
    bar(48, 50, { high: 1, low: 99 }), // inverted range
    bar(48, 50), // a genuine duplicate of the timestamp on the line above
    ...Array.from({ length: 40 }, (_, i) => bar(50 + i, 50 + (i % 3))),
  ];

  const finite = (v: number | null, where: string) => {
    if (v === null) return;
    assert.ok(Number.isFinite(v), `${where} produced ${v}`);
  };

  for (const [name, fn] of SERIES_FUNCTIONS) {
    for (const row of fn(nasty)) {
      finite(row.at, `${name}.at`);
      for (const [key, value] of Object.entries(row)) {
        if (typeof value === "number" || value === null) finite(value, `${name}.${key}`);
      }
    }
  }

  const read = crossover(sma(nasty, 5), ema(nasty, 20));
  finite(read.sinceMs, "crossover.sinceMs");
  assert.ok(read.sinceMs === null || read.sinceMs >= 0, "a cross cannot be in the future");
});

test("every series comes back oldest first, whatever order it went in as", () => {
  // The chart draws left to right and does no sorting of its own; a series
  // returned newest first renders smoothly and draws the period backwards.
  const shuffled = [...closes(Array.from({ length: 60 }, (_, i) => 100 + Math.sin(i / 4) * 9))]
    .reverse();
  for (const [name, fn] of SERIES_FUNCTIONS) {
    const out = fn(shuffled);
    assert.ok(out.length > 0, `${name} produced nothing to check`);
    for (let i = 1; i < out.length; i += 1) {
      assert.ok(out[i].at > out[i - 1].at, `${name} is not ascending at index ${i}`);
    }
  }
});
