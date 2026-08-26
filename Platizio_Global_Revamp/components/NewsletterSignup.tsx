import { useState } from 'react'
import { Link } from 'react-router-dom'

type Status = 'idle' | 'sending' | 'done' | 'error'

const SUPPORT_EMAIL = 'supportglobal@platizio.com'

/**
 * Newsletter signup.
 *
 * Posts to /api/subscribe, which forwards to whatever mailing provider is
 * configured. No provider is connected yet, so that endpoint answers 503 and
 * this form says so plainly and offers an email address instead.
 *
 * It deliberately does NOT show a success message it cannot honour. A form
 * that says "Subscribed!" while storing nothing is worse than one that admits
 * it is not live: the visitor walks away believing they will hear from you.
 */
export default function NewsletterSignup() {
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<Status>('idle')
  const [message, setMessage] = useState('')

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (status === 'sending') return

    setStatus('sending')
    setMessage('')

    try {
      const res = await fetch('/api/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      const body = await res.json().catch(() => ({}))

      if (res.ok) {
        setStatus('done')
        setMessage('You are on the list. Look out for the first issue.')
        setEmail('')
      } else {
        setStatus('error')
        setMessage(body?.error || 'Could not sign you up just now.')
      }
    } catch {
      setStatus('error')
      setMessage('Could not reach the server. Check your connection and try again.')
    }
  }

  return (
    <section className="section newsletter-section" aria-labelledby="newsletter-heading">
      <div className="container">
        <div className="newsletter reveal">
          <div className="newsletter-copy">
            <span className="eyebrow on-dark">Newsletter</span>
            <h2 id="newsletter-heading">What we are reading, monthly</h2>
            <p>
              One email a month on global markets, tax changes that affect Indian
              investors, and what we have published. No trade calls, no daily noise.
            </p>
          </div>

          <form className="newsletter-form" onSubmit={onSubmit} noValidate>
            <label className="visually-hidden" htmlFor="newsletter-email">Email address</label>
            <div className="newsletter-controls">
              <input
                id="newsletter-email"
                className="newsletter-input"
                type="email"
                name="email"
                inputMode="email"
                autoComplete="email"
                placeholder="you@example.com"
                required
                value={email}
                onChange={(e) => { setEmail(e.target.value); if (status !== 'idle') setStatus('idle') }}
                aria-describedby="newsletter-status"
              />
              <button className="btn btn-gold newsletter-submit" type="submit" disabled={status === 'sending'}>
                {status === 'sending' ? 'Signing up…' : 'Subscribe'}
              </button>
            </div>

            {/* Announced to screen readers when it changes, not just shown. */}
            <p
              className={`newsletter-status is-${status}`}
              id="newsletter-status"
              role="status"
              aria-live="polite"
            >
              {status === 'error' && (
                <>
                  {message}{' '}
                  <a href={`mailto:${SUPPORT_EMAIL}?subject=Newsletter%20signup`}>
                    Email us instead
                  </a>
                </>
              )}
              {status === 'done' && message}
              {status === 'idle' && (
                <>
                  We will not share your address. See our{' '}
                  <Link to="/privacy">privacy policy</Link>.
                </>
              )}
            </p>
          </form>
        </div>
      </div>
    </section>
  )
}
