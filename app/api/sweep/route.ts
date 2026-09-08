import { revalidateTag } from "next/cache";

import { TAGS } from "@/lib/api/ttl";
import { health } from "@/lib/market/health";
import { getHomeSnapshot } from "@/lib/market/home";

import type { NextRequest } from "next/server";

/* The cache warmer.

   Assembling the home snapshot costs the sweep's chunked quote calls plus two
   reference calls for every covered name. That is unremarkable as a scheduled
   job and unacceptable inside a page render, so this route pays it on a timer
   and the terminal only ever reads the result.

   Five minutes, because the feed is fifteen minutes delayed: sweeping faster
   re-fetches bytes that cannot have changed, and the delay, not the cadence,
   is what bounds how fresh the terminal can be.

   Note what is deliberately absent. `dynamic = "force-dynamic"` would set
   every fetch below to `revalidate: 0`, and a warmer that stores nothing warms
   nothing. This handler is dynamic because it reads the request, which is as
   dynamic as it needs to be. */

/* The sweep completes before anything is returned, so the ceiling has to clear
   a cold universe rather than a page render. */
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;

  /* Vercel's scheduler presents CRON_SECRET as a bearer token; the query
     parameter is for calling it by hand. Missing configuration fails closed. */
  /* `||`, not `??`: `?.` short-circuits only when the header is ABSENT. A
     present-but-empty `Authorization:` — some proxies add one — yields "",
     which is not nullish, so `??` would keep the empty string and never
     consult the query parameter. An empty string is not a credential. */
  const presented =
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim() ||
    request.nextUrl.searchParams.get("key");

  if (process.env.NODE_ENV === "production" && (!secret || presented !== secret)) {
    return new Response(null, { status: 401 });
  }

  const snapshot = await getHomeSnapshot();

  /* Marked stale after the warm rather than before it. With the "max" profile
     the tag is flagged for stale-while-revalidate instead of being expired, so
     the next reader is served the bytes this run has just fetched and the
     refresh happens behind them. Marking first would only hand this run back
     the snapshot it came to replace. */
  revalidateTag(TAGS.sweep, "max");

  const { sweptAt, rows, eligible, calls, ms, faults } = snapshot.diagnostics;
  const { status, ok } = health(faults);

  /* Two things this used to get wrong.

     It reported `ok: failures.length === 0`, and one of the eight things it
     counted was a per-ticker shortfall — so two delisted companies held the
     flag at false forever and it carried no information at all. Severity now
     decides: a thinner panel is "degraded" and still ok, a wrong or absent
     page is "failed".

     And it answered 200 regardless. Vercel Cron's own success indicator reads
     the STATUS CODE, not the body, so a run serving the committed baseline
     reported success to the only system watching it. Now they agree. */
  return Response.json(
    {
      ok,
      status,
      sweptAt,
      rows,
      eligible,
      calls,
      ms,
      fatal: faults.filter((f) => f.severity === "fatal").map((f) => f.message),
      degraded: faults.filter((f) => f.severity === "degraded").map((f) => f.message),
    },
    { status: ok ? 200 : 503 },
  );
}
