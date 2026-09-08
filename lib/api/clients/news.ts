import "server-only";
import { env, newsAvailable } from "../env.ts";
import { type ApiResult, fail, ok, scrub } from "../errors.ts";

/* newsapi.ai (Event Registry).

   Note this is NOT newsapi.org — the same key 401s there. The account carries
   a hard lifetime budget of 2,000 requests, so this module treats the quota as
   a ledger rather than a cache: it checks what is left and declines to spend
   when the balance is low, instead of discovering the wall mid-render.

   During the validation phase the rail is served by ViewTrade's own
   ticker_news, so nothing here is called on a page render. It is wired and
   probe-verified so that macro headlines are a configuration change later. */

const HOST = "https://eventregistry.org/api/v1";

export type RawArticle = {
  uri: string;
  title: string;
  body: string | null;
  url: string;
  dateTimePub: string;
  image: string | null;
  sentiment: number | null;
  lang: string;
  source: { uri: string; title: string } | null;
  concepts: Array<{ label: { eng: string }; score: number }> | null;
};

export type NewsBudget = { availableTokens: number; usedTokens: number };

async function post<T>(path: string, body: Record<string, unknown>): Promise<ApiResult<T>> {
  const started = Date.now();
  let res: Response;
  try {
    res = await fetch(`${HOST}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...body, apiKey: env().newsKey }),
      cache: "no-store",
      signal: AbortSignal.timeout(20_000),
    });
  } catch (e) {
    return fail(scrub(String(e)), 0, Date.now() - started);
  }
  const ms = Date.now() - started;
  if (!res.ok) return fail(`HTTP ${res.status}`, res.status, ms);
  try {
    return ok((await res.json()) as T, res.status, ms);
  } catch {
    return fail("Response was not valid JSON", res.status, ms);
  }
}

async function budgetRaw(): Promise<ApiResult<NewsBudget>> {
  const started = Date.now();
  try {
    const res = await fetch(`${HOST}/usage?apiKey=${encodeURIComponent(env().newsKey ?? "")}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
    const ms = Date.now() - started;
    if (!res.ok) return fail(`HTTP ${res.status}`, res.status, ms);
    return ok((await res.json()) as NewsBudget, res.status, ms);
  } catch (e) {
    return fail(scrub(String(e)), 0, Date.now() - started);
  }
}

export const fetchNewsBudget = budgetRaw;

/** Below this many remaining requests, stop spending automatically. */
export const BUDGET_FLOOR = 100;

/* What is actually left.
 *
 * `availableTokens` is the plan's CAP, not the remainder — measured live it
 * reads 2000 while `usedTokens` reads 15. The floor above used to be compared
 * against the cap directly, so the test was 2000 < 100: false at 15 spent and
 * still false at 1999 spent. The stop could never fire.
 *
 * It never showed because nothing was spending: the rail was served by the
 * gateway's own ticker_news and this module sat dormant. A per-stock query
 * spending on every ticker makes it load-bearing immediately. */
export function remainingTokens(b: NewsBudget): number {
  const cap = Number(b?.availableTokens);
  const used = Number(b?.usedTokens);
  if (!Number.isFinite(cap) || !Number.isFinite(used)) return Number.NaN;
  return Math.max(0, cap - used);
}

/* Fails closed. A balance we cannot read is not permission to spend against a
   non-renewable allowance: being wrong is permanent, while being cautious only
   costs a rail that falls back to the gateway's own headlines. */
export function budgetExhausted(b: NewsBudget): boolean {
  const left = remainingTokens(b);
  return !Number.isFinite(left) || left < BUDGET_FLOOR;
}

/* Four of these were learned the hard way on the marketing side and are
   repeated here because this query has exactly the same failure modes. A first
   run without them, searching "Apple" OR "AAPL" across article bodies, came
   back with a slot-machine explainer, a Nissan export story and a crypto
   futures press release — none of which mention Apple at all — plus the same
   Lake Ontario story twice, once from Yahoo and once from UPI.

     keywordLoc "title"       a story about a company names it in the headline;
                              matching the body admits anything that mentions it
                              in passing, which was most of that first page
     keywordSearchMode        the API tokenises multi-word keywords, so
       "phrase"               "Meta Platforms" would otherwise match a bare
                              "platforms"
     dataType ["news"]        not blogs, not press-release wire
     isDuplicateFilter        syndication: the same story under three mastheads
       "skipDuplicates"       otherwise fills the rail by itself */
async function articlesRaw(keywords: string[], count: number): Promise<ApiResult<RawArticle[]>> {
  const res = await post<{ articles?: { results?: RawArticle[] } }>("/article/getArticles", {
    action: "getArticles",
    keyword: keywords,
    keywordOper: "or",
    keywordSearchMode: "phrase",
    keywordLoc: "title",
    lang: "eng",
    dataType: ["news"],
    isDuplicateFilter: "skipDuplicates",
    articlesPage: 1,
    articlesCount: count,
    articlesSortBy: "date",
    resultType: "articles",
    includeArticleImage: true,
    includeArticleConcepts: true,
    includeArticleSentiment: true,
  });
  if (!res.ok) return res;
  return ok(res.data.articles?.results ?? [], res.status, res.ms);
}

export const MARKET_KEYWORDS = [
  "stock market",
  "earnings",
  "Federal Reserve",
  "interest rates",
  "Wall Street",
];

/** Macro headlines, budget-guarded. Held back during validation. */
export async function fetchMarketArticles(count = 8): Promise<ApiResult<RawArticle[]>> {
  if (!newsAvailable()) return fail("news disabled or key missing", 0, 0);

  const budget = await fetchNewsBudget();
  if (budget.ok && budgetExhausted(budget.data)) {
    return fail(
      `news budget exhausted (${remainingTokens(budget.data)} left, floor ${BUDGET_FLOOR})`,
      0,
      0,
    );
  }

  return articlesRaw(MARKET_KEYWORDS, count);
}

/* One company's coverage, budget-guarded.
 *
 * Why this exists: the market-data gateway bundles exactly three articles into
 * its fundamentals aggregate — every ticker, no paging, no separate endpoint —
 * and roughly two of the three are filler that merely names the company. Three
 * candidates cannot yield three relevant stories, so the pool has to widen
 * from somewhere, and this is the only other source wired.
 *
 * Deliberately over-fetches. The relevance pass downstream rejects most of a
 * feed like this, so asking for three would hand it three and leave it nothing
 * to choose from. One request buys the whole pool either way — the cost is per
 * call, not per article — so the only thing a small count would save is
 * nothing at all.
 *
 * The usage check ahead of it is free: two consecutive reads leave usedTokens
 * unchanged, so guarding every call costs no allowance. */
export async function fetchStockArticles(
  companyName: string,
  ticker: string,
  count = 25,
): Promise<ApiResult<RawArticle[]>> {
  if (!newsAvailable()) return fail("news disabled or key missing", 0, 0);

  const budget = await fetchNewsBudget();
  if (budget.ok && budgetExhausted(budget.data)) {
    return fail(
      `news budget exhausted (${remainingTokens(budget.data)} left, floor ${BUDGET_FLOOR})`,
      0,
      0,
    );
  }

  /* Name and ticker, OR'd. The name carries the coverage and the ticker catches
     the market copy that only ever writes the symbol. Precision is not this
     query's job — widening the pool is, and the relevance pass decides. */
  const keywords = [companyName, ticker].map((k) => k.trim()).filter(Boolean);
  if (keywords.length === 0) return fail("no keyword to search on", 0, 0);

  return articlesRaw(keywords, count);
}

/** Exposed so the cache layer can wrap it. */
export { articlesRaw, budgetRaw };
