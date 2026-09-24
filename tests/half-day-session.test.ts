import test from "node:test";
import assert from "node:assert/strict";

import {
  nextOpening,
  pricesMove,
  sessionAt,
  sessionNotices,
  tradingDay,
} from "../lib/market/session.ts";
import { liveness } from "../lib/market/liveness.ts";
import { dueSweep } from "../lib/market/refresh/plan.ts";

/* Half-days, holidays and the two DST Sundays, asserted from the Eastern wall
 * clock.
 *
 * On a half-day the regular session ends at 13:00 ET and the post-market runs
 * 13:00-17:00. Before this, sessionAt kept the ordinary 16:00 bell every
 * weekday: on Black Friday the pill said "US Market" through three hours of
 * post-market, the pulsing dot and the hot sweep kept going until 20:00 on a
 * book that shut at 17:00, and the pill announced a 01:30 IST post-market that
 * had opened at 23:30.
 *
 * Instants are written with their Eastern offset (-05:00 EST, -04:00 EDT) so
 * each one reads as the wall-clock time it is testing.
 */

const s = (iso: string) => Date.parse(iso) / 1000;
const phaseAt = (iso: string) => sessionAt(s(iso)).phase;

/* ------------------------------------------------------------------ */
/* The half-day itself                                                 */
/* ------------------------------------------------------------------ */

test("Black Friday 2026 closes at 13:00 and its post-market ends at 17:00", () => {
  assert.equal(phaseAt("2026-11-27T03:59:00-05:00"), "closed");
  assert.equal(phaseAt("2026-11-27T04:00:00-05:00"), "pre-market", "the pre-market is untouched");
  assert.equal(phaseAt("2026-11-27T09:29:00-05:00"), "pre-market");
  assert.equal(phaseAt("2026-11-27T09:30:00-05:00"), "open");
  assert.equal(phaseAt("2026-11-27T12:59:00-05:00"), "open");
  assert.equal(phaseAt("2026-11-27T13:00:00-05:00"), "post-market", "the early bell");
  assert.equal(phaseAt("2026-11-27T15:30:00-05:00"), "post-market", "not the regular session any more");
  assert.equal(phaseAt("2026-11-27T16:59:00-05:00"), "post-market");
  assert.equal(phaseAt("2026-11-27T17:00:00-05:00"), "closed", "the early post-market close");
  assert.equal(phaseAt("2026-11-27T18:00:00-05:00"), "closed");
});

test("after 17:00 on a half-day nothing moves and nothing is live", () => {
  const after = sessionAt(s("2026-11-27T17:30:00-05:00"));
  assert.equal(pricesMove(after.phase), false);
  assert.equal(after.live, false);
  assert.equal(after.lastTick, "—");
  assert.equal(after.label, "Market closed");

  const post = sessionAt(s("2026-11-27T13:30:00-05:00"));
  assert.equal(post.live, false, "13:30 is post-market, so the chrome bar must not say open");
  assert.equal(post.label, "Post-market");
});

test("Christmas Eve 2026 is a half-day too", () => {
  assert.equal(phaseAt("2026-12-24T12:59:00-05:00"), "open");
  assert.equal(phaseAt("2026-12-24T13:00:00-05:00"), "post-market");
  assert.equal(phaseAt("2026-12-24T16:59:00-05:00"), "post-market");
  assert.equal(phaseAt("2026-12-24T17:00:00-05:00"), "closed");
});

test("a summer half-day keeps its 13:00 bell in EDT", () => {
  // Thursday 3 July 2025.
  assert.equal(phaseAt("2025-07-03T12:59:00-04:00"), "open");
  assert.equal(phaseAt("2025-07-03T13:00:00-04:00"), "post-market");
  assert.equal(phaseAt("2025-07-03T16:59:00-04:00"), "post-market");
  assert.equal(phaseAt("2025-07-03T17:00:00-04:00"), "closed");
});

