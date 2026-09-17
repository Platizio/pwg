import { relativeAge } from "@/lib/api/normalize/time";
import { nowMs } from "@/lib/market/clock";
import { health, type Fault } from "@/lib/market/health";
import { pricesMove, sessionAt } from "@/lib/market/session";
import { readStatus, storeConfigured } from "@/lib/market/store/client";

import type { StoreStatus } from "@/lib/market/store/types";
import type { NextRequest } from "next/server";

/* The store's health, in one query.

   THIS USED TO BE THE CACHE WARMER. Assembling the home snapshot cost a
   chunked sweep of the whole tradable universe plus a reference call for every
   wire and calendar ticker — unacceptable inside a page render — so a cron
   curled this route every five minutes and the terminal only ever read what it
   left behind. That job now belongs to the refresh worker
   (scripts/refresh-worker.mts), which sweeps on its own timer, writes to the
   `market` schema and tells Next what changed through /api/revalidate. The
   Render cron that called this is gone.

   What is left is the question the cron was really asking without meaning to:
   is the data behind the terminal current? So the route answers that directly.
   `market_status()` is a handful of indexed counts, which is milliseconds
   rather than a minute, and the verdict is drawn from what it reports instead
   of from a sweep this process ran itself.

   The verdict shape is unchanged — `ok`, `status`, and the two severity lists —
   because the thing reading it did not change. Severity is the whole point:
   "the boards have nothing to rank" and "nine sections are backing off" are
   both faults, and only one of them is worth waking somebody for. health.ts
   sets out the argument at length, including why `ok` deliberately stays true
   through a degradation.

   `maxDuration` is gone with the sweep. It was 60 seconds because the handler
   had to clear a cold universe before it could answer; one RPC cannot outlive
   the store client's own eight-second timeout, which is inside every platform
   default this deploys to. A ceiling that no longer describes the work is worse
   than none — it reads as a promise that this route might take a minute.

   Note what is still deliberately absent. `dynamic = "force-dynamic"` would set
   every fetch below to `revalidate: 0`; nothing here is cached in the first
   place — a health read that answered from a cache would be reporting on the
   cache — and the handler is dynamic because it reads the request, which is as
   dynamic as it needs to be. */

const MINUTE = 60_000;

/* Three missed hot sweeps. The worker quotes the hot list every five minutes
   while prices are moving, so fifteen is late without being alarming. */
const QUOTES_LATE_MS = 15 * MINUTE;
/* Twelve missed sweeps. Past this the worker is not late, it is gone. */
const QUOTES_DEAD_MS = 60 * MINUTE;
/* The refresh log takes a row per completed section job, at any hour, so this
   is the one liveness signal that does not depend on the market being open.
   Two hours is generous on purpose: roughly thirty thousand section rows sit on
   cadences from five minutes to six, so a worker that is running at all cannot
   go an hour without writing one. */
const REFRESH_DEAD_MS = 120 * MINUTE;

/**
 * What the counts say about the store.
 *
 * THE SESSION GATE ON THE QUOTE AGE IS LOAD-BEARING. `swept_at` is stamped only
 * when a row actually changed, so with the exchanges shut the newest stamp in
 * the table is the last time any price moved — which overnight, at a weekend
 * and through a holiday is hours old with nothing whatever wrong. Judged
 * against a flat fifteen minutes this route would report failure every night,
 * and health.ts's own argument applies: a monitor that fires on a quiet Tuesday
 * is one nobody reads by the time it matters. So the age is only judged while
 * prices move — `pricesMove`, not the 09:30–16:00 session, because pre-market
 * and post-market carry real price updates — and the refresh log covers
 * liveness the rest of the time.
 */
