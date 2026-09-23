import type { NextRequest } from "next/server";
import { refusePublic } from "@/lib/api/public-guard";
import { readSections } from "@/lib/market/store/reads";
import { fromStored } from "@/lib/market/store/sections";
import { repairAgainst, splitRecord } from "@/lib/market/split-record";
import { SESSIONS_KEPT, lastSession, type IntradayColumns } from "@/lib/market/intraday-buckets";
import { parseFetchedRange } from "@/lib/market/ranges";

/* One chart range, fetched when the reader asks for it.
 *
 * WHY THIS ROUTE EXISTS. The instrument page used to ship every range at once:
 * the company's five years of daily bars and the benchmark's, 2,549 of them,
 * 234KB of a 438KB payload, on every click. On a 512MB instance each of those
 * renders held forty to sixty megabytes and did not give it back — a fresh box
 * measured 81MB, then 200, then 212, and the next render returned 502. After
 * that every never-prerendered stock hung for as long as anyone waited, which
 * is what a reader experiences as clicking a gainer and nothing happening.
 *
 * So the page ships the range it OPENS with and this answers for the rest.
 *
 * It reads the store and never the gateway. Every series here is one the
 * refresher has already fetched and stored, so an anonymous caller cannot make
 * this spend a gateway call — the licensing reason app/api/search/route.ts
 * states applies just as much to a route that names a symbol.
 */

/* The longest listed US ticker is nine characters across the symbol master's
   33,440 rows; the class is the master's own, `$` included for the index
   instruments. Both borrowed from app/api/intraday/[ticker]/route.ts, which is
   this route's closest sibling. */
const MAX_SYMBOL = 16;
const SYMBOL = /^[A-Z0-9.$+_-]+$/;

const CACHE = "public, max-age=60, stale-while-revalidate=300";

/** The symbol, uppercased, or null if it is not one. */
function parseSymbol(raw: string): string | null {
  let decoded: string;
  try {
    decoded = decodeURIComponent(raw ?? "");
  } catch {
    /* A stray `%` makes decodeURIComponent throw URIError, which reaches the
       client as a 500 — a defect this route's two siblings still have. A
       malformed path is a 400 about the request, not a fault in the server. */
    return null;
  }
  const symbol = decoded.trim().toUpperCase();
  if (!symbol || symbol.length > MAX_SYMBOL || !SYMBOL.test(symbol)) return null;
  return symbol;
}

const EMPTY: IntradayColumns = {
  date: [],
  price: [],
  opening: [],
  high: [],
  low: [],
  volume: [],
};

export async function GET(
  request: NextRequest,
  /* Spelled out rather than taken from the generated RouteContext helper, for
     the reason app/api/intraday/[ticker]/route.ts gives at length: that helper
     is generated from the route list and a route added since the last typegen
     is not in it. `next build` checks this signature; `tsc --noEmit` does not. */
  context: { params: Promise<{ ticker: string }> },
) {
  /* Reads the store rather than the gateway, so this costs us nothing upstream
     — but it serves licensed prices, and a public URL that hands them out
     without limit is the licence problem rather than the cost one. */
  const refused = refusePublic(request.headers, {
    route: "history",
    limit: 60,
    windowMs: 60_000,
  });
  if (refused) return refused;

  const { ticker } = await context.params;
  const symbol = parseSymbol(ticker);
  const range = parseFetchedRange(new URL(request.url).searchParams.get("range"));

  if (!symbol || !range) {
    return Response.json(
      { range: null, series: EMPTY },
      { status: 400, headers: { "Cache-Control": CACHE } },
    );
  }

  const section = range === "5Y" ? "history_daily" : "history_intraday";
  const rows = await readSections([symbol], section).catch(() => null);

  /* An empty series is a 200, not an error, and the distinction matters to the
     reader rather than to the protocol. A symbol whose intraday has not been
     captured yet, or a store that is briefly unreachable, both mean "there is
     nothing to draw for this range" — which the chart already knows how to
     say. A 500 would make the client retry something that will not change for
     hours. */
  if (!rows?.ok) {
    return Response.json({ range, series: EMPTY }, { headers: { "Cache-Control": CACHE } });
  }

  const payload = rows.data.find((r) => r.symbol === symbol)?.payload ?? null;

  if (range === "5Y") {
    /* REPAIRED for splits, the same way the page's own series is
       (lib/market/instrument.ts repairs at read time). The store keeps the
       feed's bars as they came, and those carry a cliff at every split — a
       Netflix 10-for-1 reads as a 90% crash. This series now feeds the
       Performance tab's five-year figures as well as the 5Y chart, so an
       unrepaired one would put that cliff into every return and drawdown.
       When the corporate-actions record cannot be read, splitRecord says so
       and the bars pass through unchanged, exactly as they do on the page. */
    const [daily, actionsRows] = await Promise.all([
      Promise.resolve(fromStored("history_daily", payload)),
      readSections([symbol], "corporate_actions").catch(() => null),
    ]);
    const actionsPayload = actionsRows?.ok
      ? (actionsRows.data.find((r) => r.symbol === symbol)?.payload ?? null)
      : null;
    const actions = actionsPayload ? fromStored("corporate_actions", actionsPayload) : null;
    const repaired = daily ? repairAgainst(daily, splitRecord(actions)) : [];
    return Response.json(
      { range, series: repaired },
      { headers: { "Cache-Control": CACHE } },
    );
  }

  const intraday = fromStored("history_intraday", payload) ?? EMPTY;
  return Response.json(
    {
      range,
      /* 1W is every stored session; 1D is only the newest of them. */
      series: range === "1D" ? lastSession(intraday) : intraday,
      sessions: SESSIONS_KEPT,
    },
    { headers: { "Cache-Control": CACHE } },
  );
}
