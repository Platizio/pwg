import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_RANGE, RANGES, getRange, rangeCaption } from "../lib/market/ranges.ts";

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

/* ------------------------------------------------------------------ */
/* What the chart says it is showing                                   */
/* ------------------------------------------------------------------ */

/* The chart offered six buttons and never once stated a bar interval, a date
   span or a timezone. A reader could not tell that 1W is five daily closes
   rather than a week of minutes, nor that the 13:30 on the day axis is UTC
   rather than a 1:30pm session.

   Two traps this caption exists to expose:

   - The window is a tail-slice of ROWS, not a date range. If the feed's last
     row is Friday and today is Tuesday, 1W silently shows last Mon-Fri. So the
     span is read off the plotted points, never computed from today.
   - The count is the points actually drawn, not the nominal `sessions`. A
     short feed plots fewer, and claiming 252 while drawing 200 is the same
     class of lie. */

const ET = "ET";
/* 16:00 EDT on each date, so the UTC instant and the ET calendar day agree. */
const AUG_4 = Date.UTC(2026, 7, 4, 20, 0);
const SEP_1 = Date.UTC(2026, 8, 1, 20, 0);
const SEP_1_2025 = Date.UTC(2025, 8, 1, 20, 0);

test("a daily range names its interval, its real count and its real span", () => {
  const c = rangeCaption(getRange("1M"), AUG_4, SEP_1, 21);
  assert.match(c, /^1M/);
  assert.match(c, /21 daily closes/);
  assert.match(c, /Aug 4/);
  assert.match(c, /Sep 1/);
  assert.match(c, /2026/);
  assert.ok(c.endsWith(ET), `should be stamped with a timezone: ${c}`);
});

test("the day range says it is minutes, not closes", () => {
  const c = rangeCaption(getRange("1D"), SEP_1, SEP_1, 391);
  assert.match(c, /minute/);
  assert.ok(!/daily closes/.test(c), `the day is not daily closes: ${c}`);
});

/* One session is a date, not a range from a date to itself. */
test("a span inside one day reads as that day", () => {
  const c = rangeCaption(getRange("1D"), SEP_1, SEP_1, 391);
  assert.ok(!c.includes("\u2013"), `no dash for a single session: ${c}`);
});

test("a span crossing a year carries both years", () => {
  const c = rangeCaption(getRange("5Y"), SEP_1_2025, SEP_1, 1274);
  assert.match(c, /2025/);
  assert.match(c, /2026/);
});

/* The count is the drawn points. 1,274 must not print as 1274 beside prose. */
test("a long count is grouped for reading", () => {
  assert.match(rangeCaption(getRange("5Y"), SEP_1_2025, SEP_1, 1274), /1,274/);
});

test("the caption reports what is drawn, not what the range nominally holds", () => {
  /* 1Y nominally slices 252 sessions; a short feed plots fewer. */
  const c = rangeCaption(getRange("1Y"), AUG_4, SEP_1, 200);
  assert.match(c, /200 daily closes/);
  assert.ok(!c.includes("252"), `must not claim the nominal window: ${c}`);
});

test("an empty series claims no span at all rather than a zero one", () => {
  const c = rangeCaption(getRange("1D"), null, null, 0);
  assert.ok(!/1970|Jan 1|NaN|Invalid/.test(c), `no epoch leakage: ${c}`);
  assert.match(c, /^1D/);
});

test("every range can caption itself", () => {
  for (const r of RANGES) {
    const c = rangeCaption(r, AUG_4, SEP_1, 10);
    assert.ok(c.startsWith(r.label), `${r.id} should lead with its own label`);
    assert.ok(c.length > r.label.length, `${r.id} caption is empty`);
    assert.ok(!/undefined|NaN/.test(c), `${r.id} caption leaks: ${c}`);
  }
});

test("every range declares an interval, so no caption has to guess", () => {
  for (const r of RANGES) {
    assert.ok(r.interval && r.interval.length > 0, `${r.id} has no interval`);
  }
});
