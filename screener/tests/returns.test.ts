import { test } from "node:test";
import assert from "node:assert/strict";
import { returnsFrom } from "../lib/api/normalize/returns.ts";
import type { RawHistoryPoint } from "../lib/api/clients/quotes.ts";

/* One five-year history answers both columns, so the sector page costs one
   call per name rather than two. The arithmetic is where it can quietly go
   wrong: a cumulative return worn as a compound rate overstates a five-year
   holding by a factor of five or more. */

const DAY = 86_400_000;

/** A price series ending today, one point per trading day walked backwards. */
function series(spec: Array<{ daysAgo: number; price: number }>): RawHistoryPoint[] {
  const end = Date.UTC(2026, 7, 21, 20, 0, 0);
  return spec.map(({ daysAgo, price }) => {
    const d = new Date(end - daysAgo * DAY);
    const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
    const dd = String(d.getUTCDate()).padStart(2, "0");
    return {
      date: `${mm}/${dd}/${d.getUTCFullYear()} 16:00:00 EDT`,
      price,
      opening: price,
      high: price,
      low: price,
      volume: 1,
    };
  });
}

/** Five years of daily points compounding at a steady annual rate. */
function steady(rate: number, years = 5): RawHistoryPoint[] {
  const pts: Array<{ daysAgo: number; price: number }> = [];
  for (let d = Math.round(years * 365); d >= 0; d -= 1) {
    pts.push({ daysAgo: d, price: 100 * (1 + rate) ** ((years * 365 - d) / 365) });
  }
  return series(pts);
}

test("a one-year return measures a year back, not the whole series", () => {
  const r = returnsFrom(
    series([
      { daysAgo: 365 * 5, price: 10 },
      { daysAgo: 365, price: 100 },
      { daysAgo: 0, price: 150 },
    ]),
  );
  assert.ok(r.ret1y !== null);
  assert.ok(Math.abs(r.ret1y - 50) < 1, `expected about +50%, got ${r.ret1y}`);
});

test("a five-year CAGR is the compound rate, not the cumulative return", () => {
  const r = returnsFrom(steady(0.15));
  assert.ok(r.cagr5y !== null && r.ret5y !== null);
  assert.ok(Math.abs(r.cagr5y - 15) < 0.6, `CAGR should be about 15%, got ${r.cagr5y}`);
  // The same series doubles: cumulative and compound must not be confused.
  assert.ok(r.ret5y > 90, `cumulative should be about +101%, got ${r.ret5y}`);
  assert.ok(r.ret5y > r.cagr5y * 3, "cumulative and compound collapsed into one figure");
});

test("a series too short to span a year yields no one-year figure", () => {
  const r = returnsFrom(series([{ daysAgo: 30, price: 100 }, { daysAgo: 0, price: 110 }]));
  assert.equal(r.ret1y, null);
  assert.equal(r.cagr5y, null);
});

test("points are sorted before they are read", () => {
  const ascending = series([
    { daysAgo: 365 * 5, price: 50 },
    { daysAgo: 365, price: 100 },
    { daysAgo: 0, price: 200 },
  ]);
  const shuffled = [ascending[1], ascending[2], ascending[0]];
  assert.deepEqual(returnsFrom(shuffled), returnsFrom(ascending));
});

test("a zero or negative price is refused rather than returning infinity", () => {
  const r = returnsFrom(
    series([
      { daysAgo: 365 * 5, price: 0 },
      { daysAgo: 365, price: 0 },
      { daysAgo: 0, price: 120 },
    ]),
  );
  assert.equal(r.cagr5y, null);
  assert.equal(r.ret1y, null);
});

test("an empty history is null throughout rather than zero", () => {
  const r = returnsFrom([]);
  assert.deepEqual(r, { ret1y: null, ret5y: null, cagr5y: null });
});

/* ------------------------------------------------------------------ */
/* Split repair                                                        */
/* ------------------------------------------------------------------ */

/* The gateway's history is already split-adjusted — nearly always. Measuring
   four hundred names found exactly one that was not: XLK split two-for-one and
   its pre-split prices were left at the old share count, so the fund read as
   though it fell twenty-nine per cent in a year it rose forty.

   Adjusting every split blindly "fixed" that one and broke a third of the
   universe: NVDA, whose series was already correct, came out ten times too
   high. So the rule is to repair only where the series visibly breaks, and
   only where a known split explains the break. */

/** A day-over-day series with a break of `ratio` at `breakIndex`. */
function withBreak(n: number, breakIndex: number, ratio: number): RawHistoryPoint[] {
  const spec: Array<{ daysAgo: number; price: number }> = [];
  for (let i = 0; i < n; i++) {
    const price = i < breakIndex ? 100 * ratio : 100;
    spec.push({ daysAgo: n - 1 - i, price });
  }
  return series(spec);
}

test("a series that visibly breaks at a split is restated", async () => {
  const { repairSplitBreaks } = await import("../lib/api/normalize/returns.ts");
  const points = withBreak(40, 20, 2);
  const breakDate = points[20].date.slice(6, 10) + "-" + points[20].date.slice(0, 2) + "-" + points[20].date.slice(3, 5);

  const fixed = repairSplitBreaks(points, [
    { execution_date: breakDate, split_from: 1, split_to: 2 },
  ]);

  assert.equal(fixed[0].price, 100, "pre-break prices come down onto the new share count");
  assert.equal(fixed[39].price, 100, "post-break prices are untouched");
});

test("a series that is already adjusted is left exactly alone", async () => {
  const { repairSplitBreaks } = await import("../lib/api/normalize/returns.ts");
  /* NVDA's case, and the one that matters most: the split is real and on
     record, but the vendor already applied it. Applying it again put the
     five-year return out by a factor of ten. */
  const smooth = series(
    Array.from({ length: 40 }, (_, i) => ({ daysAgo: 39 - i, price: 100 + i })),
  );
  const fixed = repairSplitBreaks(smooth, [
    { execution_date: "2026-08-05", split_from: 1, split_to: 10 },
  ]);
  assert.deepEqual(fixed, smooth);
});

test("a fall that no split explains is not treated as one", async () => {
  const { repairSplitBreaks } = await import("../lib/api/normalize/returns.ts");
  // A company that genuinely halved on news has not split, and restating it
  // would erase a real loss.
  const points = withBreak(40, 20, 2);
  assert.deepEqual(repairSplitBreaks(points, []), points);
  assert.deepEqual(
    repairSplitBreaks(points, [{ execution_date: "2026-08-05", split_from: 1, split_to: 7 }]),
    points,
  );
});

test("a reverse split break is restated upward", async () => {
  const { repairSplitBreaks } = await import("../lib/api/normalize/returns.ts");
  const points = withBreak(40, 20, 0.1);
  const breakDate = points[20].date.slice(6, 10) + "-" + points[20].date.slice(0, 2) + "-" + points[20].date.slice(3, 5);
  const fixed = repairSplitBreaks(points, [
    { execution_date: breakDate, split_from: 10, split_to: 1 },
  ]);
  assert.equal(fixed[0].price, 100);
  assert.equal(fixed[39].price, 100);
});
