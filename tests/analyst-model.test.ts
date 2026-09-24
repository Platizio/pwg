import { test } from "node:test";
import assert from "node:assert/strict";
import {
  analystModel,
  analystModelFromAvailability,
  displayRating,
  distributionSummary,
  formatRatingDate,
  formatRetrieved,
  parseRatingChanges,
  ratingTier,
  type AnalystModel,
} from "../lib/market/analyst.ts";
import type { AnalystAvailability } from "../lib/api/normalize/analyst.ts";

/* The analyst view-model, pinned against bodies that were actually served.

   Every fixture below says where it came from. Three kinds exist:

     OBSERVED   a body this account's credentials really received. The TipRanks
                consensus for MSFT was answered 200 on 2026-08-17 by
                POST middleware-staging.viewtrade.in/api/v1/insight/v1/tipranks/
                analyst-consensus (recorded in Global_API/ViewTrade_API_Endpoints
                _UAT.xlsx, sheet "Test Results"). The 403/4031 and the 400
                AmbiguousWatchmenInstance were received on 2026-09-24 by the probe
                in this change.
     CATALOGUE  ViewTrade's own sample response for the same endpoint.
     DOCUMENTED Polygon's published Benzinga shapes. The /mdp polygon proxy
                answers 403/4031 on these paths today, so nothing here has been
                observed; they are parsed strictly and every test that uses one
                says so.

   The two failure modes that matter are the ones that render as a perfectly
   plausible page: a figure this terminal invented (a nought standing in for
   "not told", a strong-buy bucket the source never reported), and a state
   that lies about why nothing is shown ("no coverage" when the truth is "this
   account cannot see it"). */

/* ── fixtures ─────────────────────────────────────────────────────────── */

/** OBSERVED, 2026-08-17. The whole body, byte for byte: an ARRAY, one row per ticker. */
const MSFT_OBSERVED: unknown = [
  {
    low_price_target: 450,
    high_price_target: 700,
    price_target: 564.49,
    buy: 32,
    sell: 0,
    hold: 1,
    consensus: "StrongBuy",
    price_target_upside: 13.95,
    ticker: "MSFT",
    company_name: "Microsoft",
    price_target_currency_code: "USD",
    total_analysts: 33,
  },
];

/** CATALOGUE sample for the same endpoint. */
const AAPL_CATALOGUE = {
  low_price_target: 248,
  high_price_target: 350,
  price_target: 304.4,
  buy: 14,
  sell: 1,
  hold: 9,
  consensus: "Buy",
  price_target_upside: 20.5,
  ticker: "AAPL",
  company_name: "Apple",
  price_target_currency_code: "USD",
  total_analysts: 24,
};

/** OBSERVED, 2026-09-24: what the app's current client receives for every ticker. */
const FORBIDDEN = {
  ok: false as const,
  status: 403,
  error: '{"code":4031,"description":"You are not authorized to access this resource. Error code 403"}',
};

/** OBSERVED, 2026-09-24: the catalogued endpoint, called with the partner token. */
const AMBIGUOUS_WATCHMEN = {
  ok: false as const,
  status: 400,
  error: '{"errorCode":"AmbiguousWatchmenInstance","message":"A Watchmen instance must be specified"}',
};

/** DOCUMENTED (Polygon /benzinga/v1/consensus-ratings). Never observed. */
const BENZINGA_CONSENSUS = {
  status: "OK",
  results: {
    ticker: "NVDA",
    strong_buy_ratings: 30,
    buy_ratings: 12,
    hold_ratings: 4,
    sell_ratings: 1,
    strong_sell_ratings: 0,
    consensus_rating: "buy",
    consensus_price_target: 210,
    high_price_target: 260,
    low_price_target: 120,
    ratings_contributors: 47,
  },
};

/** DOCUMENTED (Polygon /benzinga/v1/ratings). Never observed. Deliberately unsorted. */
const BENZINGA_RATINGS = {
  status: "OK",
  results: [
    {
      ticker: "NVDA",
      date: "2026-09-02",
      firm: "Morgan Stanley",
      analyst: "Joseph Moore",
      rating_action: "maintains",
      rating: "Overweight",
      previous_rating: "Overweight",
      price_target: 210,
      previous_price_target: 200,
    },
    {
      ticker: "NVDA",
      date: "2026-09-18",
      firm: "HSBC",
      analyst: "Frank Lee",
      rating_action: "upgrades",
      rating: "Buy",
      previous_rating: "Hold",
      price_target: 240,
      previous_price_target: 180,
    },
    {
      ticker: "NVDA",
      date: "2026-09-10",
      firm: "Seaport Global",
      analyst: null,
      rating_action: "initiates_coverage_on",
      rating: "Sell",
      previous_rating: null,
      price_target: 140,
      previous_price_target: null,
    },
  ],
};

