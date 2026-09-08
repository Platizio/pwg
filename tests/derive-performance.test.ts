import test from "node:test";
import assert from "node:assert/strict";

import {
  analystView,
  calendarYearRows,
  drawdownCurve,
  relativeReturn,
  riskProfile,
  rollingPeriods,
} from "../lib/market/derive-performance.ts";
import { PERIODS } from "../lib/api/normalize/performance.ts";
import type { AnalystAvailability, AnalystConsensus } from "../lib/api/normalize/analyst.ts";
import type { PricePoint } from "../lib/api/normalize/series.ts";
import type { InstrumentSnapshot } from "../lib/market/instrument.ts";

/* The Performance tab's derivations.

   Everything this module produces is read as an investment figure by somebody
   deciding what to hold, and every one of the mistakes below renders as a
   perfectly ordinary-looking page:

     - a period the history does not reach, filled in from a shorter window.
       "+412% over five years" from eleven months of bars is not an
       approximation, it is a number nobody measured.
     - a missing comparison rendered as nought. A market column that prints
       0.0% where the proxy has no data says the S&P went nowhere that year.
     - an outperformance figure that subtracts two cumulative returns. Over
       five years that is neither a return nor a ratio, and it reads several
       times larger than the outperformance actually was.
     - an analyst section that says "no coverage" when the truth is "this
       account cannot see analyst data". The first is a claim about the
       company and it is one this terminal would have invented.

   So the assertions below pin absence at least as hard as they pin presence.
   Where a figure cannot be measured the answer is null, and null must survive
   all the way to the panel, which draws it as a dash. */

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 7, 24);

/** Percent comparisons carry float noise: (1.5 / 1.1 - 1) * 100 is 36.3636…. */
const close = (actual: number | null, expected: number, tol = 1e-9): void => {
  assert.ok(actual !== null, `expected about ${expected}, got null`);
  assert.ok(
    Math.abs(actual - expected) <= tol,
    `expected about ${expected}, got ${actual}`,
  );
};

const point = (at: number, price: number): PricePoint => ({
  at,
  price,
  open: price,
  high: price,
  low: price,
  volume: 1,
});

/** A daily series ending at `end`, oldest first, compounding smoothly. */
function series(days: number, from = 100, to = 200, end = NOW): PricePoint[] {
  const out: PricePoint[] = [];
  for (let i = days - 1; i >= 0; i -= 1) {
    const t = (days - 1 - i) / Math.max(1, days - 1);
    out.push(point(end - i * DAY, from * (to / from) ** t));
  }
  return out;
}

/** A series that never moves — the degenerate case every ratio here must survive. */
const flat = (days: number, price = 100, end = NOW): PricePoint[] =>
  Array.from({ length: days }, (_, i) => point(end - (days - 1 - i) * DAY, price));

type Over = {
  daily?: PricePoint[];
  /** `undefined` gives a default proxy; `null` is "no proxy was fetched". */
  market?: PricePoint[] | null;
  price?: number | null;
  high52?: number | null;
  beta?: number | null;
  cagr5y?: number | null;
  analyst?: AnalystAvailability;
};

/* The snapshot is seven feeds wide and this module reads five branches of it.
   Casting one honest partial is the house pattern (see tests/competitors.ts)
   and it keeps the fixtures readable; the alternative is forty fields of noise
   per test, none of which any function here looks at. */
function snapshot(over: Over = {}): InstrumentSnapshot {
  const daily = over.daily ?? series(300);
  const last = daily.length ? daily[daily.length - 1].price : null;

  const market =
    over.market === undefined
      ? { symbol: "SPY", daily: series(Math.max(daily.length, 1), 100, 150) }
      : over.market === null
        ? null
        : { symbol: "SPY", daily: over.market };

  return {
    profile: {
      id: "AAPL",
      price: over.price === undefined ? last : over.price,
      high52: over.high52 === undefined ? 220 : over.high52,
      beta: over.beta === undefined ? 1.2 : over.beta,
    },
    history: { daily, intraday: [], intradayNote: null },
    market,
    returns: { ret1y: null, ret5y: null, cagr5y: over.cagr5y === undefined ? 14.9 : over.cagr5y },
    analyst: over.analyst ?? { state: "not-entitled", status: 403 },
  } as unknown as InstrumentSnapshot;
}