test("the days either side of a half-day keep the ordinary hours", () => {
  // Thanksgiving eve, and 2 July 2026 — the day before an OBSERVED holiday is
  // not a half-day (in 2026 July 3 is itself the holiday).
  for (const day of ["2026-11-25", "2026-07-02"]) {
    const off = day.startsWith("2026-11") ? "-05:00" : "-04:00";
    assert.equal(phaseAt(`${day}T15:59:00${off}`), "open", `${day} 15:59`);
    assert.equal(phaseAt(`${day}T16:00:00${off}`), "post-market", `${day} 16:00`);
    assert.equal(phaseAt(`${day}T19:59:00${off}`), "post-market", `${day} 19:59`);
    assert.equal(phaseAt(`${day}T20:00:00${off}`), "closed", `${day} 20:00`);
  }
});

/* ------------------------------------------------------------------ */
/* What the pill announces                                              */
/* ------------------------------------------------------------------ */

test("on a half-day morning the next opening is the 13:00 post-market", () => {
  const n = nextOpening(s("2026-11-27T11:00:00-05:00"));
  assert.ok(n);
  assert.equal(n.label, "US Post-market opens");
  assert.equal(n.at, s("2026-11-27T13:00:00-05:00"));
  assert.match(n.time, /11:30\s*pm/i, "13:00 EST is 23:30 IST, not the ordinary 02:30");
});

test("once the half-day's post-market has shut, the next opening is Monday's", () => {
  const n = nextOpening(s("2026-11-27T17:30:00-05:00"));
  assert.ok(n);
  assert.equal(n.label, "US Pre-market opens");
  assert.equal(n.at, s("2026-11-30T04:00:00-05:00"));
});

test("Christmas Eve evening steps over Christmas and the weekend", () => {
  const n = nextOpening(s("2026-12-24T18:00:00-05:00"));
  assert.ok(n);
  assert.equal(n.at, s("2026-12-28T04:00:00-05:00"));
});

test("a half-day says it closes early, and when, while it trades", () => {
  const pre = sessionAt(s("2026-11-27T08:00:00-05:00")).closes;
  assert.ok(pre, "a reader in the pre-market is told before the bell");
  assert.equal(pre.label, "US Market closes early");
  assert.equal(pre.at, s("2026-11-27T13:00:00-05:00"));
  assert.match(pre.time, /11:30\s*pm/i);

  const open = sessionAt(s("2026-11-27T11:00:00-05:00")).closes;
  assert.deepEqual(open, pre, "the same close all morning");

  const post = sessionAt(s("2026-11-27T14:00:00-05:00")).closes;
  assert.ok(post);
  assert.equal(post.label, "US Post-market ends");
  assert.equal(post.at, s("2026-11-27T17:00:00-05:00"));
  assert.match(post.time, /3:30\s*am/i, "17:00 EST is 03:30 IST");

  assert.equal(sessionAt(s("2026-11-27T17:30:00-05:00")).closes, null, "nothing left to close");
  assert.equal(sessionAt(s("2026-11-27T03:00:00-05:00")).closes, null, "nor before anything opens");
});

test("an ordinary day announces no early close", () => {
  for (const iso of ["2026-09-24T08:00:00-04:00", "2026-09-24T11:00:00-04:00", "2026-09-24T18:00:00-04:00"]) {
    assert.equal(sessionAt(s(iso)).closes, null, iso);
  }
});

