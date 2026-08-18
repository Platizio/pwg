import { shapeSeries, seedOf, mapPoints, polyPath } from '../../lib/plot'
import { formatPrice } from '../../lib/format'

interface PriceChartProps {
  symbol: string
  /** Live last traded price — the right-hand end of the line. */
  price: number
  /** Live previous close — the left-hand end, and the dashed reference. */
  previousClose: number
  changePercent: number
  height?: number
  /** Session times along the foot. */
  xLabels?: readonly string[]
}

const W = 700
const PAD = 14
const POINTS = 170
const DEFAULT_X = ['09:30', '11:00', '12:30', '14:00', '15:30', '16:00'] as const

/**
 * The session, drawn.
 *
 * A price ladder in mono on the left, hairline gridlines, a dashed reference
 * at the previous close, an area fill under the line, a volume histogram
 * beneath it and the session times along the foot — the shape the source
 * design draws, in this world's palette.
 *
 * Both ends of the line are real: it opens at the live previous close and
 * closes at the live last price, and the ladder is scaled to the range those
 * two imply. The path between them is illustrative, because our provider has
 * no intraday endpoint, and the caller prints that fact beside the chart.
 *
 * Everything is inline SVG computed by pure functions — no canvas library,
 * which would be a client-only dependency and a hydration hazard under
 * renderToString. Strokes carry non-scaling-stroke so they stay 1px crisp
 * while the viewBox stretches to any container width.
 */
export default function PriceChart({
  symbol, price, previousClose, changePercent, height = 188, xLabels = DEFAULT_X,
}: PriceChartProps) {
  const H = height
  const values = shapeSeries(seedOf(symbol), POINTS, previousClose, price)
  const { pts, min, max } = mapPoints(values, W, H, PAD)
  const span = max - min || 1
  const up = changePercent >= 0
  const stroke = up ? 'var(--m-up)' : 'var(--m-down)'

  const ladder: string[] = []
  const gridTops: string[] = []
  for (let i = 0; i < 5; i++) {
    ladder.push(formatPrice(max - (span * i) / 4))
    gridTops.push(((PAD + ((H - PAD * 2) * i) / 4) / H * 100).toFixed(2) + '%')
  }
  const gridLefts = Array.from({ length: 6 }, (_, i) => ((i / 5) * 100).toFixed(2) + '%')

  const prevY = PAD + (1 - (Math.max(min, Math.min(max, previousClose)) - min) / span) * (H - PAD * 2)
  const last = pts[pts.length - 1]

  // One bar per ~3.5 points, height from the move across that window — the
  // same derivation the source uses, so the histogram tracks the line.
  const step = Math.max(1, Math.floor(values.length / 48))
  const bars: { h: string; up: boolean }[] = []
  for (let i = 0; i < values.length - step; i += step) {
    const d = values[i + step] - values[i]
    bars.push({
      h: Math.max(8, Math.min(100, (Math.abs(d) / span) * 240 + 10)).toFixed(0) + '%',
      up: d >= 0,
    })
  }

  return (
    <div className="m-chart">
      <div className="m-chart-ladder" style={{ height: `${H}px` }}>
        {ladder.map((v) => <span key={v}>{v}</span>)}
      </div>

      <div className="m-chart-plot-wrap">
        <div className="m-chart-plot" style={{ height: `${H}px` }}>
          {gridTops.map((t) => <span className="m-grid-h" key={t} style={{ top: t }} />)}
          {gridLefts.map((l) => <span className="m-grid-v" key={l} style={{ left: l }} />)}
          <span className="m-prev" style={{ top: `${((prevY / H) * 100).toFixed(2)}%` }} />

          <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none"
               className="m-chart-svg" aria-hidden="true" focusable="false">
            <defs>
              <linearGradient id={`area-${symbol}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={stroke} stopOpacity="0.20" />
                <stop offset="70%" stopColor={stroke} stopOpacity="0.04" />
                <stop offset="100%" stopColor={stroke} stopOpacity="0" />
              </linearGradient>
            </defs>
            <g className="m-chart-reveal">
              <path d={`${polyPath(pts)} L ${W} ${H + 30} L 0 ${H + 30} Z`} fill={`url(#area-${symbol})`} />
              <path d={polyPath(pts)} fill="none" stroke={stroke} strokeWidth="1.25"
                    strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
            </g>
          </svg>

          <span className={`m-chart-dot is-${up ? 'up' : 'down'}`}
                style={{ left: `${((last.x / W) * 100).toFixed(2)}%`, top: `${((last.y / H) * 100).toFixed(2)}%` }} />
        </div>

        <div className="m-vol">
          {bars.map((b, i) => (
            <span key={i} className={`m-vol-bar is-${b.up ? 'up' : 'down'}`} style={{ height: b.h }} />
          ))}
        </div>

        <div className="m-chart-x">
          {xLabels.map((x) => <span key={x}>{x}</span>)}
        </div>
      </div>
    </div>
  )
}
