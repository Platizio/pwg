import test from "node:test";
import assert from "node:assert/strict";
import * as nodeModule from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

/* /api/quotes/watchlist itself, end to end against fake upstreams.
 *
 * answer.ts holds the budget and the caches and is tested on its own; this
 * file holds what the BROWSER sees, which is where a mistake would land on a
 * reader: the status, the Cache-Control on a partial answer, and the
 * difference between `missing` and `pending`. components/terminal/watchlist/
 * quotes.ts remembers everything a 200 did not price as quoteless for five
 * minutes, so a partial answer that is not marked, or an empty one sent as a
 * 200, is a row of dashes that outlives the blip that caused it.
 *
 * The same harness as history-route-handler.test.ts: the `@/` alias is
 * resolved here, and exactly the store read and the gateway client are swapped
 * for fakes. The universe, the parser and the row translation are the real
 * code, so the symbols below are real tradable tickers.
 */

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FAKE = (names: string[]) =>
  "data:text/javascript," +
  encodeURIComponent(names.map((n) => `export const ${n} = (...a) => globalThis.__watchFake.${n}(...a);`).join("\n"));

type Resolved = { url: string; shortCircuit?: boolean };
type Resolve = (specifier: string, context: object, next: (s: string, c: object) => Resolved) => Resolved;
const { registerHooks } = nodeModule as unknown as { registerHooks: (hooks: { resolve: Resolve }) => void };

registerHooks({
  resolve(specifier, context, next) {
    if (specifier === "@/lib/market/store/reads") return { url: FAKE(["readHomeUntagged"]), shortCircuit: true };
    if (specifier === "@/lib/market/store/client") return { url: FAKE(["storeConfigured"]), shortCircuit: true };
    if (specifier === "@/lib/api/clients/quotes") return { url: FAKE(["fetchQuotes"]), shortCircuit: true };
    if (specifier.startsWith("@/")) {
      return next(pathToFileURL(path.join(ROOT, `${specifier.slice(2)}.ts`)).href, context);
    }
    return next(specifier, context);
  },
});

const storedRow = (s: string, name: string, px: number, chg: number) => ({
  s,
  name,
  px,
  chg,
  chgKnown: true,
  vol: 1_000_000,
  avgVol: 900_000,
  dollarVol: px * 1_000_000,
  relVol: 1.1,
  mcap: null,
  pe: null,
  ex: "NSDQ",
  asOf: 1_790_324_462_052,
  delayed: true,
});

const HOME = {
  sweptAt: 1_790_324_462_052,
  rows: [storedRow("AAPL", "Apple Inc.", 335.97, 0.0149), storedRow("MSFT", "Microsoft Corp", 496.47, -0.29)],
  strip: [],
  weekBars: {},
  wire: [],
  calendar: [],
};

const gatewayQuote = (symbol: string, lastPrice: number) => ({
  symbol,
  companyName: `${symbol} Fund`,
  changePercent: -0.001,
  change: -0.05,
  lastPrice,
  closingPrice: lastPrice,
  yesterdayClose: lastPrice,
  volume: 10_000,
  averageVolume30: 12_000,
  marketCap: null,
  priceEarningRatio: null,
  exchange: "AMEX",
  delayed: true,
  updateTime: "2026-09-25T04:00:00.000-0400",
  notFound: false,
  notPermissioned: false,
});

type Fake = { gatewayDelayMs: number; gatewayCalls: string[][]; homeCalls: number };
const fake: Fake = { gatewayDelayMs: 0, gatewayCalls: [], homeCalls: 0 };

(globalThis as Record<string, unknown>).__watchFake = {
  storeConfigured: () => true,
  async readHomeUntagged() {
    fake.homeCalls += 1;
    /* What unstable_cache hands back on a hit: a fresh parse every time. */
    return { ok: true, data: JSON.parse(JSON.stringify(HOME)), status: 200, ms: 0 };
  },
  async fetchQuotes(symbols: string[]) {
    fake.gatewayCalls.push(symbols);
    if (fake.gatewayDelayMs > 0) await new Promise((r) => setTimeout(r, fake.gatewayDelayMs));
    return { ok: true, data: symbols.map((s, i) => gatewayQuote(s, 25 + i)), status: 200, ms: 0 };
  },
};

