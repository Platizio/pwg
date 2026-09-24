"use client";

import { useEffect, useState } from "react";
import type { PricePoint } from "@/lib/api/normalize/series";
import type { FetchedRange } from "@/lib/market/ranges";
import { useNow } from "./live-provider";

/* The ranges the page does not carry, fetched when the reader asks for one.
 *
 * WHAT THIS REPLACES. The instrument page used to ship every range at once —
 * the company's five years of daily bars and the benchmark's, 2,549 of them,
 * 234KB of a 438KB payload — on every click, whether or not the reader ever
 * touched the range buttons. On a 512MB instance each such render held forty
 * to sixty megabytes and did not release it: a fresh box measured 81MB, then
 * 200, then 212, and the next render returned 502. Afterwards every
 * never-prerendered stock hung indefinitely while the prerendered ones kept
 * serving, which is what a reader experiences as clicking a gainer and nothing
 * happening.
 *
 * So the page ships the year it opens with — 1M and 3M are slices of it, and
 * stay instant — and this fetches the day, the week and the five years only
 * when a button is pressed.
 *
 * Three rules, and each is about not making a chart lie:
 *
 *   ONE REQUEST PER (SYMBOL, RANGE). A reader toggling 1W and 1D to compare
 *   them is the normal way to read a chart, and it should cost one request
 *   each, not one per press.
 *
 *   ABORT IN FLIGHT when the ticker changes or the component unmounts. Without
 *   it the slowest answer wins whichever symbol it belongs to — the same
 *   failure use-intraday.ts guards against, and it draws one company's prices
 *   under another company's name.
 *
 *   A FAILURE NEVER BLANKS WHAT IS DRAWN. If a range has already loaded and a
 *   later fetch fails, the bars stay and the state says so. Replacing real
 *   prices with an empty chart because a request timed out tells the reader
 *   something false about the market.
 */

export type HistoryState = "idle" | "loading" | "ready" | "empty" | "failed";

export type HistoryRead = {
  points: PricePoint[];
  state: HistoryState;
};

/* Stable across renders. The chart rebuilds its series whenever this array's
   identity changes, and this hook renders beside a websocket tick arriving
   every few seconds. */
const NO_POINTS: PricePoint[] = [];

/** The columnar shape both stored series arrive in. */
type Columns = {
  date?: unknown;
  price?: unknown;
  opening?: unknown;
  high?: unknown;
  low?: unknown;
  volume?: unknown;
};

const finite = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) ? v : null;

/**
 * The wire shape, into the points the chart draws.
 *
 * Two shapes arrive here and both are handled rather than assumed: the daily
 * series comes back as rows the gateway's normaliser already understands, and
 * the intraday series as six parallel columns. Anything whose price or date is
 * unreadable is dropped rather than charted — a NaN on the axis rescales the
 * whole plot to nothing, which looks like a bug in the chart rather than in
 * the data.
 */
function toPoints(series: unknown): PricePoint[] {
  if (Array.isArray(series)) {
    const out: PricePoint[] = [];
    for (const row_ of series) {
      if (typeof row_ !== "object" || row_ === null) continue;
      const r = row_ as { date?: unknown; price?: unknown };
      const at = Date.parse(String(r.date ?? ""));
      const price = finite(r.price);
      if (!Number.isFinite(at) || price === null) continue;
      const row = row_ as Record<string, unknown>;
      out.push({
        at,
        price,
        open: finite(row.opening ?? row.open),
        high: finite(row.high),
        low: finite(row.low),
        volume: finite(row.volume),
      });
    }
    return out;
  }

  if (typeof series !== "object" || series === null) return NO_POINTS;
  const c = series as Columns;
  if (!Array.isArray(c.date) || !Array.isArray(c.price)) return NO_POINTS;

  const out: PricePoint[] = [];
  for (let i = 0; i < c.date.length; i += 1) {
    const at = Date.parse(String(c.date[i]));
    const price = finite(c.price[i]);
    if (!Number.isFinite(at) || price === null) continue;
    const col = (v: unknown): number | null =>
      Array.isArray(v) ? finite((v as unknown[])[i]) : null;
    out.push({
      at,
      price,
      open: col(c.opening),
      high: col(c.high),
      low: col(c.low),
      volume: col(c.volume),
    });
  }
  return out;
}

