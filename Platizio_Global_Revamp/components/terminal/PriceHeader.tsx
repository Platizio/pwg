import type { Quote } from '../../types/market'
import { formatPrice, formatPercent, direction } from '../../lib/format'
import RangeChips from './RangeChips'

interface PriceHeaderProps {
  quote: Quote
  delayed: boolean
  range: string
  onRange: (id: string) => void
  showVolume: boolean
  onToggleVolume: () => void
}

/**
 * The price, at the scale a terminal gives it.
 *
 * The label, the figure, the move in a bordered chip and the feed's state on
 * the left; the chart's own controls on the right. The source design puts a
 * pulsing dot beside "Market open" here — ours says what is actually true of
 * our feed, and does not pulse, because a pulse is the standard shorthand for
 * live and these quotes are delayed.
 */
export default function PriceHeader({
  quote, delayed, range, onRange, showVolume, onToggleVolume,
}: PriceHeaderProps) {
  const dir = direction(quote.changePercent)

  return (
    <div className="m-price-head">
      <div>
        <p className="m-label m-label--accent">Last traded price · {quote.currency}</p>
        <div className="m-price-row">
          <p className="m-price">
            <span className="cur" aria-hidden="true">$</span>
            <span className="val">{formatPrice(quote.price)}</span>
          </p>
          <span className={`m-price-chip is-${dir}`}>{formatPercent(quote.changePercent)}</span>
          <span className="m-price-state">
            <span className="m-dot" aria-hidden="true" />
            {delayed ? 'Delayed quote' : 'Live quote'}
          </span>
        </div>
      </div>

      <div className="m-price-controls">
        <button
          type="button"
          className="m-vol-toggle"
          aria-pressed={showVolume}
          onClick={onToggleVolume}
        >
          <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
            <rect x="1" y="9" width="2.5" height="6" fill="currentColor" />
            <rect x="5.5" y="5" width="2.5" height="10" fill="currentColor" />
            <rect x="10" y="7" width="2.5" height="8" fill="currentColor" />
          </svg>
          VOL
        </button>
        <RangeChips active={range} onChange={onRange} />
      </div>
    </div>
  )
}
