import { revalidateTag } from "next/cache";

import { parseTagBatch } from "@/lib/market/store/types";

import type { NextRequest } from "next/server";

/* The worker's way of saying something changed.
 *
 * The refresh loop runs in a different process — a Render `type: worker`, or
 * the same box under REFRESH_IN_PROCESS=1 — and Next's cache lives in the web
 * service. There is no shared handle between them, so invalidation is an HTTP
 * call, and this is it: a batch of tags the worker has just written new data
 * behind. It is called only when a content hash actually changed, which is what
 * keeps a symbol whose profile has not moved in nine days from being
 * regenerated every fifteen minutes.
 *
 * `revalidateTag(tag, "max")` — the second argument is required in Next 16, and
 * "max" is the one that gives stale-while-revalidate: the tagged entry is
 * MARKED stale and the next reader is served the old bytes while the refresh
 * happens behind them (node_modules/next/dist/docs/01-app/03-api-reference/
 * 04-functions/revalidateTag.md, "Revalidation Behavior"). The single-argument
 * form is deprecated and expires the entry outright, turning the next reader
 * into a blocking cache miss — which is exactly the wait this whole store
 * exists to remove. `{ expire: 0 }` is the doc's suggestion for a webhook that
 * needs immediate expiry; we do not, because the data is already written before
 * this is called and a reader served the previous version for one render is
 * reading something true.
 */

/* Reads the request, so it can never be prerendered. Stated rather than
   inferred: a route this short is exactly the kind Next would otherwise try to
   evaluate at build time. */
export const dynamic = "force-dynamic";

/* Everything this route decides before it touches Next — the batch cap, what
   counts as a tag this app issues, the all-or-nothing rule and the dedupe —
   lives in `parseTagBatch`, in lib/market/store/types.ts, beside the
   `symbolTag` that produces the strings and within reach of the worker, which
   builds them in a different process.

   Two reasons it is not inlined here. Held apart from `symbolTag`, the producer
   and its validator agreed by comment and did not actually agree: the class
   rejected `+`, which the 80 warrant tickers carry, and this route is
   all-or-nothing, so one `market:ACHR+` in a batch of 200 returned a 400 and
   left 199 healthy symbols on their fifteen-minute timer. And a rule inside
   this handler cannot be tested at all — the module imports next/cache, so it
   only loads inside a Next request — while a route file may not export a helper
   either (next build requires every export outside its own known list to be
   `never`; see the note on parseTagBatch). Out there, tests/store-client.test.ts
   holds the whole tradable universe against the pattern and the batch rules
   against their own boundaries. */

export async function POST(request: NextRequest) {
  const secret = process.env.CRON_SECRET;

  /* `||`, not `??`: `?.` short-circuits only when the header is ABSENT. A
     present-but-empty `Authorization:` — some proxies add one — yields "",
     which is not nullish, so `??` would keep the empty string as the presented
     credential. An empty string is not a credential. */
  const presented =
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim() || null;

  /* Fails closed in production when the secret is unset: an unauthenticated
     cache-invalidation endpoint is a way to make the site slow from the
     outside. Open in development, where the worker runs without one. */
  if (process.env.NODE_ENV === "production" && (!secret || presented !== secret)) {
    return new Response(null, { status: 401 });
  }

  /* `.catch(() => null)` rather than letting it throw: a body that is not JSON
     is a caller's mistake and deserves the same 400 as a body that is JSON but
     the wrong shape, not a 500 that reads like the cache is broken. */
  const batch = parseTagBatch(await request.json().catch(() => null));
  if (!batch.ok) return Response.json({ error: batch.error }, { status: 400 });

  for (const tag of batch.tags) revalidateTag(tag, "max");

  /* The tags are deduplicated, so `revalidated` counts ENTRIES MARKED: a caller
     that posts duplicates reads a number lower than the length of what it sent,
     and that is not a dropped tag. The response carries nothing else — the
     worker's contract is `{ revalidated: n }`, and one field is one thing to
     keep in step across two processes. A 200 is the delivery receipt, not a
     rebuild: "max" marks, and the fetch happens when a page carrying the tag is
     next visited. */
  return Response.json({ revalidated: batch.tags.length });
}
