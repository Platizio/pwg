import { Link } from 'react-router-dom'
import SEO, { breadcrumbSchema } from '../../src/components/SEO'
import { TRADING_PLATFORM_URL } from '../../src/constants'
import TeamGrid from '../components/TeamGrid'

const ArrowIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <path d="M5 12h14M13 5l7 7-7 7" />
  </svg>
)

const CheckIcon = () => (
  <svg className="cred-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
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

export default function About() {
  return (
    <>
      <SEO
        title="About Us — IFSCA-Regulated Global Investing Platform"
        description="Who is behind Platizio Global, and how your US investments are held. An IFSCA-regulated platform helping Indian investors access US Stocks and ETFs through the RBI's Liberalised Remittance Scheme (LRS)."
        canonical="/about"
        jsonLd={breadcrumbSchema([['Home', '/'], ['About Us', '/about']])}
      />

      {/* ===== 1. HERO ===== */}
      <section className="page-hero">
        <div className="container">
          <div className="breadcrumb">
            <Link to="/">Home</Link><span>/</span><span>About Us</span>
          </div>
          <h1>The people behind your portfolio</h1>
          <p>
            Who we are, who handles your money, and exactly how your shares are held.
          </p>
        </div>
      </section>

      {/* ===== 2. WHY WE EXIST ===== */}
      <section className="section why-exist-section" aria-labelledby="why-exist-heading">
        <div className="container">
          <div className="section-header reveal">
            <span className="eyebrow">Why we exist</span>
            <h2 id="why-exist-heading">Access was never the hard part</h2>
          </div>

          <div className="why-exist-body reveal">
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
            <p className="why-exist-lineage">
              Platizio Global is backed by <strong>Platizio Services LLP</strong>, a
              licensed distributor of mutual funds and Specialised Investment Funds in
              India — an established regulated business, not a new venture learning as
              it goes.
            </p>
          </div>
        </div>
      </section>

      {/* ===== 3. FOUNDER ===== */}
      <section className="section founder-section" aria-labelledby="founder-heading">
        <div className="container">
          <div className="section-header reveal">
            <span className="eyebrow">Leadership</span>
            <h2 id="founder-heading">Who runs it</h2>
          </div>

          <div className="founder reveal">
            <div className="founder-photo-wrap">
              <picture>
                <source srcSet="/sir.webp" type="image/webp" />
                <img
                  className="founder-photo"
                  src="/sir.png"
                  alt="Vividh Chaturvedi, Founder and CEO of Platizio Global"
                  width={640}
                  height={640}
                />
              </picture>
            </div>

            <div className="founder-info">
              <h3>Vividh Chaturvedi</h3>
              <p className="founder-title">Founder &amp; CEO, Platizio Global</p>
              <p className="founder-credential">MBA · Certified Financial Planner (CFP&reg;)</p>
              <ul className="founder-creds">
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
          </div>
        </div>
      </section>

      {/* ===== 4. TEAM ===== */}
      <section className="section team-section" aria-labelledby="team-heading">
        <div className="container">
          <div className="section-header reveal">
            <span className="eyebrow">The team</span>
            <h2 id="team-heading">Eight people, named</h2>
            <p>
              Research, engineering and operations. If you speak to someone at Platizio
              Global, it is one of them.
            </p>
          </div>

          <TeamGrid />
        </div>
      </section>

      {/* ===== 5. HOW WE'RE STRUCTURED ===== */}
      <section className="section structure-section" aria-labelledby="structure-heading">
        <div className="container">
          <div className="section-header reveal">
            <span className="eyebrow">How it is structured</span>
            <h2 id="structure-heading">Where your money actually sits</h2>
            <p>
              Investments are routed through the GIFT City framework under IFSCA
              oversight. Here is what that means in practice.
            </p>
          </div>

          <dl className="structure-list">
            {STRUCTURE.map(({ q, a }) => (
              <div className="structure-item reveal" key={q}>
                <dt>{q}</dt>
                <dd>{a}</dd>
              </div>
            ))}
          </dl>

          <p className="structure-note">
            Full terms are set out in our{' '}
            <Link to="/disclaimer">risk disclosure and disclaimer</Link>, and the
            practical questions are answered in the <Link to="/faqs">FAQs</Link>.
          </p>
        </div>
      </section>

      {/* ===== 6. CTA ===== */}
      <section className="section about-cta-section" aria-labelledby="about-cta-heading">
        <div className="container">
          <div className="regs-cta reveal">
            <h3 id="about-cta-heading">Open your account</h3>
            <p>Complete KYC online, fund through your bank, and place your first US order.</p>
            <a className="btn btn-gold btn-lg" href={TRADING_PLATFORM_URL} target="_blank" rel="noopener noreferrer">
              Start investing <ArrowIcon />
            </a>
          </div>
        </div>
      </section>
    </>
  )
}
