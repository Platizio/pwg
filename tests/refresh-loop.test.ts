import test from "node:test";
import assert from "node:assert/strict";

import { resetEnv } from "../lib/api/env.ts";
import { resetStoreConfig } from "../lib/market/store/client.ts";
import { startRefresher } from "../lib/market/refresh/loop.ts";

/* The loop's wiring, with every socket replaced.
 *
 * plan.ts holds the arithmetic and is tested next door; what is left in loop.ts
 * is the order things happen in, and that turned out to be the part worth
 * pinning. A `--once` run once claimed nothing at all: `stop()` raised the
 * drain flag before the first pass reached its claim, and since a fresh worker
 * always owes a full sweep, every drain check between the sweep and the batch
 * fired. The run swept, logged, and went down without touching the queue —
 * which reads, in a bootstrap log, exactly like a run that did the work.
 *
 * Nothing here opens a socket. `fetch` is replaced for the duration and an
 * unrecognised URL throws rather than falling through, so a rewrite that
 * reaches for a real gateway or a real Supabase fails the test instead of
 * quietly costing somebody a request. The gateway answers an empty quote array
 * and refuses every reference document, which is the cheapest run that still
 * goes through the whole shape: sweep, claim, fetch, complete.
 */

/* src/env.d.ts declares the Supabase names readonly, which is right everywhere
   but here. One mutable view of the same object, restored in a finally. */
type Env = Record<string, string | undefined>;
const env = process.env as Env;

type Stub = {
  /** Calls by RPC name, plus `gateway` for everything on the feed. */
  calls: Record<string, number>;
  /** The order the two halves of a pass ran in, first occurrence only. */
  order: string[];
  restore: () => void;
};

function stubNetwork(): Stub {
  const calls: Record<string, number> = {};
  const order: string[] = [];
  const saw = (name: string): void => {
    calls[name] = (calls[name] ?? 0) + 1;
    if (!order.includes(name)) order.push(name);
  };

  const json = (body: unknown, status = 200): Response =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    });

  const real = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL): Promise<Response> => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;

    if (url.includes("/rest/v1/rpc/")) {
      const fn = url.slice(url.indexOf("/rest/v1/rpc/") + "/rest/v1/rpc/".length);
      saw(fn);
      if (fn === "market_claim_due") {
        return json([
          {
            symbol: "AAPL",
            section: "profile",
            version: 1,
            contentHash: null,
            priority: 3,
            attempts: 0,
            context: null,
          },
        ]);
      }
      /* market_complete returns void, which PostgREST answers with 204 and no
         body — the shape lib/market/store/client.ts reads as ok(null). */
      if (fn === "market_complete") return new Response(null, { status: 204 });
      return json(0);
    }

    if (url.includes("gateway.invalid")) {
      if (url.includes("/login/")) {
        saw("login");
        return json({
          api_keys_login: {
            tokens: { access_token: "stub", access_expires_at: Math.floor(Date.now() / 1000) + 3600 },
          },
        });
      }
      if (url.includes("/quotes/")) {
        saw("quotes");
        return json([]);
      }
      /* Every reference document refused, so the one claimed job completes as
         an error without this file having to imitate a fundamentals payload. */
      saw("reference");
      return json({ message: "no" }, 503);
    }

    throw new Error(`the loop reached an unstubbed URL: ${url}`);
  }) as typeof fetch;

  return { calls, order, restore: () => { globalThis.fetch = real; } };
}

