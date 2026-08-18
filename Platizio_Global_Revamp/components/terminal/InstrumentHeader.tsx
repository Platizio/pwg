import type { Quote } from '../../types/market'
import type { Instrument } from '../../data/terminalUniverse'
import { formatPrice } from '../../lib/format'
import Mark from './Mark'
import Change from './Change'

interface InstrumentHeaderProps {
  instrument: Instrument
  quote?: Quote
  /** True once the fetch has settled, so an absent quote means unavailable. */
  ready: boolean
  headingLevel?: 'h1' | 'h2'
}

/**
 * Monogram, name, listing, price, move.
 *
 * There is no "market open" indicator and no pulsing dot. The quotes are
 * delayed and we do not have a session-state feed, so either would be the
 * page claiming something it cannot know — Home's ticker band omits the same
 * dot for the same reason. The freshness claim lives in <MarketNote/>, once,
 * where it can be worded honestly.
 */
export default function InstrumentHeader({
  instrument, quote, ready, headingLevel = 'h1',
}: InstrumentHeaderProps) {
  const Heading = headingLevel

  return (
    <div className="m-head">
      <Mark symbol={instrument.symbol} size="lg" />

      <div className="m-head-id">
        <Heading className="m-head-name">{instrument.name}</Heading>
        <div className="m-head-ex">
          <span>{instrument.exchange}: {instrument.symbol}</span>
          <span className="m-dot" aria-hidden="true" />
          <span>{instrument.category}</span>
        </div>
      </div>

      <div className="m-head-figure">
        {quote ? (
          <>
            <div className="m-head-price">
              <span className="cur" aria-hidden="true">$</span>
              <span className="val">{formatPrice(quote.price)}</span>
              <span className="m-sr">US dollars</span>
            </div>
            <div className="m-head-move">
              <Change changePercent={quote.changePercent} size="lg" />
            </div>
          </>
        ) : ready ? (
          // Settled with nothing to show. Saying so beats a dash that reads
          // like a value, and beats a zero that would be a fabricated figure.
          <p className="m-absent">
            Price unavailable right now.
          </p>
        ) : (
          <>
            <div className="m-head-price">
              <span className="cur" aria-hidden="true">$</span>
              <span className="val is-loading-text is-load-price">000.00</span>
            </div>
            <div className="m-head-move">
              <span className="m-chg m-chg--lg is-loading-text is-load-chg">+0.00%</span>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