/* A consensus with every field populated and internally consistent:
   24 + 8 + 2 = 34, and 210 <= 290 <= 350.

   `vendorUpsideUnverified` is deliberately 12.4 while the derived upside is
   16.0. The two must never coincide in a fixture, or a view that forwarded the
   vendor's number would pass. */
function consensus(over: Partial<AnalystConsensus> = {}): AnalystConsensus {
  return {
    label: "Strong Buy",
    ratings: { buy: 24, hold: 8, sell: 2, total: 34, reportedTotal: 34, totalDisputed: false },
    target: { consensus: 290, low: 210, high: 350, currency: "USD" },
    upsidePct: 16,
    vendorUpsideUnverified: 12.4,
    ...over,
  };
}

const covered = (c: AnalystConsensus = consensus()): AnalystAvailability => ({
  state: "available",
  consensus: c,
});

/* ── relative strength ──────────────────────────────────────────────────── */

test("outperformance compounds rather than subtracting one cumulative return from another", () => {
  /* A stock that quadrupled while the fund doubled is worth twice what the
     fund is worth — +100% relative. Subtracting the two cumulative figures
     gives 200 percentage points, which is not a return anybody earned and is
     the number a reader will read as one. The gap widens with the window, so
     the five-year row is exactly where it does the most damage. */
  assert.equal(relativeReturn(300, 100), 100);
  assert.notEqual(relativeReturn(300, 100), 200);

  // Over a short window the two conventions nearly agree, which is why the
  // wrong one survives review: 1m and 3m look right while 5y is nonsense.
  close(relativeReturn(3, 1), ((1.03 / 1.01) - 1) * 100);
});

test("a relative figure needs both legs, and a denominator that is not nought", () => {
  assert.equal(relativeReturn(null, 10), null);
  assert.equal(relativeReturn(10, null), null);
  assert.equal(relativeReturn(null, null), null);
  // A market that lost everything leaves nothing to measure against; the
  // honest answer is "unknown", not an infinity rendered as "Infinity%".
  assert.equal(relativeReturn(10, -100), null);
  assert.equal(relativeReturn(Number.NaN, 10), null);
  // Matching a flat market exactly is a real reading of nought, not an absence.
  assert.equal(relativeReturn(0, 0), 0);
});

/* ── rolling periods ────────────────────────────────────────────────────── */

test("the rolling table reports the seven windows in reading order", () => {
  const rows = rollingPeriods(snapshot());
  assert.deepEqual(rows.map((r) => r.key), ["1m", "3m", "6m", "ytd", "1y", "3y", "5y"]);
});

test("the window lengths cannot drift from the maths module's own table", () => {
  /* PERIODS is where a session count is defined; this table restates the ones
     it shows. If the two ever disagree, one tab measures a "1 year" that is
     not the other tab's year and no page anywhere says so. */
  const bySessions = new Map<string, number>(PERIODS.map((p) => [p.label, p.sessions]));
  for (const row of rollingPeriods(snapshot())) {
    if (row.sessions === null) continue;
    assert.equal(
      row.sessions,
      bySessions.get(row.label),
      `${row.label} has drifted from PERIODS`,
    );
  }
});

test("a window the history does not reach is null, never extrapolated", () => {
  const short = series(40);
  const rows = rollingPeriods(snapshot({ daily: short, market: series(40, 100, 110) }));
  const by = new Map(rows.map((r) => [r.key, r]));

  assert.ok(by.get("1m")!.stock !== null, "a month of bars covers the month row");
  assert.equal(by.get("1y")!.stock, null);
  assert.equal(by.get("5y")!.stock, null);
  // And nothing downstream invents one either.
  assert.equal(by.get("5y")!.relative, null);
});

