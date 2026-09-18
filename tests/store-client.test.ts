import test from "node:test";
import assert from "node:assert/strict";

import {
  claimDue,
  complete,
  enrol,
  readHomeRaw,
  readInstrumentRaw,
  readSectionsRaw,
  readStatus,
  resetStoreConfig,
  rpc,
  seedSymbols,
  setHot,
  storeConfig,
  storeConfigured,
  touchVisit,
  upsertQuotes,
} from "../lib/market/store/client.ts";
import {
  HOME_TAG,
  MAX_TAGS,
  parseTagBatch,
  symbolTag,
  TAG_PATTERN,
} from "../lib/market/store/types.ts";
import type {
  SectionMeta,
  StoredHome,
  StoredSectionRow,
  StoreStatus,
  SweepRowJson,
} from "../lib/market/store/types.ts";
import { TRADABLE } from "../lib/market/universe.ts";

/* The store client is the only thing between the terminal and its data, and
 * it holds the service-role key — the credential that can read and write every
 * row in the project. Two properties are worth a test apiece.
 *
 * It must never throw. Every read path wraps it in `guard`/`settle`, and both
 * of those reason about an ApiResult; a client that rejected instead would put
 * an unhandled rejection inside a cached function, which Next reports as a
 * render failure rather than as one empty panel.
 *
 * And it must never say the key out loud. PostgREST quotes the request back in
 * some of its errors ("No API key found in request"), the fetch layer puts the
 * URL in a TypeError, and every one of those strings ends up in a log line or
 * a diagnostics payload. `scrub` in lib/api/errors.ts only knows about bearer
 * tokens, so the raw key is redacted here as well.
 */

const CONFIG = { url: "https://example.supabase.co", key: "sbp-service-role-secret" };

/* A real service-role key is a JWT of roughly 230 characters, and the length is
   the point of this constant rather than an incidental detail: the error path
   truncates the upstream body, and a short fake key fits inside the cut whether
   or not the redaction happened first. This one does not. */
const LONG_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9." +
  "eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InByb2plY3RyZWZhYmNkZWZnaCIsInJvbGUiOiJzZXJ2aWNlX3JvbGUiLCJpYXQiOjE3NTgwMDAwMDAsImV4cCI6MjA3MzU3NjAwMH0." +
  "0Xq3rL8wZaV2kPbN7yTmQeJhCdRfUgSxAoIiYnEvBlM";

type Call = { url: string; init: RequestInit };

