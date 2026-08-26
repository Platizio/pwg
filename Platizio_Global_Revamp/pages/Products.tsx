/*
 * DIRECTION CONTRACT — seed a08a840d (surface roll, persuade, assigned index 6)
 *
 * THESIS: This page is the first purchase, walked end to end. It refuses the
 * category default — hero screenshot, feature grid, pricing table, CTA — and
 * equally refuses its opposite, the austere spec sheet, which the previous
 * build shipped. Neither answers the only question our reader actually has.
 *
 * OWN-WORLD: Meridian v2, the screener's own lit-card surface — #080706 under
 * a champagne wash, one gold #D9BD8B, Outfit in all three roles, 16px cards
 * carrying a warm gradient, a one-pixel top highlight and a pooled shadow.
 * Taken from screener/app/globals.css so the page and the instrument it sells
 * are visibly one object. Scoped to .ft and .chrome-dark; :root is untouched,
 * so Home, Pricing and About keep the site's light identity.
 *
 * STORY: A reader in India who has never bought a US stock arrives unsure it
 * is even allowed. They learn it is, in the first viewport. Then they walk the
 * trade: pick a company they already know, watch it quote live, see what the
 * terminal would tell them about it, see the entire cost of buying it, and see
 * what they will owe later. They open an account because nothing is left
 * unknown.
 *
 * FIRST VIEWPORT: A product hero. Headline, the permission fact and the two
 * actions on the left; the terminal itself on the right, as a live panel
 * rather than a picture of one — the thing being sold, quoting a real company
 * at a real price, with what one share would actually cost to buy.
 *
 * FORM: The guided first trade — candidate 6 of the grounded list, assigned by
 * the roll. The route's see-it-all-at-once topology is taken from the dealt
 * guide-map challenger; its palette and character are not.
 *
 * FINISH: unreviewed and undocumented is unfinished; this build ends with the
 * finish review, the verdict, and DESIGN.md
 */

