import { test } from "node:test";
import assert from "node:assert/strict";
import { isFlat, marketCap, pctOrFlat, ratio } from "../lib/market/format.ts";

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

/* A change that prints as nought has no direction. AAPL before the bell read
   a green, rising "+0.00%" in the watchlist: an up signal for no move. */
test("a change that rounds to nought is flat, and prints unsigned", () => {
  assert.equal(isFlat(0), true);
  assert.equal(isFlat(0.004), true);
  assert.equal(isFlat(-0.0049), true);
  assert.equal(isFlat(0.006), false);
  assert.equal(isFlat(0.04, 1), true, "at one place, 0.04 prints as 0.0");
  assert.equal(pctOrFlat(0.003), "0.00%");
  assert.equal(pctOrFlat(-0.003), "0.00%");
  assert.equal(pctOrFlat(0.26), "+0.26%");
  assert.equal(pctOrFlat(-1.5, 1), "−1.5%");
});
