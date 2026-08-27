import { useState, useEffect, useRef } from 'react'
import { useAppContext } from '../context/AppContext'
import { anonHeaders, backendConfig } from '../lib/backend'
import { useTurnstile } from '../lib/useTurnstile'

interface FormState {
  fullName: string
  email: string
  phone: string
  interest: string
  message: string
  consent: boolean
}

const EMPTY: FormState = {
  fullName: '', email: '', phone: '', interest: '', message: '', consent: false,
}

const ENQUIRY_PATH = '/functions/v1/create-enquiry'

/**
 * Values are the `enquiry_interests` ids, not the labels.
 *
 * These `<option>`s previously carried no `value` at all, so the browser sent
 * the visible text. `create_contact_enquiry` looks the id up against the seeded
 * table and drops anything it does not recognise, so submitting "US Stocks"
 * would have silently lost the routing hint on every enquiry.
 */
const INTERESTS: Array<{ id: string; label: string }> = [
  { id: 'us-stocks',        label: 'US Stocks' },
  { id: 'us-etfs',          label: 'US ETFs' },
  { id: 'account-opening',  label: 'Account Opening' },
  { id: 'platform-support', label: 'Platform Support' },
  { id: 'general-query',    label: 'General Query' },
]

/**
 * Stored verbatim on the enquiry's consent record, so it is evidence rather
 * than decoration. Changing the wording means issuing a new version — the old
 * rows keep the text the person actually agreed to.
 */
const CONSENT_TEXT =
  'I agree that Platizio Global may use the details above to contact me about ' +
  'this enquiry, as described in the Privacy Policy.'
const CONSENT_VERSION = '2026-08-14'

/**
 * Temporary fallback, and it dies with Phase C.
 *
 * The enquiry form is the site's lead-capture path and it works today. Cutting
 * straight over to the edge function before `VITE_SUPABASE_URL` is set on
 * Vercel would leave it posting into nothing, which is a worse outcome than the
 * problem being fixed. So Supabase is tried first and this is used only while
 * the environment is unconfigured.
 *
 * The access key is public by construction — it ships in the bundle and is in
 * git history. It should be rotated and this block deleted the moment the
 * environment variables are live.
 */
const FALLBACK_KEY = '256f7a96-c82a-41c5-b3eb-3c2395f68665'
const FALLBACK_EP  = 'https' + '://api.web3forms.com/submit'

