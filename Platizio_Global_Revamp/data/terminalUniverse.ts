/**
 * The instruments that get a terminal page.
 *
 * Thirteen, not a hundred: every entry here becomes a prerendered route and a
 * row in the symbol rail, and a rail that scrolls is a rail nobody reads. The
 * eight equities are POPULAR_8, so the terminal covers exactly what Home
 * already puts in front of a visitor; the five ETFs are the ones the Products
 * page has listed since before the revamp.
 *
 * Everything here is descriptive fact — what the company does, where it lists.
 * No figure lives in this file. Prices, changes and freshness all come from
 * /api/quotes at runtime, which is the only reason the page can claim them.
 */

export type InstrumentKind = 'stock' | 'etf'

export interface Instrument {
  /** Uppercase, as the API and the display both use it. */
  symbol: string
  /** Curated. The API returns "ALPHABET INC C" and similar. */
  name: string
  /** Listing venue, shown as "NASDAQ: AAPL". */
  exchange: 'NASDAQ' | 'NYSEARCA'
  kind: InstrumentKind
  /** Sector for a stock, category for an ETF. One or two words. */
  category: string
  /** One factual clause. Never a view, never a reason to buy. */
  blurb: string
  /**
   * What the company or fund actually is, in two sentences, for the terminal's
   * context rail. Descriptive only — no outlook, no valuation, no opinion.
   */
  about: string
}

/**
 * Monogram tint, cycled from Meridian's five instrument marks.
 *
 * The letter carries the colour, never a filled tile behind it — that is what
 * keeps thirteen differently-coloured symbols from turning the rail into
 * confetti. See screener/DESIGN.md, "Shapes".
 */
export const MARK_TINTS = ['bone', 'gold', 'sage', 'slate', 'clay'] as const
export type MarkTint = (typeof MARK_TINTS)[number]

export function markTint(symbol: string): MarkTint {
  // Deterministic so the server and the hydrating client agree, and stable so
  // a symbol keeps its colour between visits.
  let sum = 0
  for (let i = 0; i < symbol.length; i++) sum += symbol.charCodeAt(i)
  return MARK_TINTS[sum % MARK_TINTS.length]
}

