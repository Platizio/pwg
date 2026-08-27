/* Trailing-performance builder.

   The sector table shows a one-year return and a five-year compound rate for
   every name in the sector. Both come from one five-year history per symbol,
   which is still a call per name — far too many for a request, and the reason
   this runs offline and commits its answer.

   The gateway's history is already split-adjusted for almost everything, but
   not quite everything, so each symbol's splits are fetched alongside and the
   series is repaired only where it visibly breaks. XLK found the gap the hard
   way — a two-for-one split left it reading minus twenty-nine per cent over a
   year it rose forty — and NVDA found the overcorrection just as fast.

   Run: npm run build:returns */

import { writeFileSync, mkdirSync, existsSync, readFileSync } from "node:fs";
import { runSweep } from "../lib/api/sweep.ts";
import { eligibleRows, typicalDollarVol } from "../lib/market/screen.ts";
import { fetchHistory } from "../lib/api/clients/quotes.ts";
import { fetchCorporateActionsUncached } from "../lib/api/clients/fundamentals.ts";
import { repairSplitBreaks, returnsFrom } from "../lib/api/normalize/returns.ts";
import { getToken } from "../lib/api/token.ts";

const LIMIT = Number(process.env.RETURNS_LIMIT ?? 4000);
const CONCURRENCY = 12;
const OUT = "lib/market/data/returns.json";

type Row = [ret1y: number | null, ret5y: number | null, cagr5y: number | null];
type File = { builtAt: string; covered: number; returns: Record<string, Row> };

/* Resumable: a run of several thousand calls should not start over because a
   token expired at the four-thousandth. */
const prior: File | null = existsSync(OUT)
  ? (JSON.parse(readFileSync(OUT, "utf8")) as File)
  : null;
const returns: Record<string, Row> = prior?.returns ?? {};
const resume = process.env.RETURNS_RESUME === "1";

await getToken();
console.log("Sweeping…");
const snap = await runSweep({ noStore: true });

const targets = eligibleRows(snap)
  .sort((a, b) => typicalDollarVol(b) - typicalDollarVol(a))
  .slice(0, LIMIT)
  .map((r) => r.s)
  .filter((s) => !(resume && returns[s]));

console.log(`Fetching five-year histories for ${targets.length} names…`);

let done = 0;
let failed = 0;
let short = 0;

let splitAdjusted = 0;

async function one(symbol: string): Promise<void> {
  const [r, actions] = await Promise.all([
    fetchHistory(symbol, "5y", 0, [], true),
    fetchCorporateActionsUncached(symbol),
  ]);
  done += 1;
  if (done % 400 === 0) console.log(`  ${done}/${targets.length}`);
  if (!r.ok) {
    failed += 1;
    return;
  }

  const splits = actions.ok ? (actions.data.splits ?? []) : [];
  const series = splits.length ? repairSplitBreaks(r.data, splits) : r.data;
  if (series !== r.data) splitAdjusted += 1;

  const v = returnsFrom(series);
  if (v.ret1y === null && v.cagr5y === null) {
    short += 1;
    return;
  }
  const round = (n: number | null) => (n === null ? null : Math.round(n * 100) / 100);
  returns[symbol] = [round(v.ret1y), round(v.ret5y), round(v.cagr5y)];
}

const t0 = Date.now();
for (let i = 0; i < targets.length; i += CONCURRENCY) {
  await Promise.allSettled(targets.slice(i, i + CONCURRENCY).map(one));
}

mkdirSync("lib/market/data", { recursive: true });
writeFileSync(
  OUT,
  JSON.stringify(
    { builtAt: new Date().toISOString(), covered: Object.keys(returns).length, returns },
    null,
    0,
  ) + "\n",
);

console.log(`\nDone in ${((Date.now() - t0) / 1000).toFixed(0)}s`);
console.log(`  covered ${Object.keys(returns).length} · split-adjusted ${splitAdjusted} · too short ${short} · failed ${failed}`);
