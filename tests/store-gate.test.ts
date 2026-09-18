import assert from "node:assert/strict";
import test from "node:test";

import { STORE_READ_LIMIT, gateStats, gated, resetStoreGate } from "../lib/market/store/gate.ts";
import { readInstrumentRaw, readSectionsRaw } from "../lib/market/store/client.ts";

/* What the gate is for, and what would happen without it.
 *
 * The refresher marked every instrument entry stale at the same instant, all
 * ~500 prerendered pages began regenerating together, and each one opened its
 * own connection to a database whose max_connections is 60. Every read then
 * timed out at the client's ceiling — measured at 8,165ms for reads that take
 * 0.27-0.72s when they are the only one asking.
 *
 * Two independent mistakes are in that sentence and this module fixes both, so
 * they are tested apart. Five hundred pages asking five hundred different
 * questions must QUEUE. Five hundred pages asking the SAME question — which is
 * exactly what the shared SPY history read is — must ask it once.
 */

const CONFIG = { url: "https://example.supabase.co", key: "test-key" };

/** A promise plus the handle to settle it from the test body. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

test.beforeEach(() => resetStoreGate());

/* ---------- single flight ---------- */

test("two identical reads in flight share one request", async () => {
  let calls = 0;
  const gate = deferred<string>();
  const run = () => {
    calls += 1;
    return gate.promise;
  };

  const first = gated("market_instrument NVO", run);
  const second = gated("market_instrument NVO", run);

  gate.resolve("one answer");

  assert.deepEqual(await Promise.all([first, second]), ["one answer", "one answer"]);
  assert.equal(calls, 1, "the second caller must join the first request, not issue a second");
});

test("two different reads do not share a request", async () => {
  const seen: string[] = [];
  const run = (key: string) => async () => {
    seen.push(key);
    return key;
  };

  await Promise.all([gated("a", run("a")), gated("b", run("b"))]);

  assert.deepEqual(seen.sort(), ["a", "b"]);
});

/* The flight is a way of sharing an answer that is still on its way, not a
   cache. Caching lives one layer up in reads.ts, where it is tagged and has a
   TTL; a key held here after its answer arrived would serve a price for as
   long as the process lived. */
test("a key is released the moment its answer arrives", async () => {
  let calls = 0;
  const run = async () => {
    calls += 1;
    return calls;
  };

  assert.equal(await gated("k", run), 1);
  assert.equal(await gated("k", run), 2);
});

test("a rejected flight is released too, so the next caller may retry", async () => {
  let calls = 0;
  const run = async () => {
    calls += 1;
    throw new Error("store is down");
  };

  await assert.rejects(gated("k", run), /store is down/);
  await assert.rejects(gated("k", run), /store is down/);
  assert.equal(calls, 2);
});

test("a rejection reaches every caller that joined the flight", async () => {
  const gate = deferred<string>();
  const first = gated("k", () => gate.promise);
  const second = gated("k", () => gate.promise);

  gate.reject(new Error("store is down"));

  await assert.rejects(first, /store is down/);
  await assert.rejects(second, /store is down/);
});

/* ---------- the concurrency ceiling ---------- */

test("no more than the limit are in flight at once", async () => {
  let active = 0;
  let peak = 0;
  const run = async () => {
    active += 1;
    peak = Math.max(peak, active);
    await new Promise((r) => setTimeout(r, 1));
    active -= 1;
  };

  await Promise.all(Array.from({ length: 40 }, (_, i) => gated(`sym-${i}`, run)));

  assert.equal(peak, STORE_READ_LIMIT);
  assert.ok(STORE_READ_LIMIT < 60, "the limit must sit far below Postgres max_connections");
});

test("every queued read eventually runs", async () => {
  const done: number[] = [];
  const run = (i: number) => async () => {
    await new Promise((r) => setTimeout(r, 1));
    done.push(i);
  };

  await Promise.all(Array.from({ length: 40 }, (_, i) => gated(`sym-${i}`, run(i))));

  assert.equal(done.length, 40);
});

