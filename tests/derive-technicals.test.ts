import { test } from "node:test";
import assert from "node:assert/strict";
import {
  momentum,
  movingAverages,
  referencePrice,
  sparkPath,
  volatility,
  yearRange,
  SPARK_SESSIONS,
} from "../lib/market/derive-technicals.ts";
import type { PricePoint } from "../lib/api/normalize/series.ts";
import type { InstrumentSnapshot } from "../lib/market/instrument.ts";

/* What this file is defending.

   The panel these functions feed used to read three `.latest` scalars and
   print them. Everything here is computed instead, over 1,274 daily bars, and
   the whole class of bug that introduces is the plausible one: a window the
   history cannot cover, a denominator that is zero on a flat series, a
   sparkline drawn at zero because the series behind it was empty. None of
   those announce themselves on screen — a flat line at the bottom of a box
   looks exactly like a security that has not moved, and a reader has no way
   to tell it from a series that does not exist.

   So the assertions below insist on null wherever there is no reading, and on
   an explicit sentence saying what was missing. A zero anywhere in this file
   is a measured zero, and each one is named as such. */

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

/** Bars from a list of closes, oldest first, one day apart. */
function closes(values: readonly number[]): PricePoint[] {
  return values.map((v, i) => bar(i, v));
}

/** `n` sessions that never move. The degenerate case for every denominator. */
function flat(n: number, price = 100): PricePoint[] {
  return closes(Array.from({ length: n }, () => price));
}

/** `n` sessions climbing by `step` from `from`. */
function ramp(n: number, from = 100, step = 1): PricePoint[] {
  return closes(Array.from({ length: n }, (_, i) => from + i * step));
}

type Over = {
  price?: number | null;
  high52?: number | null;
  low52?: number | null;
  rangePosition?: number | null;
  gatewayRsi?: number | null;
};

/* A snapshot carries twenty fields assembled from seven feeds; these functions
   read four of them. Building the whole thing honestly would be a fixture
   longer than the module under test and would break on every unrelated field
   added to it, so the shape is asserted once here and cast. */
function snapshot(daily: PricePoint[], over: Over = {}): InstrumentSnapshot {
  return {
    profile: {
      price: over.price === undefined ? null : over.price,
      high52: over.high52 ?? null,
      low52: over.low52 ?? null,
    },
    technical: {
      rsi: { latest: over.gatewayRsi ?? null, series: [] },
      sma: { latest: null, series: [] },
      ema: { latest: null, series: [] },
      rangePosition: over.rangePosition ?? null,
      rsiState: null,
    },
    history: { daily, intraday: [], intradayNote: null },
  } as unknown as InstrumentSnapshot;
}

/** Assert two floats agree to `eps`, reporting both when they do not. */
function near(actual: number | null, expected: number, eps = 1e-9): void {
  assert.ok(actual !== null, `expected ${expected}, got null`);
  assert.ok(
    Math.abs((actual as number) - expected) <= eps,
    `expected ${expected}, got ${actual}`,
  );
}

/* ------------------------------------------------------------- sparkPath */

test("a rising series maps to the corners of its box", () => {
  // Newest point at the right edge, highest at the top: y is inverted because
  // SVG counts down from the top and a sparkline drawn straight from the
  // values is upside down.
  assert.equal(sparkPath(
    [{ at: 0, value: 1 }, { at: 1, value: 2 }, { at: 2, value: 3 }],
    { width: 100, height: 20 },
  ), "M0 20L50 10L100 0");
});

test("a flat series draws a level line rather than dividing by zero", () => {
  // max === min. Naively (v - min) / (max - min) is 0/0 and every coordinate
  // in the path is NaN, which the browser silently declines to render — the
  // sparkline simply vanishes with no error anywhere.
  assert.equal(sparkPath(
    [{ at: 0, value: 7 }, { at: 1, value: 7 }, { at: 2, value: 7 }],
    { width: 100, height: 20 },
  ), "M0 10L50 10L100 10");
});

test("an empty series and a lone point draw nothing at all", () => {
  // Not a line along the bottom of the box: a flat line at zero is a claim
  // about the market, and there is nothing here to claim anything about.
  assert.equal(sparkPath([], { width: 100, height: 20 }), null);
  assert.equal(sparkPath([{ at: 0, value: 5 }], { width: 100, height: 20 }), null);
});

test("a non-finite reading is refused rather than written into the path", () => {
  // "M0 20LNaN 10" is not a parse error — the path renders up to the bad
  // command and stops, so half a line appears and looks like real data.
  assert.equal(sparkPath(
    [{ at: 0, value: 1 }, { at: 1, value: Number.NaN }, { at: 2, value: 3 }],
    { width: 100, height: 20 },
  ), null);
});

