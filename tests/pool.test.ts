import test from "node:test";
import assert from "node:assert/strict";

import { pooled } from "../lib/api/pool.ts";

/* The sweep used to run its chunks in waves: fire N, await all N, fire the
   next N. A wave costs whatever its slowest member costs, so one slow quote
   call stalled the seven behind it. These tests pin the property that fixes
   it — a worker takes the next item the moment it is free — because that is
   the whole reason this module exists and it is invisible in a timing test. */

/** Yield long enough for every pending microtask and timer-zero to drain. */
async function settleEventLoop(ticks = 5): Promise<void> {
  for (let i = 0; i < ticks; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

test("a slow task does not block the tasks queued behind it", async () => {
  let releaseSlow: () => void = () => {};
  const slow = new Promise<string>((resolve) => {
    releaseSlow = () => resolve("slow");
  });

  const finished: number[] = [];

  const run = pooled([0, 1, 2, 3], 2, async (i) => {
    if (i === 0) return slow;
    finished.push(i);
    return `fast-${i}`;
  });

  await settleEventLoop();

  /* With a wave of two, item 1 would be stuck in the same wave as item 0 and
     items 2 and 3 would not have started at all. */
  assert.deepEqual(finished, [1, 2, 3], "items behind a stalled one must still run");

  releaseSlow();
  const results = await run;
  assert.equal(results.length, 4);
});

test("never runs more than the limit at once", async () => {
  let inFlight = 0;
  let peak = 0;

  await pooled(Array.from({ length: 20 }, (_, i) => i), 4, async () => {
    inFlight += 1;
    peak = Math.max(peak, inFlight);
    await new Promise((resolve) => setTimeout(resolve, 5));
    inFlight -= 1;
    return null;
  });

  assert.equal(peak, 4, `expected at most 4 concurrent, saw ${peak}`);
});

test("results come back in input order, and one failure does not sink the rest", async () => {
  const results = await pooled([0, 1, 2], 2, async (i) => {
    if (i === 1) throw new Error("boom");
    return i * 10;
  });

  assert.equal(results[0].status, "fulfilled");
  assert.equal(results[1].status, "rejected");
  assert.equal(results[2].status, "fulfilled");
  assert.equal(results[0].status === "fulfilled" ? results[0].value : null, 0);
  assert.equal(results[2].status === "fulfilled" ? results[2].value : null, 20);
});

test("a limit wider than the work, and no work at all, are both fine", async () => {
  assert.deepEqual(await pooled([], 8, async () => 1), []);

  const results = await pooled([1, 2], 99, async (n) => n);
  assert.equal(results.length, 2);
  assert.equal(results[0].status === "fulfilled" ? results[0].value : null, 1);
});

test("a limit below one still makes progress rather than hanging", async () => {
  const results = await pooled([1, 2, 3], 0, async (n) => n * 2);
  assert.equal(results.length, 3);
  assert.equal(results[2].status === "fulfilled" ? results[2].value : null, 6);
});
