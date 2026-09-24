import test from "node:test";
import assert from "node:assert/strict";

import { quoteCloseDay, sessionClose } from "../lib/market/prior-close.ts";
import { endOnClose } from "../lib/market/regular-session.ts";

/* The close a chart ends on, between 00:45 and 04:00 ET.
 *
 * The worker reads the daily series at 00:45 ET, and the daily bars hold back
 * only TODAY's bar — so the session that ended a few hours earlier goes in
 * whether or not Polygon has finalized it, and a running bar's close is the
 * last post-market print (official-close.ts: running "sometime between 20:00
 * and 06:00 ET for 23 Sep 2026"). Until the 04:00 roll the card still holds
 * the session before, so the chart asked the daily bars for that session's
 * close and wrote the post-market print over the route's official 337.02 —
 * which the route had resolved correctly, with the running-bar check this
 * path skipped. */

const ET = (iso: string) => Date.parse(iso);

/* history.daily as the page held it at 01:00 ET on the 24th: the 22nd final,
   the 23rd still running at AAPL's 19:59 post-market print. */
const daily = [
  { at: ET("2026-09-22T00:00:00-04:00"), price: 339.75 },
  { at: ET("2026-09-23T00:00:00-04:00"), price: 336.86 },
];

test("a session newer than the card's has no close the page can vouch for", () => {
  const cardDay = quoteCloseDay(ET("2026-09-23T19:59:00-04:00"));
  assert.equal(cardDay, "2026-09-22");
  assert.equal(sessionClose("2026-09-23", { daily, previousClose: 339.75, cardDay }), null);
});

test("so the route's official close at the bell stands", () => {
  const route = [
    { at: ET("2026-09-23T15:59:00-04:00"), price: 336.95, open: 336.95, high: 336.95, low: 336.95, volume: 1 },
    { at: ET("2026-09-23T16:00:00-04:00"), price: 337.02, open: 337.02, high: 337.02, low: 337.02, volume: null },
  ];
  const close = sessionClose("2026-09-23", { daily, previousClose: 339.75, cardDay: "2026-09-22" });
  assert.equal(endOnClose(route, close, Number.POSITIVE_INFINITY).at(-1)?.price, 337.02);
});

test("the card still answers for its own session, and the bars for any older one", () => {
  const src = { daily, previousClose: 337.02, cardDay: "2026-09-23" };
  assert.equal(sessionClose("2026-09-23", src), 337.02, "after the roll the card is the 23rd's");
  assert.equal(sessionClose("2026-09-22", src), 339.75, "a session before the card's is long final");
});

test("with no card at all, the bars are all there is", () => {
  assert.equal(sessionClose("2026-09-22", { daily, previousClose: null, cardDay: null }), 339.75);
});
