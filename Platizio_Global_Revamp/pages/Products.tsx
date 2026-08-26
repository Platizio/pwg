/*
 * DIRECTION CONTRACT — seed a08a840d (surface roll, persuade, assigned index 6)
 *
 * THESIS: This page is the first purchase, walked end to end. It refuses the
 * category default — hero screenshot, feature grid, pricing table, CTA — and
 * equally refuses its opposite, the austere spec sheet, which the previous
 * build shipped. Neither answers the only question our reader actually has.
 *
 * OWN-WORLD: Meridian, pinned by the user from Meridian Home.dc.html — near
 * black #080706 ground, one gold #D9BD8B, Instrument Serif over Manrope over
 * IBM Plex Mono, square corners, hairline rules, grain, and small heavily
 * tracked capitals doing the labelling a light page would do with weight. This
 * replaces the site's light world ON THIS ROUTE ONLY: every rule is scoped to
 * .ft or .chrome-dark and :root is untouched, so Home, Pricing and About keep
 * their identity and the terminal keeps its own .meridian sheets.
 *
 * STORY: A reader in India who has never bought a US stock arrives unsure it
 * is even allowed. They learn it is, in the first viewport. Then they walk the
 * trade: pick a company they already know, watch it quote live, see what the
 * terminal would tell them about it, see the entire cost of buying it, and see
 * what they will owe later. They open an account because nothing is left
 * unknown.
 *
 * FIRST VIEWPORT: Headline left, the permission fact answered immediately
 * beneath it as a stated rule, the primary action under that. Right of it, the
 * whole five-stop route, visible at once, so the process has a known length.
 *
 * FORM: The guided first trade — candidate 6 of the grounded list, assigned by
 * the roll. The route's see-it-all-at-once topology is taken from the dealt
 * guide-map challenger; its palette and character are not.
 *
 * FINISH: unreviewed and undocumented is unfinished; this build ends with the
 * finish review, the verdict, and DESIGN.md
 */

