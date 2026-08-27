import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { preflight, json, fail } from '../_shared/cors.ts'
import { adminClient } from '../_shared/supabase.ts'
import { clientIp } from '../_shared/validation.ts'
import { sha256Hex } from '../_shared/tokens.ts'

const TOKEN_RE = /^[A-Za-z0-9_-]{40,64}$/

const IP_LIMIT = 60
const WINDOW = '1 hour'

Deno.serve(async (req: Request) => {
  const early = preflight(req)
  if (early) return early

  if (req.method !== 'POST') return fail(req, 405, 'Method not allowed.')

  let body: { token?: string }
  try {
    body = await req.json()
  } catch (error) {
    return fail(req, 400, 'We could not read that request.', error)
  }

  const token = (body.token ?? '').trim()
  if (!TOKEN_RE.test(token)) {
    return json(req, 200, { valid: false, reason: 'expired' })
  }

  const admin = adminClient()
  const ip = clientIp(req)

  const { data: limit, error: limitError } = await admin.rpc('rate_limit_consume', {
    p_bucket: `status-lookup:ip:${ip ?? 'unknown'}`,
    p_limit: IP_LIMIT,
    p_window: WINDOW,
  })

  if (limitError) {
    console.error('rate limit check failed; allowing the lookup', limitError)
  } else if (limit && limit.allowed === false) {
    return fail(req, 429, 'Too many requests. Please wait a moment and try again.')
  }

  const { data, error } = await admin.rpc('lookup_tickets_by_token', {
    p_token_hash: await sha256Hex(token),
  })

  if (error) {
    console.error('status lookup failed', error)
    return fail(req, 500, 'We could not load your requests just now. Please try again in a moment.')
  }

  return json(req, 200, data)
})
