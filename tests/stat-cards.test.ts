import test from "node:test";
import assert from "node:assert/strict";

import { toCompanyProfile, type CompanyProfile } from "../lib/api/normalize/profile.ts";
import { toTechnicalRead } from "../lib/api/normalize/technicals.ts";
import { toPricePoints } from "../lib/api/normalize/series.ts";
import {
  capAt,
  competitors,
  dayFiguresCurrent,
  dayStats,
  figuresSession,
  liveProfile,
  ratios,
  regularSessionDay,
  settleProfile,
  yearPosition,
} from "../lib/market/instrument-derive.ts";
import { assembleInstrument, peerQuoteFrom } from "../lib/market/instrument-assemble.ts";
import type { RawEquityQuote, RawHistoryPoint } from "../lib/api/clients/quotes.ts";
import type { RawFundamentals } from "../lib/api/clients/fundamentals.ts";
import type { InstrumentSnapshot } from "../lib/market/instrument.ts";

/* The stat cards under the chart and in the fundamentals grid: Day's open,
   high and low, the 52-week range, and the market cap.

   Every fixture below is a figure the quotes feed actually served, measured on
   Thu 24 Sep 2026 at 06:00 ET (10:00Z), pre-market. */

/** An instant given as Eastern wall-clock time (September/October: EDT, UTC−4). */
const et = (isoLocal: string, offset = "-04:00") => Date.parse(`${isoLocal}${offset}`);

/* ── the session a day figure belongs to ─────────────────────────────── */

test("pre-market figures belong to no session: the regular one has not opened", () => {
  assert.equal(figuresSession(et("2026-09-24T06:00:00")), null);
  assert.equal(figuresSession(et("2026-09-24T04:00:00")), null, "the feed rolls over at 04:00");
  assert.equal(figuresSession(et("2026-09-24T09:29:59")), null);
  assert.equal(figuresSession(et("2026-09-24T09:30:00")), "2026-09-24");
});

test("after the bell, the evening and the small hours all report the last session", () => {
  assert.equal(figuresSession(et("2026-09-24T15:59:00")), "2026-09-24");
  assert.equal(figuresSession(et("2026-09-24T21:00:00")), "2026-09-24");
  // 02:00 Friday: the feed has not rolled yet; it still carries Thursday.
  assert.equal(figuresSession(et("2026-09-25T02:00:00")), "2026-09-24");
});

test("weekends and holidays keep the last session's figures", () => {
  assert.equal(figuresSession(et("2026-09-26T12:00:00")), "2026-09-25", "Saturday");
  assert.equal(figuresSession(et("2026-09-28T03:00:00")), "2026-09-25", "Monday before the rollover");
  assert.equal(figuresSession(et("2026-09-07T11:00:00")), "2026-09-04", "Labor Day");
  assert.equal(figuresSession(et("2026-09-08T03:00:00")), "2026-09-04", "the small hours after it");
  assert.equal(figuresSession(et("2026-11-26T11:00:00", "-05:00")), "2026-11-25", "Thanksgiving");
});

test("the card shows the figures only while they are the session the clock expects", () => {
  const now = et("2026-09-24T06:00:00");
  // The measured case: a 05:40 quote, pre-market.
  assert.equal(dayFiguresCurrent(et("2026-09-24T05:40:07"), now), false);
  // A page cached yesterday afternoon, read this morning before the bell.
  assert.equal(dayFiguresCurrent(et("2026-09-23T15:59:00"), now), false);
  // ...and read last night, when yesterday's session was the last one.
  assert.equal(dayFiguresCurrent(et("2026-09-23T15:59:00"), et("2026-09-23T21:00:00")), true);
  assert.equal(dayFiguresCurrent(et("2026-09-23T19:59:00"), et("2026-09-24T02:00:00")), true);
  // The delayed feed, twenty minutes behind at 09:35: its figures are still pre-market.
  assert.equal(dayFiguresCurrent(et("2026-09-24T09:15:00"), et("2026-09-24T09:35:00")), false);
  assert.equal(dayFiguresCurrent(et("2026-09-24T10:00:00"), et("2026-09-24T10:20:00")), true);
  // Yesterday's session, read after today's has opened, is not today's.
  assert.equal(dayFiguresCurrent(et("2026-09-23T15:59:00"), et("2026-09-24T10:20:00")), false);
  // Friday's, on Sunday.
  assert.equal(dayFiguresCurrent(et("2026-09-25T19:59:00"), et("2026-09-27T12:00:00")), true);
  // A quote with no stamp cannot be placed; before the bell nothing is shown.
  assert.equal(dayFiguresCurrent(null, now), false);
  assert.equal(dayFiguresCurrent(null, et("2026-09-24T11:00:00")), true);
});