import { useMemo, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { Link } from 'react-router-dom'
import { TRADING_PLATFORM_URL, screenerInstrument } from '../../src/constants'
import { POPULAR_8, LARGE_CAP_SAMPLE } from '../data/marketUniverse'
import { RATES, FREE_ITEMS, pct } from '../data/pricingRates'
import { calculateTradeCost, formatUsd } from '../lib/pricing'
import { useQuoteLookup } from '../hooks/useQuoteLookup'
import { useGainers } from '../hooks/useGainers'
import { useMarketData } from '../hooks/useMarketData'
import BrandMark from '../components/BrandMark'
import { VIDEOS } from '../../src/videos'
import { YOUTUBE_CHANNEL_URL } from '../../src/constants'
import MarketNote from '../components/MarketNote'
import QuoteChange from '../components/QuoteChange'
import '../styles/products.css'

/** The five stops, named once. The route rail and the sections both read this. */
const ROUTE = [
  { id: 'pick', n: 1, label: 'Pick a company' },
  { id: 'decide', n: 2, label: 'See more than a price' },
  { id: 'cost', n: 3, label: 'Know the whole cost' },
  { id: 'after', n: 4, label: 'Know what you owe later' },
  { id: 'open', n: 5, label: 'Open the account' },
] as const

/*
 * What the terminal adds once a name is chosen.
 *
 * Real crops of the running terminal rather than icons: the argument of this
 * step is that the instrument exists, so the step shows the instrument. Each
 * one is a region of the same capture.
 */
/*
 * The seven things the terminal does, in the user's own list order.
 *
 * No screenshots and no simulated instrument: a product page states what the
 * product does and is judged on how well it states it. Each entry is a claim,
 * a sentence that earns it, and a short mono note that gives it an edge — the
 * design carries the weight, not a picture of a screen.
 */
const FEATURES = [
  {
    n: '01',
    title: 'Every number on a company, current.',
    body: 'Price, range, volume and the ratios that matter, kept up to date rather than filed once a quarter. The starting point is what the company is worth now, not what a factsheet said in March.',
    note: 'Coverage · the largest 500 US companies',
    wide: true,
  },
  {
    n: '02',
    title: 'The events that actually move it.',
    body: 'Earnings dates, dividends, splits and guidance, on a calendar against the name you are holding. Most of what moves a price is scheduled long before it happens, and knowing the date is most of the advantage.',
    note: 'Scheduled, not guessed',
    wide: false,
  },
  {
    n: '03',
    title: 'News filtered to the one company.',
    body: 'The wire narrowed to the name you are considering, so you are reading about the thing you are about to buy instead of the market in general.',
    note: 'One company at a time',
    wide: false,
  },
  {
    n: '04',
    title: 'What the desks covering it actually say.',
    body: 'Analyst ratings and targets collected in one place, with how many desks are publishing — so a number arrives with a source you can weigh rather than a headline you have to trust.',
    note: 'Ratings · targets · coverage count',
    wide: false,
  },
  {
    n: '05',
    title: 'A terminal that helps you decide, not wonder.',
    body: 'The difference between a broker and an instrument is what happens before the order. Everything above sits on one page, against one company, so the decision is made with the evidence rather than after it.',
    note: 'The whole case, on one page',
    wide: true,
  },
  {
    n: '06',
    title: 'How to invest in the US, explained end to end.',
    body: 'The route from a rupee in an Indian bank to a share on a US exchange — remittance, limits, filings and the paperwork at the far end — written out rather than assumed.',
    note: 'Written guides, not a help desk',
    wide: false,
  },
  {
    n: '07',
    title: 'Pricing that buys more than a place to trade.',
    body: 'The schedule is published in full before you trade and there is no line after it. What it pays for is the instrument above, not a button that sends an order.',
    note: `${pct(RATES.brokeragePct)} per trade · the whole schedule, in advance`,
    wide: false,
  },
] as const

/** What is owed after the trade, not at it. Kept separate from cost on purpose. */
const LATER = [
  {
    title: 'TCS is not a cost',
    body: `Above ₹10 lakh of cumulative LRS remittance in a financial year, ${pct(RATES.tcsPct, 0)} is collected at source. It is credited against your tax when you file — you get it back.`,
    to: '/articles/tcs-on-lrs-explained',
    cta: 'How TCS is reclaimed',
  },
  {
    title: 'Gains are taxed as foreign assets',
    body: `Your slab rate before ${RATES.ltcgThresholdMonths} months, ${pct(RATES.ltcgPct)} after. The ₹1.25 lakh exemption that applies to Indian listed equity does not apply here.`,
    to: '/articles/tax-on-us-stocks-in-india',
    cta: 'How the tax works',
  },
  {
    title: 'Dividends are withheld in the US',
    body: `${pct(RATES.dividendWithholdingPct, 0)} is withheld at source before the money reaches you, and is claimable in India as a foreign tax credit.`,
    to: '/articles/dividend-tax-us-stocks-india',
    cta: 'Claiming the credit',
  },
  {
    title: 'Holdings are disclosed every year',
    body: 'A US holding is a foreign asset, so Schedule FA of your return lists it — in every year you hold it, including years you did not trade.',
    to: '/articles/schedule-fa-foreign-assets-reporting',
    cta: 'What Schedule FA needs',
  },
] as const

/*
 * Three of the channel's videos, chosen for a reader who has not invested
 * abroad before: the route, the instrument, and the case. Real ids and real
 * URLs from src/videos.ts — nothing here is invented, and the section links
 * out to the channel rather than claiming to be a library.
 */
const WATCH = ['wRQik3jjm-w', '6uTyQZgBWw0', 'CKtJHoKmNBI']
  .map((id) => VIDEOS.find((v) => v.id === id))
  .filter((v): v is (typeof VIDEOS)[number] => Boolean(v))

/** Match on symbol first, then company name. Six is what the list can show without scrolling. */
function search(query: string) {
  const q = query.trim().toUpperCase()
  if (q.length < 1) return []
  const starts = LARGE_CAP_SAMPLE.filter((c) => c.symbol.startsWith(q))
  const named = LARGE_CAP_SAMPLE.filter(
    (c) => !c.symbol.startsWith(q) && c.name.toUpperCase().includes(q),
  )
  return [...starts, ...named].slice(0, 6)
}

export default function Products() {
  /* Netflix opens the page: of the eight, it is the name an Indian reader is
     likeliest to already pay for, which is the whole point of the step. */
  const [symbol, setSymbol] = useState('NFLX')
  const [query, setQuery] = useState('')
  const [shares, setShares] = useState('1')
  /* One open at a time. The first is open on arrival so the component explains
     itself without a click. */
  const [openFeature, setOpenFeature] = useState(0)

  const { quote, status, asOf, delayed } = useQuoteLookup(symbol)
  const { gainers, basis } = useGainers()
  /* The eight are quoted together in one call, so every card carries a live
     price rather than only the one the reader has selected. */
  const { popular, asOf: popularAsOf, delayed: popularDelayed } = useMarketData()

  /* Motion is an enhancement, never the thing that makes copy visible: with
     reduced motion the cells render in their final state and nothing animates. */
  const reduce = useReducedMotion()

  const matches = useMemo(() => search(query), [query])

  const qty = Math.max(1, Math.min(9999, Math.floor(Number(shares) || 0) || 1))
  const value = quote ? quote.price * qty : null
  const cost = value !== null ? calculateTradeCost(value, 'buy') : null

  const displayName = quote?.name ?? symbol
  const picked = POPULAR_8.find((p) => p.symbol === symbol)?.name ?? displayName

  const choose = (s: string) => {
    setSymbol(s)
    setQuery('')
  }

  return (
    <div className="ft" data-seed="a08a840d">
      <svg className="ft-grain" aria-hidden="true" focusable="false">
        <filter id="ft-grain-f">
          <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves={3} stitchTiles="stitch" />
        </filter>
        <rect width="100%" height="100%" filter="url(#ft-grain-f)" />
      </svg>

      {/* ------------------------------------------------------------- hero */}
      <section className="ft-hero">
        <div className="container ft-hero-inner">
          <div className="ft-hero-copy">
            <p className="ft-mark">
              <span className="ft-mark-dot" aria-hidden="true" />
              <span className="ft-label">US equities &amp; ETFs · for residents of India</span>
            </p>

            <h1 className="ft-h1">
              Owning US stock from India,
              <em> start to finish.</em>
            </h1>

            <p className="ft-permit">
              <strong>You are allowed to.</strong> The Reserve Bank&rsquo;s Liberalised
              Remittance Scheme lets a resident individual send up to{' '}
              <span className="ft-fig">$250,000</span> abroad each financial year,
              investment included — an ordinary, declared route, not a loophole.
            </p>

            <div className="ft-actions">
              <a className="ft-cta" href={TRADING_PLATFORM_URL} target="_blank" rel="noopener noreferrer">
                Open an account
              </a>
              <a className="ft-ghost" href={screenerInstrument(symbol)} target="_blank" rel="noopener noreferrer">
                See the terminal
              </a>
            </div>
          </div>

          {/*
            The hero's subject is the product, so the product is what stands
            here — the terminal as a live panel rather than a picture of one.
            It is one component with a fixed aspect, so a capture of the real
            terminal can replace its contents without the hero relaying out.
          */}
          <figure className="ft-hero-shot">
            <figcaption className="ft-shot-chrome">
              <span className="ft-shot-dot" aria-hidden="true" />
              <span className="ft-shot-dot" aria-hidden="true" />
              <span className="ft-shot-dot" aria-hidden="true" />
              <span className="ft-shot-path">platizio / terminal / {symbol}</span>
              <span className="ft-shot-live">
                <span aria-hidden="true" />
                {status === 'ready' ? 'Live' : status === 'loading' ? 'Loading' : 'No feed'}
              </span>
            </figcaption>

            <div className={`ft-shot-body${status === 'loading' ? ' is-loading' : ''}`}>
              <div className="ft-shot-id">
                <BrandMark symbol={symbol} className="ft-shot-mark" />
                <span>
                  <span className="ft-shot-co">{displayName}</span>
                  <span className="ft-shot-sym">{symbol} · Nasdaq &amp; NYSE listed</span>
                </span>
              </div>

              <div className="ft-shot-px">
                <span className="ft-shot-cur">$</span>
                <span className="ft-shot-fig">{quote ? formatUsd(quote.price) : '—'}</span>
                {quote && <QuoteChange changePercent={quote.changePercent} variant="chip" />}
              </div>

              <dl className="ft-shot-cells">
                <div>
                  <dt>One share, all in</dt>
                  <dd>
                    {quote
                      ? `$${formatUsd(quote.price + (calculateTradeCost(quote.price, 'buy')?.total ?? 0))}`
                      : '—'}
                  </dd>
                </div>
                <div>
                  <dt>Cost to buy it</dt>
                  <dd>
                    {quote ? `$${formatUsd(calculateTradeCost(quote.price, 'buy')?.total ?? 0)}` : '—'}
                  </dd>
                </div>
                <div>
                  <dt>Companies quoted</dt>
                  <dd>500</dd>
                </div>
                <div>
                  <dt>Account opening</dt>
                  <dd>$0</dd>
                </div>
              </dl>

              <div className="ft-shot-foot" aria-live="off">
                <MarketNote asOf={asOf} delayed={delayed} />
              </div>
            </div>
          </figure>
        </div>
      </section>

      {/* ----------------------------------------------------------- movers */}
      <section className="ft-movers-band">
        <div className="container">
          <div className="ft-movers">
            <p className="ft-movers-head">
              <span className="ft-label">Rising today</span>
              {basis && <span className="ft-movers-basis">{basis}</span>}
            </p>
            {gainers === null ? (
              <p className="ft-movers-wait">Loading the day&rsquo;s movers.</p>
            ) : gainers.length === 0 ? (
              <p className="ft-movers-wait">Live prices are unavailable at the moment.</p>
            ) : (
              <ul className="ft-movers-row">
                {gainers.slice(0, 6).map((g) => (
                  <li key={g.symbol}>
                    <span className="ft-movers-sym">{g.symbol}</span>
                    <span className="ft-movers-px">${formatUsd(g.price)}</span>
                    <QuoteChange changePercent={g.changePercent} variant="chip" />
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </section>

      {/* ----------------------------------------------------------- step 1 */}
      <section className="ft-step" id="pick">
        <div className="container">
          <header className="ft-head">
            <div className="ft-head-l">
              <span className="ft-label">01 — the name</span>
              <h2 className="ft-h2">Pick a company you already know.</h2>
            </div>
            <p className="ft-body">
              You do not have to begin at a screener full of tickers. Begin at a name
              you already use, and let the instrument tell you the rest.
            </p>
          </header>

          <div className="ft-pick">
            <ul className="ft-names">
              {POPULAR_8.map((p) => {
                const live = popular?.find((q) => q.symbol === p.symbol) ?? null
                const on = p.symbol === symbol
                return (
                  <li key={p.symbol}>
                    <button
                      type="button"
                      className={`ft-name${on ? ' is-on' : ''}`}
                      aria-pressed={on}
                      onClick={() => choose(p.symbol)}
                    >
                      <BrandMark symbol={p.symbol} className="ft-name-mark" />
                      <span className="ft-name-text">
                        <span className="ft-name-co">{p.name}</span>
                        <span className="ft-name-sym">{p.symbol}</span>
                      </span>
                      <span className="ft-name-fig">
                        <span className="ft-name-px">
                          {live ? `$${formatUsd(live.price)}` : '—'}
                        </span>
                        {live && <QuoteChange changePercent={live.changePercent} variant="chip" />}
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>

            <div className="ft-names-note">
              <MarketNote asOf={popularAsOf} delayed={popularDelayed} />
            </div>

            <div className="ft-search">
              <label htmlFor="ft-q">Or any of the largest 500 US companies</label>
              <input
                id="ft-q"
                type="text"
                className="ft-input"
                placeholder="Company or ticker"
                autoComplete="off"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              {matches.length > 0 && (
                <ul className="ft-matches">
                  {matches.map((m) => (
                    <li key={m.symbol}>
                      <button type="button" onClick={() => choose(m.symbol)}>
                        <span className="ft-match-sym">{m.symbol}</span>
                        <span className="ft-match-name">{m.name}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {query.trim().length > 0 && matches.length === 0 && (
                <p className="ft-nomatch">
                  Nothing by that name in the sample. Try the ticker itself.
                </p>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* ----------------------------------------------------------- step 2 */}
      <section className="ft-step" id="decide">
        <div className="container">
          <header className="ft-head">
            <div className="ft-head-l">
              <span className="ft-label">02 — the evidence</span>
              <h2 className="ft-h2">See more than a price.</h2>
            </div>
            <p className="ft-body">
              A price tells you what {picked} costs. It does not tell you whether to
              buy it. Seven things stand between a name you recognise and a decision
              you can defend.
            </p>
          </header>

          {/*
            An index that opens, not a grid of cards. Seven equal boxes make the
            reader choose where to start and give the seventh the same weight as
            the first; a list with one row open reads in order, keeps the whole
            set in view, and lets the open row take the room it needs.
          */}
          <ul className="ft-index">
            {FEATURES.map((f, i) => {
              const open = openFeature === i
              return (
                <li key={f.n} className={`ft-index-row${open ? ' is-open' : ''}`}>
                  <h3>
                    <button
                      type="button"
                      className="ft-index-head"
                      aria-expanded={open}
                      aria-controls={`ft-feat-${f.n}`}
                      onClick={() => setOpenFeature(open ? -1 : i)}
                    >
                      <span className="ft-index-n">{f.n}</span>
                      <span className="ft-index-title">{f.title}</span>
                      <span className="ft-index-sign" aria-hidden="true">
                        <span />
                        <span />
                      </span>
                    </button>
                  </h3>
                  <AnimatePresence initial={false}>
                    {open && (
                      <motion.div
                        id={`ft-feat-${f.n}`}
                        className="ft-index-panel"
                        initial={reduce ? false : { height: 0, opacity: 0 }}
                        animate={reduce ? undefined : { height: 'auto', opacity: 1 }}
                        exit={reduce ? undefined : { height: 0, opacity: 0 }}
                        transition={{ duration: 0.42, ease: [0.22, 1, 0.36, 1] }}
                      >
                        <div className="ft-index-body">
                          <p>{f.body}</p>
                          <span className="ft-index-note">{f.note}</span>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </li>
              )
            })}
          </ul>

          <p className="ft-see-go">
            <a className="ft-link" href={screenerInstrument(symbol)} target="_blank" rel="noopener noreferrer">
              Open {symbol} in the terminal <span className="ft-link-rule" aria-hidden="true" />
            </a>
          </p>
        </div>
      </section>

      {/* ----------------------------------------------------------- step 3 */}
      <section className="ft-step" id="cost">
        <div className="container">
          <header className="ft-head">
            <div className="ft-head-l">
              <span className="ft-label">03 — the cost</span>
              <h2 className="ft-h2">Know the whole cost, before you trade.</h2>
            </div>
            <p className="ft-body">
              Not a representative example. The actual schedule, applied to the name
              you picked, at a size you set.
            </p>
          </header>

          <div className="ft-cost">
            {/* The control and the ledger are one object now: they were two
                floating hairline blocks with 230px of nothing between them. */}
            <div className="ft-cost-panel">
              <div className="ft-cost-input">
                <label htmlFor="ft-qty">Shares of {symbol}</label>
                <div className="ft-cost-entry">
                  <input
                    id="ft-qty"
                    className="ft-input ft-input--qty"
                    type="number"
                    min={1}
                    max={9999}
                    step={1}
                    inputMode="numeric"
                    value={shares}
                    onChange={(e) => setShares(e.target.value)}
                  />
                  <p className="ft-cost-value">
                    {value !== null ? (
                      <>
                        {qty} × ${formatUsd(quote!.price)} ={' '}
                        <strong>${formatUsd(value)}</strong>
                      </>
                    ) : (
                      'Waiting on a live price.'
                    )}
                  </p>
                </div>

                <p className="ft-cost-floor">
                  Below about{' '}
                  <strong>${formatUsd(RATES.brokerageMinUsd / RATES.brokeragePct, 0)}</strong> a
                  trade, the ${RATES.brokerageMinUsd} minimum is larger than{' '}
                  {pct(RATES.brokeragePct)} and becomes the cost that matters. Small
                  first trades are proportionally the expensive ones.
                </p>
              </div>

              {cost ? (
                <dl className="ft-cost-lines">
                  <div>
                    <dt>Brokerage{cost.minimumApplied ? ' (minimum)' : ''}</dt>
                    <dd>${formatUsd(cost.brokerage)}</dd>
                    <dd className="ft-cost-note">
                      {cost.minimumApplied
                        ? `${pct(RATES.brokeragePct)} would be less than the $${RATES.brokerageMinUsd} floor`
                        : `${pct(RATES.brokeragePct)} of trade value`}
                    </dd>
                  </div>
                  <div>
                    <dt>IGST</dt>
                    <dd>${formatUsd(cost.igst)}</dd>
                    <dd className="ft-cost-note">{pct(RATES.igstPct, 0)} on the brokerage</dd>
                  </div>
                  <div>
                    <dt>IFSCA turnover fee</dt>
                    <dd>${formatUsd(cost.ifsca, 4)}</dd>
                    <dd className="ft-cost-note">Per dollar of trade value</dd>
                  </div>
                  <div className="ft-cost-total">
                    <dt>Total to buy</dt>
                    <dd>${formatUsd(cost.total)}</dd>
                    <dd className="ft-cost-note">{cost.effectivePct.toFixed(2)}% of the trade</dd>
                  </div>
                </dl>
              ) : (
                <p className="ft-cost-wait">The breakdown appears once the price lands.</p>
              )}
            </div>

            <div className="ft-free">
              <h3>And the parts that cost nothing.</h3>
              <ul>
                {FREE_ITEMS.map((f) => (
                  <li key={f.label}>
                    <span className="ft-free-v">{f.value}</span>
                    <span>{f.label}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <p className="ft-cost-foot">
            Selling adds an SEC fee of ${RATES.secFeePerUsd} per dollar and a FINRA fee
            of ${RATES.finraPerShare} per share. FINRA sits outside the total above
            because it is charged per share, so trade value alone cannot compute it —
            excluded and disclosed beats included and wrong. Rates as published{' '}
            {RATES.ratesAsOf}.{' '}
            <Link className="ft-link ft-link--inline" to="/pricing">
              The full schedule <span className="ft-link-rule" aria-hidden="true" />
            </Link>
          </p>
        </div>
      </section>

      {/* ----------------------------------------------------------- step 4 */}
      <section className="ft-step" id="after">
        <div className="container">
          <header className="ft-head">
            <div className="ft-head-l">
              <span className="ft-label">04 — afterwards</span>
              <h2 className="ft-h2">Know what you owe later.</h2>
            </div>
            <p className="ft-body">
              The trade is the easy part. These four are what a first-time buyer
              usually finds out afterwards, so they are here instead.
            </p>
          </header>

          <div className="ft-later">
            {LATER.map((l) => (
              <article className="ft-later-item" key={l.title}>
                <h3>{l.title}</h3>
                <p>{l.body}</p>
                <Link className="ft-link" to={l.to}>
                  {l.cta} <span className="ft-link-rule" aria-hidden="true" />
                </Link>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* ------------------------------------------------- before you invest */}
      <section className="ft-step ft-watch-band" id="watch">
        <div className="container">
          <header className="ft-head">
            <div className="ft-head-l">
              <span className="ft-label">Before you invest</span>
              <h2 className="ft-h2">Watch these three first.</h2>
            </div>
            <p className="ft-body">
              The route, the instrument and the case for holding anything abroad at
              all — from our own desk, in the order a first-time investor needs them.
            </p>
          </header>

          <ul className="ft-watch">
            {WATCH.map((v, i) => (
              <li key={v.id}>
                <a className="ft-watch-card" href={v.url} target="_blank" rel="noopener noreferrer">
                  <span className="ft-watch-n">{`0${i + 1}`}</span>
                  <span className="ft-watch-play" aria-hidden="true">
                    <svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.5v13l11-6.5-11-6.5Z" /></svg>
                  </span>
                  <span className="ft-watch-title">{v.title}</span>
                  <span className="ft-watch-blurb">{v.blurb}</span>
                  <span className="ft-watch-go">
                    Watch <span className="ft-link-rule" aria-hidden="true" />
                  </span>
                </a>
              </li>
            ))}
          </ul>

          <div className="ft-watch-more">
            <a className="ft-ghost" href={YOUTUBE_CHANNEL_URL} target="_blank" rel="noopener noreferrer">
              Learn more
            </a>
          </div>
        </div>
      </section>

      {/* ----------------------------------------------------------- step 5 */}
      <section className="ft-close" id="open">
        <div className="container">
          <div className="ft-close-inner">
            <span className="ft-label">05 — the account</span>
            <h2 className="ft-h2">Open an account in an afternoon.</h2>
            <p className="ft-body">
              Opening costs nothing and closes nothing off. You can hold the terminal
              open beside it and keep reading before you buy anything at all.
            </p>
            <div className="ft-actions">
              <a className="ft-cta" href={TRADING_PLATFORM_URL} target="_blank" rel="noopener noreferrer">
                Open an account
              </a>
              <a className="ft-ghost" href={screenerInstrument(symbol)} target="_blank" rel="noopener noreferrer">
                Keep looking at {symbol}
              </a>
            </div>
            <div className="ft-close-rule" aria-hidden="true" />
          </div>
        </div>
      </section>
    </div>
  )
}
