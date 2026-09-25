import { test } from "node:test";
import assert from "node:assert/strict";
import { toWireItems } from "../lib/api/normalize/wire.ts";
import { CALENDAR_TICKERS, WIRE_TICKERS } from "../lib/market/universe.ts";
import type { RawTickerNews } from "../lib/api/clients/fundamentals.ts";

/* There is no market-wide news endpoint and no earnings calendar on this
   account, so both rail cards are built by asking individual companies about
   themselves. That only reads as a wire if the sample is wide enough and no
   single company is allowed to fill it. */

const NOW = Date.UTC(2026, 7, 21, 12, 0, 0);

const article = (id: string, ticker: string, hoursAgo: number): RawTickerNews =>
  ({
    id,
    title: `${id} headline`,
    description: "",
    article_url: `https://example.com/${id}`,
    image_url: null,
    author: null,
    published_utc: new Date(NOW - hoursAgo * 3_600_000).toISOString(),
    keywords: null,
    tickers: [ticker],
    publisher: { name: "Publisher", homepage_url: null, logo_url: null, favicon_url: null },
    insights: null,
  }) as RawTickerNews;

test("the samples are wide enough to read as a market rather than a watchlist", () => {
  assert.ok(WIRE_TICKERS.length >= 30, `wire sample is only ${WIRE_TICKERS.length}`);
  assert.ok(CALENDAR_TICKERS.length >= 30, `calendar sample is only ${CALENDAR_TICKERS.length}`);
  assert.equal(new Set(WIRE_TICKERS).size, WIRE_TICKERS.length, "wire list repeats a ticker");
  assert.equal(new Set(CALENDAR_TICKERS).size, CALENDAR_TICKERS.length, "calendar list repeats");
});

test("one company cannot fill the wire", () => {
  /* Widening the sample makes this worse, not better: a big company answers
     with a dozen of its own stories and, being freshest, wins every slot. */
  const hog = Array.from({ length: 12 }, (_, i) => article(`aapl-${i}`, "AAPL", i * 0.1));
  const others = ["MSFT", "JPM", "XOM", "WMT"].map((t, i) => article(`o-${t}`, t, 5 + i));

  const items = toWireItems(
    [{ ticker: "AAPL", news: hog }, ...others.map((n, i) => ({ ticker: ["MSFT", "JPM", "XOM", "WMT"][i], news: [n] }))],
    NOW,
    8,
  );

  const fromApple = items.filter((i) => i.ticker === "AAPL").length;
  assert.ok(fromApple <= 3, `Apple supplied ${fromApple} of ${items.length} rail items`);
  assert.ok(new Set(items.map((i) => i.ticker)).size >= 3, "the rail is one company deep");
});

test("the same article reaching us under several tickers appears once", () => {
  // Polygon attaches one story to every ticker it mentions.
  const shared = article("shared-1", "AAPL", 1);
  const items = toWireItems(
    [
      { ticker: "AAPL", news: [shared] },
      { ticker: "MSFT", news: [shared] },
      { ticker: "GOOGL", news: [shared] },
    ],
    NOW,
    8,
  );
  assert.equal(items.length, 1);
  assert.equal(items[0].ticker, "AAPL", "credited to the ticker it was fetched under");
});

test("the rail runs freshest first", () => {
  const items = toWireItems(
    [
      { ticker: "AAPL", news: [article("old", "AAPL", 20)] },
      { ticker: "MSFT", news: [article("new", "MSFT", 1)] },
    ],
    NOW,
    8,
  );
  assert.deepEqual(items.map((i) => i.id), ["new", "old"]);
});

/* ------------------------------------------------------------------ */
/* Relevance                                                           */
/* ------------------------------------------------------------------ */

/* The provider tags an article with every ticker it names, and this module
   used to treat the tag as coverage. Apple's page carried a Vanguard ETF
   comparison, a Magnificent-Seven rebalancing note and a market wrap — three
   headlines, not one about Apple.

   lib/api/normalize/relevance.ts reads the per-ticker `sentiment_reasoning`
   the feed already sends and that this module was discarding. Filtering and
   ranking now run through it. */

const withInsight = (
  id: string,
  ticker: string,
  hoursAgo: number,
  reasoning: string,
  tags: string[] = [ticker],
): RawTickerNews =>
  ({
    ...article(id, ticker, hoursAgo),
    tickers: tags,
    insights: [{ ticker, sentiment: "neutral", sentiment_reasoning: reasoning }],
  }) as RawTickerNews;

