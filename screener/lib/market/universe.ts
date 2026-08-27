import master from "./data/symbol-master.json" with { type: "json" };

/* The tradable universe and its presentation metadata.

   Two things live here and they do different jobs.

   TRADABLE_SYMBOLS is what the sweep quotes: every listed US symbol the search
   crawl found, minus OTC and index instruments. It decides what CAN appear on
   a movers board.

   SEED is editorial: short names, monograms, colours, and the six symbols that
   have instrument pages. It decides how a row LOOKS. Nothing in it is a price,
   and a symbol missing from it still renders — it just gets a derived monogram
   and a colour picked deterministically from the ticker. */

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

type MasterFile = {
  builtAt: string;
  total: number;
  tradable: number;
  entries: Array<{ s: string; n: string; ex: string; mic: string }>;
};

const FILE = master as MasterFile;

/** Exchanges we quote. PINK is OTC; INDX is catalogued but notPermissioned. */
const TRADABLE_EXCHANGES = new Set(["NSDQ", "NYSE", "AMEX"]);

/* The exchanges list live test securities alongside real ones, and they quote
   normally — Nasdaq's ZVZZT printed a -86% "move" on the first sweep and led
   the losers board. They are not tradable and must never reach a screen.

   Nasdaq uses Z_ZZT and Z_ZZC; NYSE and AMEX use ATEST-family symbols; the
   crawl also surfaces explicit .TEST suffixes. */
const TEST_SYMBOL = /^(Z{4,}|Z[A-Z]ZZ[TC]|ATEST.*|CBO|CBX|CTEST.*|.*\.TEST)$/;
const isTestTicker = (s: string) => TEST_SYMBOL.test(s);

/** The gateway also names them plainly, which catches any pattern we missed. */
export const isTestName = (n: string) => /\bTEST\s+(STOCK|SECURITY|ISSUE)\b/i.test(n);

export const MASTER_BUILT_AT = FILE.builtAt;

export const TRADABLE = FILE.entries.filter(
  (e) => TRADABLE_EXCHANGES.has(e.ex) && !isTestTicker(e.s),
);

export const TRADABLE_SYMBOLS: string[] = TRADABLE.map((e) => e.s);

export const NAME_BY_SYMBOL = new Map(TRADABLE.map((e) => [e.s, e.n]));
export const EXCHANGE_BY_SYMBOL = new Map(TRADABLE.map((e) => [e.s, e.ex]));

/* ------------------------------------------------------------------ */
/* Index and sector proxies                                            */
/* ------------------------------------------------------------------ */

/* No index instrument is entitled on this account — SPX$, NDX$ and RUT$ all
   return notPermissioned. Each index is therefore shown through its tracking
   ETF, at the ETF's own price, and the note says so. `real` is the symbol to
   switch to the day entitlement is granted; nothing else needs to change. */
export const INDEX_PROXY: Record<
  IndexId,
  { etf: string; real: string; name: string; short: string; note: string }
> = {
  SPX: {
    etf: "SPY",
    real: "SPX$",
    name: "S&P 500",
    short: "S&P 500",
    note: "Tracked through SPY, the S&P 500 ETF. The figure above is SPY's price, not the index level.",
  },
  NDX: {
    etf: "QQQ",
    real: "NDX$",
    name: "Nasdaq 100",
    short: "Nasdaq 100",
    note: "Tracked through QQQ, the Nasdaq 100 ETF. The figure above is QQQ's price, not the index level.",
  },
  RUT: {
    etf: "IWM",
    real: "RUT$",
    name: "Russell 2000",
    short: "Russell 2000",
    note: "Tracked through IWM, the Russell 2000 ETF. The figure above is IWM's price, not the index level.",
  },
};

export const INDEX_IDS: IndexId[] = ["SPX", "NDX", "RUT"];

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

/* ------------------------------------------------------------------ */
/* Presentation metadata                                               */
/* ------------------------------------------------------------------ */

export type SeedEntry = {
  /** Short display name — row height does not allow "Apple Inc. Class A". */
  name: string;
  mark: string;
  color: string;
  covered: boolean;
};

const PALETTE = ["#E5DDD1", "#D9BD8B", "#93C7A8", "#B0BFCB", "#C9A88A"] as const;

/* Who the rail asks.

   There is no market-wide news feed and no earnings calendar on this account,
   so both rail cards are built by asking individual tickers about themselves.
   Six names is too narrow for either: the wire repeats itself, and six
   dividend payers on the same quarterly cycle leave the events card showing
   nothing but last month's ex-dates.

   These are large caps spread across the dividend calendar, so that something
   is always upcoming, and across sectors, so the wire is not four stories
   about semiconductors. */
