import type { NextRequest } from "next/server";
import { getFundamentals, getStockArticles } from "@/lib/api/cache-layer";
import type { RawTickerNews } from "@/lib/api/clients/fundamentals";
import { toStockNews } from "@/lib/api/normalize/stock-news";
import { toWireItems } from "@/lib/api/normalize/wire";
import { storeConfigured } from "@/lib/market/store/client";
/* A static import, where lib/market/instrument.ts has to defer this module
   behind an `await import`. That file is loaded by `node --test` and by the
   refresh worker, and next/cache does not resolve outside a Next render; a
   route handler is Next's own process by definition, so the constraint simply
   does not apply here. */
import { readSections } from "@/lib/market/store/reads";
import { fromStored } from "@/lib/market/store/sections";
import { presentation } from "@/lib/market/universe";

/* The wider news pool, off the render path.

   This is the same move app/api/intraday/[ticker]/route.ts made, for the same
   reason and one order of magnitude louder. Measured on the production build
   against a filled store, the instrument page's remaining third-party call —
   `getStockArticles` against newsapi.ai — cost a cold page 1 to 1.5 seconds,
   against 0.23-0.34s for the market_instrument RPC that fetches everything
   else the page draws. It was the single largest thing left in the render.

   WHAT STAYS BEHIND. The gateway bundles three articles per ticker inside its
   fundamentals aggregate, and the store keeps them in their own `news_gateway`
   section, so those cost nothing extra and are still assembled into the
   snapshot. A cold page therefore renders a newswire immediately and this
   route makes it richer a moment later; the rail never goes from something to
   nothing. See components/terminal/use-stock-news.ts for the client half.

   WHY THE WHOLE LIST AND NOT JUST THE NEW HALF. toStockNews ranks both feeds
   as one list and then runs the hygiene passes over the union — dedupe by
   headline, cap per publisher, take the best three — and all of that is
   order-dependent on the union being ranked first. Handing the browser only
   the newsapi.ai half would make it redo that merge in the rail with a
   different set of inputs, which is how the two copies would drift. So this
   returns exactly what the assembler would have returned had the wider pool
   been awaited, and the rail swaps its whole list for it.

   Anonymous surface, so it is bounded like app/api/search/route.ts and the
   intraday route beside it: the symbol is validated here rather than
   forwarded. */

/* Thirty minutes, matching TTL.newsArticles. The upstream pool behind this is
   cached for a DAY (TTL.stockNews) because it bills a non-renewable lifetime
   allowance, so nothing is gained by asking more often than that — but the
   gateway half turns over on its own six-hour cadence and is free, and half an
   hour lets a fresh headline reach the rail without waiting for the day to
   roll. The long stale-while-revalidate is the cheap half of the same trade:
   an edge that has an answer should serve it while it refreshes, because the
   thing it is refreshing usually has not changed. */
const CACHE = "public, s-maxage=1800, stale-while-revalidate=86400";

/* The same bounds the intraday route uses, and for the same reason: sixteen
   characters is market.symbols' own cap (migration:51) and the character class
   is the symbol master's own. See that file for the full reasoning. */
const MAX_SYMBOL = 16;
const SYMBOL = /^[A-Z0-9.$+_-]+$/;

/* Both numbers are the assembler's. They are literals at its call site rather
   than exported constants, so they are repeated here and named instead: the
   rail shows three, and the gateway pool is read eight deep. Change one and
   change the other — a route that ranked a different depth than the page would
   hand the browser a list the page would not have drawn, and the swap would
   stop being an improvement and start being a difference.

   GATEWAY_POOL does not bind here and is not meant to. toWireItems takes at
   most MAX_PER_TICKER = 3 from any one ticker, and there is exactly one ticker
   in the list below, so three is the ceiling whatever this says. It is 8
   because the assembler passes 8, and matching it is the point: raising this
   alone would change nothing, and that is precisely the property that makes it
   safe to keep the two in step by copying the literal. */
const GATEWAY_POOL = 8;
const RAIL = 3;

/**
 * The gateway's own headlines for this symbol, or null if we cannot confirm
 * the symbol is a company at all.
 *
 * The null is load-bearing and it is not the same as `[]`. A stored section
 * row or a fundamentals document is evidence that this string names a listed
 * company; an empty list from either is a real answer about a quiet one. Null
 * means neither source would say, and the caller below refuses to spend the
 * news allowance on it — see the note there.
 *
 * Store first, exactly as lib/market/instrument.ts reads it, and for the same
 * reason: on the fast path the section is already in Postgres beside the
 * record the page was drawn from, so this is one indexed read rather than a
 * gateway round trip. A miss falls through to the six-hour cached fundamentals
 * document, which is the same call the gateway path already makes.
 */
