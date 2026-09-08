import assert from "node:assert/strict";
import test from "node:test";

import { notableMoves } from "../lib/market/instrument-derive.ts";
import type { InstrumentSnapshot } from "../lib/market/instrument.ts";

/* "Notable moves" must not invent one out of an unrepaired split.
 *
 * getInstrumentSnapshot already guards this: it publishes
 * `notableMoves: record.readable ? largestSessions(daily) : []`, so when the
 * corporate-actions call fails and a split therefore cannot be repaired, the
 * snapshot deliberately carries no moves.
 *
 * That guard reached nothing. right-rail.tsx and performance-panel.tsx both
 * call this derive-level notableMoves(), which recomputed the list from
 * `history.daily` — a series left unrepaired on purpose — so a missed 10:1
 * split still rendered as a "−90.00%" session on the page. Two implementations
 * of one list, and the UI happened to use the one without the guard.
 *
 * So this returns what the snapshot decided. One source of truth, and the guard
 * applies where a reader can actually see it.
 */

const snap = (over: Partial<InstrumentSnapshot>): InstrumentSnapshot =>
  ({
    history: {
      daily: [
        { at: Date.UTC(2026, 0, 2), price: 100 },
        /* A 10:1 split, unrepaired: a real −90% step that is not a market move. */
        { at: Date.UTC(2026, 0, 3), price: 10 },
        { at: Date.UTC(2026, 0, 4), price: 10.2 },
      ],
    },
    notableMoves: [],
    ...over,
  }) as unknown as InstrumentSnapshot;

test("an unrepairable split is never published as a notable move", () => {
  /* The snapshot withheld the list because the split record could not be read.
     Recomputing it here is exactly the bug. */
  assert.deepEqual(notableMoves(snap({ notableMoves: [] })), []);
});

test("the moves the snapshot published are the moves that render", () => {
  const moves = [
    { date: "January 3, 2026", chg: "−90.00%", color: "#e0796b" },
    { date: "January 4, 2026", chg: "+2.00%", color: "#7dd3a0" },
  ];
  assert.deepEqual(notableMoves(snap({ notableMoves: moves })), moves);
});

test("the count bound still applies", () => {
  const moves = [
    { date: "January 4, 2026", chg: "+2.00%", color: "#7dd3a0" },
    { date: "January 3, 2026", chg: "−1.00%", color: "#e0796b" },
    { date: "January 2, 2026", chg: "+0.50%", color: "#7dd3a0" },
    { date: "January 1, 2026", chg: "+0.25%", color: "#7dd3a0" },
  ];
  assert.equal(notableMoves(snap({ notableMoves: moves }), 3).length, 3);
});

test("a company with no notable moves renders none", () => {
  assert.deepEqual(notableMoves(snap({ notableMoves: [] }), 3), []);
});
