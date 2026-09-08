"use client"

/*
 * /pricing — the cost of investing, in the same world as /products.
 *
 * WHY THIS WAS REBUILT. The page opened on `.page-hero`, which page.css paints
 * as an ink floor carrying white type. Once marketing-tokens.css re-pointed the
 * palette at the product page's champagne, that floor did not become paper — it
 * became near-black, which is exactly the "black and champagne" that was
 * rejected. Re-colouring a band does not stop it being a band, so the band is
 * gone: this page now opens on paper with the radial gold wash `.ft-hero` uses,
 * and nothing on it is a dark surface.
 *
 * The second dark surface was the calculator's readout, `.calc-result`, an
 * ink panel set in white type. It is a component I do not own, but its styling
 * is mine (pricing.css), so it is converted there rather than here — see the
 * note above `.calc-result`.
 *
 * WHAT IS BORROWED FROM /products, deliberately and by name:
 *   - the asymmetric split: 1fr/0.82fr where copy leads, never 50/50
 *   - the section head as a row: numbered eyebrow + 18ch h2 on the left, a
 *     34ch paragraph on the right, over a hairline
 *   - oversized figures in tabular numerals, tight tracking, line-height ~0.94
 *   - radial gradient washes for depth rather than drop shadows
 *   - the hairline link gesture: 26px scaling from scaleX(0.62) to 1
 *
 * WHAT IS NOT COPIED: /products' devices that belong to its argument — the
 * tape, the live indicator, the accordion index. This page's argument is a
 * published schedule, so its centre is a ledger and a calculator.
 *
 * COPY IS UNTOUCHED. Every number, rate, regulatory statement and legal
 * sentence is exactly what the page already published, and every figure is read
 * from data/pricingRates.ts, which /products reads too. Nothing is restated in
 * JSX — that file is the single source of truth for all of it.
 */

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import Link from 'next/link'
import SEO, { breadcrumbSchema } from '../../src/components/SEO'
import { TRADING_PLATFORM_URL } from '../../src/constants'
import { scrollToTarget } from '../../src/lib/smoothScroll'
import { RATES, FREE_ITEMS, TRADING_CHARGES, pct } from '../data/pricingRates'
import { formatInr } from '../lib/pricing'
import TradeCostCalculator from '../components/TradeCostCalculator'
import CapitalGainsCompare from '../components/CapitalGainsCompare'

/** ₹15L remitted against a ₹10L threshold — the worked example from the spec. */
const TCS_EXAMPLE_REMITTANCE = 1_500_000
const TCS_EXAMPLE_TAXABLE = TCS_EXAMPLE_REMITTANCE - RATES.tcsThresholdInr
const TCS_EXAMPLE_AMOUNT = TCS_EXAMPLE_TAXABLE * RATES.tcsPct

/* The one curve the site uses, spelled out for motion because a CSS variable
   cannot reach a JS transition. Same numbers as --ease. */
const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1]

/* ------------------------------------------------------------------ motion */

/*
 * Entrance motion that a reader without JavaScript still sees.
 *
 * `motion` serialises its `initial` prop into the server HTML, so the obvious
 * `initial={{ opacity: 0 }}` ships this page at zero opacity to anyone whose
 * bundle never runs — the bug this site carried for months. Instead the server
 * renders the FINISHED state (phase `rest`, `initial={false}`), and the hidden
 * state is applied only after mount and only to elements that are genuinely
 * below the fold, where snapping them to invisible cannot be seen. The snap is
 * given a zero-length transition for the same reason: an off-screen fade-out is
 * work nobody watches, and a fast scroller could catch it mid-way.
 *
 * Nothing above the fold is ever armed, so the LCP element never animates.
 */
type Phase = 'rest' | 'armed' | 'shown'

function useRevealPhase<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [phase, setPhase] = useState<Phase>('rest')
  /* An IntersectionObserver is a scroll-bound effect, and the site-wide
     <MotionConfig reducedMotion="user"> cannot reach it: it suppresses the
     transform a motion element would run, not the observer that arms one. So
     this branches explicitly and never hides anything at all. */
  const reduce = useReducedMotion()

  useEffect(() => {
    const el = ref.current
    if (!el || reduce) return
    /* Already in view on arrival means the reader is already looking at it.
       Hiding that is a flash, not an entrance. */
    if (el.getBoundingClientRect().top < window.innerHeight * 0.85) return

    setPhase('armed')
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return
        setPhase('shown')
        io.disconnect()
      },
      /* A tenth of a viewport of overlap, so the reveal lands as the block
         arrives rather than the instant its first pixel crosses the edge. */
      { rootMargin: '0px 0px -10% 0px' },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [reduce])

  return { ref, phase }
}

/* Transform and opacity only — never width, height, top, filter or shadow. */
function revealProps(phase: Phase, delay: number) {
  const armed = phase === 'armed'
  return {
    initial: false as const,
    animate: armed ? { opacity: 0, y: 20 } : { opacity: 1, y: 0 },
    transition: armed
      ? { duration: 0 }
      : { duration: 0.6, ease: EASE, delay: phase === 'shown' ? delay : 0 },
  }
}

