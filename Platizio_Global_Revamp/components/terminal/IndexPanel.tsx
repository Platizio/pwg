import { Link } from 'react-router-dom'
import type { Quote } from '../../types/market'
import { formatPrice } from '../../lib/format'
import { findInstrument, terminalPath } from '../../data/terminalUniverse'
import Change from './Change'

interface IndexPanelProps {
  leaders: Quote[]
  /** Uppercase symbol of the instrument in view, tinted in the table. */
  current: string
  ready: boolean
}

/**
 * Today's largest moves in the Nasdaq-100.
 *
 * The same ranking Home's banner uses — one definition of "biggest movers"
 * across the site, computed once in buildPayload and reused here rather than
 * sorted a second time with a subtly different rule.
 *
 * Rows for instruments the terminal covers are links; the rest are plain,
 * because a link to a page that does not exist is worse than no link.
 */
export default function IndexPanel({ leaders, current, ready }: IndexPanelProps) {
  if (!leaders.length) {
    return (
      <p className="m-prose">
        {ready
          ? 'The index ranking is unavailable right now.'
          : 'Loading the index…'}
      </p>
    )
  }

  return (
    <div className="m-block">
      <div className="m-panel-head">
        <span className="m-label m-label--accent">Largest moves today</span>
        <span className="m-label">Nasdaq-100 · by absolute change</span>
      </div>

      <div className="m-table m-table--peers">
        <div className="m-thead">
          <span className="m-label">Symbol</span>
          <span className="m-label">Company</span>
          <span className="m-label m-th-num">Last</span>
          <span className="m-label m-th-num">Change</span>
        </div>
        {leaders.map((quote) => {
          const covered = findInstrument(quote.symbol)
          const isSelf = quote.symbol === current
          const cells = (
            <>
              <span className="m-srow-id">{quote.symbol}</span>
              <span className="m-tname">{quote.name === quote.symbol ? '' : quote.name}</span>
              <span className="m-tnum">${formatPrice(quote.price)}</span>
              <span className="m-td-end">
                <Change changePercent={quote.changePercent} />
              </span>
            </>
          )
          return covered ? (
            <Link
              key={quote.symbol}
              to={terminalPath(quote.symbol)}
              className={`m-trow is-link${isSelf ? ' is-self' : ''}`}
              aria-current={isSelf ? 'page' : undefined}
            >
              {cells}
            </Link>
          ) : (
            <div key={quote.symbol} className={`m-trow${isSelf ? ' is-self' : ''}`}>{cells}</div>
          )
        })}
      </div>

      <p className="m-kv-note">
        Ranked on absolute change, so a fall is as much a mover as a rise. The universe is
        the Nasdaq-100, not the whole market — our data provider has no market-wide ranking
        endpoint, and a list labelled "the market" that was really one index would be
        untrue.
      </p>
    </div>
  )
}
