import { SUPPORT_EMAIL } from '../siteConfig'
import { anonHeaders, backendConfig, isBackendConfigured } from './backend'

export { isBackendConfigured }

/**
 * Submitting a request from the assistant.
 *
 * Two paths, chosen by whether the Supabase environment is configured:
 *
 *  - Configured — POST to the existing `create-ticket` edge function, which is
 *    already live and already owns validation, rate limiting, Turnstile and the
 *    consent record.
 *  - Not configured — hand off to email with every field filled in, so the
 *    customer never loses what they typed. This is the state today.
 *
 * The distinction is surfaced to the caller rather than hidden, because the two
 * outcomes mean different things: one produces a tracked reference, the other
 * produces a draft the customer still has to send.
 */

const CREATE_PATH = '/functions/v1/create-ticket'
const FINALIZE_PATH = '/functions/v1/finalize-ticket'

/**
 * Attachment limits.
 *
 * These mirror `_shared/validation.ts` on the server, which is the authority —
 * and `finalize-ticket` goes further, sniffing each uploaded file's magic number
 * and rejecting anything whose bytes are not actually a PDF, PNG or JPEG. These
 * constants exist so the customer gets told before a 5 MB upload, not after.
 */
export const MAX_ATTACHMENTS = 3
export const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024
export const ALLOWED_MIME = ['application/pdf', 'image/png', 'image/jpeg'] as const

/** For the file picker's `accept`, which matches on extension as well as type. */
export const ACCEPT_ATTR = '.pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg'

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/** Why a chosen file cannot be sent, or null if it is fine. */
export function rejectReason(file: File): string | null {
  if (!ALLOWED_MIME.includes(file.type as typeof ALLOWED_MIME[number])) {
    return 'must be a PDF, PNG or JPG'
  }
  if (file.size > MAX_ATTACHMENT_BYTES) {
    return `is ${formatBytes(file.size)} — the limit is 5 MB`
  }
  if (file.size === 0) return 'appears to be empty'
  return null
}

export interface TicketDraft {
  subject: string
  description: string
  fullName: string
  email: string
  mobile: string
  /** From the node the customer walked to — never typed, never inferred. */
  categoryId: string
  subcategoryId: string
  priority: 'LOW' | 'NORMAL' | 'URGENT'
  breadcrumb: string[]
  files: File[]
  /** Null when Turnstile is not configured, which the server allows. */
  turnstileToken?: string | null
}

export interface CallbackDraft {
  fullName: string
  mobile: string
  window: string
  categoryId: string
  subcategoryId: string
  breadcrumb: string[]
}

export type SubmitOutcome =
  /**
   * Recorded server-side. `reference` is the customer's ticket number.
   * `failedAttachments` names any file the server could not verify — the ticket
   * still exists, so this is a caveat on success, not a failure.
   */
  | { kind: 'raised'; reference: string; failedAttachments?: string[] }
  /** Backend not wired yet — an email draft was opened with everything in it. */
  | { kind: 'drafted'; attachmentsPending?: number }
  | { kind: 'failed'; message: string }

const config = backendConfig

function trail(breadcrumb: string[]): string {
  return breadcrumb.length > 0 ? breadcrumb.join(' > ') : 'Not specified'
}

/** Opens the customer's mail client with the whole request already written. */
function draftByEmail(subject: string, body: string): SubmitOutcome {
  const href = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
  window.location.href = href
  return { kind: 'drafted' }
}

