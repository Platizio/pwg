import type { Instrument } from '../../data/terminalUniverse'
import { profileOf } from '../../data/instrumentProfile'
import { equityRatios, fundFacts, revenueBars } from '../../lib/profile'
import ReferenceNote from './ReferenceNote'

/**
 * Key ratios on the left, the revenue history on the right.
 *
 * A fund has no P/E and no revenue, so it gets the panel a fund actually
 * needs — expense ratio, assets, holdings count, the index it tracks — beside
 * its sector mix. Same structure, honest content.
 */
export default function FundamentalsPanel({ instrument }: { instrument: Instrument }) {
  const profile = profileOf(instrument.symbol)
  if (!profile) return <ReferenceNote missing />

  const isFund = profile.kind === 'fund'
  const rows = isFund ? fundFacts(profile) : equityRatios(profile)

  return (
    <>
      <div className="m-split">
        <section>
          <div className="m-panel-head">
            <span className="m-label m-label--accent">{isFund ? 'Fund facts' : 'Key ratios'}</span>
          </div>
          <div className="m-kv">
            {rows.map((r) => (
              <div className="m-kv-row" key={r.label}>
                <span className="m-kv-k">{r.label}</span>
                <span className="m-kv-v">{r.value}</span>
              </div>
            ))}
          </div>
        </section>

        <section>
          <div className="m-panel-head">
            <span className="m-label m-label--accent">{isFund ? 'Sector mix' : 'Revenue'}</span>
            <span className="m-label">{isFund ? 'Share of fund' : 'Fiscal year · billions USD'}</span>
          </div>

          {isFund ? (
            <div className="m-kv">
              {profile.sectorMix.map((s) => (
                <div className="m-kv-row" key={s.label}>
                  <span className="m-kv-k">{s.label}</span>
                  <span className="m-meter" aria-hidden="true">
                    <span className="m-meter-fill" style={{ width: `${s.pct}%` }} />
                  </span>
                  <span className="m-kv-v">{s.pct}%</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="m-bars">
              {revenueBars(profile.rev).map((b) => (
                <div className="m-bar" key={b.year}>
                  <span className="m-bar-v">{b.value}</span>
                  <span className={`m-bar-fill${b.latest ? ' is-latest' : ''}`} style={{ height: b.height }} />
                  <span className="m-bar-y">{b.year}</span>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
      <ReferenceNote />
    </>
  )
}
