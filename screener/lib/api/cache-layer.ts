import "server-only";
import { unstable_cache } from "next/cache";
import { TAGS, TTL } from "./ttl.ts";
import {
  fetchCorporateActionsUncached,
  fetchFundamentalsUncached,
} from "./clients/fundamentals.ts";
import { fetchFinancials, type FinancialsTimeframe } from "./clients/financials.ts";
import { articlesRaw, budgetRaw, MARKET_KEYWORDS } from "./clients/news.ts";

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

export const getFundamentals = unstable_cache(
  fetchFundamentalsUncached,
  ["mdp", "fundamentals"],
  { revalidate: TTL.fundamentals, tags: [TAGS.fundamentals] },
);

export const getCorporateActions = unstable_cache(
  fetchCorporateActionsUncached,
  ["mdp", "corporate-actions"],
  { revalidate: TTL.corporateActions, tags: [TAGS.calendar] },
);

export const getNewsBudget = unstable_cache(budgetRaw, ["news", "budget"], {
  revalidate: TTL.newsBudget,
  tags: [TAGS.news],
});

export const getMarketArticles = unstable_cache(
  (count: number) => articlesRaw(MARKET_KEYWORDS, count),
  ["news", "articles"],
  { revalidate: TTL.newsArticles, tags: [TAGS.news] },
);

/* Filed statements change four times a year, so six hours is generous rather
   than stale. noStore on the inner call is deliberate: the caching happens
   here, keyed on ticker and timeframe, so the rotating Authorization header
   never enters the key. */
export const getFinancials = unstable_cache(
  (ticker: string, timeframe: FinancialsTimeframe) =>
    fetchFinancials(ticker, timeframe, TTL.fundamentals, [TAGS.fundamentals], true),
  ["mdp", "financials"],
  { revalidate: TTL.fundamentals, tags: [TAGS.fundamentals] },
);
