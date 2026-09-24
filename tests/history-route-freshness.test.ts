import test from "node:test";
import assert from "node:assert/strict";
import * as nodeModule from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

/* How long the history route lets Next's fetch cache hold each upstream answer.
 *
 * The client refetches at the open and the bell and retries every 30 s while an
 * answer falls short of the boundary that has passed (lib/market/ranges.ts,
 * historyTarget). Those retries reach Polygon only as often as the route's
 * fetch cache lets them, so the request that carries the NEWEST session is the
 * one that decides how soon a chart shows today's official close. Older data
 * never changes and keeps its long lifetime.
 *
 * Same harness as history-route-handler.test.ts: the store read and the
 * gateway client are swapped for fakes, which here also record the
 * `revalidate` each call was made with.
 */

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FAKE = (names: string[]) =>
  "data:text/javascript," +
  encodeURIComponent(names.map((n) => `export const ${n} = (...a) => globalThis.__freshFake.${n}(...a);`).join("\n"));

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

type Call = { timespan: string; fromMs: number; toMs: number; revalidate: number };
let calls: Call[] = [];

(globalThis as Record<string, unknown>).__freshFake = {
  async fetchAggs(_s: string, _m: number, timespan: string, fromMs: number, toMs: number, revalidate: number) {
    calls.push({ timespan, fromMs, toMs, revalidate });
    return { ok: true, data: { results: [] }, status: 200, ms: 0 };
  },
  async fetchIntradayRange() {
    return { ok: true, data: [], status: 200, ms: 0 };
  },
  async readSections() {
    return { ok: true, data: [], status: 200, ms: 0 };
  },
};

const { GET } = (await import(
  pathToFileURL(path.join(ROOT, "app/api/history/[ticker]/route.ts")).href
)) as { GET: (req: Request, ctx: { params: Promise<{ ticker: string }> }) => Promise<Response> };

let caller = 0;
async function ask(range: string, nowIso: string): Promise<Call[]> {
  calls = [];
  const realNow = Date.now;
  Date.now = () => Date.parse(nowIso);
  try {
    caller += 1;
    const req = new Request(`https://pwg.test/api/history/AAPL?range=${range}`, {
      headers: { "sec-fetch-site": "same-origin", "x-forwarded-for": `10.1.0.${caller}` },
    });
    await GET(req, { params: Promise.resolve({ ticker: "AAPL" }) });
    return calls;
  } finally {
    Date.now = realNow;
  }
}

const AFTER_BELL_24 = "2026-09-24T20:05:00Z"; // Thu 24 Sep, 16:05 ET
const PRE_MARKET_24 = "2026-09-24T10:00:00Z"; // Thu 24 Sep, 06:00 ET

for (const range of ["1Y", "3M", "1M"] as const) {
  test(`${range}: the chunk holding the newest session and the daily request are held five minutes, not the range's TTL`, async () => {
    const made = await ask(range, AFTER_BELL_24);
    const daily = made.filter((c) => c.timespan === "day");
    const chunks = made.filter((c) => c.timespan === "minute").sort((a, b) => a.fromMs - b.fromMs);
    assert.equal(daily.length, 1);
    assert.equal(daily[0].revalidate, 300, "the daily request carries today's official close");
    assert.equal(chunks.at(-1)!.revalidate, 300, "the newest chunk carries today's 16:00 bar");
    const spanTtl = range === "1M" ? 900 : 3600;
    for (const older of chunks.slice(0, -1)) assert.equal(older.revalidate, spanTtl, "older chunks never change");
  });
}

for (const range of ["1D", "1W"] as const) {
  test(`${range}: while today is the newest session, Polygon's answers are held a minute`, async () => {
    const made = await ask(range, AFTER_BELL_24);
    assert.equal(made.length, 2);
    for (const c of made) assert.equal(c.revalidate, 60, `${c.timespan} request`);
  });

  test(`${range}: before the open the newest session is yesterday's, finished, and held five minutes`, async () => {
    const made = await ask(range, PRE_MARKET_24);
    assert.equal(made.length, 2);
    for (const c of made) assert.equal(c.revalidate, 300, `${c.timespan} request`);
  });
}
