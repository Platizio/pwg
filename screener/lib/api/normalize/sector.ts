import { SECTOR_ETF, SECTOR_NAMES, type SectorName } from "../../market/universe.ts";
import type { RawEquityQuote } from "../clients/quotes.ts";
import type { SectorGroup } from "@/lib/market/home";
import type { Quote } from "@/lib/market/session";

/* The sector strip.

   None of the three figures on a card comes from the same place. The day and
   week moves are the SPDR sector funds, which are the only instruments on this
   account that price a whole sector in a single quote. The weight is derived
   here from the sweep, because no constituent-weight endpoint is entitled and
   an invented float weight would read as authoritative while being fiction.

   Members arrive already grouped by the SIC-derived sector map and are ordered
   by the size of the move rather than its direction: the card has room for
   four names, and the four worth showing are the ones that did something. */

/** The eleven SPDR sector funds — the whole strip in one quote call. */
export const SECTOR_ETF_SYMBOLS: string[] = SECTOR_NAMES.map((name) => SECTOR_ETF[name]);

/* A member competes to be shown only if it trades at least this share of what
   the sector's typical member trades. Relative rather than absolute, because a
   sector of three hundred names and a sector of thirty have very different
   typical turnovers and the same rule has to serve both. */
const MEMBER_LIQUIDITY_SHARE = 0.1;

function medianTurnover(members: Quote[]): number {
  const sorted = members
    .map((m) => m.turnoverM ?? 0)
    .filter((t) => t > 0)
    .sort((a, b) => a - b);
  if (sorted.length === 0) return 0;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

/* Weighted by turnover rather than averaged. An unweighted mean lets a name
   trading a few hundred thousand dollars count as heavily as one trading a
   billion, which is how a sector of large caps ends up reporting the move of
   its smallest constituent. */
function weightedMove(members: Quote[]): number {
  let weight = 0;
  let total = 0;
  for (const m of members) {
    const w = m.turnoverM ?? 0;
    if (w <= 0) continue;
    weight += w;
    total += m.chg * w;
  }
  return weight > 0 ? total / weight : 0;
}

export function toSectorGroups(args: {
  etfQuotes: RawEquityQuote[];
  weekByEtf: Map<string, number | null>;
  membersBySector: Map<SectorName, Quote[]>;
}): SectorGroup[] {
  const { etfQuotes, weekByEtf, membersBySector } = args;
  const quoteByEtf = new Map(etfQuotes.map((q) => [q.symbol, q]));

  /* Sorted off a copy: the caller's map is not ours to reorder.

     Members are ranked by how much they moved, but only after the sector's own
     thin names are set aside. The global floor admits anything normally liquid
     enough to be worth quoting, which across an entire sector still leaves
     names trading a few hundred thousand dollars — and those are exactly the
     ones that post the largest percentage moves. Industrials was once
     headlined by a shell company on that basis. */
  const staged = SECTOR_NAMES.map((name) => {
    const all = membersBySector.get(name) ?? [];
    const bar = medianTurnover(all) * MEMBER_LIQUIDITY_SHARE;

    const byMove = (a: Quote, b: Quote) => Math.abs(b.chg) - Math.abs(a.chg);
    const liquid = all.filter((m) => (m.turnoverM ?? 0) >= bar).sort(byMove);
    const thin = all.filter((m) => (m.turnoverM ?? 0) < bar).sort(byMove);

    /* Thin names keep their place in the list — the count and the sector page
       still owe them — they simply do not get to lead the card. */
    const members = [...liquid, ...thin];

    return {
      name,
      etf: SECTOR_ETF[name],
      members,
      turnoverM: all.reduce((sum, m) => sum + (m.turnoverM ?? 0), 0),
      membersChg: weightedMove(all),
    };
  });

  const totalTurnoverM = staged.reduce((sum, s) => sum + s.turnoverM, 0);

  return staged
    .map(({ name, etf, members, turnoverM, membersChg }) => ({
      name,
      // changePercent arrives as a fraction (-0.0149 = -1.49%).
      day: (quoteByEtf.get(etf)?.changePercent ?? 0) * 100,
      week: weekByEtf.get(etf) ?? 0,
      /* Share of the swept universe's dollar volume, not GICS float weight:
         no constituent-weight endpoint exists on this account. */
      weight: totalTurnoverM > 0 ? (turnoverM / totalTurnoverM) * 100 : 0,
      membersChg,
      /* The two figures on a card measure different things, and a reader who
         notices them disagreeing deserves the reason rather than a puzzle. */
      basis: `Move shown is ${SECTOR_ETF[name]}, the sector fund. The names below are the largest movers among the companies this terminal quotes in the sector.`,
      members,
      total: members.length,
    }))
    /* Strongest sector first, as SECTORS was ordered: the interface does the
       ranking, so the reader never sorts this themselves. */
    .sort((a, b) => b.day - a.day);
}