test("the pill's notices: the opening, and on a half-day the early close in time order", () => {
  const ordinary = sessionNotices(sessionAt(s("2026-09-24T06:00:00-04:00")));
  assert.deepEqual(ordinary.map((n) => n.label), ["US Market opens"]);

  const preHalf = sessionNotices(sessionAt(s("2026-11-27T08:00:00-05:00")));
  assert.deepEqual(preHalf.map((n) => n.label), ["US Market opens", "US Market closes early"]);

  /* During the half-day's regular session the next opening IS the early close
     — the post-market starts at 13:00 — so the pill says the more useful of
     the two once rather than the same instant twice. */
  const openHalf = sessionNotices(sessionAt(s("2026-11-27T11:00:00-05:00")));
  assert.deepEqual(openHalf.map((n) => n.label), ["US Market closes early"]);

  const postHalf = sessionNotices(sessionAt(s("2026-11-27T14:00:00-05:00")));
  assert.deepEqual(postHalf.map((n) => n.label), ["US Post-market ends", "US Pre-market opens"]);
});

test("a session serialised before `closes` existed still yields its opening", () => {
  // Only `opens`, as an ISR page rendered before this change hands it over.
  const notices = sessionNotices({ opens: sessionAt(s("2026-09-24T06:00:00-04:00")).opens });
  assert.deepEqual(notices.map((n) => n.label), ["US Market opens"]);
});

/* ------------------------------------------------------------------ */
/* One day's hours                                                     */
/* ------------------------------------------------------------------ */

test("tradingDay gives a day's hours as instants, and null when it does not trade", () => {
  const half = tradingDay("2026-11-27");
  assert.ok(half);
  assert.equal(half.earlyClose, true);
  assert.equal(half.preOpen, s("2026-11-27T04:00:00-05:00"));
  assert.equal(half.open, s("2026-11-27T09:30:00-05:00"));
  assert.equal(half.close, s("2026-11-27T13:00:00-05:00"));
  assert.equal(half.postClose, s("2026-11-27T17:00:00-05:00"));

  const ordinary = tradingDay("2026-09-24");
  assert.ok(ordinary);
  assert.equal(ordinary.earlyClose, false);
  assert.equal(ordinary.close, s("2026-09-24T16:00:00-04:00"));
  assert.equal(ordinary.postClose, s("2026-09-24T20:00:00-04:00"));

  assert.equal(tradingDay("2026-11-26"), null, "Thanksgiving");
  assert.equal(tradingDay("2026-11-28"), null, "Saturday");
  assert.equal(tradingDay("2026-11-29"), null, "Sunday");
  assert.equal(tradingDay("not a day"), null);
});

/* ------------------------------------------------------------------ */
/* The two DST Sundays                                                 */
/* ------------------------------------------------------------------ */

/* 8 March 2026: 02:00 EST becomes 03:00 EDT. The Friday before keeps EST
   hours, the Monday after keeps EDT hours, and nothing in between trades. */
test("spring forward: Friday is EST, Monday is EDT, Sunday is shut", () => {
  const fri = tradingDay("2026-03-06");
  assert.ok(fri);
  assert.equal(fri.close, Date.parse("2026-03-06T21:00:00Z") / 1000, "16:00 EST");

  const mon = tradingDay("2026-03-09");
  assert.ok(mon);
  assert.equal(mon.preOpen, Date.parse("2026-03-09T08:00:00Z") / 1000, "04:00 EDT");
  assert.equal(mon.open, Date.parse("2026-03-09T13:30:00Z") / 1000, "09:30 EDT");
  assert.equal(mon.close, Date.parse("2026-03-09T20:00:00Z") / 1000, "16:00 EDT");

  assert.equal(tradingDay("2026-03-08"), null);
  for (const iso of ["2026-03-08T06:30:00Z", "2026-03-08T07:30:00Z", "2026-03-08T15:00:00Z"]) {
    assert.equal(phaseAt(iso), "closed", `Sunday ${iso}`);
  }

  assert.equal(phaseAt("2026-03-09T13:29:00Z"), "pre-market");
  assert.equal(phaseAt("2026-03-09T13:30:00Z"), "open", "the first EDT bell is 13:30Z, not 14:30Z");
});