test("a regular-session print is dated; pre-market, post-market and a half-day's afternoon are not", () => {
  assert.equal(regularSessionDay(et("2026-09-24T10:00:00")), "2026-09-24");
  assert.equal(regularSessionDay(et("2026-09-24T16:00:00")), "2026-09-24", "the closing print");
  assert.equal(regularSessionDay(et("2026-09-24T16:00:01")), null);
  assert.equal(regularSessionDay(et("2026-09-24T09:29:00")), null);
  assert.equal(regularSessionDay(et("2026-09-26T11:00:00")), null, "Saturday");
  assert.equal(regularSessionDay(et("2026-11-27T12:59:00", "-05:00")), "2026-11-27");
  assert.equal(regularSessionDay(et("2026-11-27T14:00:00", "-05:00")), null, "the half-day closed at 13:00");
});

/* ── the measured pre-market quote ───────────────────────────────────── */

const AAPL_QUOTE: RawEquityQuote = {
  symbol: "AAPL",
  companyName: "APPLE INC",
  changePercent: -0.0040057,
  change: -1.35,
  lastPrice: 335.67,
  closingPrice: 0,
  yesterdayClose: 337.02,
  openingPrice: 335.26,
  // Padded to yesterday's close: 11 of 22 liquid names read exactly this.
  dayHigh: 337.02,
  dayLow: 334.87,
  volume: 99_213,
  averageVolume30: 50_000_000,
  marketCap: 4_918_530,
  priceEarningRatio: 38.15,
  dividendYield: 0.31,
  trailing12MonthsEps: 8.83,
  high52week: 345.34,
  low52week: 243.42,
  beta: 1.1,
  exchange: "NSDQ",
  currency: "USD",
  isin: null,
  cusip: null,
  delayed: true,
  source: "Delay",
  updateTime: "2026-09-24T05:40:07.054-0400",
  notFound: false,
  notPermissioned: false,
};

function fundamentals(ticker: Record<string, unknown>, ratios: Record<string, unknown> | null = null): RawFundamentals {
  return {
    status: "OK",
    ticker: { ticker: "AAPL", name: "Apple Inc.", ...ticker },
    ticker_news: null,
    ratios,
    related_companies: null,
  } as unknown as RawFundamentals;
}

const AAPL_RECORD = fundamentals(
  { market_cap: 4_918_530_543_600, weighted_shares_outstanding: 14_594_180_000, share_class_shares_outstanding: 14_594_180_000 },
  { price: 337.02, date: "2026-09-23", market_cap: 4_918_530_543_600 },
);

function bar(day: string, close: number, high = close, low = close): RawHistoryPoint {
  const [y, m, d] = day.split("-");
  return { date: `${m}/${d}/${y} 00:00:00 EDT`, price: close, opening: close, high, low, volume: 1 };
}

const NOW = et("2026-09-24T06:00:00");

test("the market cap is struck at a price the record states, and that price is kept", () => {
  /* Measured 24 Sep 2026 across 22 names: ticker.market_cap divided by
     weighted_shares_outstanding is the previous close to the cent, 22 of 22;
     the quote's millions divided by yesterdayClose is a whole share count. */
  const p = toCompanyProfile({ ticker: "AAPL", quote: AAPL_QUOTE, fundamentals: AAPL_RECORD });
  assert.equal(p.marketCap, 4_918_530_543_600);
  assert.ok(Math.abs(p.capBasis! - 337.02) < 1e-9);

  // Without the share count, the ratio snapshot's own price.
  const byRatio = toCompanyProfile({
    ticker: "AAPL",
    quote: AAPL_QUOTE,
    fundamentals: fundamentals({ market_cap: 4.9e12 }, { price: 336.5 }),
  });
  assert.equal(byRatio.capBasis, 336.5);

  // From the quote alone, the quote's own previous close.
  const byQuote = toCompanyProfile({ ticker: "AAPL", quote: AAPL_QUOTE });
  assert.equal(byQuote.marketCap, 4_918_530_000_000);
  assert.equal(byQuote.capBasis, 337.02);

  // A record that states no basis is not scaled by a guess.
  const unknown = toCompanyProfile({ ticker: "AAPL", fundamentals: fundamentals({ market_cap: 4.9e12 }) });
  assert.equal(unknown.capBasis, null);
});

