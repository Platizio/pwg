import assert from "node:assert/strict";
import test from "node:test";

import { eventTime, newestFirst } from "../components/dashboard/reading-order.ts";

/* How the terminal's reference lists read.

   The wire arrives ranked on relevance and impact — which is how its stories
   were chosen — but the pages that print it say "newest first" and "Latest
   news", and a list that runs 6d, 13d, 2d, 12h under those words reads as
   broken. And a corporate action's `time` is often a word rather than a time
   ("Ex-dividend"), which the title already says, so printing it again on the
   line where a time belongs repeats the title. */

const story = (id: string, age: number) => ({ id, age });

test("newestFirst puts the freshest story first", () => {
  const got = newestFirst([story("a", 144), story("b", 312), story("c", 48), story("d", 12)]);
  assert.deepEqual(
    got.map((s) => s.id),
    ["d", "c", "a", "b"],
  );
});

test("newestFirst keeps the incoming order between stories of the same age", () => {
  /* The feed's own rank breaks a tie, so two stories of one hour keep the
     order relevance gave them. */
  const got = newestFirst([story("x", 5), story("y", 5), story("z", 1)]);
  assert.deepEqual(
    got.map((s) => s.id),
    ["z", "x", "y"],
  );
});

test("newestFirst never reorders the array it was handed", () => {
  const input = [story("a", 10), story("b", 1)];
  newestFirst(input);
  assert.deepEqual(
    input.map((s) => s.id),
    ["a", "b"],
  );
});

test("eventTime withholds a time that only repeats the title", () => {
  assert.equal(eventTime({ title: "Medtronic · ex-dividend", time: "Ex-dividend" }), null);
});

test("eventTime keeps a real time", () => {
  assert.equal(
    eventTime({ title: "Apple · quarterly results", time: "After close" }),
    "After close",
  );
  assert.equal(eventTime({ title: "CPI, August", time: "08:30 ET" }), "08:30 ET");
});

test("eventTime treats an empty or blank time as absent", () => {
  assert.equal(eventTime({ title: "Split at Nvidia", time: "" }), null);
  assert.equal(eventTime({ title: "Split at Nvidia", time: "   " }), null);
});
