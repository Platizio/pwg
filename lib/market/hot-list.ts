import type { Snapshot } from "../api/sweep.ts";
import { eligibleRows } from "./screen.ts";

/**
 * Which symbols are worth re-quoting every five minutes.
 *
 * The sweep asks the gateway for every tradable symbol — 21,600 of them, 432
 * chunks — and ends up with about 4,400 rows that clear the floor. Everything
 * that reads the snapshot reads only those: the movers boards, the sector
 * strip, the breadth sample, and the search corpus. The other seventeen
 * thousand are fetched, parsed and discarded.
 *
 * That waste is not free on a small instance. Measured on the deployed box, a
 * regeneration saturates the CPU and every other request queues behind it — a
 * fully static page with a warm cache went from 0.36s to 8.98s while a sweep
 * was running. Quoting a quarter of the symbols is a quarter of the TLS
 * handshakes and a quarter of the JSON to parse.
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
export function hotList(full: Snapshot): string[] | null {
  /* `eligibleRows`, not `eligible`. The boards apply two filters — clears the
     liquidity floor AND carries a quote recent enough to describe today — and
     the hot list must be exactly what the boards can show. Filtering on the
     first alone kept roughly 8,000 names that are liquid on paper but whose
     last quote is days dead: 246 chunks a sweep instead of 90, for rows that
     are dropped again before anything renders. */
  const symbols = eligibleRows(full).map((r) => r.s);
  return symbols.length >= MIN_HOT ? symbols : null;
}
