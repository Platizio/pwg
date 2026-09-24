import test from "node:test";
import assert from "node:assert/strict";
import * as nodeModule from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

/* The history route itself, run end to end against fake upstreams.
 *
 * The route is where the pieces meet — which bars are fetched, which are the
 * session, which figure is a session's close — and where a mistake in the
 * joining would pass every unit test of the pieces. It imports through the
 * `@/` alias and reaches the store and the gateway, so this file resolves the
 * alias itself and swaps exactly two modules for fakes: the store read and the
 * gateway client. Everything between them is the real code.
 *
 * Fixtures are shaped like real Polygon answers: `t` is a bar's START in ms,
 * daily bars are stamped at Eastern midnight, and a daily answer runs through
 * today's still-running bar. Prices are AAPL's from 21-24 Sep 2026.
 */

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FAKE = (names: string[]) =>
  "data:text/javascript," +
  encodeURIComponent(names.map((n) => `export const ${n} = (...a) => globalThis.__historyFake.${n}(...a);`).join("\n"));

/* In-thread module hooks: Node 24 has them, @types/node 20 does not know. */
type Resolved = { url: string; shortCircuit?: boolean };
type Resolve = (specifier: string, context: object, next: (s: string, c: object) => Resolved) => Resolved;
const { registerHooks } = nodeModule as unknown as { registerHooks: (hooks: { resolve: Resolve }) => void };

registerHooks({
  resolve(specifier, context, next) {
    if (specifier === "@/lib/market/store/reads") return { url: FAKE(["readSections"]), shortCircuit: true };
    if (specifier === "@/lib/api/clients/quotes") {
      return { url: FAKE(["fetchAggs", "fetchIntradayRange"]), shortCircuit: true };
    }
    if (specifier.startsWith("@/")) {
      return next(pathToFileURL(path.join(ROOT, `${specifier.slice(2)}.ts`)).href, context);
    }
    return next(specifier, context);
  },
});

type Agg = { t: number; o: number; h: number; l: number; c: number; v: number };
type Answer = Agg[] | "fail";
type Fake = {
  minute: Answer;
  day: Answer;
  intraday: unknown[] | "fail";
  store: Record<string, unknown> | "fail";
  /** Minute requests whose window starts before this fail — one bad chunk. */
  failChunksBefore?: number;
};

const failed = { ok: false, error: "upstream 502", status: 502, ms: 0 };
const answered = <T>(data: T) => ({ ok: true, data, status: 200, ms: 0 });

function install(fake: Fake) {
  (globalThis as Record<string, unknown>).__historyFake = {
    async fetchAggs(_symbol: string, _mult: number, timespan: string, fromMs: number, toMs: number) {
      if (timespan === "day") return fake.day === "fail" ? failed : answered({ results: fake.day });
      if (fake.minute === "fail") return failed;
      if (fake.failChunksBefore !== undefined && fromMs < fake.failChunksBefore) return failed;
      return answered({ results: fake.minute.filter((b) => b.t >= fromMs && b.t <= toMs) });
    },
    async fetchIntradayRange() {
      return fake.intraday === "fail" ? failed : answered(fake.intraday);
    },
    async readSections(symbols: string[], section: string) {
      if (fake.store === "fail") return failed;
      const payload = fake.store[section];
      return answered(payload === undefined ? [] : [{ symbol: symbols[0], payload }]);
    },
  };
}

const { GET } = (await import(
  pathToFileURL(path.join(ROOT, "app/api/history/[ticker]/route.ts")).href
)) as { GET: (req: Request, ctx: { params: Promise<{ ticker: string }> }) => Promise<Response> };

let caller = 0;
async function ask(range: string, nowIso: string, fake: Fake, ticker = "AAPL") {
  install(fake);
  const realNow = Date.now;
  Date.now = () => Date.parse(nowIso);
  try {
    caller += 1;
    const req = new Request(`https://pwg.test/api/history/${ticker}?range=${range}`, {
      headers: { "sec-fetch-site": "same-origin", "x-forwarded-for": `10.0.0.${caller}` },
    });
    const res = await GET(req, { params: Promise.resolve({ ticker }) });
    return { status: res.status, cache: res.headers.get("cache-control"), body: await res.json() };
  } finally {
    Date.now = realNow;
  }
}

const bar = (iso: string, o: number, c = o): Agg => ({
  t: Date.parse(iso),
  o,
  h: Math.max(o, c),
  l: Math.min(o, c),
  c,
  v: 100,
});
/* Polygon's daily stamp: Eastern midnight, 04:00Z in summer, 05:00Z in winter. */
const dailyBar = (day: string, c: number, winter = false) => bar(`${day}T0${winter ? 5 : 4}:00:00Z`, c, c);

/* 23 Sep 2026, one-minute bars as Polygon has them — pre-market, the session,
   the bell bar opening on the closing cross, and post-market. */
