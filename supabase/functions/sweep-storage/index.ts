import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { adminClient, ATTACHMENT_BUCKET, isServiceRoleCaller } from '../_shared/supabase.ts'

const BATCH = 100

interface Sweepable {
  attachment_id: string
  storage_path: string
  reason: string
}

Deno.serve(async (req: Request) => {
  if (!isServiceRoleCaller(req)) {
    return json(401, { error: 'Not authorised.' })
  }

  const admin = adminClient()

  const { data, error } = await admin.rpc('list_sweepable_attachments', { p_limit: BATCH })
  if (error) {
    console.error('could not list sweepable attachments', error)
    return json(500, { status: 'error' })
  }

  const rows = (data ?? []) as Sweepable[]
  if (rows.length === 0) return json(200, { status: 'ok', swept: 0 })

  const { data: removed, error: removeError } = await admin
    .storage
    .from(ATTACHMENT_BUCKET)
    .remove(rows.map((r) => r.storage_path))

  if (removeError) {
    console.error('could not remove objects', removeError)
    return json(500, { status: 'error', detail: 'Objects were not removed; rows left in place.' })
  }

  const removedPaths = new Set((removed ?? []).map((o) => o.name))
  const sweptIds = rows.filter((r) => removedPaths.has(r.storage_path)).map((r) => r.attachment_id)

  const alreadyGone = rows
    .filter((r) => !removedPaths.has(r.storage_path) && r.reason === 'retention_expired')
    .map((r) => r.attachment_id)

  const toClear = [...new Set([...sweptIds, ...alreadyGone])]
  if (toClear.length === 0) return json(200, { status: 'ok', swept: 0, listed: rows.length })

  const { data: cleared, error: clearError } = await admin.rpc('confirm_attachments_swept', {
    p_ids: toClear,
  })

  if (clearError) {
    console.error('objects removed but rows not cleared', clearError)
    return json(500, { status: 'error', detail: 'Objects removed; rows not cleared.' })
  }

  const byReason = rows.reduce<Record<string, number>>((acc, r) => {
    acc[r.reason] = (acc[r.reason] ?? 0) + 1
    return acc
  }, {})

  console.log(`storage sweep: listed=${rows.length} cleared=${cleared}`, byReason)
  return json(200, { status: 'ok', listed: rows.length, swept: cleared, byReason })
})

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}
