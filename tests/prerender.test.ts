import test from "node:test";
import assert from "node:assert/strict";

import { PRERENDER_LIMIT, prerenderTickers } from "../lib/market/prerender.ts";

/* Which stock pages are built ahead of time.
 *
 * Six were, out of about 13,900. Everything else was assembled on the first
 * visit, and measured against production that costs 8-15 seconds: ADBE 7.7s,
 * CRM 15.0s, ORCL 30.7s — each of them 0.5s on every visit afterwards. A stock
 * page is roughly thirty upstream calls (profile, filings, five years of daily
 * history, three indicators, short interest, intraday, the benchmark, news, and
 * up to eight peers), and the websocket cannot help with any of it: it carries
 * prices, and only onto a page that already exists.
 *
 * So the list comes from the committed baseline — 3,000 rows of one real sweep,
 * already ordered by turnover. Reading it costs no network call at build time,
 * which matters more than it sounds: `next build` prerenders across nine worker
 * processes that do not share a cache, so anything derived live would be derived
 * nine times.
 */

const row = (s: string, px: number, avgVol: number) => ({ s, px, avgVol });

/* Descending turnover, as the committed file already is. */
const ROWS = [
  row("MU", 100, 10_000),
  row("SPY", 700, 1_000),
  row("QQQ", 600, 1_000),
  row("SNDK", 50, 5_000),
  row("TINY", 2, 10),
];

test("the covered names are always built, whatever their turnover", () => {
  /* The terminal leads with these. A reader arriving on the flagship ticker
     must never be the one who pays to build it. */
  const out = prerenderTickers({ covered: ["AAPL", "SPOT"], rows: ROWS, limit: 3 });
  assert.ok(out.includes("AAPL"));
  assert.ok(out.includes("SPOT"));
});

test("the rest are the most liquid names, most traded first", () => {
  const out = prerenderTickers({ covered: [], rows: ROWS, limit: 3 });
  assert.deepEqual(out, ["MU", "SPY", "QQQ"]);
});

test("the limit is honoured, because every extra page is build time and disk", () => {
  /* ~1.8 MB of build output each, and a per-page budget of 60 seconds. */
  assert.equal(prerenderTickers({ covered: [], rows: ROWS, limit: 2 }).length, 2);
  assert.equal(prerenderTickers({ covered: ["AAPL"], rows: ROWS, limit: 2 }).length, 2);
});

test("no symbol is built twice", () => {
  /* A covered name is also a liquid name, so it appears in both inputs.
     Prerendering it twice would be a duplicate route, not a faster page. */
  const out = prerenderTickers({ covered: ["SPY", "MU"], rows: ROWS, limit: 5 });
  assert.equal(new Set(out).size, out.length);
  assert.equal(out.filter((s) => s === "SPY").length, 1);
});

test("symbols are normalised, so one name cannot be built under two spellings", () => {
  const out = prerenderTickers({ covered: ["aapl"], rows: [row("spy", 700, 1_000)], limit: 5 });
  assert.deepEqual(out, ["AAPL", "SPY"]);
});

test("a skipped symbol is never built", () => {
  /* An exchange placeholder renders as a 404, and Next bakes that into the
     prerender — which is the exact bug that shipped "Stock not found" on all
     six covered tickers. Building 500 pages multiplies the chance of one
     slipping through the baseline, so the caller passes the same predicate the
     page itself uses. */
  const out = prerenderTickers({
    covered: [],
    rows: [row("ZVZZT", 10, 1_000_000), row("MU", 100, 10_000)],
    limit: 5,
    skip: (s) => s === "ZVZZT",
  });
  assert.deepEqual(out, ["MU"]);
});

test("a skipped symbol cannot sneak in through the covered list either", () => {
  const out = prerenderTickers({ covered: ["ZVZZT"], rows: ROWS, limit: 3, skip: (s) => s === "ZVZZT" });
  assert.ok(!out.includes("ZVZZT"));
});

test("an empty baseline still yields the covered names rather than nothing", () => {
  /* The committed file can be absent in a fresh checkout. Falling to zero
     prerendered pages would make every first visit pay, silently. */
  assert.deepEqual(prerenderTickers({ covered: ["AAPL"], rows: [], limit: 100 }), ["AAPL"]);
});

test("the default limit is sized for a build, not for a market", () => {
  /* 500 x ~1.8 MB is about 0.9 GB of output; 13,900 would be 25 GB and could
     never be kept warm anyway. */
  assert.ok(PRERENDER_LIMIT >= 100, "too few to change what a reader feels");
  assert.ok(PRERENDER_LIMIT <= 1_000, "too many for the build budget and the disk");
});