const SEP23_MINUTES = [
  bar("2026-09-23T13:25:00Z", 341.2), // 09:25 pre-market
  bar("2026-09-23T13:30:00Z", 341.075, 341.3), // 09:30
  bar("2026-09-23T19:59:00Z", 336.86, 336.95), // 15:59, the last continuous trade
  bar("2026-09-23T20:00:00Z", 337.02, 336.88), // 16:00, the closing cross
  bar("2026-09-23T20:01:00Z", 336.7008, 336.77), // post-market
  bar("2026-09-23T23:59:00Z", 336.9, 336.91), // 19:59, the last print of the day
];

const NO_STORE_ROWS = {};
const PRE_MARKET_24 = "2026-09-24T10:00:00Z"; // Thu 24 Sep, 06:00 ET

/* ---------- the day ---------- */

test("1D before the open draws yesterday's session, ending on its official close", async () => {
  const r = await ask("1D", PRE_MARKET_24, {
    minute: [...SEP23_MINUTES, bar("2026-09-24T09:00:00Z", 336.158)],
    /* The answer runs through today's running bar, and it comes LAST. */
    day: [dailyBar("2026-09-23", 337.02), dailyBar("2026-09-24", 336.158)],
    intraday: [],
    store: NO_STORE_ROWS,
  });
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.series.date, [
    "2026-09-23T13:30:00.000Z",
    "2026-09-23T19:59:00.000Z",
    "2026-09-23T20:00:00.000Z",
  ]);
  assert.equal(r.body.series.price.at(-1), 337.02, "the official close, not 15:59's 336.95 nor today's 336.158");
});

test("1D after today's bell ends on the cross, not the running daily bar", async () => {
  const r = await ask("1D", "2026-09-23T20:30:00Z", {
    minute: SEP23_MINUTES.filter((b) => b.t <= Date.parse("2026-09-23T20:29:00Z")),
    day: [dailyBar("2026-09-22", 339.75), dailyBar("2026-09-23", 336.77)],
    intraday: [],
    store: NO_STORE_ROWS,
  });
  assert.equal(r.status, 200);
  assert.equal(r.body.series.date.at(-1), "2026-09-23T20:00:00.000Z");
  assert.equal(r.body.series.price.at(-1), 337.02);
});

test("1D during the session has no close yet", async () => {
  const r = await ask("1D", "2026-09-23T19:00:00Z", {
    minute: [bar("2026-09-23T13:30:00Z", 341.075), bar("2026-09-23T18:59:00Z", 336.5)],
    day: [dailyBar("2026-09-23", 336.5)],
    intraday: [],
    store: NO_STORE_ROWS,
  });
  assert.deepEqual(r.body.series.date, ["2026-09-23T13:30:00.000Z", "2026-09-23T18:59:00.000Z"]);
});

test("1D on a half-day stops at 13:00 and ends on the 13:00 cross", async () => {
  // Fri 27 Nov 2026, EST: 13:00 ET = 18:00Z. Asked at 14:00 ET.
  const r = await ask("1D", "2026-11-27T19:00:00Z", {
    minute: [
      bar("2026-11-27T14:30:00Z", 280.1), // 09:30
      bar("2026-11-27T17:59:00Z", 278.89, 278.86), // 12:59
      bar("2026-11-27T18:00:00Z", 278.85, 278.84), // 13:00, the cross
      bar("2026-11-27T18:30:00Z", 278.5), // 13:30, post-market
      bar("2026-11-27T21:00:00Z", 278.4), // 16:00, post-market
    ],
    day: [dailyBar("2026-11-27", 278.4, true)],
    /* The gateway's archive carries the afternoon too. */
    intraday: [
      { date: "2026-11-27T12:59:00-05:00", price: 278.86, opening: 278.89, high: 278.9, low: 278.8, volume: 1 },
      { date: "2026-11-27T13:30:00-05:00", price: 278.5, opening: 278.5, high: 278.5, low: 278.5, volume: 1 },
    ],
    store: NO_STORE_ROWS,
  });
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.series.date, [
    "2026-11-27T14:30:00.000Z",
    "2026-11-27T17:59:00.000Z",
    "2026-11-27T18:00:00.000Z",
  ]);
  assert.equal(r.body.series.price.at(-1), 278.85);
});

test("1D with every source down is a 503 nobody caches", async () => {
  const r = await ask("1D", PRE_MARKET_24, { minute: "fail", day: "fail", intraday: "fail", store: "fail" });
  assert.equal(r.status, 503);
  assert.equal(r.cache, "no-store");
});

/* ---------- the week ---------- */

/* The gateway's 16:00 minute is a post-market print (measured 23 Sep 2026),
   so with Polygon down the week must not end on it. */
