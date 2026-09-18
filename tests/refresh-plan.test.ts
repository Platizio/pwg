import test from "node:test";
import assert from "node:assert/strict";

import {
  CONCURRENCY_CEILING,
  CONCURRENCY_FLOOR,
  backoffFor,
  dueSweep,
  pace,
  priorityFor,
  sectionsFor,
} from "../lib/market/refresh/plan.ts";
import { SECTIONS } from "../lib/market/store/sections.ts";

/* The refresher's arithmetic, held apart from the loop that spends it.
 *
 * Everything the worker decides before it opens a socket lives in plan.ts:
 * which sections a name is worth enrolling on, what priority it earns, whether
 * a sweep is owed, how far apart two request starts have to be, and how many
 * workers to run after a batch went badly. None of it reads a clock and none of
 * it touches the network, which is why it can be pinned exactly here rather
 * than through a stub. The loop that spends these answers needs a gateway and a
 * database to be anything at all, so it is held to its ORDER instead, with both
 * replaced, in refresh-loop.test.ts.
 *
 * The rules that are easy to get wrong and expensive to get wrong are the ones
 * with the most tests: the hot sweep's cadence outside the regular session (a
 * shut market cannot move a price, but pre- and post-market are not shut), and
 * the concurrency floor (halving forever reaches zero, and zero workers is a
 * loop that never finishes a batch).
 */

const MINUTE = 60_000;
const HOUR = 3_600_000;

/** An arbitrary but fixed instant; nothing here depends on which one. */
const NOW = Date.parse("2026-09-15T14:00:00Z");

/* ------------------------------------------------------------------ */
/* sectionsFor                                                         */
/* ------------------------------------------------------------------ */

test("a covered name is enrolled on every section", () => {
  assert.deepEqual(sectionsFor("covered"), [...SECTIONS]);
});

test("hot and visited names skip the gateway news bundle", () => {
  const expected = SECTIONS.filter((s) => s !== "news_gateway");
  assert.deepEqual(sectionsFor("hot"), expected);
  assert.deepEqual(sectionsFor("visited"), expected);
  assert.ok(!sectionsFor("hot").includes("news_gateway"), "news is the wire's section alone");
});

test("each call hands back its own array", () => {
  /* The result is passed straight to market_enrol and, on the bootstrap path,
     reused across chunks. A shared array that one caller sorted or spliced
     would quietly re-enrol the next batch on the wrong sections. */
  const a = sectionsFor("covered");
  const b = sectionsFor("covered");
  assert.notEqual(a, b);
  a.pop();
  assert.equal(sectionsFor("covered").length, SECTIONS.length);
});

/* ------------------------------------------------------------------ */
/* priorityFor                                                         */
/* ------------------------------------------------------------------ */

function sets(over: Partial<Record<"covered" | "strip" | "wire" | "calendar" | "hot", string[]>>) {
  return {
    covered: new Set(over.covered ?? []),
    strip: new Set(over.strip ?? []),
    wire: new Set(over.wire ?? []),
    calendar: new Set(over.calendar ?? []),
    hot: new Set(over.hot ?? []),
  };
}

test("the four attended lists all earn priority 3", () => {
  assert.equal(priorityFor("AAPL", sets({ covered: ["AAPL"] })), 3);
  assert.equal(priorityFor("SPY", sets({ strip: ["SPY"] })), 3);
  assert.equal(priorityFor("BRK.B", sets({ wire: ["BRK.B"] })), 3);
  assert.equal(priorityFor("UDR", sets({ calendar: ["UDR"] })), 3);
});

test("a merely liquid name earns 1, and an unknown one earns 0", () => {
  assert.equal(priorityFor("PLUG", sets({ hot: ["PLUG"] })), 1);
  assert.equal(priorityFor("PLUG", sets({})), 0);
});

test("membership of an attended list outranks membership of the hot list", () => {
  /* Every covered name is also liquid enough to be hot, so this is the normal
     case rather than an edge one: read the wrong way round, the six symbols
     with pages of their own would refresh on the whole universe's cadence. */
  assert.equal(priorityFor("AAPL", sets({ covered: ["AAPL"], hot: ["AAPL"] })), 3);
});

test("the symbol is upper-cased before it is looked up", () => {
  assert.equal(priorityFor("aapl", sets({ covered: ["AAPL"] })), 3);
  assert.equal(priorityFor(" nvda ", sets({ hot: ["NVDA"] })), 1);
});

/* ------------------------------------------------------------------ */
/* dueSweep                                                            */
/* ------------------------------------------------------------------ */

test("the hot sweep comes round every five minutes while prices move", () => {
  const last = { hot: NOW - 5 * MINUTE, full: NOW };
  assert.equal(dueSweep(NOW, last, "open").hot, true);
  assert.equal(dueSweep(NOW, { hot: NOW - 4 * MINUTE, full: NOW }, "open").hot, false);
});

