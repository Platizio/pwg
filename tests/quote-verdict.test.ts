import test from "node:test";
import assert from "node:assert/strict";

import { quoteVerdict } from "../lib/market/quote-verdict.ts";

/* Whether /terminal/<TICKER> is allowed to answer 404.
 *
 * A 404 is a durable claim that a URL does not exist, and Next bakes it into
 * the prerender: a build that hit a gateway blip shipped `"status": 404` on
 * AAPL, TSLA, NVDA, AMZN, SPOT and MSFT — every covered ticker — and the same
 * thing happened live in dev, where /terminal/AAPL answered "Stock not found"
 * and then 200 on the very next request.
 *
 * The rule that fixes it rests on one fact about the gateway: a symbol it does
 * not know comes back as a SUCCESSFUL response carrying `notFound: true`. So a
 * failed call never means "no such ticker" — it means we were not told. Those
 * must not be the same answer.
 */

const good = { notFound: false, notPermissioned: false };

test("a gateway that answered and said the symbol is absent is a real 404", () => {
  assert.equal(quoteVerdict({ status: "fulfilled", value: { ok: true, data: [] } }), "missing");
  assert.equal(
    quoteVerdict({
      status: "fulfilled",
      value: { ok: true, data: [{ notFound: true, notPermissioned: false }] },
    }),
    "missing",
  );
});

test("a symbol this account may not quote is also a real 404", () => {
  /* Deterministic, not transient: the entitlement will be the same next time,
     and a page of dashes wearing a real company's name is worse than a 404. */
  assert.equal(
    quoteVerdict({
      status: "fulfilled",
      value: { ok: true, data: [{ notFound: false, notPermissioned: true }] },
    }),
    "missing",
  );
});

test("a good quote resolves", () => {
  assert.equal(quoteVerdict({ status: "fulfilled", value: { ok: true, data: [good] } }), "ok");
});

test("a call that never completed is NOT a 404", () => {
  /* The bug, in one line. `dataOf` mapped a rejected promise to null and the
     page turned null into notFound(), so a dropped connection became a
     permanent claim that Apple does not exist. */
  assert.equal(quoteVerdict({ status: "rejected", reason: new Error("socket hang up") }), "unavailable");
  assert.equal(quoteVerdict(undefined), "unavailable");
});

test("transport failures are never 404 — status 0 is a dead socket, not a dead company", () => {
  /* http.ts returns fail(msg, 0, ms) for DNS failures, aborts and timeouts. */
  assert.equal(quoteVerdict({ status: "fulfilled", value: { ok: false, status: 0 } }), "unavailable");
});

test("a rate-limited build does not delete the company", () => {
  /* The mechanism behind the six baked 404s: nine build workers fanning out at
     SWEEP_CONCURRENCY, the gateway throttling, and every 429 becoming a 404
     that ships. Prerendering ~515 tickers multiplies this by eighty. */
  assert.equal(quoteVerdict({ status: "fulfilled", value: { ok: false, status: 429 } }), "unavailable");
});

test("server errors and auth failures are ours, not the ticker's", () => {
  for (const status of [500, 502, 503, 504, 401, 403]) {
    assert.equal(
      quoteVerdict({ status: "fulfilled", value: { ok: false, status } }),
      "unavailable",
      `HTTP ${status} must not read as a missing ticker`,
    );
  }
});

test("no HTTP failure code can ever produce a 404", () => {
  /* The invariant, swept rather than sampled: the gateway reports an unknown
     symbol in the BODY of a 200, so there is no failure status that means
     "this ticker does not exist" — including 404 on the endpoint itself, which
     would mean the route moved, not that the company vanished. */
  for (let status = 0; status < 600; status += 1) {
    assert.notEqual(
      quoteVerdict({ status: "fulfilled", value: { ok: false, status } }),
      "missing",
      `HTTP ${status} produced a 404`,
    );
  }
});
