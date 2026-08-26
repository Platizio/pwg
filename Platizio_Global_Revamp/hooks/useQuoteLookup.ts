import { useEffect, useState } from 'react'
import type { Quote, SymbolsResponse } from '../types/market'

export type LookupStatus = 'loading' | 'ready' | 'missing' | 'failed'

export interface QuoteLookup {
  /** The quote for the requested symbol, or null while it is not `ready`. */
  quote: Quote | null
  status: LookupStatus
  asOf: string | null
  delayed: boolean
}

/**
 * One live quote for whichever symbol the reader is currently looking at.
 *
 * useMarketData fetches a fixed set once. This is the other shape: the symbol
 * is chosen by the reader and changes as they pick, so the fetch reruns and an
 * in-flight request for the previous symbol is aborted rather than allowed to
 * land after the new one and overwrite it.
 *
 * Same prerender contract as every other hook here — the first render returns
 * `loading` on the server and on the client identically, and the fetch lives
 * strictly in the effect, which renderToString never runs.
 *
 * `missing` is a real outcome, not an error: the proxy answers 200 with an
 * empty list for a symbol the upstream will not serve, and a reader who typed
 * a ticker we cannot quote needs to be told that, not shown a failure.
 */
export function useQuoteLookup(symbol: string): QuoteLookup {
  const [state, setState] = useState<QuoteLookup>({
    quote: null,
    status: 'loading',
    asOf: null,
    delayed: true,
  })

  useEffect(() => {
    if (!symbol) return
    const controller = new AbortController()

    // Keep the previous quote on screen while the next one loads. Blanking it
    // collapses the panel and reflows the page under the reader's cursor every
    // time they pick a different company.
    setState((prev) => ({ ...prev, status: 'loading' }))

    fetch(`/api/quotes?symbols=${encodeURIComponent(symbol)}`, { signal: controller.signal })
      .then((res) => {
        if (!res.ok) throw new Error(`quotes responded ${res.status}`)
        return res.json() as Promise<SymbolsResponse>
      })
      .then((payload) => {
        if (!Array.isArray(payload?.quotes)) throw new Error('quotes payload malformed')
        const quote = payload.quotes[0]
        if (!quote || typeof quote.price !== 'number') {
          setState({ quote: null, status: 'missing', asOf: null, delayed: true })
          return
        }
        setState({
          quote,
          status: 'ready',
          asOf: payload.asOf ?? null,
          delayed: payload.delayed !== false,
        })
      })
      .catch((err: Error) => {
        if (err.name === 'AbortError') return
        setState({ quote: null, status: 'failed', asOf: null, delayed: true })
      })

    return () => controller.abort()
  }, [symbol])

  return state
}
