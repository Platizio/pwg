"use client"

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { motion, useReducedMotion } from 'motion/react'

import SEO, { breadcrumbSchema } from '../../src/components/SEO'
import { TRADING_PLATFORM_URL } from '../../src/constants'
import TeamCarousel from '../components/TeamCarousel'

const ArrowIcon = () => (
  <svg className="ab-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
    <path d="M5 12h14M13 5l7 7-7 7" />
  </svg>
)

const CheckIcon = () => (
  <svg className="ab-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
    <path d="M20 6 9 17l-5-5" />
  </svg>
)

/**
 * How the account is actually structured.
 *
 * Framed as the questions a sceptical investor asks, because that is how the
 * information is looked for. Every answer is already published on this site —
 * see docs/07-about-spec.md for the claim-to-source table. Nothing here is new,
 * and nothing should be added without a source.
 */
const STRUCTURE = [
  {
    q: 'Who holds your shares?',
    a: (
      <>
        Your account is opened <strong>in your name</strong> with ViewTrade IFSC at GIFT
        City once KYC is approved. Client money and securities sit with ViewTrade IFSC,
        with <strong>DTCC as ultimate custodian</strong>, and are kept{' '}
        <strong>separate from Platizio</strong>.
      </>
    ),
  },
  {
    q: 'Who executes your orders?',
    a: (
      <>
        ViewTrade. They are a B2B brokerage and financial-technology provider, and the
        partnership is what gives the platform its trade routing, execution and custody.
        It is not a marketing arrangement — it is who holds the assets.
      </>
    ),
  },
  {
    q: 'What is Platizio’s role, exactly?',
    a: (
      <>
        Platizio is <strong>not</strong> a broker, broker-dealer, custodian, investment
        adviser, portfolio manager, research analyst or authorised dealer. We facilitate
        access, onboarding and guidance. All brokerage, execution, custody, clearing and
        settlement are performed by ViewTrade or its appointed service providers.
      </>
    ),
  },
  {
    q: 'What protection applies?',
    a: (
      <>
        US brokerage accounts are covered by SIPC up to <strong>USD 500,000</strong> in
        total, including up to USD 250,000 for cash — the standard protection across US
        broker-dealers. <strong>SIPC protects against the failure of a brokerage firm.
        It does not protect against a fall in the market value of your investments.</strong>
      </>
    ),
  },
]

/**
 * The page's own contents, printed in the hero as an index.
 *
 * The reader who opens /about is usually holding one of two questions — who am
 * I dealing with, and where does the money actually sit — and the custody
 * answer used to be four screens down with no sign it existed. Every label
 * here is the section's own h2, verbatim, so the index states nothing the page
 * does not already say; it only says it sooner.
 *
 * Plain `#` anchors on purpose: site-chrome.tsx intercepts every in-page hash
 * link, scrolls it with Lenis (`scrollToTarget`, never `scrollIntoView`, which
 * fights the smooth-scroll instance) and moves focus to the target section.
 */
const CONTENTS = [
  { n: '01', label: 'Access was never the hard part', href: '#why' },
  { n: '02', label: 'Who runs it', href: '#leadership' },
  { n: '03', label: 'The Team', href: '#team' },
  { n: '04', label: 'Where your money actually sits', href: '#structure' },
]

/**
 * Entrance motion that survives a reader whose JavaScript never runs.
 *
 * motion server-renders its `initial` prop into the HTML, so the obvious
 * `initial={{ opacity: 0 }}` ships every section at opacity 0 into the markup —
 * the bug this site shipped for months. Here the *final* state is what the
 * server writes and what the first client paint shows; the hidden state is
 * armed afterwards, from an effect, and only for an element that is still
 * genuinely below the fold. Anything already on screen is never touched, so no
 * reader watches content blink out and back, and the hiding itself happens
 * where nobody can see it.
 *
 * Transform and opacity only, and never on the hero: the h1 is this page's
 * largest paint and it is not a motion element at all.
 */
function useReveal(reduce: boolean | null) {
  const ref = useRef<HTMLDivElement>(null)
  const [away, setAway] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el || reduce) return

    // 0.86 rather than 1.0: an element whose top sits in the last sliver of the
    // viewport is already being read, and arming it would hide something the
    // reader has their eye on.
    if (el.getBoundingClientRect().top <= window.innerHeight * 0.86) return

    // Converges in one pass — the guard above means this can only ever run on
    // the mount pass, for an element that is off-screen while it happens.
    setAway(true)

    const io = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return
        setAway(false)
        io.disconnect()
      },
      // Held back a little from the true edge so a card starts its rise once it
      // is committed to the viewport rather than the instant it clips it.
      { rootMargin: '0px 0px -12% 0px' },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [reduce])

  return { ref, away }
}

