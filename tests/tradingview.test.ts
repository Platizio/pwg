import assert from "node:assert/strict";
import test from "node:test";

import { tradingViewSymbol } from "../lib/market/tradingview.ts";

/* Naming a US listing the way TradingView names it.

   The widget takes one string — "NASDAQ:AAPL". Getting the venue wrong does
   not degrade, it renders an empty chart, so the rule here is to prefix only
   where the venue is known and to say nothing where it is not: an unprefixed
   US ticker resolves to TradingView's own primary listing, which is right far
   more often than a guess.

   The trap this exists for: `ex` in our master is a bucket, not an exchange.
   Of 4,922 rows tagged AMEX, 2,731 are ARCX (NYSE Arca), 1,640 are BATS
   (Cboe BZX) and only 325 are XASE (NYSE American). Prefixing all of them
   "AMEX:" would mis-name most of the ETF universe, so the MIC decides and
   `ex` is only the fallback. */

test("a Nasdaq listing is named by its MIC, whichever tier it sits in", () => {
  for (const mic of ["XNMS", "XNCM", "XNGS", "XNAS"]) {
    assert.equal(tradingViewSymbol("AAPL", mic, "NSDQ"), "NASDAQ:AAPL", mic);
  }
});

test("a NYSE listing is named by its MIC", () => {
  assert.equal(tradingViewSymbol("JPM", "XNYS", "NYSE"), "NYSE:JPM");
});

/* SPY is the bucket case: ex says AMEX, and it is genuinely NYSE Arca, which
   TradingView does call AMEX. Right answer, reached for the right reason. */
test("an Arca listing is AMEX, which is what TradingView calls Arca", () => {
  assert.equal(tradingViewSymbol("SPY", "ARCX", "AMEX"), "AMEX:SPY");
});

test("a NYSE American listing is AMEX", () => {
  assert.equal(tradingViewSymbol("IMO", "XASE", "AMEX"), "AMEX:IMO");
});

/* The other half of the AMEX bucket. AAAU — Goldman Sachs Physical Gold — is
   a real row in the master carrying ex "AMEX" and mic "BATS", one of 1,640
   like it. TradingView files BZX funds under more than one prefix depending on
   the fund, so guessing would render an empty chart for whichever half guessed
   wrong. Unprefixed lets TradingView resolve its own primary listing.

   Note this must NOT fall through to the ex bucket: that would produce
   "AMEX:AAAU", which is the precise mis-naming this module exists to stop. */
test("a Cboe BZX listing is left unprefixed rather than guessed", () => {
  assert.equal(tradingViewSymbol("AAAU", "BATS", "AMEX"), "AAAU");
});

test("an unknown MIC falls back to the coarse exchange code", () => {
  assert.equal(tradingViewSymbol("AAPL", "XXXX", "NSDQ"), "NASDAQ:AAPL");
  assert.equal(tradingViewSymbol("JPM", null, "NYSE"), "NYSE:JPM");
});

test("a symbol we know nothing about is left for TradingView to resolve", () => {
  assert.equal(tradingViewSymbol("PCG-X", null, null), "PCG-X");
  assert.equal(tradingViewSymbol("WEIRD", "PINL", "PINK"), "WEIRD");
});

/* Share classes reach us as either BRK.B or BRK/B — paths.ts notes tickers
   carry both. TradingView uses the dot. */
test("a slash share class is written the way TradingView writes it", () => {
  assert.equal(tradingViewSymbol("BRK/B", "XNYS", "NYSE"), "NYSE:BRK.B");
  assert.equal(tradingViewSymbol("BRK.B", "XNYS", "NYSE"), "NYSE:BRK.B");
});

test("case and surrounding space never reach the widget", () => {
  assert.equal(tradingViewSymbol("  aapl ", "XNMS", "NSDQ"), "NASDAQ:AAPL");
});

/* The MIC is the finer reading and must win. ex=AMEX + mic=XNYS is a row the
   bucket would otherwise mis-name. */
test("the MIC outranks the exchange bucket when they disagree", () => {
  assert.equal(tradingViewSymbol("X", "XNYS", "AMEX"), "NYSE:X");
});

test("an empty ticker yields nothing rather than a bare prefix", () => {
  assert.equal(tradingViewSymbol("", "XNMS", "NSDQ"), null);
  assert.equal(tradingViewSymbol("   ", null, null), null);
});