const MSFT_PRICE = 495.38;

/** Narrowing helper: most tests are about the figures, not the union. */
function ready(m: AnalystModel) {
  assert.equal(m.state, "ready", `expected ready, got ${m.state}`);
  if (m.state !== "ready") throw new Error("unreachable");
  return m;
}

const close = (actual: number | null | undefined, expected: number, tol = 1e-6) => {
  assert.ok(typeof actual === "number", `expected about ${expected}, got ${String(actual)}`);
  assert.ok(Math.abs(actual - expected) <= tol, `expected about ${expected}, got ${actual}`);
};

/* ── the observed TipRanks body ───────────────────────────────────────── */

test("the observed MSFT body renders a full consensus", () => {
  const m = ready(
    analystModel({
      ticker: "MSFT",
      price: MSFT_PRICE,
      consensus: { ok: true, status: 200, data: MSFT_OBSERVED },
    }),
  );

  assert.equal(m.source, "tipranks");
  assert.equal(m.partial, false);
  assert.deepEqual(m.missing, ["changes"]);

  const c = m.consensus;
  assert.ok(c);
  assert.equal(c.label, "Strong Buy", "StrongBuy is spaced, not translated");
  assert.equal(c.tier, "strong-buy");
  assert.equal(c.analysts, 33);
  assert.equal(c.reportedTotal, 33);
  assert.equal(c.countsDisputed, false);

  const t = m.target;
  assert.ok(t);
  assert.equal(t.low, 450);
  assert.equal(t.mean, 564.49);
  assert.equal(t.high, 700);
  assert.equal(t.currency, "USD");
  assert.equal(t.price, MSFT_PRICE);
});

test("TipRanks reports three buckets, and the view never invents a strong-buy split", () => {
  const m = ready(
    analystModel({ ticker: "MSFT", price: MSFT_PRICE, consensus: { ok: true, data: MSFT_OBSERVED } }),
  );
  const buckets = m.consensus?.buckets;
  assert.ok(buckets);
  assert.deepEqual(
    buckets.map((b) => [b.tier, b.count]),
    [
      ["buy", 32],
      ["hold", 1],
      ["sell", 0],
    ],
  );
  close(buckets[0].share, (32 / 33) * 100);
  close(buckets[1].share, (1 / 33) * 100);
  // A real nought survives as nought: "no sell ratings" is a finding.
  assert.equal(buckets[2].count, 0);
  assert.equal(buckets[2].share, 0);
});

test("the vendor's price_target_upside is a percent, and the derived upside agrees with it", () => {
  // Settles the unit question the older normalizer refused to guess at: at the
  // price the vendor struck it against, (564.49 / 495.38 - 1) * 100 = 13.95.
  const row = (MSFT_OBSERVED as Array<Record<string, number>>)[0];
  const impliedPrice = row.price_target / (1 + row.price_target_upside / 100);
  close(impliedPrice, MSFT_PRICE, 0.01);

  const m = ready(
    analystModel({ ticker: "MSFT", price: MSFT_PRICE, consensus: { ok: true, data: MSFT_OBSERVED } }),
  );
  close(m.target?.upsidePct, 13.95, 0.01);
  close(m.target?.lowPct, (450 / MSFT_PRICE - 1) * 100);
  close(m.target?.highPct, (700 / MSFT_PRICE - 1) * 100);
});

test("the upside is always struck against OUR price, not the vendor's figure", () => {
  const m = ready(
    analystModel({ ticker: "MSFT", price: 600, consensus: { ok: true, data: MSFT_OBSERVED } }),
  );
  close(m.target?.upsidePct, (564.49 / 600 - 1) * 100);
  assert.ok((m.target?.upsidePct ?? 0) < 0, "a target below the price is a downside");
});

test("the rail places price and mean on one axis, low to high", () => {
  const m = ready(
    analystModel({ ticker: "MSFT", price: MSFT_PRICE, consensus: { ok: true, data: MSFT_OBSERVED } }),
  );
  const rail = m.target?.rail;
  assert.ok(rail);
  close(rail.low, 0);
  close(rail.high, 100);
  close(rail.mean, ((564.49 - 450) / 250) * 100);
  close(rail.price, ((MSFT_PRICE - 450) / 250) * 100);
  assert.equal(rail.priceOutside, false);
});

