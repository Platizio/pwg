// create-enquiry — the sales enquiry form's way into the database.
//
// Deliberately a near-copy of create-ticket. The two do different things with
// the row once it lands, but the intake problem is identical — an anonymous
// browser holding a public key, posting personal data, over an endpoint that
// anyone can find — and it should not be solved twice with two sets of bugs.
//
// The differences are only these:
//   - no attachments, so no signed upload URLs and no finalize step
//   - lower rate limits, because a sales enquiry is not something a person
//     legitimately files five times in an hour
//   - it writes contact_enquiries, never tickets. An enquiry carries no
//     published SLA, and putting it in the support queue would both start a
//     clock the site never promised and corrupt the SLA figures the ticketing
//     system exists to make provable.

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { preflight, json, fail } from '../_shared/cors.ts'
import { adminClient } from '../_shared/supabase.ts'
import { verifyTurnstile } from '../_shared/turnstile.ts'
import { parseEnquiryIntent, ValidationError, clientIp } from '../_shared/validation.ts'

const IP_LIMIT = 5
const EMAIL_LIMIT = 3
const WINDOW = '1 hour'

Deno.serve(async (req: Request) => {
  const early = preflight(req)
  if (early) return early

  if (req.method !== 'POST') {
    return fail(req, 405, 'Method not allowed.')
  }

  let intent
  try {
    intent = parseEnquiryIntent(await req.json())
  } catch (error) {
    if (error instanceof ValidationError) return fail(req, 400, error.message)
    return fail(req, 400, 'We could not read that request.', error)
  }

  const ip = clientIp(req)
  const userAgent = req.headers.get('user-agent')?.slice(0, 500) ?? null

  const captcha = await verifyTurnstile(req.headers.get('x-turnstile-token'), ip)
  if (!captcha.ok) {
    return fail(req, 403, captcha.message ?? 'Verification failed.')
  }

  const admin = adminClient()

  for (const [bucket, limit] of [
    [`enquiry:ip:${ip ?? 'unknown'}`, IP_LIMIT],
    [`enquiry:email:${intent.email}`, EMAIL_LIMIT],
  ] as const) {
    const { data, error } = await admin.rpc('rate_limit_consume', {
      p_bucket: bucket,
      p_limit: limit,
      p_window: WINDOW,
    })

    // Matching create-ticket: a rate limiter that cannot be reached must not
    // become an outage on the intake path. Losing an enquiry is worse than
    // failing to throttle one.
    if (error) {
      console.error('rate limit check failed; allowing the request', error)
      break
    }
    if (data && data.allowed === false) {
      console.warn('enquiry rate limit hit', bucket, data)
      return fail(req, 429, 'You have sent several enquiries recently. Please wait a little while before sending another.')
    }
  }

  const { data: created, error: createError } = await admin.rpc('create_contact_enquiry', {
    payload: {
      idempotencyKey: intent.idempotencyKey,
      fullName: intent.fullName,
      email: intent.email,
      phoneRaw: intent.phoneRaw,
      phoneDigits: intent.phoneDigits,
      interestId: intent.interestId,
      message: intent.message,
      captchaVerified: captcha.verified,
      ip,
      userAgent,
      consent: intent.consent,
    },
  })

  if (createError) {
    return fail(req, 500, 'We could not send that enquiry. Please try again in a moment.', createError)
  }

  return json(req, 200, {
    enquiryRef: created.enquiryRef,
    deduplicated: created.deduplicated === true,
  })
})
