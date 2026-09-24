import { test } from "node:test";
import assert from "node:assert/strict";
import { presentation } from "../lib/market/universe.ts";

/* An uncurated symbol shows the gateway's legal name, tidied. These are the
   names the calendar, the home rail, the market card and the movers boards
   actually printed before: a dangling ampersand, a ticker title-cased into a
   word, and the depositary-receipt boilerplate read out in full. */

const nameOf = (ticker: string, raw: string) => presentation(ticker, raw).name;

test("dropping the entity suffix does not leave its conjunction behind", () => {
  assert.equal(nameOf("DE", "DEERE & CO"), "Deere");
  assert.equal(nameOf("KKR", "KKR & CO INC"), "KKR");
  assert.equal(nameOf("PH", "PARKER-HANNIFIN CORP,"), "Parker-Hannifin");
  assert.equal(nameOf("JCI", "JOHNSON AND COMPANY"), "Johnson");
});

test("an ampersand inside a name stays", () => {
  assert.equal(nameOf("SPY", "STATE STREET SPDR S&P 500 ETF"), "State Street SPDR S&P 500 ETF");
  assert.equal(nameOf("PG2", "PROCTER & GAMBLE CO"), "Procter & Gamble");
});

test("a symbol inside a name stays in capitals", () => {
  assert.equal(nameOf("QQQ", "INVESCO QQQ TRUST UNIT SER 1"), "Invesco QQQ");
  assert.equal(nameOf("TQQQ", "PROSHARES ULTRAPRO QQQ"), "Proshares Ultrapro QQQ");
  assert.equal(nameOf("CVS", "CVS HEALTH CORPORATION"), "CVS Health");
  assert.equal(nameOf("PNC", "PNC FINANCIAL SERVICES GROUP"), "PNC Financial Services");
});

test("ordinary words are still title-cased", () => {
  assert.equal(nameOf("DE", "DEERE & CO"), "Deere");
  assert.equal(nameOf("TSM", "TAIWAN SEMICONDUCTOR MANUFACTURING SPON ADS EACH REP 5 ORD TWD10"), "Taiwan Semiconductor Manufacturing");
});

test("depositary-receipt and unit-trust boilerplate is dropped", () => {
  assert.equal(nameOf("ARM", "ARM HOLDINGS PLC SPON ADS EACH REP 1 ORD SHS"), "Arm");
  assert.equal(nameOf("BHP", "BHP GROUP LTD SPON ADS EACH REP 2 ORD SHS"), "BHP");
  assert.equal(nameOf("SHEL", "SHELL PLC SPON ADS EA REP 2 ORD SHS"), "Shell");
  assert.equal(nameOf("BABA", "ALIBABA GROUP HOLDING LTD SPON ADS EACH REP 8 ORD SHS"), "Alibaba");
  assert.equal(nameOf("SONY", "SONY GROUP CORPORATION SPON ADS EACH REPR 1 ORD SHS"), "Sony");
  assert.equal(nameOf("HSBC", "HSBC HOLDINGS PLC ADR EACH REPR 5 ORD USD0.50"), "HSBC");
  assert.equal(nameOf("NVO", "NOVO NORDISK A/S ADR-EACH CNV INTO 1 CLASS'B'DKK1"), "Novo Nordisk A/S");
  assert.equal(nameOf("SPYX", "SPDR S&P 500 ETF TRUST UNIT SERIES 1"), "SPDR S&P 500 ETF");
});

test("a name that is nothing but noise falls back to the raw name", () => {
  assert.equal(nameOf("ZZCO", "CO"), "Co");
});

test("every spelling of the receipt terms is dropped, and an ETF on ADRs keeps its name", () => {
  assert.equal(nameOf("ABEV", "AMBEV SA SPON ADR EACH REPR 1 COM"), "Ambev");
  assert.equal(nameOf("XADR", "ACME SPONS ADR EACH REPR 0.2 ORD"), "Acme");
  assert.equal(nameOf("TKC", "TURKCELL ILETISIM HIZMETLERI ADR EA REP 0.2 ORD TRY1"), "Turkcell Iletisim Hizmetleri");
  assert.equal(nameOf("XETF", "ALPHA ARCHITECT ADR ETF"), "Alpha Architect ADR ETF");
  assert.equal(nameOf("XHLD", "ACME HLDGS"), "Acme");
});
