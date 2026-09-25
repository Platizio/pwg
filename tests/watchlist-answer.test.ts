import assert from "node:assert/strict";
import test from "node:test";

import {
  compose,
  createWatchQuotes,
  serverTiming,
  sortedKey,
  TtlCache,
  within,
  type WatchQuotesOptions,
} from "../app/api/quotes/watchlist/answer.ts";

/* The rules behind /api/quotes/watchlist's speed, held where a test can reach
 * them. The route took 10,981 ms on production because nothing on its path
 * had a budget; these are the promises that replaced that:
 *
 *   - the store's rows are read into the process once, not parsed per request;
 *   - the same names in any order are one answer and one gateway call;
 *   - a slow upstream costs the names it owes, never the whole response, and
 *     the flight it was on still finishes and fills the cache;
 *   - a failure is "ask again", never remembered as "no quote".
 */

type Row = { s: string; px: number };
const row = (s: string, px = 100): Row => ({ s, px });

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** An engine over fakes that count what they were asked. */
function harness(over: Partial<WatchQuotesOptions<Row>> & { hot?: string[] } = {}) {
  const calls = { index: 0, gateway: [] as string[][] };
  const hot = new Map((over.hot ?? ["AAPL", "MSFT", "NVDA"]).map((s) => [s, row(s)]));
  const engine = createWatchQuotes<Row>({
    loadIndex: async () => {
      calls.index += 1;
      return hot;
    },
    fetchGap: async (symbols) => {
      calls.gateway.push(symbols);
      return new Map(symbols.filter((s) => s !== "NOQUOTE").map((s) => [s, row(s, 5)]));
    },
    budgetMs: 200,
    storeWaitMs: 50,
    ...over,
  });
  return { engine, calls };
}

/* ---------- the pieces ---------- */

test("the key ignores order and duplicates", () => {
  assert.equal(sortedKey(["MSFT", "AAPL", "MSFT"]), "AAPL,MSFT");
  assert.equal(sortedKey(["AAPL", "MSFT"]), sortedKey(["MSFT", "AAPL"]));
});

test("within: the work's value when it beats the budget, a miss when it does not", async () => {
  assert.deepEqual(await within(Promise.resolve(7), 50), { done: true, value: 7 });
  const slow = deferred<number>();
  const t = Date.now();
  assert.deepEqual(await within(slow.promise, 30), { done: false });
  assert.ok(Date.now() - t < 200, "gave up at the budget, not later");
  /* A rejection is nothing usable, the same as running out of time. */
  assert.deepEqual(await within(Promise.reject(new Error("boom")), 50), { done: false });
  slow.resolve(1);
});

test("TtlCache: an entry lives for its TTL and the ceiling evicts expired, then oldest", () => {
  const cache = new TtlCache<number>(2);
  cache.set("a", 1, 100, 0);
  assert.equal(cache.get("a", 99), 1);
  assert.equal(cache.get("a", 100), undefined, "expired at exactly its TTL");

  cache.set("a", 1, 100, 0);
  cache.set("b", 2, 1_000, 0);
  cache.set("c", 3, 1_000, 150); // at the ceiling: "a" has expired and goes first
  assert.equal(cache.get("b", 150), 2);
  assert.equal(cache.get("c", 150), 3);

  cache.set("d", 4, 1_000, 200); // nothing expired: the oldest write goes
  assert.equal(cache.get("b", 200), undefined);
  assert.equal(cache.get("c", 200), 3);
  assert.equal(cache.get("d", 200), 4);
  assert.equal(cache.size, 2);
});

test("compose keeps the asked order and tells 'no quote' from 'not answered'", () => {
  const known = new Map<string, Row | null>([
    ["MSFT", row("MSFT")],
    ["AAPL", row("AAPL")],
    ["NOQUOTE", null],
  ]);
  const out = compose(["AAPL", "SLOW", "NOQUOTE", "MSFT"], known);
  assert.deepEqual(out.rows.map((r) => r.s), ["AAPL", "MSFT"]);
  assert.deepEqual(out.missing, ["NOQUOTE"]);
  assert.deepEqual(out.pending, ["SLOW"]);
});

/* ---------- the engine ---------- */

test("names the store holds are answered from it, without the gateway", async () => {
  const { engine, calls } = harness();
  const a = await engine.answer(["NVDA", "AAPL"]);
  assert.deepEqual(a.rows.map((r) => r.s), ["NVDA", "AAPL"], "in the order asked");
  assert.deepEqual(a.pending, []);
  assert.equal(a.source, "upstream");
  assert.equal(calls.gateway.length, 0);
  assert.equal(calls.index, 1);
});