test("spring forward: the next opening either side of 02:00 is Monday 04:00 EDT", () => {
  const monday = Date.parse("2026-03-09T08:00:00Z") / 1000;
  for (const iso of [
    "2026-03-07T12:00:00Z", // Saturday
    "2026-03-08T06:30:00Z", // Sunday 01:30 EST, before the change
    "2026-03-08T07:30:00Z", // Sunday 03:30 EDT, after it
  ]) {
    const n = nextOpening(s(iso));
    assert.ok(n, iso);
    assert.equal(n.at, monday, iso);
    assert.equal(n.label, "US Pre-market opens");
  }
});

/* 1 November 2026: 02:00 EDT becomes 01:00 EST, so 01:30 happens twice. */
test("fall back: Friday is EDT, Monday is EST, and both 01:30s point at Monday", () => {
  const fri = tradingDay("2026-10-30");
  assert.ok(fri);
  assert.equal(fri.close, Date.parse("2026-10-30T20:00:00Z") / 1000, "16:00 EDT");

  const mon = tradingDay("2026-11-02");
  assert.ok(mon);
  assert.equal(mon.preOpen, Date.parse("2026-11-02T09:00:00Z") / 1000, "04:00 EST");
  assert.equal(mon.open, Date.parse("2026-11-02T14:30:00Z") / 1000, "09:30 EST");

  const monday = Date.parse("2026-11-02T09:00:00Z") / 1000;
  for (const iso of ["2026-11-01T05:30:00Z", "2026-11-01T06:30:00Z"]) {
    assert.equal(phaseAt(iso), "closed", iso);
    const n = nextOpening(s(iso));
    assert.ok(n, iso);
    assert.equal(n.at, monday, iso);
  }

  assert.equal(phaseAt("2026-11-02T14:29:00Z"), "pre-market");
  assert.equal(phaseAt("2026-11-02T14:30:00Z"), "open", "the first EST bell is 14:30Z");
});

/* A Friday post-market at 19:00 EST is already Saturday in UTC. The trading
   day is the exchange's, not the server's. */
test("a Friday post-market that is Saturday in UTC is still Friday's post-market", () => {
  assert.equal(phaseAt("2026-11-06T19:30:00-05:00"), "post-market");
  assert.equal(new Date(s("2026-11-06T19:30:00-05:00") * 1000).getUTCDay(), 6, "Saturday in UTC");
  assert.equal(phaseAt("2026-03-06T19:00:00-05:00"), "post-market");

  const n = nextOpening(s("2026-11-06T19:30:00-05:00"));
  assert.ok(n);
  assert.equal(n.at, s("2026-11-09T04:00:00-05:00"), "Monday's pre-market");

  /* And on a half-day Friday the same instant is past the 17:00 close. */
  assert.equal(phaseAt("2026-11-27T19:00:00-05:00"), "closed");
});

/* ------------------------------------------------------------------ */
/* The two consumers that take their phase from sessionAt              */
/* ------------------------------------------------------------------ */

test("liveness follows the half-day: delayed at 14:00, idle after 17:00", () => {
  const at14 = s("2026-11-27T14:00:00-05:00");
  const at1730 = s("2026-11-27T17:30:00-05:00");
  assert.equal(liveness(null, sessionAt(at14).phase, at14 * 1000).state, "delayed");
  assert.equal(liveness(null, sessionAt(at1730).phase, at1730 * 1000).state, "idle");
});

test("the hot sweep slows to half-hourly once a half-day's post-market shuts", () => {
  const ten = 10 * 60_000;
  const at14 = s("2026-11-27T14:00:00-05:00") * 1000;
  const at1730 = s("2026-11-27T17:30:00-05:00") * 1000;
  assert.equal(dueSweep(at14, { hot: at14 - ten, full: at14 }, sessionAt(at14 / 1000).phase).hot, true);
  assert.equal(
    dueSweep(at1730, { hot: at1730 - ten, full: at1730 }, sessionAt(at1730 / 1000).phase).hot,
    false,
    "17:30 on a half-day is shut; a five-minute sweep would re-read identical bytes",
  );
});
