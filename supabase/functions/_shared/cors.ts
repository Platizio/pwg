// Origin allowlist for the browser-facing functions.
//
// Not `*`. These endpoints are reached with the anon key, which ships in the
// site bundle and is therefore public — the origin check is not a security
// boundary on its own, but it does stop the intake endpoint being embedded in
// somebody else's page and used as a free form-to-database service under
// Platizio's rate limits and Platizio's name.
//
// ALLOWED_ORIGINS (comma-separated) overrides the defaults, which is how a
// Vercel preview deployment gets added without a code change.

const DEFAULT_ORIGINS = [
  'https://platizioglobal.com',
  'https://www.platizioglobal.com',
  'http://localhost:5173',
]

function allowlist(): string[] {
  const configured = Deno.env.get('ALLOWED_ORIGINS')
  if (!configured) return DEFAULT_ORIGINS
  return configured.split(',').map((o) => o.trim()).filter(Boolean)
}

/** Vercel preview URLs are per-deployment, so they are matched by shape. */
function isVercelPreview(origin: string): boolean {
  return /^https:\/\/[a-z0-9-]+\.vercel\.app$/.test(origin)
}

export function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get('origin') ?? ''
  const permitted = allowlist().includes(origin) || isVercelPreview(origin)

  return {
    // Echo rather than wildcard: the browser then enforces the allowlist too,
    // and a disallowed origin gets no usable response at all.
    'Access-Control-Allow-Origin': permitted ? origin : allowlist()[0],
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-turnstile-token',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  }
}

export function preflight(req: Request): Response | null {
  if (req.method !== 'OPTIONS') return null
  return new Response(null, { status: 204, headers: corsHeaders(req) })
}

export function json(req: Request, status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
  })
}

/**
 * The only error shape the browser ever sees. Detail goes to the function log,
 * never to the response — a validation message that quotes a database
 * constraint tells an attacker the schema.
 */
export function fail(req: Request, status: number, message: string, detail?: unknown): Response {
  if (detail !== undefined) console.error(`[${status}] ${message}`, detail)
  return json(req, status, { error: message })
}
