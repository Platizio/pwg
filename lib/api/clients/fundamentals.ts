import "server-only";
import { vtGet } from "../http.ts";
import { TAGS, TTL } from "../ttl.ts";
import type { ApiResult } from "../errors.ts";

/* /mdp/api/v1/aggregation/* — Polygon-backed reference data.

   This is where the company logo, the real (non-millions) market cap, the SIC
   code that drives sector classification, and the per-ticker news feed live.
   `related_companies` is undocumented but present and reliable. */

export type RawTickerNews = {
  id: string;
  title: string;
  description: string | null;
  article_url: string;
  image_url: string | null;
  author: string | null;
  published_utc: string;
  keywords: string[] | null;
  tickers: string[] | null;
  publisher: {
    name: string | null;
    homepage_url: string | null;
    logo_url: string | null;
    favicon_url: string | null;
  } | null;
  insights:
    | Array<{ ticker: string; sentiment: string; sentiment_reasoning: string }>
    | null;
};

export type RawFundamentals = {
  status: string;
  ticker: {
    ticker: string;
    name: string | null;
    description: string | null;
    homepage_url: string | null;
    /** Real units, unlike the quotes endpoint's millions. */
    market_cap: number | null;
    sic_code: string | null;
    sic_description: string | null;
    primary_exchange: string | null;
    total_employees: number | null;
    list_date: string | null;
    branding: { logo_url: string | null; icon_url: string | null } | null;
    share_class_shares_outstanding: number | null;
  } | null;
  ticker_news: RawTickerNews[] | null;
  ratios: {
    price: number | null;
    market_cap: number | null;
    price_to_earnings: number | null;
    price_to_book: number | null;
    price_to_sales: number | null;
    /** A FRACTION here (0.0034), unlike the quotes endpoint's percent (0.34). */
    dividend_yield: number | null;
    earnings_per_share: number | null;
    return_on_equity: number | null;
    return_on_assets: number | null;
    debt_to_equity: number | null;
    free_cash_flow: number | null;
    enterprise_value: number | null;
    ev_to_ebitda: number | null;
    average_volume: number | null;
    date: string | null;
  } | null;
  /** Undocumented. ~10 peer tickers — useful for universe expansion. */
  related_companies: Array<{ ticker: string }> | null;
};

export type RawCorporateActions = {
  status: string;
  dividends:
    | Array<{
        cash_amount: number;
        currency: string;
        ex_dividend_date: string;
        pay_date: string | null;
        record_date: string | null;
        declaration_date: string | null;
        frequency: number | null;
        distribution_type: string | null;
        ticker: string;
      }>
    | null;
  splits:
    | Array<{
        execution_date: string;
        split_from: number;
        split_to: number;
        adjustment_type: string | null;
        ticker: string;
      }>
    | null;
  /** Undocumented, present in live responses. */
  ipos: unknown[] | null;
  events: Array<{ date: string; type: string }> | null;
};

function fundamentalsRaw(ticker: string, noStore: boolean): Promise<ApiResult<RawFundamentals>> {
  return vtGet<RawFundamentals>(`/mdp/api/v1/aggregation/fundamentals/${encodeURIComponent(ticker)}`, {
    revalidate: TTL.fundamentals,
    tags: [TAGS.fundamentals],
    noStore,
  });
}

function corporateActionsRaw(
  ticker: string,
  noStore: boolean,
): Promise<ApiResult<RawCorporateActions>> {
  return vtGet<RawCorporateActions>(
    `/mdp/api/v1/aggregation/corporate-actions/${encodeURIComponent(ticker)}`,
    { revalidate: TTL.corporateActions, tags: [TAGS.calendar], noStore },
  );
}

/* Raw fetchers only — no next/cache import, so this module also loads in a
   plain Node process (the standalone probe). The cached wrappers the app uses
   live in ../cache-layer.ts. */

export const fetchFundamentals = (t: string) => fundamentalsRaw(t, false);
export const fetchCorporateActions = (t: string) => corporateActionsRaw(t, false);

/** Uncached variants for the probe, which measures real upstream latency. */
export const fetchFundamentalsUncached = (t: string) => fundamentalsRaw(t, true);
export const fetchCorporateActionsUncached = (t: string) => corporateActionsRaw(t, true);
