import { isFresh, type Tick } from "../api/stream/tick.ts";

/**
 * Age the live tick buffer out, once, where no consumer can forget to.
 *
 * WHY
 *
 * live-provider's buffer never expires an entry — `buffer.set` and nothing
 * else. The server applies isFresh at ARRIVAL, so nothing stale enters the
 * browser; but once the browser holds a tick it holds it until the tab closes,
 * however long the feed has been silent.
 *
 * The remedy existed in exactly one place. price-header pairs useNow() with
 * liveness(), notices the tick has aged, says "Delayed" and falls back to the
 * server's price. The other six live surfaces — ticker-tape, sidebar,
 * sector-view, popular-ribbon, market-card and dashboard — contain no useNow,
 * no isFresh, and no read of `tick.at` at all. So a feed that dies mid-session
 * left the header honest and the tape beneath it printing a frozen price, with
 * no badge and nothing to suggest it had stopped.
 *
 * Two different prices for one symbol on one screen is worse than either alone,
 * and a rule that must be remembered by seven consumers is a rule that will be
 * forgotten by the eighth. So it is applied once, in the provider.
 *
 * IDENTITY IS PART OF THE CONTRACT
 *
 * This runs off a thirty-second clock. Building a new Map on every tick of that
 * clock would change the context value and re-render every live surface for no
 * reason, sixty times an hour. When nothing has aged out, the same map comes
 * back and React sees no change.
 */
export function freshTicks(
  ticks: ReadonlyMap<string, Tick>,
  now: number,
): ReadonlyMap<string, Tick> {
  let stale = false;
  for (const t of ticks.values()) {
    if (!isFresh(t, now)) {
      stale = true;
      break;
    }
  }
  /* The common case by far: nothing has expired, so hand back the very same
     map and let the memo above it hold. */
  if (!stale) return ticks;

  const out = new Map<string, Tick>();
  for (const [symbol, t] of ticks) {
    if (isFresh(t, now)) out.set(symbol, t);
  }
  return out;
}
