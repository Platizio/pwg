import assert from "node:assert/strict";
import test from "node:test";

import { toStockNews } from "../lib/api/normalize/stock-news.ts";
import type { RawArticle } from "../lib/api/clients/news.ts";
import type { WireItem } from "../lib/market/home.ts";

/* The invariant app/api/stock-news/[ticker] and use-stock-news.ts rest on.
 *
 * The wider news pool left the render — it was the last third-party call in
 * it, and 1 to 1.5 seconds of a cold page against 0.23-0.34s for the RPC that
 * fetches everything else. So the page is now drawn from the GATEWAY HALF
 * alone and the browser swaps the whole rail for the merged list a moment
 * later. The hook does not merge: it replaces.
 *
 * That replacement is only safe if the merged list is never a downgrade of the
 * rendered one, and "never a downgrade" is a claim about toStockNews rather
 * than about either of those two files. Neither of them can be reached by
 * `node --test` — the route imports next/cache through three modules, and the
 * hook is a client component — so this is the part of that wiring which can
 * actually be held to something, and it is the part that would take the rail
 * backwards if it were wrong.
 *
 * The merge itself is tested in stock-news.test.ts. What is new here is the
 * comparison BETWEEN the two calls: same gateway items, with and without a
 * wider pool.
 */

const NOW = Date.UTC(2026, 8, 2, 12, 0);
const HOURS = (n: number) => new Date(NOW - n * 3_600_000).toISOString();
const RAIL = 3;

const raw = (over: Partial<RawArticle> = {}): RawArticle =>
  ({
    uri: "u1",
    title: "Apple Sets Pay Targets for Ternus",
    body: null,
    url: "https://example.com/a",
    dateTimePub: HOURS(3),
    image: null,
    sentiment: null,
    lang: "eng",
    source: { uri: "s", title: "Reuters" },
    concepts: [{ label: { eng: "Apple Inc." }, score: 5 }],
    ...over,
  }) as RawArticle;

const gatewayItem = (over: Partial<WireItem> = {}): WireItem =>
  ({
    id: "g1",
    source: "The Motley Fool",
    title: "Apple announces a CEO transition",
    summary: "",
    url: "https://example.com/g",
    ticker: "AAPL",
    company: "Apple",
    mark: "A",
    color: "#E5DDD1",
    time: "5h ago",
    age: 5,
    tag: "Markets",
    sentiment: null,
    relevance: 0.8,
    ...over,
  }) as WireItem;

/** What the page renders: the gateway half, and nothing else. */
const rendered = (gateway: WireItem[]) => toStockNews(gateway, [], "AAPL", NOW, RAIL);

/** What the route answers, and what the rail swaps itself for. */
const merged = (gateway: WireItem[], articles: RawArticle[]) =>
  toStockNews(gateway, articles, "AAPL", NOW, RAIL);

test("the gateway half alone is a rail, not a special case", () => {
  /* The render's only remaining source. If an empty wider pool needed a guard
     at the call site in instrument-assemble.ts, this is where it would show:
     the items are ranked, deduped and capped among themselves exactly as they
     would be among a wider field. */
  const out = rendered([
    gatewayItem({ id: "a", title: "Apple announces a CEO transition", relevance: 0.9 }),
    gatewayItem({ id: "b", title: "Apple lifts full-year guidance", relevance: 0.6 }),
  ]);
  assert.equal(out.length, 2);
  assert.equal(out[0].id, "a", "the stronger story still leads with no second source");
});

test("a wider pool never shortens the rail the page already drew", () => {
  const gateway = [
    gatewayItem({ id: "a", title: "Apple announces a CEO transition", relevance: 0.9 }),
    gatewayItem({ id: "b", title: "Apple lifts full-year guidance", relevance: 0.55 }),
  ];
  /* Three ways the pool can interact with what is on screen at once: a story
     that outranks both, a syndicated copy of one of them, and another item
     from the publisher the gateway items already came from — which is the case
     that can evict a rendered row, because capPerSource allows two. */
  const articles = [
    raw({ uri: "n1", title: "Apple beats on iPhone revenue", concepts: [{ label: { eng: "Apple Inc." }, score: 9 }] }),
    raw({ uri: "n2", title: "Apple announces a CEO transition" }),
    raw({ uri: "n3", title: "Apple opens a new campus", source: { uri: "f", title: "The Motley Fool" } }),
  ];

  assert.ok(
    merged(gateway, articles).length >= rendered(gateway).length,
    "the swap may only ever make the rail richer",
  );
});

test("a pool that contributes nothing leaves the rendered rail exactly as it was", () => {
  /* The common failure: an exhausted lifetime allowance, a dead provider, or a
     page of coverage that is all about somebody else. The route still answers
     200 with the gateway half, and the hook is handed back precisely what it
     already had — a swap that changes no pixel rather than one that empties
     the rail and refills it. */
  const gateway = [
    gatewayItem({ id: "a", title: "Apple announces a CEO transition", relevance: 0.9 }),
    gatewayItem({ id: "b", title: "Apple lifts full-year guidance", relevance: 0.55 }),
  ];
  const irrelevant = [
    raw({ uri: "x", title: "Nissan halts exports to North America", concepts: null }),
  ];

  assert.deepEqual(merged(gateway, irrelevant), rendered(gateway));
});

test("an empty answer is discarded by the hook, so it may not be mistaken for a rail", () => {
  /* The one shape use-stock-news.ts refuses. A route that could not confirm
     the symbol knows LESS than the page does, and an empty list from it must
     not be allowed to wipe a rail the server already filled — so the hook
     drops it. This pins the shape that rule is written against: nothing from
     nothing is an empty array, not a throw and not a null. */
  assert.deepEqual(toStockNews([], [], "AAPL", NOW, RAIL), []);
});
