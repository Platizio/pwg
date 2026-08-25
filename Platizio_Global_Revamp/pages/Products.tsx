import { useState } from 'react'
import { Link } from 'react-router-dom'
import { TRADING_PLATFORM_URL } from '../../src/constants'
import SEO, { breadcrumbSchema } from '../../src/components/SEO'
import { TERMINAL_UNIVERSE, terminalPath, findInstrument } from '../data/terminalUniverse'
import { useTerminalData } from '../hooks/useTerminalData'
import { formatPrice, formatChange, formatAsOf } from '../lib/format'
import { RATES, pct } from '../data/pricingRates'
import MarketNote from '../components/MarketNote'
import MeridianFonts from '../components/terminal/MeridianFonts'
import TickerTape from '../components/terminal/TickerTape'
import { ArrowRight, ArrowUpRight } from '../components/terminal/Icons'
import { Card, DeltaPill, Badge, Plate } from '../components/dashboard/Surface'
import BreadthBar from '../components/dashboard/BreadthBar'
import InstrumentRow from '../components/dashboard/InstrumentRow'

/**
 * The tracked funds, and what each one stands in for.
 *
 * We quote no index levels — our provider has no index endpoint — so the
 * figure on screen is the tracking fund's own price. That is stated on the
 * page rather than left to be assumed, which is the whole reason this
 * selector names the fund under the index.
 */
const TRACKS = [
  { id: 'SPY', index: 'S&P 500', blurb: 'the 500 largest US companies' },
  { id: 'QQQ', index: 'Nasdaq 100', blurb: 'the largest hundred non-financial Nasdaq listings' },
  { id: 'VOO', index: 'S&P 500 · Vanguard', blurb: 'the same index under a different sponsor' },
] as const

const ROOMS = [
  { kicker: 'Markets', meta: '13 instruments', title: 'Markets', to: '/terminal/aapl',
    body: 'Eight US-listed shares and five index funds, each with its own page: today’s move against the index, the all-in cost, and the tax that applies.' },
  { kicker: 'Research', meta: '30 guides', title: 'Research', to: '/articles',
    body: 'Written guides on LRS, W-8BEN, TCS, DTAA and Schedule FA — none of it trying to sell you anything.' },
  { kicker: 'The desk', meta: 'IST hours', title: 'The desk', to: '/about',
    body: 'Onboarding, remittance questions and settlement, answered by people in Noida rather than a form promising 48 hours.' },
]

const NOTES = [
  { tag: 'Getting started', slug: 'how-to-invest-in-us-stocks-from-india', title: 'How to invest in US stocks from India: a step-by-step guide' },
  { tag: 'Taxation', slug: 'tax-on-us-stocks-in-india', title: 'Tax on US stocks in India: capital gains, dividends and reporting' },
  { tag: 'Compliance', slug: 'tcs-on-lrs-explained', title: 'TCS on LRS remittances: 20% above ₹10 lakh, and how to get it back' },
]

