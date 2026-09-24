"use client";

import { useEffect, useState } from "react";
import type { PricePoint } from "@/lib/api/normalize/series";
import {
  historyAnswered,
  historyNextFetch,
  historyReplaces,
  type FetchedRange,
  type HeldHistory,
} from "@/lib/market/ranges";
import type { SessionPhase } from "@/lib/market/session";

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
 *
 * And three about not letting a bad moment outlast itself — the policy lives
 * in lib/market/ranges.ts, where it is tested:
 *
 *   AN EMPTY OR FAILED ANSWER IS ASKED AGAIN WITHIN HALF A MINUTE. An empty
 *   series used to be cached like a full one, for up to three hours, and a
 *   failure was never retried until the reader pressed another range.
 *
 *   ONLY A 200 IS AN ANSWER. Anything else is a failure, not a series.
 *
 *   AN ANSWER SHORT OF THE OPEN OR THE BELL IS ASKED AGAIN, AND STAYS DRAWN.
 *   Fetched before the open, 1D is yesterday's session and 1W ends yesterday;
 *   fetched before the bell, every minute range lacks the official close. Each
 *   is due at once when the boundary passes, and asked again every half
 *   minute or so while upstream catches up (historyNextFetch). It used to be
 *   dropped instead, which blanked the day and threw the week back to daily
 *   closes at every open for as long as the refetch took to find today.
 *
 *   A REFETCH NEVER MOVES THE CHART BACKWARDS. An answer that reaches less
 *   far than the one held — empty, or the route's coarser fallback of the same
 *   session — does not replace it (historyReplaces).
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
type Held = HeldHistory & { points: PricePoint[] };

const CACHE = new Map<string, Held>();
const CACHE_MAX = 24;

/* When the last fetch for a key failed. Cleared by the next answer; read by
   the render to say "failed" and by the schedule to retry. */
const FAILED_AT = new Map<string, number>();

function remember(key: string, points: PricePoint[]): void {
  CACHE.delete(key);
  CACHE.set(key, { points, count: points.length, at: Date.now(), lastAt: points.at(-1)?.at ?? null });
  FAILED_AT.delete(key);
  while (CACHE.size > CACHE_MAX) {
    const oldest = CACHE.keys().next().value;
    if (oldest === undefined) break;
    CACHE.delete(oldest);
    FAILED_AT.delete(oldest);
  }
}

/**
 * The series for one range, fetched once and remembered.
 *
 * `range` may be null, which means the caller is showing a range the page
 * already carries and wants nothing fetched at all.
 *
 * `phase` is the reader's session phase, and it is here only to wake the
 * schedule when it turns: the open and the bell are when a held minute range
 * falls short of what it should reach and is due again. A caller that reads
 * only five years, which neither changes, can leave it out.
 */
export function useHistory(
  ticker: string,
  range: FetchedRange | null,
  phase?: SessionPhase,
): HistoryRead {
  /* Bumped when a fetch lands, fails, or its entry falls due — to bring the
     render back round to read the cache, and the effect round to schedule the
     next fetch. The series itself is never held in state. */
  const [wake, setWake] = useState(0);

  const key = ticker && range ? `${ticker}:${range}` : null;
  /* Not read by the effect, only listed in its dependencies: a phase change
     re-runs the schedule, which is how an answer held across the open or the
     bell is found to be due. */
  const bound = phase ?? null;

  useEffect(() => {
    if (!key || !range) return;

    const controller = new AbortController();
    /* Belt and braces with the signal: a fetch that has already resolved and
       is being parsed is not rejected by an abort. */
    let live = true;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const bump = () => setWake((n) => n + 1);
    const cleanup = () => {
      live = false;
      controller.abort();
      if (timer !== null) clearTimeout(timer);
    };

    /* Not due yet: sleep until it is. A timer rather than a polling clock, so
       an empty answer is retried at thirty seconds, not whenever a coarse
       clock next happens to tick. */
    const now = Date.now();
    const due = historyNextFetch(CACHE.get(key), FAILED_AT.get(key), range, now);
    const wait = due - now;
    if (wait > 0) {
      timer = setTimeout(bump, wait);
      return cleanup;
    }

    /* A re-ask revalidates. The route's answers carry max-age=60, so a retry
       half a minute after an empty one — or a refetch at the opening bell of a
       day fetched at 09:29 — would otherwise be handed the very body it is
       replacing, straight out of the browser's cache. */
    const again = CACHE.has(key) || FAILED_AT.has(key);
    fetch(`/api/history/${encodeURIComponent(ticker)}?range=${range}`, {
      signal: controller.signal,
      cache: again ? "no-cache" : "default",
    })
      .then((res) => {
        if (!historyAnswered(res.status)) throw new Error(`history ${res.status}`);
        return res.json();
      })
      .then((body: { series?: unknown }) => {
        if (!live) return;
        const next = toPoints(body?.series);
        const held = CACHE.get(key);
        /* Stamped as landing now either way, so the schedule runs from this
           answer: a kept copy that is still short is asked again soon. */
        remember(
          key,
          held && !historyReplaces(held, { count: next.length, lastAt: next.at(-1)?.at ?? null })
            ? held.points
            : next,
        );
        bump();
      })
      .catch((error: unknown) => {
        /* An abort is this component tidying up after itself, not something
           the reader should be told about. */
        if (!live || controller.signal.aborted) return;
        if (error instanceof DOMException && error.name === "AbortError") return;
        /* Not cached as an answer: a failure is about this moment. Recorded so
           the schedule retries it in half a minute and the render can say so. */
        FAILED_AT.set(key, Date.now());
        /* Bounded like the cache: a key that never answers is still one key. */
        while (FAILED_AT.size > CACHE_MAX) {
          const oldest = FAILED_AT.keys().next().value;
          if (oldest === undefined) break;
          FAILED_AT.delete(oldest);
        }
        bump();
      });

    return cleanup;
  }, [key, ticker, range, bound, wake]);

  if (!key || !range) return { points: NO_POINTS, state: "idle" };

  const held = CACHE.get(key);
  if (held) return { points: held.points, state: held.points.length ? "ready" : "empty" };
  /* A failure never blanks bars that are already drawn — but there are none to
     keep here, or the cache would have answered. */
  if (FAILED_AT.has(key)) return { points: NO_POINTS, state: "failed" };
  return { points: NO_POINTS, state: "loading" };
}