/** A fetch that records what it was asked and answers what the test says. */
function recorder(respond: (call: Call) => Response): { calls: Call[]; fetchImpl: typeof fetch } {
  const calls: Call[] = [];
  const fetchImpl = (async (input: unknown, init?: RequestInit) => {
    const call = { url: String(input), init: init ?? {} };
    calls.push(call);
    return respond(call);
  }) as unknown as typeof fetch;
  return { calls, fetchImpl };
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

/* process.env is declared `readonly` in src/env.d.ts — that declaration exists
   to stop application code writing to it, and these two tests are the one
   legitimate exception, so they go through a mutable view of the same object
   rather than weakening the declaration. */
const envBag = process.env as Record<string, string | undefined>;
const ENV_KEYS = ["SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"];

/** Run `body` with exactly these three variables set, and put the process back
    however it goes. */
async function withEnv(
  values: Record<string, string | undefined>,
  body: () => Promise<void> | void,
): Promise<void> {
  const saved: Record<string, string | undefined> = {};
  for (const k of ENV_KEYS) {
    saved[k] = envBag[k];
    delete envBag[k];
  }
  for (const [k, v] of Object.entries(values)) if (v !== undefined) envBag[k] = v;
  resetStoreConfig();
  try {
    await body();
  } finally {
    for (const k of ENV_KEYS) {
      delete envBag[k];
      if (saved[k] !== undefined) envBag[k] = saved[k];
    }
    resetStoreConfig();
  }
}

test("an rpc posts its named arguments to PostgREST with the service-role key", async () => {
  const { calls, fetchImpl } = recorder(() => json({ enrolled: true }));

  const res = await rpc("market_instrument", { p_symbol: "AAPL" }, { fetchImpl, config: CONFIG });

  assert.equal(res.ok, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://example.supabase.co/rest/v1/rpc/market_instrument");
  assert.equal(calls[0].init.method, "POST");
  assert.equal(calls[0].init.body, JSON.stringify({ p_symbol: "AAPL" }));
  /* no-store, not a Next fetch cache entry: the cache lives one layer up in
     reads.ts, keyed on the symbol rather than on a URL nobody can tag. */
  assert.equal(calls[0].init.cache, "no-store");

  const headers = calls[0].init.headers as Record<string, string>;
  assert.equal(headers.apikey, CONFIG.key);
  assert.equal(headers.Authorization, `Bearer ${CONFIG.key}`);
  assert.equal(headers["Content-Type"], "application/json");
  assert.equal(headers.Accept, "application/json");

  if (res.ok) assert.deepEqual(res.data, { enrolled: true });
});

test("a trailing slash on SUPABASE_URL does not become a double slash", async () => {
  const { calls, fetchImpl } = recorder(() => json(null));

  await rpc("market_status", {}, { fetchImpl, config: { ...CONFIG, url: `${CONFIG.url}/` } });

  assert.equal(calls[0].url, "https://example.supabase.co/rest/v1/rpc/market_status");
});

test("a non-2xx answer is a failure carrying the status and a short body", async () => {
  const { fetchImpl } = recorder(
    () => new Response("permission denied for function market_home", { status: 403 }),
  );

  const res = await rpc("market_home", {}, { fetchImpl, config: CONFIG });

  assert.equal(res.ok, false);
  assert.equal(res.status, 403);
  if (!res.ok) {
    assert.match(res.error, /market_home/);
    assert.match(res.error, /403/);
    assert.match(res.error, /permission denied/);
  }

  /* A 500 as well as the 403, because the two mean opposite things to the layer
     above: lib/api/cache-policy.ts memoises a stable answer and refuses to
     memoise a 5xx, and it reads `status` to tell them apart. */
  const { fetchImpl: dead } = recorder(
    () => new Response('{"message":"canceling statement due to statement timeout"}', { status: 500 }),
  );
  const server = await rpc("market_instrument", { p_symbol: "AAPL" }, { fetchImpl: dead, config: CONFIG });

  assert.equal(server.ok, false);
  assert.equal(server.status, 500);
  if (!server.ok) {
    assert.match(server.error, /market_instrument/);
    assert.match(server.error, /500/);
    assert.match(server.error, /statement timeout/);
  }
});

test("the key never reaches an error string, however the upstream phrases it", async () => {
  /* PostgREST really does echo the credential back on a malformed request, and
     fetch puts whatever it was given into the TypeError it throws. Both land in
     `error`, and `error` is logged. */
  const { fetchImpl } = recorder(
    () => new Response(`No API key found in request: ${CONFIG.key}`, { status: 401 }),
  );
  const body = await rpc("market_status", {}, { fetchImpl, config: CONFIG });
  assert.equal(body.ok, false);
  if (!body.ok) {
    assert.ok(!body.error.includes(CONFIG.key), "the raw key must not survive into an error");
    assert.match(body.error, /redacted/);
  }

  const thrower = (async () => {
    throw new TypeError(`fetch failed: https://example.supabase.co?apikey=${CONFIG.key}`);
  }) as unknown as typeof fetch;
  const network = await rpc("market_status", {}, { fetchImpl: thrower, config: CONFIG });
  assert.equal(network.ok, false);
  assert.equal(network.status, 0, "a request that never arrived has no status");
  if (!network.ok) {
    assert.ok(!network.error.includes(CONFIG.key));
    assert.ok(network.ms >= 0);
  }

  const bearer = (async () => {
    throw new Error(`Authorization: Bearer ${CONFIG.key} rejected`);
  }) as unknown as typeof fetch;
  const auth = await rpc("market_status", {}, { fetchImpl: bearer, config: CONFIG });
  assert.equal(auth.ok, false);
  if (!auth.ok) assert.ok(!auth.error.includes(CONFIG.key));
});

test("a real-length key survives neither the body it is echoed in nor the truncation", async () => {
  /* The property above holds trivially for a short fake key, because the whole
     message fits under the 200-character cap the error path applies to an
     upstream body. A real service-role JWT does not fit, and truncating before
     redacting would leave a prefix of it — header, project ref, service_role
     claim — in the message, since a prefix of the key no longer matches the
     key. This is that case, in PostgREST's own phrasing. */
  assert.ok(LONG_KEY.length > 200, "the fixture only tests anything if it outruns the cap");

  const config = { url: CONFIG.url, key: LONG_KEY };
  const { fetchImpl } = recorder(
    () => new Response(`No API key found in request: ${LONG_KEY}`, { status: 401 }),
  );

  const res = await rpc("market_status", {}, { fetchImpl, config });

  assert.equal(res.ok, false);
  assert.equal(res.status, 401);
  if (!res.ok) {
    assert.ok(!res.error.includes(LONG_KEY), "the whole key must not survive");
    assert.ok(
      !res.error.includes(LONG_KEY.slice(0, 40)),
      "nor any leading run of it: the JWT header and project ref are the readable part",
    );
    assert.match(res.error, /No API key found in request: <redacted>/);
  }

  /* And the cap still does its job on a body with no key in it at all: a
     gateway HTML page must not become a 40KB log line. */
  const { fetchImpl: verbose } = recorder(() => new Response("x".repeat(40_000), { status: 502 }));
  const long = await rpc("market_home", {}, { fetchImpl: verbose, config });
  assert.equal(long.ok, false);
  if (!long.ok) assert.ok(long.error.length < 260, `error was ${long.error.length} characters`);
});

test("an empty body is a value, not a parse failure", async () => {
  /* market_touch_visit returns void, and PostgREST answers 204 with no bytes.
     Feeding that to JSON.parse would report every successful pull-through
     enrolment as a broken response. */
  const { fetchImpl } = recorder(() => new Response(null, { status: 204 }));

  const res = await rpc("market_touch_visit", { p_symbol: "AAPL" }, { fetchImpl, config: CONFIG });

  assert.equal(res.ok, true);
  assert.equal(res.status, 204);
  if (res.ok) assert.equal(res.data, null);
});

test("a body that is not JSON fails rather than throwing", async () => {
  const { fetchImpl } = recorder(() => new Response("<html>bad gateway</html>", { status: 200 }));

  const res = await rpc("market_home", {}, { fetchImpl, config: CONFIG });

  assert.equal(res.ok, false);
  assert.equal(res.status, 200);
});

test("a 2xx whose body never finishes arriving is a failure, not an empty success", async () => {
  /* The most expensive bug this module can have, because it is invisible.
     Headers and body are two separate arrivals — a 200 only means the status
     line reached us — and the abort signal covers BOTH, so a large payload on a
     slow link aborts mid-download with the response object already in hand.
     market_home is exactly that payload: hot rows, the strip, a week of bars
     per strip symbol, the wire and the calendar.

     Read the body with `.catch(() => "")` and that case is indistinguishable
     from the 204 market_touch_visit really does return, so it becomes
     `ok(null)`. The cost is not the lost read: `guard` in reads.ts only refuses
     to memoise `!ok`, so a fake success is stored for the full TTL, and every
     caller then dereferences a null cast to StoredHome — a TypeError in the
     render, which is the one outcome this client's contract rules out. */
  const enc = new TextEncoder();

  /* Stalled, then aborted: the shape a real slow download takes. The fake
     wires the signal to the stream by hand, which is what undici does for
     itself. */
  const stalling = ((_input: unknown, init?: RequestInit) => {
    const signal = init?.signal as AbortSignal;
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(enc.encode('{"rows":'));
        signal.addEventListener("abort", () => controller.error(signal.reason));
      },
    });
    return Promise.resolve(new Response(body, { status: 200 }));
  }) as unknown as typeof fetch;

  const cut = await rpc("market_home", {}, { fetchImpl: stalling, config: CONFIG, timeoutMs: 20 });

  assert.equal(cut.ok, false, "a half-arrived body is not a successful read");
  if (!cut.ok) {
    assert.match(cut.error, /market_home/);
    assert.match(cut.error, /TimeoutError/);
    /* And the clock runs over the download, not just the handshake. Timed to
       the headers, a body that took the whole eight seconds is logged as
       instant, and the one number that would explain a slow page is the one
       that lies about it. */
    assert.ok(cut.ms >= 10, `the download must be in ms, which was ${cut.ms}`);
  }

  /* A stream that errors mid-body — a dropped connection rather than a slow
     one — is the same class of thing and must read the same way. */
  const broken = (async () => {
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(enc.encode('{"rows":'));
        controller.error(new TypeError("terminated"));
      },
    });
    return new Response(body, { status: 200 });
  }) as unknown as typeof fetch;

  const dropped = await rpc("market_home", {}, { fetchImpl: broken, config: CONFIG });
  assert.equal(dropped.ok, false);
  if (!dropped.ok) assert.match(dropped.error, /market_home/);
});

