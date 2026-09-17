import "server-only";

import { MAX_SYMBOLS, capped, normalise } from "./subscription.ts";
import type { Tick } from "./tick.ts";
import { snapshotFor } from "./upstream.ts";

/* The per-connection filter, held where a second request can reach it.
 *
 * One SSE reader wants a subset of the wildcard feed. That subset used to be
 * fixed at the moment the connection opened — it was a closure variable inside
 * the route handler — so the only way to change it was to open a different
 * connection, and a different connection meant an empty tick map in the browser
 * until its snapshot landed. Every navigation on the terminal blanked every
 * price on the page for a beat.
 *
 * So the set moves out of the closure and in here, keyed by an id the snapshot
 * frame hands the client, and POST /api/stream/subscribe edits it while the
 * stream stays up. The stream's own writer is kept alongside it, because adding
 * a symbol has to answer immediately with that symbol's last known price: the
 * next trade in a quiet name may be hours away, and the reader asked for it
 * now.
 *
 * Process-local by construction, and that is the honest shape of it — the
 * connection it describes is a socket held by this instance, so an id from
 * another instance has no meaning here. `update` says so rather than pretending
 * (`{ ok: false }`), and the client reads that as "open a fresh stream".
 *
 * Snapshot and send are injected so the seam between "the set changed" and "the
 * new symbol's price went out" can be tested without a socket.
 */

/** Writes one SSE frame to a reader. The route's own `send`, which routes a
    failed write into teardown — so nothing here has to care whether the
    connection is still there. */
export type Send = (event: string, data: unknown) => void;

export type RegistryDeps = {
  /** The freshest known tick for each named symbol, if there is one. */
  snapshot: (symbols: readonly string[]) => Tick[];
};

/** The filter as it now stands, and how much of the request the cap refused. */
export type Subscription = { want: string[]; dropped: number };

export type UpdateResult = { ok: false } | ({ ok: true } & Subscription);

export type Registry = {
  register(id: string, symbols: readonly string[], send: Send): Subscription;
  unregister(id: string): void;
  has(id: string): boolean;
  /** The live set the route filters against. Re-read it on every batch: an
      update replaces it rather than mutating it. */
  wants(id: string): ReadonlySet<string> | null;
  update(id: string, add: readonly string[], remove: readonly string[]): UpdateResult;
  size(): number;
};

type Connection = { want: Set<string>; send: Send };

export function createRegistry(deps: RegistryDeps): Registry {
  const connections = new Map<string, Connection>();

  return {
    register(id, symbols, send) {
      const { kept, dropped } = capped(normalise(symbols), MAX_SYMBOLS);
      connections.set(id, { want: new Set(kept), send });
      /* No snapshot frame from here: the route writes its own, once, as the
         first thing the reader sees. Two would be a wasted round trip and a
         second chance to write to a connection that has already gone. */
      return { want: kept, dropped };
    },

    unregister(id) {
      connections.delete(id);
    },

    has(id) {
      return connections.has(id);
    },

    wants(id) {
      return connections.get(id)?.want ?? null;
    },

    update(id, add, remove) {
      const connection = connections.get(id);
      if (!connection) return { ok: false };

      /* Removals first, so a symbol named in both survives — a page that drops
         one surface and mounts another showing the same ticker should not lose
         it in between. */
      const next = new Set(connection.want);
      for (const symbol of normalise(remove)) next.delete(symbol);

      const added = normalise(add);
      /* Only names that were not already being delivered are new. Re-sending a
         price the reader is already receiving is noise, and the caller's own
         lookup is not free. */
      const fresh = added.filter((symbol) => !connection.want.has(symbol));
      for (const symbol of added) next.add(symbol);

      /* The cap is on the whole set, not on the increment: an addition that
         takes the connection past the limit is exactly where the old silent
         truncation used to happen. */
      const { kept, dropped } = capped(normalise([...next]), MAX_SYMBOLS);
      connection.want = new Set(kept);

      /* Whatever the reader asked for and is now actually getting. A name that
         fell off the end of the cap is not subscribed, so it gets no price. */
      const landed = fresh.filter((symbol) => connection.want.has(symbol));
      if (landed.length > 0) {
        const ticks = deps.snapshot(landed);
        /* A name with no known last price simply waits for its first trade;
           an empty frame would only make the client re-render for nothing. */
        if (ticks.length > 0) connection.send("snapshot", { id, ticks, dropped });
      }

      return { ok: true, want: kept, dropped };
    },

    size() {
      return connections.size;
    },
  };
}

/* The one registry this process serves from. `snapshotFor` is a pure read of
   upstream's last-seen map — importing it connects nothing, which matters on an
   instance that renders a static page and never streams at all. */
export const registry = createRegistry({ snapshot: snapshotFor });
