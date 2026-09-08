import assert from "node:assert/strict";
import test from "node:test";

import { newest, oldest, quoteAge } from "../lib/market/freshness.ts";

/* How old a card is allowed to claim to be.

   Every board on the dashboard carries one badge — "Quotes run fifteen minutes
   behind; the last tick arrived 25m ago" — and that badge is drawn once and
   applied to every row beneath it. It was dated by the panel's NEWEST row, so
   a single currently-quoting symbol set the age for the whole card. The Most
   active board rendered that reassuring 25m line above four figures that were
   13, 28, 62 and 63 days old.

   A badge that is wrong in the direction of looking trustworthy is worse than
   no badge, so a card is now dated by its OLDEST row: the worst thing in the
   card governs what the card is allowed to say about itself. */

const MIN = 60_000;
const NOW = 1_800_000_000_000;

test("newest takes the latest stamp and ignores the nulls between", () => {
  assert.equal(newest([NOW - 90 * MIN, null, NOW - 5 * MIN, null]), NOW - 5 * MIN);
});

test("oldest takes the earliest stamp and ignores the nulls between", () => {
  assert.equal(oldest([NOW - 90 * MIN, null, NOW - 5 * MIN, null]), NOW - 90 * MIN);
});

test("both report nothing when there is nothing to report", () => {
  assert.equal(newest([]), null);
  assert.equal(oldest([]), null);
  assert.equal(newest([null, null]), null);
  assert.equal(oldest([null, null]), null);
});

/* The regression. One fresh row among four stale ones must not date the card. */
test("a card is dated by its oldest row, not its freshest", () => {
  const rows = [
    { asOf: NOW - 63 * 24 * 60 * MIN }, // 63 days
    { asOf: NOW - 28 * 24 * 60 * MIN },
    { asOf: NOW - 13 * 24 * 60 * MIN },
    { asOf: NOW - 25 * MIN }, // the one live quote
  ];

  assert.equal(quoteAge(rows).at, NOW - 63 * 24 * 60 * MIN);
  assert.notEqual(quoteAge(rows).at, NOW - 25 * MIN);
});

test("a card where every row is current is dated by the oldest of those", () => {
  const rows = [{ asOf: NOW - 2 * MIN }, { asOf: NOW - 9 * MIN }, { asOf: NOW - 4 * MIN }];
  assert.equal(quoteAge(rows).at, NOW - 9 * MIN);
});

/* Delay is a property of the feed, not of the worst row: one delayed quote
   means the card cannot claim to be live. That behaviour is unchanged and is
   pinned here so the move to `oldest` cannot quietly alter it. */
test("one delayed row makes the whole card delayed", () => {
  assert.equal(quoteAge([{ asOf: NOW, delayed: false }, { asOf: NOW, delayed: true }]).delayed, true);
  assert.equal(quoteAge([{ asOf: NOW, delayed: false }]).delayed, false);
});

test("a row carrying no stamp is skipped rather than read as the epoch", () => {
  assert.equal(quoteAge([{ asOf: null }, { asOf: NOW - 7 * MIN }]).at, NOW - 7 * MIN);
  assert.equal(quoteAge([{}, { asOf: NOW - 7 * MIN }]).at, NOW - 7 * MIN);
});

test("an empty card has no age at all rather than an age of zero", () => {
  assert.equal(quoteAge([]).at, null);
});

test("quote freshness ages; that is what separates it from a dividend date", () => {
  assert.equal(quoteAge([{ asOf: NOW }]).ages, true);
});