const { GET } = (await import(pathToFileURL(path.join(ROOT, "app/api/quotes/watchlist/route.ts")).href)) as {
  GET: (req: Request) => Promise<Response>;
};

let caller = 0;
async function ask(symbols: string, headers: Record<string, string> = { "sec-fetch-site": "same-origin" }) {
  caller += 1;
  const req = new Request(`https://pwg.test/api/quotes/watchlist?symbols=${encodeURIComponent(symbols)}`, {
    headers: { "x-forwarded-for": `10.1.0.${caller}`, ...headers },
  });
  const started = Date.now();
  const res = await GET(req);
  return {
    ms: Date.now() - started,
    status: res.status,
    cache: res.headers.get("cache-control"),
    timing: res.headers.get("server-timing"),
    retryAfter: res.headers.get("retry-after"),
    body: (await res.json()) as {
      quotes: Array<{ id: string; name: string; price: number; chg: number | null }>;
      refused: string[];
      missing: string[];
      pending: string[];
    },
  };
}

test("names the store holds: a 200 from memory, cacheable, with its timing", async () => {
  const r = await ask("MSFT,AAPL");
  assert.equal(r.status, 200);
  assert.equal(r.cache, "public, max-age=30, s-maxage=60, stale-while-revalidate=300");
  assert.deepEqual(r.body.quotes.map((q) => [q.id, q.price]), [
    ["MSFT", 496.47],
    ["AAPL", 335.97],
  ]);
  assert.deepEqual(r.body.pending, []);
  assert.deepEqual(r.body.missing, []);
  assert.equal(fake.gatewayCalls.length, 0, "no gateway call for names the store holds");
  assert.match(r.timing ?? "", /answer;desc="upstream"/);

  /* A second reader with the same names, in another order: the cached answer. */
  const again = await ask("AAPL,MSFT");
  assert.match(again.timing ?? "", /answer;desc="cache"/);
  assert.equal(fake.homeCalls, 1, "the store entry was read into the process once");
});

test("the gap goes to the gateway once, sorted, and a refused symbol never leaves", async () => {
  fake.gatewayCalls = [];
  const r = await ask("ALDB,AAPL,AKRE,NOTAREALTICKERX");
  assert.equal(r.status, 200);
  assert.deepEqual(fake.gatewayCalls, [["AKRE", "ALDB"]]);
  assert.deepEqual(r.body.quotes.map((q) => q.id), ["ALDB", "AAPL", "AKRE"]);
  assert.deepEqual(r.body.refused, ["NOTAREALTICKERX"]);
  assert.deepEqual(r.body.pending, []);
});

test("a slow gateway: the store's names now, the rest pending, nothing cached", async () => {
  fake.gatewayCalls = [];
  fake.gatewayDelayMs = 4_000;
  try {
    const r = await ask("AAPL,AMS");
    assert.ok(r.ms < 2_000, `answered inside the budget (${r.ms}ms)`);
    assert.equal(r.status, 200);
    assert.equal(r.cache, "no-store");
    assert.deepEqual(r.body.quotes.map((q) => q.id), ["AAPL"]);
    assert.deepEqual(r.body.pending, ["AMS"], "owed, not 'no quote'");
    assert.deepEqual(r.body.missing, []);
    assert.match(r.timing ?? "", /answer;desc="budget"/);
    assert.match(r.timing ?? "", /gateway;desc="1 asked, no answer yet"/);
  } finally {
    fake.gatewayDelayMs = 0;
  }
});

test("nothing priced in time: a 503 the browser retries, not a 200 of dashes", async () => {
  fake.gatewayCalls = [];
  fake.gatewayDelayMs = 4_000;
  try {
    const r = await ask("AMHI,ALTL");
    assert.ok(r.ms < 2_000, `answered inside the budget (${r.ms}ms)`);
    assert.equal(r.status, 503);
    assert.equal(r.cache, "no-store");
    assert.equal(r.retryAfter, "5");
    assert.deepEqual(r.body.quotes, []);
    assert.deepEqual(r.body.pending, ["AMHI", "ALTL"]);
  } finally {
    fake.gatewayDelayMs = 0;
  }
});

test("another site, or the address bar, is refused before anything is read", async () => {
  const before = fake.homeCalls;
  const r = await ask("AAPL", { "sec-fetch-site": "cross-site" });
  assert.equal(r.status, 403);
  assert.equal(fake.homeCalls, before);
});
