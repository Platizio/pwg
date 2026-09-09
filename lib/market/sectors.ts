/* The sector vocabulary — names, types and the eleven SPDR funds.
 *
 * This lives apart from universe.ts for one reason, and it is a big one.
 *
 * universe.ts opens with `import master from "./data/symbol-master.json"`, and
 * that file is 2.4 MB of ticker records. A JSON import cannot be tree-shaken:
 * the module evaluates it, so anything that imports ANY export from universe.ts
 * pulls all 30,809 symbols along with it. The terminal dashboard is a client
 * component and it wanted exactly one 400-byte constant from there — SECTOR_ETF
 * — which put the entire symbol master into the browser bundle. Measured: a
 * single 2.5 MB chunk, half of all the client JavaScript on the site, loaded by
 * /terminal alone, downloaded before the page could become interactive.
 *
 * Nothing in this file imports data. It is safe for a client component to
 * import, and it must stay that way: if you add something here that needs the
 * master, put it in universe.ts instead.
 *
 * universe.ts re-exports all of these, so server code that already imports them
 * from there keeps working unchanged.
 */

export const SECTOR_NAMES = [
  "Information technology",
  "Communication services",
  "Energy",
  "Consumer discretionary",
  "Industrials",
  "Financials",
  "Materials",
  "Health care",
  "Consumer staples",
  "Utilities",
  "Real estate",
] as const;

export type SectorName = (typeof SECTOR_NAMES)[number];
export type IndexId = "SPX" | "NDX" | "RUT";

/** The eleven SPDR sector funds, one per GICS sector — the whole sector strip
    in a single quote call. */
export const SECTOR_ETF: Record<SectorName, string> = {
  "Information technology": "XLK",
  "Communication services": "XLC",
  Energy: "XLE",
  "Consumer discretionary": "XLY",
  Industrials: "XLI",
  Financials: "XLF",
  Materials: "XLB",
  "Health care": "XLV",
  "Consumer staples": "XLP",
  Utilities: "XLU",
  "Real estate": "XLRE",
};

export const SECTOR_BY_ETF = new Map(
  Object.entries(SECTOR_ETF).map(([sector, etf]) => [etf, sector as SectorName]),
);
