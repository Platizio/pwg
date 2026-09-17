/* Next's server-startup hook: `register` runs once as a server instance comes
 * up and must finish before the first request is served
 * (node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/
 * instrumentation.md, "Exports"). It is the only place in this app that can
 * start something with a life longer than a request.
 *
 * ONE LOOP MODULE, TWO ENTRY POINTS, AND NEVER BOTH AT ONCE.
 *
 * lib/market/refresh/loop.ts is the refresher. It is deployed as its own
 * Render service — `platizio-refresh`, started by scripts/refresh-worker.mts —
 * and that is the arrangement render.yaml describes. This file is the other
 * way to run the identical loop: inside the web service, when
 * REFRESH_IN_PROCESS=1. Useful on a single box, and the fallback if the two
 * ViewTrade logins ever fight over a token.
 *
 * Running both is not a correctness problem — every claim is a lease taken
 * with FOR UPDATE SKIP LOCKED, so two loops take disjoint rows — but it is two
 * gateway logins, twice the request budget for exactly the same work, and two
 * processes racing for the same leases so that each is left with half a batch.
 * The switch is therefore a deliberate either/or, stated here, in the worker's
 * service definition and in render.yaml where the variable is set.
 *
 * The import is dynamic AND inside the guard, which is two rules rather than
 * one. Inside the guard, because a web service running the worker instead —
 * the normal case — should not pay to load the whole gateway client, the
 * normalisers and five years of history parsing at startup for a loop it will
 * never run. Dynamic, because `register` is called in the edge runtime too,
 * and the loop reaches node:crypto through lib/market/store/sections.ts, which
 * has no business in an edge bundle.
 *
 * The `@/` alias rather than a relative .ts path: this file is compiled by the
 * bundler along with the route handlers, not loaded by bare Node the way
 * scripts/refresh-worker.mts loads the same module.
 */

export async function register(): Promise<void> {
  /* Both runtimes call this. Only Node can hold work open between requests, so
     the edge copy returns before it reaches the import below. */
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  /* Default off, and off is anything but "1". A blank or absent value is the
     deployed arrangement — the Render worker owns the loop — and a typo in the
     dashboard should leave the site as it is rather than start a second
     refresher. */
  if (process.env.REFRESH_IN_PROCESS !== "1") return;

  const { startRefresher } = await import("@/lib/market/refresh/loop");

  /* The same variable the worker reads, parsed the same way: `startRefresher`
     floors what it is given, and Math.floor(NaN) is NaN, so a value that is
     not a positive number is dropped rather than passed on. */
  const requested = Number(process.env.REFRESH_CONCURRENCY);
  const concurrency = Number.isFinite(requested) && requested > 0 ? requested : undefined;

  /* Started, not awaited. `register` blocks the server from answering
     requests, and the loop by design never returns — bootstrapping is the
     worker's job and the steady loop runs until the process ends.
     `startRefresher` kicks the first pass off and hands back a handle
     immediately, which is what makes that safe.

     No log function and no signal handling, both for the same reason: this is
     the web service's process, not ours. Next owns its stdout, where the
     loop's default console.log lands already structured and already
     attributed, and Next owns the shutdown — a claim dropped by a redeploy is
     a lease that expires in fifteen minutes, which is the whole reason the
     store hands out leases rather than assignments. */
  startRefresher({ concurrency });
}