function audit(store: StoreStatus, now: number): Fault[] {
  const faults: Fault[] = [];

  /* Fatal, and in this order: with no quotes there is nothing to rank, and
     with none of them marked hot the boards read an empty list. Either sends
     the dashboard back to the gateway fan-out for every cold render. */
  if (store.quotesCount === 0)
    faults.push({ severity: "fatal", message: "store: no quotes stored" });
  else if (store.hotCount === 0)
    faults.push({ severity: "fatal", message: "store: no symbol is marked hot" });

  const sweptAt = store.quotesSweptAt;
  if (pricesMove(sessionAt(Math.floor(now / 1000)).phase)) {
    if (sweptAt === null) {
      faults.push({ severity: "fatal", message: "store: no quote sweep recorded" });
    } else if (now - sweptAt > QUOTES_DEAD_MS) {
      faults.push({
        severity: "fatal",
        message: `store: quotes last swept ${relativeAge(sweptAt, now)}`,
      });
    } else if (now - sweptAt > QUOTES_LATE_MS) {
      faults.push({
        severity: "degraded",
        message: `store: quotes last swept ${relativeAge(sweptAt, now)}`,
      });
    }
  }

  const refreshedAt = store.lastRefreshAt;
  if (refreshedAt === null) {
    faults.push({ severity: "fatal", message: "store: the refresher has recorded nothing" });
  } else if (now - refreshedAt > REFRESH_DEAD_MS) {
    faults.push({
      severity: "fatal",
      message: `store: the refresher last finished a job ${relativeAge(refreshedAt, now)}`,
    });
  }

  /* Degraded, not fatal. A section that has failed three times is backed off
     and serving whatever it last stored, which is a page missing one panel
     rather than a page that is wrong. */
  if (store.erroring > 0)
    faults.push({
      severity: "degraded",
      message: `store: ${store.erroring} sections are backing off after repeated errors`,
    });

  return faults;
}

/** Epoch ms in, ISO out — the RPCs speak the first and a reader wants the second. */
const stamp = (at: number | null): string | null =>
  at === null ? null : new Date(at).toISOString();

export async function GET(request: NextRequest) {
  const startedAt = Date.now();
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

  const faults: Fault[] = [];
  let store: StoreStatus | null = null;

  if (!storeConfigured()) {
    /* Fatal: the terminal still renders, on the gateway fan-out it has always
       had, and every cold stock page costs eight to thirty seconds again. That
       is exactly the condition this deployment exists to end, so it is not a
       degradation to notice tomorrow. */
    faults.push({ severity: "fatal", message: "store: not configured" });
  } else {
    const result = await readStatus();
    /* `data` is checked as well as `ok`: the client reads an empty 2xx body as
       `ok(null)`, which is the right answer for the void RPCs and a broken one
       here. The error string is already redacted of the service-role key. */
    if (!result.ok) {
      faults.push({ severity: "fatal", message: `store: ${result.error}` });
    } else if (result.data === null) {
      faults.push({ severity: "fatal", message: "store: market_status returned no body" });
    } else {
      store = result.data;
      faults.push(...audit(store, nowMs()));
    }
  }

  const { status, ok } = health(faults);

  /* 503 rather than 200-with-a-flag when something is fatal. Vercel Cron and
     every uptime checker read the STATUS CODE and not the body, so a run
     reporting failure in JSON under a 200 reported success to the only system
     watching it. That was true of the warmer and it is true of this. */
  return Response.json(
    {
      ok,
      status,
      ms: Date.now() - startedAt,
      quotesSweptAt: stamp(store?.quotesSweptAt ?? null),
      lastRefreshAt: stamp(store?.lastRefreshAt ?? null),
      hotCount: store?.hotCount ?? null,
      quotesCount: store?.quotesCount ?? null,
      enrolled: store?.enrolled ?? null,
      due: store?.due ?? null,
      claimed: store?.claimed ?? null,
      erroring: store?.erroring ?? null,
      lastHour: store?.lastHour ?? null,
      fatal: faults.filter((f) => f.severity === "fatal").map((f) => f.message),
      degraded: faults.filter((f) => f.severity === "degraded").map((f) => f.message),
    },
    { status: ok ? 200 : 503 },
  );
}
