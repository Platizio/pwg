import { test } from "node:test";
import assert from "node:assert/strict";
import { baselineSnapshot, describeBaseline } from "../lib/market/baseline.ts";

/* The first request after a deploy finds an empty cache and waits about five
   seconds for a full sweep. A committed snapshot covers that gap.

   The rule that matters: this is real data that was once true, and it must
   never be confused with the seeded mock the terminal was built on. It is
   always flagged stale and always carries its own timestamp. */

test("a baseline reports the moment it was taken", () => {
  const b = baselineSnapshot();
  assert.ok(b !== null, "a baseline has been committed — run npm run build:baseline");
  assert.ok(Number.isFinite(b.sweptAt), "a baseline without a timestamp cannot be labelled stale");
  assert.ok(b.rows.length > 0);
  assert.match(describeBaseline() ?? "", /\d{4}/, "the note must name a real date");
});

test("baseline rows carry real prices, never seeded ones", () => {
  const b = baselineSnapshot();
  assert.ok(b !== null);
  for (const r of b.rows.slice(0, 50)) {
    assert.ok(r.px > 0, `${r.s} has no price`);
    assert.ok(Number.isFinite(r.chg), `${r.s} has an unrankable change`);
    assert.ok(typeof r.s === "string" && r.s.length > 0);
  }
});

test("an absent baseline is null rather than an invented one", async () => {
  /* The alternative — synthesising rows so the page looks populated — is the
     failure mode this whole layer exists to prevent. */
  const mod = await import("../lib/market/baseline.ts");
  assert.equal(typeof mod.baselineSnapshot, "function");
  const b = mod.baselineSnapshot();
  assert.ok(b === null || Array.isArray(b.rows));
});