test("only the gap goes to the gateway, sorted, and 'no quote' is an answer", async () => {
  const { engine, calls } = harness();
  const a = await engine.answer(["ZETA", "AAPL", "NOQUOTE", "BETA"]);
  assert.deepEqual(calls.gateway, [["BETA", "NOQUOTE", "ZETA"]]);
  assert.deepEqual(a.rows.map((r) => r.s), ["ZETA", "AAPL", "BETA"]);
  assert.deepEqual(a.missing, ["NOQUOTE"]);
  assert.deepEqual(a.pending, []);
});

test("the same names in another order are the cached answer: no upstream at all", async () => {
  const { engine, calls } = harness();
  await engine.answer(["ZETA", "AAPL"]);
  const again = await engine.answer(["AAPL", "ZETA", "ZETA"]);
  assert.equal(again.source, "cache");
  assert.deepEqual(again.rows.map((r) => r.s), ["AAPL", "ZETA"], "still in the order asked");
  assert.equal(calls.gateway.length, 1);
  assert.equal(calls.index, 1);
});

test("the store is read into the process once per window, not once per request", async () => {
  let now = 0;
  const { engine, calls } = harness({ now: () => now, indexFreshMs: 60_000, answerTtlMs: 1 });
  await engine.answer(["AAPL"]);
  now = 10;
  await engine.answer(["MSFT"]);
  now = 59_000;
  await engine.answer(["NVDA"]);
  assert.equal(calls.index, 1);

  /* Past the window: the stale rows answer at once while one rebuild runs. */
  now = 61_000;
  const stale = await engine.answer(["AAPL", "MSFT"]);
  assert.deepEqual(stale.pending, []);
  assert.equal(calls.index, 2);
});

test("identical questions in flight share one gateway call", async () => {
  const gate = deferred<void>();
  const { engine, calls } = harness({
    fetchGap: async (symbols) => {
      calls.gateway.push(symbols);
      await gate.promise;
      return new Map(symbols.map((s) => [s, row(s)]));
    },
  });
  const first = engine.answer(["ZETA"]);
  const second = engine.answer(["ZETA"]);
  gate.resolve();
  const [a, b] = await Promise.all([first, second]);
  assert.equal(calls.gateway.length, 1);
  assert.deepEqual(a.rows.map((r) => r.s), ["ZETA"]);
  assert.deepEqual(b.rows.map((r) => r.s), ["ZETA"]);
});

test("a slow gateway costs its own names, never the response", async () => {
  const gate = deferred<void>();
  const { engine, calls } = harness({
    budgetMs: 60,
    fetchGap: async (symbols) => {
      calls.gateway.push(symbols);
      await gate.promise;
      return new Map(symbols.map((s) => [s, row(s, 7)]));
    },
  });

  const t = Date.now();
  const partial = await engine.answer(["AAPL", "ZETA"]);
  assert.ok(Date.now() - t < 500, `answered at the budget (${Date.now() - t}ms)`);
  assert.equal(partial.source, "budget");
  assert.deepEqual(partial.rows.map((r) => r.s), ["AAPL"], "the store's name is there");
  assert.deepEqual(partial.pending, ["ZETA"], "the gateway's name is owed, not 'no quote'");
  assert.deepEqual(partial.missing, []);
  assert.equal(partial.gatewaySymbols, 1);
  assert.equal(partial.gatewayMs, null);

  /* The flight was not cancelled: it lands, and the next ask is the cache. */
  gate.resolve();
  await sleep(10);
  const later = await engine.answer(["ZETA", "AAPL"]);
  assert.equal(later.source, "cache");
  assert.deepEqual(later.rows.map((r) => [r.s, r.px]), [
    ["ZETA", 7],
    ["AAPL", 100],
  ]);
  assert.equal(calls.gateway.length, 1, "one gateway call in total");
});

test("a failed gateway call is pending and is asked again, never cached", async () => {
  let fail = true;
  const { engine, calls } = harness({
    fetchGap: async (symbols) => {
      calls.gateway.push(symbols);
      return fail ? null : new Map(symbols.map((s) => [s, row(s)]));
    },
  });
  const a = await engine.answer(["AAPL", "ZETA"]);
  assert.deepEqual(a.pending, ["ZETA"]);
  assert.deepEqual(a.missing, []);
  assert.equal(a.source, "upstream");

  fail = false;
  const b = await engine.answer(["AAPL", "ZETA"]);
  assert.deepEqual(b.pending, []);
  assert.deepEqual(b.rows.map((r) => r.s), ["AAPL", "ZETA"]);
  assert.equal(calls.gateway.length, 2);
});

