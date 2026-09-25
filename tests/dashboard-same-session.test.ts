import assert from "node:assert/strict";
import test from "node:test";

import { BASIS_TOLERANCE, sameBasis, withTick } from "../components/dashboard/same-session.ts";

/* A board ranked on one session must not print another session's figures.

   Observed pre-market on 25 Sep 2026: "Top gainers" had been ranked on the
   previous session's move, and then each row took the morning's pre-market
   tick. Glucotrack showed −10.66% and Beneficient showed +11.38% on "Top
   losers". The ranking came from one session and the figures from another.
   A tick is taken only when it measures from the same previous close as the
   row. */

const tick = (price: number, previousClose: number | null) => ({
  price,
  previousClose,
  changePercent: previousClose === null ? null : ((price - previousClose) / previousClose) * 100,
});

test("a tick on the row's own basis is taken, price and change together", () => {
  // Row: 110 after +10% — the basis is 100.
  const row = { id: "A", price: 110, chg: 10 };
  const got = withTick(row, tick(112, 100));
  assert.equal(got.price, 112);
  assert.ok(Math.abs(got.chg - 12) < 1e-9);
  assert.equal(got.id, "A", "the rest of the row is untouched");
});

test("a post-market tick shares the regular session's close and is taken", () => {
  // The session closed at 110 (+10% on 100). After hours it trades 108, still against 100.
  const row = { price: 110, chg: 10 };
  assert.equal(sameBasis(row, tick(108, 100)), true);
});

test("the next morning's pre-market tick measures from a new close and is refused", () => {
  // Ranked on +10% (100 → 110). Pre-market measures from 110, so it prints −10%.
  const row = { price: 110, chg: 10 };
  const premarket = tick(99, 110);
  assert.equal(sameBasis(row, premarket), false);
  assert.equal(withTick(row, premarket), row, "the row comes back as the server drew it");
});

test("a loser's pre-market bounce is refused the same way", () => {
  // Ranked on −20% (100 → 80); pre-market 89 against 80 would print +11.25% on "Top losers".
  const row = { price: 80, chg: -20 };
  assert.equal(sameBasis(row, tick(89, 80)), false);
});

test("closes within the tolerance count as the same close", () => {
  /* The snapshot can end on the last trade and the feed on the official
     close; a few cents apart is the same session. */
  const row = { price: 110, chg: 10 };
  const near = 100 * (1 + BASIS_TOLERANCE * 0.8);
  const far = 100 * (1 + BASIS_TOLERANCE * 1.2);
  assert.equal(sameBasis(row, tick(111, near)), true);
  assert.equal(sameBasis(row, tick(111, far)), false);
});

test("a tick with no previous close supplies nothing", () => {
  const row = { price: 110, chg: 10 };
  assert.equal(withTick(row, tick(111, null)), row);
  assert.equal(withTick(row, undefined), row);
});

test("a row with no change of its own has no basis to share", () => {
  /* The sector table carries null, and the boards carry a stand-in 0 marked
     chgKnown: false. Neither gives a basis that can be checked. */
  assert.equal(sameBasis({ price: 100, chg: null }, tick(101, 100)), false);
  assert.equal(sameBasis({ price: 100, chg: 0, chgKnown: false }, tick(101, 100)), false);
  // A reported flat close is a real basis.
  assert.equal(sameBasis({ price: 100, chg: 0, chgKnown: true }, tick(101, 100)), true);
});

test("a degenerate row never divides its way into a basis", () => {
  assert.equal(sameBasis({ price: 100, chg: -100 }, tick(1, 1)), false);
  assert.equal(sameBasis({ price: 0, chg: 5 }, tick(1, 1)), false);
});
