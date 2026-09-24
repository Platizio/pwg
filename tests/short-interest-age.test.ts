import { test } from "node:test";
import assert from "node:assert/strict";
import {
  SHORT_INTEREST_MAX_AGE_DAYS,
  shortInterestIsCurrent,
} from "../lib/market/short-interest-age.ts";

/* The last daily bar's timestamp: 23 Sep 2026, 20:00 UTC (the 16:00 ET close). */
const LAST_BAR = Date.UTC(2026, 8, 23, 20, 0, 0);

test("a filing from the last few weeks is the current position", () => {
  assert.equal(shortInterestIsCurrent("2026-09-15", LAST_BAR), true);
  assert.equal(shortInterestIsCurrent("2026-08-29", LAST_BAR), true);
});

test("the six-week limit is inclusive", () => {
  assert.equal(SHORT_INTEREST_MAX_AGE_DAYS, 45);
  /* 23 Sep less 45 days is 9 Aug. */
  assert.equal(shortInterestIsCurrent("2026-08-09", LAST_BAR), true);
  assert.equal(shortInterestIsCurrent("2026-08-08", LAST_BAR), false);
});

test("the 2017 filing every record carries today is not current", () => {
  assert.equal(shortInterestIsCurrent("2017-12-29", LAST_BAR), false);
});

test("a settlement a few days past the last bar is tolerated, one far past is not", () => {
  assert.equal(shortInterestIsCurrent("2026-09-25", LAST_BAR), true);
  assert.equal(shortInterestIsCurrent("2026-10-30", LAST_BAR), false);
});

test("an unreadable settlement date is never current", () => {
  assert.equal(shortInterestIsCurrent(null, LAST_BAR), false);
  assert.equal(shortInterestIsCurrent("", LAST_BAR), false);
  assert.equal(shortInterestIsCurrent("29/12/2017", LAST_BAR), false);
  assert.equal(shortInterestIsCurrent("2026-02-31", LAST_BAR), false);
});

test("with no bar to measure against, a readable filing is left as it was", () => {
  assert.equal(shortInterestIsCurrent("2017-12-29", null), true);
  assert.equal(shortInterestIsCurrent("2026-09-15", Number.NaN), true);
});
