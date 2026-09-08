import { test } from "node:test";
import assert from "node:assert/strict";
import { toCompanyProfile, type CompanyProfile } from "../lib/api/normalize/profile.ts";
import type { RawEquityQuote } from "@/lib/api/clients/quotes";
import type { RawFundamentals } from "@/lib/api/clients/fundamentals";

/* The company profile, and the four unit conversions it exists to own.

   Two endpoints describe the same company in different units. The quotes feed
   reports a day move as a fraction and a market cap in millions; the
   fundamentals record reports a dividend yield as a fraction and a market cap
   in dollars. Every one of those is silent when it goes wrong — the header
   still renders, the figure is merely off by a hundred or a million — so the
   conversions are tested from both directions and then tested against each
   other, because two paths to one number are only trustworthy if they agree.

   The rest guards the absence rule. A missing figure is null, never nought: a
   company with no earnings has no price/earnings ratio, and a nought in that
   column reads as a share priced at nothing. */

const close = (actual: number | null, expected: number, tol = 1e-9): void => {
  assert.ok(actual !== null, `expected about ${expected}, got nothing`);
  assert.ok(Math.abs(actual - expected) <= tol, `expected about ${expected}, got ${actual}`);
};

type Company = NonNullable<RawFundamentals["ticker"]>;
type Ratios = NonNullable<RawFundamentals["ratios"]>;

function quote(over: Partial<RawEquityQuote> = {}): RawEquityQuote {
  return {
    symbol: "AAPL",
    companyName: "APPLE INC",
    changePercent: null,
    change: null,
    lastPrice: null,
    closingPrice: null,
    yesterdayClose: null,
    openingPrice: null,
    dayHigh: null,
    dayLow: null,
    volume: null,
    averageVolume30: null,
    marketCap: null,
    priceEarningRatio: null,
    dividendYield: null,
    trailing12MonthsEps: null,
    high52week: null,
    low52week: null,
    beta: null,
    exchange: "NSDQ",
    currency: "USD",
    isin: null,
    cusip: null,
    delayed: true,
    source: "gateway",
    updateTime: null,
    notFound: false,
    notPermissioned: false,
    ...over,
  };
}

function company(over: Partial<Company> = {}): Company {
  return {
    ticker: "AAPL",
    name: null,
    description: null,
    homepage_url: null,
    market_cap: null,
    sic_code: null,
    sic_description: null,
    primary_exchange: null,
    total_employees: null,
    list_date: null,
    branding: null,
    share_class_shares_outstanding: null,
    ...over,
  };
}

function ratios(over: Partial<Ratios> = {}): Ratios {
  return {
    price: null,
    market_cap: null,
    price_to_earnings: null,
    price_to_book: null,
    price_to_sales: null,
    dividend_yield: null,
    earnings_per_share: null,
    return_on_equity: null,
    return_on_assets: null,
    debt_to_equity: null,
    free_cash_flow: null,
    enterprise_value: null,
    ev_to_ebitda: null,
    average_volume: null,
    date: null,
    ...over,
  };
}

function record(
  over: {
    ticker?: Partial<Company>;
    ratios?: Partial<Ratios>;
    related?: Array<{ ticker: string }> | null;
  } = {},
): RawFundamentals {
  return {
    status: "OK",
    ticker: company(over.ticker),
    ticker_news: null,
    ratios: ratios(over.ratios),
    related_companies: over.related ?? null,
  };
}

/* ------------------------------------------------------------------ */
/* The unit traps                                                      */
/* ------------------------------------------------------------------ */

test("the day move arrives as a fraction and leaves as a percent", () => {
  const p = toCompanyProfile({ ticker: "AAPL", quote: quote({ changePercent: -0.01492914 }) });
  close(p.chg, -1.492914);
});

