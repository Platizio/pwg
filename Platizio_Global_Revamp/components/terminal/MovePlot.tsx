import { describe, makeScale, axisLabel, ordinal } from '../../lib/plot'

interface MovePlotProps {
  symbol: string
  /** This instrument's percentage change today. */
  self: number
  /** Every usable Nasdaq-100 change today, ascending. */
  moves: number[]
  /** True when the instrument is not itself an index constituent. */
  external?: boolean
}

const W = 720
const H = 108
const AXIS_Y = 72
const TICK_TOP = 46
const SELF_TOP = 12
const SELF_BOTTOM = 84

/**
 * Where today's move sits inside the whole index.
 *
 * This is the terminal's signature graphic, and it exists because of what our
 * data plan does NOT have. ViewTrade exposes no fundamentals, no history and
 * no ownership feed (see docs/03-viewtrade-api.md), so the usual stock-page
 * furniture — P/E, market cap, analyst targets, a price chart — could only be
 * put on screen by inventing it.
 *
 * What we do have is every Nasdaq-100 constituent's move, every minute. Drawn
 * as one tick each on a shared axis, that answers a question the usual
 * furniture never does: is this move actually big, or is it Tuesday?
 *
 * Each constituent is a 1px line with a non-scaling stroke, so the field stays
 * crisp at any container width while the axis stretches. Labels are HTML
 * positioned by percentage rather than SVG text, which would stretch with it.
 *
 * The SVG is aria-hidden and the sentence beneath states the same finding in
 * words — better for a screen reader than a 103-row data table, and better for
 * everyone else than a graphic whose point has to be inferred.
 */
export default function MovePlot({ symbol, self, moves, external }: MovePlotProps) {
  const dist = describe(moves, self)
  if (!dist) return null

  const scale = makeScale(dist.min, dist.max, W)
  const pctOf = (value: number) => `${((scale(value) / W) * 100).toFixed(3)}%`

  const selfX = scale(self)
  const zeroX = scale(0)
  const dir = self > 0 ? 'up' : self < 0 ? 'down' : 'flat'

  const sentence = external
    ? `${symbol} moved ${axisLabel(self)} today. The Nasdaq-100's ${dist.count} constituents ranged from ${axisLabel(dist.min)} to ${axisLabel(dist.max)}, with a median of ${axisLabel(dist.median)}.`
    : `${symbol} moved ${axisLabel(self)} today — the ${ordinal(dist.rankByAbsolute)} largest move of the ${dist.count} Nasdaq-100 constituents we track. The median constituent moved ${axisLabel(dist.median)}.`

  return (
    <div className="m-dist">
      <div className="m-dist-plot">
        <svg
          className="m-dist-svg"
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="none"
          aria-hidden="true"
          focusable="false"
        >
          {/* The axis and the zero reference are decoration, which is the only
              place --m-accent-deep is allowed: it measures 4.21:1 and may never
              carry text. */}
          <line x1="0" y1={AXIS_Y} x2={W} y2={AXIS_Y}
                stroke="var(--m-rule)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
          <line x1={zeroX} y1={TICK_TOP - 8} x2={zeroX} y2={AXIS_Y + 8}
                stroke="var(--m-accent-deep)" strokeWidth="1" strokeDasharray="3 4"
                vectorEffect="non-scaling-stroke" />

          <g className="m-dist-reveal">
            {moves.map((move, i) => (
              <line
                key={i}
                x1={scale(move)} y1={TICK_TOP} x2={scale(move)} y2={AXIS_Y}
                stroke={move >= 0 ? 'var(--m-up)' : 'var(--m-down)'}
                strokeOpacity="0.42"
                strokeWidth="1"
                vectorEffect="non-scaling-stroke"
              />
            ))}
            {/* Quartile ticks below the axis: three short marks that turn a rug
                of lines into a distribution you can actually read. */}
            {[dist.q1, dist.median, dist.q3].map((q, i) => (
              <line
                key={`q${i}`}
                x1={scale(q)} y1={AXIS_Y} x2={scale(q)} y2={AXIS_Y + 7}
                stroke="var(--m-ink-4)" strokeWidth="1" vectorEffect="non-scaling-stroke"
              />
            ))}
          </g>

          <line x1={selfX} y1={SELF_TOP} x2={selfX} y2={SELF_BOTTOM}
                stroke="var(--m-accent)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
        </svg>

        <span className="m-dist-flag" style={{ left: pctOf(self) }}>
          <span className="m-dist-flag-id">{symbol}</span>
          <span className={`m-dist-flag-v is-${dir}`}>{axisLabel(self)}</span>
        </span>
        <span className="m-dist-zero" style={{ left: pctOf(0) }}>0</span>
        <span className="m-dist-med" style={{ left: pctOf(dist.median) }}>MEDIAN</span>
      </div>

      <div className="m-dist-scale">
        <span>{axisLabel(dist.min)}</span>
        <span>{axisLabel(dist.max)}</span>
      </div>

      <p className="m-dist-read">{sentence}</p>
    </div>
  )
}
