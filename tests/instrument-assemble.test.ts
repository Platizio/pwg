import test from "node:test";
import assert from "node:assert/strict";

import {
  assembleInstrument,
  profileFrom,
  type InstrumentInputs,
} from "../lib/market/instrument-assemble.ts";
import type { RawEquityQuote, RawHistoryPoint } from "../lib/api/clients/quotes.ts";
import type { RawCorporateActions, RawFundamentals } from "../lib/api/clients/fundamentals.ts";
import type { RawFinancials } from "../lib/api/clients/financials.ts";

/* Assembling one instrument, with the network taken out of it.
 *
 * Everything here used to live inside getInstrumentSnapshot, below thirteen
 * awaited calls and a react cache() wrapper, which meant the only way to
 * exercise it was to render the page against the live gateway. The assembly is
 * the part with the judgement in it — which failures degrade which panel, when
 * a figure is withheld rather than printed, what the reader is told about it —
 * and it is now reachable by `node --test`.
 *
 * It is about to acquire a second caller. The store hands back the same raw
 * documents from Postgres that the gateway hands back over HTTP, and the whole
 * argument for that design is that the page cannot tell the difference. These
 * tests are where that claim is checked.
 */

const DAY = 86_400_000;
/** 21 August 2026, 16:00 in New York: the close. */
const NOW = Date.UTC(2026, 7, 21, 20, 0, 0);

