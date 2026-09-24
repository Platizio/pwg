import type { NextRequest } from "next/server";
import { refusePublic } from "@/lib/api/public-guard";
import { fetchQuotes } from "@/lib/api/clients/quotes";
import { toSweepRow, type SweepRow } from "@/lib/api/sweep";
import { TAGS, TTL } from "@/lib/api/ttl";
import { homeInputsFrom } from "@/lib/market/home-inputs";
import { storeConfigured } from "@/lib/market/store/client";
import { readHomeUntagged } from "@/lib/market/store/reads";
import { NAME_BY_SYMBOL, presentation } from "@/lib/market/universe";
import { parseSymbolParam } from "@/lib/market/watchlists";

/* Prices for a reader's watchlist.

   The sidebar used to show six fixed names, and the layout already had a
   figure for each of them in the tape it renders. A watchlist can hold any
   tradable symbol, and the layout sits above the page where it cannot know
   which ones — the lists live in the reader's browser. So the browser asks
   here, after hydration, for the names it has no figure for, and the live
   feed patches them from then on exactly as it patches the six.

   THE STORE FIRST, the gateway only for what the store has not got. The
   refresh worker writes a quote for every liquid name every five minutes,
   and the layout's own `market_home` read already holds them: that entry is
   cached, so answering from it costs no upstream call at all. What is left —
   a small listing the hot list does not cover — is one gateway call of at
   most fifty symbols, cached by Next's data cache for the sweep's own five
   minutes.

   Anonymous surface, bounded like app/api/search: our own pages only, at a
   human rate, and a symbol the tradable universe does not hold is refused
   here rather than forwarded — otherwise this is an open proxy for the
   gateway credentials. */

/* Deliberately NOT `dynamic = "force-dynamic"`. That is fetchCache
   force-no-store, which would send every miss below straight to the gateway
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

/* The store's rows for the symbols asked about. Null when the store is not
   configured or did not answer — the gateway covers everything then. */
async function fromStore(wanted: readonly string[]): Promise<Map<string, SweepRow> | null> {
  if (!storeConfigured()) return null;
  const home = await readHomeUntagged();
  if (!home.ok) return null;
  const want = new Set(wanted);
  const rows = homeInputsFrom(home.data, [], Date.now()).snapshot.rows;
  const found = new Map<string, SweepRow>();
  for (const row of rows) if (want.has(row.s)) found.set(row.s, row);
  return found;
}

export async function GET(request: NextRequest) {
  const refused = refusePublic(request.headers, {
    route: "quotes-watchlist",
    limit: 30,
    windowMs: 60_000,
  });
  if (refused) return refused;

  const { symbols, refused: notTradable } = parseSymbolParam(
    request.nextUrl.searchParams.get("symbols"),
    (symbol) => NAME_BY_SYMBOL.has(symbol),
  );

  if (symbols.length === 0) {
    return Response.json(
      { quotes: [], refused: notTradable, missing: [] },
      { headers: { "Cache-Control": CACHE } },
    );
  }

  const rows = (await fromStore(symbols)) ?? new Map<string, SweepRow>();

  const gap = symbols.filter((s) => !rows.has(s));
  let gatewayFailed = false;
  if (gap.length > 0) {
    const result = await fetchQuotes(gap, TTL.sweep, [TAGS.quotes]);
    if (result.ok && Array.isArray(result.data)) {
      for (const raw of result.data) {
        const row = toSweepRow(raw);
        if (row && gap.includes(row.s)) rows.set(row.s, row);
      }
    } else {
      gatewayFailed = true;
    }
  }

  const quotes = symbols.flatMap((s) => {
    const row = rows.get(s);
    return row ? [toWatchQuote(row)] : [];
  });
  const missing = symbols.filter((s) => !rows.has(s));

  /* A partial answer is still an answer — the names that priced are shown and
     the rest keep a dash — but it is not one to hold at a shared cache for a
     minute, or a gateway blip would be remembered past its own end. */
  return Response.json(
    { quotes, refused: notTradable, missing },
    { headers: { "Cache-Control": gatewayFailed ? "no-store" : CACHE } },
  );
}
