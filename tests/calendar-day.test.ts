import test from "node:test";
import assert from "node:assert/strict";

import { toCalendarEvents } from "../lib/api/normalize/calendar.ts";
import { calendarDate, readerDay } from "../lib/market/session.ts";

/* Which day the calendar thinks it is.
 *
 * "Today"/"Tomorrow" was measured against UTC midnight — the Render box's day,
 * which is nobody's. India is UTC+5:30, so for the five and a half hours after
 * midnight IST the server's date and the reader's disagreed, and the page said
 * "Today · Sun, Sep 20" to somebody whose own phone read Monday the 21st. It
 * said it in an h2 and in the section's aria-label.
 *
 * The date is now CARRIED from the feed rather than rebuilt as `now + offset
 * days`, and the gloss beside it is measured against the reader's civil day.
 */

const ex = (date: string) => [
  {
    ticker: "AAPL",
    actions: {
      status: "OK",
      dividends: [
        { ex_dividend_date: date, pay_date: null, cash_amount: 0.25, currency: "USD", frequency: 4 },
      ],
      splits: null,
      ipos: null,
      events: null,
    } as never,
  },
];

const only = (nowMs: number, date: string) => {
  const [e] = toCalendarEvents(ex(date), nowMs, 5);
  assert.ok(e, `no event built for ${date}`);
  return e;
};

/* 02:00 IST on Monday 21 September is 20:30Z on SUNDAY the 20th. The reader's
   day is Monday; the host's is Sunday. This is the exact hour the bug lived in. */
const TWO_AM_IST_MON_21 = Date.parse("2026-09-20T20:30:00Z");

test("at 02:00 in India, the reader's own day is what counts", () => {
  assert.equal(
    only(TWO_AM_IST_MON_21, "2026-09-21").offset,
    0,
    "the 21st is TODAY for a reader in India, whatever UTC still says",
  );
  assert.equal(
    only(TWO_AM_IST_MON_21, "2026-09-20").offset,
    -1,
    "and the 20th is yesterday, not today",
  );
  assert.equal(only(TWO_AM_IST_MON_21, "2026-09-22").offset, 1);
});

/* The reverse check: in the middle of the Indian working day the two agree, so
   the fix must not have moved anything that was already right. */
test("and in the middle of the day nothing moved", () => {
  const noon = Date.parse("2026-09-21T06:30:00Z"); // 12:00 IST Monday
  assert.equal(only(noon, "2026-09-21").offset, 0);
  assert.equal(only(noon, "2026-09-22").offset, 1);
  assert.equal(only(noon, "2026-09-18").offset, -3);
});

/* The date is the event's own, not a reconstruction. It used to be rebuilt as
   `(at + offset * DAY)`, which made the printed date a function of whichever
   clock the caller passed — and the dashboard passed the SWEEP's timestamp
   while the offsets were measured against the wall clock, so the rail could
   print "Today" beside a date a month old. */
test("the date shown is the event's own, whatever the clock the page had", () => {
  const e = only(TWO_AM_IST_MON_21, "2026-09-24");
  assert.equal(e.date, "2026-09-24", "carried, ten characters, as the feed gave it");
  assert.equal(calendarDate(e).date, "Thu, Sep 24");
});

/* Two readers on two machines must be shown the same date for the same event,
   because these components server-render and a difference is a hydration
   mismatch. calendarDate takes no clock at all now, so this is structural. */
test("the same event reads the same however often it is asked", () => {
  const e = only(TWO_AM_IST_MON_21, "2026-09-24");
  assert.equal(calendarDate(e).date, calendarDate(e).date);
  assert.equal(calendarDate({ ...e, offset: 99 }).date, "Thu, Sep 24", "the offset cannot move it");
});

/* A malformed date must not render as "Invalid Date" in an h2. */
test("a date the feed mangles is shown raw rather than as nonsense", () => {
  assert.equal(calendarDate({ ...only(TWO_AM_IST_MON_21, "2026-09-24"), date: "nonsense" }).date, "nonsense");
});

/* A cached page carries the offsets it was built with. At 14:15 IST on Friday
   25 Sep 2026 the calendar headed its first section "Tomorrow · Fri, Sep 25",
   called the 30th "In 6 days" and the 21st "3 days ago", all a day behind.
   Given the reader's own day, the word is re-counted from the event's date. */
test("given the reader's day, the word is counted from the event's own date", () => {
  const built = only(Date.parse("2026-09-24T08:45:00Z"), "2026-09-25"); // a page built on the 24th
  assert.equal(calendarDate(built).relative, "Tomorrow", "what the cached page says without a day");

  const today = readerDay(Date.parse("2026-09-25T08:45:00Z")); // 14:15 IST on the 25th
  assert.equal(today, "2026-09-25");
  assert.deepEqual(
    [calendarDate(built, today).relative, calendarDate(built, today).offset],
    ["Today", 0],
  );
  assert.equal(calendarDate({ ...built, date: "2026-09-30" }, today).relative, "In 5 days");
  assert.equal(calendarDate({ ...built, date: "2026-09-21" }, today).relative, "4 days ago");
});

test("without a day, or with one it cannot read, the stored offset stands", () => {
  const e = only(TWO_AM_IST_MON_21, "2026-09-22");
  assert.equal(calendarDate(e).relative, "Tomorrow");
  assert.equal(calendarDate(e, null).relative, "Tomorrow");
  assert.equal(calendarDate(e, "nonsense").offset, e.offset);
  assert.equal(calendarDate({ ...e, date: "nonsense" }, "2026-09-21").offset, e.offset);
});
