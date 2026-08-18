import { useState } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import SEO, { breadcrumbSchema } from '../../src/components/SEO'
import NotFound from '../../src/pages/NotFound'
import { findInstrument, terminalPath } from '../data/terminalUniverse'
import { useTerminalData } from '../hooks/useTerminalData'
import MarketNote from '../components/MarketNote'
import TickerTape from '../components/terminal/TickerTape'
import SymbolRail from '../components/terminal/SymbolRail'
import InstrumentHeader from '../components/terminal/InstrumentHeader'
import TabBar, { type TabDef } from '../components/terminal/TabBar'
import OverviewPanel from '../components/terminal/OverviewPanel'
import FundamentalsPanel from '../components/terminal/FundamentalsPanel'
import TechnicalsPanel from '../components/terminal/TechnicalsPanel'
import CompetitorsPanel from '../components/terminal/CompetitorsPanel'
import HoldingsPanel from '../components/terminal/HoldingsPanel'
import CostPanel from '../components/terminal/CostPanel'
import RulesPanel from '../components/terminal/RulesPanel'
import IndexPanel from '../components/terminal/IndexPanel'
import ContextRail from '../components/terminal/ContextRail'

/* The source design's five, plus the two only this site can answer. */
const TABS: readonly TabDef[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'fundamentals', label: 'Fundamentals' },
  { id: 'technicals', label: 'Technicals' },
  { id: 'competitors', label: 'Competitors' },
  { id: 'holdings', label: 'Holdings' },
  { id: 'cost', label: 'Cost to buy' },
  { id: 'rules', label: 'Tax & rules' },
  { id: 'index', label: 'The index' },
]

/**
 * One instrument, in the terminal's world.
 *
 * The page is built around what our data actually supports. ViewTrade gives us
 * a delayed quote and nothing else — no fundamentals, no history, no ownership
 * (docs/03-viewtrade-api.md). Rather than fill a stock-page template with
 * invented figures, the four tabs answer the questions a first-time Indian
 * investor genuinely has: how big is this move, what does the trade cost me,
 * what tax applies, and where does it sit in the index.
 *
 * There is no order ticket. The source design this world came from shipped a
 * simulated BUY/SELL desk with a fictional cash balance; a regulated
 * intermediary must not put a fake trade button on a public page, so the one
 * gold CTA goes to the real platform instead.
 */
export default function Terminal() {
  const { symbol } = useParams<{ symbol: string }>()
  const instrument = findInstrument(symbol)
  // Hooks run unconditionally — the early returns below come after them.
  const { quotes, indexMoves, indexLeaders, asOf, delayed, ready } = useTerminalData()
  const [tab, setTab] = useState('overview')

  if (!instrument) return <NotFound />

  // One canonical casing. /terminal/AAPL redirects to /terminal/aapl rather
  // than serving the same page at two URLs, which would split its ranking.
  if (symbol !== instrument.symbol.toLowerCase()) {
    return <Navigate to={terminalPath(instrument.symbol)} replace />
  }

  const quote = quotes.get(instrument.symbol)
  const path = terminalPath(instrument.symbol)
  const kind = instrument.kind === 'etf' ? 'ETF' : 'share'

  return (
    <>
      <SEO
        title={`${instrument.symbol} ${kind} price — ${instrument.name}, and what it costs from India`}
        description={`${instrument.name} (${instrument.exchange}: ${instrument.symbol}) delayed price and today's move against the Nasdaq-100, plus the all-in trade cost, the tax and the LRS rules for buying it from India.`}
        canonical={path}
        jsonLd={breadcrumbSchema([
          ['Home', '/'],
          ['Products', '/products'],
          [instrument.symbol, path],
        ])}
      />

      <div className="meridian terminal">
        <div className="m-shell">
          <TickerTape quotes={quotes} />

          <SymbolRail quotes={quotes} current={instrument.symbol} ready={ready} />

          <div className="m-col">
            <nav className="m-crumb" aria-label="Breadcrumb">
              <Link to="/">Home</Link>
              <span className="sep" aria-hidden="true">/</span>
              <Link to="/products">Products</Link>
              <span className="sep" aria-hidden="true">/</span>
              <span aria-current="page">{instrument.symbol}</span>
            </nav>

            <InstrumentHeader instrument={instrument} quote={quote} ready={ready} />

            <TabBar tabs={TABS} active={tab} onChange={setTab} idPrefix="terminal" />

            <div
              className="m-panel"
              role="tabpanel"
              id={`terminal-panel-${tab}`}
              aria-labelledby={`terminal-tab-${tab}`}
              tabIndex={-1}
            >
              {tab === 'overview' && (
                <OverviewPanel
                  instrument={instrument}
                  quote={quote}
                  indexMoves={indexMoves}
                  ready={ready}
                />
              )}
              {tab === 'fundamentals' && <FundamentalsPanel instrument={instrument} />}
              {tab === 'technicals' && <TechnicalsPanel instrument={instrument} quote={quote} />}
              {tab === 'competitors' && <CompetitorsPanel instrument={instrument} quote={quote} />}
              {tab === 'holdings' && <HoldingsPanel instrument={instrument} />}
              {tab === 'cost' && (
                <CostPanel instrument={instrument} quote={quote} ready={ready} />
              )}
              {tab === 'rules' && <RulesPanel instrument={instrument} />}
              {tab === 'index' && (
                <IndexPanel leaders={indexLeaders} current={instrument.symbol} ready={ready} />
              )}
            </div>

            <MarketNote asOf={asOf} delayed={delayed} tone="dark" />
          </div>

          <ContextRail instrument={instrument} />
        </div>
      </div>
    </>
  )
}