test("explicit bounds set the domain, and anything outside them is clamped", () => {
  // RSI is drawn against a fixed 0-100 so the 30 and 70 rules mean something.
  assert.equal(sparkPath(
    [{ at: 0, value: 0 }, { at: 1, value: 50 }, { at: 2, value: 100 }],
    { width: 100, height: 20 },
    { min: 0, max: 100 },
  ), "M0 20L50 10L100 0");

  // A value past the domain stays inside the box rather than drawing over the
  // rest of the panel.
  assert.equal(sparkPath(
    [{ at: 0, value: -40 }, { at: 1, value: 50 }, { at: 2, value: 140 }],
    { width: 100, height: 20 },
    { min: 0, max: 100 },
  ), "M0 20L50 10L100 0");
});

/* -------------------------------------------------------------- momentum */

test("an empty history yields no readings, and says what it would need", () => {
  const m = momentum(snapshot([]));
  assert.equal(m.bars, 0);
  assert.equal(m.rsi.latest, null);
  assert.equal(m.rsi.state, null);
  assert.deepEqual(m.rsi.trace, []);
  assert.equal(m.rsi.shortfall, "Needs 15 sessions; 0 on file.");
  assert.equal(m.macd.line, null);
  assert.equal(m.macd.signal, null);
  assert.equal(m.macd.histogram, null);
  assert.deepEqual(m.macd.trace, []);
  assert.equal(m.macd.cross.state, null);
});

test("a window longer than the history yields nothing, never a partial stub", () => {
  // Ten bars cannot make a fourteen-period RSI. An RSI computed from what is
  // there is a different measure wearing the same label.
  const m = momentum(snapshot(ramp(10)));
  assert.equal(m.rsi.latest, null);
  assert.deepEqual(m.rsi.trace, []);
  assert.equal(m.rsi.shortfall, "Needs 15 sessions; 10 on file.");
});

test("a flat series reads fifty, which is neither overbought nor zero", () => {
  /* 0/0 in the RSI. indicators.ts decides this at 50 and the panel must not
     re-decide it: check the denominator first and a security that has not
     traded a cent away from its open is badged maximally overbought. */
  const m = momentum(snapshot(flat(120)));
  near(m.rsi.latest, 50);
  assert.equal(m.rsi.state, "neutral");
  assert.equal(m.rsi.shortfall, null);
  near(m.rsi.change, 0);
});

test("thirty bars carry a MACD line, and the histogram is withheld rather than zeroed", () => {
  /* The signal is an ema of the macd line and seeds eight rows after it. A
     zero histogram is not "no reading" — zero is exactly the value the
     histogram takes at a crossover, so filling those rows would draw a
     crossover that never happened. */
  const m = momentum(snapshot(ramp(30)));
  assert.notEqual(m.macd.line, null);
  assert.equal(m.macd.signal, null);
  assert.equal(m.macd.histogram, null);
  assert.deepEqual(m.macd.trace, []);
  assert.equal(m.macd.shortfall, "Needs 34 sessions; 30 on file.");
  assert.equal(m.macd.cross.state, null);
});

test("a long rise has the MACD above its signal, and the histogram is drawable", () => {
  /* Compounding rather than the linear `ramp` used elsewhere, and the reason
     is worth recording. On a series with a constant increment both emas
     converge to the price less a fixed lag, so the macd line converges to a
     constant — and the signal, being an ema of a constant, converges to the
     same constant. What separates them after 300 bars is floating-point
     residue, and `crossover` duly reports whichever side that residue fell
     on. It is a fixture that has stopped moving, not a market: a real series
     never converges, and this one compounds so the macd line keeps climbing
     and its signal keeps lagging, which is what the test is about. */
  const m = momentum(snapshot(closes(
    Array.from({ length: 300 }, (_, i) => 100 * 1.004 ** i),
  )));
  assert.equal(m.macd.shortfall, null);
  assert.ok((m.macd.line as number) > 0, "a rising series has a positive macd line");
  assert.equal(m.macd.cross.state, "above");
  assert.ok(m.macd.trace.length > 0);
  assert.notEqual(sparkPath(m.macd.trace, { width: 100, height: 20 }), null);
});

test("a sparkline is the recent tail, ending at the newest bar", () => {
  const bars = ramp(400);
  const m = momentum(snapshot(bars));
  assert.equal(m.rsi.trace.length, SPARK_SESSIONS);
  assert.equal(m.rsi.trace[m.rsi.trace.length - 1].at, bars[bars.length - 1].at);
});