test("a request that hangs is abandoned at the timeout", async () => {
  const fetchImpl = ((_input: unknown, init?: RequestInit) =>
    new Promise<Response>((_resolve, reject) => {
      const signal = init?.signal as AbortSignal;
      signal.addEventListener("abort", () => reject(signal.reason));
    })) as unknown as typeof fetch;

  const started = Date.now();
  const res = await rpc("market_home", {}, { fetchImpl, config: CONFIG, timeoutMs: 20 });

  assert.equal(res.ok, false);
  assert.equal(res.status, 0);
  /* The NAME, not the whole message: AbortSignal.timeout is specified to abort
     with a DOMException named TimeoutError, so that much is stable, while the
     message behind it ("The operation was aborted due to timeout") is Node's
     wording and has changed before. Asserting the name keeps the distinction
     the client exists to preserve — a timeout reads differently from a DNS
     failure — without pinning a string a runtime upgrade can move. */
  if (!res.ok) assert.match(res.error, /^TimeoutError\b/);
  assert.ok(Date.now() - started < 2_000, "it must not wait for the default eight seconds");
});

test("without configuration the client fails without touching the network", async () => {
  await withEnv({}, async () => {
    let called = 0;
    const fetchImpl = (async () => {
      called += 1;
      return json(null);
    }) as unknown as typeof fetch;

    assert.equal(storeConfig(), null);
    assert.equal(storeConfigured(), false);

    const res = await rpc("market_status", {}, { fetchImpl });
    assert.equal(res.ok, false);
    assert.equal(res.status, 0);
    if (!res.ok) assert.match(res.error, /not configured/);
    assert.equal(called, 0, "an unconfigured store must not issue a request");
  });
});

