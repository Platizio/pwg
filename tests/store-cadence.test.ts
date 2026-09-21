import test from "node:test";
import assert from "node:assert/strict";

import { errorBackoffMs, nextCheckAt, nextEasternClose } from "../lib/market/store/cadence.ts";
import type { CadenceInput } from "../lib/market/store/cadence.ts";
import type { Section } from "../lib/market/store/sections.ts";
import type { RawCorporateActions } from "../lib/api/clients/fundamentals.ts";

/* When to ask the gateway again.
 *
 * There is no cheaper question available — no ETag, no delta, no change feed —
 * so every "has this changed" costs a full fetch. The whole saving is in not
 * asking: a company's filings move four times a year and its short interest
 * twice a month, and asking either of them hourly buys nothing but calls.
 *
 * These tests pin the table, the doubling, the cap, and the three places where
 * the table is overruled by something the data itself says: an ex-dividend
 * date a couple of days out, an earnings date inside the interval we were
 * about to sleep through, and a tracking fund whose bars are worth re-reading
 * while prices are moving.
 */

const MINUTE = 60_000;
const HOUR = 3_600_000;
const DAY = 86_400_000;
/* How long after the bell the gateway actually publishes the day's bar. Kept
   here as a literal rather than imported, so a change to the module has to be
   restated deliberately in the test that pins it. */
const PUBLISH_LAG = 8 * HOUR + 45 * MINUTE;

/** Tuesday 15 September 2026, 10:00 in New York — mid-session. */
const TUE_10ET = Date.parse("2026-09-15T14:00:00Z");
/** The same Tuesday at 17:00 ET, an hour after the close. */
const TUE_17ET = Date.parse("2026-09-15T21:00:00Z");
/** That Tuesday's close. */
const TUE_CLOSE = Date.parse("2026-09-15T20:00:00Z");

/** A corporate-actions document carrying nothing but its calendar. */
function actionsWith(events: Array<{ date: string; type: string }>): RawCorporateActions {
  return { status: "OK", dividends: null, splits: null, ipos: null, events };
}

function check(over: Partial<CadenceInput> & { section: Section }): number {
  return nextCheckAt({
    changed: true,
    unchangedStreak: 0,
    priority: 3,
    now: TUE_10ET,
    ...over,
  });
}

/** The gap to the next check, in ms. */
const gap = (over: Partial<CadenceInput> & { section: Section }) => check(over) - TUE_10ET;

/** Within the ±10% jitter band, and not a millisecond outside it. */
function near(actual: number, expected: number, what: string) {
  const slack = Math.abs(expected) * 0.1 + 2;
  assert.ok(
    Math.abs(actual - expected) <= slack,
    `${what}: expected about ${expected} ms, got ${actual} (off by ${actual - expected})`,
  );
}

/* ---------- the table, at both priorities ---------- */

/* Priority ≥2 is a name somebody has actually looked at — covered, visited, or
   on the wire. The rest of the universe is read on a slower clock. */
test("a fresh answer resets every section to its base interval", () => {
  near(gap({ section: "profile", priority: 3 }), DAY, "profile, covered");
  near(gap({ section: "profile", priority: 2 }), DAY, "profile, visited");
  near(gap({ section: "profile", priority: 1 }), 3 * DAY, "profile, the rest");

  near(gap({ section: "news_gateway", priority: 3 }), 6 * HOUR, "news, covered");
  near(gap({ section: "news_gateway", priority: 1 }), 6 * HOUR, "news, the rest");

  near(gap({ section: "corporate_actions", priority: 3 }), DAY, "actions, covered");
  near(gap({ section: "corporate_actions", priority: 1 }), DAY, "actions, the rest");

  near(gap({ section: "financials_annual", priority: 3 }), 7 * DAY, "filings, covered");
  near(gap({ section: "financials_annual", priority: 1 }), 7 * DAY, "filings, the rest");

  near(gap({ section: "short_interest", priority: 3 }), 3 * DAY, "short interest, covered");
  near(gap({ section: "short_interest", priority: 1 }), 3 * DAY, "short interest, the rest");

  near(gap({ section: "analyst", priority: 3 }), 30 * DAY, "analyst, covered");
  near(gap({ section: "analyst", priority: 1 }), 30 * DAY, "analyst, the rest");
});

/* ---------- doubling, and where it stops ---------- */

test("each unchanged answer doubles the wait", () => {
  const unchanged = (streak: number) =>
    gap({ section: "profile", priority: 3, changed: false, unchangedStreak: streak });

  near(unchanged(1), 2 * DAY, "one unchanged read");
  near(unchanged(2), 4 * DAY, "two");
});

test("the doubling stops at the section's cap rather than running to a month", () => {
  const unchanged = (streak: number) =>
    gap({ section: "profile", priority: 3, changed: false, unchangedStreak: streak });

  near(unchanged(3), 7 * DAY, "8d would exceed the 7d cap");
  near(unchanged(12), 7 * DAY, "and it stays there");
});

test("a section whose base is its cap never doubles at all", () => {
  near(
    gap({ section: "news_gateway", changed: false, unchangedStreak: 6 }),
    6 * HOUR,
    "news is six-hourly forever",
  );
});

