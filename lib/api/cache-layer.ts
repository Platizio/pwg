import "server-only";
import { unstable_cache } from "next/cache";
import { guard, settle } from "./cache-policy.ts";
import { TAGS, TTL } from "./ttl.ts";
import {
  fetchCorporateActionsUncached,
  fetchFundamentalsUncached,
} from "./clients/fundamentals.ts";
import { fetchFinancials, type FinancialsTimeframe } from "./clients/financials.ts";
import { budgetRaw, fetchMarketArticles, fetchStockArticles } from "./clients/news.ts";
import type { ApiResult } from "./errors.ts";

/* The long-TTL cache layer.

   This is the one module that imports next/cache, which keeps every other
   module in lib/api loadable from a plain Node process — that is what lets the
   standalone probe share the real client code instead of a second copy of it.

   These calls cache by argument rather than by URL because Next includes the
   Authorization header in the fetch cache key, and a token that rotates every
   two hours would otherwise invalidate anything cached for longer than that.

   unstable_cache is documented in Next 16 as superseded by `use cache`, which
   requires cacheComponents: true. That flag changes the caching model for the
   whole app, so it stays a separate migration. */

/**
 * unstable_cache, minus the memory for failures that were never true for long.
 *
 * Every wrapper below went through plain unstable_cache once, and every one of
 * them cached its own outages: nothing in lib/api throws, so an ApiFailure is
 * just a value, and a value is exactly what a memoiser keeps. A one-second blip
 * became twelve hours of "this ticker failed" — measured on /api/sweep, which
 * reported 14 of 93 corporate-action calls failing while the same 93 probed
 * directly failed 2, and dropped to 2 the moment the tag was cleared.
 *
 * `guard` runs inside the cache and throws on a transient failure, which Next
 * declines to store; `settle` runs outside it and hands the caller back the
 * same ApiResult it has always received. No caller changes. See cache-policy.ts
 * for why a 404 is still cached and a 502 never is.
 */
function cacheResult<A extends unknown[], T>(
  fn: (...args: A) => Promise<ApiResult<T>>,
  keyParts: string[],
  options: { revalidate: number; tags: string[] },
): (...args: A) => Promise<ApiResult<T>> {
  const inner = unstable_cache(
    async (...args: A) => guard(await fn(...args)),
    keyParts,
    options,
  );
  return (...args: A) => settle(inner(...args));
}

export const getFundamentals = cacheResult(
  fetchFundamentalsUncached,
  ["mdp", "fundamentals"],
  { revalidate: TTL.fundamentals, tags: [TAGS.fundamentals] },
);

export const getCorporateActions = cacheResult(
  fetchCorporateActionsUncached,
  ["mdp", "corporate-actions"],
  { revalidate: TTL.corporateActions, tags: [TAGS.calendar] },
);

/* One stock's wider news pool, cached for a day.
 *
 * The gateway gives three articles per ticker and roughly two are filler, so
 * three relevant stories have to come from somewhere else. This is that
 * somewhere, and it bills a non-renewable lifetime allowance — hence the day.
 *
 * Wraps the guarded fetch deliberately: fetchStockArticles checks the balance
 * and refuses below the floor, and caching the raw call instead would spend
 * the allowance with nothing watching it. */
export const getStockArticles = cacheResult(
  (companyName: string, ticker: string, count?: number) =>
    fetchStockArticles(companyName, ticker, count),
  ["news", "stock-articles"],
  { revalidate: TTL.stockNews, tags: [TAGS.news] },
);

export const getNewsBudget = cacheResult(budgetRaw, ["news", "budget"], {
  revalidate: TTL.newsBudget,
  tags: [TAGS.news],
});

/* fetchMarketArticles, not articlesRaw. This wrapped the raw call and so
   stepped straight past the budget guard — the cached path, the only one
   anything would actually use, was the unguarded one. */
export const getMarketArticles = cacheResult(
  (count: number) => fetchMarketArticles(count),
  ["news", "articles"],
  { revalidate: TTL.newsArticles, tags: [TAGS.news] },
);

/* Filed statements change four times a year, so six hours is generous rather
   than stale. noStore on the inner call is deliberate: the caching happens
   here, keyed on ticker and timeframe, so the rotating Authorization header
   never enters the key. */
export const getFinancials = cacheResult(
  (ticker: string, timeframe: FinancialsTimeframe) =>
    fetchFinancials(ticker, timeframe, TTL.fundamentals, [TAGS.fundamentals], true),
  ["mdp", "financials"],
  { revalidate: TTL.fundamentals, tags: [TAGS.fundamentals] },
);
