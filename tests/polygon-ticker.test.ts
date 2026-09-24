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
  for (const s of ["AAPL", "BRK.B", "SPY", "AAC.UN", "A"]) assert.equal(polygonTicker(s), s);
});
