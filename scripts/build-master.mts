/* Symbol-master builder.

   This gateway has no screener, no constituent list, and the contract-master
   file endpoint is 401 on this account. What it does have is a search endpoint,
   so the universe is enumerated by crawling the prefix space.

   The subtlety that matters: search returns at most TWENTY matches, ordered
   alphabetically. A crowded prefix therefore truncates — "AA" comes back as
   AA, AAA, AAAA, AAAC … AACG and stops, so AAPL is never seen. A flat
   two-letter crawl silently loses the largest companies in the market.

   The fix is to treat a full page as evidence of truncation and recurse into
   that prefix's children until the results fit. Roughly twenty thousand
   queries, a few minutes, run offline once and committed.

   Run:  npm run build:master
   Out:  lib/market/data/symbol-master.json */

import { writeFileSync, mkdirSync } from "node:fs";
import { searchSymbols } from "../lib/api/clients/quotes.ts";
import { getToken } from "../lib/api/token.ts";

type MasterEntry = { s: string; n: string; ex: string; mic: string };

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
/** The gateway's own page size. A response of exactly this length is truncated. */
const PAGE = 20;
const CONCURRENCY = 16;
const MAX_DEPTH = 4;
const OUT = "lib/market/data/symbol-master.json";
const TRADABLE = new Set(["NSDQ", "NYSE", "AMEX"]);

const found = new Map<string, MasterEntry>();
let queries = 0;
let failures = 0;

async function search(prefix: string): Promise<number> {
  const r = await searchSymbols(prefix, 0, [], true);
  queries += 1;
  if (!r.ok) {
    failures += 1;
    return 0;
  }
  for (const hit of r.data) {
    if (!hit.symbol || found.has(hit.symbol)) continue;
    found.set(hit.symbol, {
      s: hit.symbol,
      n: (hit.companyName ?? "").trim(),
      ex: hit.exchange ?? "",
      mic: hit.mic ?? "",
    });
  }
  return r.data.length;
}

/** Breadth-first, expanding only the prefixes that came back saturated. */
async function crawlLevel(prefixes: string[], depth: number): Promise<string[]> {
  const saturated: string[] = [];

  for (let i = 0; i < prefixes.length; i += CONCURRENCY) {
    const wave = prefixes.slice(i, i + CONCURRENCY);
    const counts = await Promise.all(
      wave.map(async (p) => ({ p, n: await search(p).catch(() => 0) })),
    );
    for (const { p, n } of counts) {
      if (n >= PAGE && depth < MAX_DEPTH) saturated.push(p);
    }
    if (queries % 1000 < CONCURRENCY) {
      process.stdout.write(`  ${queries} queries · ${found.size} symbols\n`);
    }
  }

  return saturated;
}

await getToken();
const t0 = Date.now();

let level = ALPHABET.flatMap((a) => ALPHABET.map((b) => a + b));
console.log(`Crawling adaptively from ${level.length} two-letter prefixes…`);

for (let depth = 2; depth <= MAX_DEPTH && level.length; depth += 1) {
  const saturated = await crawlLevel(level, depth);
  console.log(
    `  depth ${depth}: ${level.length} queried · ${saturated.length} saturated · ${found.size} symbols so far`,
  );
  // A saturated prefix hides symbols beyond the twentieth; ask for its children.
  level = saturated.flatMap((p) => ALPHABET.map((c) => p + c));
}

const all = [...found.values()].sort((a, b) => a.s.localeCompare(b.s));
const byExchange = new Map<string, number>();
for (const e of all) byExchange.set(e.ex, (byExchange.get(e.ex) ?? 0) + 1);
const tradable = all.filter((e) => TRADABLE.has(e.ex));

mkdirSync("lib/market/data", { recursive: true });
writeFileSync(
  OUT,
  JSON.stringify(
    {
      builtAt: new Date().toISOString(),
      queries,
      failures,
      total: all.length,
      tradable: tradable.length,
      entries: all,
    },
    null,
    0,
  ) + "\n",
);

console.log(`\nDone in ${((Date.now() - t0) / 1000).toFixed(0)}s · ${queries} queries · ${failures} failed`);
console.log(`  ${all.length} unique symbols`);
for (const [ex, n] of [...byExchange.entries()].sort((a, b) => b[1] - a[1])) {
  console.log(`    ${(ex || "(blank)").padEnd(8)} ${String(n).padStart(6)}${TRADABLE.has(ex) ? "  ← tradable" : ""}`);
}
console.log(`\n  tradable universe: ${tradable.length} → ${OUT}`);

const CANARIES = ["AAPL", "MSFT", "GOOGL", "GOOG", "AMZN", "NVDA", "META", "TSLA", "V", "MA", "JPM", "BRK.B", "SPY", "QQQ", "IWM", "XLK", "XLF"];
const missing = CANARIES.filter((c) => !found.has(c));
console.log(missing.length ? `  ⚠ MISSING CANARIES: ${missing.join(", ")}` : `  ✓ all ${CANARIES.length} canary symbols present`);
