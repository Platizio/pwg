/* How /api/quotes/watchlist puts an answer together: the store first, the
 * gateway only for what the store has not got, and neither allowed to hold
 * the response past a budget.
 *
 * WHY THIS EXISTS. The route took 10,981 ms on production (25 Sep 2026,
 * pre-market) for a request the store could answer from memory. Nothing on
 * its path had a budget. A miss on the home entry waited on `market_home`
 * (a ~1.5 MB read from Mumbai, 1-6 s under worker load, 12 s ceiling); only
 * THEN did the gateway get asked for the names outside the hot list (15 s
 * ceiling, doubled by the 401 retry). The two waits added up, and a reader
 * looked at dashes for eleven seconds. Two smaller costs were on every request:
 *
 *   - the gateway's data-cache key was the list AS ASKED, so the same three
 *     names in another order were a fresh upstream call (measured on
 *     production: 0.32 s cached, 1.56 s for the same set reordered);
 *   - every request parsed the ~1.2 MB home entry again and translated all
 *     ~4,400 hot rows to find six of them (3.1 ms of CPU here, about ten
 *     times that on the 0.1-CPU web instance).
 *
 * WHAT CHANGED, one mechanism each:
 *
 *   1. The store's rows are held in the process as a Map, rebuilt at most
 *      once per `indexFreshMs` and served stale while a rebuild runs. A
 *      request costs map lookups, not a parse.
 *   2. Answers are cached by the SORTED, de-duplicated symbol list for a short
 *      TTL, and identical questions in flight share one flight. The gateway is
 *      asked with the sorted list too, so its data-cache key is order-free.
 *   3. One budget per request. What has arrived by then is the answer; what
 *      has not is listed as `pending`. The flight is NOT cancelled: it
 *      finishes, fills the cache, and the next ask is answered from it.
 *   4. A cold store gets `storeWaitMs`, not the whole budget. Past that, the
 *      gateway is asked for everything (one call, 50 symbols at most — the
 *      shape this route already had when the store was down) while the store
 *      read keeps going and warms the index for the next request.
 *
 * NO NEXT, NO `@/`, NO I/O. The route injects the two upstreams, so this file
 * runs under `node --test` exactly as it runs in the server
 * (tests/watchlist-answer.test.ts).
 */

export type Keyed = { s: string };

export type WatchQuotesOptions<R extends Keyed> = {
  /** The store's rows by symbol, or null when the store cannot answer. */
  loadIndex: () => Promise<ReadonlyMap<string, R> | null>;
  /**
   * One gateway call for symbols the store has not got — sorted, at most the
   * route's own cap. A symbol absent from the map was answered "no quote";
   * null means the call itself failed and nothing was learned.
   */
  fetchGap: (symbols: string[]) => Promise<ReadonlyMap<string, R> | null>;
  /** The most a request waits on upstreams, from the moment it asks. */
  budgetMs?: number;
  /** How long a request waits on a COLD store before asking the gateway instead. */
  storeWaitMs?: number;
  /** How long the in-process store index is used before it is rebuilt. */
  indexFreshMs?: number;
  /** After the store failed, how long before it is asked again. */
  indexRetryMs?: number;
  /** How long a complete answer is reused for the same set of symbols. */
  answerTtlMs?: number;
  /** How many answers are kept at once. */
  maxAnswers?: number;
  /** Test seam. */
  now?: () => number;
};

/* 1.5 s, so a cold request stays under two seconds end to end with the
   network either side of it. Measured from India against production on
   25 Sep 2026: an uncached gateway call for 2-3 names answered in
   0.67-1.56 s total, 0.2-0.3 s of that the round trip — so the gateway itself
   is 0.4-1.3 s, and most calls fit. The rest arrive a moment later and are
   in the cache for the next ask. */
export const BUDGET_MS = 1_500;

/* Half a second for a store that has not been read in this process yet. A
   hit on Next's cache entry is a disk read and two parses — milliseconds of
   CPU, a few hundred on a starved box — and fits. A true miss is a network
   read of the whole home blob (1-6 s) and does not; the gateway is quicker
   for a watchlist's worth of names. */
export const STORE_WAIT_MS = 500;

/* A minute. The rows behind this are the hot sweep's, which the worker writes
   every five minutes and Next's entry holds for another five, so a minute more
   in this process is inside the age the rows already have — and the live feed
   carries every price move after the first answer anyway. */
export const INDEX_FRESH_MS = 60_000;
export const INDEX_RETRY_MS = 15_000;

/* Thirty seconds: the browser's own max-age on this response. Long enough for
   the rail and the watchlist page, or two tabs, or two readers on the default
   list, to share one answer; short enough that nothing here outlives what the
   Cache-Control header already promises. */
export const ANSWER_TTL_MS = 30_000;

