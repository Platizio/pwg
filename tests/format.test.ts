import { test } from "node:test";
import assert from "node:assert/strict";
import { marketCap, ratio } from "../lib/market/format.ts";

test("market cap reads in the unit a column has room for", () => {
  assert.equal(marketCap(4_623_874_049_400), "$4.62T");
  assert.equal(marketCap(719_890_000_000), "$719.89B");
  assert.equal(marketCap(438_770_000), "$439M");
});

test("an absent figure is a dash, never a zero", () => {
  // A loss-making company has no P/E, and a zero would read as "free".
  assert.equal(marketCap(null), "—");
  assert.equal(marketCap(0), "—");
  assert.equal(ratio(null), "—");
  assert.equal(ratio(Number.NaN), "—");
  assert.equal(ratio(40.79), "40.79");
});