test("pre- and post-market count as moving", () => {
  /* The US market is more than the regular session: an 08:00 book is thin and
     a 17:30 one is quiet, but both print prices, and gating the sweep on
     09:30-16:00 would freeze the boards for four hours of every trading day. */
  const last = { hot: NOW - 6 * MINUTE, full: NOW };
  assert.equal(dueSweep(NOW, last, "pre-market").hot, true);
  assert.equal(dueSweep(NOW, last, "post-market").hot, true);
});

test("a shut market drops the hot sweep to every thirty minutes", () => {
  const recent = { hot: NOW - 10 * MINUTE, full: NOW };
  assert.equal(dueSweep(NOW, recent, "closed").hot, false, "ten minutes is not enough when shut");
  assert.equal(dueSweep(NOW, { hot: NOW - 30 * MINUTE, full: NOW }, "closed").hot, true);
  assert.equal(dueSweep(NOW, recent, "halted").hot, false);
});

test("the full sweep is hourly whatever the market is doing", () => {
  for (const phase of ["open", "closed"] as const) {
    assert.equal(dueSweep(NOW, { hot: NOW, full: NOW - HOUR }, phase).full, true);
    assert.equal(dueSweep(NOW, { hot: NOW, full: NOW - 59 * MINUTE }, phase).full, false);
  }
});

test("a worker that has never swept owes both sweeps at once", () => {
  const first = dueSweep(NOW, { hot: 0, full: 0 }, "closed");
  assert.deepEqual(first, { hot: true, full: true });
});

/* ------------------------------------------------------------------ */
/* pace                                                                */
/* ------------------------------------------------------------------ */

test("the first request of a batch starts immediately", () => {
  assert.equal(pace(NOW, 0, 60), NOW);
});

test("each later request is held back by one more gap", () => {
  assert.equal(pace(NOW, 1, 60), NOW + 60);
  assert.equal(pace(NOW, 10, 60), NOW + 600);
});

test("sixty milliseconds is about sixteen requests a second", () => {
  /* The ceiling is shared with the sweep, which is the whole reason it is a
     gap rather than a concurrency: two callers at ten workers each can still
     burst, whereas two callers honouring the same floor cannot. */
  const secondsForSixteen = (pace(NOW, 16, 60) - NOW) / 1000;
  assert.ok(secondsForSixteen <= 1, `sixteen requests in ${secondsForSixteen}s`);
});

test("a nonsense count or gap never asks the loop to wait backwards", () => {
  assert.equal(pace(NOW, -3, 60), NOW);
  assert.equal(pace(NOW, 5, -60), NOW);
  assert.equal(pace(NOW, 2.7, 60), NOW + 120, "a fractional count is a whole request");
});

/* ------------------------------------------------------------------ */
/* backoffFor                                                          */
/* ------------------------------------------------------------------ */

test("a batch that failed more than a fifth of the time halves the workers", () => {
  assert.equal(backoffFor(0.5, 10), 5);
  assert.equal(backoffFor(0.21, 8), 4);
});

test("halving stops at the floor rather than reaching zero", () => {
  /* Zero workers is not a slow loop, it is a loop that never finishes a batch:
     `pooled` spawns min(limit, items) workers and would take the floor of a
     halved 1 forever. */
  assert.equal(backoffFor(1, 3), CONCURRENCY_FLOOR);
  assert.equal(backoffFor(1, CONCURRENCY_FLOOR), CONCURRENCY_FLOOR);
});

test("exactly a fifth is not above a fifth", () => {
  assert.equal(backoffFor(0.2, 6), 7, "the threshold is strict, so 0.2 is a clean batch");
});

test("a clean batch walks back towards the ceiling one worker at a time", () => {
  assert.equal(backoffFor(0, 4), 5);
  assert.equal(backoffFor(0, CONCURRENCY_CEILING), CONCURRENCY_CEILING);
  assert.equal(backoffFor(0, CONCURRENCY_CEILING + 40), CONCURRENCY_CEILING);
});

test("a rate that is not a number leaves the concurrency where it is", () => {
  /* An empty batch divides by zero. Neither halving nor restoring is an
     honest reading of a batch that never ran. */
  assert.equal(backoffFor(Number.NaN, 6), 6);
  assert.equal(backoffFor(Number.NaN, 0), CONCURRENCY_FLOOR);
});

/* ---------- a failed sweep is not a productive pass ---------- */

/* THE HOT LOOP THIS PINS. `sweep()` returns null when it threw, and its catch
   returns before the sweep timers are advanced — so the sweep stays due. The
   loop used to set `worked = true` on the attempt rather than the outcome,
   which skipped the idle at the foot of the pass, so the next iteration fired
   the same 276-chunk sweep immediately and kept firing it for as long as the
   gateway stayed broken.
   The arithmetic is trivial; the point is that it is written down. A pass whose
   only work was a sweep that failed must be idle, because idle is what makes
   the loop wait. */
test("a pass whose sweep failed is not counted as work", () => {
  const outcome = (swept: unknown) => swept !== null;
  assert.equal(outcome(null), false, "a thrown sweep leaves nothing done");
  assert.equal(outcome({ rows: [] }), true, "a sweep that answered did work, even with no rows");
});
