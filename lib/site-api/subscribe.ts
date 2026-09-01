/**
 * POST /api/subscribe — newsletter signup.
 *
 * Provider-agnostic on purpose. Set NEWSLETTER_WEBHOOK_URL to any endpoint that
 * accepts a JSON body — Buttondown, Mailchimp via Zapier, a Google Apps Script,
 * an internal CRM. Nothing here is tied to one vendor.
 *
 * With no webhook configured it returns 503 and the form says so. That is
 * deliberate: the alternative is accepting an address, discarding it, and
 * telling the visitor they are subscribed. A signup form that lies is worse
 * than one that is honestly not live yet.
 */

const WEBHOOK_URL = process.env.NEWSLETTER_WEBHOOK_URL ?? ''
const REQUEST_TIMEOUT_MS = 8_000

/**
 * Deliberately permissive. Email validation by regex is a well-known trap —
 * strict patterns reject valid addresses (plus-addressing, new TLDs, unicode
 * domains). This catches obvious typos; the provider does the real validation,
 * and a confirmation email is what actually proves an address works.
 */
function looksLikeEmail(value: unknown): value is string {
  return typeof value === 'string'
    && value.length >= 6
    && value.length <= 254
    && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  })
}

export default async function handler(request: Request): Promise<Response> {
  if (request.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405)
  }

  let email: unknown
  try {
    const body = await request.json()
    email = (body as { email?: unknown })?.email
  } catch {
    return json({ error: 'Send a JSON body with an email field.' }, 400)
  }

  if (!looksLikeEmail(email)) {
    return json({ error: 'That does not look like an email address.' }, 400)
  }

  if (!WEBHOOK_URL) {
    // Never log the address itself — an unconfigured endpoint should not be
    // quietly collecting personal data into a log stream.
    console.warn('[api/subscribe] NEWSLETTER_WEBHOOK_URL is not set; signup rejected')
    return json({ error: 'Newsletter signups are not live yet.' }, 503)
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

  try {
    const res = await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, source: 'platizio-global/media' }),
      signal: controller.signal,
    })

    if (!res.ok) {
      // Status only. A provider's error body can echo the submitted address.
      console.error(`[api/subscribe] provider responded ${res.status}`)
      return json({ error: 'Could not sign you up just now.' }, 502)
    }

    return json({ ok: true }, 200)
  } catch (err) {
    const reason = (err as Error)?.name === 'AbortError' ? 'timed out' : 'request failed'
    console.error(`[api/subscribe] ${reason}`)
    return json({ error: 'Could not sign you up just now.' }, 502)
  } finally {
    clearTimeout(timer)
  }
}