test("with no market proxy the comparison columns are blank and the subject's are not", () => {
  const rows = rollingPeriods(snapshot({ market: null }));
  assert.ok(rows.every((r) => r.market === null), "no proxy, no market figure");
  assert.ok(rows.every((r) => r.relative === null), "and nothing to be relative to");
  assert.ok(rows.some((r) => r.stock !== null), "the subject still reports");
});

test("a proxy whose record ends somewhere else cannot be compared session by session", () => {
  /* Every window here is an index lookback: 252 bars back on each series. That
     only compares like with like while the two records are date-aligned, which
     they are today because both come from the same endpoint on the same day.
     It is an observation about the data, not a guarantee of the type — a proxy
     fetch that fell back to a stale cache would put the S&P's 2025 beside the
     subject's 2026 under one header, and nothing on the page would say so. */
  const stale = series(300, 100, 150, NOW - 400 * DAY);
  const rows = rollingPeriods(snapshot({ daily: series(300), market: stale }));

  assert.ok(rows.every((r) => r.market === null), "an unalignable proxy reports nothing");
  assert.ok(rows.every((r) => r.relative === null));
  assert.ok(rows.some((r) => r.stock !== null), "the subject is unaffected");

  const risk = riskProfile(snapshot({ daily: series(300), market: stale }));
  assert.equal(risk.marketVolatility, null);
  assert.equal(risk.marketMaxDrawdown, null);
});

test("year to date is measured from the previous year's final close, on both legs", () => {
  const daily = [
    point(Date.UTC(2025, 11, 31), 100),
    point(Date.UTC(2026, 0, 2), 110),
    point(NOW, 150),
  ];
  const market = [
    point(Date.UTC(2025, 11, 31), 200),
    point(Date.UTC(2026, 0, 2), 210),
    point(NOW, 220),
  ];

  const row = rollingPeriods(snapshot({ daily, market })).find((r) => r.key === "ytd")!;
  close(row.stock, 50);
  close(row.market, 10);
  close(row.relative, (1.5 / 1.1 - 1) * 100);
  // A session count would be a lie about this row: it is a calendar boundary.
  assert.equal(row.sessions, null);
});

test("an empty history reports seven dashes rather than seven zeroes", () => {
  const rows = rollingPeriods(snapshot({ daily: [], market: null }));
  assert.equal(rows.length, 7);
  assert.ok(rows.every((r) => r.stock === null && r.market === null && r.relative === null));
});

/* ── calendar years ─────────────────────────────────────────────────────── */

function yearSpan(year: number, from: number, to: number): PricePoint[] {
  return [point(Date.UTC(year, 0, 3), from), point(Date.UTC(year, 11, 30), to)];
}

test("each calendar year carries the market's own year beside it, joined by year", () => {
  const daily = [...yearSpan(2024, 100, 120), ...yearSpan(2025, 120, 150), ...yearSpan(2026, 150, 180)];
  // The proxy's record starts a year later than the subject's.
  const market = [...yearSpan(2025, 400, 440), ...yearSpan(2026, 440, 460)];

  const rows = calendarYearRows(snapshot({ daily, market }));
  assert.deepEqual(rows.map((r) => r.year), [2026, 2025, 2024]);

  const by = new Map(rows.map((r) => [r.year, r]));
  assert.ok(by.get(2025)!.market !== null);
  /* The year the proxy does not reach. Nought here would tell a reader the
     market was flat in 2024, which is a claim about the S&P nobody made. */
  assert.equal(by.get(2024)!.market, null);
  assert.equal(by.get(2024)!.relative, null);
  assert.ok(by.get(2024)!.stock !== null, "the subject's own year still stands");
});

