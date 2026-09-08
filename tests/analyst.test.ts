import { test } from "node:test";
import assert from "node:assert/strict";
import {
  toAnalystAvailability,
  toAnalystConsensus,
} from "../lib/api/normalize/analyst.ts";
import type { AnalystConsensus } from "../lib/api/normalize/analyst.ts";
import type { RawAnalystConsensus } from "../lib/api/clients/analysts.ts";
import type { ApiResult } from "../lib/api/errors.ts";

/* The specification for a response body nobody has ever seen.

   Every analyst path on this account answers 403/4031, so there is no live
   sample to normalize against and no golden fixture to diff. That makes this
   file the contract rather than a regression net: the shapes below are what
   `lib/api/clients/analysts.ts` transcribed from the vendor catalogue, and the
   assertions are what the panel is allowed to believe about them.

   Two mistakes would be worse here than an empty panel, and both of them
   render as a perfectly plausible page:

     - a fabricated figure. "0 analysts" and "$0.00 price target" are what a
       missing count and a missing target look like if the normalizer treats
       absence as a number. On an investment page a $0 consensus target is not
       a blank, it is a sell signal nobody published.
     - a wrong upside. `price_target_upside` has an undocumented unit — 12.4 or
       0.124 for the same 12.4% — and the gateway is already known to disagree
       with itself about exactly this (quotes report a day move as a fraction,
       fundamentals report a yield as one, market cap arrives in millions from
       one feed and dollars from the other). A hundredfold error in an upside
       column is invisible to a reader and indistinguishable from research.

   So the tests below pin absence as hard as they pin presence, and they pin
   the arithmetic to numbers whose units this repo controls. */

/** Percent comparisons carry float noise: (290/250 - 1) * 100 is 15.999…. */
const close = (actual: number | null, expected: number, tol = 1e-9): void => {
  assert.ok(actual !== null, `expected about ${expected}, got null`);
  assert.ok(
    Math.abs(actual - expected) <= tol,
    `expected about ${expected}, got ${actual}`,
  );
};

/* A body with every documented field populated and internally consistent:
   24 + 8 + 2 = 34, and 210 <= 290 <= 350.

   `price_target_upside` is deliberately 12.4 while the honest upside from the
   current price used below is 16.0. The two must never coincide in a fixture,
   or a normalizer that simply forwarded the vendor's number would pass. */
const FULL: RawAnalystConsensus = {
  ticker: "AAPL",
  company_name: "Apple Inc",
  consensus: "Strong Buy",
  buy: 24,
  hold: 8,
  sell: 2,
  total_analysts: 34,
  price_target: 290,
  low_price_target: 210,
  high_price_target: 350,
  price_target_upside: 12.4,
  price_target_currency_code: "USD",
};

/** The price the terminal itself holds, in the units the terminal itself set. */
const PRICE = 250;

/** What a 200 with an empty record would leave us — every field absent. */
const ABSENT: RawAnalystConsensus = {};

/** Anything at all, arriving where a RawAnalystConsensus was declared. */
const alien = (v: unknown): RawAnalystConsensus => v as RawAnalystConsensus;

const okResult = (data: RawAnalystConsensus): ApiResult<RawAnalystConsensus> => ({
  ok: true,
  data,
  status: 200,
  ms: 12,
});

const failResult = (status: number, error: string): ApiResult<RawAnalystConsensus> => ({
  ok: false,
  error,
  status,
  ms: 8,
});

/** Narrowing helper: the tests below are about the figures, not the union. */
function present(raw: RawAnalystConsensus, price: number | null = PRICE): AnalystConsensus {
  const view = toAnalystConsensus(raw, price);
  assert.ok(view !== null, "expected a consensus, got null");
  return view;
}

/* ── the happy path, which is also the path nobody has verified ───────────── */

