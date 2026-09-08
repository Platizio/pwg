"use client"

/*
 * DIRECTION CONTRACT — seed a08a840d (surface roll, persuade, assigned index 6)
 *
 * THESIS: This page is the first purchase, walked end to end. It refuses the
 * category default — hero screenshot, feature grid, pricing table, CTA — and
 * equally refuses its opposite, the austere spec sheet, which the previous
 * build shipped. Neither answers the only question our reader actually has.
 *
 * OWN-WORLD: The site's own light world — white ground, navy ink, one burnt
 * orange, the hairlines and shadows Home and Pricing already use, every value
 * from tokens.css. The one thing kept from the terminal is Outfit, set in all
 * three roles the way the screener sets it. Cards are white with a hairline
 * and a soft shadow; the inset highlight and pooled black that made a dark
 * card read as lit are dark-ground devices and are gone with the dark ground.
 * Scoped to .ft; :root is untouched and the shared chrome is the site's own.
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
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import Link from 'next/link'
import Image from 'next/image'
import { TRADING_PLATFORM_URL, SCREENER_URL, screenerInstrument } from '../../src/constants'
import { POPULAR_8, LARGE_CAP_SAMPLE } from '../data/marketUniverse'
import { RATES, FREE_ITEMS, TRADING_CHARGES, pct } from '../data/pricingRates'
import { formatUsd } from '../lib/pricing'
import { useQuoteLookup } from '../hooks/useQuoteLookup'
import { useGainers } from '../hooks/useGainers'
import BrandMark from '../components/BrandMark'
import { VIDEOS } from '../../src/videos'
import { YOUTUBE_CHANNEL_URL } from '../../src/constants'
import MarketNote from '../components/MarketNote'
import QuoteChange from '../components/QuoteChange'
import '../styles/products.css'


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
  /* Nothing is selected on arrival. The eight are names, not quotes, until the
     reader asks for one — the panel beside them is what answers. */
  const [symbol, setSymbol] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  /* One open at a time. The first is open on arrival so the component explains
     itself without a click. */
  const [openFeature, setOpenFeature] = useState(0)

  const { quote, status, asOf, delayed } = useQuoteLookup(symbol ?? '')
  const { gainers, basis } = useGainers()

  /* Motion is an enhancement, never the thing that makes copy visible: with
     reduced motion the cells render in their final state and nothing animates. */
  const reduce = useReducedMotion()

  const matches = useMemo(() => search(query), [query])

  const displayName = quote?.name ?? symbol ?? ''
  const picked = POPULAR_8.find((p) => p.symbol === symbol)?.name ?? displayName
  /* Every link out needs a subject even before one is chosen. */
  const linkSymbol = symbol ?? 'AAPL'

  const choose = (s: string) => {
    setSymbol(s)
    setQuery('')
  }

  return (
    <div className="ft" data-seed="a08a840d">

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
              {/* The one generic entry point into the terminal, so it opens the
                  terminal itself — its Overview — rather than dropping the
                  reader onto whichever single instrument this band happens to
                  be showing. The symbol-specific links below still deep-link. */}
              <a className="ft-ghost" href={SCREENER_URL} target="_blank" rel="noopener noreferrer">
                See the terminal
              </a>
            </div>
          </div>

          {/* The product itself, as the hero's subject. This is the capture of
              the running terminal; replacing it is a one-line swap of src. */}
          <figure className="ft-hero-shot">
            <Image
              src="/terminal-hero.webp"
              width={1600}
              height={1000}
              alt="The Platizio terminal: a company's price and day's move beside its events calendar, newswire and analyst coverage on one page."
              /* Above the fold on every visit and this page's largest paint, so
                 it is never deferred. `priority` rather than eager loading:
                 eager only stops the deferral, while priority also emits the
                 preload link that lets the fetch start before the hero renders. */
              priority
              /* The hero is the wider half of a two-column grid inside a
                 1360px-capped container until it stacks at 1100px. */
              sizes="(max-width: 1100px) 92vw, 640px"
              decoding="async"
            />
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
              /*
                The tape. The list is rendered twice and the track travels -50%,
                so the seam lands exactly where the first copy began and the
                loop is invisible. The duplicate is aria-hidden — it is the same
                fourteen companies, and a screen reader should hear them once.

                Spacing lives on the item, never as `gap` on the track: N cells
                give N-1 gaps, so a gap makes the -50% land one gap short and
                the tape jumps that far once per cycle.
              */
              <div
                className="ft-tape"
                role="region"
                aria-label={`Top gainers today, ${gainers.length} companies`}
              >
                <ul className="ft-tape-track">
                  {[...gainers, ...gainers].map((g, i) => (
                    <li
                      className="ft-tape-item"
                      key={`${g.symbol}-${i}`}
                      aria-hidden={i >= gainers.length ? true : undefined}
                    >
                      <span className="ft-movers-sym">{g.symbol}</span>
                      <span className="ft-movers-px">${formatUsd(g.price)}</span>
                      <QuoteChange changePercent={g.changePercent} variant="chip" />
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* ----------------------------------------------------------- step 1 */}
      <section className="ft-step" id="pick">
        <div className="container">
          <header className="ft-head">
            <div className="ft-head-l">
              <h2 className="ft-h2">Pick a company you already know.</h2>
            </div>
            <p className="ft-body">
              You do not have to begin at a screener full of tickers. Begin at a name
              you already use, and the indicator beside them will quote it.
            </p>
          </header>

          <div className="ft-pick">
            {/* The eight are names, not quotes. A card that already shows its
                price answers the question before it is asked and gives the
                reader nothing to do; the price is what the click is for. */}
            <div className="ft-pick-names">
              <ul className="ft-names">
                {POPULAR_8.map((p) => {
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
                        <span className="ft-name-co">{p.name}</span>
                      </button>
                    </li>
                  )
                })}
              </ul>

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

            {/* The indicator. It is the only thing on this page that quotes a
                price, and it does it because the reader asked. */}
            <figure className="ft-ind" aria-live="polite">
              <figcaption className="ft-ind-chrome">
                <span className="ft-ind-dot" aria-hidden="true" />
                <span className="ft-ind-dot" aria-hidden="true" />
                <span className="ft-ind-dot" aria-hidden="true" />
                <span className="ft-ind-path">
                  platizio / equities{symbol ? ` / ${symbol}` : ''}
                </span>
                <span className={`ft-ind-live${symbol ? '' : ' is-idle'}`}>
                  <span aria-hidden="true" />
                  {!symbol ? 'Idle' : status === 'ready' ? 'Live' : status === 'loading' ? 'Loading' : 'No feed'}
                </span>
              </figcaption>

              {!symbol ? (
                <div className="ft-ind-idle">
                  <span className="ft-ind-idle-mark" aria-hidden="true">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M3 17l5.5-6 4 4L21 6" />
                      <path d="M15 6h6v6" />
                    </svg>
                  </span>
                  <p className="ft-ind-idle-t">Pick a company.</p>
                  <p className="ft-ind-idle-b">
                    Its live price and the day&rsquo;s move will appear here, quoted
                    from the same feed the terminal runs on.
                  </p>
                </div>
              ) : status === 'failed' || status === 'missing' ? (
                <div className="ft-ind-idle">
                  <p className="ft-ind-idle-t">
                    {status === 'missing'
                      ? `We cannot quote ${symbol} right now.`
                      : 'Live prices are unavailable at the moment.'}
                  </p>
                  <p className="ft-ind-idle-b">
                    {status === 'missing'
                      ? 'Pick another name.'
                      : 'The published schedule below does not depend on a price.'}
                  </p>
                </div>
              ) : (
                <div className={`ft-ind-body${status === 'loading' ? ' is-loading' : ''}`}>
                  <div className="ft-ind-id">
                    <BrandMark symbol={symbol} className="ft-ind-mark" />
                    <span>
                      <span className="ft-ind-co">{displayName}</span>
                      <span className="ft-ind-sym">{symbol}</span>
                    </span>
                  </div>

                  <div className="ft-ind-px">
                    <span className="ft-ind-cur">$</span>
                    <span className="ft-ind-fig">{quote ? formatUsd(quote.price) : '—'}</span>
                    {quote && <QuoteChange changePercent={quote.changePercent} variant="chip" />}
                  </div>

                  {/* The disclosure belongs to the price, so it sits under it
                      rather than after the action. */}
                  <div className="ft-ind-foot" aria-live="off">
                    <MarketNote asOf={asOf} delayed={delayed} />
                  </div>

                  {/* A real button on its own rule at the foot of the panel. As
                      a bare text link it read as a caption under the fine
                      print, which is the one thing this panel is for. */}
                  <a
                    className="ft-ind-go"
                    href={screenerInstrument(linkSymbol)}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Open {symbol} in the terminal
                    <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
                      <path
                        d="M3 8h9M8.5 4.5 12 8l-3.5 3.5"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </a>
                </div>
              )}
            </figure>
          </div>
        </div>
      </section>

      {/* ----------------------------------------------------------- step 2 */}
      <section className="ft-step" id="decide">
        <div className="container">
          <header className="ft-head">
            <div className="ft-head-l">
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
            <a className="ft-link" href={screenerInstrument(linkSymbol)} target="_blank" rel="noopener noreferrer">
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
              <h2 className="ft-h2">Know the whole cost, before you trade.</h2>
            </div>
            <p className="ft-body">
              The published schedule, in full. Not an example worked on one stock —
              the rates themselves, which is what you are actually agreeing to.
            </p>
          </header>

          <div className="ft-cost">
            <ul className="ft-charges">
              {TRADING_CHARGES.map((c) => (
                <li key={c.head}>
                  <span className="ft-charge-head">{c.head}</span>
                  <span className="ft-charge-val">{c.value}</span>
                  {c.note && <span className="ft-charge-note">{c.note}</span>}
                </li>
              ))}
            </ul>

            <p className="ft-cost-floor">
              Below about{' '}
              <strong>${formatUsd(RATES.brokerageMinUsd / RATES.brokeragePct, 0)}</strong> a
              trade, the ${RATES.brokerageMinUsd} minimum is larger than{' '}
              {pct(RATES.brokeragePct)} and becomes the cost that matters. Small
              first trades are proportionally the expensive ones.
            </p>

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
            FINRA is charged per share rather than per dollar, so it is stated on its
            own line rather than folded into a percentage — excluded and disclosed
            beats included and wrong. Rates as published {RATES.ratesAsOf}.{' '}
            <Link className="ft-link ft-link--inline" href="/pricing">
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
                <Link className="ft-link" href={l.to}>
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
            <h2 className="ft-h2">Open an account in an afternoon.</h2>
            <p className="ft-body">
              Opening costs nothing and closes nothing off. You can hold the terminal
              open beside it and keep reading before you buy anything at all.
            </p>
            <div className="ft-actions">
              <a className="ft-cta" href={TRADING_PLATFORM_URL} target="_blank" rel="noopener noreferrer">
                Open an account
              </a>
              <a className="ft-ghost" href={screenerInstrument(linkSymbol)} target="_blank" rel="noopener noreferrer">
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
