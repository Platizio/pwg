import assert from "node:assert/strict";
import test from "node:test";

import { toStockNews } from "../lib/api/normalize/stock-news.ts";
import type { RawArticle } from "../lib/api/clients/news.ts";
import type { WireItem } from "../lib/market/home.ts";

/* Three stories that actually bear on the stock.
 *
 * The market-data gateway bundles exactly three articles per ticker into its
 * fundamentals aggregate — no paging, no separate endpoint — and about two of
 * every three merely name the company. Three candidates cannot produce three
 * relevant stories, so a second source widens the pool and this module decides
 * what survives from both.
 *
 * Order matters: rank the union before the hygiene passes run, because both of
 * them keep the FIRST item they see. Sorting afterwards would let a duplicate's
 * weaker copy, or a prolific publisher's weaker story, win the slot.
 */

const NOW = Date.UTC(2026, 8, 2, 12, 0);
const HOURS = (n: number) => new Date(NOW - n * 3_600_000).toISOString();

const raw = (over: Partial<RawArticle> = {}): RawArticle =>
  ({
    uri: over.uri ?? "u1",
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

test("a relevant second-source article reaches the rail", () => {
  const out = toStockNews([], [raw()], "AAPL", NOW, 3);
  assert.equal(out.length, 1);
  assert.equal(out[0]?.title, "Apple Sets Pay Targets for Ternus");
  assert.equal(out[0]?.ticker, "AAPL");
});

test("an article that is not about the company never reaches the rail", () => {
  const out = toStockNews(
    [],
    [
      raw({
        uri: "junk",
        title: "Free Apple Valley vision screening serves 137 residents",
        concepts: [
          { label: { eng: "Apple Valley" }, score: 5 },
          { label: { eng: "Health care" }, score: 5 },
        ],
      }),
    ],
    "AAPL",
    NOW,
    3,
  );
  assert.deepEqual(out, []);
});

test("both sources feed one list", () => {
  const out = toStockNews([gatewayItem()], [raw()], "AAPL", NOW, 3);
  assert.equal(out.length, 2);
});

/* The whole point of merging: the union is ranked as one list, so a stronger
   second-source story leads a weaker gateway one. */
test("the strongest story leads, whichever source it came from", () => {
  const weakGateway = gatewayItem({ id: "weak", title: "Apple in a list of movers", relevance: 0.62 });
  const out = toStockNews([weakGateway], [raw({ uri: "strong" })], "AAPL", NOW, 3);
  assert.equal(out[0]?.id, "strong", "a 1.00 article must outrank a 0.62 one");
});

/* One wire story arriving from both sources is one story. */
test("the same headline from both sources appears once", () => {
  const out = toStockNews(
    [gatewayItem({ id: "g", title: "Apple Sets Pay Targets for Ternus" })],
    [raw({ uri: "n" })],
    "AAPL",
    NOW,
    3,
  );
  assert.equal(out.length, 1);
});

test("no single publisher may fill the rail", () => {
  const out = toStockNews(
    [],
    [
      raw({ uri: "a", title: "Apple story one" }),
      raw({ uri: "b", title: "Apple story two" }),
      raw({ uri: "c", title: "Apple story three" }),
    ],
    "AAPL",
    NOW,
    3,
  );
  assert.ok(out.length <= 2, `one publisher supplied ${out.length}`);
});

test("the rail is never longer than asked for", () => {
  const many = Array.from({ length: 12 }, (_, i) =>
    raw({ uri: `u${i}`, title: `Apple distinct story ${i}`, source: { uri: `s${i}`, title: `Source ${i}` } }),
  );
  assert.equal(toStockNews([], many, "AAPL", NOW, 3).length, 3);
});

test("no sources at all yields nothing rather than throwing", () => {
  assert.deepEqual(toStockNews([], [], "AAPL", NOW, 3), []);
});

test("a malformed article is skipped, not fatal", () => {
  const out = toStockNews(
    [],
    [
      raw({ uri: "bad", title: "", dateTimePub: "not a date" }),
      raw({ uri: "good", title: "Apple Sets Pay Targets for Ternus" }),
    ],
    "AAPL",
    NOW,
    3,
  );
  assert.deepEqual(out.map((o) => o.id), ["good"]);
});

test("every item carries what the rail renders", () => {
  const [item] = toStockNews([], [raw()], "AAPL", NOW, 3);
  assert.ok(item);
  for (const key of ["id", "source", "title", "url", "ticker", "company", "mark", "color", "time", "tag"] as const) {
    assert.ok(item[key] !== undefined && item[key] !== null, `${key} is missing`);
  }
  assert.ok(Number.isFinite(item.age), "age must be sortable");
});

/* ------------------------------------------------------------------ */
/* Market impact                                                       */
/* ------------------------------------------------------------------ */

/* Relevance answers "is this about the company". It is necessary and it is not
   sufficient: once it was working, Apple's rail carried "Apple Maps Renames
   Lake Ontario To Lake America" — unimpeachably about Apple, and worth nothing
   to somebody deciding whether to hold the stock.

   So the rank is relevance AND impact together. Both are 0..1 and both count,
   which is what lets a perfectly-relevant piece of trivia lose its slot to a
   slightly-less-relevant earnings story. */

test("a market-moving story outranks equally relevant trivia", () => {
  const out = toStockNews(
    [],
    [
      raw({ uri: "trivia", title: "Apple Maps Renames Lake Ontario To Lake America",
            source: { uri: "a", title: "Source A" } }),
      raw({ uri: "moving", title: "Apple beats Q3 revenue estimates and lifts guidance",
            source: { uri: "b", title: "Source B" } }),
    ],
    "AAPL",
    NOW,
    3,
  );
  assert.equal(out[0]?.id, "moving", "earnings must lead a map rename");
});

/* Still a weight, not a gate. A quietly covered company whose only coverage is
   product news must not fall back to an empty rail — Tesla had already been
   there once when relevance alone was too strict. */
test("trivia still fills a slot when nothing better exists", () => {
  const out = toStockNews(
    [],
    [raw({ uri: "trivia", title: "Apple Maps Renames Lake Ontario To Lake America" })],
    "AAPL",
    NOW,
    3,
  );
  assert.equal(out.length, 1, "an empty rail is worse than a thin one");
});

test("every item reports the impact it was ranked on", () => {
  const [item] = toStockNews([], [raw({ title: "Apple lifts full-year guidance" })], "AAPL", NOW, 3);
  assert.ok(item);
  assert.ok(typeof item.impact === "number" && item.impact >= 0 && item.impact <= 1);
  assert.equal(item.impactKind, "earnings");
});
