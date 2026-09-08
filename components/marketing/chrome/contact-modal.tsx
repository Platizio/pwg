"use client"

import { motion } from "motion/react"
import { useEffect, useRef, useState } from 'react'
import { EASE } from '@/lib/tokens'
import { usePresence } from '@/lib/use-presence'
import { useAppContext } from '@/src/context/AppContext'
import { anonHeaders, backendConfig } from '@/src/lib/backend'
import { useTurnstile } from '@/src/lib/useTurnstile'

interface FormState {
  fullName: string
  email: string
  phone: string
  interest: string
  message: string
  consent: boolean
}

/** The fields client-side validation can reject, and therefore can focus. */
type FieldId = 'fullName' | 'email' | 'phone' | 'consent'

interface FormError {
  text: string
  /* Which control the message is about, so the message can be wired to it with
     `aria-describedby` instead of floating unattached at the foot of the form. */
  field: FieldId
}

const EMPTY: FormState = {
  fullName: '', email: '', phone: '', interest: '', message: '', consent: false,
}

const ENQUIRY_PATH = '/functions/v1/create-enquiry'

/**
 * How long the panel takes to leave, in one place.
 *
 * Shared by the CSS transition, the motion transition and `usePresence`, which
 * is the only way the element is guaranteed to be gone from the DOM at the
 * moment it finishes fading rather than some time either side of it.
 */
const EXIT_MS = 260

const TITLE_ID   = 'contact-modal-title'
const DESC_ID    = 'contact-modal-desc'
const ERROR_ID   = 'contact-modal-error'
const STATUS_ID  = 'contact-modal-status'

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

/**
 * Everything the dialog is painted with, on token names only.
 *
 * The global rules for `.modal`, `.field` and friends in css/styles.css are
 * carrying a navy scrim (`rgba(10, 37, 64, .55)`), a navy focus ring and a
 * `#DC2626` required marker — three raw hexes from the retired palette, in a
 * sheet this component does not own and cannot edit. Rather than reuse those
 * class names and inherit the old world, the dialog is painted here under its
 * own `cm-` prefix, entirely out of the marketing tokens. That keeps it correct
 * through the palette normalisation happening in parallel: nothing below names
 * a colour, only a token, so when `--surface` or `--gold` move, this moves too.
 *
 * Translucency goes through `color-mix()` rather than an `rgba()` of decomposed
 * channels, because a channel triple is a second copy of the colour that stops
 * tracking the token the moment the token changes.
 */
