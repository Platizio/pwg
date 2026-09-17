"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { Tick } from "@/lib/api/stream/tick";
import { freshTicks } from "@/lib/market/fresh-map";
import { reconnectDelay } from "@/lib/api/stream/backoff";
import { diffSubscription, unionOf } from "@/lib/api/stream/subscription";

/* One live connection for the whole page, for the whole visit.
 *
 * Every surface that shows a price wants ticks — the tape, the rail, the index
 * strip, the boards, the instrument header. If each opened its own EventSource
 * the page would hold five connections, and each of those is a subscriber on
 * the single upstream socket the server holds. So consumers register the
 * symbols they care about here, the union is subscribed once, and everyone
 * reads out of the same map.
 *
 * WHY THE CONNECTION NO LONGER FOLLOWS THE SYMBOLS
 *
 * The union used to BE the connection: it was the URL, so it was the effect
 * key, so any change to it closed the stream and opened another. And because
 * ticks belonging to the old symbol set could not be shown under the new one,
 * the map was blanked until the new connection's snapshot came back —
 *
 *     const held = state.key === key ? state.ticks : EMPTY
 *
 * Arriving at a stock page registers one more symbol. That is a different
 * union, so every price on the terminal — the tape, the ribbon, the boards,
 * none of which changed at all — dropped to the server's figure and jumped back
 * a moment later. Navigation, the thing this app does most, was the thing that
 * broke the live feed most.
 *
 * So the stream now outlives the symbol set. It is opened once, the server
 * names it in the snapshot frame, and changes are POSTed to /api/stream/
 * subscribe as an add/remove delta against what the server is already sending
 * us. Nothing is ever blanked: a symbol we stop watching is removed from the
 * buffer, a symbol we start watching arrives with its last price attached, and
 * every other price on the page simply carries on.
 *
 * All of the connection's state lives in refs rather than in state, precisely
 * because none of it may re-render anything. The only state here is the tick
 * map itself.
 */

type LiveValue = {
  ticks: ReadonlyMap<string, Tick>;
  register: (id: number, symbols: readonly string[]) => void;
  release: (id: number) => void;
};

const EMPTY: ReadonlyMap<string, Tick> = new Map();
const LiveContext = createContext<LiveValue | null>(null);

/* Long enough to absorb a mount cascade, short enough that the first ticks are
   not visibly late.

   It applies to every recomputation, not only the first open, and that is not
   an optimisation. React tears down the outgoing page's effects and runs the
   incoming page's in one commit, so a navigation is a burst of release() calls
   followed by a burst of register() calls. Acting on each one in turn would see
   the trough between them as "nobody wants AAPL any more", drop it from the
   buffer, and add it back a moment later — the same flicker by a different
   route. Settling first means the delta is computed against where the page
   ended up, and a navigation between two pages showing the same ticker sends no
   request at all. */
const COALESCE_MS = 250;

let nextId = 0;

