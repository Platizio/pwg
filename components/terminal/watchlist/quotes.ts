import { useEffect, useMemo, useSyncExternalStore } from "react";
import { useLive } from "@/components/terminal/live-provider";
import { INSTRUMENTS } from "@/lib/market/instruments";
import { MAX_QUOTE_SYMBOLS } from "@/lib/market/watchlists";
import { watchlists } from "./store";

/* Figures for any symbol a watchlist holds.
 *
 * The same two sources the sidebar has always used for its six names, extended
 * to every symbol:
 *
 *   1. What the server already rendered. The layout hands the rail a day change
 *      for every name on the tape, and the watchlist page hands its table the
 *      search corpus's quotes. Anything covered there costs nothing.
 *   2. The live feed, through the one shared connection (useLive). A tick that
 *      carries its own change replaces the server figure — the rule every other
 *      live surface keeps, so a live price is never paired with an older basis.
 *
 * What neither covers is asked for once, after hydration, from
 * /api/quotes/watchlist, and the answer is held here for the tab — so the rail
 * and the page, and two mounts of the rail, share one request rather than each
 * making their own.
 */

export type WatchQuote = {
  id: string;
  name: string;
  mark: string;
  color: string;
  price: number;
  /** Percent. Null: priced, but the feed sent no change. */
  chg: number | null;
};

export type Figure = {
  price: number | null;
  /** Day change, percent. */
  chg: number | null;
  /** Day change, dollars. */
  change: number | null;
  live: boolean;
};

export type Look = { name: string | null; mark: string; color: string };

/* An answer is good for five minutes (the sweep's own cadence — live ticks
   carry everything in between); a failed request is retried after one, so a
   gateway blip does not leave a row blank for long. */
const FRESH_MS = 5 * 60_000;
const RETRY_MS = 60_000;

type Entry = { quote: WatchQuote | null; at: number; failed: boolean };

const cache = new Map<string, Entry>();
const inflight = new Set<string>();
let version = 0;
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const getVersion = () => version;
const getServerVersion = () => 0;

function bump() {
  version += 1;
  for (const listener of listeners) listener();
}

function due(symbol: string, now: number): boolean {
  if (inflight.has(symbol)) return false;
  const entry = cache.get(symbol);
  if (!entry) return true;
  /* An answer — priced, or "no quote for this one" — holds for the full
     window; only a failed request is retried sooner. */
  return now - entry.at > (entry.failed ? RETRY_MS : FRESH_MS);
}

async function request(symbols: string[]) {
  for (const s of symbols) inflight.add(s);
  const at = Date.now();
  try {
    const response = await fetch(
      `/api/quotes/watchlist?symbols=${encodeURIComponent(symbols.join(","))}`,
    );
    if (!response.ok) throw new Error(`quotes ${response.status}`);
    const body = (await response.json()) as { quotes?: WatchQuote[]; pending?: unknown };
    const learned: Record<string, string> = {};
    const priced = new Set<string>();
    for (const q of body.quotes ?? []) {
      if (typeof q?.id !== "string" || typeof q.price !== "number") continue;
      cache.set(q.id, { quote: q, at, failed: false });
      priced.add(q.id);
      if (typeof q.name === "string") learned[q.id] = q.name;
    }
    /* `pending`: the route ran out of its time budget before an upstream
       answered for these (app/api/quotes/watchlist/answer.ts). That is not
       "no quote" — the answer is on its way into the server's cache — so they
       are kept as a failed ask and asked again after RETRY_MS, not blanked for
       the full FRESH_MS. */
    const pending = new Set(
      Array.isArray(body.pending) ? body.pending.filter((s): s is string => typeof s === "string") : [],
    );
    /* Asked and not priced — not tradable, or no quote today. Remembered as
       such, so the row shows a dash rather than asking again on every render. */
    for (const s of symbols) {
      if (priced.has(s)) continue;
      cache.set(
        s,
        pending.has(s)
          ? { quote: cache.get(s)?.quote ?? null, at, failed: true }
          : { quote: null, at, failed: false },
      );
    }
    watchlists.learn(learned);
  } catch {
    for (const s of symbols) {
      const held = cache.get(s);
      cache.set(s, { quote: held?.quote ?? null, at, failed: true });
    }
  } finally {
    for (const s of symbols) inflight.delete(s);
    bump();
  }
}

function fetchMissing(symbols: readonly string[]) {
  const now = Date.now();
  const need = symbols.filter((s) => due(s, now));
  for (let i = 0; i < need.length; i += MAX_QUOTE_SYMBOLS) {
    void request(need.slice(i, i + MAX_QUOTE_SYMBOLS));
  }
}

