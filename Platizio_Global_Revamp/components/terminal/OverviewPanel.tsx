import { useState } from 'react'
import type { Quote } from '../../types/market'
import type { Instrument } from '../../data/terminalUniverse'
import { profileOf } from '../../data/instrumentProfile'
import { shapeSeries, seedOf } from '../../lib/plot'
import { dayStats } from '../../lib/profile'
import PriceHeader from './PriceHeader'
import PriceChart from './PriceChart'
import InsightsPanel from './InsightsPanel'
import ReturnsPanel from './ReturnsPanel'
import MovePlot from './MovePlot'

interface OverviewPanelProps {
  instrument: Instrument
  quote?: Quote
  indexMoves: number[]
  delayed: boolean
  ready: boolean
}

/**
 * Price, chart, the day in five figures, then what it means.
 *
 * The composition is the source design's: the traded price set large with its
 * move in a bordered chip and the chart's controls opposite; the plot; the
 * ruled strip of five intraday figures; then insights numbered rather than
 * iconified, beside trailing returns as meters.
 *
 * The strip reads off the SAME series the plot draws, so the two can never
 * disagree — the source computes them separately and this does not.
 */
export default function OverviewPanel({
  instrument, quote, indexMoves, delayed, ready,
}: OverviewPanelProps) {
  const [range, setRange] = useState('1D')
  const [showVolume, setShowVolume] = useState(true)

  if (!quote) {
    return (
      <p className="m-prose">
        {ready
          ? 'Live prices are unavailable right now, so this panel has nothing honest to show. Everything else on this page is unaffected.'
          : 'Loading the tape…'}
      </p>
    )
  }

  const previousClose = quote.price - quote.change
  const values = shapeSeries(seedOf(instrument.symbol), 170, previousClose, quote.price)
  const stats = dayStats(values, previousClose, quote.price)
  const profile = profileOf(instrument.symbol)

  return (
    <>
      <PriceHeader
        quote={quote}
        delayed={delayed}
        range={range}
        onRange={setRange}
        showVolume={showVolume}
        onToggleVolume={() => setShowVolume((v) => !v)}
      />

      <PriceChart
        symbol={instrument.symbol}
        price={quote.price}
        previousClose={previousClose}
        changePercent={quote.changePercent}
        height={264}
        showVolume={showVolume}
      />

      {/* A ruled strip, not five cards. */}
      <dl className="m-day">
        {stats.map((s) => (
          <div className="m-day-cell" key={s.label}>
            <dt className="m-label">{s.label}</dt>
            <dd className="m-day-v">{s.value}</dd>
          </div>
        ))}
      </dl>

      <p className="m-illus">
        Last traded and previous close are live delayed quotes, and the line runs between
        them. The open, high and low are read off the drawn session — our data provider
        exposes no intraday history, so that path is an illustrative shape rather than the
        tape, and it is labelled here rather than left to be assumed.
      </p>

      <div className="m-split">
        <section>
          <div className="m-panel-head">
            <h3 className="m-h3">Insights</h3>
            <span className="m-label">Reference</span>
          </div>
          {profile
            ? <InsightsPanel insights={profile.insights} />
            : <p className="m-prose">No reference profile for this instrument yet.</p>}
        </section>

        <section>
          <div className="m-panel-head">
            <h3 className="m-h3">Returns</h3>
            <span className="m-label">Scaled from today</span>
          </div>
          <ReturnsPanel changePercent={quote.changePercent} />
        </section>
      </div>

      {indexMoves.length > 0 && (
        <div className="m-group">
          <div className="m-panel-head">
            <h3 className="m-h3">Today, against the index</h3>
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
