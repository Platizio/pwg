import { useId, useRef, useState } from 'react'
import {
  ACCEPT_ATTR,
  MAX_ATTACHMENTS,
  formatBytes,
  rejectReason,
  submitCallback,
  submitTicket,
  type SubmitOutcome,
} from '../../lib/supportChat'
import { useTurnstile } from '../../lib/useTurnstile'
import type { EscalationContext } from './useAssistant'

/**
 * The compact request form, rendered inside the assistant panel.
 *
 * Deliberately not a separate page. Keeping it here means the customer never
 * loses the trail they walked, the taxonomy travels with the request without a
 * URL to tamper with, and there is no route to find — which satisfies "not
 * reachable by a link" more completely than a gated page could.
 *
 * Validation mirrors `parseTicketIntent` in the create-ticket edge function.
 * Duplicating rules is a real cost, but the alternative is a round trip to learn
 * that a name was one character short. The server stays the authority; this is
 * only a faster no.
 */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const WINDOWS = ['Morning (9:30am–12pm)', 'Afternoon (12–4pm)', 'Evening (4–6:30pm)', 'Any time']

interface RequestFormProps {
  kind: 'TICKET' | 'CALLBACK'
  context: EscalationContext
  /** Prefills the subject — the customer should not retype what they just picked. */
  suggestedSubject: string
  onCancel: () => void
  onDone: (outcome: SubmitOutcome) => void
}

type Errors = Partial<Record<'subject' | 'description' | 'fullName' | 'email' | 'mobile' | 'consent', string>>