test("1W drawn from the gateway ends each session on its close, not the 16:00 print", async () => {
  const r = await ask("1W", PRE_MARKET_24, {
    minute: "fail",
    day: [
      dailyBar("2026-09-22", 339.75),
      dailyBar("2026-09-23", 337.02),
      dailyBar("2026-09-24", 336.158),
    ],
    intraday: [
      { date: "2026-09-22T15:59:00-04:00", price: 339.6, opening: 339.6, high: 339.6, low: 339.6, volume: 1 },
      { date: "2026-09-22T16:00:00-04:00", price: 342.7, opening: 342.7, high: 342.7, low: 342.7, volume: 1 },
      { date: "2026-09-23T15:58:00-04:00", price: 336.88, opening: 336.85, high: 336.9, low: 336.8, volume: 1 },
      { date: "2026-09-23T15:59:00-04:00", price: 336.95, opening: 336.86, high: 336.96, low: 336.85, volume: 1 },
      { date: "2026-09-23T16:00:00-04:00", price: 336.5, opening: 336.5, high: 336.5, low: 336.5, volume: 1 },
    ],
    store: NO_STORE_ROWS,
  });
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.series.date, [
    "2026-09-22T19:55:00.000Z",
    "2026-09-22T20:00:00.000Z",
    "2026-09-23T19:55:00.000Z",
    "2026-09-23T20:00:00.000Z",
  ]);
  assert.deepEqual(r.body.series.price, [339.6, 339.75, 336.95, 337.02]);
});

/* ---------- the month, quarter and year ---------- */

/* 30-minute bars for 21-23 Sep: the session, the bell bar (opening on the
   cross) and one post-market bar each. */
const thirty = (day: string, open: number, cross: number) => [
  bar(`${day}T13:00:00Z`, open - 1), // 09:00 pre-market
  bar(`${day}T13:30:00Z`, open),
  bar(`${day}T19:30:00Z`, cross - 0.05, cross - 0.07), // 15:30, closes on 15:59's last trade
  bar(`${day}T20:00:00Z`, cross, cross - 0.2), // 16:00
  bar(`${day}T20:30:00Z`, cross - 0.3), // 16:30
];
const YEAR_MINUTES = [
  ...thirty("2026-09-21", 335.28, 338.98),
  ...thirty("2026-09-22", 340.135, 339.75),
  ...thirty("2026-09-23", 341.075, 337.02),
];
const YEAR_DAILY = [
  dailyBar("2026-09-21", 338.98),
  dailyBar("2026-09-22", 339.75),
  dailyBar("2026-09-23", 337.02),
  dailyBar("2026-09-24", 336.158),
];

test("1Y ends every session on its official close, and the year on the last one", async () => {
  const r = await ask("1Y", PRE_MARKET_24, { minute: YEAR_MINUTES, day: YEAR_DAILY, intraday: [], store: "fail" });
  assert.equal(r.status, 200);
  const { date, price } = r.body.series;
  const at = (iso: string) => price[date.indexOf(iso)];
  assert.equal(at("2026-09-21T20:00:00.000Z"), 338.98);
  assert.equal(at("2026-09-22T20:00:00.000Z"), 339.75);
  assert.equal(at("2026-09-23T20:00:00.000Z"), 337.02);
  assert.equal(date.at(-1), "2026-09-23T20:00:00.000Z");
  assert.equal(price.at(-1), 337.02);
  assert.equal(date.includes("2026-09-23T20:30:00.000Z"), false, "post-market is not drawn");
  assert.equal(date.includes("2026-09-23T13:00:00.000Z"), false, "nor pre-market");
  assert.equal(r.body.sessions, 252);
});

test("1Y with one chunk failed is a 503, not a year with a hole in it", async () => {
  const r = await ask("1Y", PRE_MARKET_24, {
    minute: YEAR_MINUTES,
    day: YEAR_DAILY,
    intraday: [],
    store: "fail",
    failChunksBefore: Date.parse("2026-01-01T00:00:00Z"),
  });
  assert.equal(r.status, 503);
  assert.equal(r.cache, "no-store");
});

test("1M from a symbol Polygon does not know is an empty answer, not a failure", async () => {
  const r = await ask("1M", PRE_MARKET_24, { minute: [], day: [], intraday: [], store: "fail" });
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.series.date, []);
});

/* ---------- five years ---------- */

test("5Y with the store unreachable is a 503 nobody caches", async () => {
  const r = await ask("5Y", PRE_MARKET_24, { minute: [], day: [], intraday: [], store: "fail" });
  assert.equal(r.status, 503);
  assert.equal(r.cache, "no-store");
});

test("5Y from the store is served and may be cached", async () => {
  const r = await ask("5Y", PRE_MARKET_24, {
    minute: [],
    day: [],
    intraday: [],
    store: {
      history_daily: {
        date: ["09/22/2026 00:00:00 EDT", "09/23/2026 00:00:00 EDT"],
        price: [339.75, 337.02],
        opening: [340.135, 341.075],
        high: [345.34, 341.8],
        low: [338.75, 335.5],
        volume: [1, 1],
      },
    },
  });
  assert.equal(r.status, 200);
  assert.match(r.cache ?? "", /max-age=60/);
  assert.equal(r.body.series.at(-1).price, 337.02);
});
