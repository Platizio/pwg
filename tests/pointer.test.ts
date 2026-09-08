import assert from "node:assert/strict";
import test from "node:test";
import { pointerFraction } from "../lib/motion.ts";

/* The pointer, as a fraction of an element's box.
 *
 * The press ripple positions itself from this one number pair, so it is
 * computed once, here, where a test can reach it. */

const box = { left: 100, top: 50, width: 200, height: 40 };

test("the pointer at the box's top-left corner is 0%, 0%", () => {
  assert.deepEqual(pointerFraction(box, 100, 50), { x: 0, y: 0 });
});

test("the pointer at the centre is 50%, 50%", () => {
  assert.deepEqual(pointerFraction(box, 200, 70), { x: 50, y: 50 });
});

test("a zero-size box answers the centre rather than dividing by zero", () => {
  assert.deepEqual(pointerFraction({ left: 0, top: 0, width: 0, height: 0 }, 10, 10), { x: 50, y: 50 });
});

test("a pointer outside the box answers outside the range, so a caller can tell", () => {
  assert.deepEqual(pointerFraction(box, 80, 60), { x: -10, y: 25 });
});