import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { TRADING_PLATFORM_URL, screenerInstrument } from '../../src/constants'
import { POPULAR_8, LARGE_CAP_SAMPLE } from '../data/marketUniverse'
import { RATES, FREE_ITEMS, pct } from '../data/pricingRates'
import { calculateTradeCost, formatUsd } from '../lib/pricing'
import { useQuoteLookup } from '../hooks/useQuoteLookup'
import { useGainers } from '../hooks/useGainers'
import TrendingBanner from '../components/TrendingBanner'
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
const SEES = [
  {
    src: '/shot-register.webp',
    /* The wide capture's type is unreadable once it is scaled to a phone, so a
       narrower crop of the same region is served below the stacking breakpoint. */
    narrow: '/shot-register-narrow.webp',
    w: 952,
    h: 440,
    title: 'Where it stands',
    body: 'The price, the day, and the company beside every other name we quote — so a move means something instead of floating on its own.',
    alt: 'The terminal’s index register: a level of 767.38, up 0.51% on the day, beside a breadth bar counting 288 companies up against 182 down.',
  },
  {
    src: '/shot-events-2.webp',
    narrow: null,
    w: 328,
    h: 264,
    title: 'What is coming',
    body: 'The dates that are already known — dividends, splits, earnings — on one calendar, because most of what moves a price is scheduled well before it happens.',
    alt: 'The terminal’s event calendar, listing ex-dividend dates for Union Pacific, Goldman Sachs, Lockheed Martin and McDonald’s over the coming week.',
  },
  {
    src: '/shot-wire-2.webp',
    narrow: null,
    w: 328,
    h: 176,
    title: 'What was said',
    body: 'The newswire filtered to this company alone, so you are reading about the thing you are considering rather than the market in general.',
    alt: 'A newswire entry filed against NVDA seven hours ago, headlined on what CEOs calling a bottom have historically signalled.',
  },
  {
    /*
     * Stated, not illustrated.
     *
     * The terminal does carry analyst coverage — screener/lib/api/clients/
     * analysts.ts — but no capture of that panel exists, and the crop that
     * was standing here showed the gainers and losers boards instead. An
     * image that disproves its own caption is worse than no image, so this
     * one row makes its claim in words and sends the reader to the panel.
     */
    src: null,
    narrow: null,
    w: 0,
    h: 0,
    title: 'Who covers it',
    body: 'Analyst coverage collected in one place — the ratings, the targets, and how many desks are actually publishing on the name — so a number has a source you can weigh.',
    alt: '',
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

  const { quote, status, asOf, delayed } = useQuoteLookup(symbol)
  const { gainers, basis, asOf: gainersAsOf, delayed: gainersDelayed } = useGainers()

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
      {/* Meridian's grain. Decorative, non-interactive, and it never covers a
          control — the page sets every section above it. */}
      <svg className="ft-grain" aria-hidden="true" focusable="false">
        <filter id="ft-grain-f">
          <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves={3} stitchTiles="stitch" />
        </filter>
        <rect width="100%" height="100%" filter="url(#ft-grain-f)" />
      </svg>

      {/* ---------------------------------------------------------- opening */}
      <section className="ft-open">
        <div className="container">
          <p className="ft-mark">
            <span className="ft-mark-dot" aria-hidden="true" />
            <span className="ft-label">US equities &amp; ETFs · for residents of India</span>
          </p>

          <div className="ft-open-inner">
            <div className="ft-open-copy">
              <h1 className="ft-h1">
                Owning US stock from India,
                <em> start to finish.</em>
              </h1>

              {/* The permission answer, before anything else. It is the question
                  a first-time buyer actually arrives with. */}
              <p className="ft-permit">
                <strong>You are allowed to.</strong> The Reserve Bank&rsquo;s Liberalised
                Remittance Scheme lets a resident individual send up to{' '}
                <span className="ft-fig">$250,000</span> abroad each financial year,
                investment included. It is an ordinary, declared route — not a loophole.
              </p>

              <p className="ft-lede">
                Below is the whole of it: what you pick, what you get to decide with,
                what the trade costs, and what you owe afterwards. Five steps, and
                nothing after them that you have not already seen.
              </p>

              <div className="ft-actions">
                <a
                  className="ft-cta"
                  href={TRADING_PLATFORM_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Open an account
                </a>
                <a
                  className="ft-ghost"
                  href={screenerInstrument(symbol)}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  See the terminal
                </a>
              </div>
            </div>

            {/* The route, whole, so the process has a known length. */}
            <nav className="ft-route" aria-label="The five steps on this page">
              <ol>
                {ROUTE.map((r) => (
                  <li key={r.id}>
                    <a href={`#${r.id}`}>
                      <span className="ft-route-n">{`0${r.n}`}</span>
                      <span className="ft-route-label">{r.label}</span>
                    </a>
                  </li>
                ))}
              </ol>
            </nav>
          </div>
        </div>
      </section>

      <TrendingBanner
        quotes={gainers}
        label="Rising today"
        scope={basis ?? undefined}
        asOf={gainersAsOf}
        delayed={gainersDelayed}
      />

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
            <div className="ft-pick-controls">
              <ul className="ft-chips">
                {POPULAR_8.map((p) => (
                  <li key={p.symbol}>
                    <button
                      type="button"
                      className={`ft-chip${p.symbol === symbol ? ' is-on' : ''}`}
                      aria-pressed={p.symbol === symbol}
                      onClick={() => choose(p.symbol)}
                    >
                      {p.name}
                    </button>
                  </li>
                ))}
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

            {/* The live answer, in Meridian's terminal-preview idiom. */}
            <figure className="ft-quote" aria-live="polite">
              <figcaption className="ft-quote-head">
                <span className="ft-quote-dot" aria-hidden="true" />
                <span className="ft-quote-dot" aria-hidden="true" />
                <span className="ft-quote-dot" aria-hidden="true" />
                <span className="ft-quote-path">platizio / equities / {symbol}</span>
                <span className="ft-quote-live">
                  <span aria-hidden="true" />
                  {status === 'ready' ? 'Live' : status === 'loading' ? 'Loading' : 'No feed'}
                </span>
              </figcaption>

              {status === 'failed' || status === 'missing' ? (
                /* The recovery has to match the failure. Telling a reader to pick
                   another name is useful when this one symbol will not quote, and
                   useless when the whole feed is down. */
                <div className="ft-quote-empty">
                  <p>
                    {status === 'missing'
                      ? `We cannot quote ${symbol} right now.`
                      : 'Live prices are unavailable at the moment.'}
                  </p>
                  <p className="ft-quote-empty-note">
                    {status === 'missing'
                      ? 'Pick another name above.'
                      : 'Everything else on this page still applies — the schedule below does not depend on a price.'}
                  </p>
                </div>
              ) : (
                <>
                  <div className={`ft-quote-body${status === 'loading' ? ' is-loading' : ''}`}>
                    <span className="ft-quote-mark" aria-hidden="true">{symbol.charAt(0)}</span>
                    <span>
                      <span className="ft-quote-name">{displayName}</span>
                      <span className="ft-quote-sym">{symbol}</span>
                    </span>
                    <span className="ft-quote-figure">
                      <span className="ft-quote-price">
                        <span className="ft-cur">$</span>
                        {quote ? formatUsd(quote.price) : '—'}
                      </span>
                      {/* `chip`, not `inline`: the inline variant is coloured for the
                          site's navy band, and this plate restyles the chip anyway. */}
                      {quote && <QuoteChange changePercent={quote.changePercent} variant="chip" />}
                    </span>
                  </div>
                  {/* Outside the live region: the disclosure is boilerplate that does
                      not change with the reader's choice, and announcing it after
                      every pick buries the price it is attached to. */}
                  <div className="ft-quote-foot" aria-live="off">
                    <MarketNote asOf={asOf} delayed={delayed} />
                  </div>
                </>
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
              <span className="ft-label">02 — the evidence</span>
              <h2 className="ft-h2">See more than a price.</h2>
            </div>
            <p className="ft-body">
              A price tells you what {picked} costs. It does not tell you whether to
              buy it. Below is what the terminal holds on the name you just picked —
              the same four things, for all five hundred.
            </p>
          </header>

          <div className="ft-sees">
            {SEES.map((s) => (
              <article className={`ft-see${s.src ? '' : ' is-stated'}`} key={s.title}>
                <div className="ft-see-copy">
                  <h3>{s.title}</h3>
                  <p>{s.body}</p>
                </div>
                {s.src && (
                  <picture className="ft-see-frame">
                    {s.narrow && <source media="(max-width: 620px)" srcSet={s.narrow} />}
                    <img
                      className="ft-see-shot"
                      src={s.src}
                      width={s.w}
                      height={s.h}
                      loading="lazy"
                      decoding="async"
                      alt={s.alt}
                    />
                  </picture>
                )}
              </article>
            ))}
          </div>

          <p className="ft-see-go">
            <a
              className="ft-link"
              href={screenerInstrument(symbol)}
              target="_blank"
              rel="noopener noreferrer"
            >
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
            <div className="ft-cost-input">
              <label htmlFor="ft-qty">Shares of {symbol}</label>
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

              {/* Derived, never restated: the trade value at which the flat
                  minimum stops being the binding cost. It is the one number that
                  actually decides how small a first trade should be. */}
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
                  <span>{f.label}</span>
                  <span className="ft-free-v">{f.value}</span>
                </li>
              ))}
            </ul>
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
              <a
                className="ft-cta"
                href={TRADING_PLATFORM_URL}
                target="_blank"
                rel="noopener noreferrer"
              >
                Open an account
              </a>
              <a
                className="ft-ghost"
                href={screenerInstrument(symbol)}
                target="_blank"
                rel="noopener noreferrer"
              >
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
