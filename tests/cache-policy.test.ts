import assert from "node:assert/strict";
import test from "node:test";

import { TransientFailure, guard, settle, stableAnswer } from "../lib/api/cache-policy.ts";
import { fail, ok } from "../lib/api/errors.ts";

/* Why a cached failure is worse than no cache at all.
 *
 * Nothing in lib/api throws — http.ts turns a DNS error, a timeout, a 502 and a
 * 404 alike into `{ok:false}` so callers can compose with Promise.allSettled.
 * That is the right contract and it has one sharp edge: `unstable_cache`
 * memoises a RETURN VALUE, and an ApiFailure is a perfectly good value. One
 * transient blip therefore pins a ticker to "failed" for the whole TTL — twelve
 * hours for corporate actions, six for fundamentals, a day for news.
 *
 * Measured, not theorised: /api/sweep reported "corporate actions: 14 of 93
 * failed" and held that number across repeated reads in ~140ms, while probing
 * the same 93 tickers straight through the client failed exactly 2. Clearing
 * the calendar tag dropped the route to 2 immediately. Twelve of the fourteen
 * were memoised ghosts of blips that had long since passed.
 *
 * The fix is to throw inside the cached function, because Next only reaches
 * cacheNewResult after the callback RESOLVES
 * (node_modules/next/dist/server/web/spec-extension/unstable-cache.js:252-257),
 * so a rejection stores nothing. `settle` then restores the ApiResult contract
 * outside the cache, and no caller has to change.
 *
 * NOT every failure, though. A 404 is a real answer — the record does not
 * exist, and it will not exist any harder if we ask again every five minutes.
 * Refusing to cache those would buy nothing and cost an upstream call per
 * render, on every peer of every instrument page. So a stable answer caches and
 * a transient one never does.
 */

/* ---------- which failures are answers, and which are noise ---------- */

test("a 404 is an answer about the record, so it caches", () => {
  assert.equal(stableAnswer(404), true);
});

test("a gone or unprocessable record is an answer too", () => {
  assert.equal(stableAnswer(410), true);
  assert.equal(stableAnswer(422), true);
});

test("a network error, a timeout or an abort is never an answer", () => {
  /* http.ts reports status 0 for anything that never reached the gateway. */
  assert.equal(stableAnswer(0), false);
  assert.equal(stableAnswer(408), false);
});

test("the gateway being broken is not an answer about the record", () => {
  for (const s of [500, 502, 503, 504]) {
    assert.equal(stableAnswer(s), false, `${s} must not be cached`);
  }
});

test("rate limiting is not an answer", () => {
  assert.equal(stableAnswer(429), false);
});

/* vtGet already retries a 401 once with a fresh token. A second one is a
   credential problem — real, urgent, and exactly the thing that must not be
   frozen into the cache for twelve hours while somebody fixes the secret. */
test("an auth failure is never cached", () => {
  assert.equal(stableAnswer(401), false);
  assert.equal(stableAnswer(403), false);
});

/* ---------- the guard ---------- */

test("a success passes straight through", () => {
  const r = ok({ ticker: "AAPL" }, 200, 12);
  assert.equal(guard(r), r);
});

test("a stable failure passes through, so the memoiser stores it", () => {
  const r = fail("Record not found", 404, 9);
  assert.equal(guard(r), r);
});

test("a transient failure throws, so the memoiser stores nothing", () => {
  const r = fail("timeout", 0, 15_000);
  assert.throws(() => guard(r), TransientFailure);
});

test("the thrown failure still carries the original result", () => {
  const r = fail("502 Bad Gateway", 502, 40);
  try {
    guard(r);
    assert.fail("guard must throw on a transient failure");
  } catch (e) {
    assert.ok(e instanceof TransientFailure);
    assert.deepEqual(e.failure, r);
  }
});

/* ---------- settle: callers must not notice any of this ---------- */

test("settle returns a success unchanged", async () => {
  const r = ok(1, 200, 3);
  assert.equal(await settle(Promise.resolve(r)), r);
});

test("settle turns the thrown failure back into an ApiFailure", async () => {
  const r = fail("timeout", 0, 15_000);
  const out = await settle(Promise.reject(new TransientFailure(r)));
  assert.deepEqual(out, r);
  assert.equal(out.ok, false);
});

/* The whole point of the round trip: every existing caller reads `.ok` and
   `.error`, and none of them may have to learn about caching. */
test("a transient failure survives guard and settle unchanged", async () => {
  const r = fail("fetch failed", 0, 120);
  const out = await settle(Promise.resolve().then(() => guard(r)));
  assert.deepEqual(out, r);
});

/* A bug in our own code must not be laundered into a tidy ApiFailure — that is
   how a TypeError becomes an invisible "upstream did not answer". */
test("settle does not swallow an unrelated error", async () => {
  await assert.rejects(
    settle(Promise.reject(new TypeError("cannot read properties of undefined"))),
    TypeError,
  );
});
