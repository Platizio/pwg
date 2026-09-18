import type { Snapshot } from "../api/sweep.ts";
import { eligibleRows } from "./screen.ts";

/**
 * Which symbols are worth re-quoting every five minutes.
 *
 * The sweep asks the gateway for every tradable symbol — 13,797 of them, 276
 * chunks — and ends up with about 4,400 rows that clear the floor. Everything
 * that reads the snapshot reads only those: the movers boards, the sector
 * strip, the breadth sample, and the search corpus. The other nine thousand
 * are fetched, parsed and discarded.
 *
 * That waste is not free on a small instance. Measured on the deployed box, a
 * regeneration saturates the CPU and every other request queues behind it — a
 * fully static page with a warm cache went from 0.36s to 8.98s while a sweep
 * was running. Quoting a third of the symbols is a third of the TLS
 * handshakes and a third of the JSON to parse.
 *
 * Eligibility needs a quote to decide — price and thirty-day average volume
 * come from the feed — so the list cannot be derived from the symbol master.
 * It comes from a full sweep instead, run on a slow cadence, with the frequent
 * sweep quoting its result.
 *
 * Pure and free of `next/cache` on purpose: scripts/build-baseline.mts loads
 * screen.ts from plain Node, and the caching wrapper lives in swept.ts.
 */

/**
 * The shortest hot list worth trusting.
 *
 * Without a floor, one bad full sweep — a gateway blip returning a handful of
 * rows — becomes the hot list, and every sweep for the next hour quotes four
 * symbols. A terminal showing four names is worse than a slow one, so a short
 * list is refused outright and the caller sweeps everything instead.
 *
 * 500 against a live pool of ~4,400: low enough that ordinary day-to-day
 * movement in what clears the floor never trips it, high enough that a
 * genuinely broken sweep does.
 */
export const MIN_HOT = 500;

/**
 * The symbols from `full` that clear the floor, or `null` if there are too few
 * to trust — which means: sweep everything.
 */
/**
 * The most of the universe a sweep may have missed and still be allowed to
 * decide who is liquid.
 *
 * Two percent of 276 chunks is five, and a chunk is fifty symbols, so this
 * tolerates roughly 250 names going unseen. That is not a comfortable number
 * and it is not meant to be: it is the point at which refusing outright would
 * start rejecting ordinary sweeps — the gateway fails a chunk now and then —
 * against the cost of a demotion, which lasts an hour and is invisible on the
 * page. Above it the sweep is not a reading of the market, and a list drawn
 * from it would remove names for having been unreachable rather than illiquid.
 */
const MAX_MISSED_SHARE = 0.02;

/**
 * How much smaller than the set it replaces a new hot list may be.
 *
 * The share above catches a sweep that admits it failed. This catches one that
 * does not: chunks that answered 200 with nothing, a gateway quietly serving a
 * subset, an entitlement that lapsed overnight. The universe's liquid tail
 * moves by a few percent a day, so a list that has lost a tenth of its names in
 * one hour did not lose them to the market.
 */
const MIN_RETAINED_SHARE = 0.9;

export function hotList(full: Snapshot, previous?: readonly string[] | null): string[] | null {
  /* `eligibleRows`, not `eligible`. The boards apply two filters — clears the
     liquidity floor AND carries a quote recent enough to describe today — and
     the hot list must be exactly what the boards can show. Filtering on the
     first alone kept roughly 8,000 names that are liquid on paper but whose
     last quote is days dead: at the gateway's fifty per call that is 160 chunks
     a sweep instead of 90, for rows that are dropped again before anything
     renders. */
  /* WHAT THE SWEEP SAW COMES BEFORE WHAT IT RANKED, because this function's
     answer does not merely add names — market_set_hot rewrites the flag for
     every symbol in one pass, so a name absent from this list is demoted. A
     sweep that lost eighty of its 276 chunks still yields thousands of
     eligible rows, comfortably past the floor below, and every one of the
     ~4,000 symbols it never reached would be dropped from the boards and from
     the next eleven five-minute sweeps. The floor cannot catch that: it asks
     whether the list is big enough to be a market, not whether it is a reading
     of the whole one. */
  if (full.calls > 0 && full.failedChunks / full.calls > MAX_MISSED_SHARE) return null;

  const symbols = eligibleRows(full).map((r) => r.s);
  if (symbols.length < MIN_HOT) return null;

  /* And the sweep that does not admit it failed. `previous` is what the last
     accepted sweep left; absent — a worker that has just started and not yet
     read the stored set — there is nothing to compare against and nothing to
     lose by accepting. */
  if (previous && previous.length > 0 && symbols.length < previous.length * MIN_RETAINED_SHARE) {
    return null;
  }

  return symbols;
}
