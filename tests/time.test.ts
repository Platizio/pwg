import { test } from "node:test";
import assert from "node:assert/strict";
import {
  changeOverSessions,
  parseFeedDate,
  relativeAge,
} from "../lib/api/normalize/time.ts";
import { pricesMove, sessionAt, phaseWord, nextOpening } from "../lib/market/session.ts";

/* 15:00 UTC on a September Wednesday = 11:00 EDT, squarely inside the bell. */
const SEP_2_2026_1500Z = Math.floor(Date.UTC(2026, 8, 2, 15, 0) / 1000);

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

test("a weekday runs closed, pre-market, open, post-market, closed", () => {
  const friday = (h: number, min = 0) => sessionAt(at(2026, 7, 21, h, min)).phase;
  assert.equal(friday(7), "closed");       // 03:00 ET, before the pre-market
  assert.equal(friday(11), "pre-market");  // 07:00 ET
  assert.equal(friday(12, 30), "pre-market"); // 08:30 ET
  assert.equal(friday(16), "open");        // 12:00 ET
  assert.equal(friday(21), "post-market"); // 17:00 ET
  assert.equal(friday(1), "closed");       // 21:00 ET the evening before
});

test("the open is inclusive and the close is not", () => {
  const friday = (h: number, min = 0) => sessionAt(at(2026, 7, 21, h, min)).phase;
  assert.equal(friday(12, 0), "pre-market");
  assert.equal(friday(13, 29), "pre-market");
  assert.equal(friday(13, 30), "open");
  assert.equal(friday(19, 59), "open");
  assert.equal(friday(20, 0), "post-market");
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

/* ------------------------------------------------------------------ */
/* Extended hours                                                      */
/* ------------------------------------------------------------------ */

/*
  The tag beside the price on an instrument page is `session.label`. It used to
  read "Market closed" for the four hours after the bell even though the book
  was still quoting, so the boundaries below are asserted from the Eastern wall
  clock rather than from a UTC offset — the exchange's hours are defined in ET
  and the two only agree for eight months of the year.
*/

/** Seconds past the epoch for a US Eastern wall clock. `offset` is the UTC
    offset in force on that date: 4 during EDT, 5 during EST. */
const et = (y: number, m: number, d: number, h: number, min = 0, offset = 4) =>
  Date.UTC(y, m, d, h + offset, min, 0) / 1000;

/* Wednesday 19 August 2026 — an ordinary EDT weekday, on no holiday list. */
const edt = (h: number, min = 0) => sessionAt(et(2026, 7, 19, h, min));

test("the pre-market opens at 04:00 Eastern and not a minute before", () => {
  assert.equal(edt(3, 59).phase, "closed");
  assert.equal(edt(4, 0).phase, "pre-market");
});

test("the pre-market hands over to the regular session at 09:30 Eastern", () => {
  assert.equal(edt(9, 29).phase, "pre-market");
  assert.equal(edt(9, 30).phase, "open");
});

test("the regular session hands over to the post-market at 16:00 Eastern", () => {
  assert.equal(edt(15, 59).phase, "open");
  assert.equal(edt(16, 0).phase, "post-market");
});

test("the post-market ends at 20:00 Eastern", () => {
  assert.equal(edt(19, 59).phase, "post-market");
  assert.equal(edt(20, 0).phase, "closed");
});

test("the tag beside the price names the phase it is in", () => {
  assert.equal(edt(5).label, "Pre-market");
  assert.equal(edt(11).label, "Market");
  assert.equal(edt(18).label, "Post-market");
  assert.equal(edt(22).label, "Market closed");
});

test("a weekend has no extended hours either", () => {
  // Saturday 22 August 2026, at each of the three weekday phases' hours.
  for (const h of [5, 11, 18]) {
    const s = sessionAt(et(2026, 7, 22, h));
    assert.equal(s.phase, "closed", `Saturday ${h}:00 ET should be closed`);
    assert.equal(pricesMove(s.phase), false);
  }
});

test("a holiday never reads as pre-market or post-market", () => {
  // Thanksgiving, Thursday 26 November 2026. EST, so the offset is five.
  for (const h of [5, 11, 18]) {
    const s = sessionAt(et(2026, 10, 26, h, 0, 5));
    assert.equal(s.phase, "closed", `Thanksgiving ${h}:00 ET should be closed`);
    assert.equal(s.label, "Market closed");
    assert.equal(pricesMove(s.phase), false);
  }
});

/*
  The boundaries are Eastern, so they must not drift when the offset does. In
  January the ET/UTC gap is five hours rather than four: read against a fixed
  UTC offset, every boundary here fires an hour early.
*/
test("the boundaries hold in Eastern winter time, not at a fixed UTC offset", () => {
  // Wednesday 20 January 2027 — EST, and on no holiday list.
  const est = (h: number, min = 0) => sessionAt(et(2027, 0, 20, h, min, 5)).phase;
  assert.equal(est(3, 59), "closed");
  assert.equal(est(4, 0), "pre-market");
  assert.equal(est(9, 0), "pre-market");   // 14:00 UTC — an hour before the bell
  assert.equal(est(9, 30), "open");
  assert.equal(est(15, 30), "open");       // 20:30 UTC — still half an hour to run
  assert.equal(est(16, 0), "post-market");
  assert.equal(est(20, 0), "closed");
});

test("a winter Friday post-market is not mistaken for the weekend", () => {
  // Friday 22 January 2027 at 19:00 EST is already Saturday in UTC. The
  // trading day belongs to the exchange's calendar, not the server's.
  assert.equal(sessionAt(et(2027, 0, 22, 19, 0, 5)).phase, "post-market");
});

/*
  Two different questions, deliberately kept apart.

  `live` means the regular session is trading: the chrome-bar chip renders it
  as the words "US markets Open"/"Closed", and pre-market is not open.

  `pricesMove` means the numbers on the page are changing, which is what the
  pulsing gold dot beside the price actually claims — and extended-hours
  quotes do move.
*/
test("live stays regular-session only, so the chrome bar keeps telling the truth", () => {
  assert.equal(edt(5).live, false);
  assert.equal(edt(11).live, true);
  assert.equal(edt(18).live, false);
  assert.equal(edt(22).live, false);
});

test("prices move through the extended hours, not only through the bell", () => {
  assert.equal(pricesMove("pre-market"), true);
  assert.equal(pricesMove("open"), true);
  assert.equal(pricesMove("post-market"), true);
  assert.equal(pricesMove("closed"), false);
  assert.equal(pricesMove("halted"), false);
});

test("the staleness readout follows the ticking, not the bell", () => {
  assert.equal(edt(5).lastTick, "2s ago");
  assert.equal(edt(11).lastTick, "2s ago");
  assert.equal(edt(18).lastTick, "2s ago");
  assert.equal(edt(22).lastTick, "—");
});

/* ------------------------------------------------------------------ */
/* The chrome bar must not contradict the price tag                    */
/* ------------------------------------------------------------------ */

/* Caught on screen, not in review: at 06:49 ET the tag beside the price read
   "Pre-market" with a pulsing gold dot while the pill in the top-right corner
   read "US markets Closed", eleven inches away on the same screen. Both were
   defensible in isolation — "open/closed" properly describes the regular
   session — and together they were a contradiction the reader has to resolve.
   One clock, one answer. */

test("the corner pill names the phase, so it cannot disagree with the price tag", () => {
  assert.equal(phaseWord("pre-market"), "Pre-market");
  assert.equal(phaseWord("post-market"), "Post-market");
  assert.equal(phaseWord("closed"), "Closed");
});

/* The pill prefixes every word with "US ", so all three trading phases have to
   read the same way: "US Pre-market", "US Market", "US Post-market". An earlier
   pass had `open` as "Open", which broke that symmetry the moment the prefix
   shortened from "US markets " to "US ". */
test("the pill's word for the bell matches the label beside the price", () => {
  assert.equal(phaseWord("open"), "Market");
  assert.equal(sessionAt(SEP_2_2026_1500Z).label, "Market");
});

test("every phase has a word, so the pill can never render undefined", () => {
  for (const p of ["pre-market", "open", "post-market", "closed", "halted"] as const) {
    const w = phaseWord(p);
    assert.ok(typeof w === "string" && w.length > 0, `${p} has no word`);
  }
});

/* ------------------------------------------------------------------ */
/* An Indian reader's clock, and what is about to happen               */
/* ------------------------------------------------------------------ */

/* This terminal is for Indian investors trading US equities, and the pill was
   reporting UTC — a zone neither the reader nor the market lives in. It also
   only ever named the phase, which is the least useful thing to say in the
   hours when nothing is trading: at 16:25 IST the honest and useful statement
   is not "closed", it is "the market opens at 7:00 pm".
 *
 * The IST times are computed, never hardcoded: US hours are Eastern, so every
 * one of these shifts by an hour between EDT and EST. The 09:30 bell is 19:00
 * IST in summer and 20:00 IST in winter. */

const utc = (y: number, mo: number, d: number, h: number, mi: number) =>
  Math.floor(Date.UTC(y, mo, d, h, mi) / 1000);

/* Wed 2 Sep 2026 is EDT, so ET+9:30 = IST. */
const EDT_0930_ET = utc(2026, 8, 2, 13, 30); // the bell
const EDT_0400_ET = utc(2026, 8, 2, 8, 0); // pre-market opens
const EDT_1600_ET = utc(2026, 8, 2, 20, 0); // post-market opens

test("the clock is the reader's clock, not UTC", () => {
  /* 13:30 UTC = 19:00 IST. */
  assert.match(sessionAt(EDT_0930_ET).clock, /7:00\s*pm/i);
  assert.doesNotMatch(sessionAt(EDT_0930_ET).clock, /UTC/);
});

test("an hour before the bell the pill announces the bell", () => {
  const n = nextOpening(EDT_0930_ET - 55 * 60);
  assert.ok(n, "55 minutes out must announce");
  assert.equal(n.label, "US Market opens");
  assert.match(n.time, /7:00\s*pm/i);
});

/* The pill rotates all day, so there is no quiet window any more: two hours
   before the bell it must still be able to name the bell. */
test("the next opening is known at any hour, not only when it is close", () => {
  const n = nextOpening(EDT_0930_ET - 150 * 60);
  assert.ok(n);
  assert.equal(n.label, "US Market opens");
  assert.match(n.time, /7:00\s*pm/i);
});

test("the pre-market opening is announced too, at its own IST time", () => {
  const n = nextOpening(EDT_0400_ET - 30 * 60);
  assert.ok(n);
  assert.equal(n.label, "US Pre-market opens");
  assert.match(n.time, /1:30\s*pm/i, "04:00 EDT is 13:30 IST");
});

test("and the post-market opening, which lands after midnight in India", () => {
  const n = nextOpening(EDT_1600_ET - 20 * 60);
  assert.ok(n);
  assert.equal(n.label, "US Post-market opens");
  assert.match(n.time, /1:30\s*am/i, "16:00 EDT is 01:30 IST the next day");
});

/* The whole point of computing rather than hardcoding: the same bell is an
   hour later in India once the US puts its clocks back. */
test("the announced time follows US daylight saving, not a fixed offset", () => {
  /* Wed 2 Dec 2026 is EST, so the 09:30 bell is 14:30 UTC = 20:00 IST. */
  const winterBell = utc(2026, 11, 2, 14, 30);
  const n = nextOpening(winterBell - 30 * 60);
  assert.ok(n);
  assert.match(n.time, /8:00\s*pm/i, "in EST the bell is 20:00 IST, not 19:00");
});

/* A Saturday reader still deserves an answer, and this weekend proves the walk
   is doing real work rather than just adding a day: Monday 7 Sep 2026 is Labor
   Day, so the next opening is TUESDAY. Getting this wrong is exactly the kind
   of thing that puts a confidently incorrect time on the screen — this test was
   written expecting Monday and the holiday list corrected it. */
test("a weekend followed by a holiday reaches all the way to Tuesday", () => {
  const n = nextOpening(utc(2026, 8, 5, 13, 0));
  assert.ok(n, "Saturday must still name the next opening");
  assert.equal(n.label, "US Pre-market opens");
  /* Tuesday 8 Sep 2026, 04:00 EDT = 08:00 UTC. */
  assert.equal(n.at, utc(2026, 8, 8, 8, 0));
});

test("a holiday is stepped over rather than announced", () => {
  /* Thanksgiving, Thu 26 Nov 2026 — the next opening is Friday's pre-market,
     04:00 EST = 09:00 UTC. */
  const n = nextOpening(utc(2026, 10, 26, 14, 0));
  assert.ok(n);
  assert.equal(n.label, "US Pre-market opens");
  assert.equal(n.at, utc(2026, 10, 27, 9, 0));
});

/* The pill reads "US " + this, so the regular session must not read
   "US Market open" or "US Open" while its neighbours read "US Pre-market". */
test("the phase words are symmetrical, because the pill prefixes them all", () => {
  assert.equal(phaseWord("pre-market"), "Pre-market");
  assert.equal(phaseWord("open"), "Market");
  assert.equal(phaseWord("post-market"), "Post-market");
  assert.equal(phaseWord("closed"), "Closed");
});
