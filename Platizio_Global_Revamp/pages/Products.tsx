import { Link } from 'react-router-dom'
import { TRADING_PLATFORM_URL, screenerInstrument } from '../../src/constants'
import SEO, { breadcrumbSchema } from '../../src/components/SEO'
import { RATES, pct } from '../data/pricingRates'
import { formatInr } from '../lib/pricing'
import { formatPrice } from '../lib/format'
import { useMarketData } from '../hooks/useMarketData'
import { useGainers } from '../hooks/useGainers'
import TrendingBanner from '../components/TrendingBanner'
import PopularStocks from '../components/PopularStocks'
import QuoteChange from '../components/QuoteChange'
import ArrowIcon from '../components/ArrowIcon'

/**
 * Four capabilities, each shown rather than described.
 *
 * Every crop is a real region of the terminal, taken from the same capture as
 * the hero. An icon would have been cheaper and would have proved nothing —
 * the whole argument of this page is that the instrument exists, so the page
 * shows the instrument.
 */
const CAPABILITIES = [
  {
    n: '01',
    title: 'The session, counted',
    body: 'The index register, and how many of the largest US companies rose against how many fell. Not a headline number — a count, with the basis it was drawn from printed underneath it.',
    src: '/shot-register.webp',
    w: 952, h: 440,
    alt: 'The terminal’s index register: a large price figure, a percentage move, and a breadth bar counting how many constituents rose against how many fell.',
    wide: true,
  },
  {
    n: '02',
    title: 'The events that move a price',
    body: 'Ex-dividend dates, earnings and corporate actions on a calendar, ahead of the day they land — and an honest count of how many companies answered when we asked.',
    src: '/shot-events.webp',
    w: 328, h: 452,
    alt: 'A calendar of upcoming corporate events, each with the company, the event type and how many days away it is.',
  },
  {
    n: '03',
    title: 'News tied to the stock',
    body: 'Headlines filtered to the instrument in front of you, with the source and the age on every line, so selection is informed rather than guessed.',
    src: '/shot-wire.webp',
    w: 328, h: 440,
    alt: 'A newswire panel showing headlines attributed to a source and a ticker, each stamped with how long ago it was published.',
  },
  {
    n: '04',
    title: 'What rose, what fell, what traded',
    body: 'The day’s gainers, losers and most active names, each stamped with how far behind the exchange the quote is running.',
    src: '/shot-boards.webp',
    w: 952, h: 200,
    alt: 'Three boards side by side — top gainers, top losers and most active — each carrying a delayed-quote badge.',
    wide: true,
  },
]

/** The three that are argument rather than screen. */
const CLAIMS = [
  { n: '05', title: 'Analyst recommendations in one place', body: 'The consensus, the spread of ratings and the twelve-month target — without three tabs open.' },
  { n: '06', title: 'How to invest in the US market, explained', body: 'LRS, W-8BEN, TCS, DTAA and Schedule FA, written out end to end by people who do this daily.' },
  { n: '07', title: 'Pricing that buys more than a platform', body: `${pct(RATES.brokeragePct)} per transaction, nothing to open an account, and the whole schedule published before you trade.` },
]

const COSTS = [
  { v: pct(RATES.brokeragePct), l: 'Brokerage, per transaction', n: `Minimum $${RATES.brokerageMinUsd} per order` },
  { v: '$0', l: 'To open an account', n: 'KYC, live prices and charting included' },
  { v: pct(RATES.igstPct), l: 'IGST on brokerage', n: 'Indian residents' },
  { v: pct(RATES.tcsPct), l: 'TCS above the LRS threshold', n: `Over ₹${formatInr(RATES.tcsThresholdInr)} cumulative — credited back at filing, not a cost` },
]

const GUIDES = [
  { to: '/articles/how-to-invest-in-us-stocks-from-india', h: 'How to invest in US stocks from India', p: 'KYC, Form W-8BEN, the LRS remittance, your first trade, and the records you will need.' },
  { to: '/articles/tax-on-us-stocks-in-india', h: 'Tax on US stocks in India', p: `${pct(RATES.ltcgPct)} after ${RATES.ltcgThresholdMonths} months, and why the ₹1.25 lakh exemption does not apply.` },
  { to: '/articles/tcs-on-lrs-explained', h: 'TCS on LRS, explained', p: `Why ${pct(RATES.tcsPct)} is withheld above the threshold, and exactly how you get it back.` },
  { to: '/articles/how-to-invest-in-sp500-from-india', h: 'Three routes to the S&P 500', p: 'Direct US ETF, Indian feeder fund or GIFT City — one index, three tax outcomes.' },
  { to: '/articles/best-us-etfs-for-indian-investors', h: 'How to evaluate US ETFs', p: 'Expense ratio, liquidity and tracking difference, plus the withholding drag no factsheet shows.' },
  { to: '/articles/topic/us-stocks', h: 'Every US stocks guide', p: 'Everything on investing in US-listed shares from India, in one place.' },
]