/* Each answer is at most fifty rows, so two hundred is a few megabytes at the
   very worst on a 512 MB instance, and the route's rate limit keeps real
   traffic far below it. */
export const MAX_ANSWERS = 200;

/** A symbol list in the one spelling two askers share: de-duplicated, sorted. */
export function sortedKey(symbols: readonly string[]): string {
  return [...new Set(symbols)].sort().join(",");
}

export type Settled<T> = { done: true; value: T } | { done: false };

/**
 * `work`, if it settles within `ms`; otherwise a note that it did not.
 *
 * The work is NOT cancelled — it carries on and whatever it fills (a cache, an
 * index) is there for the next caller. A rejection counts as "nothing usable
 * arrived", the same as running out of time. The timer is unref'd, so a
 * pending budget never holds a process open, and cleared as soon as the work
 * wins, so a fast answer leaves nothing behind.
 */
export function within<T>(work: Promise<T>, ms: number): Promise<Settled<T>> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve({ done: false }), Math.max(0, ms));
    (timer as { unref?: () => void }).unref?.();
    work.then(
      (value) => {
        clearTimeout(timer);
        resolve({ done: true, value });
      },
      () => {
        clearTimeout(timer);
        resolve({ done: false });
      },
    );
  });
}

/**
 * A small time-to-live map with a ceiling.
 *
 * On a write at the ceiling, expired entries go first and then the oldest
 * write — insertion order, which is what a Map iterates in. Nothing clever:
 * the entries are short-lived and the ceiling is only there so a process that
 * lives for weeks cannot grow without bound.
 */
export class TtlCache<V> {
  readonly max: number;
  private readonly entries = new Map<string, { value: V; expires: number }>();

  constructor(max: number) {
    this.max = Math.max(1, max);
  }

  get(key: string, now: number): V | undefined {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    if (entry.expires <= now) {
      this.entries.delete(key);
      return undefined;
    }
    return entry.value;
  }

  set(key: string, value: V, ttlMs: number, now: number): void {
    this.entries.delete(key);
    if (this.entries.size >= this.max) {
      for (const [k, e] of this.entries) if (e.expires <= now) this.entries.delete(k);
    }
    while (this.entries.size >= this.max) {
      const oldest = this.entries.keys().next().value;
      if (oldest === undefined) break;
      this.entries.delete(oldest);
    }
    this.entries.set(key, { value, expires: now + ttlMs });
  }

  get size(): number {
    return this.entries.size;
  }
}

/**
 * What is known about each asked symbol, in the order asked.
 *
 * Three states, and the difference between the last two is the point:
 *   - a row: priced;
 *   - `null`: an upstream ANSWERED that it has no quote — `missing`, a fact
 *     worth remembering;
 *   - absent: nothing has answered yet, or the call failed — `pending`, a
 *     question worth asking again shortly.
 */
export function compose<R>(
  asked: readonly string[],
  known: ReadonlyMap<string, R | null>,
): { rows: R[]; missing: string[]; pending: string[] } {
  const rows: R[] = [];
  const missing: string[] = [];
  const pending: string[] = [];
  for (const symbol of asked) {
    if (!known.has(symbol)) {
      pending.push(symbol);
      continue;
    }
    const row = known.get(symbol);
    if (row) rows.push(row);
    else missing.push(symbol);
  }
  return { rows, missing, pending };
}

export type Answer<R> = {
  rows: R[];
  missing: string[];
  pending: string[];
  /** cache: a stored answer. upstream: the flight finished inside the budget.
      budget: the budget ran out first, and this is what had arrived. */
  source: "cache" | "upstream" | "budget";
  /** How long the flight waited on the store; null when it has not finished doing so. */
  storeMs: number | null;
  /** How long the gateway took; null when it was not asked or has not answered. */
  gatewayMs: number | null;
  /** How many symbols the gateway was asked for. */
  gatewaySymbols: number;
};

type Flight<R> = {
  known: Map<string, R | null>;
  storeMs: number | null;
  gatewayMs: number | null;
  gatewaySymbols: number;
  done: Promise<boolean>;
};

export type WatchQuotes<R> = {
  answer: (symbols: readonly string[]) => Promise<Answer<R>>;
  /** Diagnostics and tests: what this process is holding right now. */
  stats: () => { indexed: number | null; answers: number; flights: number };
};

