import test from "node:test";
import assert from "node:assert/strict";

import { RECONNECT_MAX_MS, reconnectDelay } from "../lib/api/stream/backoff.ts";

/* How hard to retry a market feed that will not let us in.
 *
 * The gateway allows ONE connection per account. Measured: with production
 * holding it, three separate sockets were each answered `connection_limit` —
 * and the socket still OPENS before that refusal arrives. So "open" is not
 * success for this protocol; "subscribed" is. upstream.ts reset its retry
 * counter on open, which meant a refused client would reconnect, open, be
 * refused, reset to zero and try again about once a second, forever, against a
 * gateway that had already said no.
 *
 * Backoff only works if the counter advances while we are being refused, so
 * these pin the growth rather than the arithmetic.
 */

test("the delay grows with each refusal", () => {
  const at = (n: number) => reconnectDelay(n, 0.5);
  assert.ok(at(1) < at(2), "a second refusal must wait longer than the first");
  assert.ok(at(2) < at(3));
  assert.ok(at(3) < at(4));
});

test("it never grows past the ceiling, however long the outage", () => {
  /* A feed that has been refused for an hour must still be trying, and must
     still be trying no harder than every thirty seconds. */
  for (const n of [10, 50, 1_000]) {
    assert.ok(reconnectDelay(n, 1) <= RECONNECT_MAX_MS, `attempt ${n} exceeded the cap`);
  }
  assert.ok(reconnectDelay(1_000, 0) >= RECONNECT_MAX_MS / 2, "it must not collapse to zero at the cap");
});

test("it always waits, so a refusal can never become a hot loop", () => {
  /* The failure this prevents: reconnect, open, refused, reset, repeat. */
  for (let n = 1; n <= 12; n += 1) {
    assert.ok(reconnectDelay(n, 0) > 0, `attempt ${n} returned no delay at all`);
  }
});

test("jitter spreads retries so instances do not synchronise", () => {
  /* Two instances refused at the same instant must not come back in lockstep
     and take turns locking each other out of the single connection. */
  const lo = reconnectDelay(5, 0);
  const hi = reconnectDelay(5, 1);
  assert.ok(hi > lo, "the random component must actually move the delay");
  assert.ok(lo >= 0 && hi <= RECONNECT_MAX_MS);
});

test("the first retry is prompt, because most refusals are transient", () => {
  /* The common case is the other holder releasing a moment later. Waiting
     thirty seconds for that would be its own outage. */
  assert.ok(reconnectDelay(1, 1) <= 1_000);
});
