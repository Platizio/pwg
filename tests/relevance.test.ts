import assert from "node:assert/strict";
import test from "node:test";

import { relevanceOf, MAX_AGE_DAYS } from "../lib/api/normalize/relevance.ts";

/* Is this article ABOUT the company, or does it merely mention it?
 *
 * The provider tags an article with every ticker it names. The terminal treated
 * that tag as "this is coverage of X", so Apple's page carried a Vanguard ETF
 * comparison, a Magnificent-Seven rebalancing piece and a market wrap — three
 * headlines, none of them about Apple.
 *
 * The signal that separates the two was already being fetched and thrown away.
 * Every tag carries a `sentiment_reasoning` written per ticker, and it says
 * outright which kind of article this is:
 *
 *   "Apple is mentioned only as a top holding in both ETFs, serving as an
 *    example of the funds' composition rather than being [the subject]"
 *
 *   "neither praising nor criticizing NVIDIA specifically"
 *
 *   "NVIDIA's RTX Spark technology is central to ASUS's new flagship products"
 *
 * The fixtures below are real articles pulled from the live gateway, reasoning
 * text included verbatim. They are the specification.
 */

const NOW = Date.UTC(2026, 8, 2, 12, 0);
const HOURS = (n: number) => NOW - n * 3_600_000;
const DAYS = (n: number) => NOW - n * 86_400_000;

function article(over: Partial<Parameters<typeof relevanceOf>[0]> = {}) {
  return {
    title: "Some headline",
    tickers: ["AAPL"] as readonly string[] | null,
    reasoning: null as string | null,
    publishedMs: HOURS(6),
    ...over,
  };
}

/* ---------- mention-only: the whole reason this exists ---------- */

test("an article that only lists the company as an ETF holding is a mention", () => {
  const r = relevanceOf(
    article({
      title: "Better Total Stock Market ETF: Vanguard's VTI vs. Schwab's SCHB",
      tickers: ["SCHB", "AAPL", "MSFT", "NVDA"],
      reasoning:
        "Apple is mentioned only as a top holding in both ETFs (6.29% in VTI, 6.24% in SCHB), serving as an example of the funds' composition rather than being the subject",
    }),
    "AAPL",
    "Apple",
    NOW,
  );
  assert.equal(r.verdict, "mention");
});

test("an article that declines to say anything about the company is a mention", () => {
  const r = relevanceOf(
    article({
      title: "3 Lesser Discussed Stocks That Offer Meaningful AI Exposure",
      tickers: ["INOD", "AAOI", "CLS", "NVDA"],
      reasoning:
        "Acknowledged as a major AI winner but article focuses on alternative opportunities beyond mega-cap names, neither praising nor criticizing NVIDIA specifically",
    }),
    "NVDA",
    "Nvidia",
    NOW,
  );
  assert.equal(r.verdict, "mention");
});

/* ---------- breadth: a tag on ten names is a market wrap ---------- */

test("a ten-ticker roundup with nothing company-specific to say is a roundup", () => {
  const r = relevanceOf(
    article({
      title: "If the September Effect Hits Artificial Intelligence (AI) Stocks This Year",
      tickers: ["NVDA", "MSFT", "GOOG", "GOOGL", "GOOGM", "GOOGN", "AMZN", "AAPL", "META"],
      reasoning:
        "Part of Magnificent Seven with concentration risk concerns, but no specific performance data provided. Included in suggested rebalancing strategy.",
    }),
    "AAPL",
    "Apple",
    NOW,
  );
  assert.notEqual(r.verdict, "coverage");
});

/* ---------- real coverage survives ---------- */

test("an article built around the company is coverage", () => {
  const r = relevanceOf(
    article({
      title: "ASUS Showcases ProArt PCs Powered by NVIDIA RTX Spark at IFA 2026",
      tickers: ["NVDA"],
      reasoning:
        "NVIDIA's RTX Spark technology is central to ASUS's new flagship products, enabling high-performance local AI computing.",
    }),
    "NVDA",
    "Nvidia",
    NOW,
  );
  assert.equal(r.verdict, "coverage");
});

test("a two-ticker story naming the company in its title is coverage", () => {
  const r = relevanceOf(
    article({
      title: "Billionaire Stanley Druckenmiller Still Isn't Buying Nvidia",
      tickers: ["AMD", "NVDA"],
      reasoning: "Druckenmiller sold his entire Nvidia position due to rich valuations in 2024",
    }),
    "NVDA",
    "Nvidia",
    NOW,
  );
  assert.equal(r.verdict, "coverage");
});

/* ---------- the case the product owner actually asked for ----------
   "the news that says why the stock is going up down sideways".
   A market wrap tagged with eleven names, whose reasoning nonetheless carries
   a real move and a real cause, is exactly that story. Breadth must not bury
   it — the per-ticker reasoning is the finer signal and outranks the tag count. */

