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
    const source = new EventSource(`/api/stream?symbols=${encodeURIComponent(key)}`);
    let frame = 0;

    /* Ticks arrive faster than the browser can usefully paint. One state update
       per frame keeps a busy open from becoming a render storm. */
    const flush = () => {
      frame = 0;
      setState({ key, ticks: new Map(buffer) });
    };

    const absorb = (payload: string) => {
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

    source.addEventListener("snapshot", (e) => absorb((e as MessageEvent).data));
    source.addEventListener("ticks", (e) => absorb((e as MessageEvent).data));
    /* EventSource reconnects on its own. A drop is not data, so the page keeps
       whatever the server rendered rather than blanking. */
    source.addEventListener("error", () => {});

    return () => {
      if (frame) cancelAnimationFrame(frame);
      source.close();
    };
  }, [key]);

  /* Ticks belong to the symbol set that was subscribed when they arrived. If
     the set has changed and the new one has not answered yet, show none rather
     than one page's prices under another page's symbols. */
  const ticks = state.key === key ? state.ticks : EMPTY;
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