test("the day move falls back to the absolute change over the previous close", () => {
  const p = toCompanyProfile({
    ticker: "AAPL",
    quote: quote({ changePercent: null, change: -4.72, yesterdayClose: 316.28 }),
  });
  close(p.chg, (-4.72 / 316.28) * 100);
});

test("the day move is null, not nought, when the feed reports neither", () => {
  const p = toCompanyProfile({ ticker: "AAPL", quote: quote({ changePercent: null, change: null }) });
  assert.equal(p.chg, null);
});

test("a flat session is a real reading and survives as nought", () => {
  const p = toCompanyProfile({ ticker: "AAPL", quote: quote({ changePercent: 0 }) });
  assert.equal(p.chg, 0);
});

test("market cap prefers the fundamentals figure, which is already in dollars", () => {
  const p = toCompanyProfile({
    ticker: "AAPL",
    quote: quote({ marketCap: 1 }),
    fundamentals: record({ ticker: { market_cap: 4_623_870_000_000 } }),
  });
  assert.equal(p.marketCap, 4_623_870_000_000);
});

test("market cap falls back to the quote's millions, converted", () => {
  const p = toCompanyProfile({ ticker: "AAPL", quote: quote({ marketCap: 4_623_870 }) });
  assert.equal(p.marketCap, 4_623_870_000_000);
});

test("both market-cap paths describe the same company at the same magnitude", () => {
  const fromRecord = toCompanyProfile({
    ticker: "AAPL",
    fundamentals: record({ ticker: { market_cap: 4_623_870_000_000 } }),
  });
  const fromQuote = toCompanyProfile({ ticker: "AAPL", quote: quote({ marketCap: 4_623_870 }) });
  assert.equal(fromRecord.marketCap, fromQuote.marketCap);
});

test("dividend yield prefers the quote's percent and leaves it alone", () => {
  const p = toCompanyProfile({
    ticker: "AAPL",
    quote: quote({ dividendYield: 0.34 }),
    fundamentals: record({ ratios: { dividend_yield: 0.0034 } }),
  });
  close(p.dividendYield, 0.34);
});

test("dividend yield falls back to the ratio's fraction, converted", () => {
  const p = toCompanyProfile({
    ticker: "AAPL",
    fundamentals: record({ ratios: { dividend_yield: 0.0034 } }),
  });
  close(p.dividendYield, 0.34);
});

test("both dividend-yield paths agree", () => {
  const fromQuote = toCompanyProfile({ ticker: "AAPL", quote: quote({ dividendYield: 0.34 }) });
  const fromRatio = toCompanyProfile({
    ticker: "AAPL",
    fundamentals: record({ ratios: { dividend_yield: 0.0034 } }),
  });
  close(fromRatio.dividendYield, fromQuote.dividendYield as number);
});

/* ------------------------------------------------------------------ */
/* Absence                                                             */
/* ------------------------------------------------------------------ */

test("a nought from the feed is an absence, not a valuation", () => {
  const p = toCompanyProfile({
    ticker: "AAPL",
    quote: quote({ marketCap: 0, priceEarningRatio: 0, beta: 0, trailing12MonthsEps: 0, lastPrice: 0 }),
    fundamentals: record({
      ratios: { price_to_book: 0, price_to_sales: 0, return_on_equity: 0, debt_to_equity: 0 },
      ticker: { market_cap: 0, total_employees: 0, share_class_shares_outstanding: 0 },
    }),
  });
  for (const key of [
    "marketCap",
    "pe",
    "beta",
    "eps",
    "price",
    "priceToBook",
    "priceToSales",
    "returnOnEquity",
    "debtToEquity",
    "employees",
    "sharesOutstanding",
  ] as const) {
    assert.equal(p[key], null, `${key} should be null, not nought`);
  }
});

test("a loss is a fact and keeps its sign", () => {
  const p = toCompanyProfile({
    ticker: "AAPL",
    quote: quote({ trailing12MonthsEps: -1.86 }),
    fundamentals: record({ ratios: { return_on_equity: -0.21, debt_to_equity: 2.4 } }),
  });
  assert.equal(p.eps, -1.86);
  assert.equal(p.returnOnEquity, -0.21);
  assert.equal(p.debtToEquity, 2.4);
});

