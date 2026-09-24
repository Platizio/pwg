import test from "node:test";
import assert from "node:assert/strict";

import { polygonTicker } from "../lib/api/normalize/polygon-ticker.ts";

/* The gateway and Polygon spell some securities differently, and a symbol
   Polygon does not recognise falls back to the gateway's /historical, whose
   closes are not the official ones. Measured 24 Sep 2026: "ABR-D" and "ACHR+"
   return nothing from Polygon, "ABRpD" and "ACHR.WS" return bars whose last
   close matches the quote's previous close to the cent (15.27, 0.0072).
   391 preferreds and 79 warrants in the tradable master. */

test("a preferred series is written with a lowercase p", () => {
  assert.equal(polygonTicker("ABR-D"), "ABRpD");
  assert.equal(polygonTicker("ACP-A"), "ACPpA");
});

test("a warrant is written with .WS", () => {
  assert.equal(polygonTicker("ACHR+"), "ACHR.WS");
});

test("everything else is left exactly as it is", () => {
  for (const s of ["AAPL", "BRK.B", "SPY", "A", "GOOGL"]) assert.equal(polygonTicker(s), s);
});

test("units and rights take Polygon's spelling", () => {
  assert.equal(polygonTicker("AAC.UN"), "AAC.U");
  assert.equal(polygonTicker("AIIA.RT"), "AIIAr");
  assert.equal(polygonTicker("BRK.B"), "BRK.B", "a dotted class is unchanged");
});

/* A preferred with no series letter is "X-" at the gateway and "Xp" at
   Polygon. Left as "X-", Polygon does not refuse it: it answers with the
   COMMON stock. Measured 24 Sep 2026, daily closes 21-23 Sep: "TY-" returned
   TY's 35.05/34.96/34.60 while "TYp" returned 40.55/40.97/40.40 (quote
   yesterdayClose 40.4); "DCOM-" returned DCOM at 39.95 while "DCOMp" is 16.52,
   the quote's figure; "TFIN-" 61.37 against "TFINp" 21.93. Seven such symbols
   in the tradable master: AXIA-, DCOM-, ETI-, PHXE-, TFIN-, TY-, ZVV-. */
test("a preferred with no series letter is written with a bare lowercase p", () => {
  assert.equal(polygonTicker("TY-"), "TYp");
  assert.equal(polygonTicker("DCOM-"), "DCOMp");
  assert.equal(polygonTicker("TFIN-"), "TFINp");
  assert.notEqual(polygonTicker("TY-"), "TY-", "never sent as-is: Polygon reads it as the common");
});