export default function ContactModal() {
  const { isContactOpen, contactInterest, closeContact } = useAppContext()
  const [form, setForm]           = useState<FormState>(EMPTY)
  const [submitted, setSubmitted] = useState(false)
  const [sending, setSending]     = useState(false)
  const [error, setError]         = useState('')
  // Empty on the fallback path, which produces no reference at all.
  const [reference, setReference] = useState('')
  const turnstile = useTurnstile()
  const nameRef = useRef<HTMLInputElement>(null)
  const modalRef = useRef<HTMLDivElement>(null)
  const lastFocusedRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (isContactOpen) {
      lastFocusedRef.current = document.activeElement as HTMLElement
      setForm((f) => ({ ...f, interest: contactInterest || '' }))
      setSubmitted(false)
      setError('')
      setTimeout(() => nameRef.current?.focus(), 200)
    }
  }, [isContactOpen, contactInterest])

  useEffect(() => {
    if (!isContactOpen) {
      // Restore focus to the element that opened the modal
      lastFocusedRef.current?.focus?.()
      const t = setTimeout(() => { setForm(EMPTY); setSubmitted(false); setError('') }, 300)
      return () => clearTimeout(t)
    }
  }, [isContactOpen])

  // Close on Escape and trap focus within the dialog (accessibility)
  useEffect(() => {
    if (!isContactOpen) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { closeContact(); return }
      if (e.key === 'Tab' && modalRef.current) {
        const f = modalRef.current.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        )
        if (!f.length) return
        const first = f[0], last = f[f.length - 1]
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [isContactOpen, closeContact])

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, type } = e.target
    const value = type === 'checkbox' ? (e.target as HTMLInputElement).checked : e.target.value
    setForm((f) => ({ ...f, [name]: value }))
  }

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (sending) return // guard against double-submit

    // Captured before the first await. React nulls `currentTarget` once the
    // handler yields, and the fallback path below builds a FormData from it.
    const formEl = e.currentTarget

    // Client-side validation (noValidate is set, so we validate here for custom, accessible messages)
    const name = form.fullName.trim()
    const email = form.email.trim()
    const phoneDigits = form.phone.replace(/\D/g, '')
    const focusField = (id: string) => (document.getElementById(id) as HTMLElement | null)?.focus()

    if (name.length < 2) {
      setError('Please enter your full name.'); focusField('fullName'); return
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError('Please enter a valid email address.'); focusField('email'); return
    }
    if (phoneDigits.length < 8) {
      setError('Please enter a valid contact number (at least 8 digits).'); focusField('phone'); return
    }
    if (!form.consent) {
      setError('Please confirm you are happy for us to contact you about this enquiry.')
      focusField('consent'); return
    }

    setSending(true)
    setError('')

    const settings = backendConfig()

    try {
      if (settings) {
        const res = await fetch(`${settings.url}${ENQUIRY_PATH}`, {
          method: 'POST',
          headers: anonHeaders(settings, turnstile.getToken()),
          body: JSON.stringify({
            // Two clicks on a slow connection are one enquiry, not two. The RPC
            // reads back the first row rather than creating a second.
            idempotencyKey: crypto.randomUUID(),
            fullName: name,
            email,
            phone: form.phone.trim(),
            interestId: form.interest || null,
            message: form.message.trim() || null,
            consent: {
              text: CONSENT_TEXT,
              version: CONSENT_VERSION,
              url: 'https://platizioglobal.com/privacy',
            },
          }),
        })

        const data = await res.json().catch(() => ({}))
        if (!res.ok) {
          setError(data?.error ?? 'We could not send that enquiry. Please try again in a moment.')
          // Single-use token; a retry needs a fresh challenge.
          turnstile.reset()
          return
        }
        setReference(data?.enquiryRef ?? '')
        setSubmitted(true)
        return
      }

      // Unconfigured environment only — see FALLBACK_EP above.
      const fd = new FormData(formEl)
      fd.append('access_key', FALLBACK_KEY)
      fd.append('subject',    `New Enquiry from ${name} — Platizio Global`)
      fd.append('from_name',  'Platizio Global Website')
      const res  = await fetch(FALLBACK_EP, { method: 'POST', body: fd })
      const data = await res.json()
      if (res.ok && data.success) { setReference(''); setSubmitted(true) }
      else { setError(data.message || 'Something went wrong. Please try again.') }
    } catch {
      setError('Network error. Please check your connection and try again.')
    } finally {
      setSending(false)
    }
  }

  return (
    <div
      className={`modal-overlay${isContactOpen ? ' is-open' : ''}`}
      id="contactModal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="contactTitle"
      onClick={(e) => { if (e.target === e.currentTarget) closeContact() }}
    >
      <div className="modal" ref={modalRef}>
        <button className="modal-close" aria-label="Close" onClick={closeContact}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>

        <div className="form-body" style={{ display: submitted ? 'none' : undefined }}>
          <div className="modal-header">
            <h3 id="contactTitle">Get in touch with Platizio Global</h3>
            <p>Have a question about US Stocks, ETFs or onboarding? Share your details and our team will reach out.</p>
          </div>
          <div className="modal-body">
            <form onSubmit={handleSubmit} noValidate>
              <div className="field">
                <label htmlFor="fullName">Full Name <span className="req">*</span></label>
                <input ref={nameRef} type="text" id="fullName" name="fullName" required placeholder="Your full name" value={form.fullName} onChange={handleChange} />
              </div>
              <div className="field">
                <label htmlFor="email">Email ID <span className="req">*</span></label>
                <input type="email" id="email" name="email" required placeholder="you@example.com" value={form.email} onChange={handleChange} />
              </div>
              <div className="field">
                <label htmlFor="phone">Contact Number <span className="req">*</span></label>
                <input type="tel" id="phone" name="phone" required pattern="[0-9 +\-]{6,}" placeholder="+91 98XXX XXXXX" value={form.phone} onChange={handleChange} />
              </div>
              <div className="field">
                <label htmlFor="interest">Interest</label>
                <select id="interest" name="interest" value={form.interest} onChange={handleChange}>
                  <option value="">Select an option (optional)</option>
                  {INTERESTS.map((i) => (
                    <option key={i.id} value={i.id}>{i.label}</option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="message">Message / Query</label>
                <textarea id="message" name="message" placeholder="Tell us how we can help (optional)" value={form.message} onChange={handleChange} />
              </div>
              <div className="field field-consent">
                <label htmlFor="consent" style={{ display: 'flex', gap: '0.6rem', alignItems: 'flex-start', fontWeight: 400, cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    id="consent"
                    name="consent"
                    required
                    checked={form.consent}
                    onChange={handleChange}
                    style={{ marginTop: '0.25rem', flexShrink: 0 }}
                  />
                  {/*
                    Rendered verbatim, then the link added after it. What the
                    person reads and what `consent_records.consent_text` stores
                    are the same string with no transformation in between —
                    which is the only thing that makes the stored row evidence
                    of what they actually agreed to.
                  */}
                  <span style={{ fontSize: '0.88rem', lineHeight: 1.5 }}>
                    {CONSENT_TEXT}{' '}
                    <a href="/privacy" target="_blank" rel="noopener noreferrer">Read the Privacy Policy</a>.
                    <span className="req"> *</span>
                  </span>
                </label>
              </div>
              {/* Absent entirely until VITE_TURNSTILE_SITE_KEY is set. */}
              {turnstile.enabled && (
                <div
                  ref={turnstile.containerRef}
                  style={{ display: 'flex', justifyContent: 'center', marginBottom: '0.9rem' }}
                />
              )}
              {error && <p role="alert" style={{ color: '#B94B12', fontSize: '0.9rem', marginBottom: '0.75rem', textAlign: 'center' }}>{error}</p>}
              <button type="submit" className="btn btn-gold btn-lg" style={{ width: '100%', justifyContent: 'center' }} disabled={sending}>
                {sending ? 'Sending…' : 'Submit Enquiry'}
              </button>
            </form>
          </div>
        </div>

        <div className="success-state" style={{ display: submitted ? 'block' : 'none' }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" /><path d="M9 12l2 2 4-4" />
          </svg>
          <h3>Thank you</h3>
          <p>Our team will contact you shortly.</p>
          {reference && (
            <p style={{ fontSize: '0.9rem' }}>
              Your reference is <strong>{reference}</strong> — quote it if you get in touch before we do.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