test("the server URL wins over the public one, and the answer is memoised", async () => {
  await withEnv(
    {
      SUPABASE_URL: "https://server.supabase.co",
      NEXT_PUBLIC_SUPABASE_URL: "https://public.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "k",
    },
    () => {
      assert.deepEqual(storeConfig(), { url: "https://server.supabase.co", key: "k" });

      delete envBag.SUPABASE_URL;
      assert.deepEqual(
        storeConfig(),
        { url: "https://server.supabase.co", key: "k" },
        "read once per process, like lib/api/env.ts",
      );

      resetStoreConfig();
      assert.deepEqual(storeConfig(), { url: "https://public.supabase.co", key: "k" });

      delete envBag.SUPABASE_SERVICE_ROLE_KEY;
      resetStoreConfig();
      assert.equal(storeConfig(), null, "a URL without the key is not a configured store");
    },
  );
});

test("every wrapper names its parameters the way the SQL declares them", async () => {
  /* PostgREST matches RPC arguments by name, not by position: a `p_symbols`
     spelled `symbols` is not a type error anywhere in TypeScript, it is a
     404 from the database at runtime. This is the only place the spellings
     are checked against the migration. */
  const seen: Array<{ fn: string; args: Record<string, unknown> }> = [];
  const fetchImpl = (async (input: unknown, init?: RequestInit) => {
    seen.push({
      fn: String(input).split("/rpc/")[1],
      args: JSON.parse(String(init?.body)) as Record<string, unknown>,
    });
    return json(null);
  }) as unknown as typeof fetch;
  const o = { fetchImpl, config: CONFIG };

  const row: SweepRowJson = {
    s: "AAPL", name: "Apple Inc", px: 1, chg: 0, chgKnown: true, vol: 1, avgVol: 1,
    dollarVol: 1, relVol: 1, mcap: null, pe: null, ex: "NSDQ", asOf: null, delayed: true,
  };

  await readInstrumentRaw("AAPL", o);
  await readHomeRaw(["SPY"], ["AAPL"], ["MSFT"], o);
  await readSectionsRaw(["AAPL"], "profile", o);
  await readStatus(o);
  await seedSymbols([{ symbol: "AAPL", name: "Apple Inc", exchange: "NSDQ", tradable: true }], o);
  await upsertQuotes([{ ...row, raw: null }], "2026-09-16T12:00:00.000Z", o);
  await setHot(["AAPL"], o);
  await enrol(["AAPL"], ["profile"], 3, o);
  await touchVisit("AAPL", o);
  await claimDue(60, ["profile"], o);
  await complete(
    {
      symbol: "AAPL",
      section: "profile",
      payload: { a: 1 },
      hash: "abc",
      changed: true,
      error: null,
      nextCheckAt: "2026-09-17T00:00:00.000Z",
      ms: 120,
      sourceUpdatedAt: null,
    },
    o,
  );

  assert.deepEqual(
    seen.map((c) => c.fn),
    [
      "market_instrument", "market_home", "market_sections", "market_status",
      "market_seed_symbols", "market_upsert_quotes", "market_set_hot", "market_enrol",
      "market_touch_visit", "market_claim_due", "market_complete",
    ],
  );

  assert.deepEqual(seen[0].args, { p_symbol: "AAPL" });
  assert.deepEqual(seen[1].args, { p_strip: ["SPY"], p_wire: ["AAPL"], p_calendar: ["MSFT"] });
  assert.deepEqual(seen[2].args, { p_symbols: ["AAPL"], p_section: "profile" });
  assert.deepEqual(seen[3].args, {});
  /* The ROW's own keys, not just the parameter name. market_seed_symbols reads
     `t.item ->> 'symbol'`, `'name'`, `'exchange'` and `'tradable'`
     (migration:199-203) and filters on `nullif(item ->> 'symbol','') is not
     null` — so rows spelled the master file's way, {s, n, ex}, match the filter
     nowhere, the CTE comes out empty, the insert writes nothing, and the RPC
     returns 0. Which that function's own comment reads as a repeat seed. The
     bootstrap would report success and seed an empty universe, and no type in
     TypeScript would have anything to say about it.

     The short spellings ARE right one function over — market_upsert_quotes
     reads 's', 'name', 'ex', 'px' (migration:246-251) — which is exactly why
     this needs pinning rather than remembering. */
  assert.deepEqual(seen[4].args, {
    p_rows: [{ symbol: "AAPL", name: "Apple Inc", exchange: "NSDQ", tradable: true }],
  });
  assert.deepEqual(Object.keys(seen[5].args), ["p_rows", "p_swept_at"]);
  assert.equal(seen[5].args.p_swept_at, "2026-09-16T12:00:00.000Z");
  assert.deepEqual(seen[6].args, { p_symbols: ["AAPL"] });
  assert.deepEqual(seen[7].args, { p_symbols: ["AAPL"], p_sections: ["profile"], p_priority: 3 });
  assert.deepEqual(seen[8].args, { p_symbol: "AAPL" });
  assert.deepEqual(seen[9].args, { p_limit: 60, p_sections: ["profile"] });
  assert.deepEqual(seen[10].args, {
    p_symbol: "AAPL",
    p_section: "profile",
    p_payload: { a: 1 },
    p_hash: "abc",
    p_changed: true,
    p_error: null,
    p_next_check_at: "2026-09-17T00:00:00.000Z",
    p_ms: 120,
    p_source_updated_at: null,
  });
});

