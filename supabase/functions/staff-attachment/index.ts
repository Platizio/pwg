// staff-attachment — hands one staff member a 60-second link to one document,
// and writes down that they asked for it.
//
// Until 0020 this function did not need to exist: staff had a storage SELECT
// policy over the whole ticket-attachments bucket, so any console could mint a
// signed URL client-side. That was convenient and it was the wrong shape. The
// files in that bucket are address proofs, bank statements and government IDs,
// and the arrangement meant any agent could read all of them leaving no trace.
//
// 0020 narrowed the storage policy to ADMIN break-glass. Ordinary access now
// has to come through here, because minting a signed URL requires the service
// key and the service key is not in the browser. That is the enforcement: not
// a rule asking clients to log their reads, but the removal of any way to read
// without logging.
//
// The link is deliberately short-lived. A signed URL is a bearer token for the
// document — pasted into a chat window it works for whoever finds it — so it
// lives about as long as it takes the browser to follow it.

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { preflight, json, fail } from '../_shared/cors.ts'
import { adminClient, userClient, ATTACHMENT_BUCKET } from '../_shared/supabase.ts'
import { clientIp } from '../_shared/validation.ts'

const SIGNED_URL_TTL_SECONDS = 60
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Two different things arrive as error code 42501, and only one of them is safe
 * to repeat to the caller.
 *
 *   require_staff() raising — "This action requires an active staff account".
 *   Written for the person reading it, describes their own situation, and is
 *   the whole point of granting these functions to `authenticated` rather than
 *   hiding them: a signed-in agent should learn why they were refused.
 *
 *   PostgREST's grant check failing — "permission denied for function
 *   staff_open_attachment". Written for a DBA, and it hands the name of an
 *   internal function to whoever asked. An anon caller reaches exactly this
 *   one, and the anon key ships in the site bundle.
 *
 * So messages are passed through only when they are recognisably ours. The
 * allowlist is by prefix rather than by content, because a new refusal added to
 * a migration later should default to being withheld, not to being echoed.
 */
const OURS = ['This action requires', 'attachment ', 'Closing a grievance', 'You cannot ']

function speakable(message?: string): string {
  const text = (message ?? '').trim()
  if (OURS.some((prefix) => text.startsWith(prefix))) return text
  return 'You do not have permission to open that attachment.'
}

interface OpenResult {
  attachmentId: string
  ticketId: string
  bucketId: string
  storagePath: string
  filename: string
  mime: string
  bytes: number
}

Deno.serve(async (req: Request) => {
  const early = preflight(req)
  if (early) return early

  if (req.method !== 'POST') return fail(req, 405, 'Method not allowed.')

  let body: { attachmentId?: string; reason?: string }
  try {
    body = await req.json()
  } catch (error) {
    return fail(req, 400, 'We could not read that request.', error)
  }

  const attachmentId = (body.attachmentId ?? '').trim()
  if (!UUID_RE.test(attachmentId)) {
    return fail(req, 400, 'A valid attachment id is required.')
  }

  const reason = (body.reason ?? '').trim()
  if (reason && (reason.length < 3 || reason.length > 500)) {
    return fail(req, 400, 'A reason, if given, should be between 3 and 500 characters.')
  }

  // As the caller, never as the service. auth.uid() inside the RPC has to be
  // the actual staff member — that uuid is the entire value of the log entry.
  const asCaller = userClient(req)

  // The log row is written by this call, before any URL exists. If the signing
  // step below then fails, the trail records an access that produced no bytes.
  // That is the right way round: an over-recorded attempt is noise, an
  // unrecorded successful read is the thing this function was built to prevent.
  const { data, error } = await asCaller.rpc('staff_open_attachment', {
    p_attachment_id: attachmentId,
    p_reason: reason || null,
    p_client_ip: clientIp(req),
    p_user_agent: req.headers.get('user-agent'),
  })

  if (error) {
    const code = error.code ?? ''
    if (code === '42501' || code === 'PGRST301') {
      return fail(req, 403, speakable(error.message), error)
    }
    if (code === 'P0002') return fail(req, 404, 'That attachment no longer exists.', error)
    if (code === '22023') return fail(req, 409, speakable(error.message), error)
    console.error('staff_open_attachment failed', error)
    return fail(req, 500, 'We could not open that attachment just now.')
  }

  const opened = data as OpenResult

  // The path came from our own table, but the bucket name is used to address
  // storage and a row that somehow named a different bucket should not be able
  // to steer this function at it.
  if (opened.bucketId !== ATTACHMENT_BUCKET) {
    console.error('attachment row names an unexpected bucket', opened.bucketId)
    return fail(req, 500, 'We could not open that attachment just now.')
  }

  const { data: signed, error: signError } = await adminClient()
    .storage
    .from(ATTACHMENT_BUCKET)
    .createSignedUrl(opened.storagePath, SIGNED_URL_TTL_SECONDS, {
      // Serve as a download with the customer's original filename rather than
      // the storage key, which is a uuid path and tells the agent nothing.
      download: opened.filename,
    })

  if (signError || !signed?.signedUrl) {
    console.error('could not sign attachment url', signError)
    return fail(req, 502, 'The document store did not answer. Please try again in a moment.')
  }

  return json(req, 200, {
    url: signed.signedUrl,
    filename: opened.filename,
    mime: opened.mime,
    bytes: opened.bytes,
    ticketId: opened.ticketId,
    expiresInSeconds: SIGNED_URL_TTL_SECONDS,
  })
})