export function LiveProvider({ children }: { children: ReactNode }) {
  const registry = useRef(new Map<number, readonly string[]>());
  const [ticks, setTicks] = useState<ReadonlyMap<string, Tick>>(EMPTY);

  /* Everything the connection knows about itself. */
  const buffer = useRef(new Map<string, Tick>());
  const source = useRef<EventSource | null>(null);
  /* Null until the snapshot frame names this connection; until then there is no
     address to send a delta to. */
  const connId = useRef<string | null>(null);
  /* What the SERVER is filtering for us — not what the page wants. The delta is
     computed between the two. */
  const subscribed = useRef<Set<string>>(new Set());
  /* What the page wants, as of the last settle. A reconnect uses this rather
     than the set the dead connection was opened with. */
  const wantedNow = useRef<string[]>([]);
  /* A delta is owed but could not be sent yet: no id, or one already in
     flight. */
  const pending = useRef(false);
  const inflight = useRef(false);

  const settle = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retry = useRef<ReturnType<typeof setTimeout> | null>(null);
  const attempt = useRef(0);
  const frame = useRef(0);
  const stopped = useRef(false);
  /* connect() has to run the delta that was waiting on its id, sync() has to
     reconnect when the server no longer knows the id, and a dropped connection
     has to reconnect itself. These refs untie the knot: none of the three
     becomes a dependency of another, and every one of them reads only refs, so
     a stale closure of any of them is still a correct one. */
  const syncRef = useRef<() => void>(() => {});
  const connectRef = useRef<(union: readonly string[]) => void>(() => {});

  /* Ticks arrive faster than the browser can usefully paint. One state update
     per frame keeps a busy open from becoming a render storm. */
  const flush = useCallback(() => {
    frame.current = 0;
    setTicks(new Map(buffer.current));
  }, []);

  const paint = useCallback(() => {
    if (frame.current === 0) frame.current = requestAnimationFrame(flush);
  }, [flush]);

  const absorb = useCallback(
    (payload: string): { ticks?: Tick[]; id?: string } | null => {
      /* Anything arriving is proof the stream is healthy again, so the backoff
         starts over. Same rule the server uses: a subscription, not a socket. */
      attempt.current = 0;
      let data: { ticks?: Tick[]; id?: string };
      try {
        data = JSON.parse(payload);
      } catch {
        return null;
      }
      let changed = false;
      for (const t of data.ticks ?? []) {
        const prev = buffer.current.get(t.symbol);
        if (prev && prev.at > t.at) continue;
        buffer.current.set(t.symbol, t);
        changed = true;
      }
      if (changed) paint();
      return data;
    },
    [paint],
  );

  /* A symbol nobody is watching must not keep a price on screen: the surface
     that was showing it has gone, and if it comes back it will be re-subscribed
     and re-snapshotted. */
  const drop = useCallback(
    (symbols: readonly string[]) => {
      let changed = false;
      for (const symbol of symbols) {
        if (buffer.current.delete(symbol)) changed = true;
      }
      if (changed) paint();
    },
    [paint],
  );

  const connect = useCallback(
    (union: readonly string[]) => {
      if (stopped.current) return;

      /* The server refuses an empty filter, and rightly: an unfiltered fan-out
         of the whole tape is not something a page should be able to ask for.

         Bailing has to leave no half-dead stream behind, though. A reconnect
         that arrives at this branch — every live surface unmounted while the
         old connection was down — would otherwise leave `source` pointing at a
         closed EventSource with no id, and from then on every sync would take
         the "wait for an id" path and wait for a frame that can never come.
         Clearing it means the next sync sees no connection and opens one. */
      if (union.length === 0) {
        source.current?.close();
        source.current = null;
        connId.current = null;
        pending.current = false;
        inflight.current = false;
        return;
      }

      if (retry.current) {
        clearTimeout(retry.current);
        retry.current = null;
      }
      source.current?.close();
      connId.current = null;
      pending.current = false;
      inflight.current = false;

      const opened = [...union];
      const es = new EventSource(`/api/stream?symbols=${encodeURIComponent(opened.join(","))}`);
      source.current = es;

      es.addEventListener("snapshot", (e) => {
        const data = absorb((e as MessageEvent).data);
        /* A superseded connection may still be draining; its frames are
           welcome in the buffer, but it must not claim to be the live one. */
        if (!data || es !== source.current) return;
        if (typeof data.id !== "string") return;
        /* Two different frames arrive under this name and the id tells them
           apart. The server sends one mid-stream whenever a symbol we ADDED
           has a last price to hand over, and that one carries the id we
           already hold: it is a price and nothing else. Reading it as an
           opening frame would reset our record of the server's filter back to
           the set this stream was opened with, the diff against that stale
           record would then come out empty for a name the server really has
           stopped sending, no delta would be posted to correct it, and that
           symbol would never tick again for the life of the connection.

           A frame carrying a DIFFERENT id is a different connection
           introducing itself — and one can appear without us asking. The
           handler below deliberately leaves a dropped SOCKET to EventSource,
           which reconnects it on its own: a sleeping laptop, an idle proxy, an
           origin that restarted. That reconnect goes to the same URL, so the
           server's filter for it is `opened` again and everything added since
           is gone from it. Keeping the dead id there is how a symbol goes
           silent for the rest of the session: we would go on believing the
           server was sending it, so no delta would ever mention it, and the
           next one that did would carry an id the server has never heard of
           and cost a full reopen. */
        if (data.id === connId.current) return;
        connId.current = data.id;
        subscribed.current = new Set(opened);
        /* Unconditional rather than only when a delta was waiting on the id:
           nothing marks a reconnect the browser made for itself as pending,
           and re-adding what this connection does not yet have is the entire
           point of noticing it. A set that has not moved diffs to nothing and
           costs a comparison. */
        pending.current = false;
        syncRef.current();
      });

      es.addEventListener("ticks", (e) => absorb((e as MessageEvent).data));

      es.addEventListener("error", () => {
        /* EventSource retries a dropped CONNECTION by itself, and while it is
           doing that readyState is CONNECTING — leave it alone.

           It does NOT retry a failed RESPONSE. Per spec a non-200 or a wrong
           content-type is fatal: readyState goes to CLOSED and the browser
           never tries again. That is exactly what a deploy produces, because
           the origin answers 502 for a few seconds while it swaps over — so
           every tab open at that moment lost its feed permanently and sat
           there showing a frozen page until someone reloaded it. This handler
           used to be an empty function on the belief that EventSource
           reconnects on its own, which is only half true. */
        if (es.readyState !== EventSource.CLOSED) return;

        es.close();
        if (es !== source.current) return;
        /* The id died with the connection. The buffer does not: the prices on
           screen were true when they arrived, and freshTicks below ages them
           out on its own clock if the feed never comes back. */
        connId.current = null;
        attempt.current += 1;
        if (retry.current) clearTimeout(retry.current);
        retry.current = setTimeout(
          () => connectRef.current(wantedNow.current),
          reconnectDelay(attempt.current),
        );
      });
    },
    [absorb],
  );

  /* The server has forgotten us — a restart, or a POST that landed on a
     different instance from the stream. A fresh stream is the recovery, and it
     keeps every price already on the page. */
  const reopen = useCallback(() => {
    source.current?.close();
    source.current = null;
    connect(wantedNow.current);
  }, [connect]);

  const sync = useCallback(() => {
    const union = unionOf(registry.current);
    wantedNow.current = union;

    if (!source.current) {
      connect(union);
      return;
    }
    if (connId.current === null || inflight.current) {
      pending.current = true;
      return;
    }

    const { add, remove } = diffSubscription(subscribed.current, union);
    if (add.length === 0 && remove.length === 0) return;

    const id = connId.current;
    inflight.current = true;
    /* Removals are local the moment they are decided. Nothing is reading those
       symbols any more, so there is no value in waiting for the server to
       agree, and a reconnect would not bring them back anyway. */
    drop(remove);

    fetch("/api/stream/subscribe", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id, add, remove }),
    })
      .then(async (response) => {
        if (stopped.current || connId.current !== id) return;
        if (!response.ok) {
          /* 404 is the expected failure and means exactly one thing: this
             instance does not hold our stream. Any other status is a bug we
             cannot fix from here, and a fresh stream fixes both. */
          reopen();
          return;
        }
        subscribed.current = new Set(union);

        /* The cap belongs to the server, so this reply is the only place the
           page can learn that part of what it just asked for was refused. It
           cannot learn WHICH part — the count is all that comes back — so the
           names stay recorded as subscribed and the diff will never mention
           them again. Say so out loud for the same reason the opening request
           does: a surface silently missing its ticks looks exactly like a
           quiet market. */
        const body = (await response.json().catch(() => null)) as { dropped?: number } | null;
        if (typeof body?.dropped === "number" && body.dropped > 0) {
          console.warn(`[live] the stream's cap refused ${body.dropped} of ${union.length} symbols`);
        }
      })
      .catch(() => {
        /* The network, not the server. The stream may well be fine, but we can
           no longer be sure the server's filter matches ours, and a filter we
           cannot trust is worse than a reconnect. */
        if (!stopped.current && connId.current === id) reopen();
      })
      .finally(() => {
        inflight.current = false;
        if (pending.current && !stopped.current) {
          pending.current = false;
          syncRef.current();
        }
      });
  }, [connect, drop, reopen]);

  useEffect(() => {
    syncRef.current = sync;
    connectRef.current = connect;
  }, [sync, connect]);

  const recompute = useCallback(() => {
    if (settle.current) clearTimeout(settle.current);
    settle.current = setTimeout(() => {
      settle.current = null;
      syncRef.current();
    }, COALESCE_MS);
  }, []);

  const register = useCallback(
    (id: number, symbols: readonly string[]) => {
      registry.current.set(id, symbols);
      recompute();
    },
    [recompute],
  );

  const release = useCallback(
    (id: number) => {
      registry.current.delete(id);
      recompute();
    },
    [recompute],
  );

  useEffect(() => {
    /* Reset rather than assume: in development the same refs survive React's
       deliberate unmount-and-remount, and a `stopped` left true would leave the
       provider permanently silent. */
    stopped.current = false;
    return () => {
      stopped.current = true;
      if (settle.current) clearTimeout(settle.current);
      if (retry.current) clearTimeout(retry.current);
      if (frame.current) cancelAnimationFrame(frame.current);
      settle.current = null;
      retry.current = null;
      frame.current = 0;
      source.current?.close();
      source.current = null;
      connId.current = null;
      pending.current = false;
      inflight.current = false;
    };
  }, []);

  /* Aged here, once, rather than in each of the seven surfaces that read this.
     The buffer above never expires anything, and only price-header ever checked
     — so a feed that died mid-session left the header honestly saying "Delayed"
     over the server's price while the ticker tape beneath it went on printing
     the frozen live one. Two prices for one symbol on one screen is worse than
     either of them alone, and a rule seven consumers must remember is a rule
     the eighth will not. freshTicks returns the SAME map when nothing has aged
     out, so this clock does not re-render the terminal for its own sake. */
  const now = useNow();
  const fresh = useMemo(() => freshTicks(ticks, now), [ticks, now]);

  const value = useMemo<LiveValue>(
    () => ({ ticks: fresh, register, release }),
    [fresh, register, release],
  );

  return <LiveContext.Provider value={value}>{children}</LiveContext.Provider>;
}

