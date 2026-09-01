import { breadth } from "../../market/screen.ts";
import { INDEX_IDS, INDEX_PROXY, seedOf } from "../../market/universe.ts";
import type { RawEquityQuote } from "../clients/quotes.ts";
import type { IndexView } from "@/lib/market/home";
import type { MarketIndex, Quote } from "@/lib/market/session";
import type { IndexId } from "@/lib/market/universe";

/* Index tabs, assembled from tracking ETFs.

   No index instrument is entitled on this account, so every tab is an ETF quote
   wearing an index's name. The level is therefore the fund's share price — a
   few hundred dollars where the index itself reads thousands of points — and
   the note carries that admission onto the page rather than leaving a reader to
   discover it by comparing against somewhere else.

   Breadth, leaders and laggards come from the members the caller has already
   filtered, not from the ETF, so those three figures are about the index even
   though the headline number is about the fund. */

/** The symbols a sweep must cover for the index strip. */
export const INDEX_ETF_SYMBOLS: string[] = INDEX_IDS.map((id) => INDEX_PROXY[id].etf);

const num = (v: number | null | undefined): number | null =>
  v == null || !Number.isFinite(v) ? null : v;

export function toIndexView(
  id: IndexId,
  etf: RawEquityQuote | undefined,
  sample: { members: Quote[]; size: number; basis: string },
): IndexView | null {
  const members = sample.members;
  if (!etf) return null;

  const proxy = INDEX_PROXY[id];

  /* Without a price there is no tab to draw. The caller degrades this one
     rather than showing an index at zero — and zero is how the gateway says
     "no trade", so it is absence rather than a fund worth nothing. */
  const level = num(etf.lastPrice) ?? num(etf.closingPrice);
  if (level === null || level <= 0) return null;

  const index: MarketIndex = {
    id,
    name: proxy.name,
    short: proxy.short,
    level,
    // A raw quote, so changePercent is still a fraction. SweepRow.chg is not.
    chg: (num(etf.changePercent) ?? 0) * 100,
    seed: seedOf(proxy.etf),
    note: proxy.note,
  };

  return {
    index,
    breadth: breadth(members),
    leaders: [...members].sort((a, b) => b.chg - a.chg).slice(0, 3),
    laggards: [...members].sort((a, b) => a.chg - b.chg).slice(0, 3),
    sample: { size: sample.size, basis: sample.basis },
    proxyTicker: proxy.etf,
  };
}
