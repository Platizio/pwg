import test from "node:test";
import assert from "node:assert/strict";

import {
  HISTORY_RETRY_MS,
  HISTORY_TTL_MS,
  historyNextFetch,
  historyReplaces,
  historyTarget,
} from "../lib/market/ranges.ts";

/* When a fetched range is asked for again, judged by what it REACHES.
 *
 * The old rule bound 1D and 1W to the phase: an answer fetched on the other
 * side of the open or the bell was dropped on the spot. That blanked the day
 * chart and threw the week back to seven daily closes at every open, because
 * no source has a bar of today in the first minutes (Polygon publishes a
 * bucket once it is complete, and was measured 1.5-12 minutes behind on 24
 * Sep 2026; the gateway ran 20-22 minutes behind). And it never bound 1M, 3M
 * and 1Y at all, so after the bell the year went on ending on the 15:59 trade
 * for up to three hours. The answer then kept its full five-minute TTL even
 * when it had come back without the very session it was refetched for. */

const ET = (iso: string) => Date.parse(iso);
const MIN = 60_000;

const YESTERDAY_BELL = ET("2026-09-23T16:00:00-04:00");
const OPEN = ET("2026-09-24T09:30:00-04:00");
const BELL = ET("2026-09-24T16:00:00-04:00");

test("what an answer should reach, by range and by the clock", () => {
  const preOpen = ET("2026-09-24T06:00:00-04:00");
  const midSession = ET("2026-09-24T11:00:00-04:00");
  const afterBell = ET("2026-09-24T16:00:30-04:00");

  assert.deepEqual(historyTarget("1D", preOpen), { reach: YESTERDAY_BELL, since: YESTERDAY_BELL });
  assert.deepEqual(historyTarget("1D", midSession), { reach: OPEN, since: OPEN }, "the day: today's session");
  assert.deepEqual(historyTarget("1W", midSession), { reach: OPEN, since: OPEN }, "the week: through today");
  assert.deepEqual(
    historyTarget("1Y", midSession),
    { reach: YESTERDAY_BELL, since: YESTERDAY_BELL },
    "the year's today comes from the live tail, not the fetch",
  );
  for (const r of ["1D", "1W", "1M", "3M", "1Y"] as const) {
    assert.deepEqual(historyTarget(r, afterBell), { reach: BELL, since: BELL }, `${r} after the bell`);
  }
  assert.equal(historyTarget("5Y", afterBell), null, "five years is daily closes: no session to reach");
  const halfDayBell = ET("2026-11-27T13:00:00-05:00");
  assert.deepEqual(historyTarget("1D", ET("2026-11-27T14:00:00-05:00")), {
    reach: halfDayBell,
    since: halfDayBell,
  });
});

test("the open: a day fetched before it is asked again at once, and stays drawn meanwhile", () => {
  const held = { count: 392, at: ET("2026-09-24T09:10:00-04:00"), lastAt: YESTERDAY_BELL };
  const now = ET("2026-09-24T09:30:05-04:00");
  assert.ok(historyNextFetch(held, undefined, "1D", now) <= now);
  assert.ok(historyNextFetch(held, undefined, "1W", now) <= now);
  assert.equal(
    historyNextFetch(held, undefined, "1Y", now),
    held.at + HISTORY_TTL_MS["1Y"],
    "the year's today is the live tail: nothing to refetch at the open",
  );
});

test("an answer that came back without the session it was asked for is asked again in half a minute", () => {
  /* 09:30:30: the route could only serve up to yesterday. */
  const held = { count: 392, at: ET("2026-09-24T09:30:30-04:00"), lastAt: YESTERDAY_BELL };
  const now = held.at + 1_000;
  assert.equal(historyNextFetch(held, undefined, "1D", now), held.at + HISTORY_RETRY_MS);
  assert.equal(historyNextFetch(held, undefined, "1W", now), held.at + HISTORY_RETRY_MS);
});

test("and backs off as the boundary recedes, never past the range's TTL", () => {
  const lastAt = YESTERDAY_BELL;
  const at20 = OPEN + 20 * MIN;
  assert.equal(
    historyNextFetch({ count: 392, at: at20, lastAt }, undefined, "1D", at20),
    at20 + 5 * MIN,
    "a quarter of the twenty minutes since the open, which is the day's TTL",
  );
  const at2h = BELL + 2 * 3_600_000;
  assert.equal(
    historyNextFetch({ count: 3000, at: at2h, lastAt: BELL - 30 * MIN }, undefined, "1Y", at2h),
    at2h + 30 * MIN,
    "the year, two hours after a bell it never reached: every half hour, not every thirty seconds",
  );
});

test("the bell: every minute range fetched before it is asked again at once", () => {
  const now = ET("2026-09-24T16:00:30-04:00");
  for (const r of ["1D", "1W", "1M", "3M", "1Y"] as const) {
    const held = { count: 500, at: ET("2026-09-24T15:00:00-04:00"), lastAt: ET("2026-09-24T14:30:00-04:00") };
    assert.ok(historyNextFetch(held, undefined, r, now) <= now, r);
  }
});

test("an answer that reaches what it should keeps its TTL", () => {
  const afterBell = { count: 392, at: BELL + 3 * MIN, lastAt: BELL };
  assert.equal(historyNextFetch(afterBell, undefined, "1D", afterBell.at), afterBell.at + HISTORY_TTL_MS["1D"]);
  const today = { count: 60, at: OPEN + 60 * MIN, lastAt: OPEN + 55 * MIN };
  assert.equal(historyNextFetch(today, undefined, "1D", today.at), today.at + HISTORY_TTL_MS["1D"]);
});

test("empty answers and failures are still retried in half a minute", () => {
  const now = ET("2026-09-24T11:00:00-04:00");
  assert.equal(historyNextFetch({ count: 0, at: now, lastAt: null }, undefined, "1Y", now), now + HISTORY_RETRY_MS);
  assert.equal(historyNextFetch(undefined, now, "3M", now), now + HISTORY_RETRY_MS);
  assert.ok(historyNextFetch(undefined, undefined, "1W", now) <= now);
  assert.equal(historyNextFetch({ count: 1300, at: now, lastAt: YESTERDAY_BELL }, undefined, "5Y", now), now + HISTORY_TTL_MS["5Y"]);
});

/* ---------- a refetch never moves the chart backwards ---------- */

test("an answer that reaches less far than the one held does not replace it", () => {
  const held = { count: 392, lastAt: YESTERDAY_BELL };
  /* 09:30:30: the route's fallback was yesterday again, in the store's
     ten-minute buckets, which stop at 15:50. */
  assert.equal(historyReplaces(held, { count: 39, lastAt: YESTERDAY_BELL - 10 * MIN }), false);
  assert.equal(historyReplaces(held, { count: 0, lastAt: null }), false, "nor does an empty one");
  assert.equal(historyReplaces(held, { count: 380, lastAt: YESTERDAY_BELL }), true, "as far: the newer copy");
  assert.equal(historyReplaces(held, { count: 5, lastAt: OPEN + 3 * MIN }), true);
  assert.equal(historyReplaces(undefined, { count: 0, lastAt: null }), true);
  assert.equal(historyReplaces({ count: 0, lastAt: null }, { count: 0, lastAt: null }), true);
});
