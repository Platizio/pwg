import { Link } from 'react-router-dom'
import type { Instrument } from '../../data/terminalUniverse'
import { NOTABLE_MOVES } from '../../lib/profile'
import Sparkline from './Sparkline'

interface ContextRailProps { instrument: Instrument }

/**
 * The reference rail: what it is, how it has moved, what to read.
 *
 * The source design's three blocks, in order. Its third is a newswire of
 * headlines; a regulated intermediary must not print invented news, so that
 * slot carries Platizio's own guides in the same composition — plate, tag,
 * source, headline, age — which is real content in the shape the design
 * expects.
 */

const GUIDES = [
  { to: '/articles/how-to-invest-in-us-stocks-from-india', tag: 'Getting started', title: 'How to invest in US stocks from India: a step-by-step guide', age: 'Guide' },
  { to: '/articles/tax-on-us-stocks-in-india', tag: 'Taxation', title: 'Tax on US stocks in India: capital gains, dividends and reporting', age: 'Guide' },
  { to: '/articles/tcs-on-lrs-explained', tag: 'Compliance', title: 'TCS on LRS remittances: 20% above ₹10 lakh, and how to get it back', age: 'Guide' },
]

const FUND_GUIDES = [
  { to: '/articles/best-us-etfs-for-indian-investors', tag: 'Funds', title: 'How to evaluate US ETFs: expense ratio, liquidity and tracking', age: 'Guide' },
  { to: '/articles/etf-vs-index-fund-vs-mutual-fund', tag: 'Funds', title: 'ETF vs index fund vs mutual fund, for an Indian investor', age: 'Guide' },
  { to: '/articles/how-to-invest-in-sp500-from-india', tag: 'Routes', title: 'Three routes to the S&P 500, and what each one costs in tax', age: 'Guide' },
]

export default function ContextRail({ instrument }: ContextRailProps) {
  const guides = instrument.kind === 'etf' ? FUND_GUIDES : GUIDES

  return (
    <aside className="m-rail-right" aria-label="About this instrument">
      <section>
        <header className="m-rail-h">
          <h3 className="m-h3">About</h3>
          <Link className="m-caps" to="/products">See more</Link>
        </header>
        {/* The drop cap is decoration: the paragraph keeps its full text so a
            screen reader gets an unbroken sentence, and only the rendered
            first letter is styled, via ::first-letter. */}
        <p className="m-about">{instrument.about}</p>
        <div className="m-about-links">
          <Link className="m-caps" to="/products">Products</Link>
          <Link className="m-caps" to="/pricing">Charges</Link>
        </div>
      </section>

      <section>
        <header className="m-rail-h">
          <h3 className="m-h3">Notable moves</h3>
          <span className="m-label">Reference</span>
        </header>
        <ul className="m-moves">
          {NOTABLE_MOVES.map((m) => (
            <li className="m-move" key={m.date}>
              <span className="m-move-when">
                <span className="m-label">Date</span>
                <span className="m-move-date">{m.date}</span>
              </span>
              <span className={`m-move-chg is-${m.change >= 0 ? 'up' : 'down'}`}>
                {m.change >= 0 ? '+' : ''}{m.change.toFixed(2)}%
              </span>
              <Sparkline symbol={`${instrument.symbol}${m.date}`} changePercent={m.change} width={52} height={22} />
            </li>
          ))}
        </ul>
      </section>

      <section>
        <header className="m-rail-h">
          <h3 className="m-h3">Before you buy</h3>
          <Link className="m-caps" to="/articles">See more</Link>
        </header>
        <ul className="m-wire">
          {guides.map((g) => (
            <li key={g.to}>
              <Link className="m-wire-item" to={g.to}>
                <span className="m-wire-plate" aria-hidden="true">
                  <span className="m-wire-tag">{g.tag}</span>
                </span>
                <span className="m-wire-src">platizioglobal.com</span>
                <span className="m-wire-title">{g.title}</span>
                <span className="m-wire-age">{g.age}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </aside>
  )
}