/* Outside the component on purpose.
 *
 * A ref cannot be read during render — a chart that already has its bars must
 * draw them on the first pass, not after an effect has run — and state cannot
 * hold them without a synchronous setState inside the effect, which is the
 * cascading render the linter is right to refuse. A module-level map is read
 * during render, written after a fetch, and shared between the chart and the
 * performance panel when they want the same series.
 *
 * Bounded, because it outlives every component that reads it: a reader moving
 * through the boards would otherwise accumulate every series of every stock
 * they looked at for as long as the tab lived, and these are the heaviest
 * objects on the page. Oldest out first; twenty-four is a few stocks' worth of
 * ranges, which is the span of a session's browsing.
 */
const CACHE = new Map<string, PricePoint[]>();
const CACHE_MAX = 24;

/* When each entry landed. The cache used to be forever, so a tab left open
   overnight kept drawing yesterday's session as "the last session" and a
   five-year series that never gained a bar. */
const FETCHED_AT = new Map<string, number>();

/* Short for the intraday ranges, which gain a session each evening and whose
   "last session" changes identity at the capture; long for five years, which
   gains one bar a day. Refetched in the background while the held bars stay on
   screen, so a failed refresh never blanks a drawn chart. */
const TTL_MS: Record<FetchedRange, number> = {
  "1D": 5 * 60_000,
  "1W": 5 * 60_000,
  "1M": 15 * 60_000,
  "3M": 60 * 60_000,
  "1Y": 3 * 60 * 60_000,
  "5Y": 3 * 60 * 60_000,
};

function remember(key: string, points: PricePoint[]): void {
  CACHE.delete(key);
  CACHE.set(key, points);
  FETCHED_AT.set(key, Date.now());
  while (CACHE.size > CACHE_MAX) {
    const oldest = CACHE.keys().next().value;
    if (oldest === undefined) break;
    CACHE.delete(oldest);
    FETCHED_AT.delete(oldest);
  }
}

/**
 * The series for one range, fetched once and remembered.
 *
 * `range` may be null, which means the caller is showing a range the page
 * already carries and wants nothing fetched at all.
 */
export function useHistory(ticker: string, range: FetchedRange | null): HistoryRead {
  /* Bumped when a fetch lands, purely to bring the render back round to read
     the cache again. The series itself is never held in state. */
  const [, setLanded] = useState(0);
  const [failed, setFailed] = useState<string | null>(null);

  const key = ticker && range ? `${ticker}:${range}` : null;

  /* A coarse clock, so an open tab notices when its entry has aged out. */
  const now = useNow(60_000);
  const landedAt = key ? FETCHED_AT.get(key) : undefined;
  const stale = !key || landedAt === undefined || now - landedAt > TTL_MS[range as FetchedRange];

  useEffect(() => {
    if (!key) return;
    if (!stale) return;

    const controller = new AbortController();
    const [symbol, wanted] = [ticker, range as FetchedRange];

    fetch(`/api/history/${encodeURIComponent(symbol)}?range=${wanted}`, {
      signal: controller.signal,
    })
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))))
      .then((body: { series?: unknown }) => {
        remember(key, toPoints(body?.series));
        setFailed(null);
        setLanded((n) => n + 1);
      })
      .catch((error: unknown) => {
        /* An abort is this component tidying up after itself, not something the
           reader should be told about. */
        if (controller.signal.aborted) return;
        if (error instanceof DOMException && error.name === "AbortError") return;
        /* Not cached: a failure is about this moment, and the next press should
           be allowed to try again. */
        setFailed(key);
      });

    return () => controller.abort();
  }, [key, ticker, range, stale]);

  if (!key) return { points: NO_POINTS, state: "idle" };

  const held = CACHE.get(key);
  if (held) return { points: held, state: held.length ? "ready" : "empty" };
  /* A failure never blanks bars that are already drawn — but there are none to
     keep here, or the cache would have answered. */
  if (failed === key) return { points: NO_POINTS, state: "failed" };
  return { points: NO_POINTS, state: "loading" };
}