test("the previous close is never borrowed from today's close", () => {
  const p = toCompanyProfile({
    ticker: "AAPL",
    quote: quote({ lastPrice: null, closingPrice: 311.56, yesterdayClose: null }),
  });
  assert.equal(p.price, 311.56);
  assert.equal(p.previousClose, null);
});

/* The page degrades, it does not 500: a ticker the gateway answered nothing
   about still renders a header made of dashes. */
test("a call with neither feed still returns a profile rather than throwing", () => {
  const profile: CompanyProfile = toCompanyProfile({ ticker: "AAPL" });
  assert.equal(profile.id, "AAPL");
  for (const key of [
    "exchange",
    "sector",
    "about",
    "site",
    "employees",
    "listedOn",
    "price",
    "chg",
    "dayHigh",
    "dayLow",
    "open",
    "previousClose",
    "high52",
    "low52",
    "volume",
    "avgVolume",
    "marketCap",
    "pe",
    "eps",
    "beta",
    "priceToBook",
    "priceToSales",
    "dividendYield",
    "returnOnEquity",
    "returnOnAssets",
    "debtToEquity",
    "freeCashFlow",
    "enterpriseValue",
    "evToEbitda",
    "sharesOutstanding",
    "asOf",
  ] as const) {
    assert.equal(profile[key], null, `${key} should be null with no feed behind it`);
  }
  assert.deepEqual(profile.peers, []);
});

test("an unentitled quote is not a quote", () => {
  const p = toCompanyProfile({
    ticker: "SPX$",
    quote: quote({ symbol: "SPX$", notPermissioned: true, delayed: false, lastPrice: 6_800 }),
  });
  assert.equal(p.price, null);
  assert.equal(p.delayed, true, "nothing live is being shown, so nothing live is claimed");
});

/* ------------------------------------------------------------------ */
/* Identity                                                            */
/* ------------------------------------------------------------------ */

test("a curated symbol takes its monogram and colour from presentation", () => {
  const p = toCompanyProfile({ ticker: "AAPL", quote: quote() });
  assert.equal(p.short, "Apple");
  assert.equal(p.mark, "A");
  assert.equal(p.color, "#E5DDD1");
});