async function gatewayNewsFor(symbol: string): Promise<RawTickerNews[] | null> {
  /* Guarded rather than attempted, as markVisited is in instrument.ts: a dev
     machine or a CI run with no Supabase should not open a socket per request
     to be told what it already knows. */
  if (storeConfigured()) {
    const rows = await readSections([symbol], "news_gateway").catch(() => null);
    if (rows?.ok) {
      const row = rows.data.find((r) => r.symbol === symbol);
      /* A row that exists but whose payload will not read back is still
         evidence the symbol is enrolled, so it answers `[]` rather than null:
         the wider pool is worth asking for either way. */
      if (row) return fromStored("news_gateway", row.payload) ?? [];
    }
  }

  const fundamentals = await getFundamentals(symbol).catch(() => null);
  if (!fundamentals?.ok) return null;

  /* `ok` is NOT confirmation on its own. vtGet sets it on any 2xx, and this
     gateway signals "no such symbol" inside the body rather than by status —
     lib/api/clients/quotes.ts models exactly that with its `notFound` flag on
     a 200. A fundamentals aggregate for a string the provider does not know
     comes back 200 with a null-filled shape, and `ticker_news ?? []` would
     then read as "a real company that is having a quiet fortnight" and spend a
     request on it. `ticker` is the reference document — name, exchange, SIC,
     market cap — and only a symbol the provider actually catalogues has one.
     A non-empty news list is confirmation in its own right: the provider does
     not attach articles to a string it cannot resolve. */
  const doc = fundamentals.data.ticker;
  const news = fundamentals.data.ticker_news ?? [];
  if (!doc && news.length === 0) return null;
  return news;
}

export async function GET(
  _request: NextRequest,
  /* `params` is a PROMISE in this version — see the long note in
     app/api/intraday/[ticker]/route.ts for which tool actually enforces that
     shape, and why it is spelled out here instead of taken from the generated
     `RouteContext` helper. */
  context: { params: Promise<{ ticker: string }> },
) {
  const { ticker } = await context.params;
  const symbol = decodeURIComponent(ticker ?? "")
    .trim()
    .toUpperCase();

  if (!symbol || symbol.length > MAX_SYMBOL || !SYMBOL.test(symbol)) {
    /* 400, because the path segment is the thing that is wrong. No note to go
       with it: the rail has no sentence for "that is not a symbol" and does
       not need one — nothing a reader can reach asks this, because the hook
       only ever asks about the symbol the page it is mounted on was drawn
       for. */
    return Response.json({ news: [] }, { status: 400, headers: { "Cache-Control": CACHE } });
  }

  const now = Date.now();
  const gateway = await gatewayNewsFor(symbol);

  /* THE ORDER HERE IS THE BUDGET GUARD, not an accident of style.
   *
   * newsapi.ai bills a hard LIFETIME allowance of 2,000 requests that does not
   * renew — lib/api/clients/news.ts treats it as a ledger for exactly that
   * reason. This route is public and takes a symbol from the URL, so asking
   * the provider before anything has confirmed the symbol would turn a walk
   * through sixteen-character strings into a permanent, unrecoverable loss.
   * The 24-hour cache does not help: every distinct string is a fresh key.
   *
   * So the free, quota-bounded sources answer first, and the paid one is only
   * asked about a symbol one of them has RECOGNISED — a stored section row, or
   * a fundamentals document that actually carries a company in it. Read
   * gatewayNewsFor above for why the second of those needs a field and not
   * just a status code; that distinction is the whole guard, and an `ok` alone
   * would have let every invented string through. Serialising the two costs
   * one indexed store read on the fast path, which is nothing beside the
   * second it saves the page, and this is off the render path anyway.
   *
   * What that does NOT bound, and cannot, is a walk through the 13,797 REAL
   * symbols — each one is recognised, and each is a distinct 24-hour cache
   * key. That exposure is unchanged by this route: the page itself spent an
   * allowance per symbol visited before it existed, because getStockArticles
   * rode the same allSettled as the quote. The floor in
   * lib/api/clients/news.ts is what actually bounds that one — below 100
   * remaining the client declines to spend and the rail quietly falls back to
   * the gateway half, which is the same thing it shows here when the provider
   * is dead. What the ordering buys is the unbounded half: the strings that
   * are not symbols at all.
   */
  const articles =
    gateway === null
      ? null
      : await getStockArticles(presentation(symbol).name, symbol).catch(() => null);

  /* Never throws, whatever either half did. An exhausted allowance, a dead
     provider, a store that has stopped answering and a symbol the gateway has
     never heard of all arrive here as an empty or shorter list, and the rail
     keeps whatever the page already rendered. The upstream's own words are not
     for an anonymous caller — they can name hosts and quota state — and they
     are already in our logs. */
  const gatewayItems = toWireItems(
    gateway !== null && gateway.length > 0 ? [{ ticker: symbol, news: gateway }] : [],
    now,
    GATEWAY_POOL,
  );

  return Response.json(
    { news: toStockNews(gatewayItems, articles?.ok ? articles.data : [], symbol, now, RAIL) },
    { headers: { "Cache-Control": CACHE } },
  );
}