test("the provider's own RSI is carried beside ours, with the distance between them", () => {
  // Not restated as though we computed it, and not silently contradicted:
  // both numbers exist and the panel can say so.
  const m = momentum(snapshot(flat(120), { gatewayRsi: 47.5 }));
  assert.equal(m.gateway.rsi, 47.5);
  near(m.gateway.delta, 2.5);

  // No provider reading is no disagreement, not a disagreement of 50.
  assert.deepEqual(momentum(snapshot(flat(120))).gateway, { rsi: null, delta: null });
});

test("the bar count is of rows the indicators can actually use", () => {
  // A zero close is a hole in the feed, not a valuation, and indicators.ts
  // drops it. If the count said otherwise the shortfall sentence would
  // contradict the dash beside it.
  const withHole = [...ramp(20), bar(20, 0), bar(21, 120)];
  assert.equal(momentum(snapshot(withHole)).bars, 21);
});

/* -------------------------------------------------------- movingAverages */

test("each average reports its gap to the reference price", () => {
  const a = movingAverages(snapshot(flat(260), { price: 110 }));
  const sma50 = a.rows.find((r) => r.label === "SMA (50)");
  assert.ok(sma50);
  near(sma50.value, 100);
  near(sma50.gap, 10);
  assert.equal(sma50.state, "above");
  assert.equal(sma50.shortfall, null);
  // The price is carried alongside so the pair can be drawn in one box.
  assert.equal(sma50.price.length, sma50.trace.length);
});

test("an average the history cannot support is null, not zero", () => {
  const a = movingAverages(snapshot(flat(120), { price: 100 }));
  const sma200 = a.rows.find((r) => r.label === "SMA (200)");
  assert.ok(sma200);
  assert.equal(sma200.value, null);
  assert.equal(sma200.gap, null);
  assert.equal(sma200.state, null);
  assert.deepEqual(sma200.trace, []);
  assert.equal(sma200.shortfall, "Needs 200 sessions; 120 on file.");
  assert.equal(a.cross.shortfall, "Needs 200 sessions; 120 on file.");
});

test("a price exactly on its average is neither above nor below", () => {
  const a = movingAverages(snapshot(flat(60), { price: 100 }));
  const sma50 = a.rows.find((r) => r.label === "SMA (50)");
  assert.ok(sma50);
  near(sma50.gap, 0);
  assert.equal(sma50.state, null);
});

test("the reference price falls back to the last close when there is no quote", () => {
  const bars = ramp(60, 100, 1);
  assert.equal(referencePrice(snapshot(bars)), 159);
  assert.equal(referencePrice(snapshot(bars, { price: 200 })), 200);
  assert.equal(referencePrice(snapshot([])), null);
});

test("a monotone rise has the fifty above the two hundred, with no datable crossing", () => {
  /* The two averages never cross inside the overlap, so the age of the last
     crossing is unknown — not "260 days", which is only the length of the
     fixture and would be printed as fact. */
  const a = movingAverages(snapshot(ramp(260), { price: 400 }));
  assert.equal(a.cross.state, "above");
  assert.equal(a.cross.sinceDays, null);
  assert.equal(a.cross.shortfall, null);
});

test("a real crossing is dated from the session it happened", () => {
  const falling = Array.from({ length: 200 }, (_, i) => 300 - i);
  const rising = Array.from({ length: 80 }, (_, i) => 100 + (i + 1) * 3);
  const a = movingAverages(snapshot(closes([...falling, ...rising])));
  assert.equal(a.cross.state, "above");
  assert.ok(a.cross.sinceDays !== null, "the crossing is inside the overlap and datable");
  assert.ok(
    (a.cross.sinceDays as number) > 0 && (a.cross.sinceDays as number) < 80,
    `crossing dated ${a.cross.sinceDays} days back, which is outside the rally`,
  );
});

/* ------------------------------------------------------------ volatility */

test("a flat window has no position between its bands", () => {
  /* Upper, middle and lower are the same number, so %B is 0/0. Infinity draws
     as a full meter and 50 claims the price sits mid-band on evidence that
     does not exist; the width itself is a measured zero and stays. */
  const v = volatility(snapshot(flat(120), { price: 100 }));
  near(v.bands.upper, 100);
  near(v.bands.lower, 100);
  near(v.bands.width, 0);
  assert.equal(v.bands.position, null);
  assert.equal(v.bands.state, null);
});

test("bollinger, atr and relative volume each say what they would need", () => {
  const v = volatility(snapshot(flat(10), { price: 100 }));
  assert.equal(v.bands.upper, null);
  assert.equal(v.bands.shortfall, "Needs 20 sessions; 10 on file.");
  assert.equal(v.atr.latest, null);
  assert.equal(v.atr.shortfall, "Needs 15 sessions; 10 on file.");
  assert.deepEqual(v.atr.trace, []);
  assert.equal(v.volume.latest, null);
  assert.equal(v.volume.shortfall, "Needs 31 sessions; 10 on file.");
});

