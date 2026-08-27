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

export async function GET(request: NextRequest) {
  const criteria = request.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (criteria.length < 2) return Response.json({ results: [] });

  const r = await searchSymbols(criteria, TTL.search, [TAGS.quotes]);
  if (!r.ok) return Response.json({ results: [], error: r.error }, { status: 502 });

  /* Only what the combobox draws, and only tradable listings — OTC and index
     instruments are not things this terminal can show a page for. */
  const results = r.data
    .filter((hit) => ["NSDQ", "NYSE", "AMEX"].includes(hit.exchange ?? ""))
    .slice(0, 8)
    .map((hit) => ({ id: hit.symbol, name: hit.companyName ?? hit.symbol }));

  return Response.json({ results });
}