/* A read that throws must hand its slot back, or a store outage empties the
   gate one permit at a time and the site stops reading at all. */
test("a failed read hands its slot back", async () => {
  const boom = async () => {
    throw new Error("nope");
  };
  await Promise.allSettled(
    Array.from({ length: STORE_READ_LIMIT * 2 }, (_, i) => gated(`boom-${i}`, boom)),
  );

  let ran = false;
  await gated("after", async () => {
    ran = true;
  });
  assert.equal(ran, true);
});

/* ---------- the client's read wrappers go through it ---------- */

test("two concurrent reads of the same symbol issue one POST", async () => {
  let posts = 0;
  const gate = deferred<void>();
  const fetchImpl = (async () => {
    posts += 1;
    await gate.promise;
    return new Response("null", { status: 200, headers: { "content-type": "application/json" } });
  }) as unknown as typeof fetch;

  const o = { fetchImpl, config: CONFIG };
  const both = Promise.all([readInstrumentRaw("NVO", o), readInstrumentRaw("NVO", o)]);
  gate.resolve();
  const [a, b] = await both;

  assert.equal(posts, 1, "the stampede's duplicate reads must collapse into one");
  assert.equal(a.ok, true);
  assert.equal(b.ok, true);
});

test("reads of different symbols are not collapsed", async () => {
  let posts = 0;
  const gate = deferred<void>();
  const fetchImpl = (async () => {
    posts += 1;
    await gate.promise;
    return new Response("null", { status: 200, headers: { "content-type": "application/json" } });
  }) as unknown as typeof fetch;

  const o = { fetchImpl, config: CONFIG };
  const both = Promise.all([readInstrumentRaw("NVO", o), readInstrumentRaw("BA", o)]);
  gate.resolve();
  await both;

  assert.equal(posts, 2);
});

/* The key is the question, not the caller: the same section for the same list
   of symbols is one read however many pages want it. This is the SPY history
   the instrument pages now share. */
test("the same section batch is one read however many pages ask", async () => {
  let posts = 0;
  const gate = deferred<void>();
  const fetchImpl = (async () => {
    posts += 1;
    await gate.promise;
    return new Response("[]", { status: 200, headers: { "content-type": "application/json" } });
  }) as unknown as typeof fetch;

  const o = { fetchImpl, config: CONFIG };
  const all = Promise.all(
    Array.from({ length: 12 }, () => readSectionsRaw(["SPY"], "history_daily", o)),
  );
  gate.resolve();
  await all;

  assert.equal(posts, 1);
});

/* ---------- observability ---------- */

/* An operator reading a deployed log has to be able to tell a gate that is
   queueing from a store that is slow, and the only place that distinction
   lives is inside this module. The stats are read at the moment a read gives
   up, so they have to be cheap and they have to be right while reads are in
   flight — not only after everything has settled. */
test("gateStats reports permits in use and callers queued while reads are in flight", async () => {
  const gates = Array.from({ length: STORE_READ_LIMIT + 2 }, () => deferred<string>());
  const flights = gates.map((g, i) => gated(`read ${i}`, () => g.promise));

  /* Every permit taken, two callers behind them. */
  assert.deepEqual(gateStats(), { active: STORE_READ_LIMIT, waiting: 2, limit: STORE_READ_LIMIT });

  gates[0].resolve("done");
  await flights[0];
  /* One permit handed straight to the first waiter: still full, one queued. */
  assert.deepEqual(gateStats(), { active: STORE_READ_LIMIT, waiting: 1, limit: STORE_READ_LIMIT });

  for (const g of gates.slice(1)) g.resolve("done");
  await Promise.all(flights);
  assert.deepEqual(gateStats(), { active: 0, waiting: 0, limit: STORE_READ_LIMIT });
});
