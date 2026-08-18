/**
 * Pure transformation from ViewTrade's raw quotes to the response the browser
 * gets. No I/O, so it is verifiable against fixtures without a network call.
 *
 * Every normalisation decision lives here, once. Components receive
 * render-ready values and make no unit or rounding decisions of their own.
 */

import type { RawQuote } from './viewtrade'
import type { Quote, QuotesResponse, SymbolsResponse } from '../../Platizio_Global_Revamp/types/market'
import {
  POPULAR_8,
  TRENDING_COUNT,
  DISPLAY_NAMES,
  NASDAQ_100_SET,
} from '../../Platizio_Global_Revamp/data/marketUniverse'

/**
 * Prices always render to 2 decimals.
 *
 * The payload's `precision` field is quote precision from the exchange, not a
 * display hint, and it varies wildly: MU came back precision 0 ($1000), ARM 1
 * ($285.5), FANG 3 ($206.574), AAPL 2 ($307.14). Honouring it puts four
 * different decimal formats in one grid. US equities are quoted in cents, so
 * 2dp is both correct and consistent.
 */
const DISPLAY_DECIMALS = 2

/** "APPLE INC" -> "Apple Inc". Leaves mixed-case input alone. */
export function titleCase(input: string): string {
  if (input !== input.toUpperCase()) return input
  return input
    .toLowerCase()
    .replace(/\b[a-z]/g, (c) => c.toUpperCase())
}

function round(value: number, decimals: number): number {
  const factor = 10 ** decimals
  return Math.round(value * factor) / factor
}

/**
 * A raw quote is usable only if the upstream served real data for it and the
 * two numbers we render are present.
 *
 * Note `!= null` throughout, never truthiness: NFLX returned `change: 0` and
 * `changePercent: 0` during the spike, and `!quote.change` would have silently
 * dropped it from the grid.
 */
export function isUsable(raw: RawQuote): boolean {
  if (raw.notPermissioned === true || raw.notFound === true) return false
  if (!raw.symbol) return false
  if (raw.lastPrice == null || raw.lastPrice <= 0) return false
  if (raw.changePercent == null) return false
  return true
}

/**
 * Normalise one quote for display.
 *
 * The x100 on changePercent happens HERE and nowhere else. ViewTrade returns a
 * fraction (0.00420848 for a 0.42% move); rendering that directly would
 * understate every move by 100x.
 */
export function normalise(raw: RawQuote, displayName?: string): Quote {
  return {
    symbol: raw.symbol,
    name: displayName ?? titleCase(raw.companyName ?? raw.symbol),
    price: round(raw.lastPrice as number, DISPLAY_DECIMALS),
    change: round(raw.change ?? 0, DISPLAY_DECIMALS),
    changePercent: round((raw.changePercent as number) * 100, 2),
    currency: raw.currency ?? 'USD',
  }
}

/**
 * Stalest timestamp among the quotes we actually SHOW.
 *
 * Deliberately not computed over the whole universe: a single dormant ticker
 * among the ~100 dragged `asOf` back by 13 days in testing, while every
 * displayed symbol was current to the minute. Scoping it to the rendered set
 * keeps "last updated" honest about what is on screen without letting one
 * inactive symbol misreport the whole section as stale.
 */
function oldestUpdateTime(raws: RawQuote[]): string {
  const times = raws
    .map((r) => r.updateTime)
    .filter((t): t is string => !!t)
    .map((t) => new Date(t).getTime())
    .filter((t) => Number.isFinite(t))

  return times.length
    ? new Date(Math.min(...times)).toISOString()
    : new Date().toISOString()
}

/**
 * Build the full response.
 *
 * `trending` ranks by absolute percentage change, so a -4% fall is as much a
 * mover as a +4% rise. Ranking on the fraction or the percentage gives the same
 * order, but we rank after normalising so the sorted values are the displayed
 * ones.
 */
export function buildPayload(raws: RawQuote[]): QuotesResponse {
  const usable = raws.filter(isUsable)
  const bySymbol = new Map(usable.map((r) => [r.symbol, r]))

  const popular = POPULAR_8
    .map(({ symbol, name }) => {
      const raw = bySymbol.get(symbol)
      return raw ? normalise(raw, name) : null
    })
    .filter((q): q is Quote => q !== null)

  // Ranked over NASDAQ_100 membership, not over everything fetched. The proxy
  // now also carries five ETFs for the Products page and the terminal, and
  // three of them are NYSE Arca listings — letting those into a list the UI
  // labels "Top movers — Nasdaq-100" would make the label untrue.
  const trending = usable
    .filter((raw) => NASDAQ_100_SET.has(raw.symbol))
    .sort((a, b) => Math.abs(b.changePercent!) - Math.abs(a.changePercent!))
    .slice(0, TRENDING_COUNT)
    .map((raw) => normalise(raw, DISPLAY_NAMES.get(raw.symbol)))

  // Only the quotes actually rendered feed the freshness and delayed notices.
  const shownSymbols = new Set([
    ...trending.map((q) => q.symbol),
    ...popular.map((q) => q.symbol),
  ])
  const shown = usable.filter((r) => shownSymbols.has(r.symbol))

  return {
    trending,
    popular,
    asOf: oldestUpdateTime(shown),
    // Assume delayed unless every shown quote explicitly says otherwise — the
    // conservative direction for a disclosure.
    delayed: shown.length === 0 || shown.some((r) => r.delayed !== false),
  }
}

/**
 * Response for an explicit `?symbols=` request.
 *
 * Used by the terminal, which needs one named instrument plus enough of the
 * index to say where its move sits. Deliberately a separate builder rather
 * than a reshaping of buildPayload: `trending` and `popular` carry editorial
 * decisions (a ranked cut, a curated eight) that a symbol lookup must not
 * inherit.
 *
 * Order follows the REQUEST, not the API's response order, so the caller can
 * rely on index alignment. A symbol the upstream could not serve is simply
 * absent — the caller decides whether that is fatal.
 */
export function buildSymbolsPayload(
  raws: RawQuote[],
  requested: readonly string[],
): SymbolsResponse {
  const usable = raws.filter(isUsable)
  const bySymbol = new Map(usable.map((r) => [r.symbol, r]))

  const quotes = requested
    .map((symbol) => {
      const raw = bySymbol.get(symbol)
      return raw ? normalise(raw, DISPLAY_NAMES.get(symbol)) : null
    })
    .filter((q): q is Quote => q !== null)

  const shown = quotes
    .map((q) => bySymbol.get(q.symbol))
    .filter((r): r is RawQuote => !!r)

  return {
    quotes,
    asOf: oldestUpdateTime(shown),
    delayed: shown.length === 0 || shown.some((r) => r.delayed !== false),
  }
}

/**
 * Every usable Nasdaq-100 change, as plain numbers, for the distribution plot.
 *
 * The terminal draws each constituent's move as a tick on one axis so a
 * visitor can see whether a given move is ordinary or exceptional. That is the
 * whole index, not the ranked cut, so it cannot reuse `trending`.
 */
export function buildIndexMoves(raws: RawQuote[]): number[] {
  return raws
    .filter(isUsable)
    .filter((raw) => NASDAQ_100_SET.has(raw.symbol))
    .map((raw) => round((raw.changePercent as number) * 100, 2))
    .sort((a, b) => a - b)
}
