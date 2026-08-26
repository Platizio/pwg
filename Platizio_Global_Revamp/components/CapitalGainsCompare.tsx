import { useState } from 'react'
import { Link } from 'react-router-dom'
import { RATES, pct } from '../data/pricingRates'
import { compareGainsTax, formatInr } from '../lib/pricing'

const DEFAULT_GAIN = '100000'
const PRESETS = ['50000', '100000', '500000', '1000000']

/**
 * Short-term against long-term, side by side.
 *
 * The holding period IS the point, so it is a comparison rather than an input —
 * the reader should see what 24 months is worth without having to toggle back
 * and forth to find out.
 *
 * Both assumptions sit inline next to the numbers rather than in a footnote:
 * the 30% slab, and the exclusion of surcharge and cess. A tax figure whose
 * caveats are somewhere else is a tax figure that will be misread.
 */
export default function CapitalGainsCompare() {
  const [raw, setRaw] = useState(DEFAULT_GAIN)

  const gain = Number.parseFloat(raw)
  const result = compareGainsTax(gain)
  const show = (n: number | undefined) => (result ? `₹${formatInr(n as number)}` : '—')

  return (
    <div className="gains reveal">
      <div className="gains-input">
        <label className="calc-label" htmlFor="gain-amount">Your capital gain</label>
        <div className="calc-input-wrap">
          <span className="calc-prefix" aria-hidden="true">₹</span>
          <input
            id="gain-amount"
            className="calc-input"
            type="text"
            inputMode="numeric"
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
          />
        </div>
        <div className="calc-presets">
          {PRESETS.map((p) => (
            <button
              type="button"
              key={p}
              className={`calc-preset${raw === p ? ' is-active' : ''}`}
              onClick={() => setRaw(p)}
            >
              ₹{formatInr(Number(p))}
            </button>
          ))}
        </div>
      </div>

      {/* Recalculates on input; without this the figures change silently. */}
      <div className="gains-compare" aria-live="polite">
        <article className="gains-card">
          <h3>Sold within 24 months</h3>
          <p className="gains-rate">
            Your income slab
            <em>assumed {pct(RATES.stcgAssumedSlabPct)}, the highest slab</em>
          </p>
          <p className="gains-figure">{show(result?.shortTermTax)}</p>
        </article>

        <article className="gains-card is-favoured">
          <h3>Held past 24 months</h3>
          <p className="gains-rate">
            {pct(RATES.ltcgPct)} flat
            <em>long-term capital gains</em>
          </p>
          <p className="gains-figure">{show(result?.longTermTax)}</p>
        </article>
      </div>

      {result && (
        <p className="gains-delta">
          Holding past {RATES.ltcgThresholdMonths} months saves{' '}
          <strong>₹{formatInr(result.difference)}</strong> on this gain.
        </p>
      )}

      <p className="calc-note">
        Your actual slab may be lower than {pct(RATES.stcgAssumedSlabPct)}, and
        surcharge and cess are not included — so the short-term figure understates
        what you would owe. An illustration, not tax advice.{' '}
        <Link to="/disclaimer">Risk disclosure</Link>
      </p>
    </div>
  )
}
