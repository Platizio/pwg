/* Three stories that actually bear on the stock.
 *
 * The market-data gateway bundles exactly three articles per ticker inside its
 * fundamentals aggregate — every ticker, no paging, no separate news endpoint
 * — and roughly two of every three merely name the company: an ETF holdings
 * list, a Magnificent-Seven note, a market wrap. Three candidates cannot yield
 * three relevant stories however good the filter is, which is the arithmetic
 * that forced a second source in.
 *
 * So this module merges two feeds that agree on nothing:
 *
 *   the gateway      RawTickerNews, judged by relevance.ts from the per-ticker
 *                    `sentiment_reasoning` the provider writes
 *   newsapi.ai       RawArticle, judged by article-relevance.ts from scored
 *                    `concepts`, because it carries no reasoning at all
 *
 * Both scorers share one Verdict vocabulary and one 0..1 scale precisely so
 * their output can be ranked as a single list here.
 *
 * ORDER IS LOAD-BEARING. Rank the union BEFORE the hygiene passes, because
 * dedupeByTitle and capPerSource both keep the first item they see. Ranking
 * afterwards would hand the slot to a duplicate's weaker copy, or to a
 * prolific publisher's weaker story, and the ranking would be silently undone.
 */

import { articleRelevanceOf } from "./article-relevance.ts";
import { marketImpactOf } from "./market-impact.ts";
import { capPerSource, dedupeByTitle } from "./news-hygiene.ts";
import { relativeAge } from "./time.ts";
import { presentation } from "../../market/universe.ts";
import type { RawArticle } from "../clients/news.ts";
import type { WireItem } from "@/lib/market/home";

const HOUR_MS = 3_600_000;

/** Turn one second-source article into a rail item, or null if unusable. */
function toItem(
  article: RawArticle,
  ticker: string,
  look: { name: string; mark: string; color: string },
  nowMs: number,
): WireItem | null {
  const published = Date.parse(article.dateTimePub);
  /* An undateable article cannot be aged, ranked or honestly stamped, and the
     rail prints a relative time on every row. Dropped rather than shown as
     "just now", which is what a NaN would render as after formatting. */
  if (!Number.isFinite(published)) return null;

  const title = (article.title ?? "").trim();
  if (!title) return null;

  const relevance = articleRelevanceOf(
    {
      title,
      body: article.body ?? null,
      concepts: article.concepts ?? null,
      publishedMs: published,
    },
    look.name,
    ticker,
    nowMs,
  );
  if (relevance.verdict !== "coverage") return null;

  const impact = marketImpactOf({ title, summary: article.body ?? null });

  return {
    id: article.uri,
    source: article.source?.title?.trim() || "The wire",
    title,
    summary: (article.body ?? "").trim().slice(0, 400),
    url: article.url,
    ticker,
    company: look.name,
    mark: look.mark,
    color: look.color,
    time: relativeAge(published, nowMs),
    age: (nowMs - published) / HOUR_MS,
    /* The second source carries no per-article section label, and inventing
       one from its concepts would read as provenance it does not have. */
    tag: "Markets",
    /* Event Registry scores sentiment on its own numeric scale, not the
       positive/neutral/negative vocabulary WireItem uses. Rather than invent a
       mapping across two different definitions, this stays null and the rail
       simply shows no tone for these rows. */
    sentiment: null,
    relevance: relevance.score,
    impact: impact.score,
    impactKind: impact.kind,
  };
}

/**
 * The rail for one stock, drawn from both feeds.
 *
 * `gateway` is expected to have been filtered already — toWireItems drops
 * anything that is not coverage — so its items arrive pre-judged and only need
 * ranking against the newcomers.
 */
export function toStockNews(
  gateway: readonly WireItem[],
  articles: readonly RawArticle[],
  ticker: string,
  nowMs: number,
  limit = 3,
): WireItem[] {
  const look = presentation(ticker);

  const fromArticles: WireItem[] = [];
  for (const a of articles) {
    const item = toItem(a, ticker, look, nowMs);
    if (item) fromArticles.push(item);
  }

  /* Relevance AND impact, recency only to break a tie — the same rule wire.ts
     uses, so an item does not change rank by crossing a source boundary.
     Summing them rather than gating on impact is deliberate: a quiet company
     whose only coverage is product news keeps a rail, and the earnings story
     still leads wherever one exists. */
  const ranked = [...gateway, ...fromArticles].sort(
    (a, b) =>
      (b.relevance ?? 0) + (b.impact ?? 0) - ((a.relevance ?? 0) + (a.impact ?? 0)) ||
      a.age - b.age,
  );

  return capPerSource(dedupeByTitle(ranked)).slice(0, limit);
}