export const CALENDAR_TICKERS = [
  "AAPL", "MSFT", "NVDA", "AVGO", "CSCO", "IBM", "TXN", "QCOM", "ORCL", "ACN",
  "JPM", "BAC", "GS", "MS", "AXP", "BLK", "SPGI", "CB", "PGR", "USB",
  "JNJ", "LLY", "ABBV", "MRK", "PFE", "TMO", "ABT", "AMGN", "MDT", "BMY",
  "XOM", "CVX", "COP", "SLB", "PSX", "KMI", "WMB", "OKE",
  "PG", "KO", "PEP", "WMT", "COST", "MO", "MDLZ", "CL", "KMB", "GIS",
  "HD", "MCD", "NKE", "SBUX", "LOW", "TGT", "TJX", "F", "GM",
  "CAT", "UNP", "HON", "RTX", "LMT", "UPS", "DE", "GD", "EMR", "ETN",
  "VZ", "T", "CMCSA", "DIS", "EA", "OMC",
  "NEE", "DUK", "SO", "D", "AEP", "EXC",
  "LIN", "APD", "SHW", "NUE", "DOW", "FCX",
  "AMT", "PLD", "O", "SPG", "PSA", "CCI", "WELL", "EQR",
] as const;

/** Enough tickers for a rail that does not repeat, without a call per name. */
export const WIRE_TICKERS = [
  "AAPL", "MSFT", "NVDA", "AMZN", "TSLA", "SPOT", "GOOGL", "META", "AVGO", "AMD",
  "JPM", "BAC", "GS", "V", "MA", "BRK.B",
  "LLY", "JNJ", "UNH", "PFE", "MRK",
  "XOM", "CVX", "COP",
  "WMT", "COST", "KO", "PG",
  "HD", "MCD", "NKE", "SBUX", "DIS", "NFLX",
  "CAT", "BA", "UPS", "GE",
  "T", "VZ", "CMCSA",
  "NEE", "DUK",
  "LIN", "FCX",
  "AMT", "PLD",
  "UBER", "ABNB", "PLTR", "COIN",
] as const;

/** The six symbols with instrument pages of their own. */
export const COVERED = ["AAPL", "TSLA", "NVDA", "AMZN", "SPOT", "MSFT"] as const;

const SEED: Record<string, SeedEntry> = {
  AAPL: { name: "Apple", mark: "A", color: "#E5DDD1", covered: true },
  MSFT: { name: "Microsoft", mark: "M", color: "#B0BFCB", covered: true },
  NVDA: { name: "Nvidia", mark: "N", color: "#93C7A8", covered: true },
  AMZN: { name: "Amazon", mark: "A", color: "#D9BD8B", covered: true },
  TSLA: { name: "Tesla", mark: "T", color: "#C9A88A", covered: true },
  SPOT: { name: "Spotify", mark: "S", color: "#93C7A8", covered: true },
  GOOGL: { name: "Alphabet", mark: "G", color: "#B0BFCB", covered: false },
  META: { name: "Meta Platforms", mark: "M", color: "#B0BFCB", covered: false },
  NFLX: { name: "Netflix", mark: "N", color: "#C9A88A", covered: false },
  JPM: { name: "JPMorgan Chase", mark: "J", color: "#D9BD8B", covered: false },
  V: { name: "Visa", mark: "V", color: "#E5DDD1", covered: false },
  MA: { name: "Mastercard", mark: "M", color: "#C9A88A", covered: false },
  BRK: { name: "Berkshire Hathaway", mark: "B", color: "#B0BFCB", covered: false },
  LLY: { name: "Eli Lilly", mark: "L", color: "#93C7A8", covered: false },
  UNH: { name: "UnitedHealth", mark: "U", color: "#93C7A8", covered: false },
  XOM: { name: "Exxon Mobil", mark: "E", color: "#C9A88A", covered: false },
  CVX: { name: "Chevron", mark: "C", color: "#C9A88A", covered: false },
  WMT: { name: "Walmart", mark: "W", color: "#D9BD8B", covered: false },
  COST: { name: "Costco", mark: "C", color: "#D9BD8B", covered: false },
  HD: { name: "Home Depot", mark: "H", color: "#C9A88A", covered: false },
  PG: { name: "Procter & Gamble", mark: "P", color: "#E5DDD1", covered: false },
  JNJ: { name: "Johnson & Johnson", mark: "J", color: "#93C7A8", covered: false },
  AVGO: { name: "Broadcom", mark: "B", color: "#93C7A8", covered: false },
  AMD: { name: "AMD", mark: "A", color: "#93C7A8", covered: false },
  ORCL: { name: "Oracle", mark: "O", color: "#B0BFCB", covered: false },
  CRM: { name: "Salesforce", mark: "S", color: "#B0BFCB", covered: false },
  ADBE: { name: "Adobe", mark: "A", color: "#B0BFCB", covered: false },
  INTC: { name: "Intel", mark: "I", color: "#B0BFCB", covered: false },
  DIS: { name: "Disney", mark: "D", color: "#D9BD8B", covered: false },
  BA: { name: "Boeing", mark: "B", color: "#B0BFCB", covered: false },
  KO: { name: "Coca-Cola", mark: "K", color: "#C9A88A", covered: false },
  PEP: { name: "PepsiCo", mark: "P", color: "#C9A88A", covered: false },
  MCD: { name: "McDonald's", mark: "M", color: "#D9BD8B", covered: false },
  NKE: { name: "Nike", mark: "N", color: "#E5DDD1", covered: false },
  SBUX: { name: "Starbucks", mark: "S", color: "#93C7A8", covered: false },
  UBER: { name: "Uber", mark: "U", color: "#E5DDD1", covered: false },
  ABNB: { name: "Airbnb", mark: "A", color: "#C9A88A", covered: false },
  PLTR: { name: "Palantir", mark: "P", color: "#B0BFCB", covered: false },
  COIN: { name: "Coinbase", mark: "C", color: "#D9BD8B", covered: false },
  SHOP: { name: "Shopify", mark: "S", color: "#93C7A8", covered: false },
};