/** Ticks for the named symbols. Empty until real ones arrive. */
export function useLive(symbols: readonly string[]): ReadonlyMap<string, Tick> {
  const ctx = useContext(LiveContext);
  const id = useMemo(() => ++nextId, []);
  const key = useMemo(
    () => [...new Set(symbols.map((s) => s.toUpperCase()))].sort().join(","),
    [symbols],
  );

  const register = ctx?.register;
  const release = ctx?.release;

  useEffect(() => {
    if (!register || !release || !key) return;
    register(id, key.split(","));
    return () => release(id);
  }, [id, key, register, release]);

  return ctx?.ticks ?? EMPTY;
}

/** One symbol's tick, or null. */
export function useLiveQuote(symbol: string | null | undefined): Tick | null {
  const list = useMemo(() => (symbol ? [symbol] : []), [symbol]);
  const ticks = useLive(list);
  return symbol ? (ticks.get(symbol.toUpperCase()) ?? null) : null;
}

/**
 * A clock that advances on its own, for anything whose answer changes with time
 * rather than with data.
 *
 * The buffer above never expires a tick — `buffer.set` and nothing else — so a
 * feed that dies mid-session leaves its last tick sitting in the map, and any
 * component asking "is this current?" would go on being told yes for as long as
 * the tab stayed open. Nothing re-renders, because nothing arrived. Staleness
 * has to be driven by the clock or it is never noticed at all.
 *
 * Thirty seconds against a fifteen-minute freshness window: the transition is
 * caught promptly without the header re-rendering for its own sake. Safe for
 * the price count-up, whose GSAP dependencies are the server profile rather
 * than anything derived from this.
 */
export function useNow(intervalMs = 30_000): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);

  return now;
}
