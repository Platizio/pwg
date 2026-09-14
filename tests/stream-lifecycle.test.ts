import test from "node:test";
import assert from "node:assert/strict";

import { streamLifecycle } from "../lib/api/stream/lifecycle.ts";

/* Tearing down one reader's SSE response exactly once, on every path out.
 *
 * The route used a single `open` flag for two different questions — "may I
 * still write?" and "has cleanup already run?" — and a failed enqueue set it.
 * So after any write that threw, the abort handler hit `if (!open) return` and
 * returned immediately: the heartbeat interval was never cleared and, far
 * worse, `unsubscribe()` never ran.
 *
 * That last one is not a tidy-up. While a listener sits in the upstream Set,
 * `listeners.size` never returns to zero, `armIdleClose` is never called, and
 * the ONE connection this account is allowed stays pinned for the life of the
 * process — locking out every other reader and every other instance.
 *
 * A write that throws is a disconnect. It must run the same teardown an abort
 * does, and the two must not be able to cancel each other.
 */

function harness() {
  const calls = { heartbeat: 0, detach: 0, close: 0 };
  const life = streamLifecycle({
    stopHeartbeat: () => { calls.heartbeat += 1; },
    detach: () => { calls.detach += 1; },
    closeStream: () => { calls.close += 1; },
  });
  return { calls, life };
}

test("a write that throws still detaches from the feed", () => {
  /* The whole bug, in one assertion. */
  const { calls, life } = harness();
  life.write(() => { throw new Error("client vanished mid-write"); });
  assert.equal(calls.detach, 1, "a failed write must release the upstream listener");
  assert.equal(calls.heartbeat, 1, "and must stop the heartbeat");
});

test("an abort after a failed write does not double-tear-down", () => {
  /* Both paths fire in the real route, and in either order. */
  const { calls, life } = harness();
  life.write(() => { throw new Error("gone"); });
  life.cleanup();
  assert.equal(calls.detach, 1, "detach must run exactly once");
  assert.equal(calls.close, 1);
});

test("a failed write after an abort does not detach twice", () => {
  const { calls, life } = harness();
  life.cleanup();
  life.write(() => { throw new Error("gone"); });
  assert.equal(calls.detach, 1);
});

test("cleanup is idempotent however many times it is called", () => {
  const { calls, life } = harness();
  life.cleanup();
  life.cleanup();
  life.cleanup();
  assert.equal(calls.detach, 1);
  assert.equal(calls.heartbeat, 1);
  assert.equal(calls.close, 1);
});

test("no writes are attempted once torn down", () => {
  /* Writing to a closed controller throws, and throwing inside the abort path
     is how a teardown half-runs. */
  const { life } = harness();
  let attempts = 0;
  life.cleanup();
  life.write(() => { attempts += 1; });
  assert.equal(attempts, 0);
});

test("a successful write leaves the stream open", () => {
  const { calls, life } = harness();
  let wrote = 0;
  life.write(() => { wrote += 1; });
  life.write(() => { wrote += 1; });
  assert.equal(wrote, 2);
  assert.equal(calls.detach, 0, "a healthy reader must not be torn down");
  assert.equal(life.open, true);
});

test("teardown is safe before anything was started", () => {
  /* The snapshot is sent before subscribe() and before the heartbeat exists.
     If that first write throws, cleanup runs with neither in place. */
  const calls = { heartbeat: 0, detach: 0, close: 0 };
  const life = streamLifecycle({
    stopHeartbeat: () => { calls.heartbeat += 1; },
    detach: () => { calls.detach += 1; },
    closeStream: () => { calls.close += 1; },
  });
  life.write(() => { throw new Error("failed on the very first frame"); });
  assert.equal(life.cleaned, true);
  assert.equal(calls.close, 1);
});
