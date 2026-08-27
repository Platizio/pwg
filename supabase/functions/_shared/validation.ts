// Server-side validation for the intake payload.
//
// This is not a duplicate of the browser's checks — it is the real set. The
// form checks minimum lengths so it can show a helpful message, and enforces no
// maximum length at all; it checks file extensions and never file contents.
// None of it survives a caller who skips the form, which is every caller worth
// worrying about.
//
// The bounds here match the CHECK constraints in 0003 and 0006 exactly, so the
// database is the backstop and never the error surface: a request that would
// violate a constraint is refused here, with a message a person can act on.

export const MAX_ATTACHMENTS = 3
export const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024
export const ALLOWED_MIME = ['application/pdf', 'image/png', 'image/jpeg'] as const
export const PRIORITIES = ['LOW', 'NORMAL', 'URGENT'] as const

/**
 * What a browser is allowed to claim about where its request came from.
 *
 * Deliberately narrower than the database constraint, which also permits
 * 'email', 'phone' and 'staff'. Those three describe a request a staff member
 * logged on someone else's behalf, and nothing reaching this endpoint is one of
 * them — this is the public intake path and it is reached with the anon key,
 * which ships in the site bundle. Accepting 'staff' here would let anyone forge
 * a ticket that reads as though an agent raised it, which is exactly the sort
 * of row an audit is supposed to be able to trust.
 */
export const CLIENT_SOURCES = ['web', 'chatbot'] as const

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export interface AttachmentIntent {
  filename: string
  safeName: string
  mime: string
  bytes: number
}

export interface TicketIntent {
  idempotencyKey: string
  fullName: string
  email: string
  mobileRaw: string
  mobileDigits: string
  categoryId: string
  subcategoryId: string
  priority: string
  source: string
  subject: string
  description: string
  consent: { text: string; version: string; url: string }
  attachments: AttachmentIntent[]
}

export class ValidationError extends Error {}

function str(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function bounded(value: string, field: string, min: number, max: number): string {
  // Count in code points, not UTF-16 units, so an emoji or a Devanagari
  // cluster is not charged double against a limit the database counts
  // differently — char_length() in Postgres counts characters.
  const length = [...value].length
  if (length < min) throw new ValidationError(`${field} is too short.`)
  if (length > max) throw new ValidationError(`${field} is too long (limit ${max} characters).`)
  return value
}

/**
 * Reduces a filename to something safe to put in a storage path: no directory
 * separators, no leading dots, nothing that needs escaping. The original is
 * kept separately on the row, so the customer still sees the name they sent.
 */
export function sanitiseFilename(raw: string): string {
  const base = raw.split(/[\\/]/).pop() ?? 'file'
  const cleaned = base
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^[-.]+/, '')
    .slice(0, 80)
  return cleaned.length >= 3 ? cleaned : `file-${cleaned}`
}

function parseAttachments(raw: unknown): AttachmentIntent[] {
  if (raw === undefined || raw === null) return []
  if (!Array.isArray(raw)) throw new ValidationError('Attachments were not sent in a readable form.')
  if (raw.length > MAX_ATTACHMENTS) {
    throw new ValidationError(`You can attach up to ${MAX_ATTACHMENTS} files.`)
  }

  return raw.map((item) => {
    const filename = bounded(str((item as Record<string, unknown>)?.filename), 'A file name', 1, 255)
    const mime = str((item as Record<string, unknown>)?.mime)
    const bytes = Number((item as Record<string, unknown>)?.bytes)

    if (!ALLOWED_MIME.includes(mime as typeof ALLOWED_MIME[number])) {
      throw new ValidationError(`“${filename}” is not a supported type. Attachments must be PDF, PNG or JPG.`)
    }
    if (!Number.isFinite(bytes) || bytes <= 0) {
      throw new ValidationError(`“${filename}” appears to be empty.`)
    }
    if (bytes > MAX_ATTACHMENT_BYTES) {
      throw new ValidationError(`“${filename}” is over the 5 MB limit.`)
    }

    return { filename, safeName: sanitiseFilename(filename), mime, bytes }
  })
}

export function parseTicketIntent(raw: unknown): TicketIntent {
  if (typeof raw !== 'object' || raw === null) {
    throw new ValidationError('The request body was not readable.')
  }
  const body = raw as Record<string, unknown>

  // Required, not optional. The column is nullable so a staff-created ticket
  // does not have to invent one, but every request arriving here came from the
  // form, and the form always mints one. Requiring it means finalize-ticket can
  // demand a match unconditionally rather than skipping its ownership check
  // whenever the key happens to be absent.
  const idempotencyKey = str(body.idempotencyKey)
  if (!UUID_RE.test(idempotencyKey)) {
    throw new ValidationError('The request identifier was missing or unreadable.')
  }

  const fullName = bounded(str(body.fullName), 'Your name', 2, 120)

  const email = str(body.email).toLowerCase()
  if (!EMAIL_RE.test(email) || [...email].length > 254) {
    throw new ValidationError('Please enter a valid email address.')
  }

  const mobileRaw = bounded(str(body.mobile), 'Your mobile number', 8, 32)
  const mobileDigits = mobileRaw.replace(/\D/g, '')
  if (mobileDigits.length < 8 || mobileDigits.length > 15) {
    throw new ValidationError('Please enter a valid mobile number.')
  }

  const categoryId = str(body.categoryId)
  const subcategoryId = str(body.subcategoryId)
  // Shape only. Whether this pair actually exists — and whether they belong
  // together — is settled by the composite foreign key in 0003, which cannot
  // drift out of step with the taxonomy the way a copy here would.
  if (!SLUG_RE.test(categoryId)) throw new ValidationError('Please choose a category.')
  if (!SLUG_RE.test(subcategoryId)) throw new ValidationError('Please choose a subcategory.')

  const priority = str(body.priority).toUpperCase() || 'NORMAL'
  if (!PRIORITIES.includes(priority as typeof PRIORITIES[number])) {
    throw new ValidationError('That urgency level is not one we recognise.')
  }

  // Absent means the plain web form, which is what every caller predating the
  // guided assistant sends. An unrecognised value is refused rather than
  // coerced to 'web': silently rewriting it is how the old behaviour hid this
  // bug for as long as it did.
  const source = str(body.source).toLowerCase() || 'web'
  if (!CLIENT_SOURCES.includes(source as typeof CLIENT_SOURCES[number])) {
    throw new ValidationError('That request source is not one we recognise.')
  }

  const subject = bounded(str(body.subject), 'The subject', 4, 200)
  const description = bounded(str(body.description), 'The description', 20, 5000)

  const consentRaw = (body.consent ?? {}) as Record<string, unknown>
  const consentText = bounded(str(consentRaw.text), 'The consent statement', 20, 2000)
  const consentVersion = bounded(str(consentRaw.version), 'The policy version', 1, 40)
  const consentUrl = str(consentRaw.url) || 'https://platizioglobal.com/privacy'

  return {
    idempotencyKey,
    fullName,
    email,
    mobileRaw,
    mobileDigits,
    categoryId,
    subcategoryId,
    priority,
    source,
    subject,
    description,
    consent: { text: consentText, version: consentVersion, url: consentUrl },
    attachments: parseAttachments(body.attachments),
  }
}

