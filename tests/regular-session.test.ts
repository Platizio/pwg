import test from "node:test";
import assert from "node:assert/strict";

import { bellOf, inRegularSession, regularSessionOnly } from "../lib/market/regular-session.ts";

/* Which bars a chart may draw.
 *
 * The intraday feed runs 04:00-20:00 Eastern in one undifferentiated series,
 * and the chart drew all of it — so a day chart opened at 13:30 in India
 * (04:00 ET) rather than at 19:00, when the market a reader is watching opens.
 * The rule is: the chart is the regular session, 09:30-16:00 ET, which is
 * 19:00-01:30 in India.
 *
 * Prices are NOT gated by this. A pre- or post-market print is a real price and
 * the header keeps following it; only the drawn shape is one session.
 */

const at = (iso: string) => Date.parse(iso);

/* 2026-09-22 is EDT (UTC-4), so 09:30 ET is 13:30Z and 16:00 ET is 20:00Z. */
test("the regular session is 09:30 to 16:00 in New York", () => {
  assert.equal(inRegularSession(at("2026-09-22T13:30:00Z")), true, "the opening bell");
  assert.equal(inRegularSession(at("2026-09-22T17:00:00Z")), true, "mid-session");
  assert.equal(inRegularSession(at("2026-09-22T20:00:00Z")), true, "the closing bell");
});

/* The close is kept on purpose: a bar stamped 16:00 is the closing print, and
   dropping it would take the day's close off the end of the day's chart. */
test("the closing print is kept, the first post-market bar is not", () => {
  assert.equal(inRegularSession(at("2026-09-22T20:00:00Z")), true, "16:00 ET");
  assert.equal(inRegularSession(at("2026-09-22T20:01:00Z")), false, "16:01 ET");
});

test("pre-market is not drawn", () => {
  assert.equal(inRegularSession(at("2026-09-22T08:00:00Z")), false, "04:00 ET — where the feed starts");
  assert.equal(inRegularSession(at("2026-09-22T13:29:00Z")), false, "09:29 ET, a minute early");
});

test("post-market is not drawn", () => {
  assert.equal(inRegularSession(at("2026-09-22T22:00:00Z")), false, "18:00 ET");
  assert.equal(inRegularSession(at("2026-09-23T00:00:00Z")), false, "20:00 ET, the extended close");
});

/* Winter is the trap: the same wall-clock session sits an hour later in UTC
   once the clocks go back, so anything comparing UTC hours would break in
   November and nobody would notice until then. */
test("and the session follows New York through the clock change", () => {
  // 2026-01-21 is EST (UTC-5): 09:30 ET is 14:30Z, 16:00 ET is 21:00Z.
  assert.equal(inRegularSession(at("2026-01-21T14:30:00Z")), true, "09:30 EST");
  assert.equal(inRegularSession(at("2026-01-21T21:00:00Z")), true, "16:00 EST");
  assert.equal(inRegularSession(at("2026-01-21T13:30:00Z")), false, "08:30 EST is pre-market");
  assert.equal(inRegularSession(at("2026-01-21T21:30:00Z")), false, "16:30 EST is post-market");
});

test("a full feed day is trimmed to its session", () => {
  const day = [
    { at: at("2026-09-22T08:00:00Z") }, // 04:00 pre
    { at: at("2026-09-22T12:00:00Z") }, // 08:00 pre
    { at: at("2026-09-22T13:30:00Z") }, // 09:30 open
    { at: at("2026-09-22T17:00:00Z") }, // 13:00
    { at: at("2026-09-22T20:00:00Z") }, // 16:00 close
    { at: at("2026-09-22T22:00:00Z") }, // 18:00 post
  ];
  assert.deepEqual(
    regularSessionOnly(day).map((p) => p.at),
    day.slice(2, 5).map((p) => p.at),
  );
});

/* The identity return is what lets a caller skip work, and what keeps React
   from seeing a new array on every render of an already-clean series. */