test("a year the record only partly covers is flagged as a part-year", () => {
  /* A five-year window opens and closes mid-year, so the first and last rows
     of this table are not calendar-year returns at all. Printing them
     unmarked beside four full years invites a straight comparison between a
     twelve-month figure and an eight-month one. */
  const daily = [
    point(Date.UTC(2024, 2, 5), 100),
    point(Date.UTC(2024, 11, 30), 110),
    point(Date.UTC(2025, 0, 3), 110),
    point(Date.UTC(2025, 11, 30), 130),
    point(Date.UTC(2026, 0, 5), 130),
    point(NOW, 150),
  ];

  const by = new Map(calendarYearRows(snapshot({ daily, market: null })).map((r) => [r.year, r]));
  assert.equal(by.get(2024)!.partial, true, "the record opens in March");
  assert.equal(by.get(2025)!.partial, false, "a year covered end to end");
  assert.equal(by.get(2026)!.partial, true, "the record stops in August");
});

test("no history is no rows, rather than a row of nulls with a year attached", () => {
  assert.deepEqual(calendarYearRows(snapshot({ daily: [], market: null })), []);
});

/* ── risk ───────────────────────────────────────────────────────────────── */

test("a series that never moves has nought risk, and divides by nothing on the way there", () => {
  /* The degenerate case. Every figure in this section is a ratio or a
     variance, and a constant series is where each of them can hand back NaN or
     Infinity instead — both of which render as text on the page. */
  const r = riskProfile(snapshot({ daily: flat(300), market: null, price: 100, high52: 100, cagr5y: 0 }));

  assert.equal(r.volatility, 0);
  assert.equal(r.volatility1y, 0);
  assert.equal(r.maxDrawdown, 0);
  assert.equal(r.currentDrawdown, 0);
  assert.equal(r.drawdownFrom52WeekHigh, 0);
  for (const v of [r.volatility, r.volatility1y, r.maxDrawdown, r.currentDrawdown]) {
    assert.ok(v !== null && Number.isFinite(v), `expected a finite figure, got ${v}`);
  }
});

test("the deepest fall is measured from a running peak and dated at both ends", () => {
  const daily = [
    point(NOW - 5 * DAY, 100),
    point(NOW - 4 * DAY, 120), // the peak it fell from
    point(NOW - 3 * DAY, 60), // the trough: −50% from 120, not −40% from 100
    point(NOW - 2 * DAY, 90),
    point(NOW - 1 * DAY, 110),
    point(NOW, 108),
  ];
  const r = riskProfile(snapshot({ daily, market: null, price: 108, high52: 120 }));

  close(r.maxDrawdown, -50);
  assert.equal(r.maxDrawdownAt, NOW - 3 * DAY);
  assert.equal(r.maxDrawdownPeakAt, NOW - 4 * DAY);
  // Today is a different question from the worst day, and recovers with price.
  close(r.currentDrawdown, (108 / 120 - 1) * 100);
  // Six bars cannot support an annualised standard deviation, so it says so.
  assert.equal(r.volatility, null);
  assert.equal(r.sessions, 6);
});

test("a last price above the recorded high is two feeds disagreeing, not a gain", () => {
  const r = riskProfile(snapshot({ daily: flat(60), market: null, price: 500, high52: 100 }));
  assert.equal(r.drawdownFrom52WeekHigh, 0);
  assert.ok(r.drawdownFrom52WeekHigh! <= 0);
});

test("the market's own risk is measured the same way, and is absent when the proxy is", () => {
  const withProxy = riskProfile(snapshot({ daily: series(300), market: series(300, 100, 130) }));
  assert.ok(withProxy.marketVolatility !== null);
  assert.ok(withProxy.marketMaxDrawdown !== null);

  const without = riskProfile(snapshot({ market: null }));
  assert.equal(without.marketVolatility, null);
  assert.equal(without.marketMaxDrawdown, null);
  assert.equal(without.marketCurrentDrawdown, null);
});

