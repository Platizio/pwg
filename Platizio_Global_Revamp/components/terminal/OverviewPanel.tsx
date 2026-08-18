import { useState } from 'react'
import type { Quote } from '../../types/market'
import type { Instrument } from '../../data/terminalUniverse'
import { formatPrice, formatChange } from '../../lib/format'
import PriceChart from './PriceChart'
import RangeChips from './RangeChips'
import MovePlot from './MovePlot'

interface OverviewPanelProps {
  instrument: Instrument
  quote?: Quote
  indexMoves: number[]
  ready: boolean
}

/**
 * The session, then the day.
 *
 * The chart leads, because that is what a terminal is: a price ladder,
 * hairline gridlines, the dashed previous-close reference, the area under the
 * line, a volume histogram and the session times. Both ends of the line are
 * live — it opens at the previous close and closes at the last traded price —
 * and the four figures beneath it come straight from the quote. The path
 * between the ends is an illustrative shape, said in words directly under it,
 * because our provider has no intraday endpoint.
 *
 * Beneath it sits the thing a US terminal never shows: where that move
 * actually sits among the whole index today. It needs no history at all, and
 * it answers the question the chart cannot — is this ordinary, or is it not.
 */
export default function OverviewPanel({ instrument, quote, indexMoves, ready }: OverviewPanelProps) {
  const [range, setRange] = useState('1D')

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
        <div className="m-chart-bar">
          <span className="m-label m-label--accent">Session</span>
          <RangeChips active={range} onChange={setRange} />
        </div>

        <PriceChart
          symbol={instrument.symbol}
          price={quote.price}
          previousClose={previousClose}
          changePercent={quote.changePercent}
          height={252}
        />

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

        <p className="m-illus">
          Last traded, change and previous close are live delayed quotes, and the line
          runs between the last two of them. The intraday path itself is an illustrative
          shape — our data provider exposes no intraday history, and drawing an invented
          one without saying so is the one thing this page is built not to do.
        </p>
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
