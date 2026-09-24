import test from "node:test";
import assert from "node:assert/strict";

import {
  chartReference,
  closeOnDay,
  priorClose,
  quoteCloseDay,
  sessionClose,
} from "../lib/market/prior-close.ts";

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

/* ---------- the dashed line is the card, the colour is the chart's own ---------- */

/* THE COMPLAINT, with a screenshot of a multi-day AAPL chart taken while the
 * market was shut: "if the previous close is at 339.73 why is the graph not
 * pointing to that at the end." The dashed PREV CLOSE line was computed by the
 * chart itself — the last five-minute bucket of the session before the final
 * one, 339.73 — while the page's "Previous close" card printed a different
 * figure. Two numbers wearing one name. The line now IS the card's figure,
 * handed in; what colours the line and measures the tooltip stays the chart's
 * own, because a week is measured from where the week starts. */

const minutes = [
  { at: Date.parse("2026-09-23T13:30:00Z"), price: 339.0 },
  { at: Date.parse("2026-09-23T20:00:00Z"), price: 337.02 },
];

test("the dashed line is exactly the card's figure, on every range", () => {
  for (const intraday of [true, false]) {
    const r = chartReference({ intraday, points: minutes, daily, previousClose: 337.02 });
    assert.equal(r.line, 337.02);
  }
});

test("no card figure, no line — never one the chart made up", () => {
  assert.equal(chartReference({ intraday: true, points: minutes, daily, previousClose: null }).line, null);
  assert.equal(chartReference({ intraday: false, points: minutes, daily, previousClose: 0 }).line, null);
});

test("the day is coloured against the close before the session on screen", () => {
  const r = chartReference({ intraday: true, points: minutes, daily, previousClose: 337.02 });
  assert.equal(r.basis, 339.75, "the 23rd drawn pre-market: measured from the 22nd, while the line reads the 23rd's own close");
});

test("a multi-day chart is coloured against its own first point", () => {
  const r = chartReference({ intraday: false, points: minutes, daily, previousClose: 337.02 });
  assert.equal(r.basis, 339.0);
});

test("the day falls back to its own open when no earlier close is known", () => {
  const r = chartReference({ intraday: true, points: minutes, daily: [], previousClose: null });
  assert.equal(r.basis, 339.0);
  assert.equal(chartReference({ intraday: true, points: [], daily, previousClose: 1 }).basis, null);
});

/* ---------- which session a quote's "yesterday close" is ---------- */

/* The feed rolls into a new trading day at 04:00 New York (lib/market/screen.ts
 * records the volume reset). Measured 24 Sep 2026 at 05:39 ET: AAPL's
 * yesterdayClose was 337.02, the 23rd's official close. Before 04:00, and all
 * through the 23rd's post-market, it is still the 22nd's. So the session the
 * card describes follows from the quote's own timestamp. */

const ET = (iso: string) => Date.parse(iso);

test("in pre-market the card is the last completed session's close", () => {
  assert.equal(quoteCloseDay(ET("2026-09-24T09:39:00Z")), "2026-09-23", "05:39 ET on the 24th");
  assert.equal(quoteCloseDay(ET("2026-09-24T08:00:00Z")), "2026-09-23", "04:00 ET exactly: rolled");
});

test("during and after a session, until the 04:00 roll, the card is the session before it", () => {
  assert.equal(quoteCloseDay(ET("2026-09-23T15:00:00Z")), "2026-09-22", "11:00 ET mid-session");
  assert.equal(quoteCloseDay(ET("2026-09-23T23:59:00Z")), "2026-09-22", "19:59 ET post-market");
  assert.equal(quoteCloseDay(ET("2026-09-24T06:00:00Z")), "2026-09-22", "02:00 ET, not yet rolled");
});

test("weekends and holidays are stepped over", () => {
  assert.equal(quoteCloseDay(ET("2026-09-21T09:00:00Z")), "2026-09-18", "Monday 05:00 ET: Friday");
  assert.equal(quoteCloseDay(ET("2026-09-08T09:00:00Z")), "2026-09-04", "Tuesday after Labor Day: the Friday before");
  assert.equal(quoteCloseDay(ET("2026-09-18T23:59:00Z")), "2026-09-17", "Friday post-market: Thursday");
});

test("no timestamp, no claim", () => {
  assert.equal(quoteCloseDay(null), null);
  assert.equal(quoteCloseDay(Number.NaN), null);
});

/* ---------- the official close of a given session ---------- */

test("a daily bar is found by its New York date, never by its index", () => {
  assert.equal(closeOnDay(daily, "2026-09-22"), 339.75);
  assert.equal(closeOnDay(daily, "2026-09-24"), null);
});

test("the card answers for the session it describes, the daily bars for any other", () => {
  const card = { daily: daily.slice(0, 2), previousClose: 337.02, asOf: ET("2026-09-24T09:04:17Z") };
  assert.equal(sessionClose("2026-09-23", card), 337.02, "pre-market: the card is the 23rd's close");
  assert.equal(sessionClose("2026-09-22", card), 339.75, "an older session comes from the bars");
  assert.equal(sessionClose("2026-09-25", card), null);

  /* After the bell the card is the 22nd's, so it is never used as the 23rd's
     close — and the 23rd's daily bar is not trusted either until the card has
     rolled past it: it may still be running (chart-close-guard.test.ts). */
  const postMarket = { daily, previousClose: 339.75, asOf: ET("2026-09-23T23:00:00Z") };
  assert.equal(sessionClose("2026-09-23", postMarket), null);
  assert.equal(
    sessionClose("2026-09-23", { daily: [], previousClose: 337.02, cardDay: "2026-09-23" }),
    337.02,
    "a caller may hand over the card's session already resolved",
  );
});
