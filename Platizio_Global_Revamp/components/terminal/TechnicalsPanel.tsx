import type { Quote } from '../../types/market'
import type { Instrument } from '../../data/terminalUniverse'
import { profileOf } from '../../data/instrumentProfile'
import { technicals, consensus } from '../../lib/profile'
import { seedOf } from '../../lib/plot'
import ReferenceNote from './ReferenceNote'

interface Props { instrument: Instrument; quote?: Quote }

/**
 * Indicators on the left, analyst consensus on the right.
 *
 * The indicators are computed against the LIVE price, so the moving averages
 * and the ATR move with the tape rather than sitting frozen. A fund gets the
 * indicators and no consensus block, because nobody publishes a price target
 * on an index tracker.
 */
export default function TechnicalsPanel({ instrument, quote }: Props) {
  const profile = profileOf(instrument.symbol)
  if (!profile) return <ReferenceNote missing />
  if (!quote) return <p className="m-prose">Indicators are computed from the live price, which is unavailable right now.</p>

  const rows = technicals(quote.price, quote.changePercent, profile.beta, seedOf(instrument.symbol))
  const c = profile.kind === 'equity' ? consensus(profile, quote.price) : null

  return (
    <>
      <div className="m-split">
        <section>
          <div className="m-panel-head">
            <span className="m-label m-label--accent">Technical indicators</span>
          </div>
          <div className="m-kv">
            {rows.map((r) => (
              <div className="m-tech" key={r.label}>
                <span className="m-kv-k">{r.label}</span>
                <span className="m-meter" aria-hidden="true">
                  <span className={`m-meter-fill is-${r.tone}`} style={{ width: r.width }} />
                </span>
                <span className="m-kv-v">{r.value}</span>
                <span className={`m-signal is-${r.tone}`}>{r.signal}</span>
              </div>
            ))}
          </div>
        </section>

        {c ? (
          <section>
            <div className="m-panel-head">
              <span className="m-label m-label--accent">Analyst consensus</span>
              <span className="m-label">{c.count} analysts · 12-month target</span>
            </div>
            <div className="m-consensus">
              <span className="m-consensus-target">{c.target}</span>
              <span className="m-consensus-upside">{c.upside}</span>
              <span className="m-consensus-split" aria-hidden="true">
                {c.bars.map((b) => (
                  <span key={b.key} className={`m-consensus-bar is-${b.tone}`} style={{ width: b.width }} />
                ))}
              </span>
              <div className="m-kv">
                {c.rows.map((r) => (
                  <div className="m-kv-row" key={r.label}>
                    <span className="m-kv-k">
                      <span className={`m-swatch is-${r.tone}`} aria-hidden="true" />
                      {r.label}
                    </span>
                    <span className="m-kv-v">{r.count}</span>
                  </div>
                ))}
              </div>
            </div>
          </section>
        ) : (
          <section>
            <div className="m-panel-head">
              <span className="m-label m-label--accent">Coverage</span>
            </div>
            <p className="m-prose">
              An index tracker has no analyst coverage: there is no company to rate and no
              earnings to forecast. What it has instead is a published expense ratio and a
              tracking difference against its index, both on the fundamentals tab.
            </p>
          </section>
        )}
      </div>
      <ReferenceNote />
    </>
  )
}