export interface EnquiryIntent {
  idempotencyKey: string
  fullName: string
  email: string
  phoneRaw: string
  phoneDigits: string
  interestId: string | null
  message: string | null
  consent: { text: string; version: string; url: string }
}

/**
 * The enquiry form's payload.
 *
 * Bounds match the CHECK constraints in 0027 exactly, for the same reason the
 * ticket bounds match 0003 and 0006: the database is the backstop, never the
 * error surface. A constraint violation reaching a customer is a 500 and a lost
 * enquiry; a refusal here is a sentence they can act on.
 *
 * Note what is *not* validated here — `interestId` is checked for shape only.
 * Whether that id exists is settled against `enquiry_interests` inside the RPC,
 * which cannot drift out of step with the seed the way a copy in this file
 * would. An unknown interest is dropped there rather than refused, because the
 * dropdown is optional and routing metadata; losing it costs the team a
 * routing hint, and refusing over it would cost them the enquiry.
 */
export function parseEnquiryIntent(raw: unknown): EnquiryIntent {
  if (typeof raw !== 'object' || raw === null) {
    throw new ValidationError('The request body was not readable.')
  }
  const body = raw as Record<string, unknown>

  const idempotencyKey = str(body.idempotencyKey)
  if (!UUID_RE.test(idempotencyKey)) {
    throw new ValidationError('The request identifier was missing or unreadable.')
  }

  const fullName = bounded(str(body.fullName), 'Your name', 2, 120)

  const email = str(body.email).toLowerCase()
  if (!EMAIL_RE.test(email) || [...email].length > 254) {
    throw new ValidationError('Please enter a valid email address.')
  }

  const phoneRaw = bounded(str(body.phone), 'Your contact number', 8, 32)
  const phoneDigits = phoneRaw.replace(/\D/g, '')
  if (phoneDigits.length < 8 || phoneDigits.length > 15) {
    throw new ValidationError('Please enter a valid contact number.')
  }

  const interestRaw = str(body.interestId)
  if (interestRaw && !SLUG_RE.test(interestRaw)) {
    throw new ValidationError('That interest is not one we recognise.')
  }

  const messageRaw = str(body.message)
  if ([...messageRaw].length > 5000) {
    throw new ValidationError('That message is too long (limit 5000 characters).')
  }

  const consentRaw = (body.consent ?? {}) as Record<string, unknown>
  const consentText = bounded(str(consentRaw.text), 'The consent statement', 20, 2000)
  const consentVersion = bounded(str(consentRaw.version), 'The policy version', 1, 40)
  const consentUrl = str(consentRaw.url) || 'https://platizioglobal.com/privacy'

  return {
    idempotencyKey,
    fullName,
    email,
    phoneRaw,
    phoneDigits,
    interestId: interestRaw || null,
    message: messageRaw || null,
    consent: { text: consentText, version: consentVersion, url: consentUrl },
  }
}

const IPV4_RE = /^(\d{1,3}\.){3}\d{1,3}$/
const IPV6_RE = /^[0-9a-f:]+$/i

/**
 * First hop only, and only if it parses as an address.
 *
 * Recorded as evidence, never relied on as identity — x-forwarded-for is a
 * header, and headers are what the caller says they are.
 *
 * The shape check is defence in depth rather than a fix for an observed
 * failure. Sending `x-forwarded-for: not-an-ip-address` to the deployed
 * function was tried: Supabase's edge replaced it with the true client address
 * and the malformed value never arrived. But submitted_ip is an `inet` column,
 * so anything unparseable that did arrive would raise on insert and cost a
 * customer an otherwise valid support request — and that outcome should not
 * depend on a platform behaviour this code neither controls nor is promised.
 * Anything unparseable is dropped and the ticket is written without it.
 */
export function clientIp(req: Request): string | null {
  const forwarded = req.headers.get('x-forwarded-for')
  if (!forwarded) return null

  const first = forwarded.split(',')[0]?.trim()
  if (!first || first.length > 45) return null
  if (!IPV4_RE.test(first) && !IPV6_RE.test(first)) return null

  // IPv4 octets still have to be in range: 999.1.1.1 matches the shape but is
  // not an address.
  if (IPV4_RE.test(first) && first.split('.').some((o) => Number(o) > 255)) return null

  return first
}
