import { marketImpactOf } from "./market-impact.ts";
import { titleKey } from "./news-hygiene.ts";
import { relevanceOf } from "./relevance.ts";
import { relativeAge } from "./time.ts";
import { presentation } from "../../market/universe.ts";
import type { RawTickerNews } from "../clients/fundamentals.ts";
import type { WireItem } from "@/lib/market/home";

/* The news rail.

   There is no market-wide news endpoint on the gateway, so the rail is built
   by asking a handful of tickers for their own headlines. Polygon attaches an
   article to every ticker it mentions, which means one Apple story arrives
   again under MSFT, GOOGL and BRK.B. Concatenating the responses produces a
   rail that repeats itself three or four times before it says anything new,
   and the dedupe below is the whole reason this module exists.

   `published_utc` is ISO 8601 from Polygon rather than the gateway's
   "MM/DD/YYYY HH:MM:SS EDT", so it is parsed with Date.parse and not with
   parseFeedDate. */

const HOUR_MS = 3_600_000;

/* Widening the ticker sample makes concentration worse rather than better: a
   company that has had a busy week answers with a dozen of its own stories,
   and being freshest they take every slot. The rail is meant to survey the
   market, so no single name may supply more than this. */
const MAX_PER_TICKER = 3;

/* Polygon's vocabulary today. Anything else reads as "no opinion" rather than
   being coerced into one. */
const SENTIMENT: Record<string, WireItem["sentiment"]> = {
  positive: "positive",
  neutral: "neutral",
  negative: "negative",
};

function insightFor(item: RawTickerNews, ticker: string) {
  return item.insights?.find((i) => i.ticker === ticker) ?? null;
}

function sentimentFor(item: RawTickerNews, ticker: string): WireItem["sentiment"] {
  const insight = insightFor(item, ticker);
  if (!insight) return null;
  return SENTIMENT[insight.sentiment.trim().toLowerCase()] ?? null;
}

const titleCase = (s: string) => s.toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase());

/* The feed sends no language, and it does carry other languages: on 25 Sep
   2026 Meta's Connect glasses story reached the wire twice, once in English
   and once as "EssilorLuxottica et Meta continuent…". The page is English, so
   the reading is made off the text itself.

   Function words, because they are what a language cannot write a sentence
   without and what English almost never borrows. Chosen to be safe inside an
   English headline: no "pour", "per", "die" or "est" (English words), no
   "los", "las", "das" or "der" (Los Angeles, Las Vegas, a surname, van der),
   and no "com" (every ".com"). A story needs two of them AND more of them than
   English ones, over its title and summary, so an English piece about Le Pen
   or La Liga is not mistaken for a French one. */
const FOREIGN_WORDS = new Set([
  "et", "les", "des", "du", "une", "avec", "dans", "sur", "leur", "selon",
  "und", "für", "nicht", "ist", "ein", "eine",
  "para", "con", "del", "según", "una",
  "della", "delle", "che", "sono",
  "não", "uma", "pelo", "pela",
]);
const ENGLISH_WORDS = new Set([
  "the", "and", "of", "to", "in", "for", "on", "with", "is", "are", "its", "as", "at",
  "by", "from", "that", "this", "after", "will", "has", "have", "be", "a", "an",
]);

/* Letters outside the Latin script at all (Cyrillic, CJK, Arabic) are the
   other half: a fifth of the letters is far more than any English headline's
   borrowed accents. */
const NON_LATIN_SHARE = 0.2;

function readsAsEnglish(title: string, summary: string): boolean {
  const text = `${title} ${summary}`;
  const letters = text.match(/\p{L}/gu) ?? [];
  if (letters.length > 0) {
    const nonLatin = letters.filter((c) => !/\p{Script=Latin}/u.test(c)).length;
    if (nonLatin / letters.length > NON_LATIN_SHARE) return false;
  }
  let foreign = 0;
  let english = 0;
  for (const word of text.toLowerCase().match(/\p{L}+/gu) ?? []) {
    if (FOREIGN_WORDS.has(word)) foreign += 1;
    else if (ENGLISH_WORDS.has(word)) english += 1;
  }
  return !(foreign >= 2 && foreign > english);
}

