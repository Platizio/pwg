import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { preflight, json, fail } from '../_shared/cors.ts'
import { adminClient } from '../_shared/supabase.ts'
import { verifyTurnstile } from '../_shared/turnstile.ts'
import { clientIp } from '../_shared/validation.ts'
import { newAccessToken, sha256Hex, siteUrl, TOKEN_TTL_MINUTES } from '../_shared/tokens.ts'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const EMAIL_LIMIT = 3
const IP_LIMIT = 10
const WINDOW = '1 hour'

const SAME_ANSWER = {
  ok: true,
  message: 'If we have any requests from that email address, a link is on its way to it.',
}

Deno.serve(async (req: Request) => {
  const early = preflight(req)
  if (early) return early

  if (req.method !== 'POST') return fail(req, 405, 'Method not allowed.')

  let body: { email?: string }
  try {
    body = await req.json()
  } catch (error) {
    return fail(req, 400, 'We could not read that request.', error)
  }

  const email = (body.email ?? '').trim().toLowerCase()
  if (!EMAIL_RE.test(email) || email.length > 254) {
    return fail(req, 400, 'Please enter a valid email address.')
  }

  const ip = clientIp(req)

  const captcha = await verifyTurnstile(req.headers.get('x-turnstile-token'), ip)
  if (!captcha.ok) return fail(req, 403, captcha.message ?? 'Verification failed.')

  const admin = adminClient()

  for (const [bucket, limit] of [
    [`status:ip:${ip ?? 'unknown'}`, IP_LIMIT],
    [`status:email:${email}`, EMAIL_LIMIT],
  ] as const) {
    const { data, error } = await admin.rpc('rate_limit_consume', {
      p_bucket: bucket,
      p_limit: limit,
      p_window: WINDOW,
    })

    if (error) {
      console.error('rate limit check failed; refusing to send', error)
      return fail(req, 503, 'We could not process that just now. Please try again in a moment.')
    }
    if (data && data.allowed === false) {
      console.warn('status link rate limit hit', bucket, data)
      return json(req, 200, SAME_ANSWER)
    }
  }

  const token = newAccessToken()
  const tokenHash = await sha256Hex(token)
  const linkUrl = `${siteUrl()}/help/status?token=${token}`

  const { data, error } = await admin.rpc('request_status_link', {
    payload: {
      email,
      tokenHash,
      linkUrl,
      ttlMinutes: TOKEN_TTL_MINUTES,
      ip,
    },
  })

  if (error) {
    console.error('could not queue a status link', error)
    return fail(req, 500, 'We could not send that link. Please try again in a moment.')
  }

  console.log(
    data?.queued
      ? `status link queued (${data.ticketCount} ticket(s))`
      : 'status link requested for an address with no tickets — nothing sent',
  )

  return json(req, 200, SAME_ANSWER)
})
