import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAppContext } from '../context/AppContext'
import SEO, { breadcrumbSchema, faqSchema } from '../components/SEO'
import { TRADING_PLATFORM_URL } from '../constants'
import { ALL_FAQS, FAQ_SECTIONS, FEATURED_FAQS } from '../content/faqs'

const PlusIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 5v14M5 12h14" />
  </svg>
)

/**
 * The section the reader is currently inside, for the index rail.
 *
 * Initialised from static data — the first section's id — so the server render
 * and the client's first render are byte-identical and hydration has nothing to
 * reconcile. The observer only runs in an effect.
 */
function useActiveSection(ids: string[]): string {
  const [active, setActive] = useState(ids[0])

  useEffect(() => {
    const els = ids
      .map((id) => document.getElementById(id))
      .filter((el): el is HTMLElement => el !== null)
    if (!els.length || !('IntersectionObserver' in window)) return

    /* The band is the top third of the viewport, below the floating pill: a
       section counts as current once its heading reaches reading height, not
       when its last paragraph leaves the screen. */
    const io = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting)
        if (!visible.length) return
        const top = visible.sort(
          (a, b) => a.boundingClientRect.top - b.boundingClientRect.top,
        )[0]
        setActive(top.target.id)
      },
      { rootMargin: '-96px 0px -66% 0px', threshold: 0 },
    )
    els.forEach((el) => io.observe(el))
    return () => io.disconnect()
  }, [ids])

  return active
}

/**
 * One question. A native <details>, so there is no state to hold, find-in-page
 * reaches every answer, and the whole page works with scripts off.
 *
 * `anchorId` is optional because the featured block repeats questions that also
 * live inside a section. The section copy owns the id — the support assistant
 * deep-links to it — and the featured copy carries none, so the document never
 * holds two elements with the same id.
 */
function Question({ q, a, anchorId }: { q: React.ReactNode; a: React.ReactNode; anchorId?: string }) {
  return (
    <details className="faq-item" {...(anchorId ? { id: anchorId } : {})}>
      <summary className="faq-q">
        {q}
        <span className="faq-ico" aria-hidden="true"><PlusIcon /></span>
      </summary>
      <div className="faq-a">{a}</div>
    </details>
  )
}

export default function FAQs() {
  const { openContact } = useAppContext()
  const sectionIds = useMemo(() => FAQ_SECTIONS.map((s) => s.id), [])
  const activeId = useActiveSection(sectionIds)

  return (
    <>
      <SEO
        title="FAQs — US Stocks &amp; ETF Investing Questions Answered"
        description="Find answers to common questions about investing in US Stocks and ETFs from India via Platizio Global — covering account opening, LRS, taxation, safety, and more."
        canonical="/faqs"
        jsonLd={[
          breadcrumbSchema([['Home', '/'], ['FAQs', '/faqs']]),
          faqSchema(ALL_FAQS),
        ]}
      />

      <section className="page-hero">
        <div className="container">
          <div className="breadcrumb">
            <Link to="/">Home</Link><span className="crumb-sep" aria-hidden="true">/</span><span>FAQs</span>
          </div>
          <h1>Frequently Asked Questions</h1>
          <p>
            {ALL_FAQS.length} answers on opening an account, moving money, what you
            pay, how it is taxed, and who holds your shares.
          </p>
        </div>
      </section>

      {/*
        The questions people actually arrive with, above the index. Every one of
        them also lives in its section below — this is a shortcut, not a second
        copy of the content, which is why the ids stay on the section copies.
      */}
      {FEATURED_FAQS.length > 0 && (
        <section className="section faq-featured-section" aria-labelledby="faq-featured">
          <div className="container">
            <div className="faq-featured">
              <p className="eyebrow">Start here</p>
              <h2 id="faq-featured">Asked most often</h2>
              <div className="faq-list">
                {FEATURED_FAQS.map((faq) => (
                  <Question key={`featured-${faq.id}`} q={faq.q} a={faq.a} />
                ))}
              </div>
              <p className="faq-featured-more">
                Not here? <Link to="/help">Ask the support assistant</Link>, or read
                every answer below.
              </p>
            </div>
          </div>
        </section>
      )}

      <section className="section" aria-labelledby="faq-heading">
        <div className="container">
          <h2 id="faq-heading" className="visually-hidden">Questions and answers</h2>

          <div className="faq-layout">
            {/* Eleven sections is more than a reader will scroll looking for one
                of them, and the page is otherwise a single column of prose with
                no way to see its own shape. */}
            <nav className="faq-index" aria-label="FAQ sections">
              <p className="eyebrow">Contents</p>
              <ul>
                {FAQ_SECTIONS.map(({ id, num, title }) => (
                  <li key={id}>
                    <a href={`#${id}`} aria-current={activeId === id ? 'true' : undefined}>
                      <span className="faq-index-num">{String(num).padStart(2, '0')}</span>
                      {title}
                    </a>
                  </li>
                ))}
              </ul>
            </nav>

            <div className="faq-sections">
              {FAQ_SECTIONS.map(({ id, num, title, note, items, readMore }) => (
                <section className="faq-section" id={id} key={id} aria-labelledby={`${id}-title`}>
                  <p className="eyebrow">
                    {String(num).padStart(2, '0')} · {items.length} question{items.length === 1 ? '' : 's'}
                  </p>
                  <h2 className="faq-section-title" id={`${id}-title`}>{title}</h2>

                  {note}

                  <div className="faq-list">
                    {items.map(({ id: itemId, q, a }) => (
                      <Question key={itemId} anchorId={itemId} q={q} a={a} />
                    ))}
                  </div>

                  {readMore && readMore.length > 0 && (
                    <div className="faq-read-more">
                      <span>Read more</span>
                      <ul>
                        {readMore.map(({ label, to }) => (
                          <li key={to}><Link to={to}>{label}</Link></li>
                        ))}
                      </ul>
                    </div>
                  )}
                </section>
              ))}

              <aside className="faq-disclaimer" aria-labelledby="faq-disclaimer-title">
                <h2 id="faq-disclaimer-title">Important disclaimer</h2>
                <p>
                  Investing in securities involves market risk, including the possible loss of
                  capital. The value of investments can go up as well as down. The information in
                  these FAQs is provided for general guidance only and does not constitute
                  investment, legal, or tax advice. Tax treatment depends on your individual
                  circumstances and may change. Please read all product terms and consult a
                  qualified financial or tax advisor before investing. Platizio Services LLP
                  facilitates access to US markets through its US brokerage partner; investments
                  are executed and held with ViewTrade IFSC at GIFT City.
                </p>
              </aside>
            </div>
          </div>

          <div className="regs-cta faq-cta">
            <h3>Still have a question?</h3>
            <p>Ask the assistant, talk to us directly, or open your account and start small.</p>
            <div className="faq-cta-actions">
              <Link className="btn btn-gold btn-lg" to="/help">
                Ask the assistant
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 12h14M13 5l7 7-7 7" />
                </svg>
              </Link>
              <button className="btn btn-light btn-lg" onClick={() => openContact()}>
                Contact Platizio Global
              </button>
              <a
                className="btn btn-light btn-lg"
                href={TRADING_PLATFORM_URL}
                target="_blank"
                rel="noopener noreferrer"
              >
                Start investing
              </a>
            </div>
          </div>
        </div>
      </section>
    </>
  )
}