test("constant turnover is exactly one times normal", () => {
  // A measured 1, not an absence: every session traded its baseline exactly.
  const v = volatility(snapshot(flat(60), { price: 100 }));
  near(v.volume.latest, 1);
  assert.equal(v.volume.shortfall, null);
  assert.equal(v.volume.unreliable, null);
});

test("a baseline the feed cannot make coherent yields no reading at all", () => {
  /* This is not hypothetical. The daily feed reports AAPL trading 243,582
     shares on one August session and 53,167,388 on another a week later, and
     it does the same to NVDA — most sessions carry what looks like a single
     venue's tape and a handful carry the consolidated figure. The mean of
     thirty such bars is 11.9M against a real average of about 50M, so the one
     bar in the window with a true volume divides by a baseline built mostly
     from junk and reports 4.45x. Every large-cap instrument would then wear a
     HEAVY badge, every day, off a number that measures nothing.

     A ratio to a mean is only a reading if the mean describes a typical
     session, and mean against median is the standard way to ask. A real
     thirty-session window sits near 1 even through earnings; this fixture,
     like the feed, sits near 12. */
  const alternating = Array.from({ length: 40 }, (_, i) =>
    bar(i, 100, { volume: i % 7 === 0 ? 50_000_000 : 200_000 }),
  );
  const v = volatility(snapshot(alternating, { price: 100 }));
  assert.equal(v.volume.latest, null);
  assert.deepEqual(v.volume.trace, []);
  assert.equal(v.volume.shortfall, null, "there are plenty of sessions; that is not the problem");
  assert.ok(
    v.volume.unreliable?.includes("baseline"),
    `expected a sentence naming the baseline, got ${v.volume.unreliable}`,
  );
});

test("an ordinary turnover window is not mistaken for an incoherent one", () => {
  // Real volume wanders and spikes on earnings; the guard must not swallow it.
  const ordinary = Array.from({ length: 40 }, (_, i) =>
    bar(i, 100, { volume: i === 30 ? 4_000_000 : 1_000_000 + (i % 5) * 120_000 }),
  );
  const v = volatility(snapshot(ordinary, { price: 100 }));
  assert.equal(v.volume.unreliable, null);
  assert.ok((v.volume.latest as number) > 0);
});

test("a session at rest sits at the bottom of its own year of volatility", () => {
  // Every true range is zero, so nothing in the lookback is below the latest.
  const v = volatility(snapshot(flat(60), { price: 100 }));
  near(v.atr.latest, 0);
  near(v.atr.ofPrice, 0);
  assert.equal(v.atr.percentile, 0);
});

test("the widest session of the record ranks at the top of its year", () => {
  /* Ranked against the readings before it rather than including itself: a
     percentile that ranks a point inside its own sample can never reach 100,
     and "the most volatile it has been all year" is the statement this is
     for. */
  const widening = Array.from({ length: 60 }, (_, i) =>
    bar(i, 100, { high: 100 + i * 0.1, low: 100 - i * 0.1 }),
  );
  const v = volatility(snapshot(widening, { price: 100 }));
  assert.equal(v.atr.percentile, 100);
  assert.ok((v.atr.latest as number) > 0);
});

test("a price outside the bands is reported outside them, not clamped to the edge", () => {
  /* A close beyond the envelope is the whole point of the indicator, so the
     number keeps going past 100. Only the meter that draws it clamps, and it
     clamps in the panel where the box has an edge — not here, where the
     reading would lose the thing it was measuring. */
  const bars = ramp(60, 100, 1);
  const above = volatility(snapshot(bars, { price: 10_000 }));
  assert.equal(above.bands.state, "above");
  assert.ok((above.bands.position as number) > 100);

  const below = volatility(snapshot(bars, { price: 1 }));
  assert.equal(below.bands.state, "below");
  assert.ok((below.bands.position as number) < 0);
});

/* ------------------------------------------------------------- yearRange */

test("the year range comes from the profile's own extremes", () => {
  const r = yearRange(snapshot(flat(30), { price: 150, low52: 100, high52: 200, rangePosition: 50 }));
  assert.equal(r.position, 50);
  assert.equal(r.low, 100);
  assert.equal(r.high, 200);
  assert.equal(r.price, 150);

  // No extremes on file is no position, rather than a bar at either end.
  const none = yearRange(snapshot(flat(30), { price: 150 }));
  assert.equal(none.position, null);
});
