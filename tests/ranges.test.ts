import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_RANGE, RANGES, getRange } from "../lib/market/ranges.ts";

/* The range table decides which feed answers each button. It was briefly cut
   to three entries on the belief that the gateway served only 1m, 1y and 5y —
   it serves [num][w|m|y], and its intraday endpoint serves the day. */

test("every range the control offers has a source", () => {
  assert.equal(RANGES.length, 6);
  for (const r of RANGES) {
    assert.ok(r.label.length > 0, `${r.id} has no label`);
    assert.ok(r.source === "daily" || r.source === "intraday", `${r.id} has no source`);
  }
});

test("only the day comes from the intraday feed", () => {
  const intraday = RANGES.filter((r) => r.source === "intraday");
  assert.deepEqual(intraday.map((r) => r.id), ["1D"]);
  // Everything else is a slice of one daily pull, so none may carry its own call.
  assert.ok(RANGES.filter((r) => r.source === "daily").every((r) => r.id !== "1D"));
});

test("windows grow with the range, and the longest is unbounded", () => {
  const daily = RANGES.filter((r) => r.source === "daily");
  const sessions = daily.map((r) => r.sessions);
  assert.deepEqual(sessions, [5, 21, 64, 252, undefined], "1W 1M 3M 1Y then the whole series");
  const bounded = sessions.filter((n): n is number => n !== undefined);
  assert.deepEqual([...bounded].sort((a, b) => a - b), bounded, "windows must ascend");
});

test("the clock only shows on the range measured in minutes", () => {
  for (const r of RANGES) {
    assert.equal(r.intraday, r.source === "intraday", `${r.id} disagrees with its own source`);
  }
});

test("the default range is one that survives a closed market", () => {
  /* The day is the one range whose emptiness is a real state, so it must not
     be what a visitor lands on out of hours. */
  const def = getRange(DEFAULT_RANGE);
  assert.equal(def.source, "daily");
  assert.equal(def.id, DEFAULT_RANGE);
});

test("an unknown id falls back to a real range rather than undefined", () => {
  const r = getRange("nonsense");
  assert.ok(RANGES.some((x) => x.id === r.id));
});