export default function Products() {
  const { trending, popular, asOf, delayed } = useMarketData()
  const { gainers, basis, counted, asOf: gAsOf, delayed: gDelayed } = useGainers()

  /* The large-cap risers are the intended feed. If that call fails the strip
     falls back to the site's Nasdaq-100 movers and relabels itself, so the
     scope chip never outlives the data it describes. */
  const useG = gainers === null || gainers.length > 0
  const lead = (useG ? gainers : trending)?.[0] ?? null

  return (
    <>
      <SEO
        title="US Stocks &amp; ETFs — Invest from India via LRS"
        description="A market terminal for Indian investors: the session counted, the events that move a price, stock news and analyst views. Invest in US shares and ETFs under the RBI Liberalised Remittance Scheme, with every charge published before you trade."
        canonical="/products"
        jsonLd={breadcrumbSchema([['Home', '/'], ['Products', '/products']])}
      />

      {/* ================================================ 1. HERO ========= */}
      <section className="ds-hero" aria-labelledby="hero-heading">
        <div className="ds-hero-inner">
          <div className="ds-hero-copy">
            <p className="ds-meta">
              <span className="ds-meta-key">Product</span>
              <span className="ds-rule" aria-hidden="true" />
              <span>US Stocks &amp; ETFs · LRS</span>
            </p>

            <h1 id="hero-heading" className="ds-h1">
              A market terminal,<br />
              <em>built for Indian investors.</em>
            </h1>

            <p className="ds-lede">
              The session counted, the events that move a price, news tied to the stock and
              the analyst view — on one screen, for every name we cover. Every charge is
              published before you trade.
            </p>

            <div className="ds-actions">
              <a className="btn btn-gold btn-lg" href={TRADING_PLATFORM_URL}
                 target="_blank" rel="noopener noreferrer">
                Open an account <ArrowIcon />
              </a>
              <a className="ds-link" href={screenerInstrument('AAPL')}
                 target="_blank" rel="noopener noreferrer">
                See the terminal <span className="ds-link-rule" aria-hidden="true" />
              </a>
            </div>

            {/* One live figure, in the hero, doing the work a stock photo
                cannot: proving the thing above it is running right now. */}
            <dl className="ds-live">
              <dt className="ds-meta-key">Leading gainer</dt>
              {lead ? (
                <dd>
                  <span className="ds-live-sym">{lead.symbol}</span>
                  <span className="ds-live-px">${formatPrice(lead.price)}</span>
                  <QuoteChange changePercent={lead.changePercent} />
                </dd>
              ) : (
                <dd>
                  <span className="ds-live-sym is-loading-text is-load-sym">&nbsp;</span>
                  <span className="ds-live-px is-loading-text is-load-price">&nbsp;</span>
                </dd>
              )}
            </dl>
          </div>

          {/* The shot bleeds off the right edge rather than sitting centred in
              a card: the instrument continues past the page, which is the
              point being made about it. */}
          <figure className="ds-shot">
            <picture>
              <source srcSet="/terminal-hero.webp" type="image/webp" />
              <img src="/terminal-hero.png" width={1600} height={1000} loading="eager" decoding="async"
                   alt="The Platizio terminal: an instrument watchlist, the day's index register with a breadth count, the biggest gains and falls, a calendar of key events and a stock newswire." />
            </picture>
            <figcaption>Delayed prices, captured — not live.</figcaption>
          </figure>
        </div>
      </section>

      {/* ================================================ 2. TICKER ======= */}
      <TrendingBanner
        quotes={useG ? gainers : trending}
        asOf={useG ? gAsOf : asOf}
        delayed={useG ? gDelayed : delayed}
        label={useG ? 'Top gainers' : 'Top movers'}
        scope={useG ? (basis ?? 'Largest US companies by market value') : 'Nasdaq-100'}
      />

      {/* ================================================ 3. CAPABILITIES = */}
      <section className="ds-section" aria-labelledby="cap-heading">
        <div className="ds-wrap">
          <header className="ds-head">
            <p className="ds-meta"><span className="ds-meta-key">What it shows you</span></p>
            <h2 id="cap-heading" className="ds-h2">
              Seven things on screen before you decide anything.
            </h2>
            <p className="ds-head-note">
              Four of them are below, as they actually render
              {counted ? ` across the ${counted} companies we quote` : ''}. Nothing here is a
              mock-up.
            </p>
          </header>

          <ol className="ds-caps">
            {CAPABILITIES.map((c) => (
              <li className={`ds-cap${c.wide ? ' is-wide' : ''}`} key={c.n}>
                <div className="ds-cap-copy">
                  <span className="ds-n">{c.n}</span>
                  <h3 className="ds-cap-title">{c.title}</h3>
                  <p className="ds-cap-body">{c.body}</p>
                </div>
                <img className="ds-cap-shot" src={c.src} width={c.w} height={c.h}
                     loading="lazy" decoding="async" alt={c.alt} />
              </li>
            ))}
          </ol>

          <ol className="ds-claims">
            {CLAIMS.map((c) => (
              <li className="ds-claim" key={c.n}>
                <span className="ds-n">{c.n}</span>
                <h3 className="ds-claim-title">{c.title}</h3>
                <p className="ds-claim-body">{c.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ================================================ 4. POPULAR ======
          The shared component, reused verbatim so Home and this page never
          disagree about the eight names. It heads itself centred, which is
          right on Home and wrong in a left-ruled datasheet — the wrapper
          re-aligns it here and nowhere else. */}
      <div className="ds-popular">
        <PopularStocks quotes={popular} asOf={asOf} delayed={delayed} />
      </div>

      {/* ================================================ 5. COSTS ======== */}
      <section className="ds-section ds-costs-section" aria-labelledby="costs-heading">
        <div className="ds-wrap">
          <div className="ds-split">
            <header className="ds-head ds-head--sticky">
              <p className="ds-meta"><span className="ds-meta-key">What it costs</span></p>
              <h2 id="costs-heading" className="ds-h2">Published before you trade.</h2>
              <p className="ds-head-note">
                The whole schedule, in one place. Rates as of {RATES.ratesAsOf}.
              </p>
              <Link className="ds-link" to="/pricing">
                The full schedule <span className="ds-link-rule" aria-hidden="true" />
              </Link>
            </header>

            <dl className="ds-costs">
              {COSTS.map((c) => (
                <div className="ds-cost" key={c.l}>
                  <dt>
                    <span className="ds-cost-v">{c.v}</span>
                    <span className="ds-cost-l">{c.l}</span>
                  </dt>
                  <dd>{c.n}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      </section>

      {/* ================================================ 6. READING ====== */}
      <section className="ds-section" aria-labelledby="reading-heading">
        <div className="ds-wrap">
          <header className="ds-head">
            <p className="ds-meta"><span className="ds-meta-key">Before you invest</span></p>
            <h2 id="reading-heading" className="ds-h2">
              Read one of these first.
            </h2>
            <p className="ds-head-note">
              They are free, and none of them is trying to sell you anything.
            </p>
          </header>

          <ul className="ds-guides">
            {GUIDES.map((g) => (
              <li key={g.to}>
                <Link className="ds-guide" to={g.to}>
                  <h3>{g.h}</h3>
                  <p>{g.p}</p>
                  <span className="ds-guide-go" aria-hidden="true"><ArrowIcon /></span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ================================================ 7. CLOSE ======== */}
      <section className="ds-close">
        <div className="ds-wrap">
          <div className="ds-close-inner">
            <h2 className="ds-h2">Open an account in an afternoon.</h2>
            <p className="ds-head-note">
              Account opening and KYC are free. The charge schedule is published in full.
            </p>
            <div className="ds-actions">
              <a className="btn btn-gold btn-lg" href={TRADING_PLATFORM_URL}
                 target="_blank" rel="noopener noreferrer">
                Start investing <ArrowIcon />
              </a>
              <a className="ds-link" href={screenerInstrument('AAPL')}
                 target="_blank" rel="noopener noreferrer">
                See the terminal <span className="ds-link-rule" aria-hidden="true" />
              </a>
            </div>
          </div>
        </div>
      </section>
    </>
  )
}
