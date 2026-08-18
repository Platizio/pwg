import { shapeSeries, seedOf, mapPoints, smoothPath } from '../../lib/plot'

interface SparklineProps {
  symbol: string
  /** Today's percentage move — sets the direction and the colour. */
  changePercent: number
  width?: number
  height?: number
}

/**
 * The session's shape, at thumbnail scale.
 *
 * Anchored to the real move: it starts at the previous close and ends at the
 * live price, so its direction and its magnitude are true. The path between
 * them is illustrative — we have no intraday feed — and the block that owns
 * each sparkline says so once rather than every row shouting it.
 */
export default function Sparkline({ symbol, changePercent, width = 66, height = 26 }: SparklineProps) {
  const open = 100
  const close = 100 * (1 + changePercent / 100)
  const values = shapeSeries(seedOf(symbol), 26, open, close)
  const { pts } = mapPoints(values, width, height, 3)
  const up = changePercent >= 0

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} fill="none"
         aria-hidden="true" focusable="false" className="m-spark">
      <path d={smoothPath(pts)} stroke={up ? 'var(--m-up)' : 'var(--m-down)'}
            strokeWidth="1.15" strokeLinecap="round" strokeLinejoin="round" fill="none"
            vectorEffect="non-scaling-stroke" />
    </svg>
  )
}