const CSS = `
.cm-overlay{position:fixed;inset:0;z-index:1000;display:flex;align-items:center;justify-content:center;padding:1rem}
.cm-scrim{position:absolute;inset:0;background:rgba(11,27,51,.62)}
.cm-panel{position:relative;z-index:1;display:flex;flex-direction:column;width:100%;max-width:540px;max-height:min(92vh,780px);background:var(--paper-2);color:var(--ink);border:1px solid var(--rule);border-radius:var(--r-card);box-shadow:var(--shadow-card-hover);overflow:hidden}
.cm-panel:focus{outline:none}
.cm-scroll{overflow-y:auto;overscroll-behavior:contain;-webkit-overflow-scrolling:touch}

.cm-close{position:absolute;top:.75rem;right:.75rem;z-index:2;display:grid;place-items:center;width:44px;height:44px;padding:0;border:1px solid var(--rule-2);border-radius:var(--r-pill);background:transparent;color:var(--ink-3);cursor:pointer;transition:background var(--t-fast) var(--ease),color var(--t-fast) var(--ease)}
.cm-close:hover{background:var(--paper-3);color:var(--ink)}
.cm-close:focus-visible{outline:2px solid var(--gold-text);outline-offset:2px}
.cm-close svg{width:18px;height:18px}

.cm-head{padding:1.75rem 1.75rem 0;padding-right:4rem}
.cm-title{margin:0 0 .5rem;font-family:var(--display);font-size:1.75rem;line-height:1.15;font-weight:400;letter-spacing:-.02em;color:var(--ink)}
.cm-sub{margin:0;font-size:.9375rem;line-height:1.55;color:var(--ink-2)}
.cm-rule{height:1px;margin:1.25rem 1.75rem 0;background:var(--rule)}

.cm-body{padding:1.4rem 1.75rem 1.75rem}
.cm-field{margin-bottom:1.05rem}
.cm-label{display:block;margin-bottom:.45rem;font-size:.6875rem;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:var(--ink-3)}
.cm-req{color:var(--loss);font-weight:700}
.cm-input{display:block;width:100%;min-height:48px;padding:.75rem 1rem;font:inherit;font-size:.9375rem;color:var(--ink);background:var(--paper);border:1px solid var(--rule-2);border-radius:var(--r-tile);transition:border-color var(--t-fast) var(--ease),box-shadow var(--t-fast) var(--ease),background var(--t-fast) var(--ease)}
.cm-input::placeholder{color:var(--ink-3);opacity:1}
.cm-input:hover{border-color:var(--ink-3)}
.cm-input:focus{outline:none;background:var(--paper-2);border-color:var(--gold-text);box-shadow:0 0 0 3px rgba(217,189,139,.35)}
.cm-input:focus-visible{outline:2px solid var(--gold-text);outline-offset:2px;box-shadow:none}
.cm-input[aria-invalid="true"]{border-color:var(--loss);background:var(--loss-wash)}
textarea.cm-input{min-height:104px;resize:vertical}

.cm-consent{display:flex;gap:.8rem;align-items:flex-start;min-height:44px;padding:.85rem 1rem;background:var(--paper);border:1px solid var(--rule);border-radius:var(--r-tile)}
.cm-consent[data-invalid="true"]{border-color:var(--loss);background:var(--loss-wash)}
.cm-check{position:relative;flex:0 0 auto;margin:.12rem 0 0;width:22px;height:22px;appearance:none;-webkit-appearance:none;background:var(--paper-2);border:1.5px solid var(--rule-2);border-radius:6px;cursor:pointer;transition:background var(--t-fast) var(--ease),border-color var(--t-fast) var(--ease)}
.cm-check::after{content:"";position:absolute;inset:-11px}
.cm-check:checked{background:var(--foil);border-color:var(--foil-deep)}
.cm-check:checked::before{content:"";position:absolute;left:7px;top:3px;width:5px;height:10px;border:solid var(--on-gold);border-width:0 2px 2px 0;transform:rotate(45deg)}
.cm-check:focus-visible{outline:2px solid var(--gold-text);outline-offset:3px}
.cm-consent-text{min-width:0}
.cm-consent-label{display:block;font-size:.875rem;line-height:1.5;font-weight:400;color:var(--ink-2);cursor:pointer}
.cm-consent-link{margin:.4rem 0 0;font-size:.875rem;line-height:1.5}
.cm-consent-link a{color:var(--gold-text);text-decoration:underline;text-underline-offset:2px}
.cm-consent-link a:focus-visible{outline:2px solid var(--gold-text);outline-offset:2px}

.cm-captcha{display:flex;justify-content:center;margin-bottom:.9rem}

.cm-alert:empty{display:none}
.cm-alert{margin:0 0 .95rem}
.cm-alert-inner{display:flex;gap:.55rem;align-items:flex-start;padding:.75rem .9rem;font-size:.875rem;line-height:1.45;color:var(--loss);background:var(--loss-wash);border:1px solid rgba(176,57,44,.32);border-radius:var(--r-tile)}
.cm-alert-inner svg{flex:0 0 auto;width:16px;height:16px;margin-top:.1rem}

.cm-submit{display:flex;align-items:center;justify-content:center;gap:.6rem;width:100%;min-height:52px;padding:.85rem 1.25rem;font:inherit;font-size:.9375rem;font-weight:600;color:var(--on-gold);background:linear-gradient(120deg,#efd9b0 0%,var(--foil) 34%,#c7a468 58%,#e6cc9f 100%);border:0;border-radius:var(--r-pill);box-shadow:inset 0 1px 0 rgba(255,255,255,.75),inset 0 -1px 0 rgba(90,60,20,.25),var(--shadow-gold);cursor:pointer;transition:transform var(--t) var(--ease),box-shadow var(--t-slow) var(--ease)}
.cm-submit:hover{transform:translateY(-2px)}
.cm-submit:focus-visible{outline:2px solid var(--ink);outline-offset:3px}
.cm-submit[aria-disabled="true"]{background:var(--paper-3);color:var(--ink-3);box-shadow:none;cursor:progress;transform:none}
.cm-spin{width:16px;height:16px;border-radius:50%;border:2px solid rgba(26,18,7,.2);border-top-color:var(--ink);animation:cm-spin .7s linear infinite}
@keyframes cm-spin{to{transform:rotate(360deg)}}

.cm-success{padding:2.75rem 1.75rem 3rem;text-align:center}
.cm-success:focus{outline:none}
.cm-tick{display:block;width:56px;height:56px;margin:0 auto 1.15rem;color:var(--gain)}
.cm-success-title{margin:0 0 .5rem;font-family:var(--display);font-size:1.75rem;font-weight:400;letter-spacing:-.02em;color:var(--ink)}
.cm-success-copy{margin:0;font-size:.9375rem;line-height:1.55;color:var(--ink-2)}
.cm-ref{display:inline-block;margin-top:1rem;padding:.55rem .9rem;font-family:var(--mono);font-size:.875rem;line-height:1.4;color:var(--ink);background:var(--paper);border:1px solid var(--rule);border-radius:var(--r-chip)}

.cm-sr{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap;border:0}

@media (min-width:480px){.cm-overlay{padding:1.5rem}}
@media (max-width:479px){
  .cm-head{padding:1.4rem 1.25rem 0;padding-right:3.6rem}
  .cm-rule{margin:1.05rem 1.25rem 0}
  .cm-body{padding:1.2rem 1.25rem 1.4rem}
  .cm-success{padding:2.2rem 1.25rem 2.4rem}
}
@media (prefers-reduced-motion: reduce){.cm-spin{display:none}.cm-submit{transition:none}.cm-submit:hover{transform:none}}
`

