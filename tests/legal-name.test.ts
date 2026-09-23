import test from "node:test";
import assert from "node:assert/strict";

import { legalName } from "../lib/api/normalize/profile.ts";

/* The instrument heading used the company record's registered name verbatim,
   and 971 of 4,400 stored profiles name the SECURITY rather than the company:
   "Tesla, Inc. Common Stock". Real names from the store below. */

test("the plain security descriptor is dropped", () => {
  assert.equal(legalName("Tesla, Inc. Common Stock"), "Tesla, Inc.");
  assert.equal(legalName("The Carlyle Group Inc. Common Stock"), "The Carlyle Group Inc.");
  assert.equal(legalName("Arqit Quantum Inc. Ordinary Shares"), "Arqit Quantum Inc.");
  assert.equal(legalName("TechnipFMC plc Ordinary Share"), "TechnipFMC plc");
});

test("an ADR loses its descriptor and its parenthetical, misspelt or not", () => {
  assert.equal(legalName("COMPASS Pathways Plc American Depository Shares"), "COMPASS Pathways Plc");
  assert.equal(
    legalName("Full Truck Alliance Co. Ltd. American Depositary Shares (each representing 20 Class A Ordinary Shares)"),
    "Full Truck Alliance Co. Ltd.",
  );
});

/* Material words stay. Class is the only thing separating GOOGL from GOOG, and
   a warrant is priced nothing like the stock. */
test("what separates one security from another is kept", () => {
  assert.equal(legalName("Funko, Inc. Class A Common Stock"), "Funko, Inc. Class A");
  assert.equal(legalName("Archer Aviation Inc. Warrant"), "Archer Aviation Inc. Warrant");
  assert.equal(legalName("Example Acquisition Corp. Units"), "Example Acquisition Corp. Units");
});

test("a clean name, an empty result and nothing at all are all safe", () => {
  assert.equal(legalName("Apple Inc."), "Apple Inc.");
  assert.equal(legalName("Common Stock"), "Common Stock", "never stripped to blank");
  assert.equal(legalName(null), null);
});
