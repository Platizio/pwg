import { useEffect, useState } from 'react'
import type { Quote, GainersResponse } from '../types/market'
import { MIN_USABLE_QUOTES } from '../data/marketUniverse'

export interface GainersData {
  /** null = still loading (render the skeleton). [] = give up, hide the strip. */
  gainers: Quote[] | null
  /** The wording that must travel with the ranking. */
  basis: string | null
  /** How many of the sample actually quoted. */
  counted: number
  asOf: string | null
  delayed: boolean
}

/**
 * The day's risers among the large-cap sample.
 *
 * Modelled on useMarketData, and for the same reasons: the initial state is
 * identical on the server and the client's first render, because
 * scripts/prerender.mjs captures React's initial render and anything resolved
 * during SSR would be markup the browser then contradicts. The fetch lives
 * strictly in an effect, which never runs during renderToString.
 *
 * No polling. One fetch per page load; the proxy's 60s CDN cache makes a
 * refresh loop pointless and it would keep a tab talking to the origin forever.
 */
export function useGainers(): GainersData {
  const [data, setData] = useState<GainersResponse | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    const controller = new AbortController()

    fetch('/api/quotes?gainers=1', { signal: controller.signal })
      .then((res) => {
        if (!res.ok) throw new Error(`gainers responded ${res.status}`)
        return res.json() as Promise<GainersResponse>
      })
      .then((payload) => {
        // Guard the shape rather than trusting it: a proxy that returns 200
        // with something unexpected should hide the strip, not render
        // `undefined` into the page.
        if (!Array.isArray(payload?.gainers)) throw new Error('gainers payload malformed')
        setData(payload)
      })
      .catch((err: Error) => {
        // An abort is this component unmounting, not a failure.
        if (err.name === 'AbortError') return
        setFailed(true)
      })

    return () => controller.abort()
  }, [])

  if (failed) return { gainers: [], basis: null, counted: 0, asOf: null, delayed: true }
  if (!data) return { gainers: null, basis: null, counted: 0, asOf: null, delayed: true }

  return {
    // Too thin to render honestly — a strip of three where fourteen belong
    // reads as broken, so it removes itself instead.
    gainers: data.gainers.length >= MIN_USABLE_QUOTES ? data.gainers : [],
    basis: data.basis ?? null,
    counted: data.counted ?? 0,
    asOf: data.asOf ?? null,
    // Absent means unknown, and unknown must disclose.
    delayed: data.delayed !== false,
  }
}