test("a --once run sweeps and then claims, rather than going down between the two", async () => {
  const before = {
    url: env.SUPABASE_URL,
    key: env.SUPABASE_SERVICE_ROLE_KEY,
    site: env.SITE_URL,
    gateway: env.VIEWTRADE_GATEWAY,
    apiKey: env.VIEWTRADE_API_KEY,
    apiSecret: env.VIEWTRADE_API_SECRET,
  };
  const stub = stubNetwork();
  const lines: string[] = [];

  try {
    env.SUPABASE_URL = "https://store.invalid";
    env.SUPABASE_SERVICE_ROLE_KEY = "stub-service-key";
    /* A gateway the stub answers for. `env()` refuses to hand out a partial
       credential, so a suite run on a laptop with no .env.local would
       otherwise fail before the loop reached a single request. */
    env.VIEWTRADE_GATEWAY = "https://gateway.invalid";
    env.VIEWTRADE_API_KEY = "stub";
    env.VIEWTRADE_API_SECRET = "stub";
    /* No SITE_URL, so the revalidator skips its POST with one line and leaves
       no debounce timer holding the test open. */
    delete env.SITE_URL;
    resetEnv();
    resetStoreConfig();

    await startRefresher({ once: true, log: (l) => lines.push(l) }).stop();
  } finally {
    stub.restore();
    env.SUPABASE_URL = before.url;
    env.SUPABASE_SERVICE_ROLE_KEY = before.key;
    env.VIEWTRADE_GATEWAY = before.gateway;
    env.VIEWTRADE_API_KEY = before.apiKey;
    env.VIEWTRADE_API_SECRET = before.apiSecret;
    if (before.site === undefined) delete env.SITE_URL;
    else env.SITE_URL = before.site;
    resetEnv();
    resetStoreConfig();
  }

  const log = lines.join("\n");

  assert.equal(
    stub.calls.market_claim_due,
    1,
    `a --once pass must claim exactly once; the log was:\n${log}`,
  );
  assert.equal(stub.calls.market_complete, 1, "the claimed job must be completed, not abandoned");
  assert.match(log, /refresh batch claimed=1/);

  /* The order is load-bearing twice over: it is why the drain flag cannot be
     what `--once` runs on, and it is what lets the two concurrency knobs be
     independent — the sweep's fan-out is finished before a job is claimed. */
  assert.deepEqual(
    stub.order.slice(0, 2),
    ["login", "quotes"],
    "a fresh worker owes a full sweep before it claims anything",
  );
  assert.ok(
    stub.order.indexOf("quotes") < stub.order.indexOf("market_claim_due"),
    "the sweep must finish before the claim, not run beside it",
  );

  /* The batch failed its only job, so `backoffFor` halves the pool — and the
     minute of quiet that normally follows is for a next batch this run will
     never have. Without the `once` guard on it, this test would sit here for
     sixty seconds on its way out. */
  assert.doesNotMatch(log, /refresh cooldown/, "a --once run has no next batch to be quiet for");
  assert.match(log, /refresh stopped$/);
});

test("with no store configured the loop starts nothing and touches no network", async () => {
  const before = { url: env.SUPABASE_URL, key: env.SUPABASE_SERVICE_ROLE_KEY };
  const stub = stubNetwork();
  const lines: string[] = [];

  try {
    delete env.SUPABASE_URL;
    delete env.NEXT_PUBLIC_SUPABASE_URL;
    delete env.SUPABASE_SERVICE_ROLE_KEY;
    resetStoreConfig();

    await startRefresher({ log: (l) => lines.push(l) }).stop();
  } finally {
    stub.restore();
    if (before.url === undefined) delete env.SUPABASE_URL;
    else env.SUPABASE_URL = before.url;
    if (before.key === undefined) delete env.SUPABASE_SERVICE_ROLE_KEY;
    else env.SUPABASE_SERVICE_ROLE_KEY = before.key;
    resetStoreConfig();
  }

  /* Not `once`, and it still returns: the check is the first thing `run` does,
     which is what lets the Render worker exit within the second rather than
     spin quoting a gateway it has nowhere to put the answers. */
  assert.deepEqual(lines, ["refresh disabled reason=store-not-configured", "refresh stopped"]);
  assert.deepEqual(stub.calls, {}, "an unconfigured loop must not reach the gateway either");
});