test("an omitted optional argument is left out so the SQL default applies", async () => {
  /* `p_swept_at` defaults to now() and `p_limit` to the batch size in the
     migration. Sending an explicit null would override both with null. */
  const seen: Array<Record<string, unknown>> = [];
  const fetchImpl = (async (_input: unknown, init?: RequestInit) => {
    seen.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
    return json(null);
  }) as unknown as typeof fetch;
  const o = { fetchImpl, config: CONFIG };

  await upsertQuotes([], undefined, o);
  await claimDue(undefined, undefined, o);
  await enrol(["AAPL"], ["profile"], undefined, o);

  assert.deepEqual(Object.keys(seen[0]), ["p_rows"]);
  assert.deepEqual(Object.keys(seen[1]), []);
  assert.deepEqual(Object.keys(seen[2]), ["p_symbols", "p_sections"]);
});

test("the stored shapes say epoch milliseconds, because that is what the SQL sends", () => {
  /* Every timestamp on the `market_*` surface is built as
     `(extract(epoch from …) * 1000)::bigint` — migration lines 680, 875, 904
     and 928 — so what arrives in the JSON is 1789565400000, never
     "2026-09-16T13:30:00Z". Nothing checks that at runtime: `rpc` casts the
     parsed body to the declared type and hands it on. So the check is here,
     and it is a compile-time one — these fixtures are the SQL's own output,
     and a declaration that drifts back to `string | null` stops this file
     compiling instead of shipping.

     WHICH MEANS `npm test` IS NOT THE GATE FOR THIS ONE. The script is
     `node --test` (package.json), and Node strips the annotations without
     checking them, so the assertions below can only ever re-read the literals
     three lines above them and this test is green whatever the declarations
     say. `npx tsc --noEmit` is what fails. The runtime assertions are kept
     anyway, because they say out loud what the fixture means — 1789565400000
     is a date in 2026 and not a version number — but nobody should read a green
     test run as evidence the shapes were checked.
     
     The drift is worth a test rather than a comment because its symptoms are
     quiet and late: `Date.parse` of a number is NaN, `.slice(0, 10)` of one is
     a TypeError, and a freshness badge built on either reads as a date fifty
     thousand years out rather than as an error. */
  const status: StoreStatus = {
    quotesSweptAt: 1_789_565_400_000,
    hotCount: 500,
    quotesCount: 13_797,
    enrolled: 500,
    due: 12,
    claimed: 3,
    erroring: 0,
    lastRefreshAt: null,
    lastHour: { changed: 4, unchanged: 96, error: 0, absent: 1 },
  };
  const section: StoredSectionRow = {
    symbol: "AAPL",
    payload: { ok: true },
    fetchedAt: 1_789_565_400_000,
    version: 3,
  };
  /* Both states of a section's meta, because only the filled one exercises the
     declaration — `null` is assignable to `string | null` too, so a fixture
     that carried nothing but nulls would let the drift back through. */
  const meta: Record<string, SectionMeta> = {
    profile: { fetchedAt: 1_789_565_400_000, version: 7 },
    analyst: { fetchedAt: null, version: 0 },
  };

  assert.equal(new Date(status.quotesSweptAt ?? 0).getUTCFullYear(), 2026);
  assert.equal(new Date(section.fetchedAt ?? 0).toISOString(), "2026-09-16T13:30:00.000Z");
  assert.equal(meta.analyst.fetchedAt, null, "enrolled but never filled");

  /* And the wire's news list is nullable. market_home reaches into the stored
     fundamentals for it (`s.payload -> 'ticker_news'`, migration:836) with only
     a `payload is not null` guard, and a gateway answer carrying
     `ticker_news: null` therefore arrives as a present entry with no list. A
     consumer mapping over it unguarded throws on a ticker that simply had a
     quiet week. */
  const wire: StoredHome["wire"] = [
    { ticker: "AAPL", news: [{ title: "something" }] },
    { ticker: "MSFT", news: null },
  ];
  assert.equal(wire[1].news, null);
});

