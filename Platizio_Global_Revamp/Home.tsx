import { Link } from 'react-router-dom'
import { Globe } from '../src/components/Globe'
import { TRADING_PLATFORM_URL } from '../src/constants'
import SEO from '../src/components/SEO'
import TrendingBanner from './components/TrendingBanner'
import PopularStocks from './components/PopularStocks'
import FeesTable from './components/FeesTable'
import Regulations from './components/Regulations'
import { useMarketData } from './hooks/useMarketData'

const ArrowIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <path d="M5 12h14M13 5l7 7-7 7" />
  </svg>
)

const WHY_CARDS = [
  {
    icon: <><circle cx="12" cy="12" r="10" /><path d="M2 12h20" /><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" /></>,
    title: 'Spread the risk',
    body: 'One country, one currency, one economy is a concentrated bet. Adding US exposure spreads it across regions that rarely move together.',
  },
  {
    icon: <><path d="M3 21V9l9-6 9 6v12" /><path d="M9 21V12h6v9" /></>,
    title: 'Own the companies you use',
    body: 'The phone in your hand, the search you ran, the cloud your office runs on — most are listed in the US and not on any Indian exchange.',
  },
  {
    icon: <><path d="M21 12a9 9 0 1 1-9-9" /><path d="M12 3v9l6-3" /></>,
    title: 'Buy a market, not a stock',
    body: 'A single ETF gives you hundreds of companies across an index, a sector or a theme, in one order.',
  },
  {
    icon: <><path d="M12 1v22" /><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" /></>,
    title: 'Hold dollars, not just rupees',
    body: 'Your costs abroad — education, travel, medical — are priced in dollars. Dollar assets balance that.',
  },
]

const HOW_STEPS = [
  {
    step: '01',
    title: 'Open your account',
    body: 'Create your Platizio Global account and complete KYC entirely online. No paperwork, no branch visit.',
    icon: <><path d="M9 12l2 2 4-4" /><circle cx="12" cy="12" r="10" /></>,
  },
  {
    step: '02',
    title: 'Send funds under the LRS',
    body: 'Transfer from your Indian bank through the RBI’s Liberalised Remittance Scheme. Your money stays inside GIFT City’s regulatory framework.',
    icon: <><line x1="12" y1="2" x2="12" y2="22" /><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" /></>,
  },
  {
    step: '03',
    title: 'Place your first order',
    body: 'Browse US stocks and ETFs, buy whole shares or fractions, and track everything in one portfolio.',
    icon: <><path d="M3 17l6-6 4 4 8-8" /><path d="M14 7h7v7" /></>,
  },
]

export default function Home() {
  // null during SSR and on the client's first render, so both produce the same
  // skeleton markup and hydration has nothing to disagree about.
  const { trending, popular, asOf, delayed } = useMarketData()

  return (
    <>
      <SEO
        title="Invest in US Stocks &amp; ETFs from India"
        description="Platizio Global lets Indian investors invest in US Stocks and ETFs under the RBI's Liberalised Remittance Scheme (LRS). IFSCA-regulated. Open your account today."
        canonical="/"
      />

      {/* ===== 2. HERO ===== */}
      <section className="hero">
        <div className="container hero-grid">
          <div className="hero-text">
            <span className="eyebrow on-dark">Fully guided international investing</span>
            <h1>Invest globally with <span>Platizio</span></h1>
            <p>
              Build a portfolio of US stocks and ETFs from India — opened, funded and
              guided end to end, under IFSCA regulation in GIFT City.
            </p>
            <div className="hero-ctas">
              <a className="btn btn-gold btn-lg" href={TRADING_PLATFORM_URL} target="_blank" rel="noopener noreferrer">
                Start investing <ArrowIcon />
              </a>
              <Link className="btn btn-light btn-lg" to="/products">Explore products</Link>
            </div>
            <div className="hero-meta">
              <div><strong>US stocks &amp; ETFs</strong><span>Stocks, indices, sectors &amp; themes</span></div>
              <div><strong>IFSCA regulated</strong><span>GIFT City based</span></div>
              <div><strong>Dedicated guidance</strong><span>From onboarding to execution</span></div>
            </div>
          </div>

          <div className="hero-visual">
            <div className="orbit" aria-hidden="true" />
            <Globe />
            <div className="hero-badge top" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 17l6-6 4 4 8-8" /><path d="M14 7h7v7" />
              </svg>
              US market access
            </div>
            <div className="hero-badge bottom" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" />
              </svg>
              Simple onboarding
            </div>
          </div>
        </div>
      </section>

      {/* ===== 3. TRENDING ===== */}
      <TrendingBanner quotes={trending} asOf={asOf} delayed={delayed} />

      {/* ===== 4. POPULAR ===== */}
      <PopularStocks quotes={popular} asOf={asOf} delayed={delayed} />

      {/* ===== 5. WHY INVEST GLOBALLY =====
          id="why" is load-bearing — the footer links to /#why. */}
      <section className="section why-section" id="why">
        <div className="container">
          <div className="section-header reveal">
            <span className="eyebrow">Why invest globally</span>
            <h2>Your portfolio ends at the border. Your life doesn’t.</h2>
            <p>
              International investing reduces single-market dependence and opens up
              companies and themes with no Indian listing.
            </p>
          </div>

          <div className="why-grid">
            {WHY_CARDS.map(({ icon, title, body }) => (
              <article className="feature-card reveal" key={title}>
                <div className="feature-icon">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                    {icon}
                  </svg>
                </div>
                <h3>{title}</h3>
                <p>{body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* ===== 6. HOW TO INVEST GLOBALLY ===== */}
      <section className="section how-section">
        <div className="container">
          <div className="section-header reveal">
            <span className="eyebrow">How to invest globally</span>
            <h2>Three steps to your first US order</h2>
            <p>From account creation to owning your first share abroad.</p>
          </div>

          <div className="steps-grid">
            {HOW_STEPS.flatMap(({ step, title, body, icon }, i, arr) => {
              const card = (
                <div className="step-card reveal" key={step}>
                  <div className="step-num">{step}</div>
                  <div className="step-icon">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                      {icon}
                    </svg>
                  </div>
                  <h3>{title}</h3>
                  <p>{body}</p>
                </div>
              )
              return i < arr.length - 1
                ? [card, <div className="step-arrow" key={`arrow-${i}`} aria-hidden="true">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                      <path d="M5 12h14M13 5l7 7-7 7" />
                    </svg>
                  </div>]
                : [card]
            })}
          </div>

          {/* Restores Home's only path into the article library. The revamp
              dropped the guides block, taking all three direct article links
              with it — the footer still reaches /media#articles, but nothing
              on Home pointed at the writing itself. Placed here because a
              reader who has just read the three steps is exactly the one who
              wants the detail. */}
          <p className="start-here reveal">
            <span className="start-here-label">Read first</span>
            <Link to="/articles/how-to-invest-in-us-stocks-from-india">
              How to invest in US stocks from India
            </Link>
            <Link to="/articles/lrs-explained">LRS explained</Link>
            <Link to="/articles/tax-on-us-stocks-in-india">Tax on US stocks</Link>
            <Link className="start-here-all" to="/articles">All articles →</Link>
          </p>
        </div>
      </section>

      {/* ===== 7. FEES ===== */}
      <FeesTable />

      {/* ===== 8. REGULATIONS (carries the closing CTA) ===== */}
      <Regulations />
    </>
  )
}
