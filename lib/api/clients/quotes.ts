import "server-only";
import { vtGet } from "../http.ts";
import type { ApiResult } from "../errors.ts";

/* /aes/api/quotes/* — the equity feed.

   Field names here are what the gateway actually returns, which differs from
   the published catalogue in three ways that matter. They are documented on
   the fields themselves because getting any of them wrong is silent: the page
   still renders, the numbers are just wrong by a factor of a hundred. */

export const MAX_SYMBOLS = 50; // server-enforced: 51+ returns 400 "Too many symbols, max 50 allowed"

export type RawEquityQuote = {
  symbol: string;
  companyName: string | null;
  /** Day change as a FRACTION, not a percent: -0.01492914 means -1.49%. */
  changePercent: number | null;
  change: number | null;
  lastPrice: number | null;
  closingPrice: number | null;
  yesterdayClose: number | null;
  openingPrice: number | null;
  dayHigh: number | null;
  dayLow: number | null;
  volume: number | null;
  averageVolume30: number | null;
  /** In MILLIONS of dollars. AAPL reads 4623870, meaning $4.62T. */
  marketCap: number | null;
  priceEarningRatio: number | null;
  /** Already a percent here (0.34 = 0.34%) — but a FRACTION on
      /mdp fundamentals `ratios.dividend_yield`. Convert in normalize, never
      at a call site. */
  dividendYield: number | null;
  trailing12MonthsEps: number | null;
  high52week: number | null;
  low52week: number | null;
  beta: number | null;
  exchange: string | null;
  currency: string | null;
  isin: string | null;
  cusip: string | null;
  delayed: boolean;
  source: string | null;
  /** ISO with offset, e.g. "2026-08-20T19:59:41.000-0400". */
  updateTime: string | null;
  notFound: boolean;
  /** True for instruments we are catalogued for but not entitled to — every
      index symbol (SPX$, NDX$, RUT$, VIX$) comes back this way. */
  notPermissioned: boolean;
};

export type RawSearchHit = {
  symbol: string;
  companyName: string | null;
  country: string | null;
  mic: string | null;
  exchange: string | null;
  precision: number | null;
};

export type RawHistoryPoint = {
  /** "MM/DD/YYYY HH:MM:SS EDT" — parse with normalize/time.ts, never Date.parse. */
  date: string;
  /** The close. The catalogue calls this `close`; the gateway calls it `price`. */
  price: number;
  opening: number | null;
  high: number | null;
  low: number | null;
  volume: number | null;
};

/** Ranges the gateway accepts. `5d` is documented but returns HTTP 400. */
export type HistoryRange = "1m" | "1y" | "5y";

export function chunk<T>(items: readonly T[], size = MAX_SYMBOLS): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export function fetchQuotes(
  symbols: readonly string[],
  revalidate: number,
  tags: string[],
  noStore = false,
): Promise<ApiResult<RawEquityQuote[]>> {
  if (symbols.length > MAX_SYMBOLS) {
    throw new Error(
      `fetchQuotes received ${symbols.length} symbols; the gateway caps at ${MAX_SYMBOLS}. Use fetchQuotesBatched.`,
    );
  }
  return vtGet<RawEquityQuote[]>("/aes/api/quotes/equity", {
    query: { symbols: symbols.join(",") },
    revalidate,
    tags,
    noStore,
  });
}

export type BatchOutcome = {
  quotes: RawEquityQuote[];
  /** Requested but absent from the response, or flagged notFound. */
  missing: string[];
  failedChunks: number;
  chunks: number;
  ms: number;
};

/** Fan a symbol list out across as many 50-symbol calls as it takes.

    A failed chunk costs its own symbols and nothing else — the caller still
    gets every row that did come back, plus a count of what did not. */
export async function fetchQuotesBatched(
  symbols: readonly string[],
  revalidate: number,
  tags: string[],
  opts: { concurrency?: number; noStore?: boolean } = {},
): Promise<BatchOutcome> {
  const started = Date.now();
  const groups = chunk(symbols);
  const concurrency = Math.max(1, opts.concurrency ?? 8);

  const quotes: RawEquityQuote[] = [];
  let failedChunks = 0;

  for (let i = 0; i < groups.length; i += concurrency) {
    const wave = groups.slice(i, i + concurrency);
    const settled = await Promise.allSettled(
      wave.map((g) => fetchQuotes(g, revalidate, tags, opts.noStore)),
    );
    for (const s of settled) {
      if (s.status === "fulfilled" && s.value.ok) quotes.push(...s.value.data);
      else failedChunks += 1;
    }
  }

  const seen = new Set(quotes.filter((q) => !q.notFound).map((q) => q.symbol));
  const missing = symbols.filter((s) => !seen.has(s));

  return { quotes, missing, failedChunks, chunks: groups.length, ms: Date.now() - started };
}

export function searchSymbols(
  criteria: string,
  revalidate: number,
  tags: string[],
  noStore = false,
): Promise<ApiResult<RawSearchHit[]>> {
  return vtGet<RawSearchHit[]>("/aes/api/quotes/search", {
    query: { criteria },
    revalidate,
    tags,
    noStore,
  });
}

/* One session of one-minute bars, from 04:00 Eastern.

   A different endpoint from the daily history, with a different date format
   (ISO-8601 with an offset) and the same row shape otherwise. It answers with
   an empty array outside a session, which is a real state rather than a
   failure — the chart says so instead of quietly drawing something else. */
export function fetchIntraday(
  symbol: string,
  revalidate: number,
  tags: string[],
  noStore = false,
): Promise<ApiResult<RawHistoryPoint[]>> {
  return vtGet<RawHistoryPoint[]>("/aes/api/quotes/equity/intraday", {
    query: { symbol },
    revalidate,
    tags,
    noStore,
  });
}

export function fetchHistory(
  symbol: string,
  range: HistoryRange,
  revalidate: number,
  tags: string[],
  noStore = false,
): Promise<ApiResult<RawHistoryPoint[]>> {
  return vtGet<RawHistoryPoint[]>("/aes/api/quotes/equity/historical", {
    query: { symbol, range },
    revalidate,
    tags,
    noStore,
  });
}