const AUTHORED = new Map(INSTRUMENTS.map((i) => [i.id, i]));

/* The palette the server's `presentation()` draws from, for a symbol whose
   look has not arrived yet. Neutral rather than guessed, so nothing changes
   colour when the real answer lands for anything but a curated name. The
   palette's own custom property, so it deepens on the light theme as every
   answered monogram does (globals.css). */
const NEUTRAL = "var(--c-mark-4)";

/**
 * How a symbol's row looks: the authored look for the six covered names (the
 * rail has always drawn those exactly so), else what the price answer said,
 * else the name remembered in the list and a derived monogram.
 */
export function lookOf(
  symbol: string,
  remembered: Readonly<Record<string, string>>,
  seed?: { name?: string; mark?: string; color?: string },
): Look {
  const authored = AUTHORED.get(symbol);
  if (authored) return { name: authored.short, mark: authored.mark, color: authored.color };
  const fetched = cache.get(symbol)?.quote;
  return {
    name: seed?.name ?? fetched?.name ?? remembered[symbol] ?? null,
    mark: seed?.mark ?? fetched?.mark ?? (symbol[0] ?? "?"),
    color: seed?.color ?? fetched?.color ?? NEUTRAL,
  };
}

/** Whether the price answer said a symbol has no quote. */
export function unpriced(symbol: string): boolean {
  const entry = cache.get(symbol);
  return entry !== undefined && entry.quote === null && !entry.failed;
}

export type SeedQuote = { price: number | null; chg: number | null };

/**
 * Figures for `symbols`, merged from the server seed, the fetched answers and
 * the live feed.
 *
 * `seed` is what the caller's server render already knew. A symbol present in
 * it with a change is not fetched: `seedCoversPrice` says whether the seed's
 * price is usable too (the rail's seed carries a change only, which is all the
 * rail draws; the page's carries both).
 */
export function useWatchFigures(
  symbols: readonly string[],
  seed: ReadonlyMap<string, SeedQuote>,
  {
    seedCoversPrice,
    named,
  }: {
    seedCoversPrice: boolean;
    /* Whether a row already has a name to show. A symbol the seed prices but
       nothing names — the rail's seed is a bare change — is asked about once
       anyway, and the answer's name is remembered in the list. */
    named: (symbol: string) => boolean;
  },
): { figures: ReadonlyMap<string, Figure>; looks: number } {
  const cacheVersion = useSyncExternalStore(subscribe, getVersion, getServerVersion);
  const ticks = useLive(symbols);

  const needKey = useMemo(
    () =>
      symbols
        .filter((s) => {
          if (!AUTHORED.has(s) && !named(s)) return true;
          const known = seed.get(s);
          if (!known || known.chg === null) return true;
          return seedCoversPrice ? known.price === null : false;
        })
        .join(","),
    [symbols, seed, seedCoversPrice, named],
  );

  useEffect(() => {
    if (!needKey) return;
    const need = needKey.split(",");
    fetchMissing(need);
    /* Re-checked every minute; only what has aged past its window is asked
       for again. Nothing runs while the tab is hidden. */
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") fetchMissing(need);
    }, RETRY_MS);
    return () => clearInterval(timer);
  }, [needKey]);

  const figures = useMemo(() => {
    const out = new Map<string, Figure>();
    for (const symbol of symbols) {
      const tick = ticks.get(symbol);
      if (tick && tick.changePercent !== null) {
        out.set(symbol, {
          price: tick.price,
          chg: tick.changePercent,
          change: tick.change,
          live: true,
        });
        continue;
      }
      const seeded = seed.get(symbol);
      const fetched = cache.get(symbol)?.quote ?? null;
      const price = (seedCoversPrice ? seeded?.price : null) ?? fetched?.price ?? null;
      const chg =
        seeded && seeded.chg !== null && (!seedCoversPrice || seeded.price !== null)
          ? seeded.chg
          : (fetched?.chg ?? seeded?.chg ?? null);
      out.set(symbol, {
        price,
        chg,
        change: price !== null && chg !== null ? price - price / (1 + chg / 100) : null,
        live: false,
      });
    }
    /* `cacheVersion` is how a fetched answer reaches this memo: the cache is
       module state, so its version number is what changes. */
    void cacheVersion;
    return out;
  }, [symbols, ticks, seed, seedCoversPrice, cacheVersion]);

  return { figures, looks: cacheVersion };
}