test("a series with nothing to drop comes back as itself", () => {
  const clean = [{ at: at("2026-09-22T14:00:00Z") }, { at: at("2026-09-22T15:00:00Z") }];
  assert.equal(regularSessionOnly(clean), clean);
});

test("nothing in, nothing out", () => {
  const empty: Array<{ at: number }> = [];
  assert.equal(regularSessionOnly(empty), empty);
  assert.equal(inRegularSession(Number.NaN), false);
});

/* ---------- two readings of the bell ---------- */

/* The same 16:00 minute means two different things depending on who stamped
 * it. The FETCHED day ends on a point the route adds at 16:00:00 carrying the
 * official close (the closing cross), and that point has to survive. The
 * gateway's LIVE series also has a 16:00 minute, and it is a post-market print:
 * measured 23 Sep 2026, AAPL's live 16:00 bar was not 337.02, the official
 * close. So the live path drops everything from the bell on, and the fetched
 * path keeps the bell itself. */

test("the live reading stops before the bell", () => {
  const opts = { close: "exclude" } as const;
  assert.equal(inRegularSession(at("2026-09-22T19:59:00Z"), opts), true, "15:59 ET is the last live minute");
  assert.equal(inRegularSession(at("2026-09-22T19:59:59Z"), opts), true, "a tick at 15:59:59");
  assert.equal(inRegularSession(at("2026-09-22T20:00:00Z"), opts), false, "16:00 ET is post-market on the live feed");
  assert.equal(inRegularSession(at("2026-09-22T13:30:00Z"), opts), true, "the open is unchanged");
});

test("a live day loses its 16:00 print, a fetched day keeps its official close", () => {
  const day = [
    { at: at("2026-09-22T13:30:00Z") },
    { at: at("2026-09-22T19:59:00Z") },
    { at: at("2026-09-22T20:00:00Z") },
    { at: at("2026-09-22T20:01:00Z") },
  ];
  assert.deepEqual(
    regularSessionOnly(day, { close: "exclude" }).map((p) => p.at),
    day.slice(0, 2).map((p) => p.at),
  );
  assert.deepEqual(
    regularSessionOnly(day).map((p) => p.at),
    day.slice(0, 3).map((p) => p.at),
    "inclusive by default, which is what the fetched series needs",
  );
});

/* ---------- half-days ---------- */

/* 27 Nov 2026, the day after Thanksgiving, closes at 13:00 ET (EST, UTC-5, so
   18:00Z). Everything between 13:00 and 16:00 that day is after-hours trading,
   and a chart that kept it would draw three hours of post-market as if it were
   the session. */
test("on a half-day the session ends at 13:00", () => {
  assert.equal(inRegularSession(at("2026-11-27T14:30:00Z")), true, "09:30 EST");
  assert.equal(inRegularSession(at("2026-11-27T18:00:00Z")), true, "13:00, the half-day bell, fetched reading");
  assert.equal(inRegularSession(at("2026-11-27T18:00:00Z"), { close: "exclude" }), false, "13:00 live reading");
  assert.equal(inRegularSession(at("2026-11-27T17:59:00Z"), { close: "exclude" }), true, "12:59");
  assert.equal(inRegularSession(at("2026-11-27T18:01:00Z")), false, "13:01 is after-hours");
  assert.equal(inRegularSession(at("2026-11-27T20:00:00Z")), false, "15:00 is after-hours on a half-day");
  assert.equal(inRegularSession(at("2026-11-27T21:00:00Z")), false, "16:00 too");
});

test("the bell, as an instant, follows New York's clock and its half-days", () => {
  assert.equal(bellOf("2026-09-23"), at("2026-09-23T20:00:00Z"), "16:00 EDT");
  assert.equal(bellOf("2026-01-21"), at("2026-01-21T21:00:00Z"), "16:00 EST");
  assert.equal(bellOf("2026-11-27"), at("2026-11-27T18:00:00Z"), "13:00 EST on the half-day");
  assert.equal(bellOf("2026-12-24"), at("2026-12-24T18:00:00Z"), "Christmas Eve");
  assert.equal(bellOf("not a day"), null);
});
