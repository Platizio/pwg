import type { Quote } from '../../types/market'
import { TERMINAL_UNIVERSE } from '../../data/terminalUniverse'
import { formatPrice, formatPercent, direction } from '../../lib/format'

interface TickerTapeProps {
  quotes: Map<string, Quote>
}

/**
 * The tape across the top of the terminal.
 *
 * aria-hidden on purpose. Every symbol on it also sits in the symbol rail
 * below, as a real link with a real label — and an infinitely scrolling,
 * deliberately duplicated list is hostile to a screen reader for no
 * information gain. Hiding the decorative copy is the accessible choice here,
 * not a shortcut around one.
 *
 * The list is rendered twice and the track translates -50%, so the loop is
 * seamless. Spacing lives on the item rather than as a flex `gap`: N items
 * produce N-1 gaps, so a gap would make the -50% jump by one gap every cycle.
 */
export default function TickerTape({ quotes }: TickerTapeProps) {
  const items = TERMINAL_UNIVERSE.map((i) => ({ instrument: i, quote: quotes.get(i.symbol) }))
  // Doubling in markup rather than with CSS so the width the animation
  // translates against is exactly the width of one pass.
  const doubled = [...items, ...items]

  return (
    <div className="m-tape" aria-hidden="true">
      <div className="m-tape-track">
        {doubled.map(({ instrument, quote }, i) => (
          <div className="m-tape-item" key={`${instrument.symbol}-${i}`}>
            <span>{instrument.symbol}</span>
            {quote ? (
              <>
                <b>{formatPrice(quote.price)}</b>
                <span className={`m-tape-chg is-${direction(quote.changePercent)}`}>
                  {formatPercent(quote.changePercent)}
                </span>
              </>
            ) : (
              <>
                {/* The same element wearing a shimmer, so the tape is the
                    right width before data lands and never re-flows. */}
                <b className="is-loading-text is-load-price">000.00</b>
                <span className="is-loading-text is-load-chg">+0.00%</span>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
