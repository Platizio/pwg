import test from "node:test";
import assert from "node:assert/strict";

import { isPlaceholderInstrument } from "../lib/market/universe.ts";

/* Whether /terminal/<TICKER> is a page at all — which is a question about the
 * COMPANY, never about today's price.
 *
 * instrument.ts used `isQuotable` for this, and `isQuotable` requires a price
 * above zero. That is the right rule for a board: you cannot render a row on a
 * movers table without a number to put in it, and tests/is-fund.test.ts pins
 * that deliberately. It is the wrong rule for a page. A halted stock, a name on
 * its first day of trading, or any company quiet enough that the gateway sends
 * no last or closing price came back priceless — and the page answered
 * "Stock not found", telling a reader a real company does not exist.
 *
 * Two different questions were being asked with one predicate. This one asks
 * only the durable half: is this an exchange placeholder rather than a company?
 * It takes no price, and that omission is the fix.
 */

test("an exchange test security is not a company, so a 404 is honest", () => {
  /* These quote normally and would otherwise reach a screen — Nasdaq's ZVZZT
     printed a -86% "move" on the first sweep and led the losers board. */
  assert.equal(isPlaceholderInstrument("ZVZZT", "NASDAQ TEST STOCK"), true);
  assert.equal(isPlaceholderInstrument("ZZZZZ", "Nasdaq Test Symbol"), true);
  assert.equal(isPlaceholderInstrument("AAAA.TEST", "Something"), true);
  assert.equal(isPlaceholderInstrument("ATESTXYZ", "Whatever"), true);
});

test("the gateway's own naming catches placeholders the pattern misses", () => {
  assert.equal(isPlaceholderInstrument("QQQQ1", "NYSE TEST SECURITY"), true);
});

test("a real company is never a placeholder — and price is not part of the question", () => {
  /* The signature carries no price, and that is the whole point: a company
     the feed will not price today is still a company tomorrow. */
  assert.equal(isPlaceholderInstrument("AAPL", "Apple Inc."), false);
  assert.equal(isPlaceholderInstrument("BRK.B", "Berkshire Hathaway Inc."), false);
});

test("a missing or empty name never makes a real symbol a placeholder", () => {
  /* The gateway sends no companyName for plenty of live names. Treating that
     as evidence of a test security would 404 them all. */
  assert.equal(isPlaceholderInstrument("AAPL", null), false);
  assert.equal(isPlaceholderInstrument("AAPL", undefined), false);
  assert.equal(isPlaceholderInstrument("AAPL", ""), false);
});

test("a company merely mentioning 'test' in its name is not a placeholder", () => {
  /* The pattern is deliberately narrow: TEST followed by STOCK/SECURITY/ISSUE/
     SYMBOL. A real business with "test" in its name must survive. */
  assert.equal(isPlaceholderInstrument("TTEK", "Tetra Tech Inc."), false);
  assert.equal(isPlaceholderInstrument("LABS", "Test Kitchen Brands"), false);
});