/* Funds, trusts and notes, recognised by name.

   The gateway does not expose a security type on a quote, and the one place it
   does — the fundamentals endpoint — is a call per symbol, which is far too
   many to spend on a filter. The names are unambiguous enough: a leveraged
   product is always called one.

   This matters because levered and inverse funds otherwise own the movers
   boards. A 3x bitcoin-miner ETN moving twenty percent is the underlying
   moving seven, reported three times, and a board of them tells a reader
   nothing about what happened in the market today. */
/* Three independent signals, because one word is not enough.

   The first attempt keyed off words like TRUST and SHARES and quietly deleted
   Northern Trust — a bank — from every board, along with every REIT named
   "… Realty Trust", which is most of them. A REIT is an operating company
   under GICS and belongs in Real Estate.

   So: an explicit fund suffix, or a known issuer, or a leverage marker. A
   company can be called a Trust; it cannot be called an ETF, and it is not
   published by Direxion. */
const FUND_SUFFIX = /\b(ETF|ETN|ETP|ETFS|MUTUAL FUND|INDEX FUND)\b/i;

const FUND_ISSUER =
  /\b(PROSHARES|ISHARES|DIREXION|SPDR|INVESCO|VANGUARD|WISDOMTREE|GRANITESHARES|DEFIANCE|ROUNDHILL|AMPLIFY|TRADR|LEVERAGE SHARES|GLOBAL X|SIMPLIFY|YIELDMAX|INNOVATOR|FIRST TRUST|JANUS HENDERSON DETROIT|XTRACKERS|FRANKLIN|SCHWAB STRATEGIC|GOLDMAN SACHS ETF)\b/i;

const LEVERAGE_MARKER =
  /(\b[23](\.[05])?X\b|\bULTRAPRO\b|\bULTRASHORT\b|\bULTRA\b|\b(BULL|BEAR)\s+[23]X\b|\bDAILY\s+(LONG|SHORT)\b|\b(LONG|SHORT)\s+\w+\s+DAILY\b)/i;

export function isFund(name: string): boolean {
  return FUND_SUFFIX.test(name) || FUND_ISSUER.test(name) || LEVERAGE_MARKER.test(name);
}

/** FNV-1a over the ticker. Deterministic, so a symbol always draws the same
    series and the same colour on the server and in the browser. */
export function seedOf(ticker: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < ticker.length; i += 1) {
    h ^= ticker.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h % 100_000;
}

/** Trim the legal-entity noise off a gateway company name.
    "NVIDIA CORP" → "Nvidia", "STATE STREET SPDR S&P 500 ETF" → title case. */
function tidyName(raw: string): string {
  const cleaned = raw
    .replace(/\b(INC|CORP|CORPORATION|CO|COMPANY|LTD|LIMITED|PLC|LLC|LP|SA|NV|AG|HOLDINGS?|GROUP|TRUST|THE)\b\.?/gi, " ")
    .replace(/\bCLASS\s+[A-Z]\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  const base = cleaned || raw;
  return base
    .toLowerCase()
    .replace(/\b[a-z]/g, (c) => c.toUpperCase())
    .replace(/\b(Etf|Adr|Reit|Spdr|Ai|Us|Uk)\b/g, (m) => m.toUpperCase());
}

/** Presentation metadata for any symbol, curated or not. */
export function presentation(ticker: string, gatewayName?: string | null): SeedEntry {
  const seeded = SEED[ticker];
  if (seeded) return seeded;
  const fallbackName = gatewayName?.trim() || NAME_BY_SYMBOL.get(ticker) || ticker;
  return {
    name: tidyName(fallbackName),
    mark: (ticker[0] ?? "?").toUpperCase(),
    color: PALETTE[seedOf(ticker) % PALETTE.length],
    covered: false,
  };
}

export const isCovered = (ticker: string) => SEED[ticker]?.covered === true;

/* Whether an instrument is worth a page of its own.

   The sweep filters test securities out of the boards, but an instrument page
   fetches whatever ticker the URL names, and the gateway answers for Nasdaq's
   ZZZZZ as readily as for Apple — at a price of zero, under the name "Nasdaq
   Test Symbol". A page that cannot price its subject has nothing to be, so an
   absent price is a refusal too. */
export function isQuotable(q: {
  symbol: string;
  name?: string | null;
  price?: number | null;
}): boolean {
  if (isTestTicker(q.symbol)) return false;
  if (q.name && isTestName(q.name)) return false;
  return typeof q.price === "number" && q.price > 0;
}
