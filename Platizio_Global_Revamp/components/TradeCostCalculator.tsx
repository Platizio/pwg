import { useState } from 'react'
import { Link } from 'react-router-dom'
import { RATES, pct } from '../data/pricingRates'
import { calculateTradeCost, formatUsd, formatPct, type TradeSide } from '../lib/pricing'

/** Constants, not derived values — the server and the client must agree exactly. */
const DEFAULT_VALUE = '1000'
const DEFAULT_SIDE: TradeSide = 'buy'

const PRESETS = ['200', '1000', '5000', '25000']

/**
 * What a trade actually costs.
 *
 * The page's signature. A schedule listing "SEC fee $0.0000206 per $1 traded"
 * is accurate and unusable; this turns it into a number for the reader's own
 * trade.
 *
 * No fetch and no effect: the whole thing is arithmetic over a constant
 * default, so the prerendered HTML already contains a complete, correct
 * breakdown, hydration matches byte for byte, and the numbers are right before
 * JavaScript loads. Only the inputs need JS.
 */
export default function TradeCostCalculator() {
  const [raw, setRaw] = useState(DEFAULT_VALUE)
  const [side, setSide] = useState<TradeSide>(DEFAULT_SIDE)

  const value = Number.parseFloat(raw)
  const cost = calculateTradeCost(value, side)

  // Empty or nonsense input shows dashes rather than NaN, and the section
  // stays where it is — nothing collapses under the reader.
  const show = (n: number | undefined) => (cost ? `$${formatUsd(n as number)}` : '—')

  return (
    <section className="section calc-section" aria-labelledby="calc-heading">
      <div className="container">
        <div className="section-header reveal">
          <span className="eyebrow">Work out your cost</span>
          <h2 id="calc-heading">What a trade actually costs</h2>
          <p>
            Enter a trade value and see every charge that applies, including the
            effective rate you end up paying.
          </p>
        </div>

        <div className="calc reveal">
          <div className="calc-inputs">
            <div className="calc-field">
              <label className="calc-label" htmlFor="trade-value">Trade value</label>
              <div className="calc-input-wrap">
                <span className="calc-prefix" aria-hidden="true">$</span>
                <input
                  id="trade-value"
                  className="calc-input"
                  type="text"
                  inputMode="decimal"
                  value={raw}
                  onChange={(e) => setRaw(e.target.value)}
                  aria-describedby="calc-effective"
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
                    ${formatUsd(Number(p), 0)}
                  </button>
                ))}
              </div>
            </div>

            <fieldset className="calc-field calc-side">
              <legend className="calc-label">Order type</legend>
              <div className="calc-toggle">
                {(['buy', 'sell'] as const).map((s) => (
                  <label key={s} className={`calc-toggle-option${side === s ? ' is-active' : ''}`}>
                    <input
                      type="radio"
                      name="side"
                      value={s}
                      checked={side === s}
                      onChange={() => setSide(s)}
                    />
                    {s === 'buy' ? 'Buy' : 'Sell'}
                  </label>
                ))}
              </div>
              <p className="calc-hint">
                {side === 'sell'
                  ? 'Sell orders also carry the SEC and FINRA fees.'
                  : 'Buy orders carry no SEC or FINRA fee.'}
              </p>
            </fieldset>
          </div>

          <div className="calc-result">
            <ul className="calc-lines">
              <li>
                <span className="calc-line-label">
                  Brokerage
                  {cost?.minimumApplied && <span className="calc-tag">minimum applied</span>}
                </span>
                <span className="calc-line-value">{show(cost?.brokerage)}</span>
              </li>
              <li>
                <span className="calc-line-label">IGST <em>18% on brokerage</em></span>
                <span className="calc-line-value">{show(cost?.igst)}</span>
              </li>
              <li>
                <span className="calc-line-label">IFSCA turnover fee</span>
                <span className="calc-line-value">{show(cost?.ifsca)}</span>
              </li>
              <li className={side === 'buy' ? 'is-muted' : undefined}>
                <span className="calc-line-label">SEC fee <em>sell orders only</em></span>
                <span className="calc-line-value">{show(cost?.sec)}</span>
              </li>
            </ul>

            {/* The summary, not the whole breakdown: announcing every line on each
                keystroke is unusable. Total and effective rate are the outcome. */}
            <div className="calc-total" aria-live="polite">
              <div className="calc-total-row">
                <span>Total cost</span>
                <strong>{show(cost?.total)}</strong>
              </div>
              <div className="calc-effective" id="calc-effective">
                <span>Effective rate</span>
                <strong>{cost ? formatPct(cost.effectivePct) : '—'}</strong>
              </div>
            </div>

            {/* The insight the schedule cannot express: on small orders the
                minimum, not the headline rate, sets what you pay. Better the
                reader learns it here than after their first trade. */}
            {cost?.minimumApplied && (
              <p className="calc-callout">
                Below about ${formatUsd(RATES.brokerageMinUsd / RATES.brokeragePct, 0)}, the
                ${RATES.brokerageMinUsd} minimum sets your brokerage rather than the{' '}
                {pct(RATES.brokeragePct)} rate — which is why the effective rate here is
                higher than {pct(RATES.brokeragePct)}.
              </p>
            )}
          </div>
        </div>

        {/* Two exclusions, both stated. The forex one matters more than the
            FINRA one and was missing: converting rupees to dollars is usually
            the largest single cost on a trade of this size, so a calculator
            that silently omits it understates the real number by more than
            every fee above it combined. */}
        <p className="calc-note">
          Your bank's currency conversion is not included above — the rate and margin
          are set by your remitting bank, not by us, and on most trades it is the
          largest single cost. FINRA also charges ${RATES.finraPerShare} per share sold,
          excluded because it depends on share count rather than trade value and is
          typically under $0.05 on a retail order. Figures are an illustration, not tax
          or investment advice. <Link to="/disclaimer">Risk disclosure</Link>
        </p>
      </div>
    </section>
  )
}
