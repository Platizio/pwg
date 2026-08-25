import { useState } from 'react'
import { Link } from 'react-router-dom'
import { TRADING_PLATFORM_URL } from '../../src/constants'
import SEO, { breadcrumbSchema } from '../../src/components/SEO'
import { TERMINAL_UNIVERSE, terminalPath, findInstrument, type Instrument } from '../data/terminalUniverse'
import { useTerminalData } from '../hooks/useTerminalData'
import { formatPrice, formatPercent, direction } from '../lib/format'
import { calculateTradeCost, formatUsd } from '../lib/pricing'
import { RATES, pct } from '../data/pricingRates'
import { summarise, axisLabel } from '../lib/plot'
import MarketNote from '../components/MarketNote'
import MeridianFonts from '../components/terminal/MeridianFonts'
import TickerTape from '../components/terminal/TickerTape'
import Mark from '../components/terminal/Mark'
import Change from '../components/terminal/Change'
import PriceChart from '../components/terminal/PriceChart'
import RangeChips from '../components/terminal/RangeChips'
import Sparkline from '../components/terminal/Sparkline'
import { ArrowRight, ArrowUpRight } from '../components/terminal/Icons'

/* ------------------------------------------------------------------ rooms */

const ROOMS = [
  {
    kicker: 'Markets',
    meta: '13 INSTRUMENTS',
    title: 'Markets',
    body: 'Eight US-listed shares and five index funds, each with its own page: today’s move against the index, the all-in cost, and the tax that applies.',
    to: '/terminal/aapl',
  },
  {
    kicker: 'Research',
    meta: '30 GUIDES',
    title: 'Research',
    body: 'Written guides on LRS, W-8BEN, TCS, DTAA, Schedule FA and the rest of the machinery — none of it trying to sell you anything.',
    to: '/articles',
  },
  {
    kicker: 'The desk',
    meta: 'IST HOURS',
    title: 'The desk',
    body: 'Onboarding, remittance questions and settlement, answered by people in Noida rather than a form that promises 48 hours.',
    to: '/about',
  },
]

const NOTES = [
  { tag: 'GETTING STARTED', slug: 'how-to-invest-in-us-stocks-from-india', title: 'How to Invest in US Stocks from India: A Step-by-Step Guide' },
  { tag: 'TAXATION', slug: 'tax-on-us-stocks-in-india', title: 'Tax on US Stocks in India: Capital Gains, Dividends and Reporting' },
  { tag: 'COMPLIANCE', slug: 'tcs-on-lrs-explained', title: 'TCS on LRS Remittances: 20% Above ₹10 Lakh, and How to Get It Back' },
]

type Lens = 'all' | 'stock' | 'etf'
const LENSES: { id: Lens; label: string }[] = [
  { id: 'all', label: 'EVERYTHING' },
  { id: 'stock', label: 'SHARES' },
  { id: 'etf', label: 'INDEX FUNDS' },
]

