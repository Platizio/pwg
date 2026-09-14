import test from "node:test";
import assert from "node:assert/strict";

import { isControlFlowError } from "../lib/api/control-flow.ts";

/* Errors that are not errors.
 *
 * Next signals control flow by throwing. notFound(), redirect(), a `no-store`
 * fetch inside a static render, a dynamic-rendering bailout — all of them are
 * thrown Errors that Next itself expects to catch further up. Swallowing one
 * does not make a page more robust; it silently removes Next's ability to do
 * the thing it was asking for.
 *
 * http.ts wraps every fetch in a blanket try/catch and turns whatever it
 * catches into `fail(msg, 0, ms)` — status 0, which every caller reads as a
 * transport failure. That laundering is what made the instrument retry appear
 * to contact the gateway when it never did: dynamic-rendering.js:238 threw
 * DynamicServerError before the request left the process, http.ts reported a
 * dead socket, and the verdict blamed ViewTrade for a call it never received.
 *
 * The markers are read from Next's own source rather than invented:
 *   DYNAMIC_SERVER_USAGE     hooks-server-context.js:23
 *   NEXT_REDIRECT            redirect-error.js:24
 *   NEXT_HTTP_ERROR_FALLBACK http-access-fallback/index.js:41
 *   NEXT_STATIC_GEN_BAILOUT  static-generation-bailout.js:23
 */

test("a dynamic-server bailout is control flow, not a gateway failure", () => {
  /* Exactly what a no-store fetch throws inside a static render. */
  const e = Object.assign(new Error("Dynamic server usage: no-store fetch"), {
    digest: "DYNAMIC_SERVER_USAGE",
  });
  assert.equal(isControlFlowError(e), true);
});

test("notFound() and redirect() must reach Next, not become a 502", () => {
  assert.equal(isControlFlowError(Object.assign(new Error(), { digest: "NEXT_HTTP_ERROR_FALLBACK;404" })), true);
  assert.equal(isControlFlowError(Object.assign(new Error(), { digest: "NEXT_REDIRECT;replace;/x;307;" })), true);
});

test("a static-generation bailout carries a code rather than a digest", () => {
  assert.equal(isControlFlowError(Object.assign(new Error(), { code: "NEXT_STATIC_GEN_BAILOUT" })), true);
});

test("real network failures are NOT control flow and must still be reported", () => {
  /* The whole point: these must keep flowing to fail(msg, 0, ms) so the
     instrument verdict can see a genuine outage. */
  assert.equal(isControlFlowError(new Error("fetch failed")), false);
  assert.equal(isControlFlowError(Object.assign(new Error("timed out"), { name: "TimeoutError" })), false);
  assert.equal(isControlFlowError(new TypeError("Failed to parse URL")), false);
});

test("an unrelated digest is not swallowed as control flow", () => {
  /* A gateway that happens to return an object with a digest field must not be
     mistaken for Next asking to bail. */
  assert.equal(isControlFlowError(Object.assign(new Error(), { digest: "SOMETHING_ELSE" })), false);
  assert.equal(isControlFlowError(Object.assign(new Error(), { code: "ECONNRESET" })), false);
});

test("non-objects never read as control flow", () => {
  for (const v of [null, undefined, "DYNAMIC_SERVER_USAGE", 42, Symbol("x")]) {
    assert.equal(isControlFlowError(v), false, `${String(v)} read as control flow`);
  }
});