test("a complete body carries every figure the panel prints", () => {
  const view = present(FULL);

  assert.equal(view.label, "Strong Buy");
  assert.deepEqual(view.ratings, {
    buy: 24,
    hold: 8,
    sell: 2,
    total: 34,
    reportedTotal: 34,
    totalDisputed: false,
  });
  assert.deepEqual(view.target, {
    consensus: 290,
    low: 210,
    high: 350,
    currency: "USD",
  });
});

test("the label is passed through verbatim, not translated into our own vocabulary", () => {
  // The label set is unknown until the 403 lifts. "Moderate Buy", "OUTPERFORM"
  // and "strong_buy" are all plausible; inventing a mapping now would relabel
  // a rating we have never seen.
  assert.equal(present({ ...FULL, consensus: "moderate_buy" }).label, "moderate_buy");
  assert.equal(present({ ...FULL, consensus: "  Hold  " }).label, "Hold");
});

/* ── upside: derived here, never taken on faith ───────────────────────────── */

test("upside is derived from the target and our own price, not from the vendor's field", () => {
  const view = present(FULL);

  // (290 / 250 - 1) * 100
  close(view.upsidePct, 16);
  assert.notEqual(view.upsidePct, 12.4, "vendor figure forwarded as a percent");
  assert.notEqual(view.upsidePct, 1240, "vendor figure forwarded and multiplied");
});

test("the vendor's own upside is preserved but kept out of the rendered figure", () => {
  const view = present(FULL);

  // Carried so the day the endpoint opens somebody can diff it against the
  // derived number and finally settle the unit. Not for display.
  assert.equal(view.vendorUpsideUnverified, 12.4);

  // Same body, same vendor figure, a different price: only the derived number
  // moves. If the two ever tracked each other the vendor value is being used.
  const cheaper = present(FULL, 200);
  close(cheaper.upsidePct, 45);
  assert.equal(cheaper.vendorUpsideUnverified, 12.4);
});

test("a target below the price is a negative upside, not an absent one", () => {
  close(present({ ...FULL, price_target: 200 }).upsidePct, -20);
});

test("a zero or negative current price leaves the upside unknown, never infinite", () => {
  // Called directly rather than through `present`, whose default parameter
  // would substitute PRICE for an explicit undefined and hide the last case.
  for (const price of [0, -1, -250, Number.NaN, Number.POSITIVE_INFINITY, null, undefined]) {
    const view = toAnalystConsensus(FULL, price);
    assert.ok(view !== null, "expected a consensus, got null");
    assert.equal(
      view.upsidePct,
      null,
      `a current price of ${String(price)} produced an upside`,
    );
    // The target itself is still a fact worth showing; only the ratio is not.
    assert.equal(view.target.consensus, 290);
  }
});

test("a non-positive target is a data hole, not a valuation", () => {
  for (const target of [0, -5]) {
    const view = present({ ...FULL, price_target: target });
    assert.equal(view.target.consensus, null, `a target of ${target} survived`);
    assert.equal(view.upsidePct, null);
  }
});

/* ── absence, in every direction ──────────────────────────────────────────── */

test("a body with every field absent is no consensus at all, not a row of zeroes", () => {
  assert.equal(toAnalystConsensus(ABSENT, PRICE), null);
  assert.equal(toAnalystConsensus({ ticker: "AAPL", company_name: "Apple Inc" }, PRICE), null);
  assert.equal(toAnalystConsensus(null, PRICE), null);
  assert.equal(toAnalystConsensus(undefined, PRICE), null);
});

test("a null price target leaves the rest of the record standing", () => {
  const view = present({
    ...FULL,
    price_target: null,
    low_price_target: null,
    high_price_target: null,
    price_target_upside: null,
  });

  assert.equal(view.target.consensus, null);
  assert.equal(view.target.low, null);
  assert.equal(view.target.high, null);
  assert.equal(view.upsidePct, null);
  assert.equal(view.vendorUpsideUnverified, null);
  // The ratings half is untouched: a covered stock with no published target is
  // an ordinary thing, and the buy/hold/sell split is still the news.
  assert.equal(view.label, "Strong Buy");
  assert.equal(view.ratings.buy, 24);
});

