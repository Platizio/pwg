import { Link } from 'react-router-dom'
import type { Quote } from '../../types/market'
import { formatPrice } from '../../lib/format'
import { findInstrument, terminalPath } from '../../data/terminalUniverse'
import { Plate, Delta } from './Surface'

/**
 * One instrument, as a row.
 *
 * A row for an instrument we cover is a link to its own page; one for an
 * index constituent we merely quote is not, because a link to a page that
 * does not exist is worse than no link.
 */
export default function InstrumentRow({ quote }: { quote: Quote }) {
  const covered = findInstrument(quote.symbol)

  const inner = (
    <>
      <Plate symbol={quote.symbol} />
      {/* normalise() falls back to the symbol when the upstream sends no
          companyName, so a row would otherwise print the ticker twice. */}
      <span className="irow-id">
        <span className="irow-name">{quote.name}</span>
        {quote.name !== quote.symbol && <span className="irow-sym">{quote.symbol}</span>}
      </span>
      <span className="irow-fig">
        <span className="irow-px">{formatPrice(quote.price)}</span>
        <Delta value={quote.changePercent} />
      </span>
    </>
  )

  return covered
    ? <Link className="irow is-link" to={terminalPath(quote.symbol)}>{inner}</Link>
    : <div className="irow">{inner}</div>
}
