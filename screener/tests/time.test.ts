import { test } from "node:test";
import assert from "node:assert/strict";
import {
  changeOverSessions,
  parseFeedDate,
  relativeAge,
} from "../lib/api/normalize/time.ts";
import { sessionAt } from "../lib/market/session.ts";

/* Timestamps are where a feed lies quietly. A wrong price is obvious on the
   page; a date read in the wrong zone shifts a whole history by hours and
   still looks plausible, and a session boundary read on the wrong day tells a
   reader the market is open when it is shut. */

/** Percentages arrive through floating-point division, so compare the value
    rather than its last bit. */
function assertPct(actual: number | null, expected: number, tol = 1e-9) {
  assert.ok(actual !== null, "expected a percentage, got null");
  assert.ok(
    Math.abs(actual - expected) < tol,
    `expected ${expected} +/- ${tol}, got ${actual}`,
  );
}

/* ------------------------------------------------------------------ */
/* parseFeedDate                                                       */
/* ------------------------------------------------------------------ */

test("reads a feed timestamp in the zone the feed named", () => {
  // 16:00 EDT is the closing print, and EDT is UTC-4.
  assert.equal(
    parseFeedDate("08/21/2026 16:00:00 EDT"),
    Date.UTC(2026, 7, 21, 20, 0, 0),
  );
});

test("separates EST from EDT", () => {
  // The same wall clock on either side of the daylight-saving boundary is an
  // hour apart in UTC. A parser that ignores the suffix gets one of them wrong.
  assert.equal(
    parseFeedDate("01/21/2026 16:00:00 EST"),
    Date.UTC(2026, 0, 21, 21, 0, 0),
  );

  const est = parseFeedDate("08/21/2026 16:00:00 EST");
  const edt = parseFeedDate("08/21/2026 16:00:00 EDT");
  assert.ok(est !== null && edt !== null);
  assert.equal(est - edt, 3_600_000);
});

test("returns null on a shape it does not recognise", () => {
  for (const s of [
    "",
    "not a date",
    "2026-08-21T16:00:00Z",
    "8/21/2026 16:00:00 EDT",
    "08/21/26 16:00:00 EDT",
    "08/21/2026 16:00 EDT",
  ]) {
    assert.equal(parseFeedDate(s), null, `expected null for ${JSON.stringify(s)}`);
  }
});

test("returns null on a zone it does not know", () => {
  // Date.parse would fall back to the server's own offset here, which is the
  // whole reason this function exists: a Frankfurt box would read the close
  // six hours early and nothing would look broken.
  assert.equal(parseFeedDate("08/21/2026 16:00:00 XYZ"), null);
  assert.equal(parseFeedDate("08/21/2026 16:00:00 CEST"), null);
});

/* ------------------------------------------------------------------ */
/* relativeAge                                                         */
/* ------------------------------------------------------------------ */

test("renders staleness in the largest unit that fits", () => {
  const t = Date.UTC(2026, 7, 21, 16, 0, 0);
  assert.equal(relativeAge(t, t + 45_000), "45s ago");
  assert.equal(relativeAge(t, t + 20 * 60_000), "20m ago");
  assert.equal(relativeAge(t, t + 2 * 3_600_000), "2h ago");
  assert.equal(relativeAge(t, t + 3 * 86_400_000), "3d ago");
});

test("clamps a timestamp from the future to zero", () => {
  // Clock skew between the gateway and the server would otherwise print a
  // negative age on the dateline.
  const t = Date.UTC(2026, 7, 21, 16, 0, 0);
  assert.equal(relativeAge(t + 30_000, t), "0s ago");
});

/* ------------------------------------------------------------------ */
/* changeOverSessions                                                  */
/* ------------------------------------------------------------------ */

test("measures across five sessions regardless of the order rows arrive", () => {
  // Newest first, as the polygon endpoints document elsewhere. Sorted
  // ascending the series runs 100 -> 110, so five sessions back is +10%.
  const descending = [
    { date: "08/21/2026", price: 110 },
    { date: "08/20/2026", price: 108 },
    { date: "08/19/2026", price: 104 },
    { date: "08/18/2026", price: 102 },
    { date: "08/17/2026", price: 101 },
    { date: "08/14/2026", price: 100 },
  ];
  assertPct(changeOverSessions(descending, 5), 10);

  const ascending = [...descending].reverse();
  assertPct(changeOverSessions(ascending, 5), 10);

  const shuffled = [
    descending[3], descending[0], descending[5],
    descending[2], descending[1], descending[4],
  ];
  assertPct(changeOverSessions(shuffled, 5), 10);

  // One session back is the row before last, not two before it.
  assertPct(changeOverSessions(descending, 1), 1.8519, 1e-4);
});

