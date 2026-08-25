import { Link } from 'react-router-dom'
import { TRADING_PLATFORM_URL, screenerInstrument } from '../../src/constants'
import SEO, { breadcrumbSchema } from '../../src/components/SEO'
import { RATES, pct } from '../data/pricingRates'
import { formatInr } from '../lib/pricing'
import { useMarketData } from '../hooks/useMarketData'
import { useGainers } from '../hooks/useGainers'
import TrendingBanner from '../components/TrendingBanner'
import PopularStocks from '../components/PopularStocks'
import ArrowIcon from '../components/ArrowIcon'

/* Icons are drawn on one 24-grid at a single stroke weight, so a row of them
   reads as one set rather than as seven borrowed marks. */
const ICONS = {
  insight: <><path d="M3 17l6-6 4 4 8-8" /><path d="M14 7h7v7" /></>,
  events: <><rect x="3" y="4.5" width="18" height="16" rx="2" /><path d="M3 9.5h18M8 2.5v4M16 2.5v4" /></>,
  news: <><path d="M4 5h11v14H4z" /><path d="M15 9h5v8a2 2 0 0 1-4 0V9" /><path d="M7 9h5M7 13h5" /></>,
  analyst: <><circle cx="12" cy="8" r="3.5" /><path d="M4.5 20a7.5 7.5 0 0 1 15 0" /></>,
  terminal: <><rect x="2.5" y="4" width="19" height="16" rx="2" /><path d="M6.5 9.5 9 12l-2.5 2.5M12 15h5" /></>,
  guide: <><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" /></>,
  price: <><path d="M12 1v22" /><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" /></>,
}

/**
 * What the terminal does, in the reader's terms.
 *
 * Descriptive only. Nothing here claims a return, a ranking or an outcome —
 * a regulated intermediary's product page cannot promise that a tool leads to
 * a better decision, only say what the tool shows you.
 */
const FEATURES = [
  { icon: ICONS.insight, title: 'Up-to-date insights on every stock we cover', body: 'Ratios, ownership and the day’s move, read off the tape rather than assembled from memory.' },
  { icon: ICONS.events, title: 'The key events that actually move a price', body: 'Earnings dates, ex-dividend dates and corporate actions, on a calendar rather than buried in a filing.' },
  { icon: ICONS.news, title: 'News tied to the stock, not the market', body: 'Headlines filtered to the instrument you are looking at, so selection is informed rather than guessed.' },
  { icon: ICONS.analyst, title: 'Analyst recommendations in one place', body: 'The consensus, the spread of ratings and the twelve-month target, without three tabs open.' },
  { icon: ICONS.terminal, title: 'A terminal that helps you decide', body: 'Everything about one instrument on one page, so the question is what to do rather than where to look.' },
  { icon: ICONS.guide, title: 'How to invest in the US market, explained', body: 'LRS, W-8BEN, TCS, DTAA and Schedule FA, written out end to end by people who do this daily.' },
  { icon: ICONS.price, title: 'Pricing that buys more than a platform', body: `${pct(RATES.brokeragePct)} per transaction, nothing to open an account, and the whole schedule published before you trade.` },
]

const COSTS = [
  { v: pct(RATES.brokeragePct), l: 'Brokerage per transaction', n: `Minimum $${RATES.brokerageMinUsd} per order` },
  { v: '$0', l: 'Account opening and KYC', n: 'Live prices and charting included' },
  { v: pct(RATES.igstPct), l: 'IGST on brokerage', n: 'Indian residents' },
  { v: pct(RATES.tcsPct), l: 'TCS above the LRS threshold', n: `Over ₹${formatInr(RATES.tcsThresholdInr)} cumulative, credited back at filing` },
]

const GUIDES = [
  { to: '/articles/how-to-invest-in-us-stocks-from-india', h: 'How to invest in US stocks from India', p: 'The full process: KYC, Form W-8BEN, LRS remittance, first trade and the records you will need.', cta: 'Read the guide' },
  { to: '/articles/tax-on-us-stocks-in-india', h: 'Tax on US stocks in India', p: `${pct(RATES.ltcgPct)} after ${RATES.ltcgThresholdMonths} months, why the ₹1.25 lakh exemption does not apply, and what your ITR needs.`, cta: 'Read the guide' },
  { to: '/articles/tcs-on-lrs-explained', h: 'TCS on LRS, explained', p: `Why ${pct(RATES.tcsPct)} is withheld above the annual threshold, and exactly how you get it back when you file.`, cta: 'Read the guide' },
  { to: '/articles/how-to-invest-in-sp500-from-india', h: 'Three routes to the S&P 500', p: 'Direct US ETF, Indian feeder fund or GIFT City — the same index, quite different tax outcomes.', cta: 'Compare the routes' },
  { to: '/articles/best-us-etfs-for-indian-investors', h: 'How to evaluate US ETFs', p: 'Expense ratio, liquidity and tracking difference — plus the dividend withholding drag no factsheet shows.', cta: 'Read the guide' },
  { to: '/articles/topic/us-stocks', h: 'All US Stocks guides', p: 'Everything on investing in US-listed shares from India, in one place.', cta: 'Browse the topic' },
]