test("a price outside the published range widens the rail instead of being pinned to its end", () => {
  const m = ready(
    analystModel({ ticker: "MSFT", price: 800, consensus: { ok: true, data: MSFT_OBSERVED } }),
  );
  const rail = m.target?.rail;
  assert.ok(rail);
  assert.equal(rail.priceOutside, true);
  close(rail.low, 0);
  close(rail.price, 100);
  close(rail.high, ((700 - 450) / (800 - 450)) * 100);
});

/* ── the envelope ─────────────────────────────────────────────────────── */

test("a batch body is searched for the requested ticker", () => {
  const body = [AAPL_CATALOGUE, ...(MSFT_OBSERVED as unknown[])];
  const aapl = ready(analystModel({ ticker: "aapl", price: 252.6, consensus: { ok: true, data: body } }));
  assert.equal(aapl.consensus?.analysts, 24);
  assert.equal(aapl.consensus?.label, "Buy");
  assert.equal(aapl.consensus?.tier, "buy");

  const msft = ready(analystModel({ ticker: "MSFT", price: MSFT_PRICE, consensus: { ok: true, data: body } }));
  assert.equal(msft.consensus?.analysts, 33);
});

test("an answered batch without the ticker is no coverage, and an empty array is too", () => {
  assert.deepEqual(
    analystModel({ ticker: "PLTR", price: 30, consensus: { ok: true, data: MSFT_OBSERVED } }),
    { state: "no-coverage" },
  );
  assert.deepEqual(analystModel({ ticker: "SPY", price: 500, consensus: { ok: true, data: [] } }), {
    state: "no-coverage",
  });
});

test("a single bare record is accepted, and share-class punctuation does not break the match", () => {
  const m = ready(
    analystModel({
      ticker: "BRK.B",
      price: 400,
      consensus: { ok: true, data: { ...AAPL_CATALOGUE, ticker: "BRK-B" } },
    }),
  );
  assert.equal(m.consensus?.analysts, 24);
});

test("a body nobody can read is 'could not be read', never 'no coverage'", () => {
  for (const data of ["Strong Buy", 42, true, null, { error: "boom" }, [{ foo: 1 }]]) {
    const m = analystModel({ ticker: "MSFT", price: MSFT_PRICE, consensus: { ok: true, status: 200, data } });
    assert.deepEqual(m, { state: "unavailable", status: 200 }, `${JSON.stringify(data)} was misread`);
  }
});

test("a recognisable record that says nothing is no coverage", () => {
  assert.deepEqual(
    analystModel({
      ticker: "XYZ",
      price: 10,
      consensus: { ok: true, data: [{ ticker: "XYZ", total_analysts: 0, buy: 0, hold: 0, sell: 0 }] },
    }),
    { state: "no-coverage" },
  );
});

/* ── the four honest states ───────────────────────────────────────────── */

test("the 403/4031 every ticker gets today is not-entitled", () => {
  assert.deepEqual(analystModel({ ticker: "AAPL", price: 250, consensus: FORBIDDEN }), {
    state: "not-entitled",
    status: 403,
  });
});

test("the middleware's AmbiguousWatchmenInstance is a request fault, not an entitlement", () => {
  assert.deepEqual(analystModel({ ticker: "AAPL", price: 250, consensus: AMBIGUOUS_WATCHMEN }), {
    state: "unavailable",
    status: 400,
  });
});

test("every other failure, and a call that never happened, is unavailable", () => {
  for (const status of [401, 404, 429, 500, 502, 0]) {
    assert.deepEqual(
      analystModel({ ticker: "AAPL", price: 250, consensus: { ok: false, status } }),
      { state: "unavailable", status },
    );
  }
  assert.deepEqual(analystModel({ ticker: "AAPL", price: 250, consensus: undefined }), {
    state: "unavailable",
    status: 0,
  });
  assert.deepEqual(analystModel({ ticker: "AAPL", price: 250, consensus: null }), {
    state: "unavailable",
    status: 0,
  });
});

test("loading is its own state", () => {
  assert.deepEqual(analystModel({ ticker: "AAPL", price: 250, consensus: "loading" }), {
    state: "loading",
  });
});

/* ── absence, never nought ────────────────────────────────────────────── */

