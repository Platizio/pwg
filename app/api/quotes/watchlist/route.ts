import { refusePublic } from "@/lib/api/public-guard";
import { fetchQuotes } from "@/lib/api/clients/quotes";
import { toSweepRow, type SweepRow } from "@/lib/api/sweep";
import { TAGS, TTL } from "@/lib/api/ttl";
import { homeInputsFrom } from "@/lib/market/home-inputs";
import { storeConfigured } from "@/lib/market/store/client";
import { readHomeUntagged } from "@/lib/market/store/reads";
import { NAME_BY_SYMBOL, presentation } from "@/lib/market/universe";
import { parseSymbolParam } from "@/lib/market/watchlists";
import { createWatchQuotes, serverTiming } from "./answer.ts";

/* Prices for a reader's watchlist.

   The sidebar used to show six fixed names, and the layout already had a
   figure for each of them in the tape it renders. A watchlist can hold any
   tradable symbol, and the layout sits above the page where it cannot know
   which ones — the lists live in the reader's browser. So the browser asks
   here, after hydration, for the names it has no figure for, and the live
   feed patches them from then on exactly as it patches the six.

   THE STORE FIRST, the gateway only for what the store has not got, and
   neither allowed to hold the answer: see answer.ts for the budget, the
   caches and the measurements behind them. The store here is the layout's own
   `market_home` entry — the same quotes the tape and the boards show — read
   into this process once a minute rather than parsed again on every request.

   Anonymous surface, bounded like app/api/search: our own pages only, at a
   human rate, and a symbol the tradable universe does not hold is refused
   here rather than forwarded — otherwise this is an open proxy for the
   gateway credentials. */

/* Deliberately NOT `dynamic = "force-dynamic"`. That is fetchCache
   force-no-store, which would send every gateway call below straight upstream
   and ignore the five-minute revalidate on it. Reading the request already
   makes this handler run per request; the data cache still applies. */

/* Thirty seconds in the browser, a minute at any shared cache. The live feed
   carries every change after the first answer, so this only has to be recent
   enough to start from. */
const CACHE = "public, max-age=30, s-maxage=60, stale-while-revalidate=300";

type WatchQuote = {
  id: string;
  name: string;
  mark: string;
  color: string;
  price: number;
  /** Day change, percent. Null when the feed priced the name but sent no change. */
  chg: number | null;
  asOf: number | null;
};

function toWatchQuote(row: SweepRow): WatchQuote {
  const look = presentation(row.s, row.name);
  return {
    id: row.s,
    name: look.name,
    mark: look.mark,
    color: look.color,
    price: row.px,
    chg: row.chgKnown ? row.chg : null,
    asOf: row.asOf,
  };
}

/* One engine for the process: the store index, the answers and the flights
   it holds are the point of it. */
const quotes = createWatchQuotes<SweepRow>({
  /* The hot rows the layout already reads, by symbol. Null when the store is
     not configured or did not answer — the gateway covers everything then. */
  async loadIndex() {
    if (!storeConfigured()) return null;
    const home = await readHomeUntagged();
    if (!home.ok) return null;
    const index = new Map<string, SweepRow>();
    for (const row of homeInputsFrom(home.data, [], Date.now()).snapshot.rows) index.set(row.s, row);
    return index;
  },
  /* One call of at most fifty symbols (parseSymbolParam caps the list), held
     by Next's data cache for the sweep's five minutes. The list arrives
     sorted, so the same names in any order are one cache entry. A symbol the
     gateway does not price is left out of the map, which reads as "no quote". */
  async fetchGap(symbols) {
    const result = await fetchQuotes(symbols, TTL.sweep, [TAGS.quotes]);
    if (!result.ok || !Array.isArray(result.data)) return null;
    const asked = new Set(symbols);
    const rows = new Map<string, SweepRow>();
    for (const raw of result.data) {
      const row = toSweepRow(raw);
      if (row && asked.has(row.s)) rows.set(row.s, row);
    }
    return rows;
  },
});

export async function GET(request: Request) {
  const started = Date.now();
  const refused = refusePublic(request.headers, {
    route: "quotes-watchlist",
    limit: 30,
    windowMs: 60_000,
  });
  if (refused) return refused;

  const { symbols, refused: notTradable } = parseSymbolParam(
    new URL(request.url).searchParams.get("symbols"),
    (symbol) => NAME_BY_SYMBOL.has(symbol),
  );

  if (symbols.length === 0) {
    return Response.json(
      { quotes: [], refused: notTradable, missing: [], pending: [] },
      { headers: { "Cache-Control": CACHE } },
    );
  }

  const answer = await quotes.answer(symbols);
  const totalMs = Date.now() - started;
  const partial = answer.pending.length > 0;

  /* `missing`: an upstream answered that it has no quote — worth
     remembering. `pending`: nothing answered in time, or the call failed —
     worth asking again. The flight this request started is not cancelled:
     it lands in this process's answer cache (thirty seconds) and the gateway
     call in Next's data cache (five minutes), so the retry is answered from
     memory. */
  const body = {
    quotes: answer.rows.map(toWatchQuote),
    refused: notTradable,
    missing: answer.missing,
    pending: answer.pending,
  };

  const headers: Record<string, string> = {
    /* A partial answer is still an answer — the names that priced are shown
       and the rest keep a dash — but it is not one to hold at any cache, or
       an upstream blip would be remembered past its own end. */
    "Cache-Control": partial ? "no-store" : CACHE,
    "Server-Timing": serverTiming(answer, totalMs),
  };

  if (partial) {
    console.warn(
      `quotes-watchlist: partial answer ms=${totalMs} priced=${answer.rows.length} ` +
        `pending=${answer.pending.length} store=${answer.storeMs ?? "-"}ms ` +
        `gateway=${answer.gatewayMs ?? "-"}ms asked=${answer.gatewaySymbols}`,
    );
  }

  /* Nothing priced and something still owed: 503, so the browser treats it as
     a failed request and asks again in a minute, rather than remembering
     every name as quoteless for five. */
  if (partial && answer.rows.length === 0) {
    headers["Retry-After"] = "5";
    return Response.json(body, { status: 503, headers });
  }

  return Response.json(body, { headers });
}
