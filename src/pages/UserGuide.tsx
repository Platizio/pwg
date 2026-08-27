import { Link } from 'react-router-dom'
import { TRADING_PLATFORM_URL } from '../constants'
import { useAppContext } from '../context/AppContext'
import SEO, { breadcrumbSchema } from '../components/SEO'
import { FREE_ITEMS } from '../../Platizio_Global_Revamp/data/pricingRates'

const ArrowIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <path d="M5 12h14M13 5l7 7-7 7" />
  </svg>
)

const ExternalIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <path d="M7 17 17 7M9 7h8v8" />
  </svg>
)

const DocIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <polyline points="14 2 14 8 20 8" />
    <line x1="16" y1="13" x2="8" y2="13" />
    <line x1="16" y1="17" x2="8" y2="17" />
  </svg>
)

/*
 * The three facts a first-time visitor actually arrives with, every one of them
 * already published in this repo and none of them previously on this page:
 *
 *   cost      Platizio_Global_Revamp/data/pricingRates.ts — FREE_ITEMS
 *   timing    src/pages/FAQs.tsx, question gs-6
 *   documents src/pages/FAQs.tsx, question gs-4
 *
 * The cost line reads from FREE_ITEMS rather than restating it, so it cannot
 * drift from the Pricing page the way a hand-typed figure would.
 */
const openingCost = FREE_ITEMS.filter((i) =>
  i.label === 'Account opening' || i.label === 'KYC and profile verification',
)

/** Account opening, from FAQs.tsx question gs-5. */
const OPEN_STEPS = [
  {
    title: 'Sign up',
    body: 'Create your account on the Platizio platform with your email address or mobile number.',
  },
  {
    title: 'Enter your details',
    body: 'Your personal details and your tax residency information.',
  },
  {
    title: 'Answer the regulatory questions',
    body: 'A short set of regulatory and risk-profile questions.',
  },
  {
    title: 'Upload your KYC documents',
    body: 'PAN, proof of identity, proof of address, and your bank and financial details.',
  },
  {
    title: 'Sign and submit',
    body: 'Submit the application with your digital signature — your full name. The account is opened in your name with ViewTrade IFSC at GIFT City once KYC is approved.',
  },
]

/** Funding, from FAQs.tsx questions fd-1 and fd-2. */
const FUND_STEPS = [
  {
    title: 'Choose your bank in the platform',
    body: 'Most major Indian banks that support online LRS transfers. You can use your existing account — there is no new one to open.',
  },
  {
    title: 'Download the remittance instructions',
    body: 'The platform generates the net-banking instructions for the bank you selected.',
  },
  {
    title: 'Initiate the transfer',
    body: 'Your bank converts the rupees to dollars and remits them under the Liberalised Remittance Scheme.',
  },
  {
    title: 'Funds are credited',
    body: 'Same day if you initiate before 1:30 PM with an integrated partner bank; the next working day after that.',
  },
]

const DOCS = [
  {
    title: 'Account registration — resident Indians',
    meta: 'PDF · opens in Google Drive, new tab',
    href: 'https://drive.google.com/file/d/19NpAvDwdVMEU5xRPD5xDAR_iBIEFyUJH/view?usp=sharing',
  },
  {
    title: 'Funding instructions',
    meta: 'PDF · updated 10 June 2026 · opens in Google Drive, new tab',
    href: 'https://drive.google.com/file/d/1IzR3xHFgLOonXZ6xpzotMTagOdcbjL-7/view?usp=sharing',
  },
]

function DocRow({ title, meta, href }: { title: string; meta: string; href: string }) {
  return (
    <div className="guide-doc">
      <span className="guide-doc-icon" aria-hidden="true"><DocIcon /></span>
      <span className="guide-doc-body">
        <a href={href} target="_blank" rel="noopener noreferrer">
          <strong>{title}</strong>
        </a>
        <span className="guide-doc-meta">{meta}</span>
      </span>
      <span className="guide-doc-go" aria-hidden="true"><ExternalIcon /></span>
    </div>
  )
}

/**
 * /user-guide — Support.
 *
 * The page used to be an intro line and two links to Google Drive: 45 words,
 * on the surface whose job is the site's only conversion. The header calls this
 * destination "Step-by-step guide to start investing" and an article closes by
 * sending readers here for "the step-by-step User Guide" — and the page showed
 * no steps at all, because the steps lived only inside the two PDFs.
 *
 * Every step and every figure below is already published elsewhere in this
 * repo; nothing here is new content. The PDFs are still linked, demoted from
 * being the page to being the full detail at the foot of the track each belongs
 * to.
 */
