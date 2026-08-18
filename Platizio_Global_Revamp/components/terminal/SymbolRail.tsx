import { Link } from 'react-router-dom'
import type { Quote } from '../../types/market'
import { TERMINAL_UNIVERSE, terminalPath } from '../../data/terminalUniverse'
import Change from './Change'

interface SymbolRailProps {
  quotes: Map<string, Quote>
  /** False while the fetch is in flight, so a dash cannot be mistaken for it. */
  ready?: boolean
  /** Uppercase symbol of the instrument in view, if any. */
  current?: string
  /** Heading above the list. */
  title?: string
}

/**
 * Every instrument the terminal covers, as real links.
 *
 * This is the "click a stock" surface. Each row is an anchor to that symbol's
 * own prerendered page, so it works with a middle click, a long press, a
 * screen reader and JavaScript turned off — none of which a click handler on
 * a div would give.
 *
 * The row indent on hover and focus is the signature interaction of the whole
 * system, and it is keyboard-reachable by construction because the row IS the
 * focusable element.
 */
export default function SymbolRail({ quotes, current, ready = false, title = 'Instruments' }: SymbolRailProps) {
  const stocks = TERMINAL_UNIVERSE.filter((i) => i.kind === 'stock')
  const etfs = TERMINAL_UNIVERSE.filter((i) => i.kind === 'etf')

  const row = (symbol: string, name: string) => {
    const quote = quotes.get(symbol)
    return (
      <Link
        key={symbol}
        to={terminalPath(symbol)}
        className="m-srow"
        aria-current={symbol === current ? 'page' : undefined}
      >
        <span>
          <span className="m-srow-id">{symbol}</span>
          <span className="m-srow-name">{name}</span>
        </span>
        {quote ? (
          <Change changePercent={quote.changePercent} />
        ) : ready ? (
          // Unavailable rather than zero. A "0.00%" for a quote we never
          // received would be a figure the page invented.
          <span className="m-absent" aria-label="price unavailable">—</span>
        ) : (
          <span className="m-chg is-loading-text is-load-chg">+0.00%</span>
        )}
      </Link>
    )
  }

  return (
    <nav className="m-rail-left" aria-label={title}>
      <div className="m-rail-head">
        <span className="m-label m-label--accent">{title}</span>
        <span className="m-label">24H</span>
      </div>
      <div className="m-rail-list">{stocks.map((i) => row(i.symbol, i.name))}</div>
      <div className="m-rail-head m-rail-group">
        <span className="m-label m-label--accent">Funds</span>
      </div>
      <div className="m-rail-list">{etfs.map((i) => row(i.symbol, i.name))}</div>
    </nav>
  )
}
