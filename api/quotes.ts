/**
 * GET /api/quotes — the site's only route to market data.
 *
 * Exists because every ViewTrade market endpoint requires a bearer token that
 * an anonymous visitor cannot have. Credentials stay server-side; the browser
 * receives ~8KB of render-ready JSON.
 *
 * Caching is what makes this cheap: with s-maxage=60, one upstream fetch serves
 * every visitor for a minute regardless of traffic.
 */

import { fetchQuotes } from './_lib/viewtrade'
import {
  buildPayload,
  buildSymbolsPayload,
  buildIndexMoves,
  buildIndexQuotes,
  buildGainersPayload,
} from './_lib/buildPayload'
import { ALL_SYMBOLS, MIN_USABLE_QUOTES } from '../Platizio_Global_Revamp/data/marketUniverse'
import { LARGE_CAP_SYMBOLS } from '../Platizio_Global_Revamp/data/largeCapSample'

/**
 * Requests are whitelisted against ALL_SYMBOLS, never passed through.
 *
 * Without this, `?symbols=` turns a public URL into an open proxy for our
 * ViewTrade credentials: anyone could bill our quota for any ticker they like.
 * The cap is a second bound on the same abuse — the terminal asks for at most
 * a handful, and the index distribution comes from `index=1`, not from a long
 * symbol list.
 */
const MAX_REQUESTED_SYMBOLS = 40

const ALLOWED = new Set(ALL_SYMBOLS)

/** Parsed `?symbols=`, uppercased, deduplicated, whitelisted, capped. */
function parseSymbols(raw: string | null): string[] {
  if (!raw) return []
  return [
    ...new Set(
      raw
        .split(',')
        .map((s) => s.trim().toUpperCase())
        .filter((s) => ALLOWED.has(s)),
    ),
  ].slice(0, MAX_REQUESTED_SYMBOLS)
}

/**
 * 60s fresh, then up to 5 minutes of stale-while-revalidate. During a ViewTrade
 * outage the CDN keeps serving the last good payload instead of failing — the
 * homepage shows slightly old prices rather than losing both sections.
 */
const CACHE_CONTROL = 'public, s-maxage=60, stale-while-revalidate=300'

function json(body: unknown, status: number, cache: string): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': cache,
    },
  })
}

export default async function handler(request: Request): Promise<Response> {
  if (request.method !== 'GET') {
    return json({ error: 'Method not allowed' }, 405, 'no-store')
  }

  const url = new URL(request.url)
  const requested = parseSymbols(url.searchParams.get('symbols'))
  const wantsIndex = url.searchParams.get('index') === '1'
  const wantsGainers = url.searchParams.get('gainers') === '1'

  try {
    // The large-cap ticker. Its own mode and its own cache key, because the
    // sample is ~500 symbols — twenty upstream batches against the default
    // call's five — and Home must not pay for a universe it never renders.
    if (wantsGainers) {
      const raws = await fetchQuotes(LARGE_CAP_SYMBOLS)
      const payload = buildGainersPayload(raws)

      if (payload.gainers.length < MIN_USABLE_QUOTES) {
        return json({ error: 'Insufficient market data' }, 503, 'no-store')
      }
      return json(payload, 200, CACHE_CONTROL)
    }

    // The default response is untouched: no query string, same payload, same
    // shape. Home has consumed it since the revamp landed and must not notice
    // that this route grew a second mode.
    if (!requested.length) {
      const raws = await fetchQuotes(ALL_SYMBOLS)
      const payload = buildPayload(raws)

      // Too little data to render either section honestly. Fail rather than
      // serve a thin payload the client would have to reject anyway — and do
      // not cache the failure for long.
      if (payload.trending.length < MIN_USABLE_QUOTES) {
        return json({ error: 'Insufficient market data' }, 503, 'no-store')
      }

      return json(payload, 200, CACHE_CONTROL)
    }

    // The distribution needs the whole index, so asking for it widens the
    // upstream call to exactly what the default mode already fetches. Without
    // it, only the named symbols are fetched — a terminal page costs one
    // small request rather than a hundred.
    const raws = await fetchQuotes(wantsIndex ? ALL_SYMBOLS : requested)
    const payload = buildSymbolsPayload(raws, requested)

    // One named symbol that could not be served is fatal for the caller in a
    // way a thin ranking is not: there is no page without it.
    if (!payload.quotes.length) {
      return json({ error: 'No usable quotes for the requested symbols' }, 503, 'no-store')
    }

    if (wantsIndex) {
      payload.indexMoves = buildIndexMoves(raws)
      payload.indexQuotes = buildIndexQuotes(raws)
      // Reuses buildPayload's ranking rather than sorting again here, so
      // "biggest movers" means exactly the same thing on the terminal as it
      // does in Home's banner.
      payload.indexLeaders = buildPayload(raws).trending
    }

    return json(payload, 200, CACHE_CONTROL)
  } catch (err) {
    // Message only — never the stack or the upstream body, either of which can
    // carry request detail. The client treats any non-200 the same way.
    console.error('[api/quotes]', (err as Error).message)
    return json({ error: 'Market data unavailable' }, 503, 'no-store')
  }
}
