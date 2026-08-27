// Service-role client, and the guard for the worker-only functions.

import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2'

export const ATTACHMENT_BUCKET = 'ticket-attachments'

export function adminClient(): SupabaseClient {
  const url = Deno.env.get('SUPABASE_URL')
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!url || !key) {
    throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are not available to this function')
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

/**
 * A client that acts as *the caller*, not as the service. Every request it
 * makes carries the caller's own access token, so auth.uid() inside the
 * database is the signed-in staff member and RLS applies to them.
 *
 * This is the client the staff functions must use for anything the database is
 * meant to authorise. Reaching for adminClient() there would silently hand a
 * support agent service-role reach — the RPC would still run, it would just
 * stop being able to tell who ran it.
 */
export function userClient(req: Request): SupabaseClient {
  const url = Deno.env.get('SUPABASE_URL')
  const anon = Deno.env.get('SUPABASE_ANON_KEY')
  if (!url || !anon) {
    throw new Error('SUPABASE_URL / SUPABASE_ANON_KEY are not available to this function')
  }

  const authorization = req.headers.get('authorization') ?? ''

  return createClient(url, anon, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: authorization } },
  })
}

/**
 * Worker functions are called by pg_cron with the service key, never by a
 * browser. The platform has already verified the JWT signature by the time this
 * runs (verify_jwt is on), so reading the role out of the payload is enough —
 * this is checking which key was used, not whether the key is genuine.
 *
 * Without this, the anon key would be sufficient to trigger the outbox drain
 * and the storage sweep, and the anon key is in the site bundle.
 */
export function isServiceRoleCaller(req: Request): boolean {
  const header = req.headers.get('authorization') ?? ''
  const token = header.replace(/^Bearer\s+/i, '')
  const payload = token.split('.')[1]
  if (!payload) return false

  try {
    const normalised = payload.replace(/-/g, '+').replace(/_/g, '/')
    const padded = normalised.padEnd(normalised.length + ((4 - (normalised.length % 4)) % 4), '=')
    const claims = JSON.parse(atob(padded)) as { role?: string }
    return claims.role === 'service_role'
  } catch {
    return false
  }
}

/** Magic numbers, checked against the bytes rather than against the filename. */
const SIGNATURES: Array<{ mime: string; bytes: number[] }> = [
  { mime: 'application/pdf', bytes: [0x25, 0x50, 0x44, 0x46] },                    // %PDF
  { mime: 'image/png', bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },  // \x89PNG\r\n\x1a\n
  { mime: 'image/jpeg', bytes: [0xff, 0xd8, 0xff] },
]

/**
 * Returns the MIME type the leading bytes actually say this is, or null when
 * they say nothing we accept. A .pdf containing a shell script lands here as
 * null, which is the whole point — the browser's extension check never opened
 * the file.
 */
export function sniffMime(head: Uint8Array): string | null {
  for (const { mime, bytes } of SIGNATURES) {
    if (head.length < bytes.length) continue
    if (bytes.every((b, i) => head[i] === b)) return mime
  }
  return null
}
