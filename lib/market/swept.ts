import "server-only";
import { unstable_cache } from "next/cache";

import { runSweep, type Snapshot } from "@/lib/api/sweep";
import { TAGS, TTL } from "@/lib/api/ttl";
import { hotList } from "./hot-list";

/**
 * The market sweep the dashboard and the sector pages fall back to.
 *
 * NO LONGER THE NORMAL PATH. The refresh worker owns the sweep now: it quotes
 * the hot list on its own timer, writes the rows to the `market` schema, and
 * both surfaces read them back through one `market_home` call. This module is
 * what runs when that store cannot answer — it has not been configured, it did
 * not answer, or it has not been filled yet — which is the state of every
 * development machine, every CI run, and any deployment without Supabase
 * credentials. It is kept for exactly that reason and should not be inlined
 * into `runSweep()` at either call site: a fallback that quotes three times as
 * many symbols as the path it replaces is a fallback that makes the bad day
 * worse.
 *
 * WHY IT QUOTES ONLY WHAT THE SURFACES USE
 *
 * `runSweep()` asks the gateway for every tradable symbol: 13,797 names, 276
 * chunks. About 4,400 of the rows that come back clear the liquidity floor, and
 * those are the only ones anything reads — the movers boards, the sector strip,
 * the breadth sample and the search corpus all filter to eligible rows first.
 * The other nine thousand are fetched, parsed, and thrown away.
 *
 * On the deployed instance that waste is what a reader feels. A regeneration
 * saturates the CPU and every other request queues behind it: measured on the
 * live box, a fully static page with a warm cache went from 0.36s to 8.98s
 * while a sweep was running. Cutting the chunk count cuts the TLS handshakes
 * and the JSON parsing in the same proportion.
 *
 * HOW
 *
 * Eligibility needs a quote to decide, so the list cannot come from the symbol
 * master — it comes from a full sweep held for TTL.sweepFull. The frequent
 * sweep quotes that list. Twelve frequent sweeps per full one:
 *
 *   frequent   ~90 chunks   every TTL.sweep      (5 minutes)
 *   full       276 chunks   every TTL.sweepFull  (1 hour)
 *
 * WHAT IT COSTS
 *
 * A name that becomes newly liquid does not reach a board until the next full
 * sweep — up to an hour. That is the deliberate trade: the floor reads a
 * thirty-day average volume, so what clears it is a fact about a company
 * rather than about the minute, and it barely moves inside a session.
 *
 * THE FALLBACK IS THE IMPORTANT PART
 *
 * If the full sweep ever returns too few rows to trust — a gateway blip, an
 * expired token, an outage — `hotList` returns null and this sweeps everything
 * instead. Without that, one bad full sweep would pin the terminal to a
 * handful of names for an hour, which is far worse than being slow. The same
 * applies if the cached lookup itself throws.
 */

const cachedHotList = unstable_cache(
  async () => hotList(await runSweep()),
  ["market", "hot-list"],
  { revalidate: TTL.sweepFull, tags: [TAGS.sweep] },
);

export async function sweptMarket(): Promise<Snapshot> {
  /* The build sweeps everything, deliberately.
     Deriving the hot list costs a full sweep on top of the hot one, and
     `next build` prerenders across nine worker processes that do not share the
     cache — so each one derived it separately. Nine full sweeps, and the build
     went from zero timeouts to nine. The build has to pay for one full sweep
     regardless, to prerender real prices; it should pay for exactly one. */
  if (process.env.NEXT_PHASE === "phase-production-build") return runSweep();

  let hot: string[] | null = null;

  try {
    hot = await cachedHotList();
  } catch {
    /* Deliberately swallowed. A failure to work out WHICH names to quote must
       degrade to quoting all of them, not to failing the render — every caller
       already handles a slow sweep and none handles a thrown one. */
    hot = null;
  }

  return hot === null ? runSweep() : runSweep({ symbols: hot });
}