test("an incomplete breakdown draws no bar and defers to the reported total", () => {
  const m = ready(
    analystModel({
      ticker: "AAPL",
      price: 252.6,
      consensus: { ok: true, data: [{ ...AAPL_CATALOGUE, hold: null }] },
    }),
  );
  assert.equal(m.consensus?.buckets, null);
  assert.equal(m.consensus?.analysts, 24);
  assert.equal(m.consensus?.counts.hold, null);
  assert.equal(m.consensus?.counts.buy, 14);
  assert.equal(m.partial, true);
  assert.ok(m.missing.includes("breakdown"));
});

test("counts that contradict the total: the bar's own sum wins and the dispute is flagged", () => {
  const m = ready(
    analystModel({
      ticker: "AAPL",
      price: 252.6,
      consensus: { ok: true, data: [{ ...AAPL_CATALOGUE, total_analysts: 30 }] },
    }),
  );
  assert.equal(m.consensus?.analysts, 24);
  assert.equal(m.consensus?.reportedTotal, 30);
  assert.equal(m.consensus?.countsDisputed, true);
});

test("numbers that arrive as strings are neither counted nor priced", () => {
  const m = ready(
    analystModel({
      ticker: "AAPL",
      price: 252.6,
      consensus: { ok: true, data: [{ ...AAPL_CATALOGUE, buy: "14", price_target: "304.4" }] },
    }),
  );
  assert.equal(m.consensus?.counts.buy, null);
  assert.equal(m.target?.mean, null);
  assert.equal(m.target?.upsidePct, null);
  // What could be defended still stands.
  assert.equal(m.target?.low, 248);
  assert.equal(m.consensus?.label, "Buy");
});

test("no target at all leaves the rating standing and marks the view partial", () => {
  const m = ready(
    analystModel({
      ticker: "AAPL",
      price: 252.6,
      consensus: {
        ok: true,
        data: [{ ...AAPL_CATALOGUE, price_target: null, low_price_target: null, high_price_target: null }],
      },
    }),
  );
  assert.equal(m.target, null);
  assert.equal(m.consensus?.analysts, 24);
  assert.ok(m.missing.includes("target"));
  assert.equal(m.partial, true);
});

test("a zero or missing price leaves the upside unknown, never infinite", () => {
  for (const price of [0, -1, Number.NaN, null, undefined]) {
    const m = ready(analystModel({ ticker: "MSFT", price, consensus: { ok: true, data: MSFT_OBSERVED } }));
    assert.equal(m.target?.upsidePct, null, `price ${String(price)} produced an upside`);
    assert.equal(m.target?.mean, 564.49);
    assert.equal(m.target?.rail?.price ?? null, null);
  }
});

test("a range that reads backwards is dropped, the mean kept", () => {
  const m = ready(
    analystModel({
      ticker: "AAPL",
      price: 252.6,
      consensus: { ok: true, data: [{ ...AAPL_CATALOGUE, low_price_target: 350, high_price_target: 248 }] },
    }),
  );
  assert.equal(m.target?.low, null);
  assert.equal(m.target?.high, null);
  assert.equal(m.target?.mean, 304.4);
  assert.equal(m.target?.rail, null);
});

test("a target in another currency is shown but never set against a dollar price", () => {
  const m = ready(
    analystModel({
      ticker: "AAPL",
      price: 252.6,
      consensus: { ok: true, data: [{ ...AAPL_CATALOGUE, price_target_currency_code: "inr" }] },
    }),
  );
  assert.equal(m.target?.currency, "INR");
  assert.equal(m.target?.mean, 304.4);
  assert.equal(m.target?.upsidePct, null);
  assert.equal(m.target?.rail, null);
});

/* ── labels ───────────────────────────────────────────────────────────── */

test("vendor labels are spaced and tiered, and an unknown one passes through untiered", () => {
  assert.equal(displayRating("StrongBuy"), "Strong Buy");
  assert.equal(displayRating("ModerateBuy"), "Moderate Buy");
  assert.equal(displayRating("strong_sell"), "Strong Sell");
  assert.equal(displayRating("OUTPERFORM"), "Outperform");
  assert.equal(displayRating("  Hold "), "Hold");
  assert.equal(displayRating(""), null);
  assert.equal(displayRating(12), null);

  assert.equal(ratingTier("StrongBuy"), "strong-buy");
  assert.equal(ratingTier("ModerateBuy"), "buy");
  assert.equal(ratingTier("Outperform"), "buy");
  assert.equal(ratingTier("Overweight"), "buy");
  assert.equal(ratingTier("Hold"), "hold");
  assert.equal(ratingTier("Equal-Weight"), "hold");
  assert.equal(ratingTier("ModerateSell"), "sell");
  assert.equal(ratingTier("Underperform"), "sell");
  assert.equal(ratingTier("StrongSell"), "strong-sell");
  assert.equal(ratingTier("Speculative"), null);
  assert.equal(displayRating("Speculative"), "Speculative");
});

