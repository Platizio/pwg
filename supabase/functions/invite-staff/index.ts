// invite-staff — turns an email address into a working staff account.
//
// Everything else on the staff side is a plain RPC the console can call
// directly. This one cannot be, because it straddles two systems: creating the
// login is an Auth Admin API call that requires the service key, and granting
// the roles is a database write that must be attributed to whichever admin
// asked for it. Neither half is any use alone — an auth user with no
// staff_users row cannot do anything, and provision_staff_user() refuses an id
// that has no auth user behind it.
//
// So the two are done here, in that order, with the auth user rolled back if
// the provisioning half fails. An orphaned login is not harmless: it is an
// account that exists, can complete a password reset, and holds no roles, so
// it looks like a dormant employee rather than the debris of a failed call.
//
// Authorisation is checked *before* anything is created, and checked against
// the database rather than the token. has_staff_role() reads the JWT's
// app_metadata, which is a snapshot from when the token was issued up to an
// hour ago; staff_whoami() reads staff_users.is_active, so an admin who was
// switched off twenty minutes ago cannot still be creating colleagues.

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { preflight, json, fail } from '../_shared/cors.ts'
import { adminClient, userClient, isServiceRoleCaller } from '../_shared/supabase.ts'

const ROLES = ['AGENT', 'SUPERVISOR', 'GRIEVANCE_OFFICER', 'ADMIN'] as const
type Role = (typeof ROLES)[number]

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

interface WhoAmI {
  signedIn: boolean
  isActive?: boolean
  roles?: string[]
}

/**
 * There is no lookup-by-email in the Auth Admin API, so the directory is read
 * and scanned. That is only reasonable because this project has no public
 * sign-up — config.toml sets enable_signup = false, so auth.users contains
 * staff and nobody else, and staff are counted in tens. If that ever stops
 * being true this needs real paging, and it will announce itself by silently
 * failing to find people past the first thousand.
 */
async function findUserByEmail(
  admin: ReturnType<typeof adminClient>,
  email: string,
): Promise<{ id: string } | null> {
  const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 })
  if (error) throw error
  const match = data.users.find((u) => (u.email ?? '').toLowerCase() === email)
  return match ? { id: match.id } : null
}

Deno.serve(async (req: Request) => {
  const early = preflight(req)
  if (early) return early

  if (req.method !== 'POST') return fail(req, 405, 'Method not allowed.')

  let body: { email?: string; fullName?: string; roles?: string[]; redirectTo?: string }
  try {
    body = await req.json()
  } catch (error) {
    return fail(req, 400, 'We could not read that request.', error)
  }

  const email = (body.email ?? '').trim().toLowerCase()
  const fullName = (body.fullName ?? '').trim()
  const roles = Array.isArray(body.roles) ? body.roles : []

  if (!EMAIL_RE.test(email) || email.length > 254) {
    return fail(req, 400, 'A valid email address is required.')
  }
  if (fullName.length < 2 || fullName.length > 120) {
    return fail(req, 400, 'A full name between 2 and 120 characters is required.')
  }
  if (roles.length === 0) {
    return fail(req, 400, 'At least one role is required — an account with none cannot do anything.')
  }
  const invalid = roles.filter((r) => !ROLES.includes(r as Role))
  if (invalid.length > 0) {
    return fail(req, 400, `Unknown role: ${invalid.join(', ')}. Valid roles are ${ROLES.join(', ')}.`)
  }
  const wanted = [...new Set(roles)] as Role[]

  // --- authorise, before anything exists ------------------------------------

  const asCaller = userClient(req)

  if (!isServiceRoleCaller(req)) {
    const { data, error } = await asCaller.rpc('staff_whoami')

    if (error) {
      // 42501 here is not a fault, it is an answer. staff_whoami is granted to
      // `authenticated` and not to `anon`, so a caller presenting the anon key
      // — which ships in the site bundle, so anyone can — gets permission
      // denied rather than a payload. Reporting that as a 500 would blame the
      // server for the caller not being signed in, and would tell a monitor
      // the function is broken every time someone pokes it.
      if (error.code === '42501' || error.code === 'PGRST301') {
        return fail(req, 403, 'Only an active ADMIN can create staff accounts.', error)
      }
      console.error('could not establish the caller', error)
      return fail(req, 500, 'We could not establish who you are.')
    }

    const me = data as WhoAmI
    if (!me.signedIn || !me.isActive || !(me.roles ?? []).includes('ADMIN')) {
      return fail(req, 403, 'Only an active ADMIN can create staff accounts.')
    }
  }

  const admin = adminClient()

  // --- find or create the login ---------------------------------------------

  let userId: string
  let created = false

  try {
    const existing = await findUserByEmail(admin, email)

    if (existing) {
      userId = existing.id
    } else {
      const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
        redirectTo: body.redirectTo,
      })
      if (error || !data?.user) {
        console.error('invite failed', error)
        return fail(req, 502, 'We could not send the invitation. Check the email address and try again.')
      }
      userId = data.user.id
      created = true
    }
  } catch (error) {
    console.error('auth directory lookup failed', error)
    return fail(req, 502, 'We could not reach the account directory just now.')
  }

  // --- grant the roles, as the caller ---------------------------------------
  //
  // Deliberately not the service client. provision_staff_user() records who
  // asked in staff_role_audit, and running it as the service would file every
  // hire under 'api:service_role' — which is exactly the anonymous change the
  // audit table exists to prevent.

  const { data: provisioned, error: provisionError } = await asCaller.rpc('provision_staff_user', {
    p_user_id: userId,
    p_full_name: fullName,
    p_email: email,
    p_roles: wanted,
  })

  if (provisionError) {
    // Roll back the half we created. If the account already existed we leave
    // it alone — it belongs to somebody, and this call failing is no reason to
    // delete a colleague's login.
    if (created) {
      const { error: cleanupError } = await admin.auth.admin.deleteUser(userId)
      if (cleanupError) {
        console.error(
          `orphaned auth user ${userId} (${email}): provisioning failed and cleanup failed too`,
          cleanupError,
        )
      }
    }

    const code = provisionError.code ?? ''
    if (code === '42501') return fail(req, 403, provisionError.message, provisionError)
    console.error('provisioning failed', provisionError)
    return fail(req, 500, 'The account could not be set up. Nothing was changed.')
  }

  return json(req, 200, {
    ...(provisioned as Record<string, unknown>),
    fullName,
    invitationSent: created,
    // Said plainly because it is the difference between "they will get an
    // email" and "tell them to sign in with the password they already have".
    note: created
      ? 'An invitation email has been sent. The account works once they set a password.'
      : 'That address already had a login; its roles have been updated and no email was sent.',
  })
})
