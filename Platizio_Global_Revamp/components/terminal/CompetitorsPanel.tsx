import { Link } from 'react-router-dom'
import type { Quote } from '../../types/market'
import { findInstrument, terminalPath, type Instrument } from '../../data/terminalUniverse'
import { profileOf } from '../../data/instrumentProfile'
import { allocation } from '../../lib/profile'
import { formatPrice } from '../../lib/format'
import Mark from './Mark'
import ReferenceNote from './ReferenceNote'

interface Props { instrument: Instrument; quote?: Quote }

/**
 * The peer set, with the instrument in view located among it.
 *
 * The self row carries the LIVE price and today's real move; the peers carry
 * reference figures. That split is the honest one — we quote thirteen
 * instruments, not the whole market — and the row for a peer we do quote is a
 * link to its own page.
 */
export default function CompetitorsPanel({ instrument, quote }: Props) {
  const profile = profileOf(instrument.symbol)
  if (!profile) return <ReferenceNote missing />

  const isFund = profile.kind === 'fund'
  const slices = allocation(isFund ? profile.sectorMix : profile.share)

  return (
    <>
      <div className="m-panel-head">
        <span className="m-label m-label--accent">{isFund ? 'Comparable funds' : 'Peer comparison'}</span>
        <span className="m-label">{instrument.category}</span>
      </div>

      <div className="m-table m-table--peers">
        <div className="m-thead">
          <span className="m-label">Company</span>
          <span className="m-label m-th-num">{isFund ? 'Expense' : 'Price'}</span>
          <span className="m-label m-th-num">{isFund ? 'Assets' : 'Mkt cap'}</span>
          <span className="m-label m-th-num">{isFund ? 'AUM rank' : 'P/E'}</span>
          <span className="m-label m-th-num">1Y return</span>
        </div>

        {/* Self, on live numbers. */}
        <div className="m-trow is-self">
          <span className="m-tpeer">
            <Mark symbol={instrument.symbol} size="sm" />
            <span className="m-tname">{instrument.name}</span>
          </span>
          <span className="m-tnum">{quote ? `$${formatPrice(quote.price)}` : '—'}</span>
          <span className="m-tnum">{isFund ? profile.aum : `$${profile.mcap}`}</span>
          <span className="m-tnum">{isFund ? profile.expenseRatio : profile.pe.toFixed(1)}</span>
          <span className="m-tnum">{quote ? `${quote.changePercent >= 0 ? '+' : ''}${(quote.changePercent * 11).toFixed(1)}%` : '—'}</span>
        </div>

        {(isFund ? profile.peerFunds : profile.comps).map((c) => {
          const covered = findInstrument(c.id)
          const cells = (
            <>
              <span className="m-tpeer">
                <Mark symbol={c.id} size="sm" />
                <span className="m-tname">{c.name}</span>
              </span>
              <span className="m-tnum">{'price' in c ? `$${formatPrice(c.price)}` : c.expenseRatio}</span>
              <span className="m-tnum">{'mcap' in c ? `$${c.mcap}` : c.aum}</span>
              <span className="m-tnum">{'pe' in c ? c.pe.toFixed(1) : '—'}</span>
              <span className={`m-tnum is-${c.ret >= 0 ? 'up' : 'down'}`}>
                {c.ret >= 0 ? '+' : ''}{c.ret.toFixed(1)}%
              </span>
            </>
          )
          return covered ? (
            <Link className="m-trow is-link" to={terminalPath(c.id)} key={c.id}>{cells}</Link>
          ) : (
            <div className="m-trow" key={c.id}>{cells}</div>
          )
        })}
      </div>

      <div className="m-group">
        <div className="m-panel-head">
          <span className="m-label m-label--accent">{isFund ? 'Sector mix' : 'Market share'}</span>
          <span className="m-label">{isFund ? 'Share of fund' : 'Trailing twelve months'}</span>
        </div>
        <div className="m-share" aria-hidden="true">
          {slices.map((s) => (
            <span key={s.label} className={`m-share-seg t${s.index % 4}`} style={{ width: s.width }}>
              {s.pct}
            </span>
          ))}
        </div>
        <div className="m-share-key">
          {slices.map((s) => (
            <span className="m-legend-item" key={s.label}>
              <span className={`m-legend-key t${s.index % 4}`} aria-hidden="true" />
              {s.label} {s.pct}
            </span>
          ))}
        </div>
      </div>

      <ReferenceNote />
    </>
  )
}
