import "server-only";
import type { SessionPhase } from "@/lib/market/session";

/* Cache lifetimes, in seconds.

   The quote feed is fifteen minutes delayed — `delayed: true`, `source:
   "Delay"` on every record — so a sweep faster than five minutes re-fetches
   bytes that cannot have changed. Outside the session it is slower still.

   The split between fetch-level revalidate and unstable_cache is deliberate:
   the Authorization header is part of Next's fetch cache key, so anything
   cached for longer than the ~2h token life would re-fan-out on every token
   rotation. Those go through cached.ts with a token-free key instead. */

export function quoteTtl(phase: SessionPhase): number {
  switch (phase) {
    case "open":
      return 300;
    case "pre-market":
      return 300;
    /* Extended hours are quoting, so the record ages at the same rate as one
       taken during the session. Falling through to the closed-market 1800
       would have cached a moving post-market price for half an hour. */
    case "post-market":
      return 300;
    case "halted":
      return 600;
    case "closed":
    default:
      return 1800;
  }
}

export const TTL = {
  sweep: 300,
  indexEtf: 300,
  sectorEtf: 300,
  history1m: 1_800,
  search: 3_600,
  /** Beyond the token life — must go through cached.ts. */
  fundamentals: 21_600,
  corporateActions: 43_200,
  newsArticles: 1_800,
  /* A day per stock. The second news source bills against a non-renewable
     lifetime allowance, and this cache is the only thing standing between a
     per-ticker query and that allowance: at a day, a stock costs at most one
     request however many times its page is opened. */
  stockNews: 86_400,
  newsBudget: 86_400,
} as const;

export const TAGS = {
  sweep: "vt:sweep",
  quotes: "vt:quotes",
  indices: "vt:indices",
  sectors: "vt:sectors",
  history: "vt:history",
  fundamentals: "vt:fundamentals",
  calendar: "vt:calendar",
  news: "news",
} as const;

export type Tag = (typeof TAGS)[keyof typeof TAGS];