export default function Products() {
  const { quotes, indexQuotes, asOf, delayed, ready } = useTerminalData()
  const [track, setTrack] = useState<string>('SPY')

  const tracked = TRACKS.find((t) => t.id === track) ?? TRACKS[0]
  const trackQuote = quotes.get(tracked.id)
  const trackInstrument = findInstrument(tracked.id)

  const ranked = [...indexQuotes].sort((a, b) => b.changePercent - a.changePercent)
  const gains = ranked.slice(0, 3)
  const falls = ranked.slice(-3).reverse()
  const gainers = ranked.filter((q) => q.changePercent > 0).slice(0, 5)
  const losers = ranked.filter((q) => q.changePercent < 0).slice(-5).reverse()

  return (
    <>
      <SEO
        title="US Stocks &amp; ETFs — Invest from India via LRS"
        description="Delayed prices across the Nasdaq-100, thirteen US stocks and index funds with their own pages, and the all-in cost of buying one from India under the RBI Liberalised Remittance Scheme."
        canonical="/products"
        jsonLd={breadcrumbSchema([['Home', '/'], ['Products', '/products']])}
      />
      <MeridianFonts />

      <div className="meridian mh">
        <TickerTape quotes={quotes} />

        <div className="mh-page">
          {/* ===================================== 1. THE SESSION ======== */}
          <Card lit as="section" className="mh-session" aria-labelledby="session-heading">
            <h1 id="session-heading" className="m-sr">
              US stocks and index funds, priced today
            </h1>

            <div className="pill-group mh-tracks">
              {TRACKS.map((t) => (
                <button key={t.id} type="button" className="pill"
                        aria-pressed={t.id === track} onClick={() => setTrack(t.id)}>
                  {t.index}
                </button>
              ))}
            </div>

            <div className="mh-figure">
              {trackQuote ? (
                <>
                  <span className="mh-figure-v gilt">{formatPrice(trackQuote.price)}</span>
                  <span className="mh-figure-meta">
                    <DeltaPill value={trackQuote.changePercent} />
                    <span className="mh-figure-abs">{formatChange(trackQuote.change)} today</span>
                  </span>
                </>
              ) : ready ? (
                <span className="mh-figure-v is-absent">Unavailable</span>
              ) : (
                <span className="mh-figure-v is-loading-text is-load-price">000.00</span>
              )}
              <span className="mh-figure-sym">{tracked.id}</span>
            </div>

            <p className="mh-session-note">
              Tracked through {tracked.id}, the {tracked.index} ETF. The figure above is{' '}
              {tracked.id}’s price, not the index level — we quote instruments, not indices.
            </p>

            {/* ------------------------------ breadth ------------------- */}
            {indexQuotes.length > 0 && (
              <Card as="section" className="mh-breadth" aria-labelledby="breadth-heading">
                <h2 id="breadth-heading" className="card-label">How the Nasdaq-100 moved today</h2>
                <BreadthBar quotes={indexQuotes} />
                <p className="mh-breadth-note">
                  Counted across <strong>{indexQuotes.length} constituents</strong> — the
                  Nasdaq-100 names this account quotes. It is the index we can count, not the
                  whole market: our provider serves no market-wide ranking, so a figure
                  labelled “the market” would be untrue.
                </p>
              </Card>
            )}

            {/* ---------------------- biggest gains / falls -------------- */}
            {gains.length > 0 && (
              <div className="mh-extremes">
                <section>
                  <h2 className="card-label">Biggest gains today</h2>
                  <p className="mh-extremes-sub">The Nasdaq-100 names that rose most</p>
                  <div className="mh-rows">{gains.map((q) => <InstrumentRow key={q.symbol} quote={q} />)}</div>
                </section>
                <section>
                  <h2 className="card-label">Biggest falls today</h2>
                  <p className="mh-extremes-sub">The Nasdaq-100 names that fell most</p>
                  <div className="mh-rows">{falls.map((q) => <InstrumentRow key={q.symbol} quote={q} />)}</div>
                </section>
              </div>
            )}
          </Card>

          {/* ============================ 2. THE TWO BOARDS ============== */}
          {(gainers.length > 0 || losers.length > 0) && (
            <div className="mh-boards">
              {[
                { tone: 'up' as const, title: 'Top gainers', rows: gainers },
                { tone: 'down' as const, title: 'Top losers', rows: losers },
              ].map((board) => (
                <Card tone={board.tone} as="section" key={board.title} className="mh-board">
                  <header className="mh-board-head">
                    <h2 className="mh-board-title">{board.title}</h2>
                    <span className="m-label">Session</span>
                  </header>
                  <Badge tone="outline">Delayed</Badge>
                  <p className="mh-board-note">
                    Quotes run behind the exchange. {asOf ? `The last tick we hold arrived ${formatAsOf(asOf)}.` : ''}
                  </p>
                  <div className="mh-rows">{board.rows.map((q) => <InstrumentRow key={q.symbol} quote={q} />)}</div>
                </Card>
              ))}
            </div>
          )}

          <MarketNote asOf={asOf} delayed={delayed} tone="dark" />

          {/* ================================ 3. COVERED ================= */}
          <section className="mh-block" aria-labelledby="covered-heading">
            <header className="mh-block-head">
              <div>
                <h2 id="covered-heading" className="mh-h2">Thirteen instruments, each with its own page</h2>
                <p className="mh-block-sub">
                  Today’s move against the whole index, the all-in cost of the trade computed
                  from the published schedule, and the LRS, TCS and treaty rules that apply to
                  an Indian resident buying it.
                </p>
              </div>
              <Link className="m-btn" to={terminalPath('aapl')}>Open the terminal <ArrowRight /></Link>
            </header>

            <div className="mh-covered">
              {TERMINAL_UNIVERSE.map((i) => {
                const q = quotes.get(i.symbol)
                return (
                  <Card to={terminalPath(i.symbol)} key={i.symbol} className="mh-cov">
                    <span className="mh-cov-top">
                      <Plate symbol={i.symbol} />
                      {q ? <DeltaPill value={q.changePercent} />
                         : <span className="m-label">{ready ? '—' : ' '}</span>}
                    </span>
                    <span className="mh-cov-sym">{i.symbol}</span>
                    <span className="mh-cov-name">{i.name}</span>
                    <span className="mh-cov-px">
                      {q ? `$${formatPrice(q.price)}` : <span className="is-loading-text is-load-price">000.00</span>}
                    </span>
                  </Card>
                )
              })}
            </div>
          </section>

          {/* ================================ 4. ROOMS =================== */}
          <section className="mh-block" aria-labelledby="rooms-heading">
            <header className="mh-block-head">
              <h2 id="rooms-heading" className="mh-h2">Where would you like to begin?</h2>
              <p className="mh-block-sub">
                The terminal is where most people start — the rest is the reading and the
                desk behind it.
              </p>
            </header>
            <div className="mh-rooms">
              <Card lit to={terminalPath('aapl')} className="mh-flagship">
                <span className="mh-flagship-top">
                  <span className="m-label m-label--accent">The product</span>
                  <Badge tone="gold">Flagship</Badge>
                </span>
                <span className="mh-flagship-title">The Platizio Terminal</span>
                <p className="mh-flagship-p">
                  One page per instrument: today’s move set against the whole index, the
                  all-in cost of the trade, and the rules that apply to buying it from India.
                </p>
                <span className="mh-flagship-stats">
                  {[
                    { v: pct(RATES.brokeragePct), l: 'Per transaction' },
                    { v: '$0', l: 'Account opening' },
                    { v: pct(RATES.ltcgPct), l: 'Long-term gains' },
                  ].map((s) => (
                    <span className="mh-fstat" key={s.l}>
                      <span className="mh-fstat-v">{s.v}</span>
                      <span className="m-label">{s.l}</span>
                    </span>
                  ))}
                </span>
                <span className="mh-flagship-go">Open the terminal <ArrowRight /></span>
              </Card>

              <div className="mh-room-stack">
                {ROOMS.map((r) => (
                  <Card to={r.to} key={r.title} className="mh-room">
                    <span className="mh-room-top">
                      <span className="m-label">{r.kicker}</span>
                      <span className="mh-room-meta">{r.meta}</span>
                    </span>
                    <span className="mh-room-title">{r.title}</span>
                    <p className="mh-room-p">{r.body}</p>
                  </Card>
                ))}
              </div>
            </div>
          </section>

          {/* ================================ 5. NOTES =================== */}
          <section className="mh-block" aria-labelledby="notes-heading">
            <header className="mh-block-head">
              <h2 id="notes-heading" className="mh-h2">Start with the machinery</h2>
              <Link className="m-btn" to="/articles">Research library <ArrowRight /></Link>
            </header>
            <div className="mh-notes">
              {NOTES.map((n) => (
                <Card to={`/articles/${n.slug}`} key={n.slug} className="mh-note">
                  <span className="mh-note-plate" aria-hidden="true" />
                  <span className="m-label m-label--accent">{n.tag}</span>
                  <span className="mh-note-title">{n.title}</span>
                  <span className="mh-note-go">Read the guide <ArrowRight /></span>
                </Card>
              ))}
            </div>
          </section>

          {/* ================================ 6. CLOSE =================== */}
          <Card glow as="section" className="mh-close">
            <span className="m-label m-label--accent">Accounts open in a day</span>
            <h2 className="mh-close-title">Open an account in an afternoon. Keep it for a decade.</h2>
            <p className="mh-close-p">
              Account opening and KYC are free, the charge schedule is published in full, and
              the desk will tell you honestly whether this suits your book.
            </p>
            <span className="mh-close-actions">
              <a className="m-cta" href={TRADING_PLATFORM_URL} target="_blank" rel="noopener noreferrer">
                Start investing <ArrowUpRight />
              </a>
              <Link className="m-btn" to="/pricing">See what it costs <ArrowRight /></Link>
            </span>
          </Card>
        </div>
      </div>
    </>
  )
}
