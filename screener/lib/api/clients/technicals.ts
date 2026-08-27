import "server-only";
import { vtGet } from "../http.ts";
import type { ApiResult } from "../errors.ts";

/* /mdp/api/v1/polygon/* — the indicator and short-interest endpoints.

   These are the only technical figures this account holds. The /insight/*
   family, which is where analyst targets and consensus would come from,
   answers 400 on every path, so a panel built on what is here has nothing
   richer to defer to and nothing to fall back on.

   Both endpoints wrap their payload in `results`, and both return it empty
   for names they have not computed. The shapes below make every level of that
   nesting optional, so an unentitled or uncovered ticker becomes an empty
   panel rather than a thrown render. */

export type IndicatorKind = "rsi" | "sma" | "ema";

/** Bar size the indicator is computed over, not the length of the window. */
export type IndicatorTimespan = "day" | "week" | "month";

export type RawIndicator = {
  results?: {
    /** NEWEST FIRST, about ten of them. Reversed in normalize/technicals.ts. */
    values?: Array<{ timestamp: number; value: number }>;
  };
};

export function fetchIndicator(
  kind: IndicatorKind,
  ticker: string,
  opts: { window: number; timespan: IndicatorTimespan },
  revalidate: number,
  tags: string[],
  noStore = false,
): Promise<ApiResult<RawIndicator>> {
  return vtGet<RawIndicator>(
    `/mdp/api/v1/polygon/indicators/${kind}/${encodeURIComponent(ticker)}`,
    { query: { window: opts.window, timespan: opts.timespan }, revalidate, tags, noStore },
  );
}

export type RawShortInterest = {
  results?: Array<{
    ticker: string;
    /** The settlement date the exchanges reported against, ISO. */
    settlement_date: string;
    short_interest: number;
    avg_daily_volume: number;
    days_to_cover: number;
  }>;
};

/* Short interest is filed twice a month and published on a lag of a week or
   more, so the newest row is routinely a fortnight old. That is a fact about
   the filing calendar rather than a fault, which is why `settlement_date`
   travels with the figure — a short-interest reading without its date invites
   the reader to take it for today's. */
export function fetchShortInterest(
  ticker: string,
  revalidate: number,
  tags: string[],
  noStore = false,
): Promise<ApiResult<RawShortInterest>> {
  return vtGet<RawShortInterest>("/mdp/api/v1/polygon/stocks/short-interest", {
    query: { ticker },
    revalidate,
    tags,
    noStore,
  });
}
