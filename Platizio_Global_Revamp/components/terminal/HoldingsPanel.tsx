import type { Instrument } from '../../data/terminalUniverse'
import { profileOf } from '../../data/instrumentProfile'
import { holderBars } from '../../lib/profile'
import ReferenceNote from './ReferenceNote'

/**
 * Who else owns it.
 *
 * The source design paired this with "Your position" — shares held,
 * unrealised P/L, portfolio weight — against a hardcoded account. There is no
 * account behind a public page, so that half is replaced by what a fund
 * actually discloses: its largest holdings, which is the same question asked
 * of the other side of the instrument.
 */
export default function HoldingsPanel({ instrument }: { instrument: Instrument }) {
  const profile = profileOf(instrument.symbol)
  if (!profile) return <ReferenceNote missing />

  const isFund = profile.kind === 'fund'

  return (
    <>
      <div className="m-split">
        <section>
          <div className="m-panel-head">
            <span className="m-label m-label--accent">Top institutional holders</span>
            <span className="m-label">Share of outstanding</span>
          </div>
          <div className="m-kv">
            {holderBars(profile.holders).map((h) => (
              <div className="m-holder" key={h.name}>
                <span className="m-holder-top">
                  <span className="m-kv-k">{h.name}</span>
                  <span className="m-kv-v">{h.shares} · {h.pct}</span>
                </span>
                <span className="m-meter" aria-hidden="true">
                  <span className="m-meter-fill" style={{ width: h.width }} />
                </span>
              </div>
            ))}
          </div>
        </section>

        <section>
          <div className="m-panel-head">
            <span className="m-label m-label--accent">
              {isFund ? 'Largest holdings' : 'What the register says'}
            </span>
          </div>
          {isFund ? (
            <div className="m-kv">
              {profile.topHoldings.map((h) => (
                <div className="m-kv-row" key={h.name}>
                  <span className="m-kv-k">{h.name}</span>
                  <span className="m-meter" aria-hidden="true">
                    <span className="m-meter-fill" style={{ width: `${Math.min(100, h.pct * 12)}%` }} />
                  </span>
                  <span className="m-kv-v">{h.pct.toFixed(2)}%</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="m-prose">
              Index funds and pension managers sit at the top of almost every large US
              register, because they buy the whole index rather than the company. A high
              institutional share is a fact about how the market is structured, not a
              verdict on the business.
            </p>
          )}
        </section>
      </div>
      <ReferenceNote />
    </>
  )
}
