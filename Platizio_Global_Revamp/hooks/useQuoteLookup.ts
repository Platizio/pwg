"use client"

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
  /* The symbol travels with the result. "Loading" is then a fact about the two
     disagreeing rather than a flag to be set, which is what let the old code
     write state from inside the effect and cascade a render on every lookup. */
  const [state, setState] = useState<QuoteLookup & { symbol: string }>({
    symbol: '',
    quote: null,
    status: 'loading',
    asOf: null,
    delayed: true,
  })

  useEffect(() => {
    if (!symbol) return
    const controller = new AbortController()

    fetch(`/api/quotes?symbols=${encodeURIComponent(symbol)}`, { signal: controller.signal })
      .then((res) => {
        if (!res.ok) throw new Error(`quotes responded ${res.status}`)
        return res.json() as Promise<SymbolsResponse>
      })
      .then((payload) => {
        if (!Array.isArray(payload?.quotes)) throw new Error('quotes payload malformed')
        const quote = payload.quotes[0]
        if (!quote || typeof quote.price !== 'number') {
          setState({ symbol, quote: null, status: 'missing', asOf: null, delayed: true })
          return
        }
        setState({
          symbol,
          quote,
          status: 'ready',
          asOf: payload.asOf ?? null,
          delayed: payload.delayed !== false,
        })
      })
      .catch((err: Error) => {
        if (err.name === 'AbortError') return
        setState({ symbol, quote: null, status: 'failed', asOf: null, delayed: true })
      })

    return () => controller.abort()
  }, [symbol])

  /* The previous company's quote stays on screen while the next one loads —
     blanking it collapses the panel and reflows the page under the reader's
     cursor. It is reported as loading, not as ready, because it is no longer
     the quote for the symbol being asked about. */
  if (symbol && state.symbol !== symbol) {
    return { ...state, status: 'loading' }
  }
  return state
}