test("the distribution summary reads the bar aloud", () => {
  const m = ready(
    analystModel({ ticker: "MSFT", price: MSFT_PRICE, consensus: { ok: true, data: MSFT_OBSERVED } }),
  );
  assert.equal(distributionSummary(m.consensus), "33 analysts: 32 buy, 1 hold, 0 sell");
  assert.equal(distributionSummary(null), null);
});

/* ── Benzinga, DOCUMENTED only ────────────────────────────────────────── */

test("DOCUMENTED: a five-bucket consensus keeps all five buckets", () => {
  const m = ready(
    analystModel({ ticker: "NVDA", price: 180, consensus: { ok: true, data: BENZINGA_CONSENSUS } }),
  );
  assert.equal(m.source, "benzinga");
  assert.deepEqual(
    m.consensus?.buckets?.map((b) => [b.tier, b.count]),
    [
      ["strong-buy", 30],
      ["buy", 12],
      ["hold", 4],
      ["sell", 1],
      ["strong-sell", 0],
    ],
  );
  assert.equal(m.consensus?.analysts, 47);
  assert.equal(m.consensus?.tier, "buy");
  assert.equal(m.target?.mean, 210);
  // Polygon states no currency on this record; it is not assumed.
  assert.equal(m.target?.currency, null);
  close(m.target?.upsidePct, (210 / 180 - 1) * 100);
});

test("DOCUMENTED: rating changes come out newest first with the action named", () => {
  const changes = parseRatingChanges(BENZINGA_RATINGS, { ticker: "NVDA" });
  assert.deepEqual(
    changes.map((c) => [c.date, c.firm, c.action, c.from, c.to, c.targetFrom, c.targetTo]),
    [
      ["2026-09-18", "HSBC", "upgrade", "Hold", "Buy", 180, 240],
      ["2026-09-10", "Seaport Global", "initiate", null, "Sell", null, 140],
      ["2026-09-02", "Morgan Stanley", "maintain", "Overweight", "Overweight", 200, 210],
    ],
  );
  assert.equal(changes[0].actionLabel, "Upgrade");
  assert.equal(changes[1].actionLabel, "Initiated");
  assert.equal(changes[0].analyst, "Frank Lee");
  assert.equal(changes[1].analyst, null);
});

test("rating changes: malformed rows are dropped rather than repaired, and the list is capped", () => {
  const rows = [
    { date: "2026-09-01", firm: "", rating: "Buy" }, // no firm
    { date: "yesterday", firm: "Citi", rating: "Buy" }, // no date
    { date: "2026-09-03", firm: "Citi" }, // nothing happened
    { date: "2026-09-04T13:05:00Z", firm: "Citi", rating_action: "downgrades", rating: "Neutral", previous_rating: "Buy", price_target: "300" },
    { date: "2026-09-05", firm: "UBS", rating_action: "raises", rating: "Buy", previous_price_target: 100, price_target: 120, ticker: "AAPL" },
  ];
  const changes = parseRatingChanges(rows, { ticker: "NVDA" });
  assert.deepEqual(
    changes.map((c) => [c.date, c.firm, c.action, c.targetTo]),
    [["2026-09-04", "Citi", "downgrade", null]],
  );

  const many = Array.from({ length: 20 }, (_, i) => ({
    date: `2026-08-${String(i + 1).padStart(2, "0")}`,
    firm: `Firm ${i}`,
    rating_action: "reiterates",
    rating: "Buy",
  }));
  const capped = parseRatingChanges({ results: many }, { limit: 5 });
  assert.equal(capped.length, 5);
  assert.equal(capped[0].date, "2026-08-20");
  assert.equal(capped[0].action, "reiterate");
});

test("rating changes: an action inferred only from two known tiers", () => {
  const [up, same, unknown] = [
    parseRatingChanges([{ date: "2026-09-01", firm: "A", previous_rating: "Hold", rating: "Strong Buy" }])[0],
    parseRatingChanges([{ date: "2026-09-01", firm: "B", previous_rating: "Buy", rating: "Outperform" }])[0],
    parseRatingChanges([{ date: "2026-09-01", firm: "C", previous_rating: "Speculative", rating: "Buy" }])[0],
  ];
  assert.equal(up.action, "upgrade");
  assert.equal(same.action, "maintain");
  assert.equal(unknown.action, "other");
});