test("every tag the store can issue is a tag the revalidate route accepts", () => {
  /* `symbolTag` produces the tags and TAG_PATTERN is what
     app/api/revalidate/route.ts will accept; they live in the same file so this
     test can hold them to each other over the real universe, which is the only
     way the agreement is anything more than prose.

     It was prose, and it was wrong. The class started as [A-Z0-9.$:_-] — which
     admits `$` and `:`, neither of which occurs in a single listed US ticker,
     and rejects `+`, which 80 of them carry (ACHR+, BBAI+, BKKT+ and the rest
     of the warrants). And the route validates all-or-nothing, so one warrant in
     a batch of 200 returns 400 and marks NOTHING stale: 199 healthy symbols
     frozen on their 900-second timer by one plus sign. */
  const rejected = TRADABLE.map((e) => e.s).filter((sym) => !TAG_PATTERN.test(symbolTag(sym)));
  assert.deepEqual(rejected, [], "a tradable symbol whose tag the route would 400 on");

  /* Named explicitly as well as counted, so the three punctuation families are
     visibly covered rather than covered by a filter that could itself go
     empty. */
  for (const sym of ["ACHR+", "BRK.B", "AGM.A", "AIIA.RT", "RDS-A", "aapl"]) {
    assert.ok(TAG_PATTERN.test(symbolTag(sym)), `${sym} must survive the round trip`);
  }
  assert.ok(TAG_PATTERN.test(HOME_TAG));

  /* And the boundary the pattern exists for. A tag is a key to the cache, so
     anything outside the market namespace must not be nameable by a caller who
     has the secret but not the sense. */
  for (const bad of ["", "market:", "home", "_N_T_1_/page", "market:A B", "MARKET", "x:market:AAPL"]) {
    assert.ok(!TAG_PATTERN.test(bad), `${bad} must not be accepted as a market tag`);
  }
  assert.ok(!TAG_PATTERN.test(`market:${"A".repeat(41)}`), "and there is a length ceiling");
});