test("an empty history yields nulls throughout rather than a tidy row of zeroes", () => {
  const r = riskProfile(
    snapshot({ daily: [], market: null, price: null, high52: null, beta: null, cagr5y: null }),
  );
  assert.equal(r.volatility, null);
  assert.equal(r.volatility1y, null);
  assert.equal(r.maxDrawdown, null);
  assert.equal(r.maxDrawdownAt, null);
  assert.equal(r.currentDrawdown, null);
  assert.equal(r.drawdownFrom52WeekHigh, null);
  assert.equal(r.beta, null);
  assert.equal(r.cagr5y, null);
  assert.equal(r.sessions, 0);
});

test("the underwater curve keeps its trough through downsampling and ends where the price is now", () => {
  /* Downsampling by "take every Nth bar" is the obvious implementation and it
     is the one that quietly deletes the crash: a one-session −50% between two
     sampled points simply is not in the output, and the chart draws a calm
     five years over the worst week in the record. */
  const daily = Array.from({ length: 400 }, (_, i) =>
    point(NOW - (399 - i) * DAY, i === 200 ? 50 : 100),
  );

  const curve = drawdownCurve(snapshot({ daily, market: null }), 20);
  assert.ok(curve.length <= 21, `expected at most 21 samples, got ${curve.length}`);
  assert.ok(
    curve.some((p) => Math.abs(p.pct - -50) < 1e-9),
    "the trough did not survive the downsample",
  );
  // The right-hand edge is the reader's "where are we now"; a bucket minimum
  // there would draw the stock deeper underwater than it actually is.
  assert.equal(curve[curve.length - 1].at, NOW);
  assert.equal(curve[curve.length - 1].pct, 0);
  // An underwater curve is never above the waterline.
  assert.ok(curve.every((p) => p.pct <= 0));
});

test("a flat record draws a flat waterline, and no history draws nothing", () => {
  const level = drawdownCurve(snapshot({ daily: flat(120), market: null }), 20);
  assert.ok(level.length > 0);
  assert.ok(level.every((p) => p.pct === 0));
  assert.deepEqual(drawdownCurve(snapshot({ daily: [], market: null }), 20), []);
});

/* ── the analyst view ───────────────────────────────────────────────────── */

test("the rendered upside is the derived one, and the vendor's unverified field never reaches the view", () => {
  /* `price_target_upside` may arrive as 12.4 or as 0.124 for the same twelve
     and a bit per cent, and nobody has seen a live body to settle it. A
     hundredfold error in an upside column is invisible: "12.4%" and "1,240%"
     are both just text. */
  const v = analystView(snapshot({ price: 250, analyst: covered() }));
  assert.equal(v.state, "available");
  if (v.state !== "available") return;

  assert.equal(v.upsidePct, 16);
  assert.notEqual(v.upsidePct, 12.4);
  assert.ok(!("vendorUpsideUnverified" in v), "the unverified field must not be carried through");
});

test("a missing count stays missing, and a real nought survives as nought", () => {
  const missing = analystView(
    snapshot({
      analyst: covered(
        consensus({
          ratings: { buy: 24, hold: null, sell: 2, total: 34, reportedTotal: 34, totalDisputed: false },
        }),
      ),
    }),
  );
  assert.equal(missing.state, "available");
  if (missing.state !== "available") return;
  assert.equal(missing.ratings.hold, null);
  assert.notEqual(missing.ratings.hold, 0);
  /* A distribution bar needs all three buckets. Drawing it from two would
     scale the two it has to 100% of the street and hide the third entirely. */
  assert.equal(missing.ratings.shares, null);

  const none = analystView(
    snapshot({
      analyst: covered(
        consensus({
          ratings: { buy: 20, hold: 5, sell: 0, total: 25, reportedTotal: 25, totalDisputed: false },
        }),
      ),
    }),
  );
  if (none.state !== "available") return assert.fail("expected an available view");
  assert.equal(none.ratings.sell, 0, "told: no sell ratings");
  assert.deepEqual(none.ratings.shares, { buy: 80, hold: 20, sell: 0 });
});