test("pre-market, the server shows dashes for the day and a cap at the live price", () => {
  const raw = toCompanyProfile({ ticker: "AAPL", quote: AAPL_QUOTE, fundamentals: AAPL_RECORD });
  const daily = toPricePoints([bar("2026-09-22", 339.75, 345.34, 336), bar("2026-09-23", 337.02, 341.8, 335.5)]);
  const p = settleProfile(raw, daily, NOW);

  assert.equal(p.open, null, "335.26 is the first pre-market trade, not an open");
  assert.equal(p.dayHigh, null, "337.02 is yesterday's close, padded in");
  assert.equal(p.dayLow, null);
  assert.equal(p.previousClose, 337.02, "Wednesday's official close");
  assert.equal(p.volume, 99_213, "pre-market volume is real volume");

  // 14,594.18M shares at 335.67, not at Wednesday's 337.02.
  assert.ok(Math.abs(p.marketCap! - 14_594_180_000 * 335.67) < 1);
  assert.equal(p.capBasis, 335.67);

  const cards = new Map(dayStats({ profile: p } as InstrumentSnapshot).map((c) => [c.label, c.value]));
  assert.equal(cards.get("Day's open"), "—");
  assert.equal(cards.get("Day's high"), "—");
  assert.equal(cards.get("Day's low"), "—");
  assert.equal(cards.get("Previous close"), "$337.02");
});

test("during the session the day's figures stand, and the 52-week range takes in today", () => {
  const raw = toCompanyProfile({
    ticker: "AAPL",
    quote: {
      ...AAPL_QUOTE,
      lastPrice: 347.1,
      openingPrice: 338,
      dayHigh: 348.25,
      dayLow: 336.9,
      updateTime: "2026-09-24T10:40:00.000-0400",
    },
    fundamentals: AAPL_RECORD,
  });
  const p = settleProfile(raw, toPricePoints([bar("2026-09-23", 337.02, 341.8, 335.5)]), et("2026-09-24T11:00:00"));
  assert.equal(p.open, 338);
  assert.equal(p.dayHigh, 348.25);
  assert.equal(p.dayLow, 336.9);
  assert.equal(p.high52, 348.25, "a new high today is the 52-week high");
  assert.equal(p.low52, 243.42);
});

test("the 52-week range includes the session the feed has not folded in yet", () => {
  /* Measured 24 Sep 2026: the feed's high52week/low52week are the extreme
     intraday high and low from 24 Sep 2025 through 22 Sep 2026 — 22 of 22
     names — so the session that closed on the 23rd is missing. META printed
     763.90 that day against a feed high of 761.11; AMD 624.69 against 624.52. */
  const meta = toCompanyProfile({
    ticker: "META",
    quote: { ...AAPL_QUOTE, symbol: "META", high52week: 761.11, low52week: 520.26, updateTime: "2026-09-24T05:40:07.370-0400" },
  });
  const daily = toPricePoints([
    bar("2025-09-23", 700, 790, 690), // a day outside the year: never counts
    bar("2025-09-24", 755, 761.11, 740),
    bar("2026-09-22", 736.6, 745, 730),
    bar("2026-09-23", 744.1, 763.9, 739.51),
  ]);
  const p = settleProfile(meta, daily, NOW);
  assert.equal(p.high52, 763.9);
  assert.equal(p.low52, 520.26);
});

test("a bar whose wick does not fit its close is read at its close", () => {
  /* A gateway-only bar is checked against nothing, and one bad wick would
     stand as the 52-week high for a year. Here: a close of 120 with a 250 high
     and a 236 low — neither is a price that session could have traded at. */
  const p = settleProfile(
    toCompanyProfile({ ticker: "XLK", quote: { ...AAPL_QUOTE, symbol: "XLK", high52week: 150, low52week: 100 } }),
    toPricePoints([bar("2026-03-02", 120, 250, 236), bar("2026-03-03", 121, 122, 119)]),
    NOW,
  );
  assert.equal(p.high52, 150);
  assert.equal(p.low52, 100);
});

test("the settled profile is the figure the snapshot carries", () => {
  const s = assembleInstrument(
    {
      ticker: "AAPL",
      quote: AAPL_QUOTE,
      sector: null,
      fundamentals: AAPL_RECORD,
      financials: null,
      actions: { status: "OK", dividends: [], splits: [] } as never,
      history: [bar("2026-09-22", 339.75, 345.34, 336), bar("2026-09-23", 337.02, 341.8, 335.5)],
      indicators: { rsi: null, sma: null, ema: null },
      shortInterest: null,
      intraday: null,
      market: null,
      analyst: undefined,
      articles: null,
      peers: [],
      failures: [],
      storedAt: null,
    },
    NOW,
  );
  assert.equal(s.profile.dayHigh, null);
  assert.ok(Math.abs(s.profile.marketCap! - 14_594_180_000 * 335.67) < 1);
  // The range position is struck against the settled range.
  assert.equal(s.technical.rangePosition, yearPosition(335.67, 243.42, 345.34));
});