export async function submitTicket(draft: TicketDraft): Promise<SubmitOutcome> {
  const settings = config()

  if (!settings) {
    // A mailto: cannot carry attachments, so say so rather than silently
    // dropping files the customer chose.
    const filesNote = draft.files.length
      ? `\nI have ${draft.files.length} file(s) to attach: ` +
        `${draft.files.map((f) => f.name).join(', ')}. Please attach them to this email before sending.\n`
      : ''
    const outcome = draftByEmail(
      draft.subject,
      `${draft.description}\n\n---\nWhat I was looking at: ${trail(draft.breadcrumb)}\n` +
      `Name: ${draft.fullName}\nEmail: ${draft.email}\nMobile: ${draft.mobile}\n${filesNote}`,
    )
    return draft.files.length
      ? { kind: 'drafted', attachmentsPending: draft.files.length }
      : outcome
  }

  // Reused by finalize-ticket, which checks it against the stored ticket before
  // it will confirm any upload — so it has to be the same value in both calls.
  const idempotencyKey = crypto.randomUUID()

  try {
    const response = await fetch(`${settings.url}${CREATE_PATH}`, {
      method: 'POST',
      // Only this call is captcha-gated. finalize-ticket authorises on the
      // idempotency key instead, and re-solving a challenge between the two
      // halves of one submission would be a challenge the customer never asked
      // for.
      headers: anonHeaders(settings, draft.turnstileToken),
      body: JSON.stringify({
        idempotencyKey,
        fullName: draft.fullName,
        email: draft.email,
        mobile: draft.mobile,
        // Taxonomy comes from the walked path. The server takes it from the
        // escalation grant too, so a tampered body cannot re-file the ticket.
        categoryId: draft.categoryId,
        subcategoryId: draft.subcategoryId,
        priority: draft.priority,
        source: 'chatbot',
        subject: draft.subject,
        description:
          `${draft.description}\n\n---\nAssistant path: ${trail(draft.breadcrumb)}`,
        consent: {
          text:
            'I agree that Platizio Global may use the details above to respond to ' +
            'this request, as described in the Privacy Policy.',
          version: '2026-08-13',
          url: 'https://platizioglobal.com/privacy',
        },
        attachments: draft.files.map((file) => ({
          filename: file.name,
          mime: file.type,
          bytes: file.size,
        })),
      }),
    })

    const body = await response.json().catch(() => ({}))
    if (!response.ok) {
      return { kind: 'failed', message: body?.error ?? 'We could not log that request.' }
    }

    // The server hands back one signed upload URL per accepted attachment,
    // keyed by its index in the array we just sent. Empty when there were no
    // files, in which case the Promise.all below resolves immediately.
    const uploads: Array<{ index: number; signedUrl: string; filename: string }> =
      body.uploads ?? []

    await Promise.all(
      uploads.map(async (upload) => {
        const file = draft.files[upload.index]
        if (!file) return
        await fetch(upload.signedUrl, {
          method: 'PUT',
          headers: { 'Content-Type': file.type },
          body: file,
        }).catch(() => {
          // A failed PUT is not fatal: finalize-ticket reports the file as
          // missing and the ticket still stands. Swallowing it here keeps one
          // bad file from discarding the whole request.
        })
      }),
    )

    // Always called, including when there was nothing to upload.
    //
    // finalize-ticket is not only about attachments. It is where
    // finalize_support_ticket stamps `finalized_at` and queues the
    // acknowledgement email — and `create_support_ticket` queues nothing at
    // all. Returning early when `files` was empty, which this did until now,
    // left every ticket raised without a file unfinalized and the customer
    // unacknowledged. That is most tickets.
    //
    // Safe to call unconditionally: `finalized_at` is set with
    // `coalesce(finalized_at, now())` and the notification insert is
    // `on conflict (dedupe_key) do nothing` against `ack:<ticket id>`, so a
    // repeat call settles nothing twice and sends nothing twice.
    const finalize = await fetch(`${settings.url}${FINALIZE_PATH}`, {
      method: 'POST',
      headers: anonHeaders(settings),
      body: JSON.stringify({ ticketId: body.ticketId, idempotencyKey }),
    })

    const finalBody = await finalize.json().catch(() => ({}))
    return {
      kind: 'raised',
      reference: finalBody?.ticketRef ?? body.ticketRef,
      failedAttachments: [
        ...(finalBody?.failedAttachments ?? []),
        ...(body.unavailable ?? []),
      ],
    }
  } catch {
    return {
      kind: 'failed',
      message: 'We could not reach the support service. Please try again in a moment.',
    }
  }
}

/**
 * Call-backs have no endpoint yet — `callback_requests` and its staff queue are
 * Phase 6. Until then this drafts an email so the request still reaches the team
 * rather than being silently dropped.
 */
export async function submitCallback(draft: CallbackDraft): Promise<SubmitOutcome> {
  return draftByEmail(
    `Call back request: ${draft.breadcrumb[draft.breadcrumb.length - 1] ?? 'General query'}`,
    `Please call me back.\n\n` +
    `Name: ${draft.fullName}\nMobile: ${draft.mobile}\nBest time: ${draft.window}\n\n` +
    `What I was looking at: ${trail(draft.breadcrumb)}\n`,
  )
}
