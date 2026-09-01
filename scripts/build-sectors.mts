/* Sector-map builder.

   No GICS field is entitled on this account, so sector comes from each
   symbol's SEC SIC code via lib/api/sic-sector.ts. That is one fundamentals
   call per symbol — far too slow for a request — so it runs here, offline,
   and the result is committed.

   Funds are skipped rather than classified. An ETF has no SIC code and no
   business of its own to classify, so asking about one is a wasted call and a
   spurious entry in the unmapped list. Roughly a third of the eligible
   universe is funds, which is a third of the runtime saved.

   Run: npm run build:sectors */

import { writeFileSync, mkdirSync } from "node:fs";
import { runSweep } from "../lib/api/sweep.ts";
import { eligibleRows, typicalDollarVol } from "../lib/market/screen.ts";
import { fetchFundamentalsUncached } from "../lib/api/clients/fundamentals.ts";
import { sectorForSic } from "../lib/api/sic-sector.ts";
import { isFund } from "../lib/market/universe.ts";
import { getToken } from "../lib/api/token.ts";

const LIMIT = Number(process.env.SECTOR_LIMIT ?? 4000);
const CONCURRENCY = 12;
const OUT = "lib/market/data/sector-map.json";

await getToken();
console.log("Sweeping to find the operating universe…");
const snap = await runSweep({ noStore: true });

const targets = eligibleRows(snap)
  .filter((r) => !isFund(r.name))
  .sort((a, b) => typicalDollarVol(b) - typicalDollarVol(a))
  .slice(0, LIMIT);

console.log(`Classifying ${targets.length} operating companies by SIC…`);

const sectors: Record<string, string> = {};
const logos: Record<string, string> = {};
const unmapped = new Map<string, { count: number; description: string; examples: string[] }>();
let noSic = 0;
let failed = 0;
let done = 0;

async function classify(sym: string): Promise<void> {
  const r = await fetchFundamentalsUncached(sym);
  done += 1;
  if (done % 400 === 0) console.log(`  ${done}/${targets.length}`);
  if (!r.ok) {
    failed += 1;
    return;
  }

  const logo = r.data.ticker?.branding?.logo_url;
  if (logo) logos[sym] = logo;

  const sic = r.data.ticker?.sic_code ?? null;
  const sector = sectorForSic(sic, sym);
  if (sector) {
    sectors[sym] = sector;
    return;
  }
  if (!sic) {
    noSic += 1;
    return;
  }
  const entry = unmapped.get(sic) ?? {
    count: 0,
    description: r.data.ticker?.sic_description ?? "",
    examples: [],
  };
  entry.count += 1;
  if (entry.examples.length < 3) entry.examples.push(sym);
  unmapped.set(sic, entry);
}

const t0 = Date.now();
for (let i = 0; i < targets.length; i += CONCURRENCY) {
  await Promise.allSettled(targets.slice(i, i + CONCURRENCY).map((r) => classify(r.s)));
}

const counts = new Map<string, number>();
for (const v of Object.values(sectors)) counts.set(v, (counts.get(v) ?? 0) + 1);

mkdirSync("lib/market/data", { recursive: true });
writeFileSync(
  OUT,
  JSON.stringify(
    {
      builtAt: new Date().toISOString(),
      considered: targets.length,
      classified: Object.keys(sectors).length,
      sectors,
      logos,
    },
    null,
    0,
  ) + "\n",
);

const pct = ((Object.keys(sectors).length / targets.length) * 100).toFixed(1);
console.log(`\nDone in ${((Date.now() - t0) / 1000).toFixed(0)}s`);
console.log(`  classified ${Object.keys(sectors).length}/${targets.length} (${pct}%) · ${logos ? Object.keys(logos).length : 0} logos`);
console.log(`  no SIC code returned: ${noSic} · fetch failed: ${failed}`);

/* The gaps, loudest first — this is the list that tells you which ranges are
   worth adding to sic-sector.ts. */
const gaps = [...unmapped.entries()].sort((a, b) => b[1].count - a[1].count).slice(0, 25);
if (gaps.length) {
  console.log(`\n  unmapped SIC codes (${unmapped.size} distinct):`);
  for (const [sic, g] of gaps) {
    console.log(`    ${sic}  x${String(g.count).padStart(3)}  ${g.description.slice(0, 46).padEnd(48)} ${g.examples.join(",")}`);
  }
}

console.log("\n  per sector:");
for (const [k, v] of [...counts.entries()].sort((a, b) => b[1] - a[1])) {
  console.log(`    ${k.padEnd(24)} ${String(v).padStart(4)}`);
}