test("a wrap that states the move and its cause survives its own breadth", () => {
  const r = relevanceOf(
    article({
      title: "Stock Market Today, Sept. 1: Stocks Slide and Oil Surges Amid U.S.-Iran Tensions",
      tickers: ["PANW", "CRWD", "AXON", "MRNA", "AAPL", "GS", "GSpA", "GSpC", "GSpD"],
      reasoning:
        "Stock rose 2.61% despite market decline; leadership transition from Tim Cook to John Ternus as CEO is neutral corporate event",
    }),
    "AAPL",
    "Apple",
    NOW,
  );
  assert.equal(r.verdict, "coverage");
});

/* Found by running the real gateway feed through this module: a MEXC futures
   report tagged with thirteen names scored as coverage for Tesla because its
   reasoning contains the word "earnings" and two percentages. The sentence
   itself dismisses the company —

     "Major tech company with earnings during period but trading share barely
      moved from 2.6% to 2.7%, indicating minimal market impact relative to
      storage/memory stocks"

   A provider that tells us the impact was minimal is telling us this is not
   the company's story, and that has to outrank any keyword inside it. */
test("a reasoning that dismisses the company's role is a mention, keywords notwithstanding", () => {
  const r = relevanceOf(
    article({
      title: "MEXC Reports Storage and Memory Stock Futures Dominated Trading During August",
      tickers: ["A","B","C","D","E","F","G","H","I","J","K","L","TSLA"],
      reasoning:
        "Major tech company with earnings during period but trading share barely moved from 2.6% to 2.7%, indicating minimal market impact relative to storage/memory stocks",
    }),
    "TSLA",
    "Tesla",
    NOW,
  );
  assert.notEqual(r.verdict, "coverage");
});

/* ---------- ranking ---------- */

test("a focused story outranks a roundup", () => {
  const focused = relevanceOf(
    article({ title: "Nvidia lifts guidance", tickers: ["NVDA"], reasoning: "NVIDIA raised guidance" }),
    "NVDA", "Nvidia", NOW,
  );
  const wide = relevanceOf(
    article({ title: "Ten AI stocks to watch", tickers: ["A","B","C","D","E","F","G","NVDA"], reasoning: null }),
    "NVDA", "Nvidia", NOW,
  );
  assert.ok(focused.score > wide.score, `${focused.score} should beat ${wide.score}`);
});

test("a mention never outranks real coverage however fresh it is", () => {
  const mention = relevanceOf(
    article({
      title: "Best ETFs now",
      tickers: ["VOO", "AAPL"],
      reasoning: "Apple is mentioned only as a top holding",
      publishedMs: HOURS(1),
    }),
    "AAPL", "Apple", NOW,
  );
  const coverage = relevanceOf(
    article({ title: "Apple names new CEO", tickers: ["AAPL"], reasoning: "Apple announced a CEO transition", publishedMs: HOURS(20) }),
    "AAPL", "Apple", NOW,
  );
  assert.ok(coverage.score > mention.score);
});

/* ---------- staleness ---------- */

test("a story older than the bound is stale whatever it says", () => {
  const r = relevanceOf(
    article({
      title: "Apple names new CEO",
      tickers: ["AAPL"],
      reasoning: "Apple announced a CEO transition",
      publishedMs: DAYS(MAX_AGE_DAYS + 1),
    }),
    "AAPL", "Apple", NOW,
  );
  assert.equal(r.verdict, "stale");
});

test("a story inside the bound is judged on its content, not its age", () => {
  const r = relevanceOf(
    article({ title: "Apple names new CEO", tickers: ["AAPL"], reasoning: "Apple announced a CEO transition", publishedMs: DAYS(MAX_AGE_DAYS - 1) }),
    "AAPL", "Apple", NOW,
  );
  assert.equal(r.verdict, "coverage");
});

/* ---------- degenerate input never throws ---------- */

test("a missing reasoning falls back to the tag count rather than throwing", () => {
  assert.equal(relevanceOf(article({ tickers: ["AAPL"], reasoning: null }), "AAPL", "Apple", NOW).verdict, "coverage");
  assert.notEqual(
    relevanceOf(article({ tickers: ["A","B","C","D","E","F","G","H"], reasoning: null }), "AAPL", "Apple", NOW).verdict,
    "coverage",
  );
});

test("absent tags and empty text are survivable", () => {
  for (const a of [
    article({ tickers: null, reasoning: null, title: "" }),
    article({ tickers: [], reasoning: "" }),
  ]) {
    const r = relevanceOf(a, "AAPL", "Apple", NOW);
    assert.ok(r.score >= 0 && r.score <= 1, `score out of range: ${r.score}`);
    assert.ok(typeof r.verdict === "string");
  }
});

test("the score is always a finite number between nought and one", () => {
  const r = relevanceOf(article({ tickers: ["AAPL"], reasoning: "central to" }), "AAPL", "Apple", NOW);
  assert.ok(Number.isFinite(r.score) && r.score >= 0 && r.score <= 1);
});
