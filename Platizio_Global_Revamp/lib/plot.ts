/**
 * Geometry for the distribution plot. Pure arithmetic, no I/O.
 *
 * Kept out of the component for the same reason lib/pricing.ts is: the
 * prerender runs this in Node and hydration runs it in the browser, and the
 * two must agree to the last decimal. Nothing here touches Intl, Date, Math.random
 * or the DOM, so they always do.
 */

/** Linear quantile over an ASCENDING array. Returns NaN for an empty input. */
export function quantile(sorted: readonly number[], q: number): number {
  if (!sorted.length) return NaN
  if (sorted.length === 1) return sorted[0]
  const pos = (sorted.length - 1) * q
  const lo = Math.floor(pos)
  const hi = Math.ceil(pos)
  if (lo === hi) return sorted[lo]
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo)
}

export interface Distribution {
  /** Ascending, as returned by the proxy. */
  moves: readonly number[]
  min: number
  max: number
  q1: number
  median: number
  q3: number
  /** 1 = the largest absolute move in the set. */
  rankByAbsolute: number
  count: number
  /** Fraction of the set this move is larger than, in absolute terms. 0–1. */
  percentileByAbsolute: number
}

/**
 * Where one move sits inside the day's whole index.
 *
 * Ranked on ABSOLUTE change, because "was this a big day for this stock?" is
 * a question about magnitude, not direction — a 4% fall is as much a mover as
 * a 4% rise, which is the same convention the trending banner already uses.
 *
 * The axis is padded to include `self` even when the symbol is not itself an
 * index constituent: an ETF plotted against the Nasdaq-100 must still land
 * somewhere on the scale rather than off the end of it.
 */
export function describe(moves: readonly number[], self: number): Distribution | null {
  if (!moves.length || !Number.isFinite(self)) return null

  const min = Math.min(moves[0], self)
  const max = Math.max(moves[moves.length - 1], self)
  const absSelf = Math.abs(self)
  const larger = moves.reduce((n, m) => (Math.abs(m) > absSelf ? n + 1 : n), 0)

  return {
    moves,
    min,
    max,
    q1: quantile(moves, 0.25),
    median: quantile(moves, 0.5),
    q3: quantile(moves, 0.75),
    rankByAbsolute: larger + 1,
    count: moves.length,
    percentileByAbsolute: moves.length ? (moves.length - larger) / moves.length : 0,
  }
}

/**
 * Value -> 0..width, with a margin so a tick at either extreme is not clipped
 * by the viewBox and the self-marker's label has somewhere to sit.
 */
export function makeScale(min: number, max: number, width: number, margin = 16) {
  // A span of zero would divide by zero on a flat day; 0.01 keeps the axis
  // drawable and puts every tick in the middle, which is the truth.
  const span = max - min || 0.01
  const inner = width - margin * 2
  return (value: number) => margin + ((value - min) / span) * inner
}

/** Two decimals with an explicit sign, matching the site's percent format. */
export function axisLabel(value: number): string {
  const sign = value > 0 ? '+' : value < 0 ? '-' : ''
  return `${sign}${Math.abs(value).toFixed(2)}%`
}

/**
 * An ordinal for the rank sentence: 1 -> "1st", 12 -> "12th", 23 -> "23rd".
 * Hand-rolled rather than Intl.PluralRules, which is locale-dependent and
 * therefore a hydration risk.
 */
export function ordinal(n: number): string {
  const rem100 = n % 100
  if (rem100 >= 11 && rem100 <= 13) return `${n}th`
  switch (n % 10) {
    case 1: return `${n}st`
    case 2: return `${n}nd`
    case 3: return `${n}rd`
    default: return `${n}th`
  }
}

export interface DaySummary {
  advancing: number
  declining: number
  unchanged: number
  median: number
  widest: number
  widestIsUp: boolean
  count: number
}

/**
 * The day, in four figures.
 *
 * The source design opened with four index cards — S&P 500, Nasdaq 100, FTSE,
 * Nikkei. Our data provider has no index endpoint at all (see
 * docs/03-viewtrade-api.md), so quoting index levels would mean inventing
 * them. These four are computed from the constituent moves we actually
 * receive, which is a different and equally real reading of the same morning.
 */
export function summarise(moves: readonly number[]): DaySummary | null {
  if (!moves.length) return null
  let advancing = 0, declining = 0, unchanged = 0, widest = 0, widestIsUp = true
  for (const m of moves) {
    if (m > 0) advancing++
    else if (m < 0) declining++
    else unchanged++
    if (Math.abs(m) > Math.abs(widest)) { widest = m; widestIsUp = m >= 0 }
  }
  return {
    advancing, declining, unchanged,
    median: quantile(moves, 0.5),
    widest, widestIsUp,
    count: moves.length,
  }
}
