import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { preflight, json, fail } from '../_shared/cors.ts'
import { adminClient, ATTACHMENT_BUCKET, sniffMime } from '../_shared/supabase.ts'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const ALLOWED_MIME = ['application/pdf', 'image/png', 'image/jpeg']
const MAX_BYTES = 5 * 1024 * 1024

interface AttachmentRow {
  id: string
  storage_path: string
  original_filename: string
  declared_mime: string
  verification_state: string
}

interface Verdict {
  attachmentId: string
  state: 'VERIFIED' | 'REJECTED' | 'MISSING'
  verifiedMime?: string
  verifiedBytes?: number
  reason?: string
}

Deno.serve(async (req: Request) => {
  const early = preflight(req)
  if (early) return early

  if (req.method !== 'POST') return fail(req, 405, 'Method not allowed.')

  let body: { ticketId?: string; idempotencyKey?: string }
  try {
    body = await req.json()
  } catch (error) {
    return fail(req, 400, 'We could not read that request.', error)
  }

  const ticketId = (body.ticketId ?? '').trim()
  const idempotencyKey = (body.idempotencyKey ?? '').trim()
  if (!UUID_RE.test(ticketId)) return fail(req, 400, 'That request identifier was not readable.')

  const admin = adminClient()

  const { data: ticket, error: ticketError } = await admin
    .from('tickets')
    .select('id, ticket_ref, idempotency_key')
    .eq('id', ticketId)
    .maybeSingle()

  if (ticketError) return fail(req, 500, 'We could not confirm your request.', ticketError)
  if (!ticket) return fail(req, 404, 'We could not find that request.')

  if (!ticket.idempotency_key || ticket.idempotency_key !== idempotencyKey) {
    return fail(req, 403, 'We could not confirm your request.', {
      reason: ticket.idempotency_key ? 'idempotency key mismatch' : 'ticket was not raised through the form',
      ticketId,
    })
  }

  const { data: attachments, error: attachmentError } = await admin
    .from('ticket_attachments')
    .select('id, storage_path, original_filename, declared_mime, verification_state')
    .eq('ticket_id', ticketId)
    .eq('verification_state', 'PENDING')

  if (attachmentError) return fail(req, 500, 'We could not confirm your request.', attachmentError)

  const verdicts: Verdict[] = []
  for (const row of (attachments ?? []) as AttachmentRow[]) {
    verdicts.push(await inspect(admin, row))
  }

  for (const verdict of verdicts) {
    if (verdict.state !== 'REJECTED') continue
    const row = (attachments as AttachmentRow[]).find((a) => a.id === verdict.attachmentId)
    if (!row) continue
    const { error } = await admin.storage.from(ATTACHMENT_BUCKET).remove([row.storage_path])
    if (error) console.error('could not remove a rejected object', row.storage_path, error)
  }

  const { data: finalized, error: finalizeError } = await admin.rpc('finalize_support_ticket', {
    p_ticket_id: ticketId,
    p_results: verdicts,
  })

  if (finalizeError) {
    return fail(req, 500, 'Your request was logged, but we could not confirm the attachments.', finalizeError)
  }

  const failed = verdicts
    .filter((v) => v.state !== 'VERIFIED')
    .map((v) => {
      const row = (attachments as AttachmentRow[]).find((a) => a.id === v.attachmentId)
      return row?.original_filename ?? 'a file'
    })

  return json(req, 200, {
    ticketRef: finalized?.ticketRef ?? ticket.ticket_ref,
    acknowledgementQueued: finalized?.acknowledgementQueued === true,
    attachmentsVerified: finalized?.attachmentsVerified ?? 0,
    failedAttachments: failed,
  })
})

async function inspect(
  admin: ReturnType<typeof adminClient>,
  row: AttachmentRow,
): Promise<Verdict> {
  const slash = row.storage_path.lastIndexOf('/')
  const folder = row.storage_path.slice(0, slash)
  const name = row.storage_path.slice(slash + 1)

  const { data: listed, error: listError } = await admin
    .storage
    .from(ATTACHMENT_BUCKET)
    .list(folder, { search: name, limit: 1 })

  if (listError) {
    console.error('could not list an attachment folder', folder, listError)
    return { attachmentId: row.id, state: 'MISSING', reason: 'The upload could not be confirmed.' }
  }

  const object = (listed ?? []).find((o) => o.name === name)
  if (!object) {
    return { attachmentId: row.id, state: 'MISSING', reason: 'The file was not received.' }
  }

  const size = Number(object.metadata?.size ?? 0)
  if (!Number.isFinite(size) || size <= 0) {
    return { attachmentId: row.id, state: 'REJECTED', reason: 'The file arrived empty.' }
  }
  if (size > MAX_BYTES) {
    return { attachmentId: row.id, state: 'REJECTED', reason: 'The file is over the 5 MB limit.' }
  }

  const { data: signed, error: signError } = await admin
    .storage
    .from(ATTACHMENT_BUCKET)
    .createSignedUrl(row.storage_path, 60)

  if (signError || !signed?.signedUrl) {
    console.error('could not sign a read URL', row.storage_path, signError)
    return { attachmentId: row.id, state: 'MISSING', reason: 'The upload could not be confirmed.' }
  }

  let head: Uint8Array
  try {
    const res = await fetch(signed.signedUrl, { headers: { Range: 'bytes=0-15' } })
    if (!res.ok && res.status !== 206) {
      return { attachmentId: row.id, state: 'MISSING', reason: 'The upload could not be read back.' }
    }
    head = new Uint8Array(await res.arrayBuffer())
  } catch (error) {
    console.error('could not read an attachment head', row.storage_path, error)
    return { attachmentId: row.id, state: 'MISSING', reason: 'The upload could not be read back.' }
  }

  const actual = sniffMime(head)
  if (!actual || !ALLOWED_MIME.includes(actual)) {
    console.warn('attachment content did not match an accepted type', {
      path: row.storage_path,
      declared: row.declared_mime,
    })
    return {
      attachmentId: row.id,
      state: 'REJECTED',
      reason: 'The file contents are not a PDF, PNG or JPG.',
    }
  }

  if (actual !== row.declared_mime) {
    console.warn('declared and actual MIME differ', {
      path: row.storage_path,
      declared: row.declared_mime,
      actual,
    })
  }

  return { attachmentId: row.id, state: 'VERIFIED', verifiedMime: actual, verifiedBytes: size }
}
