import type { PricePoint } from "../api/normalize/series.ts";

/**
 * Keep the day chart level with the headline price.
 *
 * THE MISMATCH
 *
 * The chart draws `history.intraday`, rendered on the server. The headline
 * price comes off the websocket, seconds old. Those were already out of step,
 * and raising the instrument TTL from five minutes to fifteen made it three
 * times worse: on a moving name the chart's last point can sit a quarter of an
 * hour below a price ticking live directly above it. Two numbers for one stock
 * on one screen is the failure this codebase keeps returning to.
 *
 * WHAT THIS DOES NOT DO
 *
 * It does not backfill. The tick is one price at one moment, so it can only
 * ever be the tail — either the bar for the minute it lands in, or a new bar
 * after it. Everything before it is left exactly as the feed published it.
 *
 * The three refusals are the interesting part:
 *
 *   - never move backwards. A replayed or late tick must not rewrite a bar
 *     that is already ahead of it.
 *   - never invent a session. `intraday` is empty when the market is shut, and
 *     one point is not a day.
 *   - never draw across a hole. A line chart interpolates between its points,
 *     which is fair over a minute and a lie over hours: the segment could run
 *     straight through a spike nobody measured. Past MAX_TAIL_GAP_MS the chart
 *     stops where the data stops, and the badge above it already says the page
 *     is behind.
 */

/** The feed publishes one bar a minute, so a tick belongs to the minute it lands in. */
const BUCKET_MS = 60_000;

/**
 * The widest gap worth bridging with a straight line.
 *
 * Thirty minutes covers the honest cases — the page's own fifteen-minute TTL
 * plus the intraday series' five-minute fetch, with room to spare — while
 * refusing the stale ones, where the last bar is hours old and a line to "now"
 * would assert a shape nobody measured.
 */
export const MAX_TAIL_GAP_MS = 30 * 60 * 1000;

export function liveTail(
  intraday: PricePoint[],
  tick: { price: number; at: number } | null | undefined,
  bucketMs: number = BUCKET_MS,
): PricePoint[] {
  /* Identity on every refusal, not a copy — the chart rebuilds its series on a
     new array, and this runs on every tick. */
  if (!tick || !(tick.price > 0)) return intraday;

  const last = intraday.at(-1);
  /* No session to extend. */
  if (!last) return intraday;

  /* Already ahead of this tick. */
  if (tick.at <= last.at) return intraday;

  if (tick.at - last.at > MAX_TAIL_GAP_MS) return intraday;

  const sameMinute = Math.floor(tick.at / bucketMs) === Math.floor(last.at / bucketMs);

  if (sameMinute) {
    /* The bar for this minute exists; the tick is a later trade inside it. The
       close moves, and the extremes only ever widen — a minute that touched
       101.5 still touched it after a trade at 100.1. */
    const updated: PricePoint = {
      ...last,
      at: tick.at,
      price: tick.price,
      high: Math.max(last.high ?? last.price, tick.price),
      low: Math.min(last.low ?? last.price, tick.price),
    };
    return [...intraday.slice(0, -1), updated];
  }

  /* A new minute. One trade is all that is known of it, so open, high and low
     are that trade; volume stays null rather than borrowing the tick's, which
     is the day's running total and not this bar's. */
  return [
    ...intraday,
    { at: tick.at, price: tick.price, open: tick.price, high: tick.price, low: tick.price, volume: null },
  ];
}
