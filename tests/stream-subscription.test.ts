import test from "node:test";
import assert from "node:assert/strict";

import {
  MAX_SYMBOLS,
  capped,
  diffSubscription,
  normalise,
  unionOf,
} from "../lib/api/stream/subscription.ts";

/* The arithmetic of an additive subscription.
 *
 * The browser used to open one EventSource per symbol SET: the URL carried the
 * sorted union of everything on the page, so navigating to a stock page — one
 * more symbol — produced a new union, a new URL, a new connection, and an empty
 * tick map until the new connection's snapshot landed. Every navigation made
 * every price on the terminal visibly fall back to the server's figure.
 *
 * Now one connection lives for the life of the page and the filter is edited in
 * place. These are the pure pieces of that: what a symbol list looks like once
 * cleaned, what changed between two of them, and where the cap bites.
 */

test("normalise trims, uppercases, drops empties, dedupes and sorts", () => {
  assert.deepEqual(
    normalise([" nvda", "AAPL", "", "aapl ", "   ", "Msft"]),
    ["AAPL", "MSFT", "NVDA"],
  );
});

test("normalise of nothing is nothing", () => {
  assert.deepEqual(normalise([]), []);
});

test("diff names what to add and what to remove, both sorted", () => {
  const { add, remove } = diffSubscription(new Set(["AAPL", "TSLA", "NVDA"]), ["nvda", "msft", "amd"]);
  assert.deepEqual(add, ["AMD", "MSFT"]);
  assert.deepEqual(remove, ["AAPL", "TSLA"]);
});

test("an unchanged set yields two empty lists", () => {
  /* The provider fires a request only when one of these is non-empty, so a
     spurious entry here is a spurious round trip on every re-render. */
  const { add, remove } = diffSubscription(new Set(["AAPL", "NVDA"]), ["nvda", " aapl", "AAPL"]);
  assert.deepEqual(add, []);
  assert.deepEqual(remove, []);
});

test("diff from nothing adds everything, diff to nothing removes everything", () => {
  assert.deepEqual(diffSubscription(new Set(), ["b", "a"]), { add: ["A", "B"], remove: [] });
  assert.deepEqual(diffSubscription(new Set(["A", "B"]), []), { add: [], remove: ["A", "B"] });
});

test("capped keeps the first N and counts the rest", () => {
  const list = Array.from({ length: 10 }, (_, i) => `S${i}`);
  const { kept, dropped } = capped(list, 4);
  assert.deepEqual(kept, ["S0", "S1", "S2", "S3"]);
  assert.equal(dropped, 6);
});

test("capped under the limit drops nothing", () => {
  const list = ["AAPL", "NVDA"];
  const { kept, dropped } = capped(list, 4);
  assert.deepEqual(kept, list);
  assert.equal(dropped, 0);
});

test("the default cap is MAX_SYMBOLS, sized for a real page", () => {
  /* 64 once silently dropped TSLA from a 77-symbol dashboard. */
  assert.equal(MAX_SYMBOLS, 256);
  const many = Array.from({ length: MAX_SYMBOLS + 44 }, (_, i) => `S${i}`);
  const { kept, dropped } = capped(many);
  assert.equal(kept.length, MAX_SYMBOLS);
  assert.equal(dropped, 44);
});

test("unionOf merges every registered list into one normalised set", () => {
  const registry = new Map<number, readonly string[]>([
    [1, ["aapl", "NVDA"]],
    [2, ["nvda", " tsla "]],
    [3, []],
  ]);
  assert.deepEqual(unionOf(registry), ["AAPL", "NVDA", "TSLA"]);
});

test("unionOf an empty registry is empty", () => {
  assert.deepEqual(unionOf(new Map()), []);
});
