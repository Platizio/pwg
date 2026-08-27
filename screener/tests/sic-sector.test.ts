import { test } from "node:test";
import assert from "node:assert/strict";
import { sectorForSic } from "../lib/api/sic-sector.ts";
import { SECTOR_NAMES } from "../lib/market/universe.ts";

/* SIC is a 1987 government scheme and GICS is not, so the table between them
   is the place errors hide. These are the codes a full classification run
   found falling through, plus the disagreements worth pinning. */

test("every mapping returns one of the eleven sector names", () => {
  for (const sic of [3571, 7372, 2834, 6021, 1311, 4911, 5812, 6798, 4813, 2911, 3711]) {
    const s = sectorForSic(sic, "X");
    assert.ok(s !== null && (SECTOR_NAMES as readonly string[]).includes(s), `${sic} -> ${s}`);
  }
});

test("vehicle rental and leasing is Industrials, not consumer spending", () => {
  // GICS moved passenger ground transportation into Industrials in 2023.
  for (const t of ["HTZ", "CAR", "R"]) {
    assert.equal(sectorForSic(7510, t), "Industrials", t);
  }
});

test("automotive servicing is Consumer discretionary", () => {
  for (const t of ["MNRO", "DRVN"]) {
    assert.equal(sectorForSic(7500, t), "Consumer discretionary", t);
  }
  assert.equal(sectorForSic(7530, "X"), "Consumer discretionary");
});

test("recreational transport equipment is a leisure product", () => {
  // Polaris — snowmobiles and off-road vehicles, not aerospace.
  assert.equal(sectorForSic(3790, "PII"), "Consumer discretionary");
});

test("professional services firms are Industrials", () => {
  assert.equal(sectorForSic(8111, "CRAI"), "Industrials");
});

test("codes that classify nothing stay null rather than guessing", () => {
  assert.equal(sectorForSic(9995, "X"), null);
  assert.equal(sectorForSic(null, "X"), null);
  assert.equal(sectorForSic("", "X"), null);
});

test("the overrides beat the ranges where SIC and GICS disagree", () => {
  assert.equal(sectorForSic(7370, "GOOGL"), "Communication services");
  assert.equal(sectorForSic(7389, "V"), "Financials");
  assert.equal(sectorForSic(5331, "WMT"), "Consumer staples");
  assert.equal(sectorForSic(6324, "UNH"), "Health care");
});
