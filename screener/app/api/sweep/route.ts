import { revalidateTag } from "next/cache";

import { TAGS } from "@/lib/api/ttl";
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
  const presented =
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
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

  const { sweptAt, rows, eligible, calls, ms, failures } = snapshot.diagnostics;

  return Response.json({ ok: failures.length === 0, sweptAt, rows, eligible, calls, ms });
}
