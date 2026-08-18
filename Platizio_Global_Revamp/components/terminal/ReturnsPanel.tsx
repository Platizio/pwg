import { trailingReturns } from '../../lib/profile'

/**
 * Trailing return, as a meter per horizon.
 *
 * These are scaled from today's move, exactly as the source design does it —
 * which makes them a projection, not a record. The panel says so rather than
 * letting four confident percentages imply a history we do not hold.
 */
export default function ReturnsPanel({ changePercent }: { changePercent: number }) {
  return (
    <div className="m-returns">
      {trailingReturns(changePercent).map((r) => (
        <div className="m-return" key={r.label}>
          <div className="m-return-top">
            <span className="m-label">{r.label}</span>
            <span className={`m-return-v is-${r.up ? 'up' : 'down'}`}>{r.value}</span>
          </div>
          <span className="m-meter" aria-hidden="true">
            <span className={`m-meter-fill is-${r.up ? 'up' : 'down'}`} style={{ width: r.width }} />
          </span>
        </div>
      ))}
    </div>
  )
}