export const TERMINAL_UNIVERSE: readonly Instrument[] = [
  {
    symbol: 'AAPL',
    name: 'Apple',
    exchange: 'NASDAQ',
    kind: 'stock',
    category: 'Technology',
    blurb: 'Consumer devices and services.',
    about:
      'Apple designs and sells smartphones, computers, tablets and wearables, and runs a services business spanning the App Store, subscriptions and payments. It is listed on Nasdaq and reports in US dollars.',
  },
  {
    symbol: 'MSFT',
    name: 'Microsoft',
    exchange: 'NASDAQ',
    kind: 'stock',
    category: 'Technology',
    blurb: 'Cloud, software and AI.',
    about:
      'Microsoft sells productivity software, the Windows platform, and Azure cloud infrastructure, and licenses AI services built on top of them. It is listed on Nasdaq and reports in US dollars.',
  },
  {
    symbol: 'NVDA',
    name: 'NVIDIA',
    exchange: 'NASDAQ',
    kind: 'stock',
    category: 'Semiconductors',
    blurb: 'AI chips and data centre demand.',
    about:
      'NVIDIA designs graphics and accelerated-computing processors used for AI training and inference, professional visualisation and gaming, together with the networking and software around them. It is listed on Nasdaq.',
  },
  {
    symbol: 'GOOGL',
    name: 'Alphabet',
    exchange: 'NASDAQ',
    kind: 'stock',
    category: 'Technology',
    blurb: 'Search, advertising, YouTube and cloud.',
    about:
      'Alphabet is the holding company for Google — search and advertising, YouTube, Android, and Google Cloud. GOOGL is the Class A share, which carries one vote. It is listed on Nasdaq.',
  },
  {
    symbol: 'AMZN',
    name: 'Amazon',
    exchange: 'NASDAQ',
    kind: 'stock',
    category: 'Consumer / Cloud',
    blurb: 'E-commerce and cloud infrastructure.',
    about:
      'Amazon operates online and physical retail, a global logistics network, an advertising business, and Amazon Web Services. It is listed on Nasdaq and reports in US dollars.',
  },
  {
    symbol: 'META',
    name: 'Meta',
    exchange: 'NASDAQ',
    kind: 'stock',
    category: 'Technology',
    blurb: 'Social platforms and advertising.',
    about:
      'Meta operates Facebook, Instagram, WhatsApp and Threads, earning almost all of its revenue from advertising across them, alongside a reality-labs hardware business. It is listed on Nasdaq.',
  },
  {
    symbol: 'TSLA',
    name: 'Tesla',
    exchange: 'NASDAQ',
    kind: 'stock',
    category: 'Electric Vehicles',
    blurb: 'EVs, batteries and clean mobility.',
    about:
      'Tesla manufactures electric vehicles and energy generation and storage systems, and develops the charging network and driver-assistance software around them. It is listed on Nasdaq.',
  },
  {
    symbol: 'NFLX',
    name: 'Netflix',
    exchange: 'NASDAQ',
    kind: 'stock',
    category: 'Media',
    blurb: 'Streaming subscriptions worldwide.',
    about:
      'Netflix sells streaming video subscriptions in most countries, licensing and producing its own series and films, and has added an advertising-supported tier. It is listed on Nasdaq.',
  },
  {
    symbol: 'SPY',
    name: 'SPDR S&P 500',
    exchange: 'NYSEARCA',
    kind: 'etf',
    category: 'S&P 500 ETF',
    blurb: 'Broad exposure to large US companies.',
    about:
      'SPY is an exchange-traded fund that holds the constituents of the S&P 500 index, so one unit gives proportional exposure to 500 large US-listed companies. It trades on NYSE Arca.',
  },
  {
    symbol: 'QQQ',
    name: 'Invesco QQQ',
    exchange: 'NASDAQ',
    kind: 'etf',
    category: 'Nasdaq-100 ETF',
    blurb: 'Technology-heavy US index exposure.',
    about:
      'QQQ tracks the Nasdaq-100, the largest hundred non-financial companies listed on Nasdaq, which makes it far more concentrated in technology than a broad-market fund. It trades on Nasdaq.',
  },
  {
    symbol: 'VOO',
    name: 'Vanguard S&P 500',
    exchange: 'NYSEARCA',
    kind: 'etf',
    category: 'S&P 500 ETF',
    blurb: 'Low-cost broad US equity exposure.',
    about:
      'VOO tracks the same S&P 500 index as SPY under a different sponsor and fee structure. Expense ratio and tracking difference are what separate two funds on one index. It trades on NYSE Arca.',
  },
  {
    symbol: 'SOXX',
    name: 'iShares Semiconductor',
    exchange: 'NASDAQ',
    kind: 'etf',
    category: 'Semiconductor ETF',
    blurb: 'Exposure to semiconductor companies.',
    about:
      'SOXX holds US-listed semiconductor designers and manufacturers. A single-sector fund concentrates rather than diversifies, and moves with that sector rather than with the market. It trades on Nasdaq.',
  },
  {
    symbol: 'XLK',
    name: 'Technology Select',
    exchange: 'NYSEARCA',
    kind: 'etf',
    category: 'Technology ETF',
    blurb: 'Exposure to the US technology sector.',
    about:
      'XLK holds the technology constituents of the S&P 500, so it is a sector slice of a broad index rather than a whole market. It trades on NYSE Arca.',
  },
]

/** Symbols only, in rail order. */
export const TERMINAL_SYMBOLS: readonly string[] = TERMINAL_UNIVERSE.map((i) => i.symbol)

/** Case-insensitive lookup. Returns undefined for anything not covered. */
export function findInstrument(symbol: string | undefined): Instrument | undefined {
  if (!symbol) return undefined
  const upper = symbol.toUpperCase()
  return TERMINAL_UNIVERSE.find((i) => i.symbol === upper)
}

/** URL segment for an instrument. Lowercase in the path, uppercase on screen. */
export function terminalPath(symbol: string): string {
  return `/terminal/${symbol.toLowerCase()}`
}
