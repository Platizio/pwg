import test from "node:test";
import assert from "node:assert/strict";

import {
  inputsFromStored,
  shippedWithPage,
  unpatchedFetch,
} from "../lib/market/instrument.ts";
import { assembleInstrument, type InstrumentInputs } from "../lib/market/instrument-assemble.ts";
import { toStored } from "../lib/market/store/sections.ts";
import type { StoredInstrument, StoredPeer } from "../lib/market/store/types.ts";
import { presentation } from "../lib/market/universe.ts";
import type { RawEquityQuote, RawHistoryPoint } from "../lib/api/clients/quotes.ts";
import type { RawCorporateActions, RawFundamentals } from "../lib/api/clients/fundamentals.ts";
import type { RawFinancials } from "../lib/api/clients/financials.ts";

/* The fast path, with the database taken out of it.
 *
 * The claim the whole `market` schema rests on is that a page cannot tell
 * which source handed it its documents: one assembler, two callers, no drift.
 * That is only checkable if both callers can be run side by side, which is
 * what this file does — the same company, written through `toStored` the way
 * the refresh worker writes it, read back through `inputsFromStored`, and
 * compared field by field against the documents the gateway would have
 * returned.
 *
 * The other half is the part that must NEVER be clever. The store is mostly
 * empty, it is unconfigured in dev and in CI, and it has no row at all for a
 * symbol nobody has opened. Every one of those has to fall through to the
 * gateway, and none of them may 404 — a store miss turning into "this company
 * does not exist" is the single failure this layer exists to prevent, and the
 * three-way `StoredRead` is what makes it unrepresentable.
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

/* Five years of daily closes, weekends left out, on a smooth walk.
 *
 * Long enough to be the real thing rather than a stub: the technicals need
 * fifty sessions for the simple average, the trailing-year return needs a bar
 * a year back, and the five-year figures need four and a half years of span.
 * A four-point fixture would have passed every assertion below with every
 * indicator null, which is exactly the outcome worth catching.
 *
 * The prices before the split are ten times the prices after it — a
 * ten-for-one the vendor never applied, the Netflix break this codebase keeps
 * coming back to. It rides along because the STORE keeps the bars unrepaired:
 * the repair depends on a corporate-actions document that can change under
 * them, so a stored series with one already applied could never be re-derived.
 * If the columns lost that, the store path would quietly publish a −90% year.
 */
const SPLIT_DAYS_AGO = 100;

function series(base: number, splitAt: number | null): RawHistoryPoint[] {
  const rows: RawHistoryPoint[] = [];
  for (let daysAgo = 1825; daysAgo >= 0; daysAgo -= 1) {
    const weekday = new Date(NOW - daysAgo * DAY).getUTCDay();
    if (weekday === 0 || weekday === 6) continue;
    const walk = base + 25 * Math.sin(daysAgo / 53) + (1825 - daysAgo) * 0.02;
    const scale = splitAt !== null && daysAgo >= splitAt ? 10 : 1;
    const price = Math.round(walk * scale * 100) / 100;
    rows.push({
      date: feedDate(daysAgo),
      price,
      opening: Math.round(price * 0.995 * 100) / 100,
      high: Math.round(price * 1.01 * 100) / 100,
      low: Math.round(price * 0.99 * 100) / 100,
      volume: 3_000_000 + daysAgo * 137,
    });
  }
  return rows;
}

const HISTORY = series(60, SPLIT_DAYS_AGO);
const MARKET_HISTORY = series(430, null);

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
    /* A nil distribution is a row the feed keeps and the panel must not draw. */
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
      execution_date: isoDaysAgo(SPLIT_DAYS_AGO - 1),
      split_from: 1,
      split_to: 10,
      adjustment_type: "forward_split",
      ticker: "NFLX",
    },
  ],
  ipos: null,
  events: null,
};

const LAST_CLOSE = HISTORY[HISTORY.length - 1].price;

