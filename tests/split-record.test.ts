import { test } from "node:test";
import assert from "node:assert/strict";

import { repairAgainst, returnsAgainst, splitRecord } from "../lib/market/split-record.ts";
import type { RawHistoryPoint } from "../lib/api/clients/quotes.ts";

/* "No splits on record" and "we could not read the record" are not the same
   answer, and the instrument assembler used to spell both `?? []`.

   The consequence is already in this repo's history. Netflix printed a −93.3%
   trailing year off an $80.58 price: a ten-for-one split the vendor had never
   applied to the earlier bars, read as a collapse. The repair that exists to
   catch exactly that is switched on by the corporate-actions call, so when
   that call fails the repair silently does not happen — and the unrepaired
   break is published as a real return, under a real company's name, with
   nothing on the page admitting the gap.

   An empty split list is a fact about the company. A failed call is a fact
   about the gateway. Only the first licenses measuring the series. */

const DAY = 86_400_000;
const END = Date.UTC(2026, 7, 21, 20, 0, 0);

/** A price series ending at END, one point per entry, walked backwards. */
function series(spec: Array<{ daysAgo: number; price: number }>): RawHistoryPoint[] {
  return spec.map(({ daysAgo, price }) => {
    const d = new Date(END - daysAgo * DAY);
    const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
    const dd = String(d.getUTCDate()).padStart(2, "0");
    return {
      date: `${mm}/${dd}/${d.getUTCFullYear()} 16:00:00 EDT`,
      price,
      opening: price,
      high: price,
      low: price,
      volume: 1,
    };
  });
}

/** The execution_date the gateway would carry for a split that many days back. */
function isoDaysAgo(daysAgo: number): string {
  return new Date(END - daysAgo * DAY).toISOString().slice(0, 10);
}

/* Netflix, as the feed actually served it: a year of pre-split prices, the
   ten-for-one break a hundred sessions back, and the post-split prices after
   it. Measured raw this reads about −87%; repaired it is a gain. */
const NFLX = series([
  { daysAgo: 366, price: 700 },
  { daysAgo: 101, price: 800 },
  { daysAgo: 100, price: 80 },
  { daysAgo: 0, price: 90 },
]);

const TEN_FOR_ONE = [{ execution_date: isoDaysAgo(100), split_from: 1, split_to: 10 }];

/* ---------- reading the record ---------- */

test("a record naming no splits is a readable record", () => {
  const r = splitRecord({ splits: [] });
  assert.equal(r.readable, true);
  assert.deepEqual(r.splits, []);
});

/* The gateway omits the key entirely for a company that has never split, and
   that is an answer about the company rather than a missing answer. */
test("a record with the splits key absent or null still counts as read", () => {
  assert.equal(splitRecord({}).readable, true);
  assert.equal(splitRecord({ splits: null }).readable, true);
});

test("a failed corporate-actions call is not a company without splits", () => {
  assert.equal(splitRecord(null).readable, false);
  assert.equal(splitRecord(undefined).readable, false);
});

/* ---------- repairing against it ---------- */

test("a split the record names is repaired out of the series", () => {
  const repaired = repairAgainst(NFLX, splitRecord({ splits: TEN_FOR_ONE }));
  assert.equal(repaired[0].price, 70, "the pre-split bars should come down by the ratio");
  assert.equal(repaired[3].price, 90, "post-split bars are already right and must not move");
});

test("a readable record with no splits leaves the series exactly as it came", () => {
  const raw = series([{ daysAgo: 365, price: 100 }, { daysAgo: 0, price: 120 }]);
  assert.deepEqual(repairAgainst(raw, splitRecord({ splits: [] })), raw);
});

/* The chart is still drawn from an unreadable record's series — a break in a
   line is visible, where a number is not. Only the measurements are withheld. */
test("an unreadable record leaves the series alone rather than blanking it", () => {
  assert.deepEqual(repairAgainst(NFLX, splitRecord(null)), NFLX);
});

/* ---------- measuring across it ---------- */

test("returns are measured across the repaired series when the record is readable", () => {
  const r = returnsAgainst(NFLX, splitRecord({ splits: TEN_FOR_ONE }));
  assert.ok(r.ret1y !== null);
  assert.ok(
    Math.abs(r.ret1y - 28.57) < 1,
    `expected about +28.6% from the repaired series, got ${r.ret1y}`,
  );
});

/* The regression itself. Without the record we cannot know whether the −87%
   step is a split or a collapse, and publishing it either way is the failure
   this layer exists to prevent. */
test("returns are withheld entirely when the record could not be read", () => {
  const r = returnsAgainst(NFLX, splitRecord(null));
  assert.equal(r.ret1y, null, "an unrepaired split break must not be published as a return");
  assert.equal(r.ret5y, null);
  assert.equal(r.cagr5y, null);
});

/* A company that genuinely has no splits must not lose its figures to this. */
test("a readable empty record still yields the ordinary returns", () => {
  const r = returnsAgainst(
    series([{ daysAgo: 366, price: 100 }, { daysAgo: 0, price: 120 }]),
    splitRecord({ splits: [] }),
  );
  assert.ok(r.ret1y !== null);
  assert.ok(Math.abs(r.ret1y - 20) < 1, `expected about +20%, got ${r.ret1y}`);
});
