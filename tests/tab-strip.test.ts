import { test } from "node:test";
import assert from "node:assert/strict";
import {
  edgeMask,
  overflowEdges,
  revealScrollLeft,
  stepTab,
} from "../components/terminal/tab-strip.ts";

test("arrows step one tab and wrap at both ends", () => {
  assert.equal(stepTab("ArrowRight", 0, 6), 1);
  assert.equal(stepTab("ArrowRight", 5, 6), 0);
  assert.equal(stepTab("ArrowLeft", 0, 6), 5);
  assert.equal(stepTab("ArrowLeft", 3, 6), 2);
});

test("Home and End jump to the first and last tab", () => {
  assert.equal(stepTab("Home", 4, 6), 0);
  assert.equal(stepTab("End", 1, 6), 5);
});

test("any other key is not the strip's to handle", () => {
  assert.equal(stepTab("ArrowDown", 2, 6), null);
  assert.equal(stepTab("Enter", 2, 6), null);
  assert.equal(stepTab("a", 2, 6), null);
});

test("an unknown current tab steps from the start", () => {
  assert.equal(stepTab("ArrowRight", -1, 6), 0);
  assert.equal(stepTab("ArrowLeft", -1, 6), 5);
});

test("a tab already clear of both fades needs no scroll", () => {
  const at = revealScrollLeft({
    scrollLeft: 0,
    viewport: 390,
    content: 800,
    start: 100,
    end: 200,
    margin: 32,
  });
  assert.equal(at, null);
});

test("a tab cut off on the right scrolls in to sit clear of the right fade", () => {
  // HOLDINGS at 700–790 in an 800px strip seen through 390px.
  const at = revealScrollLeft({
    scrollLeft: 0,
    viewport: 390,
    content: 800,
    start: 700,
    end: 790,
    margin: 32,
  });
  // 790 + 32 - 390 = 432, clamped to the 410px the strip can actually travel.
  assert.equal(at, 410);
});

test("a tab cut off on the left scrolls back to sit clear of the left fade", () => {
  const at = revealScrollLeft({
    scrollLeft: 300,
    viewport: 390,
    content: 800,
    start: 320,
    end: 420,
    margin: 32,
  });
  assert.equal(at, 288);
});

test("the first tab always returns the strip to its very start", () => {
  const at = revealScrollLeft({
    scrollLeft: 120,
    viewport: 390,
    content: 800,
    start: 0,
    end: 100,
    margin: 32,
  });
  assert.equal(at, 0);
});

test("a tab wider than the window aligns its start", () => {
  const at = revealScrollLeft({
    scrollLeft: 0,
    viewport: 100,
    content: 800,
    start: 300,
    end: 460,
    margin: 20,
  });
  assert.equal(at, 280);
});

test("edges report only the directions there is more to see", () => {
  assert.deepEqual(overflowEdges(0, 390, 390), { start: false, end: false });
  assert.deepEqual(overflowEdges(0, 390, 800), { start: false, end: true });
  assert.deepEqual(overflowEdges(200, 390, 800), { start: true, end: true });
  assert.deepEqual(overflowEdges(410, 390, 800), { start: true, end: false });
});

test("sub-pixel scroll positions do not light a fade", () => {
  // Zoomed displays report fractional scrollLeft at the true end.
  assert.deepEqual(overflowEdges(409.5, 390, 800), { start: true, end: false });
  assert.deepEqual(overflowEdges(0.4, 390, 800), { start: false, end: true });
});

test("no overflow means no mask at all", () => {
  assert.equal(edgeMask({ start: false, end: false }, 28), undefined);
});

test("the mask fades only the side that has more", () => {
  assert.equal(
    edgeMask({ start: false, end: true }, 28),
    "linear-gradient(to right, #000 0, #000 calc(100% - 28px), transparent 100%)",
  );
  assert.equal(
    edgeMask({ start: true, end: false }, 28),
    "linear-gradient(to right, transparent 0, #000 28px, #000 100%)",
  );
  assert.equal(
    edgeMask({ start: true, end: true }, 28),
    "linear-gradient(to right, transparent 0, #000 28px, #000 calc(100% - 28px), transparent 100%)",
  );
});

test("a bled strip fades from the gutter and hides the bleed", () => {
  // The strip runs 12px past the column each side; nothing may show there.
  assert.equal(
    edgeMask({ start: true, end: true }, 28, 12),
    "linear-gradient(to right, transparent 12px, #000 40px, #000 calc(100% - 40px), transparent calc(100% - 12px))",
  );
  // A side with nothing beyond it keeps its bleed, for the focus ring.
  assert.equal(
    edgeMask({ start: false, end: true }, 28, 12),
    "linear-gradient(to right, #000 0, #000 calc(100% - 40px), transparent calc(100% - 12px))",
  );
});
