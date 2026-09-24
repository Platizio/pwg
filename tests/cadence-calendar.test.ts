import test from "node:test";
import assert from "node:assert/strict";

import { nextCheckAt, nextEasternClose } from "../lib/market/store/cadence.ts";
import type { CadenceInput } from "../lib/market/store/cadence.ts";
import type { Section } from "../lib/market/store/sections.ts";

/* The refresh worker's clock against the exchange's real calendar.
 *
 * cadence.ts assumed every weekday closed at 16:00 and skipped only weekends.
 * Two things were wrong with that:
 *
 *   - A holiday was a session. On Thanksgiving evening the stored daily series
 *     (correctly) ends on Wednesday, the worker read that as a missing
 *     Thursday bar, and every enrolled name was re-read at publication and
 *     hourly after it until morning — for a bar that will never exist. The
 *     minute-bar capture ran for the holiday too.
 *   - A half-day closes at 13:00 and its post-market at 17:00, so the capture
 *     is due at 17:30, not 20:30.
 *
 * Publication is the exception that stays put: the gateway's nightly batch
 * lands after Eastern midnight whatever time the bell rang, and today's
 * Polygon bar is held back until that midnight (normalize/daily-bars.ts), so
 * a half-day's bar is expected at 00:45 like any other.
 *
 * Instants are written with their Eastern offset so each reads as the wall
 * clock it tests.
 */

const MINUTE = 60_000;
const HOUR = 3_600_000;
const ms = (iso: string) => Date.parse(iso);

function check(over: Partial<CadenceInput> & { section: Section; now: number }): number {
  return nextCheckAt({ changed: false, unchangedStreak: 1, priority: 1, ...over });
}

/** Stored daily columns ending on the given feed date ("MM/DD/YYYY"). */
const barsEnding = (mdy: string, zone: "EDT" | "EST") => ({
  date: [`${mdy} 00:00:00 ${zone}`],
  price: [1],
});

/* ------------------------------------------------------------------ */
/* The close                                                           */
/* ------------------------------------------------------------------ */

test("a half-day's close is 13:00", () => {
  assert.equal(nextEasternClose(ms("2026-11-27T10:00:00-05:00")), ms("2026-11-27T13:00:00-05:00"));
});

test("the evening before Thanksgiving waits for Friday's 13:00 close, not Thursday's", () => {
  assert.equal(nextEasternClose(ms("2026-11-25T17:00:00-05:00")), ms("2026-11-27T13:00:00-05:00"));
  assert.equal(nextEasternClose(ms("2026-11-26T10:00:00-05:00")), ms("2026-11-27T13:00:00-05:00"));
});

test("after a half-day's close the next one is Monday's ordinary 16:00", () => {
  assert.equal(nextEasternClose(ms("2026-11-27T14:00:00-05:00")), ms("2026-11-30T16:00:00-05:00"));
});

test("a holiday Monday is stepped over", () => {
  // Labor Day, Monday 7 September 2026.
  assert.equal(nextEasternClose(ms("2026-09-04T17:00:00-04:00")), ms("2026-09-08T16:00:00-04:00"));
});

/* ------------------------------------------------------------------ */
/* The minute-bar capture                                              */
/* ------------------------------------------------------------------ */

test("a half-day is captured half an hour after its 17:00 extended close", () => {
  assert.equal(
    check({ section: "history_intraday", now: ms("2026-11-27T10:00:00-05:00") }),
    ms("2026-11-27T17:30:00-05:00"),
  );
});

test("no capture is booked for Thanksgiving", () => {
  assert.equal(
    check({ section: "history_intraday", now: ms("2026-11-25T21:00:00-05:00") }),
    ms("2026-11-27T17:30:00-05:00"),
    "Wednesday's capture done, Thursday skipped, Friday at 17:30",
  );
});

test("after the half-day's capture the next is Monday's ordinary 20:30", () => {
  assert.equal(
    check({ section: "history_intraday", now: ms("2026-11-27T18:00:00-05:00") }),
    ms("2026-11-30T20:30:00-05:00"),
  );
});

test("Christmas Eve's capture is followed by Monday's, not Christmas Day's", () => {
  assert.equal(
    check({ section: "history_intraday", now: ms("2026-12-24T18:00:00-05:00") }),
    ms("2026-12-28T20:30:00-05:00"),
  );
});

/* ------------------------------------------------------------------ */
/* Daily bars                                                          */
/* ------------------------------------------------------------------ */

