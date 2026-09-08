import assert from "node:assert/strict";
import test from "node:test";

import { health, shortfall } from "../lib/market/health.ts";

/* A monitor that is always red is not a monitor.
 *
 * /api/sweep returned `ok: failures.length === 0`, and one of the eight things
 * it counts as a failure was "corporate actions: N of 93 failed". EA and EQR
 * are delisted — both stopped printing in August 2026 and both 404 on every
 * reference endpoint — so N was permanently >= 2, so ok was permanently false.
 * The flag carried no information at all.
 *
 * The deeper fault is that `failures.length === 0` flattens a distinction the
 * assembler already makes. "Serving the committed baseline" means the whole
 * terminal is showing week-old prices. "Week history: 1 of 11 failed" means one
 * sector card is missing its week column. Those are not the same event and they
 * do not deserve the same response at 3am.
 */

const fatal = (message: string) => ({ severity: "fatal" as const, message });
const degraded = (message: string) => ({ severity: "degraded" as const, message });

test("nothing wrong reads ok", () => {
  assert.deepEqual(health([]), { status: "ok", ok: true });
});

test("a thinner panel is degraded, and does not page anyone", () => {
  const h = health([degraded("week history: 1 of 11 failed")]);
  assert.equal(h.status, "degraded");
  assert.equal(h.ok, true, "a missing week column must not read as an outage");
});

test("a wrong or absent page is a failure", () => {
  const h = health([fatal("sweep: serving the committed baseline")]);
  assert.equal(h.status, "failed");
  assert.equal(h.ok, false);
});

test("one fatal outranks any number of degradations", () => {
  const h = health([degraded("a"), degraded("b"), fatal("c"), degraded("d")]);
  assert.equal(h.status, "failed");
});

/* ---------- fan-out shortfalls ---------- */

test("a complete fan-out reports no fault at all", () => {
  assert.equal(shortfall("ticker news", 0, 51), null);
});

test("losing a few of many is degraded", () => {
  const f = shortfall("corporate actions", 2, 93);
  assert.equal(f?.severity, "degraded");
  assert.match(f?.message ?? "", /2 of 93/);
});

/* The threshold is what separates "two companies are quiet" from "the gateway
   is down", which the old single counter could not express. */
test("losing most of a fan-out is an outage, not a degradation", () => {
  assert.equal(shortfall("corporate actions", 60, 93)?.severity, "fatal");
  assert.equal(shortfall("ticker news", 51, 51)?.severity, "fatal");
});

test("the boundary is inclusive of the tolerance", () => {
  /* Exactly half is still degraded; past half is not. */
  assert.equal(shortfall("x", 5, 10)?.severity, "degraded");
  assert.equal(shortfall("x", 6, 10)?.severity, "fatal");
});

test("a fan-out that was never asked cannot be a fault", () => {
  assert.equal(shortfall("x", 0, 0), null);
});
