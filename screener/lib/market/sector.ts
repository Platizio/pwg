import "server-only";
import { cache } from "react";

import { runSweep, type SweepRow } from "@/lib/api/sweep";
import { fetchHistory, fetchQuotes } from "@/lib/api/clients/quotes";
import { changeOverSessions } from "@/lib/api/normalize/time";
import { TAGS, TTL } from "@/lib/api/ttl";
import { eligible, typicalDollarVol } from "@/lib/market/screen";
import { isFund, presentation, SECTOR_ETF, SECTOR_NAMES, type SectorName } from "@/lib/market/universe";
import { sectorSlug } from "@/lib/market/session";
import sectorMap from "@/lib/market/data/sector-map.json" with { type: "json" };
import returnsFile from "@/lib/market/data/returns.json" with { type: "json" };

/* One sector, in full.

   The dashboard shows four names per sector; this is the rest. It draws on the
   same sweep the home page does — runSweep is cached at the fetch layer, so a
   reader arriving here from a sector card pays for no additional quotes.

   The trailing-return columns are the exception. A one-year and five-year
   figure is a history call per symbol, which for four hundred names is not
   something a page can do; they are precomputed into returns.json and read
   from there. A name absent from that file shows a dash rather than a zero. */

type SectorMapFile = { sectors: Record<string, string>; logos: Record<string, string> };
type ReturnsFile = {
  builtAt: string;
  returns: Record<string, [number | null, number | null, number | null]>;
};

const MAP = sectorMap as SectorMapFile;

/* The branding URLs the fundamentals endpoint returns point at Polygon's own
   asset host, which answers 401 to anything but a Polygon key — one we do not
   hold, and which the ViewTrade partner token is not accepted in place of.
   Rendering them would fire a failed request per row and still draw nothing.

   The URLs are kept in the sector map because they cost nothing to store and
   the day a key exists this becomes a one-line change. Until then the rows
   carry the monogram the rest of the terminal uses. */
const LOGOS_REACHABLE = false;
const RETURNS = returnsFile as unknown as ReturnsFile;

export type SectorRow = {
  id: string;
  name: string;
  mark: string;
  color: string;
  logo: string | null;
  price: number;
  chg: number;
  /** Dollars. Null when the gateway reported none. */
  mcap: number | null;
  pe: number | null;
  ret1y: number | null;
  /** Compound annual rate, not the cumulative five-year move. */
  cagr5y: number | null;
  turnoverM: number;
  covered: boolean;
};

export type SectorSnapshot = {
  name: SectorName;
  slug: string;
  fund: string;
  day: number;
  week: number | null;
  stocks: SectorRow[];
  funds: SectorRow[];
  up: number;
  down: number;
  /** True when the sweep produced nothing and the page has no rows to show. */
  down_: boolean;
  returnsBuiltAt: string;
  delayed: boolean;
};

function toRow(r: SweepRow): SectorRow {
  const look = presentation(r.s, r.name);
  const trailing = RETURNS.returns[r.s];
  return {
    id: r.s,
    name: look.name,
    mark: look.mark,
    color: look.color,
    logo: LOGOS_REACHABLE ? (MAP.logos[r.s] ?? null) : null,
    price: r.px,
    chg: r.chg,
    mcap: r.mcap,
    pe: r.pe !== null && r.pe > 0 ? r.pe : null,
    ret1y: trailing?.[0] ?? null,
    cagr5y: trailing?.[2] ?? null,
    turnoverM: r.dollarVol / 1e6,
    covered: look.covered,
  };
}

/* Funds carry no SIC code and so no sector, which is correct — a fund has no
   business of its own to classify. The exchange-traded funds that belong on a
   sector page are the ones that track it, and the only honest way to find them
   without a classification is by name. The tracking fund itself is pinned
   first because it is the one the sector card's headline figure comes from. */
const FUND_KEYWORDS: Record<SectorName, RegExp> = {
  "Information technology": /\b(TECH|TECHNOLOGY|SEMICONDUCTOR|SOFTWARE|CLOUD|CYBER)\b/i,
  "Communication services": /\b(COMMUNICATION|MEDIA|TELECOM|INTERNET|SOCIAL)\b/i,
  Energy: /\b(ENERGY|OIL|GAS|PETROLEUM|DRILL)\b/i,
  "Consumer discretionary": /\b(CONSUMER DISCRETIONARY|RETAIL|LEISURE|AUTO)\b/i,
  Industrials: /\b(INDUSTRIAL|AEROSPACE|DEFENSE|TRANSPORT|INFRASTRUCTURE)\b/i,
  Financials: /\b(FINANCIAL|BANK|INSURANCE|BROKER)\b/i,
  Materials: /\b(MATERIAL|MINING|GOLD|SILVER|COPPER|STEEL|CHEMICAL)\b/i,
  "Health care": /\b(HEALTH|BIOTECH|PHARMA|MEDICAL|GENOMIC)\b/i,
  "Consumer staples": /\b(CONSUMER STAPLES|FOOD|BEVERAGE|AGRICULTURE)\b/i,
  Utilities: /\b(UTILITIES|UTILITY|POWER|ELECTRIC)\b/i,
  "Real estate": /\b(REAL ESTATE|REIT|PROPERTY|HOUSING)\b/i,
};

export const getSectorSnapshot = cache(
  async (slug: string): Promise<SectorSnapshot | null> => {
    const name = SECTOR_NAMES.find((n) => sectorSlug(n) === slug);
    if (!name) return null;

    const fund = SECTOR_ETF[name];

    const [sweepSettled, fundSettled, weekSettled] = await Promise.allSettled([
      runSweep(),
      fetchQuotes([fund], TTL.sectorEtf, [TAGS.sectors]),
      fetchHistory(fund, "1m", TTL.history1m, [TAGS.history]),
    ]);

    const swept = sweepSettled.status === "fulfilled" ? sweepSettled.value : null;
    const rows = swept?.rows.filter(eligible) ?? [];

    const mine = rows.filter((r) => MAP.sectors[r.s] === name);
    const stocks = mine
      .filter((r) => !isFund(r.name))
      .sort((a, b) => typicalDollarVol(b) - typicalDollarVol(a))
      .map(toRow);

    const pattern = FUND_KEYWORDS[name];
    const funds = rows
      .filter((r) => isFund(r.name) && (r.s === fund || pattern.test(r.name)))
      .sort((a, b) => (a.s === fund ? -1 : b.s === fund ? 1 : typicalDollarVol(b) - typicalDollarVol(a)))
      .map(toRow);

    const fundQuote =
      fundSettled.status === "fulfilled" && fundSettled.value.ok
        ? fundSettled.value.data[0]
        : undefined;

    const week =
      weekSettled.status === "fulfilled" && weekSettled.value.ok
        ? changeOverSessions(weekSettled.value.data, 5)
        : null;

    const up = stocks.filter((r) => r.chg > 0).length;
    const down = stocks.filter((r) => r.chg < 0).length;

    return {
      name,
      slug,
      fund,
      // A raw quote, so changePercent is still a fraction.
      day: (fundQuote?.changePercent ?? 0) * 100,
      week,
      stocks,
      funds,
      up,
      down,
      down_: stocks.length === 0 && funds.length === 0,
      returnsBuiltAt: RETURNS.builtAt,
      delayed: Boolean(fundQuote?.delayed) || stocks.some(() => true),
    };
  },
);
