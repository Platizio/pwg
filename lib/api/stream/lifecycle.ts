/**
 * One SSE reader's teardown, guaranteed to run once and to run completely.
 *
 * WHY THIS IS ITS OWN MODULE
 *
 * app/api/stream/route.ts used a single `open` flag to answer two different
 * questions — "may I still write?" and "has cleanup already run?" — and a
 * failed `enqueue` set it:
 *
 *     catch { open = false }          // a write throws
 *     const close = () => {
 *       if (!open) return             // ...and the abort handler returns here
 *       clearInterval(heartbeat)
 *       unsubscribe()                 // never reached
 *
 * So after any write that threw, the abort handler did nothing. The heartbeat
 * interval was never cleared, and — the part that matters — `unsubscribe()`
 * never ran.
 *
 * That is not a tidy-up. While a listener remains in upstream's Set,
 * `listeners.size` never returns to zero, `armIdleClose` is never called, and
 * the ONE connection this account is allowed stays pinned for the life of the
 * process, locking out every other reader and every other instance. One client
 * vanishing mid-write was enough to take the live feed down until a redeploy.
 *
 * THE RULE
 *
 * A write that throws IS a disconnect, and must run exactly the same teardown
 * an abort does. The two paths both call one idempotent cleanup, so neither can
 * cancel the other, and every step is safe to run before it was ever started —
 * the snapshot is written before both the subscription and the heartbeat exist.
 *
 * Extracted so the ordering can be tested rather than re-read, because the
 * failure is invisible from outside: the response ends normally and the leak is
 * a listener nobody can see.
 */

export type Teardown = {
  /** Stop the keep-alive timer. Safe when none was ever started. */
  stopHeartbeat: () => void;
  /** Release the upstream listener. Safe when never attached. */
  detach: () => void;
  /** Close the response stream. Safe when the runtime already closed it. */
  closeStream: () => void;
};

export type StreamLifecycle = {
  /** Whether writes are still worth attempting. */
  readonly open: boolean;
  /** Whether teardown has already run. */
  readonly cleaned: boolean;
  /** Tear down, once. Safe from any path and any number of times. */
  cleanup: () => void;
  /** Attempt a write; a throw is treated as a disconnect and tears down. */
  write: (fn: () => void) => void;
};

export function streamLifecycle(t: Teardown): StreamLifecycle {
  let open = true;
  let cleaned = false;

  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    open = false;

    /* Each step guarded by the caller, not by a flag here: the snapshot frame
       is written before the subscription and the heartbeat exist, so a throw on
       that very first write reaches this with neither in place. */
    t.stopHeartbeat();
    t.detach();
    t.closeStream();
  };

  return {
    get open() {
      return open;
    },
    get cleaned() {
      return cleaned;
    },
    cleanup,
    write(fn: () => void) {
      if (!open) return;
      try {
        fn();
      } catch {
        /* The connection is gone. Anything else here would leave the listener
           attached, which is the whole defect this module exists to close. */
        cleanup();
      }
    },
  };
}
