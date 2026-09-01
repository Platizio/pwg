import { test } from "node:test";
import assert from "node:assert/strict";
import { isFund } from "../lib/market/universe.ts";

/* Funds are excluded from the movers boards and the sector cards, so a false
   positive here silently deletes a real company from the whole page. */

test("recognises leveraged and inverse products", () => {
  for (const name of [
    "Leverage Shares 2x Long Aaoi Daily ETF",
    "Tradr 2x Short Aaoi Daily ETF",
    "PROSHARES ULTRAPRO QQQ",
    "DIREXION DAILY SEMICONDUCTOR BULL 3X SHARES",
    "ISHARES RUSSELL 2000 ETF",
    "STATE STREET SPDR S&P 500 ETF",
  ]) {
    assert.equal(isFund(name), true, `expected fund: ${name}`);
  }
});

test("does not mistake operating companies with fund-ish words for funds", () => {
  for (const name of [
    "NORTHERN TRUST CORP",          // a bank
    "VORNADO REALTY TRUST",         // a REIT — an operating company under GICS
    "FEDERAL REALTY INVESTMENT TRUST",
    "HOST HOTELS & RESORTS INC",
    "SIMON PROPERTY GROUP INC",
    "BULL HORN HOLDINGS CORP",
    "TRUSTMARK CORP",
  ]) {
    assert.equal(isFund(name), false, `wrongly flagged as a fund: ${name}`);
  }
});

/* ------------------------------------------------------------------ */
/* Quotable instruments                                                */
/* ------------------------------------------------------------------ */

test("exchange test symbols are never quotable", async () => {
  const { isQuotable } = await import("../lib/market/universe.ts");

  /* The sweep filters these out of the boards, but an instrument page fetches
     whatever ticker the URL names. ZZZZZ is Nasdaq's own test symbol: the
     gateway answers for it, at a price of zero, and the page rendered a
     company called "Nasdaq Test Symbol". */
  assert.equal(
    isQuotable({ symbol: "ZZZZZ", name: "Nasdaq Test Symbol", price: 0 }),
    false,
  );
  assert.equal(isQuotable({ symbol: "ZVZZT", name: "NASDAQ TEST STOCK", price: 12 }), false);
  assert.equal(isQuotable({ symbol: "AAAA.TEST", name: "Something", price: 12 }), false);
});

test("a quote with no price is not a page", async () => {
  const { isQuotable } = await import("../lib/market/universe.ts");
  // A page that cannot price its subject has nothing to be.
  assert.equal(isQuotable({ symbol: "REAL", name: "Real Company", price: 0 }), false);
  assert.equal(isQuotable({ symbol: "REAL", name: "Real Company", price: null }), false);
  assert.equal(isQuotable({ symbol: "AAPL", name: "APPLE INC", price: 310.37 }), true);
});
