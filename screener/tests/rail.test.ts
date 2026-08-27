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
