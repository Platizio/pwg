/**
 * GET /api/news — US financial-market headlines for the media rail.
 *
 * Backed by NewsAPI.ai (Event Registry) on a FINITE quota: 2000 searches total,
 * not per month. Caching is therefore the primary design constraint, not an
 * optimisation. At s-maxage 12h the worst case is two upstream calls a day —
 * roughly 730 a year, so the pool lasts years. Shortening this cache is the
 * fastest way to burn the quota; do not do it without recounting.
 *
 * When the upstream fails, or the quota finally runs out, the endpoint serves
 * the curated list instead of an error. The rail always renders.
 */

import { NEWS as CURATED, type NewsItem } from '../Platizio_Global_Revamp/data/mediaNews'

const API_KEY = process.env.NEWSAPI_AI_KEY ?? ''
const ENDPOINT = 'https://eventregistry.org/api/v1/article/getArticles'

/** 12h fresh, then a day of stale-while-revalidate. See the quota note above. */
const CACHE_LIVE = 'public, s-maxage=43200, stale-while-revalidate=86400'
/** Shorter on fallback, so a transient outage isn't pinned for half a day. */
const CACHE_FALLBACK = 'public, s-maxage=3600, stale-while-revalidate=86400'

const REQUEST_TIMEOUT_MS = 9_000
const WANT = 8
/** Over-fetch, because filtering discards a good third of a page. */
const FETCH_COUNT = 30
/** No more than this from any one publisher — see SOURCE_CAP note below. */
const SOURCE_CAP = 2

/**
 * Matched against the title. These are wire roundups and filing boilerplate:
 * technically on-topic, worthless to a reader deciding whether to invest.
 * The spike returned three consecutive "Dow Jones Top ... Headlines at 1 AM ET"
 * items from one source.
 */
const LOW_VALUE_TITLE = /(top (company|markets?|energy|business) headlines at)|(earnings call (presentation|transcript))|(q[1-4] \d{4} - results)|^\s*briefing:/i

/**
 * Unambiguous US-market proper nouns only.
 *
 * "US stocks" and "US markets" were removed: the API tokenises multi-word
 * keywords, so they matched a bare "markets" and admitted Indian and UK market
 * stories. Every term here names a US index, exchange or institution and
 * cannot match another market's coverage.
 */
const US_MARKET_KEYWORDS = [
  'S&P 500', 'Nasdaq', 'Dow Jones', 'Wall Street', 'Federal Reserve', 'NYSE',
]

/**
 * Second line of defence. A headline naming another market's index is not US
 * market news, however it matched. Cheaper and more honest than pretending the
 * keyword filter is perfect.
 */
const OTHER_MARKET = /\b(sensex|nifty|bse|ftse|nikkei|hang seng|dax|cac 40|asx|kospi|shanghai composite|indian (stock )?market)\b/i

/**
 * Some feeds set source.title to a bare URL. Rendering that as the card label
 * shows the reader "https://www.outloo" — turn it into a domain name instead.
 */
function cleanSource(title: string | undefined): string {
  const raw = (title ?? '').trim()
  if (!raw) return 'Newswire'
  if (!/^https?:\/\//i.test(raw)) return raw
  try {
    const host = new URL(raw).hostname.replace(/^www\./, '')
    const name = host.split('.')[0]
    return name.charAt(0).toUpperCase() + name.slice(1)
  } catch {
    return 'Newswire'
  }
}

export interface LiveNewsItem {
  kind: string
  headline: string
  date: string
  href: string
  external: true
  source?: string
}

interface RawArticle {
  title?: string
  url?: string
  dateTime?: string
  date?: string
  isDuplicate?: boolean
  source?: { title?: string }
}

function json(body: unknown, status: number, cache: string): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': cache },
  })
}

/** Curated entries, shaped exactly like live ones so the client cannot tell them apart structurally. */
function curatedPayload() {
  const items = [...CURATED]
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, WANT)
    .map((n: NewsItem) => ({
      kind: n.kind,
      headline: n.headline,
      date: n.date,
      href: n.href,
      external: Boolean(n.external),
    }))
  return { items, source: 'curated' as const }
}

/** Collapses syndicated copies the API's own isDuplicate flag misses. */
function titleKey(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().slice(0, 60)
}

function selectArticles(raw: RawArticle[]): LiveNewsItem[] {
  const seenTitle = new Set<string>()
  const perSource = new Map<string, number>()
  const out: LiveNewsItem[] = []

  for (const a of raw) {
    if (!a?.title || !a?.url || a.isDuplicate) continue
    if (LOW_VALUE_TITLE.test(a.title)) continue
    if (OTHER_MARKET.test(a.title)) continue

    const key = titleKey(a.title)
    if (seenTitle.has(key)) continue

    // One publisher must not own the rail. Without this the spike's three
    // consecutive Morningstar items would have taken 3 of 8 slots.
    const source = cleanSource(a.source?.title)
    const used = perSource.get(source) ?? 0
    if (used >= SOURCE_CAP) continue

    seenTitle.add(key)
    perSource.set(source, used + 1)

    out.push({
      kind: source,
      headline: a.title.trim(),
      date: (a.dateTime ?? a.date ?? '').slice(0, 10),
      href: a.url,
      external: true,
      source,
    })

    if (out.length >= WANT) break
  }
  return out
}

export default async function handler(request: Request): Promise<Response> {
  if (request.method !== 'GET') {
    return json({ error: 'Method not allowed' }, 405, 'no-store')
  }

  if (!API_KEY) {
    console.warn('[api/news] NEWSAPI_AI_KEY not set; serving curated list')
    return json(curatedPayload(), 200, CACHE_FALLBACK)
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

  try {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        action: 'getArticles',
        keyword: US_MARKET_KEYWORDS,
        keywordOper: 'or',
        // Exact phrases. Without this the API tokenises "US markets" and matches a
        // bare "markets", which pulled Sensex and Nifty stories into a rail that
        // is supposed to be US-only.
        keywordSearchMode: 'phrase',
        // Match in the TITLE only. Matching the body returned UK and unrelated
        // stories that merely mentioned Wall Street in passing.
        keywordLoc: 'title',
        lang: 'eng',
        dataType: ['news'],
        isDuplicateFilter: 'skipDuplicates',
        articlesPage: 1,
        articlesCount: FETCH_COUNT,
        articlesSortBy: 'date',
        resultType: 'articles',
        apiKey: API_KEY,
      }),
    })

    if (!res.ok) {
      console.error(`[api/news] upstream responded ${res.status}; serving curated`)
      return json(curatedPayload(), 200, CACHE_FALLBACK)
    }

    const body = await res.json()
    if (body?.error) {
      // Quota exhaustion arrives as a 200 with an error field, not an HTTP error.
      console.error('[api/news] upstream error field set; serving curated')
      return json(curatedPayload(), 200, CACHE_FALLBACK)
    }

    const items = selectArticles(body?.articles?.results ?? [])

    // A thin result usually means the query or the filters misfired. Curated
    // beats a two-item rail.
    if (items.length < 4) {
      console.warn(`[api/news] only ${items.length} usable articles; serving curated`)
      return json(curatedPayload(), 200, CACHE_FALLBACK)
    }

    return json({ items, source: 'live' as const }, 200, CACHE_LIVE)
  } catch (err) {
    const reason = (err as Error)?.name === 'AbortError' ? 'timed out' : (err as Error).message
    console.error(`[api/news] ${reason}; serving curated`)
    return json(curatedPayload(), 200, CACHE_FALLBACK)
  } finally {
    clearTimeout(timer)
  }
}