const QUOTE: RawEquityQuote = {
  symbol: "NFLX",
  companyName: "NETFLIX INC",
  changePercent: 0.0125,
  change: 1.11,
  lastPrice: LAST_CLOSE,
  closingPrice: LAST_CLOSE,
  yesterdayClose: Math.round(LAST_CLOSE * 0.9875 * 100) / 100,
  openingPrice: Math.round(LAST_CLOSE * 0.99 * 100) / 100,
  dayHigh: Math.round(LAST_CLOSE * 1.01 * 100) / 100,
  dayLow: Math.round(LAST_CLOSE * 0.98 * 100) / 100,
  volume: 5_000_000,
  averageVolume30: 4_200_000,
  marketCap: 383_000,
  priceEarningRatio: 42.5,
  dividendYield: 1.16,
  trailing12MonthsEps: 2.12,
  high52week: 140,
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
    price: LAST_CLOSE,
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

const SHORT_INTEREST = {
  results: [
    {
      ticker: "NFLX",
      settlement_date: "2026-08-15",
      short_interest: 3_100_000,
      avg_daily_volume: 4_200_000,
      days_to_cover: 0.74,
    },
  ],
};

/* The peers, priced by the RPC's join rather than by a second wave of calls.
   `mcap` is already in dollars here, where the quotes feed reports millions —
   toSweepRow multiplies it out before the row is stored. */
const STORED_PEERS: StoredPeer[] = [
  { s: "DIS", name: "Walt Disney Co", px: 112.4, chg: -0.4, mcap: 2.05e11, pe: 21.3, ret1y: 8.2 },
  /* A loss-making peer: the gateway path drops a non-positive P/E rather than
     printing it, and the store path has to make the same refusal. */
  { s: "WBD", name: "Warner Bros Discovery", px: 11.2, chg: 1.1, mcap: 2.7e10, pe: -4.6, ret1y: -14.6 },
];

const STORED_AT_MS = Date.UTC(2026, 7, 21, 19, 30, 0);

function sections(omit: string[] = []): Record<string, unknown> {
  const all: Record<string, unknown> = {
    profile: toStored("profile", FUNDAMENTALS),
    news_gateway: toStored("news_gateway", FUNDAMENTALS),
    corporate_actions: toStored("corporate_actions", ACTIONS),
    financials_annual: toStored("financials_annual", FINANCIALS),
    history_daily: toStored("history_daily", HISTORY, { actions: ACTIONS }),
    short_interest: toStored("short_interest", SHORT_INTEREST),
    analyst: toStored("analyst", { ok: false, status: 403 }),
  };
  for (const key of omit) delete all[key];
  return all;
}

function stored(over: Partial<StoredInstrument> = {}): StoredInstrument {
  return {
    enrolled: true,
    quote: QUOTE,
    row: null,
    sections: sections(),
    meta: { profile: { fetchedAt: STORED_AT_MS, version: 4 } },
    market: { symbol: "SPY", history_daily: toStored("history_daily", MARKET_HISTORY) },
    peers: STORED_PEERS,
    ...over,
  } as StoredInstrument;
}

/* The same company as the gateway hands it over: raw documents, straight off
   the fan-out, with the peers the second wave resolved. */
function gatewayInputs(): InstrumentInputs {
  return {
    ticker: "NFLX",
    quote: QUOTE,
    sector: null,
    fundamentals: FUNDAMENTALS,
    financials: FINANCIALS,
    actions: ACTIONS,
    history: HISTORY,
    /* The gateway's three indicator documents. The store path computes its own
       from the repaired bars, which is the one place the two sources are meant
       to differ — see the technicals test below. */
    indicators: { rsi: null, sma: null, ema: null },
    shortInterest: SHORT_INTEREST,
    intraday: null,
    market: MARKET_HISTORY,
    analyst: { ok: false, error: "forbidden", status: 403, ms: 12 },
    articles: null,
    peers: STORED_PEERS.map((p) => ({
      id: p.s,
      name: presentation(p.s, p.name).name,
      price: p.px,
      chg: p.chg,
      ret1y: p.ret1y,
      marketCap: p.mcap,
      pe: p.pe !== null && p.pe > 0 ? p.pe : null,
    })),
    failures: [],
    storedAt: null,
  };
}

function storeInputs(record: StoredInstrument): InstrumentInputs {
  const read = inputsFromStored(record, "NFLX");
  assert.equal(read.use, "store", "the fixture should be a usable stored record");
  return read.use === "store" ? read.inputs : gatewayInputs();
}

/* ---------- the two sources, side by side ---------- */

test("a stored record and a gateway fan-out assemble the same page", () => {
  const fromStore = assembleInstrument(storeInputs(stored()), NOW);
  const fromGateway = assembleInstrument(gatewayInputs(), NOW);

  assert.equal(fromStore.profile.price, fromGateway.profile.price);
  assert.equal(fromStore.profile.price, LAST_CLOSE);
  assert.equal(fromStore.profile.chg, fromGateway.profile.chg);
  assert.equal(fromStore.profile.name, "Netflix, Inc.");
  assert.deepEqual(fromStore.profile.peers, ["DIS", "WBD"]);

  /* The measurement that a lost split would break, and the reason the stored
     columns keep the bars raw. */
  assert.deepEqual(fromStore.returns, fromGateway.returns);
  assert.ok(fromStore.returns.ret1y !== null, "five years of bars reach back a year");
  assert.ok(fromStore.returns.ret5y !== null, "and reach back five");
  /* Bounded rather than pinned: the walk's own year happens to be slightly
     down, and the figure worth asserting is that it is a MARKET move at all.
     An unapplied ten-for-one reads as −90%, and that is the number a lost
     column or a repair skipped on this path would produce. */
  assert.ok(
    fromStore.returns.ret1y > -50,
    `the repaired year is a market move, not the −90% an unapplied split reads as (got ${fromStore.returns.ret1y})`,
  );

  assert.equal(fromStore.history.daily.length, fromGateway.history.daily.length);
  assert.ok(fromStore.history.daily.length > 1_200, "five years of weekday closes");
  assert.deepEqual(fromStore.history.daily, fromGateway.history.daily);

  assert.deepEqual(fromStore.dividends, fromGateway.dividends);
  assert.deepEqual(fromStore.dividends, [
    { exDate: "2026-08-10", amount: 0.26, payDate: "2026-08-14" },
  ]);

  assert.deepEqual(fromStore.news, fromGateway.news);
  assert.ok(fromStore.news.length > 0, "the gateway news rides its own section, not the profile");

  assert.deepEqual(fromStore.financials.annual, fromGateway.financials.annual);
  assert.deepEqual(fromStore.shortInterest, fromGateway.shortInterest);
  assert.deepEqual(fromStore.notableMoves, fromGateway.notableMoves);
  assert.deepEqual(fromStore.analyst, fromGateway.analyst);
  assert.equal(fromStore.market?.symbol, "SPY");
  assert.equal(fromStore.market?.daily.length, fromGateway.market?.daily.length);

  assert.equal(fromStore.status, "live");
  assert.equal(fromStore.status, fromGateway.status);
  assert.equal(fromStore.note, null);
});

test("the peers arrive priced, with the trailing year the history job derived", () => {
  const fromStore = assembleInstrument(storeInputs(stored()), NOW);

  assert.deepEqual(fromStore.peers, gatewayInputs().peers);
  assert.equal(fromStore.peers.length, 2);

  const [dis, wbd] = fromStore.peers;
  assert.equal(dis.id, "DIS");
  assert.equal(dis.price, 112.4);
  assert.equal(dis.ret1y, 8.2, "the store's own one-year figure, not a second call");
  assert.equal(dis.marketCap, 2.05e11, "dollars, already multiplied out of millions");
  assert.equal(dis.pe, 21.3);
  assert.equal(wbd.ret1y, -14.6);
  assert.equal(wbd.pe, null, "a loss-making peer shows a dash, not a negative multiple");
});

test("the technicals are computed from the stored bars, not fetched", () => {
  const inputs = storeInputs(stored());

  /* Three of the gateway path's calls, replaced by arithmetic. The gateway
     fixture leaves all three null, so this is the one field the two sources
     are expected to disagree about — and the store's answer is the better one,
     because it is measured off the split-repaired series. */
  assert.ok(inputs.indicators.rsi !== null);
  assert.ok(inputs.indicators.sma !== null);
  assert.ok(inputs.indicators.ema !== null);

  const s = assembleInstrument(inputs, NOW);
  const { rsi, sma, ema } = s.technical;

  assert.ok(Number.isFinite(rsi.latest), `rsi should be a number, got ${rsi.latest}`);
  assert.ok(rsi.latest! > 0 && rsi.latest! < 100, `RSI is bounded, got ${rsi.latest}`);
  assert.ok(s.technical.rsiState !== null, "and the headline reads a state off it");
  assert.ok(Number.isFinite(sma.latest), `sma50 should be a number, got ${sma.latest}`);
  assert.ok(Number.isFinite(ema.latest), `ema20 should be a number, got ${ema.latest}`);
  assert.ok(sma.series.length > 0 && ema.series.length > 0, "each carries its own trace");

  /* Measured off the REPAIRED series, so the averages sit in the same
     neighbourhood as the price above them. Fifty sessions of a series still
     carrying an unapplied ten-for-one would sit an order of magnitude high,
     which is the failure this whole repair exists to catch. */
  assert.ok(
    sma.latest! < LAST_CLOSE * 3,
    `a fifty-day average near ten times the price is an unrepaired split (${sma.latest} vs ${LAST_CLOSE})`,
  );
  assert.ok(ema.latest! < LAST_CLOSE * 3);
});

test("a record the store wrote carries the date it was written", () => {
  const s = assembleInstrument(storeInputs(stored()), NOW);
  assert.equal(s.storedAt, new Date(STORED_AT_MS).toISOString());
  /* Epoch milliseconds everywhere on the market_* surface; a number handed
     through to a field declared `string | null` reads as fifty thousand years. */
  assert.equal(typeof s.storedAt, "string");

  assert.equal(assembleInstrument(gatewayInputs(), NOW).storedAt, null);
});

/* ---------- a record that is only half there ---------- */

test("a section the store has not filled is named rather than quietly missing", () => {
  const read = inputsFromStored(stored({ sections: sections(["short_interest"]) }), "NFLX");
  assert.equal(read.use, "store");
  if (read.use !== "store") return;

  assert.ok(
    read.inputs.failures.includes("short interest"),
    `expected the absence to be reported, got ${JSON.stringify(read.inputs.failures)}`,
  );

  const s = assembleInstrument(read.inputs, NOW);
  // The page is still a page: the price, the chart and the filings are all there.
  assert.equal(s.profile.price, LAST_CLOSE);
  assert.ok(s.history.daily.length > 1_200);
  assert.ok(s.financials.annual.length > 0);
  assert.equal(s.shortInterest.shortInterest, null);
});

test("a half-filled record still renders, and the note says what is missing", () => {
  const record = stored({
    sections: sections(["financials_annual", "short_interest", "corporate_actions"]),
  });
  const s = assembleInstrument(storeInputs(record), NOW);

  assert.equal(s.profile.price, LAST_CLOSE, "the page still has its price");
  assert.equal(s.status, "degraded");
  assert.ok(s.note !== null);
  for (const missing of ["filings", "corporate actions", "short interest"]) {
    assert.ok(s.note.includes(missing), `the note should name ${missing}: ${s.note}`);
  }

  assert.deepEqual(s.financials.annual, []);
  assert.equal(s.financials.note, "No filings are available for this company.");
  /* A series that could not be repaired is a series we cannot say anything
     about — the returns and the notable moves are withheld, not guessed. */
  assert.deepEqual(s.returns, { ret1y: null, ret5y: null, cagr5y: null });
  assert.deepEqual(s.notableMoves, []);
  assert.ok(s.history.daily.length > 1_200, "the chart still draws every bar");
});

test("peers the company names but the store cannot price are reported as a gap", () => {
  const read = inputsFromStored(stored({ peers: [] }), "NFLX");
  assert.equal(read.use, "store");
  if (read.use !== "store") return;
  assert.ok(read.inputs.failures.includes("peers"));
});

/* ---------- a miss is never a 404 ---------- */

test("nothing the store fails to answer can send a reader to a 404", () => {
  /* Each of these is the store saying nothing about the company, and each has
     exactly one correct outcome: render the page the slow way. */
  assert.deepEqual(inputsFromStored(null, "NFLX"), { use: "gateway" }, "an unconfigured store");
  assert.deepEqual(inputsFromStored(undefined, "NFLX"), { use: "gateway" }, "a failed read");
  assert.deepEqual(
    inputsFromStored(stored({ enrolled: false }), "NFLX"),
    { use: "gateway" },
    "a symbol nobody has opened yet",
  );
  assert.deepEqual(
    inputsFromStored(stored({ quote: null }), "NFLX"),
    { use: "gateway" },
    "a row the quote sweep has not reached",
  );
  assert.deepEqual(
    inputsFromStored(stored({ sections: sections(["profile"]) }), "NFLX"),
    { use: "gateway" },
    "a record enrolled but not yet filled",
  );
  assert.deepEqual(
    inputsFromStored(stored({ sections: {} }), "NFLX"),
    { use: "gateway" },
    "a record with no sections at all",
  );
  assert.deepEqual(
    inputsFromStored(stored({ sections: sections(["history_daily"]) }), "NFLX"),
    { use: "gateway" },
    "a record filling section by section, whose bars have not landed yet",
  );
});

test("a record with a profile but no bars is worse than the slow page, so it is refused", () => {
  /* The intermediate state every newly enrolled symbol passes through, and the
     state most of the universe is in while the store fills for the first time.
     It clears every identity gate — enrolled, quoted, named — and the page it
     would draw has no chart, no returns, no notable moves and no technicals,
     under a note apologising for a company the gateway would have rendered
     whole. Falling back costs this one reader a slow render; serving it costs
     every reader of that symbol a worse page until the bars arrive. */
  const record = stored({ sections: sections(["history_daily"]) });
  assert.deepEqual(inputsFromStored(record, "NFLX"), { use: "gateway" });

  /* And a stored series that is present but empty is the same nothing. */
  assert.deepEqual(
    inputsFromStored(
      stored({
        sections: { ...sections(), history_daily: toStored("history_daily", []) },
      }),
      "NFLX",
    ),
    { use: "gateway" },
    "a history section written with no bars in it",
  );
});

/* ---------- but a real refusal still refuses ---------- */

test("the store's own quote can still say there is no page here", () => {
  assert.deepEqual(
    inputsFromStored(stored({ quote: { ...QUOTE, notFound: true } }), "NFLX"),
    { use: "absent" },
    "a symbol the gateway does not know",
  );
  assert.deepEqual(
    inputsFromStored(stored({ quote: { ...QUOTE, notPermissioned: true } }), "NFLX"),
    { use: "absent" },
    "a symbol this account may not quote",
  );
  assert.deepEqual(
    inputsFromStored(
      stored({ quote: { ...QUOTE, symbol: "ZZZZZ", companyName: "Nasdaq Test Symbol" } }),
      "ZZZZZ",
    ),
    { use: "absent" },
    "an exchange placeholder rather than a company",
  );

  /* Identity is settled before quality. A placeholder never acquires five
     years of bars, so a refusal that waited on the bars gate would send every
     one of them through the whole fan-out to be refused a second time. */
  assert.deepEqual(
    inputsFromStored(
      stored({ quote: { ...QUOTE, notFound: true }, sections: sections(["history_daily"]) }),
      "NFLX",
    ),
    { use: "absent" },
    "a symbol the gateway does not know, whose record was never filled either",
  );
});

/* ---------- the two pieces of transport both paths end on ---------- */

test("the session series leaves on both paths, and takes its note with it", () => {
  const base = assembleInstrument(gatewayInputs(), NOW);

  /* Built by hand rather than by the assembler, which is handed `intraday:
     null` on both paths and so can never produce a populated day view for this
     to strip. The point of the assertion is that something populated WOULD be
     stripped: without it, the day's bars could travel in the flight payload
     again and the only symptom would be a cold page quietly gone slow. */
  const bars = [{ at: NOW - 60_000, price: 101, open: 100, high: 102, low: 99, volume: 12_000 }];
  const withDay = {
    ...base,
    history: { ...base.history, intraday: bars, intradayNote: "drawn on the server" },
  };

  const out = shippedWithPage(withDay);
  assert.deepEqual(out.history.intraday, [], "the day view does not ride the snapshot");
  assert.ok(
    typeof out.history.intradayNote === "string" && out.history.intradayNote.length > 0,
    "and the chart is told where the bars went instead of being left blank",
  );
  assert.notEqual(out.history.intradayNote, "drawn on the server");

  /* Everything the reader reads is the page the assembler built. The daily
     series is the one deliberate exception: the page carries the year it opens
     with, so this is the TAIL of what the assembler measured against, and the
     figures beside it are unchanged because they were computed from the whole
     of it before the trim. */
  assert.equal(out.profile.price, base.profile.price);
  assert.deepEqual(
    out.history.daily,
    base.history.daily.slice(-out.history.daily.length),
    "the bars shipped are the most recent ones, unaltered",
  );
  assert.deepEqual(out.returns, base.returns);
  assert.equal(out.status, base.status);

  // And the snapshot it was handed is not the one it edited.
  assert.equal(withDay.history.intraday.length, 1, "the input is not mutated");
});

test("the visit stamp never rides the fetch Next patched", () => {
  /* The bug this guards is silent in every environment a developer looks at.
     A `cache: "no-store"` fetch inside a static render reaches
     dynamic-rendering.js:238, which sets the render's revalidate to 0 and
     throws; `rpc` swallows the throw, so the page still renders and the only
     consequence is that /terminal/[ticker] stops being prerendered and stops
     filling its ISR entry — in production only, because the stamp is guarded on
     a store configuration dev and CI do not have. Nothing observable fails. So
     the guarantee is asserted here instead. */
  const real = globalThis.fetch;
  const stub = () => (async () => new Response()) as unknown as typeof fetch;

  try {
    assert.equal(unpatchedFetch(), real, "outside a render the global fetch is the fetch");

    const original = stub();
    const patched = stub() as typeof fetch & {
      __nextPatched?: boolean;
      _nextOriginalFetch?: typeof fetch;
    };
    patched.__nextPatched = true;
    patched._nextOriginalFetch = original;

    globalThis.fetch = patched;
    assert.equal(unpatchedFetch(), original, "inside a render it goes around the patch");
    assert.notEqual(unpatchedFetch(), patched);

    /* A patch with no handle on the original is a shape only a future Next can
       produce, and there is no safe way to write through it. A dropped stamp
       costs one refresh cycle of priority; a dropped prerender costs every
       reader of the symbol up to thirty seconds. */
    const opaque = stub() as typeof fetch & { __nextPatched?: boolean };
    opaque.__nextPatched = true;
    globalThis.fetch = opaque;
    assert.equal(unpatchedFetch(), null, "and declines to write rather than guess");
  } finally {
    globalThis.fetch = real;
  }
});

/* The benchmark is a SEPARATE READ now, and separate reads fail separately.
 *
 * market_instrument used to join SPY's history into every answer, so this field
 * was as present as the company's own quote. 0033 takes it out and readInstrument
 * composes it from a shared `market_sections(['SPY'],'history_daily')` — one
 * entry for the whole site instead of 86KB inside each of ~500 — which means it
 * can now be absent on its own: the store may not have SPY yet, or that one read
 * may have timed out while this company's record arrived perfectly.
 *
 * When it does, the page keeps everything else. One comparison line is not worth
 * sending a reader to a thirty-second gateway fan-out for a company whose record
 * is sitting right here, and the assembler has always drawn this case — it is
 * what a symbol with no stored SPY row looked like before.
 */
test("a missing benchmark costs the comparison and nothing else", () => {
  const withoutBenchmark = inputsFromStored(
    stored({ market: { symbol: "SPY", history_daily: null } }),
    "NFLX",
  );
  assert.equal(withoutBenchmark.use, "store");
  if (withoutBenchmark.use !== "store") return;

  const snapshot = assembleInstrument(withoutBenchmark.inputs, NOW);
  const whole = assembleInstrument(storeInputs(stored()), NOW);

  assert.equal(snapshot.market, null, "the panel is left out, not filled with a guess");
  assert.equal(snapshot.status, whole.status, "and the page does not call itself degraded for it");
  assert.deepEqual(snapshot.history.daily, whole.history.daily);
  assert.deepEqual(snapshot.returns, whole.returns);
  assert.deepEqual(snapshot.peers, whole.peers);
});

/* ---------- what the page is allowed to ship ---------- */

/* THE 234KB, AND THE INSTANCE IT KILLED.
 *
 * A board click used to download the company's five years of bars AND SPY's
 * five years — 2,549 of them, 53% of a 438KB payload — on every stock. On a
 * 512MB box each on-demand render held 40-60MB and did not give it back: a
 * fresh instance measured 81MB, then 200, then 212, and the next render
 * returned 502. After that every never-prerendered stock hung for as long as
 * anyone waited while the prerendered ones kept serving, which is exactly what
 * a reader experiences as clicking a gainer and nothing happening.
 *
 * The page now ships the range it OPENS with and nothing else. 1M and 3M are
 * slices of that same year so they stay instant; 1W, 1D and 5Y fetch their own
 * series, and the benchmark belongs to the one panel that draws it.
 *
 * Both assertions are about bytes rather than behaviour, which is why they are
 * worth pinning: nothing on the page looks wrong when they regress. */
test("the page ships one range of bars and no benchmark", () => {
  const long = stored({
    sections: { ...sections(), history_daily: toStored("history_daily", series(400, null)) },
  });

  const read = inputsFromStored(long, "NFLX");
  assert.equal(read.use, "store");
  if (read.use !== "store") return;

  const snapshot = shippedWithPage(assembleInstrument(read.inputs, NOW));

  assert.equal(
    snapshot.market,
    null,
    "the benchmark is fetched by the panel that draws it, not carried by every page",
  );
  assert.ok(
    snapshot.history.daily.length <= 252,
    `the default range is a year, not five — got ${snapshot.history.daily.length} bars`,
  );
  assert.ok(snapshot.history.daily.length > 0, "and it is a year, not nothing");
});

/* The figures must not move when the bars do. They are computed by the refresh
   worker and stored, so trimming the series the page carries cannot change a
   number the reader sees — if it can, the trim took something the page needed. */
test("trimming the shipped series does not change a single reported return", () => {
  const long = stored({
    sections: { ...sections(), history_daily: toStored("history_daily", series(400, null)) },
  });
  const read = inputsFromStored(long, "NFLX");
  if (read.use !== "store") throw new Error("expected the store path");

  const trimmed = shippedWithPage(assembleInstrument(read.inputs, NOW));
  const whole = assembleInstrument(read.inputs, NOW);
  assert.deepEqual(trimmed.returns, whole.returns);
});

/* The newest bars, not the oldest. A trim that kept the first 252 would draw a
   year-old chart under today's price and nothing would look wrong. */
test("the year it keeps is the most recent one", () => {
  const long = stored({
    sections: { ...sections(), history_daily: toStored("history_daily", series(400, null)) },
  });
  const read = inputsFromStored(long, "NFLX");
  if (read.use !== "store") throw new Error("expected the store path");

  const whole = assembleInstrument(read.inputs, NOW);
  const trimmed = shippedWithPage(whole);
  assert.equal(
    trimmed.history.daily.at(-1)?.at,
    whole.history.daily.at(-1)?.at,
    "the last bar is the same bar",
  );
});