test("Thanksgiving evening does not wait for a Thanksgiving bar", () => {
  /* The series ends on Wednesday, which IS the last session. The next thing
     worth reading is Friday's bar, published after Friday midnight. */
  assert.equal(
    check({
      section: "history_daily",
      now: ms("2026-11-26T18:00:00-05:00"),
      payload: barsEnding("11/25/2026", "EST"),
    }),
    ms("2026-11-28T00:45:00-05:00"),
  );
});

test("a half-day's bar is expected after midnight, not 8h45 after its 13:00 bell", () => {
  /* 13:00 + 8h45 is 21:45 — before the gateway's nightly batch and before
     daily-bars.ts lets the day's Polygon bar through, so a read then finds
     nothing and falls into the hourly retries. */
  for (const now of ["2026-11-27T14:00:00-05:00", "2026-11-27T22:00:00-05:00"]) {
    assert.equal(
      check({ section: "history_daily", now: ms(now), payload: barsEnding("11/25/2026", "EST") }),
      ms("2026-11-28T00:45:00-05:00"),
      now,
    );
  }
});

test("a late half-day publication is retried hourly, and given up at 06:00", () => {
  const late = ms("2026-11-28T01:30:00-05:00");
  const retry = check({ section: "history_daily", now: late, payload: barsEnding("11/25/2026", "EST") }) - late;
  assert.ok(Math.abs(retry - HOUR) <= HOUR * 0.1 + 2, `expected about an hour, got ${retry / MINUTE} min`);

  assert.equal(
    check({
      section: "history_daily",
      now: ms("2026-11-28T06:30:00-05:00"),
      payload: barsEnding("11/25/2026", "EST"),
    }),
    ms("2026-12-01T00:45:00-05:00"),
    "Monday's publication, early Tuesday",
  );
});

test("Christmas Day books Monday's bar, not a Christmas one", () => {
  assert.equal(
    check({
      section: "history_daily",
      now: ms("2026-12-25T10:00:00-05:00"),
      payload: barsEnding("12/24/2026", "EST"),
    }),
    ms("2026-12-29T00:45:00-05:00"),
  );
});

test("a Labor Day weekend books Tuesday's bar", () => {
  assert.equal(
    check({
      section: "history_daily",
      now: ms("2026-09-05T12:00:00-04:00"),
      payload: barsEnding("09/04/2026", "EDT"),
    }),
    ms("2026-09-09T00:45:00-04:00"),
  );
});

/* ------------------------------------------------------------------ */
/* The two DST Sundays                                                 */
/* ------------------------------------------------------------------ */

test("spring forward: Friday's bar at 00:45 EST, Monday's at 00:45 EDT", () => {
  assert.equal(
    check({
      section: "history_daily",
      now: ms("2026-03-06T17:00:00-05:00"),
      payload: barsEnding("03/05/2026", "EST"),
    }),
    Date.parse("2026-03-07T05:45:00Z"),
  );
  assert.equal(
    check({
      section: "history_daily",
      now: ms("2026-03-07T12:00:00-05:00"),
      payload: barsEnding("03/06/2026", "EST"),
    }),
    Date.parse("2026-03-10T04:45:00Z"),
  );
});

test("fall back: Friday's bar at 00:45 EDT, Monday's at 00:45 EST", () => {
  assert.equal(
    check({
      section: "history_daily",
      now: ms("2026-10-30T17:00:00-04:00"),
      payload: barsEnding("10/29/2026", "EDT"),
    }),
    Date.parse("2026-10-31T04:45:00Z"),
  );
  assert.equal(
    check({
      section: "history_daily",
      now: ms("2026-10-31T12:00:00-04:00"),
      payload: barsEnding("10/30/2026", "EDT"),
    }),
    Date.parse("2026-11-03T05:45:00Z"),
  );
});

test("the capture moves with the clocks across both DST Sundays", () => {
  assert.equal(
    check({ section: "history_intraday", now: ms("2026-03-06T21:00:00-05:00") }),
    Date.parse("2026-03-10T00:30:00Z"),
    "Monday 20:30 EDT",
  );
  assert.equal(
    check({ section: "history_intraday", now: ms("2026-10-30T21:00:00-04:00") }),
    Date.parse("2026-11-03T01:30:00Z"),
    "Monday 20:30 EST",
  );
});

test("a Friday post-market that is Saturday in UTC is still Friday", () => {
  const now = ms("2026-11-06T19:30:00-05:00");
  assert.equal(new Date(now).getUTCDay(), 6, "Saturday in UTC");
  assert.equal(nextEasternClose(now), ms("2026-11-09T16:00:00-05:00"));
  assert.equal(
    check({ section: "history_intraday", now }),
    ms("2026-11-06T20:30:00-05:00"),
    "Friday's own capture, an hour away — not Monday's",
  );
});
