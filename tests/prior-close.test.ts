import test from "node:test";
import assert from "node:assert/strict";

import { priorClose } from "../lib/market/prior-close.ts";

/* The day chart's PREV CLOSE line.
 *
 * It read the LAST daily bar. That is right while the chart shows today's live
 * session, and wrong the moment it shows a past one — which before the bell it
 * always does. On 24 Sep 2026 pre-market the chart drew the 23rd's session and
 * its line read 342.70: the 22nd's bar, from a source whose "close" was not the
 * close. The line is the close of the session BEFORE the one on screen. */

/* Daily bars at Eastern midnight (04:00Z in September). */
const day = (iso: string, price: number) => ({ at: Date.parse(`${iso}T04:00:00Z`), price });
const daily = [day("2026-09-21", 338.98), day("2026-09-22", 339.75), day("2026-09-23", 337.02)];

/* Minutes of the 23rd's session: 09:30 ET = 13:30Z. */
const on23rd = Date.parse("2026-09-23T13:30:00Z");

test("a past session is measured against the close before IT, not the latest one", () => {
  assert.equal(priorClose(daily, on23rd), 339.75, "the 22nd's close, not the 23rd's");
});

test("and the same answer before the 23rd's bar has even been published", () => {
  assert.equal(priorClose(daily.slice(0, 2), on23rd), 339.75);
});

test("today's live session is measured against yesterday", () => {
  assert.equal(priorClose(daily, Date.parse("2026-09-24T14:00:00Z")), 337.02);
});

/* 01:00 in India is still the 23rd in New York — the comparison is by the
   EXCHANGE's day, or late bars of a session would pick a different basis than
   its early ones. */
test("the session's day is New York's, whatever the hour is elsewhere", () => {
  assert.equal(priorClose(daily, Date.parse("2026-09-23T19:59:00Z")), 339.75, "15:59 ET on the 23rd");
});

test("nothing to compare against gives nothing, not a zero", () => {
  assert.equal(priorClose([], on23rd), null);
  assert.equal(priorClose([day("2026-09-23", 337.02)], on23rd), null, "no session before it");
});

test("with no session on screen, the latest close stands in", () => {
  assert.equal(priorClose(daily, null), 337.02);
});