function Reveal({ children, className, delay = 0 }: { children: ReactNode; className?: string; delay?: number }) {
  const reduce = useReducedMotion()
  const { ref, away } = useReveal(reduce)

  return (
    <motion.div
      ref={ref}
      className={className}
      /* The one line that keeps the server's HTML the finished page. */
      initial={false}
      animate={away ? { opacity: 0, y: 22 } : { opacity: 1, y: 0 }}
      /* Hiding is instantaneous — it is a setup step, not a gesture. Only the
         arrival is timed, and it is timed on the site's own curve. */
      transition={away ? { duration: 0 } : { duration: 0.6, delay, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  )
}

/**
 * The section opener, one device for the whole page: a numbered eyebrow and the
 * heading on the left, the section's own intro paragraph on the right, both
 * sitting on a single hairline. It is the /products head, and it is what makes
 * a section read as a chapter rather than as another block of text.
 *
 * The paragraph is optional because two of these sections never had one, and
 * inventing intro copy to fill a layout is how a restyle turns into a rewrite.
 */
/* No eyebrow. Every head used to open on "01 — Why we exist" above its own
   heading; the number said nothing the reader needed and the label restated
   the heading in fewer words. The heading carries the section on its own. */
function SectionHead({ title, id, body }: { title: string; id: string; body?: string }) {
  return (
    <header className="ab-head">
      <div className="ab-head-l">
        <h2 className="ab-h2" id={id}>{title}</h2>
      </div>
      {body && <p className="ab-head-b">{body}</p>}
    </header>
  )
}

export default function About() {
  return (
    <div className="ab">
      <SEO
        title="About Us — IFSCA-Regulated Global Investing Platform"
        description="Who is behind Platizio Global, and how your US investments are held. An IFSCA-regulated platform helping Indian investors access US Stocks and ETFs through the RBI's Liberalised Remittance Scheme (LRS)."
        canonical="/about"
        jsonLd={breadcrumbSchema([['Home', '/'], ['About Us', '/about']])}
      />

      {/* ===== 1. HERO =====
          The page's own opener rather than the shared `.page-hero`, which is an
          ink floor carrying white type: its last breadcrumb crumb and its
          separators are set in `--white`, so on paper they are white on cream
          and simply vanish. That band lives in page.css, which this page does
          not own, so the fix is to stop standing on it. Paper, warm ink, one
          gold wash — the /products hero, with an index where the terminal
          screenshot sits. */}
      <section className="ab-hero" aria-labelledby="about-title">
        <div className="container ab-hero-inner">
          <div className="ab-hero-copy">
            <nav className="ab-crumbs" aria-label="Breadcrumb">
              <Link href="/">Home</Link>
              <span className="ab-crumb-sep" aria-hidden="true">/</span>
              <span aria-current="page">About Us</span>
            </nav>

            <span className="ab-label">Who is behind Platizio Global</span>

            <h1 className="ab-h1" id="about-title">The people behind your portfolio</h1>

            <p className="ab-deck">
              Who we are, who handles your money, and exactly how your shares are held.
            </p>
          </div>

          <nav className="ab-index" aria-label="On this page">
            <p className="ab-index-label">On this page</p>
            <ol>
              {CONTENTS.map(({ n, label, href }) => (
                <li key={href}>
                  <a className="ab-index-link" href={href}>
                    <span className="ab-index-n" aria-hidden="true">{n}</span>
                    <span className="ab-index-t">{label}</span>
                    <span className="ab-rule" aria-hidden="true" />
                  </a>
                </li>
              ))}
            </ol>
          </nav>
        </div>
      </section>

      {/* ===== 2. WHY WE EXIST ===== */}
      <section className="ab-step" id="why" aria-labelledby="why-exist-heading">
        <div className="container">
          <SectionHead id="why-exist-heading" title="Access was never the hard part" />

          {/* Copy-led split, 1fr / 0.82fr. The lineage paragraph was a footnote
              under a hairline at the end of the prose, which is where a reader
              stops. As the narrower pane it sits beside the argument instead of
              after it — the same sentence, given the standing of a fact rather
              than an afterthought. */}
          <div className="ab-split">
            <Reveal className="ab-prose">
              <p>
                Buying a US share from India has been technically possible for years. What
                stops people is everything around it — a remittance process under the LRS
                that most banks explain badly, tax treatment split across two countries
                that nobody walks you through, and an account that goes quiet the moment
                it is opened. The friction is not in the trade. It is in the forty steps
                on either side of it.
              </p>
              <p>
                Platizio Global exists to carry those steps for you: onboarding handled
                end to end, the tax and remittance questions answered in plain language
                before you hit them, and a person to ask afterwards. We would rather you
                understood the TCS credit you are owed than opened an account a day sooner.
              </p>
            </Reveal>

            <Reveal className="ab-aside" delay={0.08}>
              <p className="ab-aside-label">Behind the platform</p>
              <p className="ab-aside-b">
                Platizio Global is backed by <strong>Platizio Services LLP</strong>, a
                licensed distributor of mutual funds and Specialised Investment Funds in
                India — an established regulated business, not a new venture learning as
                it goes.
              </p>
            </Reveal>
          </div>
        </div>
      </section>

      {/* ===== 3. FOUNDER =====
          Editorial rather than a card in a row. On a page answering "who is
          behind my money", the person answering it should not be a 300px tile. */}
      <section className="ab-step" id="leadership" aria-labelledby="founder-heading">
        <div className="container">
          <SectionHead id="founder-heading" title="Who runs it" />

          <Reveal className="ab-founder">
            <div className="ab-founder-photo">
              <picture>
                <source srcSet="/sir.webp" type="image/webp" />
                <img
                  src="/sir.png"
                  alt="Vividh Chaturvedi, Founder and CEO of Platizio Global"
                  width={640}
                  height={640}
                />
              </picture>
            </div>

            <div className="ab-founder-info">
              <h3 className="ab-founder-name">Vividh Chaturvedi</h3>
              <p className="ab-founder-title">Founder &amp; CEO, Platizio Global</p>
              <p className="ab-founder-cred">MBA · Certified Financial Planner (CFP&reg;)</p>
              <ul className="ab-creds">
                <li>
                  <CheckIcon />
                  Over 30 years across financial services and international business
                </li>
                <li>
                  <CheckIcon />
                  Works across global equities, bonds and commodities
                </li>
              </ul>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ===== 4. TEAM ===== */}
      <section className="ab-step" id="team" aria-labelledby="team-heading">
        <div className="container">
          <SectionHead
            id="team-heading"
            title="The Team"
            body="Research, engineering and operations. If you speak to someone at Platizio Global, it is one of them."
          />

          <Reveal className="ab-team">
            <TeamCarousel />
          </Reveal>
        </div>
      </section>

      {/* ===== 5. HOW WE'RE STRUCTURED ===== */}
      <section className="ab-step" id="structure" aria-labelledby="structure-heading">
        <div className="container">
          <SectionHead
            id="structure-heading"
            title="Where your money actually sits"
            body="Investments are routed through the GIFT City framework under IFSCA oversight. Here is what that means in practice."
          />

          {/* Each answer is its own split row rather than a card: the question
              in ink on the narrow side, the answer in the wide one, separated by
              the same hairline the section heads use. These four are the
              regulatory core of the page — an accordion would hide the custody
              and SIPC statements behind a click, which is the wrong default for
              copy a reader came here to check. */}
          <dl className="ab-qa">
            {STRUCTURE.map(({ q, a }, i) => (
              <Reveal className="ab-qa-row" key={q} delay={i * 0.06}>
                <dt className="ab-qa-q">
                  <span className="ab-qa-n" aria-hidden="true">{String(i + 1).padStart(2, '0')}</span>
                  {q}
                </dt>
                <dd className="ab-qa-a">{a}</dd>
              </Reveal>
            ))}
          </dl>

          <p className="ab-note">
            Full terms are set out in our{' '}
            <Link href="/disclaimer">risk disclosure and disclaimer</Link>, and the
            practical questions are answered in the <Link href="/faqs">FAQs</Link>.
          </p>
        </div>
      </section>

      {/* ===== 6. CTA =====
          Was `.regs-cta`, which is still an ink well — `radial-gradient(… var(--ink-700), var(--ink-900))`
          in home-market.css, a file this page does not own. On paper the close
          is a rule, a wash and one gold button, the way /products ends. */}
      <section className="ab-close" aria-labelledby="about-cta-heading">
        <div className="container">
          <Reveal className="ab-close-inner">
            <span className="ab-close-rule" aria-hidden="true" />
            <h2 className="ab-h2" id="about-cta-heading">Open your account</h2>
            <p className="ab-close-b">
              Complete KYC online, fund through your bank, and place your first US order.
            </p>
            <a className="ab-cta" href={TRADING_PLATFORM_URL} target="_blank" rel="noopener noreferrer">
              Start investing <ArrowIcon />
            </a>
          </Reveal>
        </div>
      </section>
    </div>
  )
}