export default function RequestForm({
  kind,
  context,
  suggestedSubject,
  onCancel,
  onDone,
}: RequestFormProps) {
  const id = useId()
  const isTicket = kind === 'TICKET'

  const [subject, setSubject] = useState(suggestedSubject)
  const [description, setDescription] = useState('')
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [mobile, setMobile] = useState('')
  const [window_, setWindow] = useState(WINDOWS[3])
  const [consent, setConsent] = useState(false)
  const [errors, setErrors] = useState<Errors>({})
  const [sending, setSending] = useState(false)
  const [failure, setFailure] = useState('')
  const turnstile = useTurnstile()
  const [files, setFiles] = useState<File[]>([])
  const [fileError, setFileError] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  /**
   * Validates each pick and keeps whatever is usable.
   *
   * Rejecting the whole selection because one file is oversized would make the
   * customer redo the picker; instead the good ones stay and the message names
   * exactly which were dropped and why.
   */
  const addFiles = (picked: FileList | null) => {
    if (!picked || picked.length === 0) return
    const problems: string[] = []
    const accepted = [...files]

    for (const file of Array.from(picked)) {
      if (accepted.length >= MAX_ATTACHMENTS) {
        problems.push(`“${file.name}” — you can attach up to ${MAX_ATTACHMENTS} files`)
        continue
      }
      // Same name and size twice is a double-pick, not two files.
      if (accepted.some((f) => f.name === file.name && f.size === file.size)) {
        problems.push(`“${file.name}” is already attached`)
        continue
      }
      const reason = rejectReason(file)
      if (reason) {
        problems.push(`“${file.name}” ${reason}`)
        continue
      }
      accepted.push(file)
    }

    setFiles(accepted)
    setFileError(problems.join('. '))
    // Reset the input so re-picking the same file still fires a change event.
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index))
    setFileError('')
  }

  const validate = (): Errors => {
    const next: Errors = {}
    const digits = mobile.replace(/\D/g, '')

    if (fullName.trim().length < 2) next.fullName = 'Please enter your name.'
    if (digits.length < 8 || digits.length > 15) next.mobile = 'Please enter a valid mobile number.'
    if (!consent) next.consent = 'Please agree before sending.'

    if (isTicket) {
      if (subject.trim().length < 4) next.subject = 'Give it a short title.'
      if (description.trim().length < 20) next.description = 'Please add a little more detail (at least 20 characters).'
      if (!EMAIL_RE.test(email.trim())) next.email = 'Please enter a valid email address.'
    }
    return next
  }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (sending) return

    const found = validate()
    setErrors(found)
    if (Object.keys(found).length > 0) {
      // Focus the first problem *in visual order*, not in whatever order
      // validate() happened to insert keys — otherwise the page jumps past
      // errors the customer can already see.
      const order: (keyof Errors)[] = ['subject', 'description', 'fullName', 'email', 'mobile', 'consent']
      const first = order.find((name) => found[name])
      if (first) document.getElementById(`${id}-${first}`)?.focus()
      return
    }

    setSending(true)
    setFailure('')

    const outcome = isTicket
      ? await submitTicket({
          subject: subject.trim(),
          description: description.trim(),
          fullName: fullName.trim(),
          email: email.trim(),
          mobile: mobile.trim(),
          categoryId: context.categoryId ?? 'other',
          subcategoryId: context.subcategoryId ?? 'general-query',
          priority: context.priority,
          breadcrumb: context.breadcrumb,
          files,
          turnstileToken: turnstile.getToken(),
        })
      : await submitCallback({
          fullName: fullName.trim(),
          mobile: mobile.trim(),
          window: window_,
          categoryId: context.categoryId ?? 'other',
          subcategoryId: context.subcategoryId ?? 'general-query',
          breadcrumb: context.breadcrumb,
        })

    setSending(false)
    if (outcome.kind === 'failed') {
      setFailure(outcome.message)
      // Turnstile tokens are single-use. Without this the retry sends a spent
      // token and fails a second time for a different reason than the first,
      // which is a maddening thing to debug from the customer's side.
      turnstile.reset()
      return
    }
    onDone(outcome)
  }

  const field = (name: keyof Errors) => ({
    id: `${id}-${name}`,
    'aria-invalid': errors[name] ? true : undefined,
    'aria-describedby': errors[name] ? `${id}-${name}-err` : undefined,
  })

  const error = (name: keyof Errors) =>
    errors[name] ? (
      <p className="sform-error" id={`${id}-${name}-err`} role="alert">{errors[name]}</p>
    ) : null

  return (
    <form className="sform" onSubmit={handleSubmit} noValidate>
      <p className="sform-title">
        {isTicket ? 'Raise a ticket' : 'Request a call back'}
      </p>

      {context.breadcrumb.length > 0 && (
        <p className="sform-trail">
          <span>About</span> {context.breadcrumb.join(' › ')}
        </p>
      )}

      {isTicket && (
        <>
          <div className="sform-field">
            <label htmlFor={`${id}-subject`}>Subject <span className="sform-req">*</span></label>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              maxLength={200}
              {...field('subject')}
            />
            {error('subject')}
          </div>

          <div className="sform-field">
            <label htmlFor={`${id}-description`}>Details <span className="sform-req">*</span></label>
            <textarea
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What happened, and what were you expecting?"
              maxLength={5000}
              {...field('description')}
            />
            {error('description')}
          </div>

          <div className="sform-field">
            <label htmlFor={`${id}-files`}>
              Attachments <span className="sform-hint">optional — up to {MAX_ATTACHMENTS}, PDF/PNG/JPG, 5 MB each</span>
            </label>

            {/* The real input is visually hidden but still the labelled control,
                so keyboard and screen-reader users get the native picker. */}
            <input
              ref={fileInputRef}
              id={`${id}-files`}
              className="sform-file-input"
              type="file"
              multiple
              accept={ACCEPT_ATTR}
              onChange={(e) => addFiles(e.target.files)}
              disabled={files.length >= MAX_ATTACHMENTS}
            />
            <label className="sform-file-btn" htmlFor={`${id}-files`}>
              {files.length >= MAX_ATTACHMENTS ? `${MAX_ATTACHMENTS} files attached` : 'Choose files'}
            </label>

            {files.length > 0 && (
              <ul className="sform-files">
                {files.map((file, i) => (
                  <li key={`${file.name}-${file.size}-${i}`}>
                    <span className="sform-file-name">{file.name}</span>
                    <span className="sform-file-size">{formatBytes(file.size)}</span>
                    <button
                      type="button"
                      className="sform-file-remove"
                      onClick={() => removeFile(i)}
                      aria-label={`Remove ${file.name}`}
                    >
                      ×
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {fileError && <p className="sform-error" role="alert">{fileError}</p>}
          </div>
        </>
      )}

      <div className="sform-field">
        <label htmlFor={`${id}-fullName`}>Full name <span className="sform-req">*</span></label>
        <input
          type="text"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          autoComplete="name"
          maxLength={120}
          {...field('fullName')}
        />
        {error('fullName')}
      </div>

      {isTicket && (
        <div className="sform-field">
          <label htmlFor={`${id}-email`}>Email <span className="sform-req">*</span></label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            {...field('email')}
          />
          {error('email')}
        </div>
      )}

      <div className="sform-field">
        <label htmlFor={`${id}-mobile`}>Mobile <span className="sform-req">*</span></label>
        <input
          type="tel"
          value={mobile}
          onChange={(e) => setMobile(e.target.value)}
          autoComplete="tel"
          placeholder="+91 …"
          {...field('mobile')}
        />
        {error('mobile')}
      </div>

      {!isTicket && (
        <div className="sform-field">
          <label htmlFor={`${id}-window`}>Best time to call</label>
          <select id={`${id}-window`} value={window_} onChange={(e) => setWindow(e.target.value)}>
            {WINDOWS.map((w) => <option key={w}>{w}</option>)}
          </select>
        </div>
      )}

      <div className="sform-consent">
        <input
          type="checkbox"
          checked={consent}
          onChange={(e) => setConsent(e.target.checked)}
          {...field('consent')}
        />
        <label htmlFor={`${id}-consent`}>
          I agree Platizio Global may use these details to respond, as set out in the{' '}
          <a href="/privacy" target="_blank" rel="noopener noreferrer">Privacy Policy</a>.
        </label>
      </div>
      {error('consent')}

      {/*
        Renders nothing at all when VITE_TURNSTILE_SITE_KEY is unset, so the
        form keeps its current layout until the captcha is configured.
      */}
      {turnstile.enabled && <div className="sform-captcha" ref={turnstile.containerRef} />}

      {failure && <p className="sform-error is-block" role="alert">{failure}</p>}

      <div className="sform-actions">
        <button type="submit" className="assistant-option is-primary" disabled={sending}>
          {sending ? 'Sending…' : isTicket ? 'Submit ticket' : 'Request call back'}
        </button>
        <button type="button" className="assistant-textbtn" onClick={onCancel} disabled={sending}>
          Cancel
        </button>
      </div>
    </form>
  )
}