export function createWatchQuotes<R extends Keyed>(options: WatchQuotesOptions<R>): WatchQuotes<R> {
  const clock = options.now ?? Date.now;
  const budgetMs = options.budgetMs ?? BUDGET_MS;
  const storeWaitMs = options.storeWaitMs ?? STORE_WAIT_MS;
  const indexFreshMs = options.indexFreshMs ?? INDEX_FRESH_MS;
  const indexRetryMs = options.indexRetryMs ?? INDEX_RETRY_MS;
  const answerTtlMs = options.answerTtlMs ?? ANSWER_TTL_MS;

  const answers = new TtlCache<Map<string, R | null>>(options.maxAnswers ?? MAX_ANSWERS);
  const flights = new Map<string, Flight<R>>();

  let index: { rows: ReadonlyMap<string, R>; at: number } | null = null;
  let indexLoading: Promise<ReadonlyMap<string, R> | null> | null = null;
  let indexFailedAt: number | null = null;

  /* The store's rows as this process holds them. Fresh: used as is. Stale:
     used as is while ONE rebuild runs behind it. Never loaded: the rebuild is
     handed back for the caller to wait on, briefly. Failed recently: not asked
     again until `indexRetryMs` has passed, so an outage costs one read per
     window rather than one per request. */
  function indexNow(): {
    rows: ReadonlyMap<string, R> | null;
    loading: Promise<ReadonlyMap<string, R> | null> | null;
  } {
    const now = clock();
    if (index && now - index.at < indexFreshMs) return { rows: index.rows, loading: null };
    const backingOff = indexFailedAt !== null && now - indexFailedAt < indexRetryMs;
    if (!indexLoading && !backingOff) {
      indexLoading = options
        .loadIndex()
        .catch(() => null)
        .then((rows) => {
          if (rows) {
            index = { rows, at: clock() };
            indexFailedAt = null;
          } else {
            indexFailedAt = clock();
          }
          return rows;
        })
        .finally(() => {
          indexLoading = null;
        });
    }
    return { rows: index?.rows ?? null, loading: index ? null : indexLoading };
  }

  async function fly(flight: Flight<R>, key: string, sorted: string[]): Promise<boolean> {
    try {
      const started = clock();
      const { rows: held, loading } = indexNow();
      let rows = held;
      if (!rows && loading) {
        const got = await within(loading, storeWaitMs);
        rows = got.done ? got.value : null;
      }
      flight.storeMs = clock() - started;
      if (rows) {
        for (const symbol of sorted) {
          const row = rows.get(symbol);
          if (row) flight.known.set(symbol, row);
        }
      }

      const gap = sorted.filter((symbol) => !flight.known.has(symbol));
      if (gap.length === 0) {
        answers.set(key, flight.known, answerTtlMs, clock());
        return true;
      }

      flight.gatewaySymbols = gap.length;
      const asked = clock();
      const got = await options.fetchGap(gap).catch(() => null);
      flight.gatewayMs = clock() - asked;
      /* A failed call teaches nothing: the gap stays pending and this answer
         is not cached, so the next ask tries again rather than repeating a
         blip for thirty seconds. */
      if (!got) return false;
      for (const symbol of gap) flight.known.set(symbol, got.get(symbol) ?? null);
      answers.set(key, flight.known, answerTtlMs, clock());
      return true;
    } catch {
      return false;
    }
  }

  async function answer(symbols: readonly string[]): Promise<Answer<R>> {
    const asked = [...new Set(symbols)];
    const key = sortedKey(asked);

    const cached = answers.get(key, clock());
    if (cached) {
      return { ...compose(asked, cached), source: "cache", storeMs: null, gatewayMs: null, gatewaySymbols: 0 };
    }

    let flight = flights.get(key);
    if (!flight) {
      const started: Flight<R> = {
        known: new Map(),
        storeMs: null,
        gatewayMs: null,
        gatewaySymbols: 0,
        done: Promise.resolve(false),
      };
      started.done = fly(started, key, key.split(",")).finally(() => {
        flights.delete(key);
      });
      flights.set(key, started);
      flight = started;
    }

    const got = await within(flight.done, budgetMs);
    return {
      ...compose(asked, flight.known),
      source: got.done ? "upstream" : "budget",
      storeMs: flight.storeMs,
      gatewayMs: flight.gatewayMs,
      gatewaySymbols: flight.gatewaySymbols,
    };
  }

  return {
    answer,
    stats: () => ({ indexed: index?.rows.size ?? null, answers: answers.size, flights: flights.size }),
  };
}

/**
 * A Server-Timing header for an answer, so where the time went can be read in
 * the browser's own network panel. That matters on this host: Render's free
 * tier does not return runtime logs, and a slow answer on production is
 * otherwise a number with no explanation.
 */
export function serverTiming(a: Answer<unknown>, totalMs: number): string {
  const parts = [`answer;desc="${a.source}"`];
  if (a.storeMs !== null) parts.push(`store;dur=${a.storeMs}`);
  if (a.gatewaySymbols > 0) {
    parts.push(
      a.gatewayMs === null
        ? `gateway;desc="${a.gatewaySymbols} asked, no answer yet"`
        : `gateway;dur=${a.gatewayMs};desc="${a.gatewaySymbols} asked"`,
    );
  }
  parts.push(`total;dur=${totalMs}`);
  return parts.join(", ");
}
