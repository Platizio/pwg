/**
 * ViewTrade transport. Auth and HTTP only — no ranking, no formatting.
 *
 * Underscore-prefixed so Vercel treats it as a module, not a route.
 *
 * Everything here was verified against UAT on 2026-08-17; see
 * Platizio_Global_Revamp/docs/03-viewtrade-api.md for the observed responses.
 */

const BASE_URL = process.env.VIEWTRADE_BASE_URL ?? ''
const API_KEY = process.env.VIEWTRADE_API_KEY ?? ''
const API_SECRET = process.env.VIEWTRADE_API_SECRET ?? ''

/** Symbols per quote call. 25 returned in 39ms during the Phase 0 spike. */
const BATCH_SIZE = 25

/** Renew this far before expiry so a request can't race the deadline. */
const TOKEN_SAFETY_MS = 60_000

const REQUEST_TIMEOUT_MS = 8_000

/** The subset of ViewTrade's 92 quote fields we actually read. */
export interface RawQuote {
  symbol: string
  companyName: string | null
  lastPrice: number | null
  /** A FRACTION, not a percentage. 0.0042 means 0.42%. */
  changePercent: number | null
  change: number | null
  currency: string | null
  delayed: boolean | null
  notPermissioned: boolean | null
  notFound: boolean | null
  updateTime: string | null
  yesterdayClose: number | null
  precision: number | null
}

export class ViewTradeError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message)
    this.name = 'ViewTradeError'
  }
}

/** Fails fast and loudly at cold start rather than mid-request. */
function assertConfigured(): void {
  const missing = [
    !BASE_URL && 'VIEWTRADE_BASE_URL',
    !API_KEY && 'VIEWTRADE_API_KEY',
    !API_SECRET && 'VIEWTRADE_API_SECRET',
  ].filter(Boolean)

  if (missing.length) {
    throw new ViewTradeError(`Missing environment variables: ${missing.join(', ')}`)
  }
}

async function fetchWithTimeout(url: string, init: RequestInit = {}): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    return await fetch(url, { ...init, signal: controller.signal })
  } catch (err) {
    const reason = (err as Error)?.name === 'AbortError'
      ? `timed out after ${REQUEST_TIMEOUT_MS}ms`
      : (err as Error).message
    // Deliberately does not echo `init` — it carries the API secret on login.
    throw new ViewTradeError(`Request failed: ${reason}`)
  } finally {
    clearTimeout(timer)
  }
}

/* ------------------------------------------------------------------ token */

let tokenCache: { token: string; expiresAtMs: number } | null = null

/**
 * B2B access token, cached in module scope for the life of the warm instance.
 *
 * Verified: returns 201 (not 200), and `access_expires_at` is unix SECONDS —
 * hence the x1000.
 */
export async function getAccessToken(): Promise<string> {
  assertConfigured()

  if (tokenCache && Date.now() < tokenCache.expiresAtMs - TOKEN_SAFETY_MS) {
    return tokenCache.token
  }

  const res = await fetchWithTimeout(`${BASE_URL}/uma/api/v1/auth/b2b/login/api-keys`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ api_key: API_KEY, api_secret: API_SECRET }),
  })

  if (!res.ok) {
    // Status only. The body of a failed auth call can echo the credential.
    throw new ViewTradeError(`Auth failed with status ${res.status}`, res.status)
  }

  const json = (await res.json()) as {
    api_keys_login?: { tokens?: { access_token?: string; access_expires_at?: number } }
  }

  const token = json?.api_keys_login?.tokens?.access_token
  const expiresAtSeconds = json?.api_keys_login?.tokens?.access_expires_at

  if (!token) throw new ViewTradeError('Auth succeeded but no access_token in response')

  tokenCache = {
    token,
    // Fall back to a conservative 5 minutes if the expiry is ever absent.
    expiresAtMs: expiresAtSeconds ? expiresAtSeconds * 1000 : Date.now() + 5 * 60_000,
  }
  return token
}

/** Testing seam — lets a harness force the next call to re-authenticate. */
export function resetTokenCache(): void {
  tokenCache = null
}

/* ----------------------------------------------------------------- quotes */

function chunk<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

/**
 * Quotes for any number of symbols, batched and fetched in parallel.
 *
 * A failed batch resolves to [] rather than rejecting the whole call: losing
 * 25 of 100 symbols should thin the ranking, not blank the section. A total
 * failure still surfaces, because the caller checks the final count.
 */
export async function fetchQuotes(symbols: readonly string[]): Promise<RawQuote[]> {
  if (!symbols.length) return []
  let token = await getAccessToken()

  type BatchResult = { rows: RawQuote[]; unauthorized: boolean }

  const runBatch = async (batch: string[], bearer: string): Promise<BatchResult> => {
    try {
      const url = `${BASE_URL}/aes/api/quotes/equity?symbols=${batch.join(',')}`
      const res = await fetchWithTimeout(url, { headers: { Authorization: `Bearer ${bearer}` } })
      if (res.status === 401 || res.status === 403) return { rows: [], unauthorized: true }
      if (!res.ok) return { rows: [], unauthorized: false }
      const json = await res.json()
      return { rows: Array.isArray(json) ? (json as RawQuote[]) : [], unauthorized: false }
    } catch {
      return { rows: [], unauthorized: false }
    }
  }

  const chunks = chunk(symbols, BATCH_SIZE)
  let batches = await Promise.all(chunks.map((batch) => runBatch(batch, token)))

  /* A token can be revoked upstream before the expiry it advertised. Without
     this the module-scoped cache keeps handing out the dead one for the rest of
     its stated life, every batch comes back empty, and the handler 503s on a
     warm instance until the clock catches up — a failure that looks like the
     gateway being down and is not. Re-authenticate once and replay only the
     batches that were actually refused. */
  if (batches.some((b) => b.unauthorized)) {
    resetTokenCache()
    token = await getAccessToken()
    batches = await Promise.all(
      batches.map((b, i) => (b.unauthorized ? runBatch(chunks[i], token) : Promise.resolve(b))),
    )
  }

  return batches.flatMap((b) => b.rows)
}
