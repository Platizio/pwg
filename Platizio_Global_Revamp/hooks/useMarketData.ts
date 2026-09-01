"use client"

import { useEffect, useState } from 'react'
import type { Quote, QuotesResponse } from '../types/market'
import { MIN_USABLE_QUOTES } from '../data/marketUniverse'

export interface MarketData {
  /** null = still loading (render the skeleton). [] = give up, hide the section. */
  trending: Quote[] | null
  popular: Quote[] | null
  asOf: string | null
  delayed: boolean
}

/**
 * Fetches /api/quotes once per page load.
 *
 * The initial state is deliberately identical on the server and on the
 * client's first render — both produce `null`, both render the skeleton.
 * scripts/prerender.mjs captures React's initial render, so anything this hook
 * resolved during SSR would be markup the browser then contradicts. The fetch
 * therefore lives strictly in an effect, which never runs during
 * renderToString.
 *
 * There is no polling. One fetch, one page load; the proxy's 60s CDN cache
 * makes a refresh loop pointless and it would keep a tab talking to the origin
 * forever.
 */
export function useMarketData(): MarketData {
  const [data, setData] = useState<QuotesResponse | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    const controller = new AbortController()

    fetch('/api/quotes', { signal: controller.signal })
      .then((res) => {
        if (!res.ok) throw new Error(`quotes responded ${res.status}`)
        return res.json() as Promise<QuotesResponse>
      })
      .then((payload) => {
        // Guard the shape rather than trusting it: a proxy that returns 200
        // with something unexpected should hide the sections, not render
        // `undefined` into the page.
        if (!Array.isArray(payload?.trending) || !Array.isArray(payload?.popular)) {
          throw new Error('quotes payload malformed')
        }
        setData(payload)
      })
      .catch((err: Error) => {
        // An abort is this component unmounting, not a failure. Setting state
        // here would warn about updating an unmounted component and, worse,
        // hide the sections on a route change back.
        if (err.name === 'AbortError') return
        setFailed(true)
      })

    return () => controller.abort()
  }, [])

  if (failed) {
    return { trending: [], popular: [], asOf: null, delayed: true }
  }

  if (!data) {
    return { trending: null, popular: null, asOf: null, delayed: true }
  }

  // Too thin to render honestly — a grid of three cards where eight belong
  // reads as broken, so the section removes itself instead.
  const enough = (quotes: Quote[]) => (quotes.length >= MIN_USABLE_QUOTES ? quotes : [])

  return {
    trending: enough(data.trending),
    popular: enough(data.popular),
    asOf: data.asOf ?? null,
    // Absent means unknown, and unknown must disclose. Only an explicit false
    // removes the delayed notice.
    delayed: data.delayed !== false,
  }
}
