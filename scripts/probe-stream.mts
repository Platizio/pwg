/* Phase 0: does the live stream actually carry usable equity prices?
 *
 * The transport is already proven — it authenticates, subscribes and pushes
 * ticks stamped at the current second. What is NOT proven is whether the rows
 * that matter arrive with a price on them. A 25s sample taken while the US
 * market was closed carried 18 symbols, all `$`-suffixed index rows, every one
 * of them `"c":0,"v":0` — no close, no volume, and not one equity.
 *
 * That is the difference between a feed worth wiring up and a feed that would
 * put a zero where Apple's price goes. Run this during US market hours
 * (13:30-20:00 UTC while EDT is in force) and read the three verdicts at the
 * bottom.
 *
 *   npm run probe:stream            # 60s
 *   npm run probe:stream -- 180     # longer window
 */

import { env } from "../lib/api/env.ts";
import { toTick } from "../lib/api/stream/tick.ts";

const WINDOW_S = Number(process.argv[2] ?? 60);
const WATCH = ["AAPL", "MSFT", "NVDA", "TSLA", "AMZN", "SPY", "QQQ", "META", "GOOGL"];

const { gateway, apiKey, apiSecret } = env();

const auth = await fetch(`${gateway}/uma/api/v1/auth/b2b/login/api-keys`, {
  method: "POST",
  headers: { "Content-Type": "application/json", Accept: "application/json" },
  body: JSON.stringify({ api_key: apiKey, api_secret: apiSecret }),
});
if (!auth.ok) {
  console.error(`auth failed: HTTP ${auth.status}`);
  process.exit(1);
}
const token = (await auth.json())?.api_keys_login?.tokens?.access_token;
if (!token) {
  console.error("auth returned no access_token");
  process.exit(1);
}

const url = gateway.replace(/^http/, "ws") + "/aes-ws/wsevent";
console.log(`connecting ${url}`);
console.log(`sampling ${WINDOW_S}s\n`);

/* Two subscriptions, deliberately.
 *
 * The app subscribes to the wildcard and filters server-side. That is confirmed
 * working — the gateway answers "Subscribed to all Polygon symbols (wildcard)"
 * — but every wildcard row observed so far has been a `$`-suffixed index with
 * `c: 0`, never an equity. The gateway also accepts a named-symbol
 * subscription ("Subscribed to Polygon symbols"), so if the wildcard turns out
 * to carry indices only, the fix is to subscribe by name instead.
 *
 * With the market shut both return nothing and the two are indistinguishable.
 * Running them side by side during a session settles it in one pass.
 */
const WILDCARD = JSON.stringify({ type: "querypolygonfmv", symbol: "*" });
const NAMED = JSON.stringify({ type: "querypolygonfmv", symbol: WATCH.join(",") });

const ws = new WebSocket(url, { headers: { Authorization: `Bearer ${token}` } } as never);
let namedRows = 0;
const namedSyms = new Set<string>();

let rawRows = 0;
let usable = 0;
let zeroClose = 0;
let stale = 0;
let pings = 0;
const equities = new Set<string>();
const indices = new Set<string>();
const watched = new Map<string, number>();
const ages: number[] = [];
const started = Date.now();

ws.addEventListener("open", () => ws.send(WILDCARD));
ws.addEventListener("error", () => {
  console.error("socket error");
  process.exit(1);
});
ws.addEventListener("message", (e: MessageEvent) => {
  let d: { type?: string; updates?: unknown[] };
  try {
    d = JSON.parse(String(e.data));
  } catch {
    return;
  }
  if (d.type === "ping") {
    pings++;
    ws.send(WILDCARD);
    return;
  }
  if (!Array.isArray(d.updates)) return;

  const now = Date.now();
  for (const raw of d.updates) {
    rawRows++;
    const r = raw as { s?: string; c?: number; t?: number };
    const sym = typeof r.s === "string" ? r.s : "";
    if (sym.includes("$")) indices.add(sym);
    else if (sym) equities.add(sym);

    if (typeof r.c === "number" && r.c === 0) zeroClose++;

    const tick = toTick(r);
    if (!tick) continue;
    usable++;
    const age = (now - tick.at) / 1000;
    ages.push(age);
    if (age > 900) stale++;
    if (WATCH.includes(tick.symbol)) watched.set(tick.symbol, tick.price);
  }
});

/* The named-symbol control, on its own connection so neither can mask the other. */
const ws2 = new WebSocket(url, { headers: { Authorization: `Bearer ${token}` } } as never);
ws2.addEventListener("open", () => ws2.send(NAMED));
ws2.addEventListener("message", (e: MessageEvent) => {
  let d: { type?: string; updates?: unknown[] };
  try {
    d = JSON.parse(String(e.data));
  } catch {
    return;
  }
  if (d.type === "ping") {
    ws2.send(NAMED);
    return;
  }
  if (!Array.isArray(d.updates)) return;
  for (const raw of d.updates) {
    namedRows++;
    const sym = (raw as { s?: string }).s;
    if (sym) namedSyms.add(sym);
  }
});

setTimeout(() => {
  const secs = (Date.now() - started) / 1000;
  const pct = (n: number) => (rawRows ? ((n / rawRows) * 100).toFixed(1) : "0.0");
  ages.sort((a, b) => a - b);

  console.log(`--- ${secs.toFixed(0)}s sample ---`);
  console.log(`rows          ${rawRows}  (${(rawRows / secs).toFixed(1)}/s)`);
  console.log(`usable ticks  ${usable}  (${pct(usable)}%)`);
  console.log(`zero close    ${zeroClose}  (${pct(zeroClose)}%)  <- not a price`);
  console.log(`replays >15m  ${stale}`);
  console.log(`pings         ${pings}`);
  console.log(`equities      ${equities.size}`);
  console.log(`indices ($)   ${indices.size}`);
  if (ages.length) {
    console.log(
      `tick age s    min ${ages[0].toFixed(1)}  median ${ages[Math.floor(ages.length / 2)].toFixed(1)}  max ${ages[ages.length - 1].toFixed(1)}`,
    );
  }
  console.log(`\nwatched names priced: ${watched.size}/${WATCH.length}`);
  for (const [s, p] of watched) console.log(`  ${s.padEnd(6)} ${p}`);

  console.log(`\nnamed-symbol control (${WATCH.join(",")})`);
  console.log(`  rows ${namedRows} | symbols ${[...namedSyms].join(", ") || "none"}`);
  if (equities.size === 0 && namedSyms.size > 0) {
    console.log("  >> The wildcard carries no equities but a named subscription does.");
    console.log("     Fix: subscribe by name in lib/api/stream/upstream.ts instead of '*'.");
  }

  console.log("\nVERDICT");
  const equityOk = equities.size > 0;
  const pricedOk = watched.size > 0;
  const rateOk = usable / secs > 0.1;
  console.log(`  equities present ...... ${equityOk ? "YES" : "NO  <- feed carries no equities"}`);
  console.log(`  household names priced  ${pricedOk ? "YES" : "NO  <- nothing to show on the tape"}`);
  console.log(`  usable tick rate ...... ${rateOk ? "YES" : "NO  <- too sparse to call live"}`);
  console.log(
    `\n  ${equityOk && pricedOk && rateOk ? "GO — wire the tape to the stream." : "NO-GO — keep the REST snapshot; the stream cannot price the page yet."}`,
  );
  process.exit(0);
}, WINDOW_S * 1000);