interface RevealProps {
  children: ReactNode
  className?: string
  /** Stagger within a group. Only applied on the way in, never on the arm. */
  delay?: number
}

function Reveal({ children, className, delay = 0 }: RevealProps) {
  const { ref, phase } = useRevealPhase<HTMLDivElement>()
  return (
    <motion.div ref={ref} className={className} {...revealProps(phase, delay)}>
      {children}
    </motion.div>
  )
}

/* Same behaviour, correct element. The tax blocks are articles because each is
   independently meaningful, and a wrapper div around them would put a
   non-semantic box between the grid and its cells. */
function RevealArticle({ children, className, delay = 0 }: RevealProps) {
  const { ref, phase } = useRevealPhase<HTMLElement>()
  return (
    <motion.article ref={ref} className={className} {...revealProps(phase, delay)}>
      {children}
    </motion.article>
  )
}

/* ------------------------------------------------------------------- page */

export default function Pricing() {
  /* In-page anchors go through Lenis. A native hash jump fights the smooth
     scroller for control of the same scrollTop and the page stutters; Lenis is
     also the thing that knows to fall back to a native jump under reduced
     motion, so this stays correct for a reader who asked for stillness. */
  const toSchedule = (e: React.MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault()
    scrollToTarget('#schedule', -80)
  }

  return (
    <div className="pz">
      <SEO
        title="Pricing &amp; Charges — US Stocks Account"
        description="Transparent pricing for investing in US Stocks from India via Platizio Global. Calculate your exact trade cost, and see brokerage, regulatory fees, TCS and capital gains tax explained."
        canonical="/pricing"
        jsonLd={breadcrumbSchema([['Home', '/'], ['Pricing', '/pricing']])}
      />

      {/* ===== 1. HERO =====
          Copy-led, so the split is 1fr/0.82fr: the rate panel is the subject
          but the sentence is the argument. No band, no ink floor — paper with
          the radial wash, the way /products opens. */}
      <section className="pz-hero">
        <div className="container pz-hero-inner">
          <div className="pz-hero-copy">
            <nav className="pz-crumb" aria-label="Breadcrumb">
              <Link href="/">Home</Link>
              <span className="pz-crumb-sep" aria-hidden="true">/</span>
              <span aria-current="page">Pricing</span>
            </nav>

            <p className="pz-mark">
              <span className="pz-mark-dot" aria-hidden="true" />
              <span className="pz-label">Pricing &amp; charges · US stocks account</span>
            </p>

            <h1 className="pz-h1">
              What investing <em>costs</em>
            </h1>

            <p className="pz-lede">
              No account fee, one brokerage rate, and every regulatory charge passed
              through at cost. Work out your exact cost below.
            </p>

            <div className="pz-actions">
              <a className="pz-cta" href={TRADING_PLATFORM_URL} target="_blank" rel="noopener noreferrer">
                Start investing
              </a>
              <a className="pz-ghost" href="#schedule" onClick={toSchedule}>
                See the full schedule
              </a>
            </div>
          </div>

          {/* The rate itself, standing in the hero as the thing being priced.
              This is the old "short version" section: nothing was cut, it moved
              into the viewport where the question is actually asked. */}
          <section className="pz-rate" aria-labelledby="headline-heading">
            <span className="pz-label">The short version</span>
            <h2 id="headline-heading" className="pz-rate-h">
              You pay to trade, not to hold an account
            </h2>

            <p className="pz-rate-fig">
              <span className="pz-rate-value">{pct(RATES.brokeragePct)}</span>
              <span className="pz-rate-label">per transaction</span>
              <span className="pz-rate-note">Minimum ${RATES.brokerageMinUsd} per order</span>
            </p>

            <ul className="pz-free">
              {FREE_ITEMS.map(({ label, value }) => (
                <li key={label}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M20 6 9 17l-5-5" />
                  </svg>
                  <span className="pz-free-label">{label}</span>
                  <span className="pz-free-value">{value}</span>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </section>

      {/* ===== 2. CALCULATOR =====
          Rendered inside `.pz` on purpose. It carries the shared
          `.section-header` markup, which pricing.css re-lays as the /products
          section head — so a component this page does not own still arrives in
          this page's composition. */}
      <TradeCostCalculator />

      {/* ===== 3. FULL SCHEDULE ===== */}
      <section className="section pz-section" id="schedule" aria-labelledby="schedule-heading">
        <div className="container">
          <header className="section-header">
            <span className="eyebrow">The full schedule</span>
            <h2 id="schedule-heading">Every charge, in full</h2>
            <p>
              The published rates behind the calculator. Regulatory fees are collected
              by the exchanges and regulators, and passed through without markup.
            </p>
          </header>

          {/* A ledger, not a table: five published rates, each on its own line,
              the rate set large in tabular numerals so the column reads as a
              schedule rather than as prose with numbers in it. */}
          <Reveal className="pz-ledger">
            <ul className="pz-ledger-list">
              {TRADING_CHARGES.map(({ head, value, note }) => (
                <li key={head}>
                  <span className="pz-ledger-head">{head}</span>
                  <span className="pz-ledger-val">
                    {value}
                    {note && <em className="pz-ledger-note">{note}</em>}
                  </span>
                </li>
              ))}
            </ul>
          </Reveal>

          <p className="pz-asof">Rates as of {RATES.ratesAsOf}.</p>
        </div>
      </section>

      {/* ===== 4. TAX ===== */}
      <section className="section pz-section pz-tax-section" aria-labelledby="tax-heading">
        <div className="container">
          <header className="section-header">
            <span className="eyebrow">Tax</span>
            <h2 id="tax-heading">What the tax office takes</h2>
            <p>
              Four things apply to Indian residents investing abroad. Two are credits
              you can claim back rather than costs; one only bites above a threshold
              that a growing portfolio eventually crosses.
            </p>
          </header>

          <div className="pz-tax">
            {/* --- TCS: explained, deliberately not calculated. The threshold is
                    cumulative across the year and across every LRS purpose, so a
                    tool taking only "this remittance" would quietly understate it
                    for anyone who had already remitted. --- */}
            <RevealArticle className="pz-tax-block pz-tax-block--split">
              <h3>TCS when you send money abroad</h3>
              <p className="pz-tax-p">
                TCS applies at {pct(RATES.tcsPct)} on money remitted under the LRS
                <strong> above ₹{formatInr(RATES.tcsThresholdInr)} in a financial year</strong>.
                That threshold counts every LRS purpose together — travel, education,
                gifts and investing — not just what you send to invest.
              </p>
              <div className="pz-example">
                <span className="pz-example-label">Worked example</span>
                <p>
                  Remit ₹{formatInr(TCS_EXAMPLE_REMITTANCE)} across a financial year and
                  TCS applies to the ₹{formatInr(TCS_EXAMPLE_TAXABLE)} above the threshold:
                  <strong> ₹{formatInr(TCS_EXAMPLE_AMOUNT)}</strong>.
                </p>
              </div>
              <p className="pz-tax-emphasis">
                TCS is not a cost. It is a credit against your income tax liability, claimed
                when you file your return.
              </p>
            </RevealArticle>

            {/* --- Capital gains: the comparator --- */}
            <RevealArticle className="pz-tax-block pz-tax-block--full" delay={0.06}>
              <h3>Capital gains when you sell</h3>
              <p className="pz-tax-p">
                How long you hold decides the rate. Sell within{' '}
                {RATES.ltcgThresholdMonths} months and gains are taxed at your income slab;
                hold beyond it and they are taxed at {pct(RATES.ltcgPct)}.
              </p>
              <CapitalGainsCompare />
            </RevealArticle>

            {/* --- US estate tax ---
                    Added after audit: the page previously said "three things
                    apply" and omitted the only one that scales with account size.
                    Every figure here is already published in the site's own
                    article; nothing new is asserted. Omitting it understated the
                    picture precisely for the largest accounts. --- */}
            <RevealArticle className="pz-tax-block" delay={0.12}>
              <h3>US estate tax, above a threshold</h3>
              <p className="pz-tax-p">
                US-situs assets — which includes US shares held by a non-resident — fall
                under US estate tax above a{' '}
                <strong>USD 60,000 exemption</strong>, at rates reaching{' '}
                <strong>40%</strong>. The India–US treaty does not relieve it. It is the
                one item here that a growing portfolio grows into rather than one you meet
                on day one, and it is widely under-discussed.
              </p>
              <Link className="pz-ghost pz-more" href="/articles/us-estate-tax-indian-investors">What the threshold means for you</Link>
            </RevealArticle>

            {/* --- Dividends --- */}
            <RevealArticle className="pz-tax-block" delay={0.18}>
              <h3>Dividends</h3>
              <p className="pz-tax-p">
                US-listed companies withhold {pct(RATES.dividendWithholdingPct)} of any
                dividend at source. Under the India–US treaty you can claim that back as a
                foreign tax credit when filing in India, so it is rarely taxed twice.
              </p>
              <Link className="pz-ghost pz-more" href="/articles/dtaa-india-us-foreign-tax-credit">How the foreign tax credit works</Link>
            </RevealArticle>
          </div>
        </div>
      </section>

      {/* ===== 5. CLOSE ===== */}
      <section className="pz-close" aria-labelledby="pricing-cta-heading">
        <div className="container">
          <Reveal className="pz-close-inner">
            <span className="eyebrow">The account</span>
            <h2 id="pricing-cta-heading" className="pz-h2">Open your account</h2>
            <p className="pz-close-body">
              No account opening fee, no KYC charge, and no minimum balance to maintain.
            </p>
            <div className="pz-actions">
              <a className="pz-cta" href={TRADING_PLATFORM_URL} target="_blank" rel="noopener noreferrer">
                Start investing
              </a>
            </div>
            <div className="pz-close-rule" aria-hidden="true" />
          </Reveal>
        </div>
      </section>
    </div>
  )
}
