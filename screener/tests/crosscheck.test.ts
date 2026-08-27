import { test } from "node:test";
import assert from "node:assert/strict";
import { compareQuote } from "../lib/api/crosscheck.ts";

/* The gateway's own numbers are internally consistent, which proves nothing
   about whether they are right. These are the errors that consistency cannot
   catch: a scale mistake, a stale price, a symbol that resolved to the wrong
   company. */

test("accepts prices that agree within tolerance", () => {
  const r = compareQuote("AAPL", 311.56, 311.9, 2);
  assert.equal(r.ok, true);
  assert.ok(Math.abs(r.diffPct) < 0.2, `diffPct was ${r.diffPct}`);
});

test("catches a hundredfold scale error", () => {
  // The exact shape of reading a percent as a fraction, or millions as units.
  const r = compareQuote("AAPL", 3.1156, 311.56, 2);
  assert.equal(r.ok, false);
});

test("catches a price that has drifted far from the independent source", () => {
  const r = compareQuote("AAPL", 250, 311.56, 2);
  assert.equal(r.ok, false);
});

test("reports rather than throws when the independent source has no price", () => {
  const r = compareQuote("AAPL", 311.56, null, 2);
  assert.equal(r.ok, false);
  assert.equal(r.theirs, null);
  assert.match(r.note, /no independent/i);
});