test("returns null when the window is longer than the history", () => {
  const points = [
    { date: "08/21/2026", price: 110 },
    { date: "08/20/2026", price: 108 },
    { date: "08/19/2026", price: 104 },
    { date: "08/18/2026", price: 102 },
    { date: "08/17/2026", price: 101 },
  ];
  assert.equal(changeOverSessions(points, 5), null);
  assert.equal(changeOverSessions([], 5), null);
  // Four fits inside the same five rows.
  assertPct(changeOverSessions(points, 4), 8.9109, 1e-4);
});

test("drops rows it cannot date rather than sorting them to the front", () => {
  // An unparseable date sorted as NaN would silently become the oldest point.
  const points = [
    { date: "08/21/2026", price: 110 },
    { date: "08/20/2026", price: 108 },
    { date: "not a date", price: 1 },
    { date: "08/19/2026", price: 104 },
    { date: "08/18/2026", price: 102 },
    { date: "08/17/2026", price: 101 },
    { date: "08/14/2026", price: 100 },
  ];
  assertPct(changeOverSessions(points, 5), 10);
});

/* ------------------------------------------------------------------ */
/* sessionAt                                                           */
/* ------------------------------------------------------------------ */

/** Seconds past the epoch — the unit sessionAt speaks. */
const at = (y: number, m: number, d: number, h: number, min = 0) =>
  Date.UTC(y, m, d, h, min, 0) / 1000;

test("weekends are closed", () => {
  assert.equal(sessionAt(at(2026, 7, 22, 16)).phase, "closed"); // Saturday
  assert.equal(sessionAt(at(2026, 7, 23, 16)).phase, "closed"); // Sunday
  assert.equal(sessionAt(at(2026, 7, 22, 16)).live, false);
});

test("a weekday runs closed, pre-market, open, closed", () => {
  const friday = (h: number, min = 0) => sessionAt(at(2026, 7, 21, h, min)).phase;
  assert.equal(friday(11), "closed");      // 07:00 ET, before the pre-market
  assert.equal(friday(12, 30), "pre-market"); // 08:30 ET
  assert.equal(friday(16), "open");        // 12:00 ET
  assert.equal(friday(21), "closed");      // 17:00 ET
});

test("the open is inclusive and the close is not", () => {
  const friday = (h: number, min = 0) => sessionAt(at(2026, 7, 21, h, min)).phase;
  assert.equal(friday(12, 0), "pre-market");
  assert.equal(friday(13, 29), "pre-market");
  assert.equal(friday(13, 30), "open");
  assert.equal(friday(19, 59), "open");
  assert.equal(friday(20, 0), "closed");
});

test("US market holidays are closed", () => {
  // Weekdays, inside the trading window, on which the exchange is shut. Without
  // a holiday list the dateline claims the market is open and the live dot
  // pulses against a book that is not trading.
  for (const [y, m, d, what] of [
    [2026, 10, 26, "Thanksgiving 2026"],
    [2026, 11, 25, "Christmas 2026"],
    [2026, 6, 3, "Independence Day 2026, observed"],
    [2026, 0, 19, "Martin Luther King Jr. Day 2026"],
    [2027, 10, 25, "Thanksgiving 2027"],
  ] as Array<[number, number, number, string]>) {
    const s = sessionAt(at(y, m, d, 16));
    assert.equal(s.phase, "closed", `${what} should be closed`);
    assert.equal(s.live, false, `${what} should not be live`);
  }
});

test("an ordinary weekday next to a holiday still trades", () => {
  // The list must not swallow the days around it.
  assert.equal(sessionAt(at(2026, 10, 25, 16)).phase, "open"); // Thanksgiving eve
  assert.equal(sessionAt(at(2026, 10, 27, 16)).phase, "open"); // the Friday after
  assert.equal(sessionAt(at(2026, 11, 24, 16)).phase, "open"); // Christmas eve
});