test("the revalidate route's body check is a pure function, so plain Node can hold it", () => {
  /* app/api/revalidate/route.ts cannot be loaded here — it imports next/cache,
     and `revalidateTag` throws "static generation store missing" outside a Next
     request — so everything the route decides before that call lives in
     `parseTagBatch` next to the pattern it enforces. Without this the cap, the
     all-or-nothing rule and the dedupe were reachable only by reading, and a
     deliberate bug in any of them would have passed every gate this task runs.

     The validator is in types.ts rather than exported from the route because a
     route file may not export anything else: next build generates a
     `checkFields<Diff<{…known keys…}, typeof entry>>()` guard per route
     (node_modules/next/dist/build/webpack/plugins/next-types-plugin/index.js:44-56,
     :144) that requires every export outside its list to be `never`. */

  const bad = (body: unknown) => {
    const r = parseTagBatch(body);
    assert.equal(r.ok, false, `${JSON.stringify(body)} should have been rejected`);
    return r.ok ? "" : r.error;
  };

  /* Shape first: the worker's contract is `{ tags: string[] }`, and a body that
     failed to parse arrives here as null rather than as a thrown SyntaxError. */
  assert.match(bad(null), /tags/);
  assert.match(bad({}), /tags/);
  assert.match(bad({ tags: "market:AAPL" }), /tags/, "a bare string is not a batch of one");
  assert.match(bad([symbolTag("AAPL")]), /tags/, "nor is a naked array the body");

  /* The cap. 200 is what the worker chunks to, so 200 passes and 201 is a bug
     on the other side rather than a request to do more work. */
  const many = (n: number) => ({ tags: Array.from({ length: n }, (_, i) => `market:S${i}`) });
  assert.equal(parseTagBatch(many(MAX_TAGS)).ok, true);
  assert.match(bad(many(MAX_TAGS + 1)), /at most 200/);

  /* All-or-nothing, and the message names the offender: a worker that has
     started building tags nobody accepts has to be able to see which one. */
  const rejected = bad({ tags: [symbolTag("AAPL"), "_N_T_1_/page", HOME_TAG] });
  assert.match(rejected, /_N_T_1_\/page/);
  assert.match(bad({ tags: [null] }), /not a market tag/, "a non-string is not a tag");
  assert.match(bad({ tags: [undefined] }), /not a market tag/, "nor is a hole in the array");
  assert.ok(
    bad({ tags: [`market:${"A".repeat(300)}`] }).length < 120,
    "and the offender is truncated before it is echoed back",
  );

  /* Deduplicated, because the worker batches per changed section and a symbol
     whose profile and history both moved names `market:AAPL` twice. The count
     the route returns is ENTRIES MARKED, which is why it can be lower than the
     length of what was sent. */
  const ok = parseTagBatch({
    tags: [symbolTag("AAPL"), symbolTag("MSFT"), symbolTag("aapl"), HOME_TAG],
  });
  assert.equal(ok.ok, true);
  assert.deepEqual(ok.ok && ok.tags, ["market:AAPL", "market:MSFT", HOME_TAG]);

  /* Passed through verbatim, never normalised. revalidateTag is case-sensitive
     (node_modules/next/dist/docs/01-app/03-api-reference/04-functions/revalidateTag.md,
     "Parameters"), the entries are tagged with whatever `symbolTag` produced,
     and the two fixed tags are lower-case — so upper-casing here would clear
     nothing at all for `market:home`. */
  const raw = parseTagBatch({ tags: ["market:aapl"] });
  assert.deepEqual(raw.ok && raw.tags, ["market:aapl"]);
});
