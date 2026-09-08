import { test } from "node:test";
import assert from "node:assert/strict";
import {
  assertNoTrackGap,
  marqueeSeamDrift,
  marqueeTrackWidth,
} from "../lib/motion.ts";

/* The tape is a list rendered twice and translated by -50% forever. That only
   loops invisibly if half the track is exactly the distance from one item to
   its own duplicate. Spacing decides whether it is.

   Put the spacing on the item as `margin-inline-end` and every cell occupies
   `width + spacing`, so N cells occupy N*(width+spacing) and half the track
   lands precisely on the duplicate. Put it on the track as `gap` and N cells
   have only N-1 gaps between them — the seam between the two halves picks up a
   gap the arithmetic did not budget for, and the tape twitches once per cycle.

   The numbers below are what that costs, and `assertNoTrackGap` is what stops
   a page reintroducing it with a Tailwind utility. */

const CASES = [
  { count: 1, itemWidth: 208, spacing: 12 },
  { count: 2, itemWidth: 208, spacing: 12 },
  { count: 7, itemWidth: 208, spacing: 12 },
  { count: 24, itemWidth: 96.5, spacing: 3 },
];

test("spacing on the item closes the loop exactly", () => {
  for (const c of CASES) {
    assert.equal(
      marqueeSeamDrift({ ...c, mode: "margin" }),
      0,
      `${c.count} cells drifted`,
    );
  }
});

test("spacing on the track leaves the tape short every single cycle", () => {
  for (const c of CASES) {
    const drift = marqueeSeamDrift({ ...c, mode: "gap" });
    assert.notEqual(drift, 0, `${c.count} cells somehow closed`);
    // Half a gap, every cycle, forever — small enough to pass review and large
    // enough to see.
    assert.equal(drift, c.spacing / 2);
  }
});

test("the drift is the N versus N-1 mismatch, and nothing else", () => {
  const c = { count: 7, itemWidth: 208, spacing: 12 };
  // A margin track budgets N spacings per half.
  assert.equal(marqueeTrackWidth({ ...c, mode: "margin" }), 2 * 7 * (208 + 12));
  // A gap track lays 2N-1 gaps across the whole thing, not 2N.
  assert.equal(marqueeTrackWidth({ ...c, mode: "gap" }), 2 * 7 * 208 + 13 * 12);
  assert.equal(
    marqueeTrackWidth({ ...c, mode: "margin" }) - marqueeTrackWidth({ ...c, mode: "gap" }),
    12,
    "one whole gap is the entire difference",
  );
});

test("a one-cell tape is still a tape, and still has to close", () => {
  assert.equal(marqueeSeamDrift({ count: 1, itemWidth: 100, spacing: 40, mode: "margin" }), 0);
  assert.equal(marqueeSeamDrift({ count: 1, itemWidth: 100, spacing: 40, mode: "gap" }), 20);
});

test("zero spacing is the one case where gap is harmless — and still not allowed", () => {
  /* Worth recording because it is how the bug hides: someone tests with no
     spacing, sees a clean loop, and adds `gap-3` later. */
  assert.equal(marqueeSeamDrift({ count: 5, itemWidth: 100, spacing: 0, mode: "gap" }), 0);
});

test("a Tailwind gap utility reaching the track is refused", () => {
  assert.throws(() => assertNoTrackGap({ className: "flex gap-4" }), /gap/);
  assert.throws(() => assertNoTrackGap({ className: "flex md:gap-6" }), /gap/);
  assert.throws(() => assertNoTrackGap({ className: "gap-x-2" }), /gap/);
  assert.throws(() => assertNoTrackGap({ className: "gap-[12px]" }), /gap/);
});

test("space-x is a gap wearing a different name", () => {
  assert.throws(() => assertNoTrackGap({ className: "flex space-x-4" }), /space-x/);
});

test("an inline gap is refused too — the guard is not about class names", () => {
  assert.throws(() => assertNoTrackGap({ style: { gap: 12 } }), /gap/);
  assert.throws(() => assertNoTrackGap({ style: { columnGap: "1rem" } }), /gap/i);
});

test("classes that merely contain the letters gap are left alone", () => {
  assert.doesNotThrow(() => assertNoTrackGap({ className: "gap-analysis-panel ungapped" }));
  assert.doesNotThrow(() => assertNoTrackGap({ className: "flex w-max items-baseline" }));
  assert.doesNotThrow(() => assertNoTrackGap({}));
});

test("row-gap is allowed: the tape is one row, so it can never reach the seam", () => {
  assert.doesNotThrow(() => assertNoTrackGap({ className: "gap-y-2" }));
  assert.doesNotThrow(() => assertNoTrackGap({ style: { rowGap: 8 } }));
});
