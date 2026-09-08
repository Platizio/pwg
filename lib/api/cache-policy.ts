/* What may be remembered, and for how long.
 *
 * Nothing in lib/api throws: http.ts turns a DNS error, a timeout, a 502 and a
 * 404 alike into `{ok:false}` (see errors.ts) so that callers compose with
 * Promise.allSettled and one dead upstream degrades one panel instead of
 * blanking the page. That contract is right, and it has one sharp edge.
 *
 * `unstable_cache` memoises a RETURN VALUE, and an ApiFailure is a perfectly
 * good value. So a blip lasting one second is stored and served for the whole
 * TTL — twelve hours for corporate actions, six for fundamentals, a day for
 * news. The failure outlives its cause by four orders of magnitude.
 *
 * Measured on this repo, not theorised: /api/sweep reported "corporate
 * actions: 14 of 93 failed" and held that number across repeated reads in
 * ~140ms, while the same 93 tickers probed straight through the client failed
 * exactly 2 — at batch size 8, at full concurrency, and under load. Clearing
 * the calendar tag dropped the route to 2 on the next read. Twelve of the
 * fourteen were memoised ghosts of blips that had long since passed.
 *
 * THE MECHANISM. Next reaches cacheNewResult only after the callback resolves
 * (node_modules/next/dist/server/web/spec-extension/unstable-cache.js:252-257),
 * so a rejection stores nothing at all. Better still, its stale-while-
 * revalidate branch catches a failed background refresh and returns the
 * previously cached value (:176-183) — so a transient failure keeps serving the
 * last good answer instead of replacing it with an error.
 *
 * NOT EVERY FAILURE, THOUGH. A 404 is a real answer about a real record: EA and
 * EQR genuinely have no corporate-actions document at the gateway, and they
 * will not have one any harder for being asked every five minutes. Refusing to
 * cache those would buy nothing and cost an upstream call per render — on every
 * peer of every instrument page. A stable answer is remembered; a transient one
 * never is.
 */

import { type ApiFailure, type ApiResult } from "./errors.ts";

/**
 * A failure that must not be remembered.
 *
 * Thrown rather than returned for one reason only: a memoiser stores what a
 * function returns and stores nothing when it throws. It carries the original
 * result so `settle` can hand callers the exact ApiFailure they expect.
 */
export class TransientFailure extends Error {
  readonly failure: ApiFailure;

  constructor(failure: ApiFailure) {
    super(failure.error);
    this.name = "TransientFailure";
    this.failure = failure;
  }
}

/* Statuses where the gateway answered a question about the record, as opposed
   to failing to answer at all.

   410 Gone and 422 sit alongside 404 because each is the upstream saying
   something definite about this symbol. Everything else — status 0 for a
   request that never arrived, 408, 429, every 5xx — is a statement about the
   gateway's health at one instant, and instants should not be cached for
   twelve hours.

   401 and 403 are deliberately transient. vtGet already retries a 401 once
   with a fresh token, so a second one is a credential problem: real, urgent,
   and precisely the thing that must not be frozen into the cache for half a
   day while somebody rotates the secret. */
const STABLE = new Set([404, 410, 422]);

/** Did the upstream answer about this record, or merely fail to answer? */
export function stableAnswer(status: number): boolean {
  return STABLE.has(status);
}

/**
 * Pass a result on to the memoiser, or refuse to let it be stored.
 *
 * Call this INSIDE the cached function. Successes and stable answers are
 * returned and therefore cached; a transient failure throws, and Next stores
 * nothing.
 */
export function guard<T>(result: ApiResult<T>): ApiResult<T> {
  if (!result.ok && !stableAnswer(result.status)) throw new TransientFailure(result);
  return result;
}

/**
 * Put the ApiResult contract back together outside the cache.
 *
 * Every caller in the app reads `.ok`, and none of them should have to learn
 * that caching exists. Only TransientFailure is converted back — anything else
 * is a bug in our own code, and laundering a TypeError into a tidy "upstream
 * did not answer" is how a real defect becomes invisible.
 */
export async function settle<T>(pending: Promise<ApiResult<T>>): Promise<ApiResult<T>> {
  try {
    return await pending;
  } catch (e) {
    if (e instanceof TransientFailure) return e.failure;
    throw e;
  }
}
