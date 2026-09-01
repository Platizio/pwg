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

async function articlesRaw(keywords: string[], count: number): Promise<ApiResult<RawArticle[]>> {
  const res = await post<{ articles?: { results?: RawArticle[] } }>("/article/getArticles", {
    action: "getArticles",
    keyword: keywords,
    keywordOper: "or",
    lang: "eng",
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
  if (budget.ok && budget.data.availableTokens < BUDGET_FLOOR) {
    return fail(
      `news budget exhausted (${budget.data.availableTokens} left, floor ${BUDGET_FLOOR})`,
      0,
      0,
    );
  }

  return articlesRaw(MARKET_KEYWORDS, count);
}

/** Exposed so the cache layer can wrap it. */
export { articlesRaw, budgetRaw };
