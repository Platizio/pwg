import test from "node:test";
import assert from "node:assert/strict";

import { formatStamp } from "../lib/market/format.ts";

/* What the chart's crosshair and data table say an instant was.
 *
 * This had no test, and it is exactly what a reader complained about. The
 * stamp was pinned to New York while the axis beside it had already moved to
 * the reader's own zone and the library's crosshair label was rendering raw
 * UTC — one chart, one instant, three different numbers, none of them the
 * clock of the person looking at it.
 *
 * The rule: a clock is the READER'S and it names its zone; a daily bar carries
 * a date and no zone, because it covers a session rather than a moment.
 *
 * The zone is passed in rather than read from the machine, so these assertions
 * mean the same thing on a laptop in Mumbai and on a CI box in UTC.
 */

const IST = "Asia/Calcutta";
const ET = "America/New_York";

/** 09:30 New York on Thursday 17 September 2026 — the opening bell, in seconds. */
const OPEN = Date.parse("2026-09-17T13:30:00Z") / 1000;
/** 16:00 New York the same day — the closing bell. */
const CLOSE = Date.parse("2026-09-17T20:00:00Z") / 1000;

/* The reader's own complaint, as an assertion: "in india it should be from
   7 pm to 1:30 am". */
test("a New York session reads 19:00 to 01:30 for a reader in India", () => {
  assert.match(formatStamp(OPEN, true, IST), /19:00/);
  assert.match(formatStamp(CLOSE, true, IST), /01:30/);
});

test("and the closing bell has already rolled over to the next date there", () => {
  assert.match(
    formatStamp(CLOSE, true, IST),
    /Sep 18, 2026/,
    "01:30 IST on the 18th is 16:00 ET on the 17th; printing the 17th beside 01:30 would be a lie",
  );
});

/* A bare 19:00 could be anywhere. The zone name is what makes the number
   checkable, and its absence was the original fault here — not the zone. */
test("an intraday stamp always names the zone it is counting in", () => {
  const ist = formatStamp(OPEN, true, IST);
  assert.ok(/India|IST/i.test(ist), `expected the reader's zone to be named, got "${ist}"`);
  assert.ok(
    !/\d\s+(GMT|UTC)[+-]/.test(ist),
    `a bare offset tells the reader nothing the number did not: "${ist}"`,
  );
  assert.ok(/EDT|EST|Eastern|New York/i.test(formatStamp(OPEN, true, ET)));
});

/* ET is still available and still correct — it is the market's clock, and the
   fallback when a runtime will not resolve the reader's. */
test("the same instant in New York still reads 09:30", () => {
  assert.match(formatStamp(OPEN, true, ET), /09:30/);
  assert.match(formatStamp(OPEN, true, ET), /Sep 17, 2026/);
});

/* A daily bar is a session, not a moment. A clock on it would invite the
   reader to believe the close happened at 05:30 their time. */
test("a daily bar carries a date, with no clock and no zone", () => {
  const daily = formatStamp(OPEN, false, IST);
  assert.equal(daily, "Sep 17, 2026");
  assert.doesNotMatch(daily, /:/, "no clock");
  assert.doesNotMatch(daily, /IST|ET|GMT/, "no zone");
});

/* The formatters are cached per zone; a cache keyed wrongly would hand the
   second zone the first one's answer, which is the sort of bug that only
   appears for the second reader. */
test("two zones asked in turn each get their own answer", () => {
  assert.match(formatStamp(OPEN, true, ET), /09:30/);
  assert.match(formatStamp(OPEN, true, IST), /19:00/);
  assert.match(formatStamp(OPEN, true, ET), /09:30/, "and the first is not clobbered");
});
