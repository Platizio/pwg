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

/* One live connection for the whole page.
 *
 * Every surface that shows a price wants ticks — the tape, the rail, the index
 * strip, the boards, the instrument header. If each opened its own EventSource
 * the page would hold five connections, and each of those is a subscriber on
 * the single upstream socket the server holds. So consumers register the
 * symbols they care about here, the union is subscribed once, and everyone
 * reads out of the same map.
 *
 * Registrations are coalesced before the connection is opened: components mount
 * over several frames, and reconnecting on each one would tear the stream down
 * and rebuild it five times on first paint.
 */

type LiveValue = {
  ticks: ReadonlyMap<string, Tick>;
  register: (id: number, symbols: readonly string[]) => void;
  release: (id: number) => void;
};

const EMPTY: ReadonlyMap<string, Tick> = new Map();
const LiveContext = createContext<LiveValue | null>(null);

/* Long enough to absorb a mount cascade, short enough that the first ticks are
   not visibly late. */
const COALESCE_MS = 250;

let nextId = 0;

export function LiveProvider({ children }: { children: ReactNode }) {
  const registry = useRef(new Map<number, readonly string[]>());
  const [key, setKey] = useState("");
  const [state, setState] = useState<{ key: string; ticks: ReadonlyMap<string, Tick> }>({
    key: "",
    ticks: EMPTY,
  });
  const settle = useRef<ReturnType<typeof setTimeout> | null>(null);

  const recompute = useCallback(() => {
    if (settle.current) clearTimeout(settle.current);
    settle.current = setTimeout(() => {
      settle.current = null;
      const union = new Set<string>();
      for (const list of registry.current.values()) {
        for (const s of list) union.add(s.toUpperCase());
      }
      setKey([...union].sort().join(","));
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
    if (!key) return;
    const buffer = new Map<string, Tick>();
    let source: EventSource | null = null;
    let retry: ReturnType<typeof setTimeout> | null = null;
    let attempt = 0;
    let stopped = false;
    let frame = 0;

    /* Ticks arrive faster than the browser can usefully paint. One state update
       per frame keeps a busy open from becoming a render storm. */
    const flush = () => {
      frame = 0;
      setState({ key, ticks: new Map(buffer) });
    };

    const absorb = (payload: string) => {
      /* Anything arriving is proof the stream is healthy again, so the backoff
         starts over. Same rule the server uses: a subscription, not a socket. */
      attempt = 0;
      let data: { ticks?: Tick[] };
      try {
        data = JSON.parse(payload);
      } catch {
        return;
      }
      let changed = false;
      for (const t of data.ticks ?? []) {
        const prev = buffer.get(t.symbol);
        if (prev && prev.at > t.at) continue;
        buffer.set(t.symbol, t);
        changed = true;
      }
      if (changed && frame === 0) frame = requestAnimationFrame(flush);
    };

    const connect = () => {
      if (stopped) return;
      const es = new EventSource(`/api/stream?symbols=${encodeURIComponent(key)}`);
      source = es;

      es.addEventListener("snapshot", (e) => absorb((e as MessageEvent).data));
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
        attempt += 1;
        if (retry) clearTimeout(retry);
        retry = setTimeout(connect, reconnectDelay(attempt));
      });
    };

    connect();

    return () => {
      stopped = true;
      if (frame) cancelAnimationFrame(frame);
      if (retry) clearTimeout(retry);
      source?.close();
    };
  }, [key]);

  /* Ticks belong to the symbol set that was subscribed when they arrived. If
     the set has changed and the new one has not answered yet, show none rather
     than one page's prices under another page's symbols. */
  const held = state.key === key ? state.ticks : EMPTY;

  /* Aged here, once, rather than in each of the seven surfaces that read this.
     The buffer above never expires anything, and only price-header ever checked
     — so a feed that died mid-session left the header honestly saying "Delayed"
     over the server's price while the ticker tape beneath it went on printing
     the frozen live one. Two prices for one symbol on one screen is worse than
     either of them alone, and a rule seven consumers must remember is a rule
     the eighth will not. freshTicks returns the SAME map when nothing has aged
     out, so this clock does not re-render the terminal for its own sake. */
  const now = useNow();
  const ticks = useMemo(() => freshTicks(held, now), [held, now]);

  const value = useMemo<LiveValue>(() => ({ ticks, register, release }), [ticks, register, release]);

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