test("a change resets the interval to base, however long the run of quiet was", () => {
  near(
    gap({ section: "short_interest", changed: true, unchangedStreak: 9 }),
    3 * DAY,
    "a filing finally moved",
  );
});

/* ---------- jitter ---------- */

/* Deterministic because the worker must be able to re-derive a due time, and
   because Math.random in a scheduler is untestable by construction. */
test("the jitter is deterministic and stays inside a tenth", () => {
  const input: CadenceInput = {
    section: "analyst",
    changed: false,
    unchangedStreak: 4,
    priority: 3,
    now: TUE_10ET,
  };
  assert.equal(nextCheckAt(input), nextCheckAt({ ...input }));

  const spread = new Set<number>();
  for (let streak = 3; streak <= 8; streak += 1) {
    const at = nextCheckAt({ ...input, unchangedStreak: streak }) - TUE_10ET;
    // Every streak here is past the cap, so any difference is jitter alone.
    near(at, 30 * DAY, `analyst at streak ${streak}`);
    spread.add(at);
  }
  assert.ok(spread.size > 1, "a cadence that jitters by a constant is not jittering");
});

/* ---------- corporate actions, when the calendar is close ---------- */

test("an ex-dividend date a couple of days out is worth a twelve-hour look", () => {
  const payload = { dividends: [{ ex_dividend_date: "2026-09-17", cash_amount: 0.26 }] };
  near(gap({ section: "corporate_actions", payload }), 12 * HOUR, "ex-date in two days");
});

test("a corporate event inside three days does the same", () => {
  const payload = { events: [{ date: "2026-09-16", type: "ticker_change" }] };
  near(gap({ section: "corporate_actions", payload }), 12 * HOUR, "event tomorrow");
});

test("a dividend a fortnight out leaves the ordinary cadence alone", () => {
  const payload = { dividends: [{ ex_dividend_date: "2026-09-30", cash_amount: 0.26 }] };
  near(gap({ section: "corporate_actions", payload }), DAY, "nothing near");
});

/* ---------- filings, around an earnings date ---------- */

/* Seven days is the right interval for a document that changes quarterly and
   the wrong one for the week it changes in: an earnings date inside the window
   we were about to sleep through is the single moment the statements move. */
test("an earnings date inside the interval pulls the next check to the day after it", () => {
  const at = check({
    section: "financials_annual",
    context: { actions: actionsWith([{ date: "2026-09-18", type: "earnings" }]) },
  });
  assert.equal(at, Date.parse("2026-09-19T00:00:00Z"));
});

test("an event beyond the interval, or already past, changes nothing", () => {
  const beyond = check({
    section: "financials_annual",
    context: { actions: actionsWith([{ date: "2026-10-30", type: "earnings" }]) },
  });
  near(beyond - TUE_10ET, 7 * DAY, "an event a month out");

  const past = check({
    section: "financials_annual",
    context: { actions: actionsWith([{ date: "2026-09-10", type: "earnings" }]) },
  });
  near(past - TUE_10ET, 7 * DAY, "an event last week");
});

/* ---------- daily bars ---------- */

/* Not "after the close". The gateway publishes a session's daily bar around
 * midnight Eastern, and the refresh log shows every mass `changed` batch
 * landing between 00:00 and 04:00 ET — while a pass at 23:00 on the Friday
 * read 2,011 symbols as UNCHANGED, seven hours after that session had ended.
 *
 * Reading at close+20min therefore asked a question whose answer could not yet
 * be yes. It came back unchanged, wrote nothing, and scheduled the NEXT close
 * — so the stored series sat a full session behind, and across a weekend the
 * terminal's week still ended on Thursday all through Monday. */
test("daily history is read when the bar is published, not when the bell rings", () => {
  const published = TUE_CLOSE + PUBLISH_LAG;
  assert.equal(check({ section: "history_daily", changed: false, unchangedStreak: 9 }), published);
  assert.equal(check({ section: "history_daily", priority: 1 }), published);
  assert.equal(check({ section: "history_daily", phase: "closed" }), published);
});

/** Columns shaped as the store holds them, ending on the given feed date. */
const barsEnding = (date: string) => ({ date: [`${date} 00:00:00 EDT`], price: [1] });

/* The bug itself. An hour after Tuesday's close the series still ends on
   Monday, because Tuesday's bar does not exist yet — and the old rule read
   that as "nothing has changed, try again after Wednesday's close". */
test("a session whose bar has not been published yet is waited for, not skipped", () => {
  const at = check({
    section: "history_daily",
    changed: false,
    now: TUE_17ET,
    payload: barsEnding("09/14/2026"),
  });
  assert.equal(at, TUE_CLOSE + PUBLISH_LAG, "Tuesday's own publication, eight hours out");
  assert.ok(at < TUE_CLOSE + DAY, "and certainly not after Wednesday's close");
});

/* The weekend case, which is the one a reader actually saw: Friday's bar is
   published on the Saturday, and a rule that walks to the next CLOSE would
   sleep until Monday evening with Friday sitting in the gateway all along. */
