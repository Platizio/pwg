/* Is this article ABOUT the company, or does it merely mention it?
 *
 * The provider tags an article with every ticker it names, and the terminal
 * read that tag as coverage. So Apple's page carried a Vanguard ETF
 * comparison, a Magnificent-Seven rebalancing note and a market wrap — three
 * headlines, not one of them about Apple.
 *
 * The signal that separates the two was already being fetched and discarded.
 * Each tag carries a `sentiment_reasoning` written per ticker, and it states
 * the relationship outright. Real examples from the live gateway:
 *
 *   "Apple is mentioned only as a top holding in both ETFs … rather than
 *    being the subject"                                        -> a mention
 *   "neither praising nor criticizing NVIDIA specifically"      -> a mention
 *   "NVIDIA's RTX Spark technology is central to ASUS's new …"  -> coverage
 *
 * WHY REASONING OUTRANKS TAG COUNT
 *
 * Tag count is a decent proxy — focused coverage carries one to three tickers,
 * roundups carry eight or ten. But it is only a proxy, and used alone it
 * discards the story a reader most wants. A market wrap tagged with eleven
 * names whose reasoning reads "Stock rose 2.61% … leadership transition from
 * Tim Cook to John Ternus as CEO" is precisely the article that answers "why
 * is it moving". So the per-ticker reasoning decides first, and breadth only
 * decides when the reasoning is silent.
 *
 * WHAT THIS DELIBERATELY DOES NOT DO
 *
 * It does not read the article body, and it does not judge whether a claim is
 * true. It answers one narrow question — is this company the subject — and
 * leaves everything else to the caller.
 */

/** Beyond this, a headline is history rather than news. */
export const MAX_AGE_DAYS = 14;

/** At or above this many tags, an article is addressing a basket, not a name. */
export const ROUNDUP_TAGS = 5;

export type Verdict =
  /** The company is the subject, or the article says something specific about it. */
  | "coverage"
  /** Named in passing: a holding, a comparison, a list it happens to sit in. */
  | "mention"
  /** A basket piece with nothing particular to say about this name. */
  | "roundup"
  /** Real coverage, too old to present as news. */
  | "stale";

export type Relevance = {
  /** 0..1, for ranking. Only meaningful against other articles for the same ticker. */
  score: number;
  verdict: Verdict;
};

/* Phrases the provider uses when it is telling us, in as many words, that the
   company is incidental. Collected from real reasoning text rather than
   imagined — each of these was observed on an article that had no business on
   a company's page. */
const MENTION_MARKERS = [
  "mentioned only",
  "only as a",
  "only mentioned",
  "rather than being",
  "neither praising nor criticizing",
  "no specific",
  "not specifically",
  "as an example",
  "serving as an example",
  "comparison point",
  "focuses on alternative",
  "beyond mega-cap",
  "no direct",
  "not discussed",
  "listed as",
  "top holding",
  "included in",

  /* Dismissals rather than roles. These say the company was present and it did
     not matter, which is the same conclusion reached by a different route.
     They earn their place because a keyword alone was not enough: a MEXC
     futures report scored as Tesla coverage on the strength of the word
     "earnings" and two percentages, while the sentence around them read
     "trading share barely moved from 2.6% to 2.7%, indicating minimal market
     impact". A provider that tells us the impact was minimal has told us whose
     story this is not. */
  "minimal market impact",
  "minimal impact",
  "barely moved",
  "little impact",
  "no meaningful",
];

/* Marks a reasoning that carries an actual company fact. A move with a number
   on it, or a named corporate event, is the substance a reader is looking for
   — and it is what rescues a genuine story from a wide tag list. */
const SPECIFIC_MARKERS = [
  "central to",
  "earnings",
  "guidance",
  "revenue",
  "profit",
  "ceo",
  "acquisition",
  "merger",
  "launch",
  "lawsuit",
  "upgrade",
  "downgrade",
  "dividend",
  "buyback",
  "layoff",
  "recall",
  "approval",
  "contract",
  "partnership",
  "results",
  "forecast",
  "outlook",
  "stake",
  "position",
];

/** A percentage anywhere in the reasoning: a move someone measured. */
const HAS_MOVE = /\d+(?:\.\d+)?\s?%/;

const clamp01 = (n: number) => (Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0);

/** Does the headline name the company or its ticker outright? */
function titleNames(title: string, ticker: string, companyName: string): boolean {
  const t = title.toLowerCase();
  if (ticker && t.includes(ticker.toLowerCase())) return true;
  /* The first word of the name carries the identity — "Apple Inc." is found by
     "apple", and matching the whole string would miss almost every headline. */
  const first = companyName.trim().split(/\s+/)[0]?.toLowerCase() ?? "";
  return first.length >= 3 && t.includes(first);
}

/**
 * How much this article is about `ticker`.
 *
 * Order matters and is the design: age is disqualifying, an explicit mention
 * marker beats everything else the article might look like, a concrete fact
 * rescues a story from a wide tag list, and only then does breadth decide.
 */
export function relevanceOf(
  article: {
    title: string;
    tickers: readonly string[] | null;
    reasoning: string | null;
    publishedMs: number;
  },
  ticker: string,
  companyName: string,
  nowMs: number,
): Relevance {
  const ageDays = (nowMs - article.publishedMs) / 86_400_000;
  if (!Number.isFinite(ageDays) || ageDays > MAX_AGE_DAYS) {
    return { score: 0, verdict: "stale" };
  }

  const reasoning = (article.reasoning ?? "").toLowerCase();
  const tags = article.tickers?.length ?? 0;
  const named = titleNames(article.title ?? "", ticker, companyName);

  /* Breadth, as a nudge rather than a verdict. */
  let score = 0.5;
  if (tags <= 1) score += 0.3;
  else if (tags <= 3) score += 0.15;
  else if (tags <= 4) score += 0;
  else if (tags <= 6) score -= 0.15;
  else score -= 0.3;

  if (named) score += 0.15;

  const specific =
    HAS_MOVE.test(reasoning) || SPECIFIC_MARKERS.some((m) => reasoning.includes(m));
  if (specific) score += 0.15;

  /* The provider told us it is incidental. Nothing else it looks like matters,
     and no amount of freshness promotes it — a mention must never outrank real
     coverage, which is the whole failure this module was written for. */
  if (MENTION_MARKERS.some((m) => reasoning.includes(m))) {
    return { score: Math.min(clamp01(score), 0.15), verdict: "mention" };
  }

  /* A concrete fact survives its own breadth: the eleven-ticker wrap that
     reports the move and its cause is the story, not the noise. */
  if (specific) return { score: clamp01(score), verdict: "coverage" };

  if (tags >= ROUNDUP_TAGS) return { score: clamp01(score), verdict: "roundup" };

  return { score: clamp01(score), verdict: "coverage" };
}
