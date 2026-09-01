import type { SectorName } from "../market/universe.ts";

/* SIC → GICS sector.

   The gateway has no GICS field: the middleware /insight/quote-profile family
   that carries one is not entitled on this account. What every symbol does
   carry is an SEC SIC code, so classification runs through this table.

   Ranges are ordered and the FIRST match wins, which is why narrow ranges sit
   above the broad ones they interrupt — drug manufacturing (2833–2836) has to
   be tested before chemicals (2800–2899), or every pharmaceutical company
   lands in Materials.

   The override map below is not a list of typos. SIC and GICS genuinely
   disagree about several of the largest companies in the market, and SIC has
   not been meaningfully revised since 1987 — it has no concept of a search
   engine or a payment network. Where they disagree, GICS wins, because the
   eleven sector names in this product are GICS names. */

const RANGES: Array<[number, number, SectorName]> = [
  [100, 999, "Consumer staples"],            // agricultural production
  [1000, 1099, "Materials"],                 // metal mining
  [1200, 1399, "Energy"],                    // coal, oil & gas extraction
  [1400, 1499, "Materials"],                 // nonmetallic minerals
  [1520, 1531, "Consumer discretionary"],    // homebuilders — before construction
  [1500, 1799, "Industrials"],               // construction & engineering
  [2000, 2199, "Consumer staples"],          // food, beverage, tobacco
  [2200, 2399, "Consumer discretionary"],    // textiles, apparel
  [2400, 2499, "Materials"],                 // lumber
  [2500, 2599, "Consumer discretionary"],    // furniture
  [2600, 2699, "Materials"],                 // paper
  [2700, 2799, "Communication services"],    // publishing
  [2833, 2836, "Health care"],               // drugs, biologics — before chemicals
  [2840, 2844, "Consumer staples"],          // soap, cosmetics — before chemicals
  [2800, 2899, "Materials"],                 // chemicals
  [2900, 2999, "Energy"],                    // petroleum refining
  [3011, 3011, "Consumer discretionary"],    // tires
  [3000, 3099, "Materials"],                 // rubber & plastics
  [3100, 3199, "Consumer discretionary"],    // footwear, leather
  [3200, 3399, "Materials"],                 // stone, clay, glass, primary metals
  [3400, 3499, "Industrials"],               // fabricated metal
  [3570, 3579, "Information technology"],    // computers & office equipment
  [3500, 3569, "Industrials"],               // industrial machinery
  [3580, 3599, "Industrials"],
  [3650, 3652, "Consumer discretionary"],    // household audio/video, recorded media
  [3660, 3699, "Information technology"],    // comms equipment, semiconductors
  [3600, 3649, "Industrials"],               // electrical equipment, lighting
  [3711, 3716, "Consumer discretionary"],    // motor vehicles
  [3751, 3751, "Consumer discretionary"],    // motorcycles, bicycles
  [3720, 3769, "Industrials"],               // aerospace, ships, rail, defence
  [3826, 3826, "Health care"],               // lab analytical instruments
  [3800, 3825, "Information technology"],    // measuring & control instruments
  [3827, 3829, "Information technology"],
  [3830, 3851, "Health care"],               // medical, surgical, ophthalmic devices
  [3790, 3799, "Consumer discretionary"],    // snowmobiles, boats — leisure, not aerospace
  [3860, 3899, "Consumer discretionary"],    // photographic, watches
  [3900, 3999, "Consumer discretionary"],    // jewellery, toys, misc manufacturing
  [4000, 4013, "Industrials"],               // railroads
  [4100, 4299, "Industrials"],               // trucking, transit, warehousing
  [4400, 4412, "Consumer discretionary"],    // cruise lines
  [4413, 4499, "Industrials"],               // marine freight
  [4500, 4581, "Industrials"],               // air transport
  [4600, 4619, "Energy"],                    // pipelines
  [4724, 4724, "Consumer discretionary"],    // travel agencies
  [4700, 4799, "Industrials"],               // transportation services
  [4800, 4899, "Communication services"],    // telephone, radio, TV, cable
  [4950, 4959, "Industrials"],               // waste management — GICS calls this Industrials
  [4900, 4991, "Utilities"],                 // electric, gas, water, steam
  [5122, 5122, "Health care"],               // drugs wholesale
  [5140, 5149, "Consumer staples"],          // groceries wholesale
  [5171, 5172, "Energy"],                    // petroleum wholesale
  [5000, 5199, "Industrials"],               // wholesale, general
  [5400, 5499, "Consumer staples"],          // food stores
  [5912, 5921, "Consumer staples"],          // drug stores, liquor stores
  [5200, 5999, "Consumer discretionary"],    // retail, restaurants, e-commerce
  /* Managed care sits in Financials under SIC because it is legally insurance,
     and in Health care under GICS because that is the business it is in.
     UnitedHealth classified as a bank on the first run. */
  [6320, 6324, "Health care"],               // accident & health insurance, hospital plans
  [6000, 6411, "Financials"],                // banks, brokers, exchanges, insurance
  [6500, 6799, "Real estate"],               // real estate operators, REITs (6798)
  [7000, 7011, "Consumer discretionary"],    // hotels
  [7200, 7299, "Consumer discretionary"],    // personal services
  [7310, 7319, "Communication services"],    // advertising
  [7370, 7379, "Information technology"],    // software, data processing
  [7320, 7369, "Industrials"],               // other business services
  [7380, 7389, "Industrials"],
  /* Vehicle rental sits in Industrials under GICS, which moved passenger
     ground transportation there in 2023, while everything else automotive —
     servicing, repair, parking — is consumer spending. The narrow range has to
     be tested first or the whole 7500 block lands in one of them. */
  [7510, 7519, "Industrials"],               // car and truck rental & leasing
  [7500, 7599, "Consumer discretionary"],    // automotive repair, servicing, parking
  [7800, 7841, "Communication services"],    // motion pictures, streaming
  [7900, 7989, "Communication services"],    // entertainment
  [7990, 7999, "Consumer discretionary"],    // casinos, recreation
  [8000, 8099, "Health care"],
  [8111, 8111, "Industrials"],               // legal and consulting services
  [8200, 8299, "Consumer discretionary"],    // education
  [8300, 8399, "Health care"],               // social services
  [8600, 8699, "Communication services"],
  [8731, 8731, "Health care"],               // commercial biological research
  [8700, 8748, "Industrials"],               // engineering, accounting, management
];

