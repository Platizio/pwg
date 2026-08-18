import type { Quote } from '../../types/market'
import type { Instrument } from '../../data/terminalUniverse'
import { formatPrice, formatChange } from '../../lib/format'
import MovePlot from './MovePlot'

interface OverviewPanelProps {
  instrument: Instrument
  quote?: Quote
  indexMoves: number[]
  ready: boolean
}

/**
 * What we can say about today, and nothing else.
 *
 * Four figures, every one of them either returned by the proxy or derived
 * from two that were. Previous close is `price - change`, which is
 * arithmetic on the payload rather than a second data source — the one
 * derivation on the page, and it is exact.
 *
 * There is no day range, no volume, no 52-week high: the quotes endpoint does
 * not return them, and a stock page that shows an empty "—" where every other
 * site shows a number teaches a visitor to distrust the numbers that ARE
 * there. Absent beats guessed, and absent beats blank.
 */
export default function OverviewPanel({ instrument, quote, indexMoves, ready }: OverviewPanelProps) {
  if (!quote) {
    return (
      <div className="m-block">
        <p className="m-prose">
          {ready
            ? 'Live prices are unavailable right now, so this panel has nothing honest to show. Everything else on this page is unaffected.'
            : 'Loading the tape…'}
        </p>
      </div>
    )
  }

  const previousClose = quote.price - quote.change

  return (
    <>
      <div className="m-block">
        <div className="m-stats">
          <div className="m-stat">
            <div className="m-stat-v">${formatPrice(quote.price)}</div>
            <div className="m-stat-l m-label">Last traded</div>
          </div>
          <div className="m-stat">
            <div className="m-stat-v">{formatChange(quote.change)}</div>
            <div className="m-stat-l m-label">Change today</div>
          </div>
          <div className="m-stat">
            <div className="m-stat-v">${formatPrice(previousClose)}</div>
            <div className="m-stat-l m-label">Previous close</div>
          </div>
          <div className="m-stat">
            <div className="m-stat-v">{quote.currency}</div>
            <div className="m-stat-l m-label">Quoted in</div>
          </div>
        </div>
      </div>

      {indexMoves.length > 0 && (
        <div className="m-group">
          <div className="m-panel-head">
            <span className="m-label m-label--accent">Today, against the index</span>
            <span className="m-label">Nasdaq-100 · {indexMoves.length} constituents</span>
          </div>
          <MovePlot
            symbol={instrument.symbol}
            self={quote.changePercent}
            moves={indexMoves}
            external={instrument.kind === 'etf'}
          />
        </div>
      )}
    </>
  )
}