export default function Products() {
  const { quotes, indexMoves, indexLeaders, asOf, delayed, ready } = useTerminalData()
  const [lens, setLens] = useState<Lens>('all')
  const [preview, setPreview] = useState<string | null>(null)
  const [range, setRange] = useState('1D')

  const lensSet = TERMINAL_UNIVERSE.filter((i) => lens === 'all' || i.kind === lens)
  const lensQuoted = lensSet.map((i) => quotes.get(i.symbol)).filter(Boolean) as { changePercent: number }[]
  const lensMove = lensQuoted.length
    ? lensQuoted.reduce((sum, q) => sum + q.changePercent, 0) / lensQuoted.length
    : null

  // The hero leads with the day's largest mover among the instruments we
  // cover — an editorial choice that changes daily, not a hardcoded favourite.
  const topMover = TERMINAL_UNIVERSE
    .map((i) => ({ i, q: quotes.get(i.symbol) }))
    .filter((r): r is { i: Instrument; q: NonNullable<typeof r.q> } => !!r.q)
    .sort((a, b) => Math.abs(b.q.changePercent) - Math.abs(a.q.changePercent))[0]?.i

  const hero = (preview ? findInstrument(preview) : undefined) ?? topMover ?? TERMINAL_UNIVERSE[0]
  const heroQuote = quotes.get(hero.symbol)
  const day = summarise(indexMoves)

  const leaders = indexLeaders.filter((q) => q.changePercent > 0).slice(0, 4)
  const laggards = indexLeaders.filter((q) => q.changePercent < 0).slice(0, 4)

  return (
    <>
      <SEO
        title="US Stocks &amp; ETFs — Invest from India via LRS"
        description="Delayed prices for thirteen US stocks and index funds, each with the all-in cost of buying it from India and the tax that applies. Invest under the RBI Liberalised Remittance Scheme with Platizio Global."
        canonical="/products"
        jsonLd={breadcrumbSchema([['Home', '/'], ['Products', '/products']])}
      />
      {/* Instrument Serif and Manrope: this route and the terminal only. */}
      <MeridianFonts />

      <div className="meridian mh">
        <TickerTape quotes={quotes} />

        {/* ============================================ 1. HERO ========= */}
        <section className="mh-sec mh-hero" aria-labelledby="hero-heading">
          <div className="container">
            <div className="mh-kicker">
              <span className="m-dot" aria-hidden="true" />
              <span className="m-label m-label--accent">
                NASDAQ · NYSE ARCA — {delayed ? 'DELAYED QUOTES' : 'QUOTES'}
              </span>
            </div>

            <div className="mh-hero-grid">
              <div>
                <h1 id="hero-heading" className="mh-h1">
                  Built for people who read the <em>whole filing.</em>
                </h1>
                <p className="mh-lede">
                  Platizio Global is a route from a rupee account to US-listed equity:
                  research, live prices and execution held to one standard, and offered
                  directly to serious individual investors. One firm, one desk, and the
                  full cost printed on the page before you sign anything.
                </p>
                <div className="mh-actions">
                  <a className="m-cta" href={TRADING_PLATFORM_URL} target="_blank" rel="noopener noreferrer">
                    Open an account <ArrowUpRight />
                  </a>
                  <Link className="m-btn" to={terminalPath(hero.symbol)}>
                    See the terminal <ArrowRight />
                  </Link>
                </div>
              </div>

              {/* The product, doing its job, before a word about it. The
                  composition is the source design's: chrome line, instrument
                  head, range strip, ladder + plot + volume + session times,
                  then four figures on a ruled foot. */}
              <Link className="mh-card" to={terminalPath(hero.symbol)}>
                <div className="mh-card-chrome">
                  <span className="mh-dots" aria-hidden="true"><i /><i /><i /></span>
                  <span className="mh-crumb-path">
                    platizioglobal.com / terminal / {hero.symbol.toLowerCase()}
                  </span>
                  <span className="mh-card-state">{delayed ? 'DELAYED' : 'LIVE'}</span>
                </div>

                <div className="mh-card-head">
                  <Mark symbol={hero.symbol} size="md" />
                  <span className="mh-card-id">
                    <span className="mh-card-name">{hero.name}</span>
                    <span className="mh-card-ex">{hero.exchange}: {hero.symbol}</span>
                  </span>
                  <span className="mh-card-figure">
                    {heroQuote ? (
                      <>
                        <span className="mh-card-price">
                          <span className="cur" aria-hidden="true">$</span>{formatPrice(heroQuote.price)}
                        </span>
                        <span className={`mh-card-chg is-${direction(heroQuote.changePercent)}`}>
                          {formatPercent(heroQuote.changePercent)} TODAY
                        </span>
                      </>
                    ) : ready ? (
                      <span className="m-absent">Unavailable</span>
                    ) : (
                      <>
                        <span className="mh-card-price is-loading-text is-load-price">000.00</span>
                        <span className="mh-card-chg is-loading-text is-load-chg">+0.00%</span>
                      </>
                    )}
                  </span>
                </div>

                <RangeChips active={range} onChange={setRange} />

                {heroQuote ? (
                  <>
                    <div className="mh-card-chart">
                      <PriceChart
                        symbol={hero.symbol}
                        price={heroQuote.price}
                        previousClose={heroQuote.price - heroQuote.change}
                        changePercent={heroQuote.changePercent}
                      />
                    </div>

                    <div className="mh-card-stats">
                      <span className="mh-stat">
                        <span className="mh-stat-v">${formatPrice(heroQuote.price - heroQuote.change)}</span>
                        <span className="m-label">Prev close</span>
                      </span>
                      <span className="mh-stat">
                        <span className="mh-stat-v">
                          ${formatUsd(calculateTradeCost(heroQuote.price, 'buy')?.total ?? 0)}
                        </span>
                        <span className="m-label">Cost of one</span>
                      </span>
                      <span className="mh-stat">
                        <span className="mh-stat-v">{pct(RATES.brokeragePct)}</span>
                        <span className="m-label">Brokerage</span>
                      </span>
                      <span className="mh-stat">
                        <span className="mh-stat-v">$0</span>
                        <span className="m-label">To open</span>
                      </span>
                    </div>
                  </>
                ) : (
                  <p className="mh-card-empty">
                    {ready
                      ? 'Prices are unavailable right now. Every instrument still has its own page, with the cost and tax detail that does not depend on the tape.'
                      : 'Loading the tape…'}
                  </p>
                )}
              </Link>
            </div>

            <p className="m-illus">
              Last price, change and previous close are live delayed quotes. The intraday
              path between them is an illustrative shape — our data provider exposes no
              intraday history, and drawing an invented one without saying so would be the
              one thing this page is built not to do.
            </p>
          </div>
        </section>

        {/* ================================= 2. MARKETS THIS MORNING ==== */}
        <section className="mh-sec" aria-labelledby="morning-heading">
          <div className="container">
            <div className="mh-sec-head">
              <div className="mh-sec-head-l">
                <h2 id="morning-heading" className="mh-h2-sm">Markets this morning</h2>
                <span className="m-label">
                  {day ? `NASDAQ-100 · ${day.advancing} UP · ${day.declining} DOWN · MEDIAN ${axisLabel(day.median)}` : 'INDEX FUNDS'}
                </span>
              </div>
              <Link className="mh-more" to={terminalPath('spy')}>
                All markets <ArrowRight />
              </Link>
            </div>

            {/* The source opened on four index levels. Our provider has no
                index endpoint, so these are the four index FUNDS we quote —
                the same reading, through instruments that are actually
                tradeable from an Indian account. */}
            <div className="mh-morning">
              {['SPY', 'QQQ', 'VOO', 'SOXX'].map((sym) => {
                const inst = findInstrument(sym)!
                const q = quotes.get(sym)
                return (
                  <Link className="mh-index" to={terminalPath(sym)} key={sym}>
                    <div className="mh-index-top">
                      <div>
                        <span className="m-label">{inst.category}</span>
                        <span className="mh-index-name">{inst.name}</span>
                      </div>
                      {q
                        ? <Sparkline symbol={sym} changePercent={q.changePercent} />
                        : <span className="mh-spark-ph" aria-hidden="true" />}
                    </div>
                    <div className="mh-index-foot">
                      {q ? (
                        <>
                          <span className="mh-index-px">${formatPrice(q.price)}</span>
                          <span className={`mh-index-chg is-${direction(q.changePercent)}`}>
                            {formatPercent(q.changePercent)}
                          </span>
                        </>
                      ) : ready ? (
                        <span className="m-absent">—</span>
                      ) : (
                        <>
                          <span className="mh-index-px is-loading-text is-load-price">000.00</span>
                          <span className="mh-index-chg is-loading-text is-load-chg">+0.00%</span>
                        </>
                      )}
                    </div>
                  </Link>
                )
              })}
            </div>
          </div>
        </section>

        {/* ====================================== 3. LEADERS / LAGGARDS == */}
        {(leaders.length > 0 || laggards.length > 0) && (
          <section className="mh-sec mh-sec--tight" aria-labelledby="movers-heading">
            <div className="container">
              <h2 id="movers-heading" className="m-sr">Today's largest moves</h2>
              <div className="mh-movers">
                {[
                  { title: 'Leaders', rows: leaders },
                  { title: 'Laggards', rows: laggards },
                ].map((group) => (
                  <div key={group.title}>
                    <div className="mh-movers-head">
                      <span className="m-label m-label--accent">{group.title}</span>
                      <span className="m-label">By absolute move</span>
                    </div>
                    {group.rows.map((q) => {
                      const covered = findInstrument(q.symbol)
                      const inner = (
                        <>
                          <span className="mh-mover-id">{q.symbol}</span>
                          <span className="mh-mover-name">
                            {q.name === q.symbol ? '' : q.name}
                          </span>
                          <span className="mh-mover-px">${formatPrice(q.price)}</span>
                          <span className="mh-mover-spark">
                            <Sparkline symbol={q.symbol} changePercent={q.changePercent} width={70} height={20} />
                          </span>
                          <span className="mh-mover-chg">
                            <Change changePercent={q.changePercent} />
                          </span>
                        </>
                      )
                      return covered ? (
                        <Link className="mh-mover is-link" to={terminalPath(q.symbol)} key={q.symbol}>
                          {inner}
                        </Link>
                      ) : (
                        <div className="mh-mover" key={q.symbol}>{inner}</div>
                      )
                    })}
                  </div>
                ))}
              </div>
              <p className="m-illus">
                Prices and moves are live delayed quotes; the session shapes beside them
                are illustrative.
              </p>
              <MarketNote asOf={asOf} delayed={delayed} tone="light" />
            </div>
          </section>
        )}

        {/* ============================== 4. WHERE WOULD YOU LIKE TO BEGIN */}
        <section className="mh-sec" aria-labelledby="rooms-heading">
          <div className="container">
            <div className="mh-open">
              <h2 id="rooms-heading" className="mh-h2">Where would you like to begin?</h2>
              <p className="mh-open-p">
                Four rooms. The terminal is where most people start — the rest is the
                markets, the reading and the desk behind them.
              </p>
            </div>

            <div className="mh-rooms">
              <Link className="mh-flagship" to={terminalPath(hero.symbol)}>
                <div className="mh-flagship-top">
                  <span className="m-label m-label--accent">The product</span>
                  <span className="mh-badge">Flagship</span>
                </div>
                <span className="mh-flagship-title">The Platizio Terminal</span>
                <p className="mh-flagship-p">
                  One page per instrument: today's move set against the whole
                  Nasdaq-100, the all-in cost of the trade computed from the published
                  schedule, and the LRS, TCS and treaty rules that apply to an Indian
                  resident buying it.
                </p>

                <div className="mh-lens">
                  <span className="m-label">Coverage</span>
                  <div className="m-seg">
                    {LENSES.map((l) => (
                      <button
                        key={l.id}
                        type="button"
                        aria-pressed={lens === l.id}
                        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setLens(l.id) }}
                      >
                        {l.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="mh-lens-read">
                  <span className="mh-lens-syms">
                    {lensSet.slice(0, 5).map((i) => i.symbol).join(' · ')}
                  </span>
                  <span className="mh-lens-sep" aria-hidden="true" />
                  <span className={`mh-lens-move is-${lensMove === null ? 'flat' : direction(lensMove)}`}>
                    {lensMove === null ? '—' : `${formatPercent(lensMove)} avg today`}
                  </span>
                  <span className="mh-lens-sep" aria-hidden="true" />
                  <span className="mh-lens-count">{lensSet.length} instruments</span>
                </div>

                <div className="mh-flagship-stats">
                  <span className="mh-stat">
                    <span className="mh-stat-v mh-stat-v--lg">{RATES.ltcgThresholdMonths}</span>
                    <span className="m-label">Months to long-term</span>
                  </span>
                  <span className="mh-stat">
                    <span className="mh-stat-v mh-stat-v--lg">{pct(RATES.brokeragePct)}</span>
                    <span className="m-label">Per transaction</span>
                  </span>
                  <span className="mh-stat">
                    <span className="mh-stat-v mh-stat-v--lg">$0</span>
                    <span className="m-label">Account opening</span>
                  </span>
                </div>

                <span className="mh-flagship-go">
                  Open the {hero.symbol} terminal <span className="mh-rule" aria-hidden="true" />
                </span>
              </Link>

              <div className="mh-room-stack">
                {ROOMS.map((room) => (
                  <Link className="mh-room" to={room.to} key={room.title}>
                    <div className="mh-room-top">
                      <span className="m-label">{room.kicker}</span>
                      <span className="mh-room-meta">{room.meta}</span>
                    </div>
                    <span className="mh-room-title">{room.title}</span>
                    <p className="mh-room-p">{room.body}</p>
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* ====================================== 5. FROM THE DESK ======= */}
        <section className="mh-sec" aria-labelledby="notes-heading">
          <div className="container">
            <div className="mh-sec-head mh-sec-head--rule">
              <div>
                <span className="m-label m-label--accent">From the desk</span>
                <h2 id="notes-heading" className="mh-h2-md">Start with the machinery</h2>
              </div>
              <Link className="mh-more" to="/articles">
                Research library <ArrowRight />
              </Link>
            </div>

            <div className="mh-notes">
              {NOTES.map((note) => (
                <Link className="mh-note" to={`/articles/${note.slug}`} key={note.slug}>
                  <span className="mh-note-plate" aria-hidden="true">
                    <span className="mh-note-tag">{note.tag}</span>
                  </span>
                  <span className="mh-note-title">{note.title}</span>
                  <span className="mh-note-go">Read the guide <ArrowRight /></span>
                </Link>
              ))}
            </div>
          </div>
        </section>

        {/* ====================================== 6. THE FIRM ============ */}
        <section className="mh-sec" aria-labelledby="firm-heading">
          <div className="container">
            <div className="mh-firm">
              <div>
                <span className="m-label m-label--accent">The firm</span>
                <h2 id="firm-heading" className="mh-h2">
                  Small by design,<br />answerable by structure.
                </h2>
                <p className="mh-lede mh-lede--sm">
                  Every charge Platizio makes is published before you trade, down to the
                  fee that is measured in hundred-thousandths of a dollar. Nothing on our
                  side profits from you trading more often than you meant to — a
                  distinction that shapes every screen we ship.
                </p>
                <div className="mh-actions">
                  <Link className="m-btn" to="/pricing">The full schedule <ArrowRight /></Link>
                  <Link className="mh-text-link" to="/about">
                    Meet the desk <span className="mh-rule" aria-hidden="true" />
                  </Link>
                </div>
              </div>

              <div className="mh-firm-stats">
                {[
                  { v: pct(RATES.brokeragePct), l: 'Brokerage per transaction' },
                  { v: '$0', l: 'Account opening and KYC' },
                  { v: pct(RATES.ltcgPct), l: 'Long-term capital gains' },
                  { v: RATES.ratesAsOf.split(' ').slice(1).join(' '), l: 'Rates published as of' },
                ].map((s) => (
                  <div className="mh-firm-stat" key={s.l}>
                    <span className="mh-firm-v">{s.v}</span>
                    <span className="m-label">{s.l}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* ====================================== 7. CLOSE =============== */}
        <section className="mh-sec mh-close">
          <div className="container">
            <div className="mh-close-inner">
              <span className="m-label m-label--accent">Accounts open in a day</span>
              <h2 className="mh-h1 mh-h1--center">
                Open an account in an afternoon. Keep it for a decade.
              </h2>
              <p className="mh-lede mh-lede--center">
                Account opening and KYC are free, the charge schedule is published in
                full, and the desk will tell you honestly whether this suits your book.
              </p>
              <div className="mh-actions mh-actions--center">
                <a className="m-cta" href={TRADING_PLATFORM_URL} target="_blank" rel="noopener noreferrer">
                  Start investing <ArrowUpRight />
                </a>
                <Link className="m-btn" to="/pricing">See what it costs <ArrowRight /></Link>
              </div>
            </div>
          </div>
        </section>
      </div>
    </>
  )
}