/* ── the reader's clock, and the live price ──────────────────────────── */

function sessionProfile(): CompanyProfile {
  return settleProfile(
    toCompanyProfile({
      ticker: "AAPL",
      quote: { ...AAPL_QUOTE, lastPrice: 340, openingPrice: 338, dayHigh: 341, dayLow: 336.9, updateTime: "2026-09-23T15:59:00.000-0400" },
      fundamentals: AAPL_RECORD,
    }),
    [],
    et("2026-09-23T16:00:00"),
  );
}

test("a page cached during yesterday's session, read before today's bell, shows dashes", () => {
  const cached = sessionProfile();
  assert.equal(cached.dayHigh, 341, "the server was right when it rendered");
  const read = liveProfile(cached, { price: 335.67, chg: -0.4, previousClose: 337.02, range: null, nowMs: NOW });
  assert.equal(read.open, null);
  assert.equal(read.dayHigh, null);
  assert.equal(read.dayLow, null);
  assert.equal(read.previousClose, 337.02, "the basis the header's change is struck from");
});

test("before hydration the live profile is the server's own object", () => {
  const p = sessionProfile();
  assert.equal(liveProfile(p, { price: p.price, chg: p.chg, previousClose: p.previousClose, range: null, nowMs: null }), p);
});

test("the market cap follows the price the header shows", () => {
  const p = sessionProfile();
  const read = liveProfile(p, { price: 350, chg: 3, previousClose: 339.75, range: null, nowMs: null });
  assert.ok(Math.abs(read.marketCap! - 14_594_180_000 * 350) < 1);
  assert.equal(read.price, 350);
  assert.equal(capAt(1000, 100, 110), 1100);
  assert.equal(capAt(1000, null, 110), 1000, "no basis, no guess");
  assert.equal(capAt(null, 100, 110), null);
  // At its own price the cap is returned untouched, not re-derived.
  assert.equal(capAt(4_898_828_000_000.3, 335.67, 335.67), 4_898_828_000_000.3);
});

test("regular-session ticks raise the day's high and the year's; after-hours prints do not", () => {
  const p = sessionProfile();
  const at = et("2026-09-23T15:30:00");
  const read = liveProfile(p, {
    price: 346,
    chg: 1.8,
    previousClose: 339.75,
    range: { day: "2026-09-23", high: 346, low: 336.5 },
    nowMs: at,
  });
  assert.equal(read.dayHigh, 346);
  assert.equal(read.dayLow, 336.5);
  assert.equal(read.high52, 346, "above the 345.34 the year had seen");

  // A range from another session never touches today's figures.
  const other = liveProfile(p, {
    price: 340,
    chg: 0,
    previousClose: 339.75,
    range: { day: "2026-09-22", high: 399, low: 300 },
    nowMs: at,
  });
  assert.equal(other.dayHigh, 341);
});

test("the live range position uses the same clamp as the server's", () => {
  for (const [price, low, high] of [
    [120, 100, 200],
    [250, 100, 200],
    [90, 100, 200],
    [150, 200, 200],
    [150, null, 200],
  ] as Array<[number, number | null, number | null]>) {
    const server = toTechnicalRead({ rsi: null, sma: null, ema: null, price, low52: low, high52: high }).rangePosition;
    assert.equal(yearPosition(price, low, high), server);
  }
});

test("the valuation grid and the peers table print the live cap", () => {
  const p = liveProfile(sessionProfile(), { price: 350, chg: 3, previousClose: 339.75, range: null, nowMs: null });
  const s = { profile: p, financials: { annual: [] }, returns: { ret1y: null }, peers: [] } as unknown as InstrumentSnapshot;
  assert.equal(ratios(s).find((r) => r.label === "Market cap")!.value, "$5.11T");
  assert.equal(competitors(s)[0].mcap, "$5.11T");
});

test("a peer's cap is scaled from its previous close to its last price", () => {
  const peer = peerQuoteFrom({ ...AAPL_QUOTE, symbol: "MSFT", lastPrice: 498.228, yesterdayClose: 500.59, marketCap: 3_717_150, changePercent: -0.00471803 });
  assert.ok(Math.abs(peer.marketCap! - 3_717_150e6 * (498.228 / 500.59)) < 1);
  assert.ok(Math.abs(peer.chg! - -0.471803) < 1e-9);
});
