/* Cold-start baseline builder.

   Runs one real sweep and commits the most liquid slice of it, so the first
   request after a deploy renders something true instead of waiting five
   seconds for the market. Everything drawn from it is flagged stale and dated.

   Run: npm run build:baseline */

import { writeFileSync, mkdirSync } from "node:fs";
import { runSweep } from "../lib/api/sweep.ts";
import { eligibleRows, typicalDollarVol } from "../lib/market/screen.ts";
import { getToken } from "../lib/api/token.ts";

const LIMIT = Number(process.env.BASELINE_LIMIT ?? 3000);
const OUT = "lib/market/data/baseline.json";

await getToken();
console.log("Sweeping…");
const snap = await runSweep({ noStore: true });

/* Only the eligible names, and only as many as a cold render can want: the
   boards draw from the top of this list and the sector cards from its middle. */
const rows = eligibleRows(snap)
  .sort((a, b) => typicalDollarVol(b) - typicalDollarVol(a))
  .slice(0, LIMIT);

mkdirSync("lib/market/data", { recursive: true });
writeFileSync(
  OUT,
  JSON.stringify({ builtAt: new Date().toISOString(), sweptAt: snap.sweptAt, rows }, null, 0) + "\n",
);

const bytes = JSON.stringify(rows).length;
console.log(`  swept ${snap.rows.length}, eligible ${eligibleRows(snap).length}`);
console.log(`  wrote ${rows.length} rows (~${(bytes / 1024 / 1024).toFixed(2)} MB) -> ${OUT}`);
