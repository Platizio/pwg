import { useState } from 'react'
import { Link } from 'react-router-dom'
import type { Quote } from '../../types/market'
import type { Instrument } from '../../data/terminalUniverse'
import { calculateTradeCost, formatUsd, formatPct } from '../../lib/pricing'
import { RATES, pct } from '../../data/pricingRates'
import { ArrowRight } from './Icons'

interface CostPanelProps {
  instrument: Instrument
  quote?: Quote
  ready: boolean
}

const PRESETS = [1, 5, 10, 25]

/**
 * What buying this actually costs.
 *
 * The one thing a stock page can tell an Indian investor that a US terminal
 * cannot, and every figure comes from the same `calculateTradeCost` the
 * Pricing page's calculator uses against the same `pricingRates.ts`. No rate
 * is restated here — a second statement of 0.29% three files away from the
 * first is exactly how a rate change goes half-applied.
 *
 * FINRA is absent from the total on purpose, as it is on Pricing: it is
 * charged per share on the sell side, so a buy-side value cannot compute it.
 * Excluded and disclosed beats included and wrong.
 */
export default function CostPanel({ instrument, quote, ready }: CostPanelProps) {
  const [qty, setQty] = useState(1)

  if (!quote) {
    return (
      <p className="m-prose">
        {ready
          ? 'This works out the all-in cost from the live price, so it needs a price. Prices are unavailable right now — the schedule itself is on the pricing page.'
          : 'Loading the tape…'}
      </p>
    )
  }

  const value = quote.price * qty
  const cost = calculateTradeCost(value, 'buy')

  return (
    <div className="m-cost">
      <div>
        <span className="m-label m-label--accent">How many shares</span>
        <div className="m-qty m-after-label">
          <button type="button" onClick={() => setQty((q) => Math.max(1, q - 1))}
                  disabled={qty <= 1} aria-label="One share fewer">−</button>
          <span className="m-qty-val" aria-live="polite" aria-atomic="true">
            {qty}<span className="m-sr"> shares</span>
          </span>
          <button type="button" onClick={() => setQty((q) => Math.min(999, q + 1))}
                  disabled={qty >= 999} aria-label="One share more">+</button>
        </div>
        <div className="m-seg m-after-label">
          {PRESETS.map((n) => (
            <button key={n} type="button" aria-pressed={qty === n} onClick={() => setQty(n)}>
              {n}
            </button>
          ))}
        </div>
        <p className="m-prose m-cost-summary">
          {qty} {qty === 1 ? 'share' : 'shares'} of {instrument.symbol} at the last traded
          price of ${formatUsd(quote.price)} is <strong>${formatUsd(value)}</strong> of trade
          value. Platizio also supports fractional orders, where you set the amount rather
          than the quantity.
        </p>
      </div>

      <div>
        <span className="m-label m-label--accent">What you pay on top</span>
        <div className="m-kv m-after-label">
          <div className="m-kv-row">
            <span className="m-kv-k">
              Brokerage
              {cost?.minimumApplied && (
                <span className="m-kv-tag"> ${RATES.brokerageMinUsd} minimum</span>
              )}
            </span>
            <span className="m-kv-v">${formatUsd(cost?.brokerage ?? 0)}</span>
          </div>
          <div className="m-kv-row">
            <span className="m-kv-k">IGST on brokerage</span>
            <span className="m-kv-v">${formatUsd(cost?.igst ?? 0)}</span>
          </div>
          <div className="m-kv-row">
            <span className="m-kv-k">IFSCA turnover fee</span>
            <span className="m-kv-v">${formatUsd(cost?.ifsca ?? 0, 4)}</span>
          </div>
          <div className="m-kv-row is-total">
            <span className="m-kv-k">Cost of the trade</span>
            <span className="m-kv-v">${formatUsd(cost?.total ?? 0)}</span>
          </div>
        </div>
        <p className="m-kv-note">
          {cost ? formatPct(cost.effectivePct) : '—'} of trade value. SEC and FINRA fees
          apply on sale only, and FINRA is charged per share rather than per dollar, so it
          is disclosed rather than totalled. Brokerage is {pct(RATES.brokeragePct)} per
          transaction, minimum ${RATES.brokerageMinUsd}. Rates as of {RATES.ratesAsOf}.
        </p>
        <Link className="m-guide m-guide--tail" to="/pricing">
            <span className="m-guide-label">The full charge schedule</span>
            <span aria-hidden="true"><ArrowRight /></span>
        </Link>
      </div>
    </div>
  )
}
