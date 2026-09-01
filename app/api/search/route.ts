import type { NextRequest } from "next/server";
import { searchSymbols } from "@/lib/api/clients/quotes";
import { TAGS, TTL } from "@/lib/api/ttl";

/* Remote symbol search.

   The page ships a local index of the most liquid names, which answers almost
   every query without a round trip and keeps the combobox instant. It cannot
   hold all thirteen thousand listings, though: at roughly two hundred bytes a
   row that would be a two-megabyte document for a feature most readers never
   use. This route is the tail — the combobox calls it only when the local
   index has nothing, so a reader looking for a small listing still finds it. */

/* A ticker is at most five characters and a company name a caller would type is
   not long either. Anything past this is not a search, and forwarding it spends
   our gateway quota on someone else's fuzzing. lib/site-api/quotes.ts bounds its
   own anonymous surface the same way, and says why: without it "a public URL
   turns into an open proxy for our ViewTrade credentials". */
const MAX_QUERY = 32;

/* Repeats are absorbed at the edge rather than at the gateway. Next's data
   cache inside vtGet is keyed on the upstream URL, which the caller controls —
   so distinct queries miss it by design and only a response cache bounds the
   fan-out. Short, because the symbol list is not static. */
const CACHE = "public, s-maxage=300, stale-while-revalidate=3600";

export async function GET(request: NextRequest) {
  const criteria = request.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (criteria.length < 2 || criteria.length > MAX_QUERY) {
    return Response.json({ results: [] }, { headers: { "Cache-Control": CACHE } });
  }

  const r = await searchSymbols(criteria, TTL.search, [TAGS.quotes]);
  if (!r.ok) {
    /* The upstream's own words are not for an anonymous caller — they can name
       hosts and quota state. The status is the whole message. */
    return Response.json({ results: [], error: "Search is unavailable." }, { status: 502 });
  }

  /* Only what the combobox draws, and only tradable listings — OTC and index
     instruments are not things this terminal can show a page for. */
  const results = r.data
    .filter((hit) => ["NSDQ", "NYSE", "AMEX"].includes(hit.exchange ?? ""))
    .slice(0, 8)
    .map((hit) => ({ id: hit.symbol, name: hit.companyName ?? hit.symbol }));

  return Response.json({ results }, { headers: { "Cache-Control": CACHE } });
}