test("an article that only mentions the company never reaches the rail", () => {
  const items = toWireItems(
    [
      {
        ticker: "AAPL",
        news: [
          withInsight("etf", "AAPL", 1, "Apple is mentioned only as a top holding in both ETFs", [
            "SCHB", "AAPL", "MSFT", "NVDA",
          ]),
          withInsight("real", "AAPL", 9, "Apple announced a CEO transition"),
        ],
      },
    ],
    NOW,
    8,
  );

  assert.deepEqual(items.map((i) => i.id), ["real"], "the mention should be gone");
});

/* Recency alone put the weakest surviving item first: on NVDA's page a Vistra
   story led purely because it was three hours newer. */
test("the rail leads with the most relevant story, not merely the newest", () => {
  const items = toWireItems(
    [
      {
        ticker: "NVDA",
        news: [
          withInsight("wide", "NVDA", 1, "Acknowledged as a major AI winner", [
            "A", "B", "C", "D", "E", "F", "NVDA",
          ]),
          withInsight("focused", "NVDA", 10, "NVIDIA raised guidance for the quarter"),
        ],
      },
    ],
    NOW,
    8,
  );

  assert.equal(items[0]?.id, "focused", "a focused story must outrank a fresher roundup");
});

test("a story past the staleness bound is not news", () => {
  const items = toWireItems(
    [{ ticker: "AAPL", news: [withInsight("old", "AAPL", 24 * 30, "Apple announced a CEO transition")] }],
    NOW,
    8,
  );
  assert.deepEqual(items, []);
});

/* An empty rail is the honest answer when nothing qualifies. Backfilling with
   the roundups we just rejected would undo the whole point. */
test("a company with no coverage yields nothing rather than filler", () => {
  const items = toWireItems(
    [
      {
        ticker: "TSLA",
        news: [
          withInsight("f1", "TSLA", 1, "trading share barely moved, indicating minimal market impact", ["A","B","TSLA"]),
          withInsight("f2", "TSLA", 2, "Apple is mentioned only as a top holding", ["A","B","TSLA"]),
        ],
      },
    ],
    NOW,
    8,
  );
  assert.deepEqual(items, []);
});

/* ------------------------------------------------------------------ */
/* One card per story, in the page's language                          */
/* ------------------------------------------------------------------ */

/* The id check catches one article filed under several tickers. It could not
   catch one story under two ids: on 25 Sep 2026 "Earnings Outlook Remains
   Upbeat: A Closer Look" filled two GOOGL cards back to back. */
test("the same story under two ids appears once", () => {
  const a = { ...article("g-1", "GOOGL", 17), title: "Earnings Outlook Remains Upbeat: A Closer Look" };
  const b = { ...article("g-2", "GOOGL", 17), title: "Earnings Outlook Remains Upbeat — A Closer Look" };
  const items = toWireItems([{ ticker: "GOOGL", news: [a, b] }], NOW, 8);
  assert.equal(items.length, 1);
});

test("the same address under two ids appears once", () => {
  const a = { ...article("u-1", "MSFT", 2), article_url: "https://example.com/story" };
  const b = { ...article("u-2", "JPM", 3), article_url: "https://example.com/story" };
  const items = toWireItems(
    [
      { ticker: "MSFT", news: [a] },
      { ticker: "JPM", news: [b] },
    ],
    NOW,
    8,
  );
  assert.equal(items.length, 1);
});

/* And Meta's Connect glasses story arrived twice the same morning, once in
   English and once as "EssilorLuxottica et Meta continuent…". */
test("a story in another language does not reach an English wire", () => {
  const english = {
    ...article("en", "META", 2),
    title: "Meta and EssilorLuxottica extend their smart-glasses partnership",
    description: "The companies said the deal runs for another decade as demand for the glasses grows.",
  };
  const french = {
    ...article("fr", "META", 2),
    title: "EssilorLuxottica et Meta continuent leur partenariat",
    description: "Le groupe franco-italien et Meta prolongent leur accord sur les lunettes connectées.",
  };
  const items = toWireItems([{ ticker: "META", news: [english, french] }], NOW, 8);
  assert.deepEqual(items.map((i) => i.id), ["en"]);
});

test("an English headline that borrows a foreign word is still English", () => {
  const story = {
    ...article("lv", "AAPL", 2),
    title: "Apple opens its Las Vegas store as Los Angeles sales slow",
    description: "",
  };
  assert.equal(toWireItems([{ ticker: "AAPL", news: [story] }], NOW, 8).length, 1);
});
