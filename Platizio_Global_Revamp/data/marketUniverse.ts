/**
 * The ticker universe behind the two market sections on Home.
 *
 * ViewTrade has no market-wide movers endpoint (see docs/03-viewtrade-api.md),
 * so "trending" is this universe ranked by absolute percentage change on our
 * side. That is why the section must be labelled "Top movers — Nasdaq-100" and
 * never "the market".
 */

/**
 * Nasdaq-100 constituents.
 *
 * The index is reconstituted annually, so this list drifts. Drift is safe: a
 * removed ticker comes back `notFound` and is filtered out before ranking, so
 * a stale entry degrades quietly rather than breaking the section. Worth a
 * review each December.
 */
export const NASDAQ_100: readonly string[] = [
  'AAPL', 'ABNB', 'ADBE', 'ADI', 'ADP', 'ADSK', 'AEP', 'AMAT', 'AMD', 'AMGN',
  'AMZN', 'ANSS', 'APP', 'ARM', 'ASML', 'AVGO', 'AXON', 'AZN', 'BIIB', 'BKNG',
  'BKR', 'CCEP', 'CDNS', 'CDW', 'CEG', 'CHTR', 'CMCSA', 'COST', 'CPRT', 'CRWD',
  'CSCO', 'CSGP', 'CSX', 'CTAS', 'CTSH', 'DASH', 'DDOG', 'DXCM', 'EA', 'EXC',
  'FANG', 'FAST', 'FTNT', 'GEHC', 'GFS', 'GILD', 'GOOG', 'GOOGL', 'HON', 'IDXX',
  'ILMN', 'INTC', 'INTU', 'ISRG', 'KDP', 'KHC', 'KLAC', 'LIN', 'LRCX', 'LULU',
  'MAR', 'MCHP', 'MDB', 'MDLZ', 'MELI', 'META', 'MNST', 'MRVL', 'MSFT', 'MSTR',
  'MU', 'NFLX', 'NVDA', 'NXPI', 'ODFL', 'ON', 'ORLY', 'PANW', 'PAYX', 'PCAR',
  'PDD', 'PEP', 'PLTR', 'PYPL', 'QCOM', 'REGN', 'ROP', 'ROST', 'SBUX', 'SMCI',
  'SNPS', 'TEAM', 'TMUS', 'TSLA', 'TTD', 'TTWO', 'TXN', 'VRSK', 'VRTX', 'WBD',
  'WDAY', 'XEL', 'ZS',
]

/**
 * The fixed 4x2 Popular grid. Order is the render order.
 *
 * Display names are held here rather than taken from the API, which returns
 * uppercase ("ALPHABET INC") and legal-entity names nobody recognises.
 */
export const POPULAR_8: readonly { symbol: string; name: string }[] = [
  { symbol: 'AAPL', name: 'Apple' },
  { symbol: 'MSFT', name: 'Microsoft' },
  { symbol: 'NVDA', name: 'NVIDIA' },
  { symbol: 'GOOGL', name: 'Alphabet' },
  { symbol: 'AMZN', name: 'Amazon' },
  { symbol: 'META', name: 'Meta' },
  { symbol: 'TSLA', name: 'Tesla' },
  { symbol: 'NFLX', name: 'Netflix' },
]

/**
 * The five ETFs the Products page and the terminal cover.
 *
 * Held apart from NASDAQ_100 on purpose. The trending section is labelled
 * "Top movers — Nasdaq-100", and that label is only honest while the ranked
 * set is the index it names — so buildPayload ranks over NASDAQ_100
 * membership, not over everything the proxy happens to have fetched.
 *
 * Three of these list on NYSE Arca rather than Nasdaq. Whether the equity
 * quotes endpoint resolves NYSEARCA symbols is UNVERIFIED against UAT; if it
 * returns `notFound` for them, `isUsable` drops them and the ETF rows render
 * their unavailable state rather than breaking. See docs/04-decisions.md.
 */
export const ETF_UNIVERSE: readonly { symbol: string; name: string }[] = [
  { symbol: 'SPY', name: 'SPDR S&P 500' },
  { symbol: 'QQQ', name: 'Invesco QQQ' },
  { symbol: 'VOO', name: 'Vanguard S&P 500' },
  { symbol: 'SOXX', name: 'iShares Semiconductor' },
  { symbol: 'XLK', name: 'Technology Select' },
]

/** How many movers the trending banner shows. */
export const TRENDING_COUNT = 8

/**
 * Below this many usable quotes a section unmounts rather than render a
 * half-empty grid. A missing section reads as design; a broken one reads as a
 * broken site.
 */
export const MIN_USABLE_QUOTES = 4

/**
 * The large-cap sample is whitelisted but NOT folded into ALL_SYMBOLS.
 *
 * ALL_SYMBOLS is what the default /api/quotes call fetches, and Home depends on
 * that call staying five upstream batches. Adding 500 names would make every
 * homepage load twenty. The sample is fetched only by the ?gainers=1 mode.
 */
export { LARGE_CAP_SYMBOLS, LARGE_CAP_SET, LARGE_CAP_BASIS, LARGE_CAP_SAMPLE } from './largeCapSample'

/** Every symbol the proxy needs, deduplicated. */
export const ALL_SYMBOLS: readonly string[] = [
  ...new Set([
    ...NASDAQ_100,
    ...POPULAR_8.map((p) => p.symbol),
    ...ETF_UNIVERSE.map((e) => e.symbol),
  ]),
]

/**
 * Display names for anything the API would otherwise name badly.
 *
 * ViewTrade returns SHOUTING legal entities ("ALPHABET INC C", "INVESCO QQQ
 * TRUST SERIES 1"). Both curated lists feed one lookup so a symbol resolves to
 * the same name wherever it appears.
 */
export const DISPLAY_NAMES: ReadonlyMap<string, string> = new Map(
  [...POPULAR_8, ...ETF_UNIVERSE].map((e) => [e.symbol, e.name]),
)

/** Membership test used to keep the "Nasdaq-100" ranking honest. */
export const NASDAQ_100_SET: ReadonlySet<string> = new Set(NASDAQ_100)