export function toWireItems(
  perTicker: Array<{ ticker: string; news: RawTickerNews[] }>,
  nowMs: number,
  limit: number,
): WireItem[] {
  const seen = new Set<string>();
  const items: WireItem[] = [];

  for (const { ticker, news } of perTicker) {
    const look = presentation(ticker);

    for (const item of news) {
      if (seen.has(item.id)) continue;

      /* Checked before the id is recorded, so a malformed copy does not
         suppress a well-formed one under a later ticker. */
      const published = Date.parse(item.published_utc);
      if (!Number.isFinite(published)) continue;
      seen.add(item.id);

      if (!readsAsEnglish(item.title ?? "", item.description ?? "")) continue;

      /* Is this article ABOUT the company, or does it merely name it?
         relevance.ts reads the per-ticker `sentiment_reasoning` that this
         module used to open, take the one-word sentiment from, and throw the
         rest away — the sentence beside it says outright whether the company
         is the subject or a holding in someone else's fund. Anything that is
         not coverage is dropped here rather than ranked below coverage,
         because a rail of three roundups is what the reader complained about
         and burying them at position four does not fix it. */
      const relevance = relevanceOf(
        {
          title: item.title ?? "",
          tickers: item.tickers ?? null,
          reasoning: insightFor(item, ticker)?.sentiment_reasoning ?? null,
          publishedMs: published,
        },
        ticker,
        look.name,
        nowMs,
      );
      if (relevance.verdict !== "coverage") continue;

      /* Scored here as well as in stock-news.ts so an item does not change
         rank by crossing a source boundary. */
      const impact = marketImpactOf({
        title: item.title ?? "",
        summary: item.description ?? null,
      });

      const keyword = item.keywords?.[0]?.trim();

      items.push({
        id: item.id,
        source: item.publisher?.name?.trim() || "The wire",
        title: item.title,
        summary: item.description?.trim() ?? "",
        url: item.article_url,
        ticker,
        company: look.name,
        mark: look.mark,
        color: look.color,
        time: relativeAge(published, nowMs),
        age: (nowMs - published) / HOUR_MS,
        tag: keyword ? titleCase(keyword) : "Markets",
        sentiment: sentimentFor(item, ticker),
        relevance: relevance.score,
        impact: impact.score,
        impactKind: impact.kind,
      });
    }
  }

  /* Relevance first, recency only to break a tie. Sorting by age alone put the
     weakest surviving story at the top whenever it happened to be freshest. */
  const ordered = items.sort(
    (a, b) =>
      (b.relevance ?? 0) + (b.impact ?? 0) - ((a.relevance ?? 0) + (a.impact ?? 0)) ||
      a.age - b.age,
  );

  /* One card per story. The id check above catches one article filed under
     several tickers; it cannot catch the same story arriving under two ids.
     Measured 25 Sep 2026: "Earnings Outlook Remains Upbeat: A Closer Look"
     for GOOGL filled two cards back to back. So a story is also known by its
     address and by the spine of its headline (titleKey, the stock-news rail's
     rule). Run after the sort, so the copy kept is the best-ranked one, and
     only a shown card claims its story. */
  const shown = new Set<string>();
  const takenFrom = new Map<string, number>();
  const spread: WireItem[] = [];
  for (const item of ordered) {
    const keys = [
      titleKey(item.title ?? ""),
      (item.url ?? "").trim().toLowerCase(),
    ].filter((k) => k !== "");
    if (keys.some((k) => shown.has(k))) continue;
    const taken = takenFrom.get(item.ticker) ?? 0;
    if (taken >= MAX_PER_TICKER) continue;
    takenFrom.set(item.ticker, taken + 1);
    for (const k of keys) shown.add(k);
    spread.push(item);
    if (spread.length === limit) break;
  }

  return spread;
}