function feedDate(daysAgo: number): string {
  const d = new Date(NOW - daysAgo * DAY);
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${mm}/${dd}/${d.getUTCFullYear()} 16:00:00 EDT`;
}

const isoDaysAgo = (daysAgo: number) => new Date(NOW - daysAgo * DAY).toISOString().slice(0, 10);

/* Netflix as the feed actually served it: a ten-for-one split a hundred
   sessions back that the vendor never applied to the earlier bars. Measured
   raw this is a −87% year; repaired it is a gain of about 29%. */
const HISTORY: RawHistoryPoint[] = [
  { date: feedDate(366), price: 700, opening: 695, high: 705, low: 690, volume: 4_000_000 },
  { date: feedDate(101), price: 800, opening: 795, high: 805, low: 790, volume: 3_000_000 },
  { date: feedDate(100), price: 80, opening: 79, high: 81, low: 78, volume: 30_000_000 },
  { date: feedDate(0), price: 90, opening: 88, high: 91, low: 87, volume: 5_000_000 },
];

const ACTIONS: RawCorporateActions = {
  status: "OK",
  dividends: [
    {
      cash_amount: 0.26,
      currency: "USD",
      ex_dividend_date: "2026-08-10",
      pay_date: "2026-08-14",
      record_date: "2026-08-10",
      declaration_date: "2026-07-30",
      frequency: 4,
      distribution_type: "recurring",
      ticker: "NFLX",
    },
    /* A nil distribution is a row the feed keeps and the panel must not draw:
       "$0.00 per share" beside a real ex-date reads as a cancelled dividend. */
    {
      cash_amount: 0,
      currency: "USD",
      ex_dividend_date: "2026-05-11",
      pay_date: null,
      record_date: null,
      declaration_date: null,
      frequency: null,
      distribution_type: null,
      ticker: "NFLX",
    },
  ],
  splits: [
    {
      execution_date: isoDaysAgo(100),
      split_from: 1,
      split_to: 10,
      adjustment_type: "forward_split",
      ticker: "NFLX",
    },
  ],
  ipos: null,
  events: null,
};

const QUOTE: RawEquityQuote = {
  symbol: "NFLX",
  companyName: "NETFLIX INC",
  changePercent: 0.0125,
  change: 1.11,
  lastPrice: 90,
  closingPrice: 90,
  yesterdayClose: 88.89,
  openingPrice: 88,
  dayHigh: 91,
  dayLow: 87,
  volume: 5_000_000,
  averageVolume30: 4_200_000,
  marketCap: 383_000,
  priceEarningRatio: 42.5,
  dividendYield: 1.16,
  trailing12MonthsEps: 2.12,
  high52week: 105,
  low52week: 61,
  beta: 1.31,
  exchange: "NASDAQ",
  currency: "USD",
  isin: "US64110L1061",
  cusip: "64110L106",
  delayed: false,
  source: "Live",
  // A minute before `now`, so nothing here is stale.
  updateTime: "2026-08-21T15:59:00.000-0400",
  notFound: false,
  notPermissioned: false,
};

const FUNDAMENTALS: RawFundamentals = {
  status: "OK",
  ticker: {
    ticker: "NFLX",
    name: "Netflix, Inc.",
    description: "A streaming entertainment service.",
    homepage_url: "https://www.netflix.com",
    market_cap: 383_000_000_000,
    sic_code: "7841",
    sic_description: "Services-Video Tape Rental",
    primary_exchange: "XNAS",
    total_employees: 14_000,
    list_date: "2002-05-23",
    branding: { logo_url: null, icon_url: null },
    share_class_shares_outstanding: 4_255_000_000,
  },
  ticker_news: [
    {
      id: "n1",
      title: "Netflix raises its subscriber guidance",
      description: "The company lifted its outlook for the year.",
      article_url: "https://example.com/nflx-guidance",
      image_url: null,
      author: "A Reporter",
      published_utc: "2026-08-21T12:00:00Z",
      keywords: ["streaming"],
      tickers: ["NFLX"],
      publisher: {
        name: "Example Wire",
        homepage_url: "https://example.com",
        logo_url: null,
        favicon_url: null,
      },
      insights: [{ ticker: "NFLX", sentiment: "positive", sentiment_reasoning: "guidance" }],
    },
  ],
  ratios: {
    price: 90,
    market_cap: 383_000_000_000,
    price_to_earnings: 42.5,
    price_to_book: 11.2,
    price_to_sales: 9.4,
    dividend_yield: 0.0116,
    earnings_per_share: 2.12,
    return_on_equity: 0.31,
    return_on_assets: 0.12,
    debt_to_equity: 0.72,
    free_cash_flow: 6_900_000_000,
    enterprise_value: 391_000_000_000,
    ev_to_ebitda: 31.4,
    average_volume: 4_200_000,
    date: "2026-08-21",
  },
  related_companies: [{ ticker: "DIS" }, { ticker: "WBD" }],
};

/* One filed year. The statement rows carry thirty-odd line items apiece and
   the normaliser reads a handful of them; this is the document as JSON, which
   is what the type is actually describing. */
const FINANCIALS = {
  status: "OK",
  income_statements: [
    {
      tickers: ["NFLX"],
      cik: "0001065280",
      period_end: "2025-12-31",
      filing_date: "2026-01-27",
      fiscal_quarter: 4,
      fiscal_year: 2025,
      timeframe: "annual",
      revenue: 39_000_000_000,
      gross_profit: 18_200_000_000,
      operating_income: 10_400_000_000,
      consolidated_net_income_loss: 8_700_000_000,
      net_income_loss_attributable_common_shareholders: 8_700_000_000,
      diluted_earnings_per_share: 2.03,
    },
  ],
  balance_sheets: [
    {
      tickers: ["NFLX"],
      cik: "0001065280",
      period_end: "2025-12-31",
      filing_date: "2026-01-27",
      fiscal_quarter: 4,
      fiscal_year: 2025,
      timeframe: "annual",
      total_assets: 53_600_000_000,
      total_liabilities: 28_700_000_000,
    },
  ],
  cash_flow_statements: [
    {
      tickers: ["NFLX"],
      cik: "0001065280",
      period_end: "2025-12-31",
      filing_date: "2026-01-27",
      fiscal_quarter: 4,
      fiscal_year: 2025,
      timeframe: "annual",
      net_cash_from_operating_activities: 8_100_000_000,
      capital_expenditure: 500_000_000,
    },
  ],
} as unknown as RawFinancials;

const PEERS = [
  { id: "DIS", name: "Disney", price: 112.4, chg: -0.4, ret1y: 8.2, marketCap: 2.05e11, pe: 21.3 },
  { id: "WBD", name: "Warner Bros", price: 11.2, chg: 1.1, ret1y: -14.6, marketCap: 2.7e10, pe: null },
];

const STORED_AT = "2026-08-21T19:30:00.000Z";

function inputs(over: Partial<InstrumentInputs> = {}): InstrumentInputs {
  return {
    ticker: "NFLX",
    quote: QUOTE,
    sector: "Communication Services",
    fundamentals: FUNDAMENTALS,
    financials: FINANCIALS,
    actions: ACTIONS,
    history: HISTORY,
    indicators: { rsi: null, sma: null, ema: null },
    shortInterest: {
      results: [
        {
          ticker: "NFLX",
          settlement_date: "2026-08-15",
          short_interest: 3_100_000,
          avg_daily_volume: 4_200_000,
          days_to_cover: 0.74,
        },
      ],
    },
    intraday: null,
    market: null,
    analyst: { ok: false, error: "forbidden", status: 403, ms: 12 },
    articles: null,
    peers: PEERS,
    failures: [],
    storedAt: STORED_AT,
    ...over,
  };
}

/* ---------- the ordinary page ---------- */

test("the headline price is the quote's last trade", () => {
  const s = assembleInstrument(inputs(), NOW);
  assert.equal(s.profile.price, 90);
  assert.equal(s.profile.sector, "Communication Services");
  assert.equal(s.profile.name, "Netflix, Inc.");
});

test("profileFrom gives the caller the same profile the assembly uses", () => {
  const i = inputs();
  assert.deepEqual(profileFrom(i), assembleInstrument(i, NOW).profile);
  // The peers wave needs this before it can resolve anything.
  assert.deepEqual(profileFrom(i).peers, ["DIS", "WBD"]);
});

/* The regression the split record exists for: measured raw this series reads
   as a collapse, and it was published as one. */
test("returns are measured across the repaired series", () => {
  const s = assembleInstrument(inputs(), NOW);
  assert.ok(s.returns.ret1y !== null);
  assert.ok(
    Math.abs(s.returns.ret1y - 28.57) < 1,
    `expected about +28.6% from the repaired series, got ${s.returns.ret1y}`,
  );
});

test("the chart keeps every bar the feed sent", () => {
  const s = assembleInstrument(inputs(), NOW);
  assert.equal(s.history.daily.length, HISTORY.length);
  assert.equal(s.history.intraday.length, 0);
  assert.ok(s.history.intradayNote !== null, "an empty day view says why it is empty");
});

test("only real distributions reach the dividend list", () => {
  const s = assembleInstrument(inputs(), NOW);
  assert.deepEqual(s.dividends, [
    { exDate: "2026-08-10", amount: 0.26, payDate: "2026-08-14" },
  ]);
});

test("the peers the caller resolved are carried through untouched", () => {
  const s = assembleInstrument(inputs(), NOW);
  assert.deepEqual(s.peers, PEERS);
});

test("a live quote a minute old is a live page", () => {
  const s = assembleInstrument(inputs(), NOW);
  assert.equal(s.status, "live");
  assert.equal(s.note, null);
  assert.equal(s.financials.note, null);
  assert.ok(s.financials.annual.length > 0);
  assert.equal(s.shortInterest.daysToCover, 0.74);
  assert.equal(s.analyst.state, "not-entitled");
  assert.deepEqual(s.unavailable, {
    analystTargets: true,
    institutionalHolders: true,
    marketShare: true,
  });
});

/* Where the snapshot came from, so a reader can be told. Null on the gateway
   path, which has no stored row behind it. */
test("storedAt is echoed exactly as it was handed in", () => {
  assert.equal(assembleInstrument(inputs(), NOW).storedAt, STORED_AT);
  assert.equal(assembleInstrument(inputs({ storedAt: null }), NOW).storedAt, null);
});

/* ---------- withheld rather than guessed ---------- */

/* An unapplied ten-for-one split is a −90% session and would top this list
   every time: the one figure on the page most likely to be a split break is
   exactly the one this picks out. */
test("the largest sessions are withheld when the split record could not be read", () => {
  const readable = assembleInstrument(inputs(), NOW);
  assert.equal(readable.notableMoves.length, 3);

  const unreadable = assembleInstrument(inputs({ actions: null }), NOW);
  assert.deepEqual(unreadable.notableMoves, []);
  assert.deepEqual(unreadable.returns, { ret1y: null, ret5y: null, cagr5y: null });
  assert.equal(unreadable.history.daily.length, HISTORY.length, "the chart is still drawn");
  assert.deepEqual(unreadable.dividends, [], "no record, no dividend rows");
});

/* ---------- degrading ---------- */

test("three missing sources make a degraded page that says which", () => {
  const s = assembleInstrument(
    inputs({ fundamentals: null, financials: null, actions: null, history: null }),
    NOW,
  );
  assert.equal(s.status, "degraded");
  assert.equal(
    s.note,
    "Some of this company's record is unavailable: company record, filings, corporate actions, price history.",
  );
  assert.equal(s.financials.note, "No filings are available for this company.");
});

/* The peers wave runs in the caller, because it needs profile.peers before it
   can ask for anything. Its failure has to land in the same sentence as the
   rest, in the order it always did. */
test("a failure the caller observed is named last, not first", () => {
  const s = assembleInstrument(
    inputs({ fundamentals: null, financials: null, history: null, failures: ["peers"] }),
    NOW,
  );
  assert.equal(
    s.note,
    "Some of this company's record is unavailable: company record, filings, price history, peers.",
  );
});

test("a delayed quote is stale rather than degraded", () => {
  const s = assembleInstrument(inputs({ quote: { ...QUOTE, delayed: true } }), NOW);
  assert.equal(s.status, "stale");
  assert.ok(s.note !== null && s.note.startsWith("Quotes run fifteen minutes behind"));
});

test("a quote from an hour ago is stale even when the feed calls itself live", () => {
  const s = assembleInstrument(
    inputs({ quote: { ...QUOTE, updateTime: "2026-08-21T14:59:00.000-0400" } }),
    NOW,
  );
  assert.equal(s.status, "stale");
});

/* ---------- the session ---------- */

test("the session is read from the same instant the rest of the page is", () => {
  const s = assembleInstrument(inputs(), NOW);
  // 16:00 in New York on a Friday: the bell has just gone.
  assert.equal(s.session.phase, "post-market");
});
