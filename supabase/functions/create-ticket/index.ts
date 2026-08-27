import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { preflight, json, fail } from '../_shared/cors.ts'
import { adminClient, ATTACHMENT_BUCKET } from '../_shared/supabase.ts'
import { verifyTurnstile } from '../_shared/turnstile.ts'
import { parseTicketIntent, ValidationError, clientIp } from '../_shared/validation.ts'

const IP_LIMIT = 10
const EMAIL_LIMIT = 5
const WINDOW = '1 hour'

Deno.serve(async (req: Request) => {
  const early = preflight(req)
  if (early) return early

  if (req.method !== 'POST') {
    return fail(req, 405, 'Method not allowed.')
  }

  let intent
  try {
    intent = parseTicketIntent(await req.json())
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
    [`intake:ip:${ip ?? 'unknown'}`, IP_LIMIT],
    [`intake:email:${intent.email}`, EMAIL_LIMIT],
  ] as const) {
    const { data, error } = await admin.rpc('rate_limit_consume', {
      p_bucket: bucket,
      p_limit: limit,
      p_window: WINDOW,
    })

    if (error) {
      console.error('rate limit check failed; allowing the request', error)
      break
    }
    if (data && data.allowed === false) {
      console.warn('rate limit hit', bucket, data)
      return fail(req, 429, 'You have sent several requests recently. Please wait a little while before sending another.')
    }
  }

  const { data: created, error: createError } = await admin.rpc('create_support_ticket', {
    payload: {
      idempotencyKey: intent.idempotencyKey,
      fullName: intent.fullName,
      email: intent.email,
      mobileRaw: intent.mobileRaw,
      mobileDigits: intent.mobileDigits,
      categoryId: intent.categoryId,
      subcategoryId: intent.subcategoryId,
      priority: intent.priority,
      source: intent.source,
      subject: intent.subject,
      description: intent.description,
      captchaVerified: captcha.verified,
      ip,
      userAgent,
      consent: intent.consent,
      attachments: intent.attachments.map((a) => ({
        filename: a.filename,
        safeName: a.safeName,
        mime: a.mime,
        bytes: a.bytes,
      })),
    },
  })

  if (createError) {
    if (createError.code === '23503') {
      return fail(req, 400, 'That category is no longer available. Please reload the page and try again.', createError)
    }
    return fail(req, 500, 'We could not log your request. Please try again in a moment.', createError)
  }

  const uploads: Array<{ index: number; attachmentId: string; filename: string; signedUrl: string }> = []
  const unavailable: string[] = []

  const requested = (created?.attachments ?? []) as Array<{
    attachmentId: string
    path: string
    filename: string
  }>

  for (const [index, attachment] of requested.entries()) {
    const { data: signed, error: signError } = await admin
      .storage
      .from(ATTACHMENT_BUCKET)
      .createSignedUploadUrl(attachment.path)

    if (signError || !signed) {
      console.error('could not sign an upload URL', attachment.path, signError)
      unavailable.push(attachment.filename)
      continue
    }

    uploads.push({
      index,
      attachmentId: attachment.attachmentId,
      filename: attachment.filename,
      signedUrl: signed.signedUrl,
    })
  }

  return json(req, 200, {
    ticketId: created.ticketId,
    ticketRef: created.ticketRef,
    deduplicated: created.deduplicated === true,
    uploads,
    unavailable,
  })
})