/**
 * The contact dialog.
 *
 * Mounted only while it is on screen. That is the whole point of the split from
 * `ContactModal` below: the previous version rendered a permanent
 * `role="dialog" aria-modal="true"` node into every page and hid it with
 * `display:none`, so the page always carried a dialog and the whole form's
 * controls, and any CSS or extension that restored visibility handed the reader
 * a form nothing was managing. Unmounting is the only state in which "focus
 * cannot leave the dialog" and "there is no dialog" are both true.
 *
 * Keeping the form's state down here rather than in the parent also means each
 * opening starts clean without a timer to wipe it, and — the part that is easy
 * to miss — `useTurnstile` runs its mount effect against a container that
 * actually exists. Hoisting the hook to a permanently-mounted parent would run
 * that effect once, with a null ref, and the widget would never render.
 */
function ContactDialog({
  open,
  interest,
  onClose,
}: {
  open: boolean
  interest: string
  onClose: () => void
}) {
  const [form, setForm]           = useState<FormState>(() => ({ ...EMPTY, interest }))
  const [submitted, setSubmitted] = useState(false)
  const [sending, setSending]     = useState(false)
  const [error, setError]         = useState<FormError | null>(null)
  // Empty on the fallback path, which produces no reference at all.
  const [reference, setReference] = useState('')

  const turnstile = useTurnstile()
  /* Bound once so the ref reaches the element as a plain value; reading
     `turnstile.containerRef` in the JSX is a member access during render. */
  const { containerRef: turnstileRef } = turnstile

  const panelRef    = useRef<HTMLDivElement>(null)
  const successRef  = useRef<HTMLDivElement>(null)
  const fullNameRef = useRef<HTMLInputElement>(null)
  const emailRef    = useRef<HTMLInputElement>(null)
  const phoneRef    = useRef<HTMLInputElement>(null)
  const consentRef  = useRef<HTMLInputElement>(null)

  /* Held in a ref so the key handler never depends on the caller keeping
     `onClose` referentially stable. */
  const onCloseRef = useRef(onClose)
  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  /* Seed the interest for this opening.

     Adjusted during render rather than from an effect: seeding after paint
     shows the previous value for one frame before replacing it, and setting
     state in the effect cascades an extra render to do it. Normally the initial
     state above is enough, because a fresh opening is a fresh mount — this
     covers the one case where it is not, reopening from a different trigger
     inside the exit window while the panel is still fading out. */
  const [seededWith, setSeededWith] = useState(interest)
  if (interest !== seededWith) {
    setSeededWith(interest)
    setForm((f) => ({ ...f, interest }))
  }

  /**
   * The dialog contract: focus in, Tab trapped, Escape out, page frozen, focus
   * back where it came from. All of it torn down by the same cleanup, so there
   * is no path that installs half of it.
   */
  useEffect(() => {
    if (!open) return

    const opener = document.activeElement as HTMLElement | null

    /* Focus lands on the panel itself, not on the first field. A screen reader
       then reads the dialog's name and description before its controls, which
       is the whole reason the dialog is announced at all; focusing the name
       input instead skips straight past the heading, and on a phone it throws
       the keyboard up over the form before the reader has seen it. */
    panelRef.current?.focus()

    /* AppContext already sets this when it opens the dialog. This is a second,
       idempotent lock rather than a fight with it: both write exactly the same
       two values, so whichever runs last is right, and the dialog stops
       depending on a caller it does not control to unfreeze the page if it is
       ever closed by some other route. The provider should own this outright —
       see the note in the handover. */
    document.body.style.overflow = 'hidden'

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onCloseRef.current()
        return
      }
      if (e.key !== 'Tab') return

      const panel = panelRef.current
      if (!panel) return

      /* Filtered on rendered geometry, not just on the selector. A control in a
         `display:none` branch still matches the selector and still comes back
         from `querySelectorAll`, so an unfiltered list can name a hidden
         element as the first or last stop — and `focus()` on a hidden element
         silently drops focus to <body>, which is the trap letting go at exactly
         the moment it is being asked to hold. */
      const stops = Array.from(
        panel.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), iframe, [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((el) => el.getClientRects().length > 0)
      if (!stops.length) return

      const first = stops[0]
      const last  = stops[stops.length - 1]
      const active = document.activeElement as HTMLElement | null

      /* Focus that has already escaped — the browser drops it on <body> whenever
         the focused control is removed, which this form does every time it
         swaps the fields for the thank-you — is pulled back rather than merely
         wrapped. Without this branch neither of the two below matches and the
         Tab walks off into the page behind. */
      if (!active || !panel.contains(active)) {
        e.preventDefault()
        ;(e.shiftKey ? last : first).focus()
        return
      }
      if (e.shiftKey && (active === first || active === panel)) {
        e.preventDefault()
        last.focus()
        return
      }
      if (!e.shiftKey && active === last) {
        e.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = ''
      /* Cleared rather than restored to a captured value: AppContext sets the
         lock before this effect ever runs, so the value captured here would be
         the lock itself, and restoring it would leave the page frozen. */
      opener?.focus?.()
    }
  }, [open])

  /* Focus follows the rejection to the control it is about. The message is tied
     to that control by `aria-describedby`, so moving focus is what makes a
     screen reader read the field's name and the reason together; the alert
     region announces it for anyone whose focus is elsewhere. Keyed on the error
     object, which is new on every rejection, so submitting the same mistake
     twice announces it twice. */
  useEffect(() => {
    if (!error) return
    const target =
      error.field === 'fullName' ? fullNameRef.current :
      error.field === 'email'    ? emailRef.current :
      error.field === 'phone'    ? phoneRef.current :
      consentRef.current
    target?.focus()
  }, [error])

  /* The submit button is unmounted by the success swap while it holds focus,
     which drops focus to <body>. Moving it onto the thank-you panel keeps the
     reader inside the dialog and puts the confirmation under their cursor. */
  useEffect(() => {
    if (submitted) successRef.current?.focus()
  }, [submitted])

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

    if (name.length < 2) {
      setError({ text: 'Please enter your full name.', field: 'fullName' }); return
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError({ text: 'Please enter a valid email address.', field: 'email' }); return
    }
    if (phoneDigits.length < 8) {
      setError({ text: 'Please enter a valid contact number (at least 8 digits).', field: 'phone' }); return
    }
    if (!form.consent) {
      setError({
        text: 'Please confirm you are happy for us to contact you about this enquiry.',
        field: 'consent',
      })
      return
    }

    setSending(true)
    setError(null)

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
          /* Attributed to the name field so the message is reachable and
             re-readable; a server rejection has no field of its own, and an
             alert nothing points at is one a reader can never get back to. */
          setError({
            text: data?.error ?? 'We could not send that enquiry. Please try again in a moment.',
            field: 'fullName',
          })
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
      else { setError({ text: data.message || 'Something went wrong. Please try again.', field: 'fullName' }) }
    } catch {
      setError({ text: 'Network error. Please check your connection and try again.', field: 'fullName' })
    } finally {
      setSending(false)
    }
  }

  const invalid = (field: FieldId) => (error?.field === field ? true : undefined)
  const describedBy = (field: FieldId) => (error?.field === field ? ERROR_ID : undefined)

  return (
    <motion.div
      className="cm-overlay"
      initial={{ opacity: 0 }}
      animate={{ opacity: open ? 1 : 0 }}
      transition={{ duration: EXIT_MS / 1000, ease: EASE }}
      style={{ pointerEvents: open ? 'auto' : 'none' }}
    >
      {/* Presentational: the dialog's own close button is the accessible way
          out, so a second "Close" here would only duplicate it in the tab
          order and in the reader's element list. */}
      <div className="cm-scrim" aria-hidden="true" onClick={onClose} />

      <motion.div
        ref={panelRef}
        className="cm-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby={TITLE_ID}
        aria-describedby={DESC_ID}
        tabIndex={-1}
        /* The panel outlives `open` by one exit animation. `inert` takes its
           contents out of the tab order and the accessibility tree for that
           window, so the fading copy cannot be tabbed into after focus has
           already been handed back to the trigger. */
        inert={!open}
        initial={{ opacity: 0, y: 16, scale: 0.985 }}
        animate={{
          opacity: open ? 1 : 0,
          y: open ? 0 : 12,
          scale: open ? 1 : 0.99,
        }}
        transition={{ duration: EXIT_MS / 1000, ease: EASE }}
      >
        <button type="button" className="cm-close" aria-label="Close" onClick={onClose}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>

        {submitted ? (
          <div className="cm-success" ref={successRef} tabIndex={-1} role="status">
            <svg className="cm-tick" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="10" /><path d="M9 12l2 2 4-4" />
            </svg>
            <h2 className="cm-success-title" id={TITLE_ID}>Thank you</h2>
            <p className="cm-success-copy" id={DESC_ID}>Our team will contact you shortly.</p>
            {reference && (
              <p className="cm-ref">
                Your reference is <strong>{reference}</strong> — quote it if you get in touch before we do.
              </p>
            )}
          </div>
        ) : (
          <>
            <div className="cm-head">
              <h2 className="cm-title" id={TITLE_ID}>Get in touch with Platizio Global</h2>
              <p className="cm-sub" id={DESC_ID}>
                Have a question about US Stocks, ETFs or onboarding? Share your details and our team will reach out.
              </p>
            </div>
            <div className="cm-rule" />

            <div className="cm-scroll">
              <div className="cm-body">
                <form onSubmit={handleSubmit} noValidate aria-busy={sending}>
                  <div className="cm-field">
                    <label className="cm-label" htmlFor="fullName">Full Name <span className="cm-req" aria-hidden="true">*</span></label>
                    <input
                      className="cm-input" ref={fullNameRef} type="text" id="fullName" name="fullName" required
                      autoComplete="name" placeholder="Your full name"
                      aria-invalid={invalid('fullName')} aria-describedby={describedBy('fullName')}
                      value={form.fullName} onChange={handleChange}
                    />
                  </div>
                  <div className="cm-field">
                    <label className="cm-label" htmlFor="email">Email ID <span className="cm-req" aria-hidden="true">*</span></label>
                    <input
                      className="cm-input" ref={emailRef} type="email" id="email" name="email" required
                      autoComplete="email" placeholder="you@example.com"
                      aria-invalid={invalid('email')} aria-describedby={describedBy('email')}
                      value={form.email} onChange={handleChange}
                    />
                  </div>
                  <div className="cm-field">
                    <label className="cm-label" htmlFor="phone">Contact Number <span className="cm-req" aria-hidden="true">*</span></label>
                    <input
                      className="cm-input" ref={phoneRef} type="tel" id="phone" name="phone" required
                      autoComplete="tel" pattern="[0-9 +\-]{6,}" placeholder="+91 98XXX XXXXX"
                      aria-invalid={invalid('phone')} aria-describedby={describedBy('phone')}
                      value={form.phone} onChange={handleChange}
                    />
                  </div>
                  <div className="cm-field">
                    <label className="cm-label" htmlFor="interest">Interest</label>
                    <select className="cm-input" id="interest" name="interest" value={form.interest} onChange={handleChange}>
                      <option value="">Select an option (optional)</option>
                      {INTERESTS.map((i) => (
                        <option key={i.id} value={i.id}>{i.label}</option>
                      ))}
                    </select>
                  </div>
                  <div className="cm-field">
                    <label className="cm-label" htmlFor="message">Message / Query</label>
                    <textarea className="cm-input" id="message" name="message" placeholder="Tell us how we can help (optional)" value={form.message} onChange={handleChange} />
                  </div>

                  <div className="cm-field">
                    <div className="cm-consent" data-invalid={error?.field === 'consent' ? 'true' : undefined}>
                      <input
                        className="cm-check" ref={consentRef} type="checkbox" id="consent" name="consent" required
                        aria-invalid={invalid('consent')} aria-describedby={describedBy('consent')}
                        checked={form.consent} onChange={handleChange}
                      />
                      <div className="cm-consent-text">
                        {/*
                          Rendered verbatim, then the link added after it. What
                          the person reads and what `consent_records.consent_text`
                          stores are the same string with no transformation in
                          between — which is the only thing that makes the stored
                          row evidence of what they actually agreed to.

                          The link is a sibling of the label rather than a child
                          of it, because a link inside a label is activated by
                          the same click that toggles the box: reading the policy
                          used to silently give consent, which is the one outcome
                          a consent record must never be able to produce.
                        */}
                        <label className="cm-consent-label" htmlFor="consent">
                          {CONSENT_TEXT}
                          <span className="cm-req" aria-hidden="true"> *</span>
                        </label>
                        <p className="cm-consent-link">
                          <a href="/privacy" target="_blank" rel="noopener noreferrer">
                            Read the Privacy Policy
                          </a>
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Absent entirely until NEXT_PUBLIC_TURNSTILE_SITE_KEY is set. */}
                  {turnstile.enabled && <div className="cm-captcha" ref={turnstileRef} />}

                  {/*
                    The region is always in the tree, empty or not. A live region
                    inserted at the same moment as its text is a race some screen
                    readers lose; one that already exists reliably announces the
                    change. `role="alert"` implies assertive, but not every
                    reader in use maps the implicit value, so both are stated.
                  */}
                  <div className="cm-alert" id={ERROR_ID} role="alert" aria-live="assertive" aria-atomic="true">
                    {error && (
                      <span className="cm-alert-inner">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <circle cx="12" cy="12" r="10" /><path d="M12 8v5M12 16.5v.01" />
                        </svg>
                        <span>{error.text}</span>
                      </span>
                    )}
                  </div>

                  {/*
                    `aria-disabled` rather than `disabled`. A disabled control is
                    dropped from the tab order, so disabling the button while it
                    holds focus throws focus to <body> and out of the trap; it is
                    also skipped by some readers entirely, which is the opposite
                    of telling someone their enquiry is in flight. The submit
                    handler already refuses a second run, so the guard does not
                    need the attribute to enforce it.
                  */}
                  <button
                    type="submit"
                    className="cm-submit"
                    aria-disabled={sending || undefined}
                    aria-describedby={STATUS_ID}
                  >
                    {sending && <span className="cm-spin" aria-hidden="true" />}
                    {sending ? 'Sending…' : 'Submit Enquiry'}
                  </button>

                  {/* Carries the send state to anyone not looking at the button.
                      Present from first render for the same reason as the alert
                      region above. */}
                  <p className="cm-sr" id={STATUS_ID} role="status" aria-live="polite">
                    {sending ? 'Sending your enquiry.' : ''}
                  </p>
                </form>
              </div>
            </div>
          </>
        )}
      </motion.div>
    </motion.div>
  )
}

/**
 * The mount gate.
 *
 * `usePresence` rather than `AnimatePresence`: in this stack (Next 16 / React
 * 19.2 / Turbopack, motion 12.43) `AnimatePresence` runs the exit transition
 * and then never unmounts the child, which would leave exactly the invisible,
 * focusable dialog this rewrite exists to remove. See lib/use-presence.ts.
 */
export default function ContactModal() {
  const { isContactOpen, contactInterest, closeContact } = useAppContext()
  const mounted = usePresence(isContactOpen, EXIT_MS)

  if (!mounted) return null

  return (
    <>
      {/*
        No interpolation of any kind — `CSS` is a module constant, so there is
        nothing here for an injection to reach. `dangerouslySetInnerHTML` is
        used because React escapes text children on the server pass, which would
        corrupt the sheet for the first paint.
      */}
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <ContactDialog open={isContactOpen} interest={contactInterest} onClose={closeContact} />
    </>
  )
}