export default function UserGuide() {
  const { openContact } = useAppContext()

  return (
    <>
      <SEO
        title="User Guide — How to Start Investing in US Stocks & ETFs"
        description="Open and fund a Platizio Global account step by step — what KYC needs, how long approval takes, and how an LRS remittance reaches your US brokerage account."
        canonical="/user-guide"
        jsonLd={breadcrumbSchema([['Home', '/'], ['User Guide', '/user-guide']])}
      />

      <section className="page-hero">
        <div className="container">
          <div className="breadcrumb">
            <Link to="/">Home</Link><span className="crumb-sep" aria-hidden="true">/</span>
            <span>Help</span><span className="crumb-sep" aria-hidden="true">/</span>
            <span>User Guide</span>
          </div>
          <h1>Opening and funding your account</h1>
          <p>
            Two tracks, nine steps. What each one needs, what it costs, and how long
            it takes before you can place a first order.
          </p>
        </div>
      </section>

      <section className="section" aria-labelledby="guide-heading">
        <div className="container">
          <h2 id="guide-heading" className="visually-hidden">How to open and fund an account</h2>

          <div className="guide-layout">
            <dl className="guide-facts">
              <div className="guide-fact">
                <dt>What it costs</dt>
                <dd>
                  {openingCost.map((i) => `${i.label} ${i.value}`).join(' · ')}. You pay
                  to trade, not to hold an account.
                </dd>
              </div>
              <div className="guide-fact">
                <dt>How long it takes</dt>
                <dd>
                  Instant for resident Indians with no blockers. Up to 48 hours for NRI
                  and foreign nationals.
                </dd>
              </div>
              <div className="guide-fact">
                <dt>What to have ready</dt>
                <dd>
                  PAN, proof of identity, proof of address, and your bank and financial
                  details.
                </dd>
              </div>
            </dl>

            <section className="guide-track" aria-labelledby="guide-open">
              <p className="eyebrow">Track one</p>
              <h2 id="guide-open">Open the account</h2>
              <p>
                Onboarding is digital end to end. The account is opened in your name with
                ViewTrade IFSC at GIFT City, introduced and managed by Platizio.
              </p>
              <ol className="guide-steps">
                {OPEN_STEPS.map(({ title, body }) => (
                  <li key={title}>
                    <div>
                      <h3>{title}</h3>
                      <p>{body}</p>
                    </div>
                  </li>
                ))}
              </ol>
              <DocRow {...DOCS[0]} />
            </section>

            <section className="guide-track" aria-labelledby="guide-fund">
              <p className="eyebrow">Track two</p>
              <h2 id="guide-fund">Fund it under the LRS</h2>
              <p>
                Money reaches a US brokerage account by remittance from your Indian bank
                under the Reserve Bank&apos;s Liberalised Remittance Scheme — up to USD
                250,000 per individual per financial year, across all permitted purposes
                combined.
              </p>
              <ol className="guide-steps">
                {FUND_STEPS.map(({ title, body }) => (
                  <li key={title}>
                    <div>
                      <h3>{title}</h3>
                      <p>{body}</p>
                    </div>
                  </li>
                ))}
              </ol>
              <DocRow {...DOCS[1]} />

              <p className="faq-note">
                An LRS investment remittance has to come from your own bank account under
                the prescribed purpose code. UPI, forex cards and money-transfer services
                such as Wise or Western Union cannot be used.{' '}
                <Link to="/faqs#funding">More on funding</Link>.
              </p>
            </section>
          </div>

          <div className="regs-cta guide-cta">
            <h3>Ready to begin?</h3>
            <p>Create your account, or ask us anything first — we answer within 24 hours on business days.</p>
            <div className="guide-cta-actions">
              <a className="btn btn-gold btn-lg" href={TRADING_PLATFORM_URL} target="_blank" rel="noopener noreferrer">
                Start investing <ArrowIcon />
              </a>
              <button className="btn btn-light btn-lg" onClick={() => openContact()}>
                Contact us
              </button>
            </div>
          </div>
        </div>
      </section>
    </>
  )
}