/** Where SIC and GICS disagree about a company most people have heard of. */
const OVERRIDE: Record<string, SectorName> = {
  GOOGL: "Communication services", // SIC 7370 → IT
  GOOG: "Communication services",
  META: "Communication services",  // SIC 7370 → IT
  NFLX: "Communication services",  // SIC 7841 "video tape rental"
  DIS: "Communication services",
  WBD: "Communication services",
  V: "Financials",                 // SIC 7389 "services"
  MA: "Financials",
  PYPL: "Financials",
  AXP: "Financials",
  COIN: "Financials",
  WMT: "Consumer staples",         // SIC 5331 "variety stores"
  COST: "Consumer staples",
  TGT: "Consumer staples",
  DG: "Consumer staples",
  DLTR: "Consumer staples",
  UBER: "Industrials",             // SIC 7389
  LYFT: "Industrials",
  ABNB: "Consumer discretionary",  // SIC 7389
  BKNG: "Consumer discretionary",
  AMZN: "Consumer discretionary",  // SIC 5961 already agrees, pinned for clarity
  TSLA: "Consumer discretionary",
  SQ: "Financials",
  XYZ: "Financials",
  HOOD: "Financials",
  SHOP: "Information technology",
  CVS: "Health care",              // SIC 5912 "drug stores"
  WBA: "Consumer staples",
  MCK: "Health care",              // SIC 5122 already agrees, pinned
};

export function sectorForSic(
  sic: string | number | null | undefined,
  ticker?: string,
): SectorName | null {
  if (ticker && OVERRIDE[ticker]) return OVERRIDE[ticker];
  if (sic == null || sic === "") return null;

  const code = typeof sic === "number" ? sic : Number.parseInt(String(sic), 10);
  if (!Number.isFinite(code)) return null;
  // 9995 "non-operating establishments" and 9997 "conglomerate" classify nothing.
  if (code >= 9990) return null;

  for (const [lo, hi, sector] of RANGES) {
    if (code >= lo && code <= hi) return sector;
  }
  return null;
}