test("a gateway that throws is a failure, not a crash", async () => {
  const { engine } = harness({
    fetchGap: async () => {
      throw new Error("socket hang up");
    },
  });
  const a = await engine.answer(["AAPL", "ZETA"]);
  assert.deepEqual(a.rows.map((r) => r.s), ["AAPL"]);
  assert.deepEqual(a.pending, ["ZETA"]);
});

test("a cold store gets a short wait, then the gateway answers for everything", async () => {
  const store = deferred<ReadonlyMap<string, Row> | null>();
  const calls = { index: 0, gateway: [] as string[][] };
  const engine = createWatchQuotes<Row>({
    loadIndex: () => {
      calls.index += 1;
      return store.promise;
    },
    fetchGap: async (symbols) => {
      calls.gateway.push(symbols);
      return new Map(symbols.map((s) => [s, row(s, 9)]));
    },
    budgetMs: 500,
    storeWaitMs: 30,
    answerTtlMs: 1,
  });

  const t = Date.now();
  const cold = await engine.answer(["MSFT", "AAPL"]);
  assert.ok(Date.now() - t < 400, "did not wait out the store");
  assert.deepEqual(calls.gateway, [["AAPL", "MSFT"]]);
  assert.deepEqual(cold.pending, []);
  assert.ok((cold.storeMs ?? 0) >= 25, "the store had its wait");

  /* The store read kept going; once it lands, it is the source again. */
  store.resolve(new Map([["AAPL", row("AAPL")], ["MSFT", row("MSFT")]]));
  await sleep(10);
  const warm = await engine.answer(["AAPL", "MSFT"]);
  assert.deepEqual(warm.rows.map((r) => r.px), [100, 100]);
  assert.equal(calls.gateway.length, 1);
  assert.equal(calls.index, 1);
});

test("nothing in hand at the budget is an empty, fully pending answer", async () => {
  const never = new Promise<never>(() => {});
  const engine = createWatchQuotes<Row>({
    loadIndex: () => never,
    fetchGap: () => never,
    budgetMs: 40,
    storeWaitMs: 10,
  });
  const a = await engine.answer(["AAPL", "ZETA"]);
  assert.equal(a.source, "budget");
  assert.deepEqual(a.rows, []);
  assert.deepEqual(a.pending, ["AAPL", "ZETA"]);
});

test("a store that failed is left alone for the retry window", async () => {
  let now = 0;
  const calls = { index: 0, gateway: 0 };
  const engine = createWatchQuotes<Row>({
    loadIndex: async () => {
      calls.index += 1;
      return null;
    },
    fetchGap: async (symbols) => {
      calls.gateway += 1;
      return new Map(symbols.map((s) => [s, row(s)]));
    },
    now: () => now,
    indexRetryMs: 15_000,
    answerTtlMs: 1,
  });
  await engine.answer(["AAPL"]);
  now = 5_000;
  await engine.answer(["MSFT"]);
  assert.equal(calls.index, 1, "not asked again inside the window");
  now = 16_000;
  await engine.answer(["NVDA"]);
  assert.equal(calls.index, 2);
  assert.equal(calls.gateway, 3, "the gateway covered every ask meanwhile");
});

test("an answer is reused only for its TTL", async () => {
  let now = 0;
  const { engine, calls } = harness({ now: () => now, answerTtlMs: 30_000 });
  await engine.answer(["ZETA"]);
  now = 29_999;
  assert.equal((await engine.answer(["ZETA"])).source, "cache");
  now = 30_000;
  assert.equal((await engine.answer(["ZETA"])).source, "upstream");
  assert.equal(calls.gateway.length, 2);
});

test("Server-Timing says where the time went", () => {
  const base = { rows: [], missing: [], pending: [], gatewaySymbols: 0 };
  assert.equal(
    serverTiming({ ...base, source: "cache", storeMs: null, gatewayMs: null }, 1),
    'answer;desc="cache", total;dur=1',
  );
  assert.equal(
    serverTiming({ ...base, source: "upstream", storeMs: 0, gatewayMs: 812, gatewaySymbols: 3 }, 815),
    'answer;desc="upstream", store;dur=0, gateway;dur=812;desc="3 asked", total;dur=815',
  );
  assert.equal(
    serverTiming({ ...base, source: "budget", storeMs: 2, gatewayMs: null, gatewaySymbols: 2 }, 1_501),
    'answer;desc="budget", store;dur=2, gateway;desc="2 asked, no answer yet", total;dur=1501',
  );
});
