import { useEffect, useState } from 'react'
import type { Quote, SymbolsResponse } from '../types/market'
import { TERMINAL_SYMBOLS } from '../data/terminalUniverse'

export interface TerminalData {
  /** Symbol -> quote. Empty while loading; stays empty if the proxy gave up. */
  quotes: Map<string, Quote>
  /** Every usable Nasdaq-100 change today, ascending. Empty until loaded. */
  indexMoves: number[]
  /** The largest absolute movers in the index today, with names. */
  indexLeaders: Quote[]
  asOf: string | null
  delayed: boolean
  /** null = still loading, render skeletons. true/false = settled. */
  ready: boolean
  failed: boolean
}

const EMPTY: TerminalData = {
  quotes: new Map(),
  indexMoves: [],
  indexLeaders: [],
  asOf: null,
  delayed: true,
  ready: false,
  failed: false,
}

/**
 * One request for everything the terminal and the Products band need.
 *
 * Modelled directly on useMarketData, and for the same reasons:
 *
 *   - The initial state is identical on the server and on the client's first
 *     render. scripts/prerender.mjs captures React's initial render, so
 *     anything resolved during SSR would be markup the browser then
 *     contradicts. The fetch lives strictly in an effect, which never runs
 *     during renderToString.
 *   - No polling. One fetch per page load; the proxy's 60s CDN cache makes a
 *     refresh loop pointless and it would keep a tab talking to the origin
 *     forever.
 *
 * The URL is deliberately constant across all thirteen terminal pages AND the
 * Products band: one cache key, so the second page a visitor opens is served
 * from the CDN rather than costing another hundred-symbol upstream fetch.
 */
const URL_PATH = `/api/quotes?symbols=${TERMINAL_SYMBOLS.join(',')}&index=1`

export function useTerminalData(): TerminalData {
  const [data, setData] = useState<SymbolsResponse | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    const controller = new AbortController()

    fetch(URL_PATH, { signal: controller.signal })
      .then((res) => {
        if (!res.ok) throw new Error(`quotes responded ${res.status}`)
        return res.json() as Promise<SymbolsResponse>
      })
      .then((payload) => {
        // Guard the shape rather than trusting it: a proxy that returns 200
        // with something unexpected should fall back to the unavailable state,
        // not render `undefined` into the page.
        if (!Array.isArray(payload?.quotes)) throw new Error('quotes payload malformed')
        setData(payload)
      })
      .catch((err: Error) => {
        // An abort is this component unmounting, not a failure. Setting state
        // here would warn about updating an unmounted component and, worse,
        // blank the page on a route change back.
        if (err.name === 'AbortError') return
        setFailed(true)
      })

    return () => controller.abort()
  }, [])

  if (failed) return { ...EMPTY, quotes: new Map(), ready: true, failed: true }
  if (!data) return EMPTY

  return {
    quotes: new Map(data.quotes.map((q) => [q.symbol, q])),
    indexMoves: data.indexMoves ?? [],
    indexLeaders: data.indexLeaders ?? [],
    asOf: data.asOf ?? null,
    // Absent means unknown, and unknown must disclose. Only an explicit false
    // removes the delayed notice.
    delayed: data.delayed !== false,
    ready: true,
    failed: false,
  }
}