test("rating changes alone still open the panel, with the consensus marked missing", () => {
  const m = ready(
    analystModel({
      ticker: "NVDA",
      price: 180,
      consensus: { ok: true, data: [] },
      changes: BENZINGA_RATINGS,
    }),
  );
  assert.equal(m.consensus, null);
  assert.equal(m.target, null);
  assert.equal(m.changes.length, 3);
  assert.deepEqual(m.missing, ["rating", "target"]);
});

test("rating changes: a target's currency is the row's own, never assumed to be dollars", () => {
  const [stated, silent] = parseRatingChanges([
    { date: "2026-09-02", firm: "A", rating: "Buy", price_target: 210, currency: "usd" },
    { date: "2026-09-01", firm: "B", rating: "Buy", price_target: 210 },
  ]);
  assert.equal(stated.currency, "USD");
  assert.equal(silent.currency, null);
});

test("rating changes: junk yields an empty list, never a throw", () => {
  for (const junk of [null, undefined, 1, "x", {}, { results: "x" }, [null, 1, "a", []]]) {
    assert.deepEqual(parseRatingChanges(junk), []);
  }
});

/* ── the adapter for today's pipeline ─────────────────────────────────── */

test("today's AnalystAvailability maps onto the same four states", () => {
  const ctx = { ticker: "AAPL", price: 250 };
  assert.deepEqual(analystModelFromAvailability({ state: "not-entitled", status: 403 }, ctx), {
    state: "not-entitled",
    status: 403,
  });
  assert.deepEqual(analystModelFromAvailability({ state: "no-coverage" }, ctx), {
    state: "no-coverage",
  });
  assert.deepEqual(analystModelFromAvailability({ state: "unavailable", status: 502 }, ctx), {
    state: "unavailable",
    status: 502,
  });
  assert.deepEqual(analystModelFromAvailability(undefined, ctx), { state: "unavailable", status: 0 });
});

test("an available consensus from the old normalizer renders like a TipRanks record", () => {
  const available: AnalystAvailability = {
    state: "available",
    consensus: {
      label: "StrongBuy",
      ratings: { buy: 32, hold: 1, sell: 0, total: 33, reportedTotal: 33, totalDisputed: false },
      target: { consensus: 564.49, low: 450, high: 700, currency: "USD" },
      upsidePct: 99, // ignored: recomputed from the price handed in
      vendorUpsideUnverified: 13.95,
    },
  };
  const m = ready(analystModelFromAvailability(available, { ticker: "MSFT", price: MSFT_PRICE, asOf: 1 }));
  assert.equal(m.consensus?.label, "Strong Buy");
  assert.equal(m.consensus?.buckets?.length, 3);
  close(m.target?.upsidePct, 13.95, 0.01);
  assert.equal(m.asOf, 1);
});

/* ── dates, fixed zones only ──────────────────────────────────────────── */

test("dates are formatted in fixed zones so server and client agree", () => {
  // A rating date is a calendar date, not an instant: it must not slide a day.
  assert.equal(formatRatingDate("2026-09-18"), "Sep 18, 2026");
  assert.equal(formatRatingDate("nope"), null);
  // Retrieval is an instant, and this terminal's clocks are India time.
  assert.equal(formatRetrieved(Date.UTC(2026, 8, 17, 9, 2)), "Sep 17, 2026, 14:32 IST");
  assert.equal(formatRetrieved(null), null);
  assert.equal(formatRetrieved(Number.NaN), null);
});

/* ── never throws ─────────────────────────────────────────────────────── */

test("nothing in this module throws, whatever it is handed", () => {
  const bodies: unknown[] = [MSFT_OBSERVED, AAPL_CATALOGUE, BENZINGA_CONSENSUS, null, undefined, [], "x", 0, { consensus: 5 }, [[]]];
  const prices: unknown[] = [MSFT_PRICE, 0, -1, null, undefined, Number.NaN, "250"];
  for (const data of bodies) {
    for (const price of prices) {
      assert.doesNotThrow(() =>
        analystModel({
          ticker: "MSFT",
          price: price as number,
          consensus: { ok: true, data },
          changes: data,
        }),
      );
    }
  }
});