export default function Products() {
  const { trending, popular, asOf, delayed } = useMarketData()
  const { gainers, basis, counted, asOf: gainersAsOf, delayed: gainersDelayed } = useGainers()

  /* The large-cap risers are the intended feed. If that call fails the strip
     falls back to the site's own Nasdaq-100 movers and relabels itself, so the
     scope chip never outlives the data it describes. */
  const usingGainers = gainers === null || gainers.length > 0
  const tickerQuotes = usingGainers ? gainers : trending
  const tickerLabel = usingGainers ? 'Top gainers' : 'Top movers'
  const tickerScope = usingGainers ? (basis ?? 'Largest US companies by market value') : 'Nasdaq-100'

  return (
    <>
      <SEO
        title="US Stocks &amp; ETFs — Invest from India via LRS"
        description="Invest in US-listed shares and ETFs from India under the RBI Liberalised Remittance Scheme. A terminal with insights, key events, stock news and analyst views, and every charge published before you trade."
        canonical="/products"
        jsonLd={breadcrumbSchema([['Home', '/'], ['Products', '/products']])}
      />

      {/* ===================================== 1. HERO ==================== */}
      <section className="section products-hero" aria-labelledby="hero-heading">
        <div className="container products-hero-grid">
          <div className="products-hero-copy">
            <span className="eyebrow">US Stocks &amp; ETFs · LRS</span>
            <h1 id="hero-heading">A terminal for US markets, built for Indian investors.</h1>
            <p className="products-hero-lede">
              Insights, the events that move a price, stock-specific news and analyst views —
              on one screen, for every name we cover. Every charge is published before you
              trade, and the all-in cost sits next to the price.
            </p>
            <div className="products-hero-actions">
              <a className="btn btn-gold btn-lg" href={TRADING_PLATFORM_URL}
                 target="_blank" rel="noopener noreferrer">
                Open an account <ArrowIcon />
              </a>
              <a className="btn btn-ghost btn-lg" href={screenerInstrument('AAPL')}
                 target="_blank" rel="noopener noreferrer">
                See the terminal <ArrowIcon />
              </a>
            </div>
          </div>

          {/* A product shot of the terminal, not a live embed — the figures in
              it were true when it was captured and are not presented as now. */}
          <figure className="products-hero-shot">
            <picture>
              <source srcSet="/terminal-hero.webp" type="image/webp" />
              <img src="/terminal-hero.png" alt="The Platizio terminal: an instrument watchlist, the day's index register with a breadth bar, the biggest gains and falls, a calendar of key events and a stock newswire."
                   width={1600} height={1000} loading="eager" decoding="async" />
            </picture>
            <figcaption>The terminal. Prices shown are delayed and were captured, not live.</figcaption>
          </figure>
        </div>
      </section>

      {/* ===================================== 2. THE TICKER ============== */}
      <TrendingBanner
        quotes={tickerQuotes}
        asOf={usingGainers ? gainersAsOf : asOf}
        delayed={usingGainers ? gainersDelayed : delayed}
        label={tickerLabel}
        scope={tickerScope}
      />

      {/* ===================================== 3. POPULAR ================= */}
      <PopularStocks quotes={popular} asOf={asOf} delayed={delayed} />

      {/* ===================================== 4. FEATURES ================ */}
      <section className="section features-section" aria-labelledby="features-heading">
        <div className="container">
          <div className="section-header reveal">
            <span className="eyebrow">What you get</span>
            <h2 id="features-heading">Everything about one stock, on one screen</h2>
            <p>
              The terminal is the product. These are the seven things it puts in front of you
              before you decide anything.
            </p>
          </div>
          <div className="feature-row">
            {FEATURES.map(({ icon, title, body }) => (
              <article className="feature-card reveal" key={title}>
                <span className="feature-icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6}
                       strokeLinecap="round" strokeLinejoin="round">{icon}</svg>
                </span>
                <h3>{title}</h3>
                <p>{body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* ===================================== 5. WHAT IT COSTS =========== */}
      <section className="section costs-section" aria-labelledby="costs-heading">
        <div className="container">
          <div className="section-header reveal">
            <span className="eyebrow">What it costs</span>
            <h2 id="costs-heading">What it costs, before you trade</h2>
            <p>
              The whole schedule is published. TCS above the annual threshold is not a cost —
              it is credited against your tax when you file.
            </p>
          </div>
          <div className="cost-grid reveal">
            {COSTS.map((c) => (
              <article className="cost-card" key={c.l}>
                <span className="cost-v">{c.v}</span>
                <h3>{c.l}</h3>
                <p>{c.n}</p>
              </article>
            ))}
          </div>
          <p className="cost-note">
            Rates as of {RATES.ratesAsOf}. SEC and FINRA fees apply on sale only.{' '}
            <Link to="/pricing">The full charge schedule</Link>
          </p>
        </div>
      </section>

      {/* ===================================== 6. BEFORE YOU INVEST ======= */}
      <section className="section reading-section" aria-labelledby="reading-heading">
        <div className="container">
          <div className="section-header reveal">
            <span className="eyebrow">Before you invest</span>
            <h2 id="reading-heading">Understand the product, the process and the tax</h2>
            <p>
              Everything on this page assumes you have read one of these. They are free, and
              none of them is trying to sell you anything.
            </p>
          </div>
          <div className="topic-grid reveal">
            {GUIDES.map(({ to, h, p, cta }) => (
              <Link className="topic-card" to={to} key={to}>
                <h3>{h}</h3>
                <p>{p}</p>
                <span className="topic-count">{cta} <ArrowIcon /></span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* ===================================== 7. CLOSE =================== */}
      <section className="section products-cta-section">
        <div className="container">
          <div className="regs-cta reveal">
            <h3>Start investing in US stocks and ETFs</h3>
            <p>Account opening and KYC are free. The charge schedule is published in full.</p>
            <a className="btn btn-gold btn-lg" href={TRADING_PLATFORM_URL}
               target="_blank" rel="noopener noreferrer">
              Start investing <ArrowIcon />
            </a>
          </div>
        </div>
      </section>
    </>
  )
}
