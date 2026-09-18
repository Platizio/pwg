import "server-only";

/* What a stampede is allowed to do to the database and to the box.
 *
 * THE FAILURE THIS EXISTS FOR, from the deployed service's own log: every
 * instrument entry went stale at the same instant, ~500 prerendered pages began
 * regenerating together, and each one opened its own connection and its own
 * 213KB download. Every read then timed out at the client's ceiling — 8,165ms
 * against a database that answers one of these in 0.27-0.72s when nothing else
 * is asking. Nothing was slow. Everything was simultaneous.
 *
 * The cause of that particular instant is fixed one file over: `market:quotes`
 * no longer marks every instrument page stale at once. This module is the
 * bound that makes the next one survivable, because a store read is not the
 * only way five hundred renders can start together — a deploy, a cold instance
 * and an on-demand purge all do it, and none of them is a bug to be fixed.
 *
 * Two separate mistakes live in that log line, so there are two mechanisms.
 *
 *   Five hundred pages asking five hundred different questions must QUEUE.
 *   Sixty is the Postgres ceiling and it is shared — PostgREST's own pool, the
 *   refresh worker, the probe, whatever psql session is open — so a web
 *   instance that can open even a tenth of it has already made that ceiling a
 *   lottery for everything else.
 *
 *   Five hundred pages asking the SAME question must ask it once. That is not
 *   hypothetical: the SPY benchmark series is now a single shared read that
 *   every instrument page makes, so a cold start has five hundred callers
 *   wanting the identical 86KB at the identical moment.
 *
 * WHY NOT lib/api/pool.ts, which is the house pattern for bounded concurrency
 * and was read before this was written. `pooled` takes the items UP FRONT —
 * an array, a limit and a worker — and returns their results in input order.
 * That is exactly right for the sweep, which knows all four hundred chunks
 * before it starts, and it cannot express this: the callers here arrive one at
 * a time, from independent renders that know nothing about each other, and
 * there is no array to hand it. A permit and a flight map are the shape of the
 * problem; a pool is the shape of a batch.
 *
 * NO NESTING, and that is what makes a small limit safe. Nothing that holds a
 * permit waits on something that needs one: the two reads an instrument page
 * makes are siblings inside one `Promise.all`, and so are the dashboard's
 * three. If that ever stopped being true — a gated read awaiting another gated
 * read — this limit would become a deadlock rather than a queue.
 */

/**
 * How many store requests this process may have in flight.
 *
 * Four, against a Postgres `max_connections` of 60, and the ceiling is not
 * really what picks the number — being a small, predictable share of it is.
 * The number is picked by the widest single page instead: the dashboard makes
 * three store reads at once (home, the wire batch, the calendar batch) and an
 * instrument page makes two (its own record and the shared benchmark series).
 * Four lets the widest page through undelayed with one permit to spare, and
 * anything beyond one page's worth is by definition a second page — which is
 * the thing that should wait rather than pile on.
 *
 * The box argues for the same order of magnitude from the other side. The web
 * service has a tenth of a CPU and 512MB, and a read is ~127KB of JSON that
 * has to be parsed on the one thread that is also rendering React. More
 * sockets do not make that thread faster; they only hold more half-parsed
 * buffers in a small heap while it works through them one at a time.
 */
export const STORE_READ_LIMIT = 4;

let active = 0;
const waiting: Array<() => void> = [];

/** In-flight reads by key, so identical questions share one answer. */
const flights = new Map<string, Promise<unknown>>();

function acquire(): Promise<void> {
  if (active < STORE_READ_LIMIT) {
    active += 1;
    return Promise.resolve();
  }
  return new Promise<void>((resolve) => {
    waiting.push(() => {
      active += 1;
      resolve();
    });
  });
}

function release(): void {
  active -= 1;
  /* FIFO. A queue that handed the permit to the newest waiter would starve the
     page that has already been waiting longest, which on a stampede is every
     page a reader is actually looking at. */
  waiting.shift()?.();
}

/**
 * Run `read` behind the permit, or join the identical read already running.
 *
 * The key is the QUESTION — the function and its arguments — and deliberately
 * not the caller or its configuration: in a running process there is exactly
 * one store, and two renders asking for SPY's history want the same bytes. The
 * flight is dropped the moment it settles, successfully or not. It is a way of
 * sharing an answer that is still on its way, never a cache: caching lives one
 * layer up in reads.ts, where it has a TTL and a tag that can invalidate it,
 * and a key held here a moment too long would serve a price nothing could
 * clear.
 *
 * A rejection reaches every joined caller, and every joined caller may retry,
 * because the key is gone by then. Nothing in client.ts actually rejects — an
 * ApiFailure is a value there — but the permit must come back either way, or a
 * store outage drains the gate one permit at a time until the site stops
 * reading at all.
 */
export function gated<T>(key: string, read: () => Promise<T>): Promise<T> {
  const joined = flights.get(key);
  if (joined) return joined as Promise<T>;

  const flight = (async () => {
    await acquire();
    try {
      return await read();
    } finally {
      release();
      flights.delete(key);
    }
  })();

  /* Set after the call, which is safe and worth knowing why: the body above
     runs synchronously only as far as its first `await`, so the deletion in
     that `finally` cannot possibly happen before this line. */
  flights.set(key, flight);
  return flight;
}

/**
 * Test seam, like `resetStoreConfig` next door.
 *
 * Only ever called between tests, where there is nothing in flight. Calling it
 * with requests outstanding would let the next callers past the limit as those
 * settle and decrement a counter this has already zeroed.
 */
export function resetStoreGate(): void {
  active = 0;
  waiting.length = 0;
  flights.clear();
}