test("a missing count stays null while a real zero survives as zero", () => {
  // These two must not collapse into each other. "No sell ratings" is a
  // finding; "we were not told how many sell ratings there are" is not.
  const view = present({ ...FULL, buy: 24, hold: 8, sell: 0, total_analysts: 32 });
  assert.equal(view.ratings.sell, 0);
  assert.equal(view.ratings.total, 32);
  assert.equal(view.ratings.totalDisputed, false);

  const partial = present({ ...FULL, hold: null });
  assert.equal(partial.ratings.hold, null);
  assert.equal(partial.ratings.buy, 24);
});

test("a negative or fractional count is not a count", () => {
  const view = present({ ...FULL, buy: -3, hold: 8.5, sell: 2 });
  assert.equal(view.ratings.buy, null);
  assert.equal(view.ratings.hold, null);
  assert.equal(view.ratings.sell, 2);
});

test("the currency is never assumed to be dollars", () => {
  // This terminal sells US equities to readers who hold rupees. A target
  // printed as ₹290 or as $290 is two different investment cases, and the
  // gateway not saying which is not permission to pick one.
  const view = present({ ...FULL, price_target_currency_code: null });
  assert.equal(view.target.currency, null);
  assert.equal(view.target.consensus, 290);

  assert.equal(present({ ...FULL, price_target_currency_code: "usd" }).target.currency, "USD");
  assert.equal(present({ ...FULL, price_target_currency_code: "  " }).target.currency, null);
  assert.equal(present({ ...FULL, price_target_currency_code: "US Dollar" }).target.currency, null);
});

test("a range that reads backwards is dropped rather than quietly reordered", () => {
  // Which of the two fields is mislabelled cannot be known from here, and
  // "$350 – $210" is not a range a reader can act on either way.
  const view = present({ ...FULL, low_price_target: 350, high_price_target: 210 });
  assert.equal(view.target.low, null);
  assert.equal(view.target.high, null);
  assert.equal(view.target.consensus, 290, "the consensus target went down with the range");
});

/* ── the counts and the total, which are not required to agree ────────────── */

test("counts that contradict the total are reconciled to the breakdown, and the disagreement is recorded", () => {
  // 24 + 8 + 2 = 34, but the record claims 30. The three counts are what the
  // panel draws its bars from, so the total it prints has to be the one those
  // bars add up to — a header reading "30 analysts" over 34 of them is a
  // fabricated fourth number.
  const view = present({ ...FULL, total_analysts: 30 });
  assert.equal(view.ratings.total, 34);
  assert.equal(view.ratings.reportedTotal, 30);
  assert.equal(view.ratings.totalDisputed, true);
});

test("a total with no breakdown to check it against is reported as it came", () => {
  const view = present({
    ...FULL,
    buy: null,
    hold: null,
    sell: null,
    total_analysts: 12,
  });
  assert.equal(view.ratings.total, 12);
  assert.equal(view.ratings.reportedTotal, 12);
  // Nothing disagreed, because nothing could be compared.
  assert.equal(view.ratings.totalDisputed, false);
});

test("an incomplete breakdown does not get summed into a smaller total", () => {
  // buy and sell alone are not a census. Summing them to 26 and printing that
  // as the coverage would lose eight analysts silently.
  const view = present({ ...FULL, hold: null, total_analysts: 34 });
  assert.equal(view.ratings.total, 34);
  assert.equal(view.ratings.totalDisputed, false);
});

test("a full breakdown with no total at all supplies its own", () => {
  const view = present({ ...FULL, total_analysts: null });
  assert.equal(view.ratings.total, 34);
  assert.equal(view.ratings.reportedTotal, null);
  assert.equal(view.ratings.totalDisputed, false);
});

test("a record whose only content is a zero total is not coverage", () => {
  // Zero analysts is the same statement as no analyst data, and it must not
  // manufacture a panel with an empty bar chart in it.
  assert.equal(
    toAnalystConsensus({ ticker: "AAPL", total_analysts: 0 }, PRICE),
    null,
  );
});

