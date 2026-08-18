/**
 * Shapes shared between the serverless proxy (api/) and the Home components.
 *
 * The proxy is the only place that talks to ViewTrade, so it owns every
 * normalisation decision. By the time a Quote reaches a component it is ready
 * to render: no unit conversion, no rounding, no null handling.
 */

/** One quote, normalised for display. */
export interface Quote {
  symbol: string
  /** Title case. ViewTrade returns SHOUTING CASE ("APPLE INC"). */
  name: string
  /** Rounded to the instrument's precision (2dp for US equities). */
  price: number
  /** Absolute move against yesterday's close. May legitimately be 0. */
  change: number
  /**
   * Percentage POINTS — 0.42 means +0.42%.
   *
   * ViewTrade returns a fraction (0.00420848). The proxy multiplies by 100
   * exactly once, here, so no component can get this wrong. Rendering the raw
   * API value would understate every move by 100x.
   */
  changePercent: number
  currency: string
}

/** Response body of GET /api/quotes. */
export interface QuotesResponse {
  /** Top 8 of the universe by absolute change, descending. */
  trending: Quote[]
  /** The eight POPULAR_8 symbols, in their configured order. */
  popular: Quote[]
  /**
   * ISO timestamp of the STALEST quote in the payload, so the "last updated"
   * line is never newer than the oldest thing on screen.
   */
  asOf: string
  /** True when the upstream marks the data delayed. Drives the notice. */
  delayed: boolean
}

/**
 * Response body of GET /api/quotes?symbols=AAPL,MSFT
 *
 * A flat list rather than the two curated arrays: the caller asked for exactly
 * these symbols, so there is no ranking or selection left to express.
 */
export interface SymbolsResponse {
  /** In the order requested. A symbol the upstream could not serve is absent. */
  quotes: Quote[]
  /** ISO timestamp of the stalest quote returned. */
  asOf: string
  /** True when the upstream marks the data delayed. Drives the notice. */
  delayed: boolean
  /**
   * Every usable Nasdaq-100 constituent's percentage change today, ascending.
   *
   * Present only when `index=1` is requested. The terminal plots the requested
   * symbol's move against this distribution, which is the one honest way we
   * can say whether a move is large without a fundamentals or history feed.
   */
  indexMoves?: number[]
  /**
   * The eight largest absolute movers in the index today, with names.
   *
   * The same ranking `trending` uses on Home, reused rather than recomputed —
   * "biggest movers" must mean one thing across the site.
   */
  indexLeaders?: Quote[]
}
