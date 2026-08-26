import { Link } from 'react-router-dom'
import SEO, { breadcrumbSchema } from '../../src/components/SEO'
import { TRADING_PLATFORM_URL } from '../../src/constants'
import { RATES, FREE_ITEMS, TRADING_CHARGES, pct } from '../data/pricingRates'
import { formatInr } from '../lib/pricing'
import TradeCostCalculator from '../components/TradeCostCalculator'
import CapitalGainsCompare from '../components/CapitalGainsCompare'

const ArrowIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <path d="M5 12h14M13 5l7 7-7 7" />
  </svg>
)

/** ₹15L remitted against a ₹10L threshold — the worked example from the spec. */
const TCS_EXAMPLE_REMITTANCE = 1_500_000
const TCS_EXAMPLE_TAXABLE = TCS_EXAMPLE_REMITTANCE - RATES.tcsThresholdInr
const TCS_EXAMPLE_AMOUNT = TCS_EXAMPLE_TAXABLE * RATES.tcsPct

export default function Pricing() {
  return (
    <>
      <SEO
        title="Pricing &amp; Charges — US Stocks Account"
        description="Transparent pricing for investing in US Stocks from India via Platizio Global. Calculate your exact trade cost, and see brokerage, regulatory fees, TCS and capital gains tax explained."
        canonical="/pricing"
        jsonLd={breadcrumbSchema([['Home', '/'], ['Pricing', '/pricing']])}
      />

      {/* ===== 1. HERO ===== */}
      <section className="page-hero">
        <div className="container">
          <div className="breadcrumb">
            <Link to="/">Home</Link><span>/</span><span>Pricing</span>
          </div>
          <h1>What investing costs</h1>
          <p>
            No account fee, one brokerage rate, and every regulatory charge passed
            through at cost. Work out your exact cost below.
          </p>
        </div>
      </section>

      {/* ===== 2. WHAT YOU PAY ===== */}
      <section className="section headline-section" aria-labelledby="headline-heading">
        <div className="container">
          <div className="section-header reveal">
            <span className="eyebrow">The short version</span>
            <h2 id="headline-heading">You pay to trade, not to hold an account</h2>
          </div>

          <div className="headline-grid reveal">
            <div className="headline-rate">
              <span className="headline-rate-value">{pct(RATES.brokeragePct)}</span>
              <span className="headline-rate-label">per transaction</span>
              <span className="headline-rate-note">Minimum ${RATES.brokerageMinUsd} per order</span>
            </div>

            <ul className="headline-free">
              {FREE_ITEMS.map(({ label, value }) => (
                <li key={label}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M20 6 9 17l-5-5" />
                  </svg>
                  <span className="headline-free-label">{label}</span>
                  <span className="headline-free-value">{value}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* ===== 3. CALCULATOR ===== */}
      <TradeCostCalculator />

      {/* ===== 4. FULL SCHEDULE ===== */}
      <section className="section schedule-section" aria-labelledby="schedule-heading">
        <div className="container">
          <div className="section-header reveal">
            <span className="eyebrow">The full schedule</span>
            <h2 id="schedule-heading">Every charge, in full</h2>
            <p>
              The published rates behind the calculator. Regulatory fees are collected
              by the exchanges and regulators, and passed through without markup.
            </p>
          </div>

          <div className="pricing-table reveal">
            <div className="pricing-row pricing-head">
              <span>Charge</span>
              <span>Rate</span>
            </div>
            <div className="pricing-body">
              {TRADING_CHARGES.map(({ head, value, note }) => (
                <div className="pricing-row" key={head}>
                  <span className="charge-head">{head}</span>
                  <span className="charge-val">
                    {value}
                    {note && <em className="charge-note">{note}</em>}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <p className="schedule-asof">Rates as of {RATES.ratesAsOf}.</p>
        </div>
      </section>

      {/* ===== 5. TAX ===== */}
      <section className="section tax-section" aria-labelledby="tax-heading">
        <div className="container">
          <div className="section-header reveal">
            <span className="eyebrow">Tax</span>
            <h2 id="tax-heading">What the tax office takes</h2>
            <p>
              Four things apply to Indian residents investing abroad. Two are credits
              you can claim back rather than costs; one only bites above a threshold
              that a growing portfolio eventually crosses.
            </p>
          </div>

          {/* --- TCS: explained, deliberately not calculated. The threshold is
                  cumulative across the year and across every LRS purpose, so a
                  tool taking only "this remittance" would quietly understate it
                  for anyone who had already remitted. --- */}
          <article className="tax-block reveal">
            <h3>TCS when you send money abroad</h3>
            <p>
              TCS applies at {pct(RATES.tcsPct)} on money remitted under the LRS
              <strong> above ₹{formatInr(RATES.tcsThresholdInr)} in a financial year</strong>.
              That threshold counts every LRS purpose together — travel, education,
              gifts and investing — not just what you send to invest.
            </p>
            <div className="tax-example">
              <span className="tax-example-label">Worked example</span>
              <p>
                Remit ₹{formatInr(TCS_EXAMPLE_REMITTANCE)} across a financial year and
                TCS applies to the ₹{formatInr(TCS_EXAMPLE_TAXABLE)} above the threshold:
                <strong> ₹{formatInr(TCS_EXAMPLE_AMOUNT)}</strong>.
              </p>
            </div>
            <p className="tax-emphasis">
              TCS is not a cost. It is a credit against your income tax liability, claimed
              when you file your return.
            </p>
          </article>

          {/* --- Capital gains: the comparator --- */}
          <article className="tax-block reveal">
            <h3>Capital gains when you sell</h3>
            <p>
              How long you hold decides the rate. Sell within{' '}
              {RATES.ltcgThresholdMonths} months and gains are taxed at your income slab;
              hold beyond it and they are taxed at {pct(RATES.ltcgPct)}.
            </p>
            <CapitalGainsCompare />
          </article>

          {/* --- US estate tax ---
                  Added after audit: the page previously said "three things
                  apply" and omitted the only one that scales with account size.
                  Every figure here is already published in the site's own
                  article; nothing new is asserted. Omitting it understated the
                  picture precisely for the largest accounts. --- */}
          <article className="tax-block reveal">
            <h3>US estate tax, above a threshold</h3>
            <p>
              US-situs assets — which includes US shares held by a non-resident — fall
              under US estate tax above a{' '}
              <strong>USD 60,000 exemption</strong>, at rates reaching{' '}
              <strong>40%</strong>. The India–US treaty does not relieve it. It is the
              one item here that a growing portfolio grows into rather than one you meet
              on day one, and it is widely under-discussed.{' '}
              <Link to="/articles/us-estate-tax-indian-investors">
                What the threshold means for you <ArrowIcon />
              </Link>
            </p>
          </article>

          {/* --- Dividends --- */}
          <article className="tax-block reveal">
            <h3>Dividends</h3>
            <p>
              US-listed companies withhold {pct(RATES.dividendWithholdingPct)} of any
              dividend at source. Under the India–US treaty you can claim that back as a
              foreign tax credit when filing in India, so it is rarely taxed twice.{' '}
              <Link to="/articles/dtaa-india-us-foreign-tax-credit">
                How the foreign tax credit works <ArrowIcon />
              </Link>
            </p>
          </article>
        </div>
      </section>

      {/* ===== 6. CTA ===== */}
      <section className="section pricing-cta-section" aria-labelledby="pricing-cta-heading">
        <div className="container">
          <div className="regs-cta reveal">
            <h3 id="pricing-cta-heading">Open your account</h3>
            <p>No account opening fee, no KYC charge, and no minimum balance to maintain.</p>
            <a className="btn btn-gold btn-lg" href={TRADING_PLATFORM_URL} target="_blank" rel="noopener noreferrer">
              Start investing <ArrowIcon />
            </a>
          </div>
        </div>
      </section>
    </>
  )
}