/* ── junk in, nothing out, never a throw ──────────────────────────────────── */

test("a completely unrecognised object shape yields nothing and does not throw", () => {
  const shapes: unknown[] = [
    { data: { items: [] } },
    { error: "forbidden", code: 4031 },
    { consensus: { rating: "Buy" }, price_target: { value: 290 } },
    [],
    [FULL],
    "Strong Buy",
    42,
    true,
    Number.NaN,
  ];

  for (const shape of shapes) {
    assert.equal(
      toAnalystConsensus(alien(shape), PRICE),
      null,
      `${JSON.stringify(shape) ?? String(shape)} produced a consensus`,
    );
  }
});

test("numbers that arrive as strings are not counted or priced", () => {
  // This is parsed JSON wearing a TypeScript type. Nothing has validated it,
  // and "290" * 1 is the sort of coercion that puts a target on the page.
  const view = toAnalystConsensus(
    alien({ buy: "24", hold: "8", sell: "2", total_analysts: "34", price_target: "290" }),
    PRICE,
  );
  assert.equal(view, null);
});

test("a half-string body keeps only what it can defend", () => {
  const view = present(alien({ ...FULL, price_target: "290", buy: "24" }));
  assert.equal(view.target.consensus, null);
  assert.equal(view.upsidePct, null);
  assert.equal(view.ratings.buy, null);
  assert.equal(view.ratings.hold, 8);
  assert.equal(view.label, "Strong Buy");
});

/* ── the availability union the panel actually renders ────────────────────── */

test("a 403 is not entitled — the account cannot see this, which is not the same as no coverage", () => {
  const state = toAnalystAvailability(failResult(403, "HTTP 403 · code 4031"), PRICE);
  assert.deepEqual(state, { state: "not-entitled", status: 403 });
});

test("a 200 with nothing in it is no coverage — entitled, but this ticker has none", () => {
  assert.deepEqual(toAnalystAvailability(okResult(ABSENT), PRICE), { state: "no-coverage" });
  assert.deepEqual(toAnalystAvailability(okResult(alien({ junk: 1 })), PRICE), {
    state: "no-coverage",
  });
});

test("a 200 with a record is available", () => {
  const state = toAnalystAvailability(okResult(FULL), PRICE);
  assert.equal(state.state, "available");
  assert.ok(state.state === "available");
  assert.equal(state.consensus.label, "Strong Buy");
  close(state.consensus.upsidePct, 16);
});

test("any other failure is unavailable, and is never dressed up as no coverage", () => {
  // A 502, a timeout or a 404 on a mistyped path all mean "we do not know".
  // Reporting that as "no analysts cover this company" states a fact about the
  // company that nobody established.
  for (const status of [500, 502, 504, 404, 401, 429, 0]) {
    assert.deepEqual(
      toAnalystAvailability(failResult(status, "upstream"), PRICE),
      { state: "unavailable", status },
      `HTTP ${status} was not reported as unavailable`,
    );
  }
});

test("a call that never happened is unavailable rather than a crash", () => {
  assert.deepEqual(toAnalystAvailability(undefined, PRICE), { state: "unavailable", status: 0 });
  assert.deepEqual(toAnalystAvailability(null, PRICE), { state: "unavailable", status: 0 });
});

test("nothing in this module throws, whatever it is handed", () => {
  const prices: unknown[] = [PRICE, 0, -1, null, undefined, Number.NaN, "250"];
  const bodies: unknown[] = [FULL, ABSENT, null, undefined, [], "x", 0, { consensus: 5 }];

  for (const body of bodies) {
    for (const price of prices) {
      assert.doesNotThrow(() => toAnalystConsensus(alien(body), price as number));
      assert.doesNotThrow(() =>
        toAnalystAvailability(okResult(alien(body)), price as number),
      );
    }
  }
});