test("an uncurated symbol is derived, never invented", () => {
  const p = toCompanyProfile({
    ticker: "ZEBQ",
    quote: quote({ symbol: "ZEBQ", companyName: "ZEBRA HOLDINGS INC" }),
  });
  assert.equal(p.short, "Zebra");
  assert.equal(p.mark, "Z");
  assert.match(p.color, /^#[0-9A-Fa-f]{6}$/);
});

test("the heading takes the full legal name, and falls back to the short one", () => {
  const full = toCompanyProfile({
    ticker: "AAPL",
    quote: quote(),
    fundamentals: record({ ticker: { name: "Apple Inc." } }),
  });
  assert.equal(full.name, "Apple Inc.");
  assert.equal(full.short, "Apple");

  const bare = toCompanyProfile({ ticker: "AAPL", quote: quote() });
  assert.equal(bare.name, "Apple");
});

test("a lower-case ticker still finds its seed", () => {
  const p = toCompanyProfile({ ticker: "aapl" });
  assert.equal(p.id, "AAPL");
  assert.equal(p.short, "Apple");
});

test("the exchange prefers the quotes feed's own code", () => {
  const both = toCompanyProfile({
    ticker: "AAPL",
    quote: quote({ exchange: "NSDQ" }),
    fundamentals: record({ ticker: { primary_exchange: "XNAS" } }),
  });
  assert.equal(both.exchange, "NSDQ");

  const only = toCompanyProfile({
    ticker: "AAPL",
    fundamentals: record({ ticker: { primary_exchange: "XNAS" } }),
  });
  assert.equal(only.exchange, "XNAS");
});

test("the sector is passed through, and a blank one is an absence", () => {
  assert.equal(toCompanyProfile({ ticker: "AAPL", sector: "Information technology" }).sector, "Information technology");
  assert.equal(toCompanyProfile({ ticker: "AAPL", sector: "" }).sector, null);
  assert.equal(toCompanyProfile({ ticker: "AAPL" }).sector, null);
});

test("asOf reads the quote's own update time, and nothing else", () => {
  const dated = toCompanyProfile({
    ticker: "AAPL",
    quote: quote({ updateTime: "2026-08-20T19:59:41.000-0400" }),
  });
  assert.equal(dated.asOf, Date.parse("2026-08-20T19:59:41.000-0400"));
  assert.equal(toCompanyProfile({ ticker: "AAPL", quote: quote({ updateTime: "never" }) }).asOf, null);
});

/* ------------------------------------------------------------------ */
/* Peers                                                               */
/* ------------------------------------------------------------------ */

test("peers are plain tickers, deduped, without the company itself", () => {
  const p = toCompanyProfile({
    ticker: "AAPL",
    fundamentals: record({
      related: [
        { ticker: "MSFT" },
        { ticker: "AAPL" },
        { ticker: "MSFT" },
        { ticker: "  googl  " },
        { ticker: "" },
      ],
    }),
  });
  assert.deepEqual(p.peers, ["MSFT", "GOOGL"]);
});

test("peers are empty when the record carries none", () => {
  assert.deepEqual(toCompanyProfile({ ticker: "AAPL", fundamentals: record() }).peers, []);
});

/* ------------------------------------------------------------------ */
/* The rest of the header                                              */
/* ------------------------------------------------------------------ */

test("the day range, the year range and the volumes are carried straight across", () => {
  const p = toCompanyProfile({
    ticker: "AAPL",
    quote: quote({
      lastPrice: 311.56,
      openingPrice: 309.1,
      dayHigh: 313.4,
      dayLow: 308.2,
      yesterdayClose: 316.28,
      high52week: 341.2,
      low52week: 168.99,
      volume: 42_000_000,
      averageVolume30: 50_000_000,
      delayed: true,
    }),
    fundamentals: record({
      ticker: {
        description: "Apple designs and sells personal electronics.",
        homepage_url: "https://www.apple.com",
        total_employees: 164_000,
        list_date: "1980-12-12",
        share_class_shares_outstanding: 14_840_000_000,
      },
    }),
  });
  assert.equal(p.price, 311.56);
  assert.equal(p.open, 309.1);
  assert.equal(p.dayHigh, 313.4);
  assert.equal(p.dayLow, 308.2);
  assert.equal(p.previousClose, 316.28);
  assert.equal(p.high52, 341.2);
  assert.equal(p.low52, 168.99);
  assert.equal(p.volume, 42_000_000);
  assert.equal(p.avgVolume, 50_000_000);
  assert.equal(p.about, "Apple designs and sells personal electronics.");
  assert.equal(p.site, "https://www.apple.com");
  assert.equal(p.employees, 164_000);
  assert.equal(p.listedOn, "1980-12-12");
  assert.equal(p.sharesOutstanding, 14_840_000_000);
  assert.equal(p.delayed, true);
});

test("average volume falls back to the fundamentals ratio", () => {
  const p = toCompanyProfile({
    ticker: "AAPL",
    quote: quote({ averageVolume30: null }),
    fundamentals: record({ ratios: { average_volume: 48_100_000 } }),
  });
  assert.equal(p.avgVolume, 48_100_000);
});

test("the price/earnings ratio falls back to the fundamentals ratio", () => {
  const p = toCompanyProfile({
    ticker: "AAPL",
    quote: quote({ priceEarningRatio: null }),
    fundamentals: record({ ratios: { price_to_earnings: 32.1, earnings_per_share: 6.11 } }),
  });
  assert.equal(p.pe, 32.1);
  assert.equal(p.eps, 6.11);
});

/* ------------------------------------------------------------------ */
/* The four ratios the record was already paying for                   */
/* ------------------------------------------------------------------ */

test("return on assets, free cash flow, enterprise value and EV/EBITDA reach the profile", () => {
  /* All four are declared on the ratios block, arrive in the same response as
     the eleven already mapped, and were being dropped on the floor. */
  const p = toCompanyProfile({
    ticker: "AAPL",
    fundamentals: record({
      ratios: {
        return_on_assets: 0.2841,
        free_cash_flow: 98_760_000_000,
        enterprise_value: 4_701_220_000_000,
        ev_to_ebitda: 34.9,
      },
    }),
  });

  assert.equal(p.returnOnAssets, 0.2841);
  assert.equal(p.freeCashFlow, 98_760_000_000);
  assert.equal(p.enterpriseValue, 4_701_220_000_000);
  assert.equal(p.evToEbitda, 34.9);
});

test("return on assets is passed on in the unit the feed states it, unconverted", () => {
  /* The same decision already taken for return on equity: the endpoint
     documents no unit and 0.2841 is equally readable as 28.41% or as 0.28%.
     A guessed hundredfold here is the very error the conversions above exist
     to remove, so the figure arrives on the profile exactly as it was sent. */
  const p = toCompanyProfile({
    ticker: "AAPL",
    fundamentals: record({ ratios: { return_on_assets: 0.2841, return_on_equity: 1.7134 } }),
  });

  assert.equal(p.returnOnAssets, 0.2841, "not 28.41, and not 0.002841");
  assert.equal(p.returnOnEquity, 1.7134);
});

test("a nought in the new four is an absence, not a reading", () => {
  const p = toCompanyProfile({
    ticker: "AAPL",
    fundamentals: record({
      ratios: {
        return_on_assets: 0,
        free_cash_flow: 0,
        enterprise_value: 0,
        ev_to_ebitda: 0,
      },
    }),
  });

  for (const key of ["returnOnAssets", "freeCashFlow", "enterpriseValue", "evToEbitda"] as const) {
    assert.equal(p[key], null, `${key} should be null, not nought`);
  }
});

test("a cash burn and a net-cash balance sheet keep their negative signs", () => {
  /* A company spending more than it makes has a real, negative free cash flow,
     and one holding more cash than it is worth has a real, negative enterprise
     value. Nulling either would hide the reading that matters most. */
  const p = toCompanyProfile({
    ticker: "AAPL",
    fundamentals: record({
      ratios: { return_on_assets: -0.12, free_cash_flow: -2_400_000_000, enterprise_value: -310_000_000 },
    }),
  });

  assert.equal(p.returnOnAssets, -0.12);
  assert.equal(p.freeCashFlow, -2_400_000_000);
  assert.equal(p.enterpriseValue, -310_000_000);
});

test("a multiple struck against negative earnings is not a multiple", () => {
  /* EV/EBITDA goes negative only because EBITDA did, and a -8x sitting in a
     column of 20x and 34x reads as the cheapest company on the page. It is the
     one that is losing money. */
  const p = toCompanyProfile({
    ticker: "AAPL",
    fundamentals: record({ ratios: { ev_to_ebitda: -8.4 } }),
  });

  assert.equal(p.evToEbitda, null);
});

test("the new four are null on a record that carries no ratios block at all", () => {
  const bare: RawFundamentals = { status: "OK", ticker: null, ticker_news: null, ratios: null, related_companies: null };
  const p = toCompanyProfile({ ticker: "AAPL", fundamentals: bare });

  for (const key of ["returnOnAssets", "freeCashFlow", "enterpriseValue", "evToEbitda"] as const) {
    assert.equal(p[key], null, `${key} should be null with no ratios behind it`);
  }
});
