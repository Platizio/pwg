import test from "node:test";
import assert from "node:assert/strict";

import { parseFetchedRange } from "../lib/market/ranges.ts";

/* Which ranges this route will answer for, and — just as deliberately — which
 * it refuses.
 *
 * The page ships the range it opens with, 1Y of daily bars. 1M and 3M are
 * SLICES of that same year, already in the reader's hands, so answering them
 * here would spend a request on bars the client is holding: they are refused
 * rather than served, and the chart takes them from the snapshot.
 *
 * What is left is the three the page genuinely does not carry: the week and
 * the day, which come from the stored intraday sessions, and five years, which
 * is thirteen hundred bars nobody should download to look at a one-year chart.
 */

test("the ranges the page does not carry are served", () => {
  assert.equal(parseFetchedRange("1D"), "1D");
  assert.equal(parseFetchedRange("1W"), "1W");
  assert.equal(parseFetchedRange("5Y"), "5Y");
});

test("the ranges the page already carries are refused", () => {
  for (const shipped of ["1M", "3M", "1Y"]) {
    assert.equal(parseFetchedRange(shipped), null, `${shipped} is a slice of the shipped year`);
  }
});

test("anything that is not a range is refused rather than guessed", () => {
  for (const junk of ["2D", "", "../../etc", "1w", "5y", "ALL", "1D;drop"]) {
    assert.equal(parseFetchedRange(junk), null, `${JSON.stringify(junk)} is not a range`);
  }
});

test("an absent range is refused, not defaulted", () => {
  /* Defaulting would make a typo silently fetch something — and the something
     it fetched would be charted as though it were what was asked for. */
  assert.equal(parseFetchedRange(null), null);
  assert.equal(parseFetchedRange(undefined as unknown as string), null);
});
