import { test } from "node:test";
import assert from "node:assert/strict";
import {
  SCENE_OFFSETS,
  edgeFraction,
  offsetScrollTime,
  sceneOffset,
} from "../lib/motion.ts";

/* Fifteen marketing pages are about to start writing `useScroll` offsets. Left
   alone that becomes fifteen private vocabularies — "start end" here, "start
   0.8" there, nobody able to say whether two sections animate on the same beat.
   These four names are the whole vocabulary, and this file is what stops a
   fifth being added by accident.

   The ordering assertions use `offsetScrollTime`, which places an edge on a
   one-dimensional scroll axis so "opens before it closes" is a thing a test can
   actually check rather than a thing a reviewer has to picture. */

const HEIGHTS = [0.5, 1, 1.6, 3];

test("the scene vocabulary is four names, and only four", () => {
  assert.deepEqual(Object.keys(SCENE_OFFSETS).sort(), ["enter", "exit", "pin", "through"]);
});

test("every preset is a pair of edges, never a bare string", () => {
  for (const [name, offset] of Object.entries(SCENE_OFFSETS)) {
    assert.ok(Array.isArray(offset), `${name} is not a tuple`);
    assert.equal(offset.length, 2, `${name} needs exactly a start and an end`);
    for (const edge of offset) {
      assert.equal(typeof edge, "string");
      assert.equal(edge.trim().split(/\s+/).length, 2, `${edge} is not "<target> <container>"`);
    }
  }
});

test("every preset opens before it closes", () => {
  for (const [name, [from, to]] of Object.entries(SCENE_OFFSETS)) {
    /* `pin` is the one preset written for an element at least a viewport tall;
       its own test below covers that. */
    const heights = name === "pin" ? HEIGHTS.filter((h) => h > 1) : HEIGHTS;
    for (const h of heights) {
      assert.ok(
        offsetScrollTime(from, h) < offsetScrollTime(to, h),
        `${name} at height ${h} closes at or before it opens`,
      );
    }
  }
});

test("pin is the one preset that asks its element to be a viewport tall", () => {
  const [from, to] = SCENE_OFFSETS.pin;
  // Shorter than the viewport and the window inverts — there is no pass to track.
  assert.ok(offsetScrollTime(from, 0.6) > offsetScrollTime(to, 0.6));
  assert.ok(offsetScrollTime(from, 1.4) < offsetScrollTime(to, 1.4));
});

test("through is the widest window — every other preset happens inside it", () => {
  for (const h of HEIGHTS) {
    const open = offsetScrollTime(SCENE_OFFSETS.through[0], h);
    const close = offsetScrollTime(SCENE_OFFSETS.through[1], h);
    for (const [name, [from, to]] of Object.entries(SCENE_OFFSETS)) {
      assert.ok(offsetScrollTime(from, h) >= open, `${name} opens before through does`);
      assert.ok(offsetScrollTime(to, h) <= close, `${name} closes after through does`);
    }
  }
});

test("enter finishes while the element is still arriving, exit starts once it is leaving", () => {
  const h = 1;
  // enter is done before the element's top passes the middle of the viewport.
  assert.ok(offsetScrollTime(SCENE_OFFSETS.enter[1], h) < offsetScrollTime(SCENE_OFFSETS.exit[0], h));
});

test("edgeFraction reads the four spellings the presets are written in", () => {
  assert.equal(edgeFraction("start"), 0);
  assert.equal(edgeFraction("center"), 0.5);
  assert.equal(edgeFraction("end"), 1);
  assert.equal(edgeFraction("0.72"), 0.72);
  assert.equal(edgeFraction("40%"), 0.4);
});

test("a pixel edge is refused rather than guessed at", () => {
  /* motion accepts "100px", but a pixel is not a fraction of anything, so it
     has no place on the scalar axis these presets are compared on. Silently
     reading it as 100 would put the edge a hundred viewports away. */
  assert.throws(() => edgeFraction("100px"), /px/);
  assert.throws(() => edgeFraction("middle"), /middle/);
});

test("sceneOffset hands back the named preset", () => {
  assert.deepEqual(sceneOffset("through"), SCENE_OFFSETS.through);
});

test("the vocabulary cannot be edited in place by the page that borrows it", () => {
  /* A page mutating the shared tuple would silently re-time every other page. */
  assert.ok(Object.isFrozen(SCENE_OFFSETS));
  assert.ok(Object.isFrozen(SCENE_OFFSETS.through));
});
