import test from "node:test";
import assert from "node:assert/strict";
import * as nodeModule from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

/* The 5Y answer of the history route, run end to end against a fake store —
 * the same harness as history-route-handler.test.ts: the store read and the
 * gateway client are swapped for fakes, everything between them is real.
 *
 * Set HISTORY_ROUTE_WITHOUT_SEAMS=1 to run it against a route whose seam cut
 * is a no-op, which is how it was seen to fail before the cut existed. */

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FAKE = (names: string[]) =>
  "data:text/javascript," +
  encodeURIComponent(names.map((n) => `export const ${n} = (...a) => globalThis.__fiveYearFake.${n}(...a);`).join("\n"));
const IDENTITY_SEAMS = "data:text/javascript," + encodeURIComponent("export const sinceLastSeam = (p) => p;");

type Resolved = { url: string; shortCircuit?: boolean };
type Resolve = (specifier: string, context: object, next: (s: string, c: object) => Resolved) => Resolved;
const { registerHooks } = nodeModule as unknown as { registerHooks: (hooks: { resolve: Resolve }) => void };

registerHooks({
  resolve(specifier, context, next) {
    if (specifier === "@/lib/market/store/reads") return { url: FAKE(["readSections"]), shortCircuit: true };
    if (specifier === "@/lib/api/clients/quotes") {
      return { url: FAKE(["fetchAggs", "fetchIntradayRange"]), shortCircuit: true };
    }
    if (specifier === "@/lib/api/normalize/daily-bars" && process.env.HISTORY_ROUTE_WITHOUT_SEAMS === "1") {
      return { url: IDENTITY_SEAMS, shortCircuit: true };
    }
    if (specifier.startsWith("@/")) {
      return next(pathToFileURL(path.join(ROOT, `${specifier.slice(2)}.ts`)).href, context);
    }
    return next(specifier, context);
  },
});

const answered = <T>(data: T) => ({ ok: true, data, status: 200, ms: 0 });

function install(store: Record<string, unknown>) {
  (globalThis as Record<string, unknown>).__fiveYearFake = {
    async fetchAggs() {
      return answered({ results: [] });
    },
    async fetchIntradayRange() {
      return answered([]);
    },
    async readSections(symbols: string[], section: string) {
      const payload = store[section];
      return answered(payload === undefined ? [] : [{ symbol: symbols[0], payload }]);
    },
  };
}

const { GET } = (await import(
  pathToFileURL(path.join(ROOT, "app/api/history/[ticker]/route.ts")).href
)) as { GET: (req: Request, ctx: { params: Promise<{ ticker: string }> }) => Promise<Response> };

async function fiveYears(ticker: string, store: Record<string, unknown>) {
  install(store);
  const req = new Request(`https://pwg.test/api/history/${ticker}?range=5Y`, {
    headers: { "sec-fetch-site": "same-origin", "x-forwarded-for": "10.0.1.1" },
  });
  const res = await GET(req, { params: Promise.resolve({ ticker }) });
  return { status: res.status, body: await res.json() };
}

/* META's row as production held it on 24 Sep 2026 (abridged): written from
   Polygon alone, so the Roundhill ETF that held the ticker until Jan 2022,
   a four-month hole, then Facebook. */
test("5Y never serves the security that held the ticker before a seam", async () => {
  const r = await fiveYears("META", {
    history_daily: {
      date: [
        "09/14/2021 00:00:00 EDT",
        "09/24/2021 00:00:00 EDT",
        "01/28/2022 00:00:00 EST",
        "06/09/2022 00:00:00 EDT",
        "06/10/2022 00:00:00 EDT",
        "06/01/2023 00:00:00 EDT",
        "06/03/2024 00:00:00 EDT",
        "09/23/2026 00:00:00 EDT",
      ],
      price: [14.99, 14.91, 12.31, 184, 175.57, 264.95, 476.44, 744.1],
      opening: [15.1, 14.8, 11.9979, 194.28, 183.04, 264, 470, 740],
      high: [15.2, 15, 12.31, 199.45, 183.1, 266, 478, 750],
      low: [14.9, 14.7, 11.73, 183.68, 175.02, 262, 468, 735],
      volume: [1, 1, 1, 1, 1, 1, 1, 1],
    },
    corporate_actions: { splits: [] },
  });
  assert.equal(r.status, 200);
  assert.deepEqual(
    r.body.series.map((p: { price: number }) => p.price),
    [184, 175.57, 264.95, 476.44, 744.1],
  );
});

test("5Y of an unbroken series is served whole", async () => {
  const r = await fiveYears("AAPL", {
    history_daily: {
      date: ["09/24/2021 00:00:00 EDT", "09/22/2026 00:00:00 EDT", "09/23/2026 00:00:00 EDT"],
      price: [146.92, 339.75, 337.02],
      opening: [145.66, 340.135, 341.075],
      high: [147.47, 345.34, 341.8],
      low: [145.56, 338.75, 335.5],
      volume: [1, 1, 1],
    },
  });
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.series.map((p: { price: number }) => p.price), [146.92, 339.75, 337.02]);
});