test("the target rail needs a real range, and says when the price has left it", () => {
  const inside = analystView(snapshot({ price: 250, analyst: covered() }));
  if (inside.state !== "available") return assert.fail("expected an available view");
  close(inside.target.pricePosition, ((250 - 210) / (350 - 210)) * 100);
  close(inside.target.consensusPosition, ((290 - 210) / (350 - 210)) * 100);
  assert.equal(inside.target.priceOutsideRange, false);

  const noRange = analystView(
    snapshot({
      price: 250,
      analyst: covered(
        consensus({ target: { consensus: 290, low: null, high: null, currency: null } }),
      ),
    }),
  );
  if (noRange.state !== "available") return assert.fail("expected an available view");
  assert.equal(noRange.target.pricePosition, null);
  assert.equal(noRange.target.consensusPosition, null);
  // The consensus target itself is untouched by the missing range.
  assert.equal(noRange.target.consensus, 290);

  // A range of no width has no denominator; a rail drawn from it is fiction.
  const degenerate = analystView(
    snapshot({
      price: 250,
      analyst: covered(
        consensus({ target: { consensus: 300, low: 300, high: 300, currency: "USD" } }),
      ),
    }),
  );
  if (degenerate.state !== "available") return assert.fail("expected an available view");
  assert.equal(degenerate.target.pricePosition, null);

  /* A consensus that sits outside its own published low–high is an internally
     inconsistent record. Clamping the marker onto the end of the rail would
     draw "$400" hard against a label reading "$350" and let the reader resolve
     it; the range and the figure both survive, the marker does not. */
  const inconsistent = analystView(
    snapshot({
      price: 250,
      analyst: covered(
        consensus({ target: { consensus: 400, low: 210, high: 350, currency: "USD" } }),
      ),
    }),
  );
  if (inconsistent.state !== "available") return assert.fail("expected an available view");
  assert.equal(inconsistent.target.consensusPosition, null);
  assert.equal(inconsistent.target.consensus, 400, "the figure itself is still reported");
  assert.ok(inconsistent.target.pricePosition !== null, "the price marker is unaffected");

  // A price above every published target is a real and important reading.
  const above = analystView(snapshot({ price: 400, analyst: covered() }));
  if (above.state !== "available") return assert.fail("expected an available view");
  assert.equal(above.target.pricePosition, 100, "clamped onto the rail");
  assert.equal(above.target.priceOutsideRange, true, "and flagged, not silently clamped");
});

test("not entitled is a fact about this account and is never reported as no coverage", () => {
  const v = analystView(snapshot({ analyst: { state: "not-entitled", status: 403 } }));
  assert.deepEqual(v, { state: "not-entitled", status: 403 });
  assert.notEqual(v.state, "no-coverage");
});

test("no coverage is a fact about this company and keeps its own state", () => {
  assert.deepEqual(analystView(snapshot({ analyst: { state: "no-coverage" } })), {
    state: "no-coverage",
  });
});

test("a failed call is unavailable, carries its status, and is never dressed up as either", () => {
  const v = analystView(snapshot({ analyst: { state: "unavailable", status: 502 } }));
  assert.deepEqual(v, { state: "unavailable", status: 502 });
  assert.notEqual(v.state, "no-coverage");
  assert.notEqual(v.state, "not-entitled");

  // A call that never happened has no status worth printing.
  assert.deepEqual(analystView(snapshot({ analyst: { state: "unavailable", status: 0 } })), {
    state: "unavailable",
    status: 0,
  });
});

test("every one of the four states is distinguishable from the other three", () => {
  const states = (
    [
      { state: "available", consensus: consensus() },
      { state: "not-entitled", status: 403 },
      { state: "no-coverage" },
      { state: "unavailable", status: 502 },
    ] as AnalystAvailability[]
  ).map((a) => analystView(snapshot({ analyst: a })).state);

  assert.deepEqual(states, ["available", "not-entitled", "no-coverage", "unavailable"]);
  assert.equal(new Set(states).size, 4);
});