test("Friday's bar is waited for over the weekend, not until Monday", () => {
  const friClose = Date.parse("2026-09-18T20:00:00Z");
  const at = check({
    section: "history_daily",
    changed: false,
    now: friClose + 7 * HOUR,
    payload: barsEnding("09/17/2026"),
  });
  assert.equal(at, friClose + PUBLISH_LAG, "about 00:45 on the Saturday");
});

/* Publication is measured, not promised, so a late one must not cost the day. */
test("a publication that is late is retried hourly", () => {
  near(
    check({
      section: "history_daily",
      changed: false,
      now: TUE_CLOSE + PUBLISH_LAG + 30 * MINUTE,
      payload: barsEnding("09/14/2026"),
    }) - (TUE_CLOSE + PUBLISH_LAG + 30 * MINUTE),
    HOUR,
    "late publication",
  );
});

/* And a name that simply did not trade has no bar to wait for. Four thousand
   of those asking hourly for ever is the failure mode this bound exists for. */
test("but the retries stop by morning rather than running all day", () => {
  const morning = TUE_CLOSE + 15 * HOUR;
  assert.equal(
    check({ section: "history_daily", changed: false, now: morning, payload: barsEnding("09/14/2026") }),
    Date.parse("2026-09-16T20:00:00Z") + PUBLISH_LAG,
    "Wednesday's publication, not another hourly retry",
  );
});

/* The other direction: having the bar already must not schedule a read at a
   moment whose answer is known. Every Friday evening would otherwise book a
   Saturday call for all 4,400 names. */
test("a series that already covers the last close waits for the next session", () => {
  const friEvening = Date.parse("2026-09-18T20:00:00Z") + 7 * HOUR;
  assert.equal(
    check({ section: "history_daily", changed: true, now: friEvening, payload: barsEnding("09/18/2026") }),
    Date.parse("2026-09-21T20:00:00Z") + PUBLISH_LAG,
    "Monday's bar, published early Tuesday",
  );
});

/* The fourteen tracking funds are what the strips and the market comparison
   are drawn from, and they are the only bars a reader watches move. */
test("an ETF re-reads its bars every half hour while prices are moving", () => {
  near(gap({ section: "history_daily", priority: 3, phase: "open" }), 30 * MINUTE, "open");
  near(gap({ section: "history_daily", priority: 3, phase: "pre-market" }), 30 * MINUTE, "pre");
  near(gap({ section: "history_daily", priority: 3, phase: "post-market" }), 30 * MINUTE, "post");
});

test("only the ETFs get that, and only while the market is moving", () => {
  const after = TUE_CLOSE + PUBLISH_LAG;
  assert.equal(check({ section: "history_daily", priority: 2, phase: "open" }), after);
  assert.equal(check({ section: "history_daily", priority: 3, phase: "closed" }), after);
});

/* ---------- error backoff ---------- */

test("a failing section backs off by threes, and stops at six hours", () => {
  assert.equal(errorBackoffMs(1), 5 * MINUTE);
  assert.equal(errorBackoffMs(2), 15 * MINUTE);
  assert.equal(errorBackoffMs(3), 45 * MINUTE);
  assert.equal(errorBackoffMs(4), 135 * MINUTE);
  assert.equal(errorBackoffMs(5), 6 * HOUR, "405 minutes would be past the cap");
  assert.equal(errorBackoffMs(40), 6 * HOUR);
  assert.equal(errorBackoffMs(0), 5 * MINUTE, "a first attempt, however it is counted");
});

/* ---------- the close itself ---------- */

test("mid-session, the next close is today's", () => {
  assert.equal(nextEasternClose(TUE_10ET), TUE_CLOSE);
});

test("after the close, the next one is tomorrow's", () => {
  assert.equal(nextEasternClose(TUE_17ET), Date.parse("2026-09-16T20:00:00Z"));
});

test("a Friday evening waits for Monday", () => {
  assert.equal(
    nextEasternClose(Date.parse("2026-09-18T22:00:00Z")),
    Date.parse("2026-09-21T20:00:00Z"),
  );
});

/* 16:00 in New York is 20:00 UTC in summer and 21:00 UTC in winter. Adding a
   fixed number of hours to a UTC instant gets one of the two wrong, and gets
   it wrong quietly — the worker would simply start running an hour early or
   an hour late twice a year. */
test("the close is Eastern, so it moves with the clocks and not with UTC", () => {
  assert.equal(
    nextEasternClose(Date.parse("2026-03-06T23:00:00Z")),
    Date.parse("2026-03-09T20:00:00Z"),
    "Friday before the spring change → Monday 16:00 EDT",
  );
  assert.equal(
    nextEasternClose(Date.parse("2026-10-30T22:00:00Z")),
    Date.parse("2026-11-02T21:00:00Z"),
    "Friday before the autumn change → Monday 16:00 EST",
  );
});

test("the close itself is behind us, not ahead", () => {
  assert.equal(nextEasternClose(TUE_CLOSE), Date.parse("2026-09-16T20:00:00Z"));
});
