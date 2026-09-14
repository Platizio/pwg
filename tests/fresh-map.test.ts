import test from "node:test";
import assert from "node:assert/strict";

import { freshTicks } from "../lib/market/fresh-map.ts";
import { TICK_MAX_AGE_MS, type Tick } from "../lib/api/stream/tick.ts";

/* Ageing the live buffer out, once, where it cannot be forgotten.
 *
 * live-provider's tick buffer never expires an entry — `buffer.set` and nothing
 * else. The server's isFresh gate only applies at ARRIVAL, so once the browser
 * holds a tick it holds it until the tab closes.
 *
 * The remedy was wired into exactly one consumer. price-header pairs useNow()
 * with liveness() and correctly falls back to the REST price. The other six —
 * ticker-tape, sidebar, sector-view, popular-ribbon, market-card, dashboard —
 * contain no useNow, no isFresh and no read of tick.at at all. So after a feed
 * outage the header reads "Delayed" over the snapshot price while the tape
 * directly beneath it keeps printing the frozen live one, with no badge.
 *
 * Two prices for one symbol on one screen is worse than either of them alone.
 */

const t = (symbol: string, at: number): Tick => ({
  symbol, price: 100, previousClose: 99, change: 1, changePercent: 1.01, volume: 1, at,
});

const NOW = 1_760_000_000_000;

test("a stale tick is dropped so a surface falls back to the server figure", () => {
  const map = new Map([
    ["AAPL", t("AAPL", NOW - 3_000)],
    ["NVDA", t("NVDA", NOW - 20 * 60_000)],
  ]);
  const out = freshTicks(map, NOW);
  assert.ok(out.has("AAPL"));
  assert.ok(!out.has("NVDA"), "a twenty-minute-old tick must not still be on screen");
});

test("the source map is never mutated", () => {
  /* It is React state. Mutating it in place would leave consumers reading a
     map that changed without a render. */
  const map = new Map([["NVDA", t("NVDA", NOW - 20 * 60_000)]]);
  freshTicks(map, NOW);
  assert.equal(map.size, 1, "the caller's map must be left alone");
});

test("when nothing is stale the SAME map comes back", () => {
  /* Identity matters: this runs off a 30-second clock, and returning a fresh
     Map every tick would re-render every live surface for no reason. */
  const map = new Map([["AAPL", t("AAPL", NOW - 1_000)]]);
  assert.equal(freshTicks(map, NOW), map);
});

test("the boundary matches the rest of the system exactly", () => {
  /* One predicate decides this everywhere — the server at arrival, the header's
     badge, and now the buffer. A second threshold would eventually disagree,
     and the disagreement would be a tape showing a price the header calls
     delayed. */
  const edge = new Map([["A", t("A", NOW - TICK_MAX_AGE_MS)]]);
  assert.ok(freshTicks(edge, NOW).has("A"), "exactly at the limit is still fresh");

  const past = new Map([["A", t("A", NOW - TICK_MAX_AGE_MS - 1)]]);
  assert.ok(!freshTicks(past, NOW).has("A"), "one millisecond past is not");
});

test("an empty map returns an empty map, never undefined", () => {
  /* Every consumer calls .get() on this. */
  const out = freshTicks(new Map(), NOW);
  assert.equal(out.size, 0);
  assert.equal(out.get("AAPL"), undefined);
});
