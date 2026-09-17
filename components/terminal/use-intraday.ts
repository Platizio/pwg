"use client";

import { useEffect, useMemo, useState } from "react";
import type { PricePoint } from "@/lib/api/normalize/series";
import { pricesMove, sessionAt, type SessionPhase } from "@/lib/market/session";

/* The day's bars, fetched by the browser instead of by the render.

   They used to ride the instrument snapshot, which meant every cold page waited
   on them along with twelve other gateway calls. Nothing else on the page moves
   at their cadence, so they are the one series worth a round trip of its own —
   see app/api/intraday/[ticker]/route.ts.

   Two rules keep this from becoming a background tab that polls forever:

     - it re-asks only while prices actually move. pricesMove() is the wide
       reading and the right one here: pre-market and post-market carry real
       price updates, and gating on the regular session alone would freeze the
       chart for four hours a day while the book is still trading.
     - it aborts in flight. A reader tabbing between stocks starts a fetch per
       stock, and without the abort the slowest answer wins whichever symbol it
       belongs to.

   The phase that first gate reads is the READER's, not the render's. A
   snapshot's phase was computed by whichever clock drew the page, and for the
   five hundred pages built ahead of time that is the build machine's, hours or
   days ago. A build that finishes outside market hours ships every one of them
   with a phase of "closed", pricesMove("closed") is false, and a reader landing
   on such a page mid-session would fetch the day once at mount and watch it
   stand still for the rest of the afternoon — which is the exact case this
   whole hook exists for. An ISR entry that spans the 04:00 pre-market boundary
   has the same problem for up to its fifteen minutes.

   So the caller's phase is the opening bid and nothing more, held only until
   the reader's own clock lands a tick after mount. That is the trade
   components/home/use-session.ts already makes, and for the same reason: a
   clock read during render would make the server and the client disagree. */

export type IntradayRead = {
  /** The session so far, oldest first. Empty until the first answer lands. */
  intraday: PricePoint[];
  /** Why it is empty, when it is — the chart draws this over the day view. */
  note: string | null;
};

/** One minute, matching the cadence the upstream publishes bars at. */
const REFRESH_MS = 60_000;

/** How often the reader's clock is re-read for the phase. Half a minute, as in
    use-session.ts — finer than any boundary the gate below turns on. */
const PHASE_MS = 30_000;

/* Module constants so an unanswered hook returns the same values on every
   render. The chart rebuilds its series on a new array, and this hook renders
   beside a websocket tick that arrives every few seconds. */
const NO_POINTS: PricePoint[] = [];
const PENDING: IntradayRead = { intraday: NO_POINTS, note: null };

/** What the route sends back, before it has been believed. */
type Body = { intraday?: unknown; note?: unknown };

export function useIntraday(symbol: string, renderedPhase: SessionPhase): IntradayRead {
  /* Keyed by symbol rather than reset on change, so a navigation between two
     stocks cannot show the first one's session under the second one's name for
     the frame before the new answer arrives. */
  const [answer, setAnswer] = useState<(IntradayRead & { symbol: string }) | null>(null);

  /* Null until the browser has read its own clock, which is what keeps the
     first client render identical to the server's. Nothing below this reaches
     the DOM — the phase only decides whether a timer exists — so the correction
     costs a re-render and no flicker. When the two agree, and they usually do,
     setState is handed the same string and React stops there. */
  const [clockPhase, setClockPhase] = useState<SessionPhase | null>(null);
  useEffect(() => {
    const tick = () => setClockPhase(sessionAt(Date.now() / 1000).phase);
    tick();
    const t = setInterval(tick, PHASE_MS);
    return () => clearInterval(t);
  }, []);
  const phase = clockPhase ?? renderedPhase;

  useEffect(() => {
    const controller = new AbortController();
    /* Belt and braces with the signal: `setState` after unmount is the thing
       being prevented, and an abort only rejects a fetch that is still in the
       network — one that has already resolved and is being parsed is not. */
    let live = true;

    const load = async () => {
      try {
        const res = await fetch(`/api/intraday/${encodeURIComponent(symbol)}`, {
          signal: controller.signal,
        });
        if (!res.ok) return;
        const body = (await res.json()) as Body;
        if (!live) return;
        setAnswer({
          symbol,
          /* Parsed JSON wearing a type. An answer that is not the shape this
             expects leaves the chart exactly as it was rather than throwing
             inside a render. */
          intraday: Array.isArray(body.intraday) ? (body.intraday as PricePoint[]) : NO_POINTS,
          note: typeof body.note === "string" ? body.note : null,
        });
      } catch {
        /* Aborted, offline, or a body that would not parse. Whatever is on
           screen stays on screen; the next interval tries again. */
      }
    };

    void load();

    /* No timer at all outside trading hours. A closed market publishes no new
       bars, so a poll would spend a request a minute to be told the same
       thing. Re-running on a phase change is the point rather than a cost: the
       moment the reader's clock crosses into pre-market this effect tears down,
       re-asks for a series that is finally moving, and starts the timer. */
    const timer = pricesMove(phase) ? setInterval(() => void load(), REFRESH_MS) : null;

    return () => {
      live = false;
      controller.abort();
      if (timer !== null) clearInterval(timer);
    };
  }, [symbol, phase]);

  return useMemo(
    () =>
      answer !== null && answer.symbol === symbol
        ? { intraday: answer.intraday, note: answer.note }
        : PENDING,
    [answer, symbol],
  );
}
