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

/* ============================================================ series

   The source design draws a real chart: a price ladder, gridlines, a dashed
   previous-close reference, an area fill, a volume histogram and an axis of
   session times. Reproducing that shape needs a series, and our data provider
   exposes no intraday history (docs/03-viewtrade-api.md).

   So the SHAPE is generated and the ENDPOINTS are real: the series is
   anchored to the live last price and the live previous close, and every
   figure printed beside it — last, change, previous close, cost — comes from
   the quote. The path between those two points is illustrative and is
   labelled as such on screen, every time it is drawn.

   The generator is the source design's own seeded LCG, kept because it is
   deterministic: the server and the hydrating client must produce identical
   coordinates or React tears the markup apart. Nothing here touches
   Math.random, Date, Intl or the DOM. */

function lcg(seed: number): () => number {
  let s = (seed * 2654435761) % 4294967296
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296
    return s / 4294967296
  }
}

/** A deterministic walk from `open` to `close`, `n` points long. */
export function shapeSeries(seed: number, n: number, open: number, close: number): number[] {
  const rnd = lcg(seed || 1)
  const drift = close - open

  /* Per-step volatility, sized so the SESSION's range lands near 1.5% of
     price rather than the walk running away.
     A random walk's spread grows with sqrt(n), so a step of price*0.0006
     over 170 steps gives roughly price*0.008 of wander either side of the
     drift — about what a normal US session actually does. The earlier value
     was six times that, which is why the line looked like a seismograph. */
  const vol = Math.max(Math.abs(close) * 0.0006, Math.abs(drift) * 0.18, 0.004)

  const out: number[] = []
  let v = open
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1)
    v += (rnd() - 0.47) * vol + drift / n
    /* Three components, in descending scale: the walk above, a slow swell
       that gives the session a shape, and a small tick-level jitter. Without
       the swell a random walk reads as noise; without the jitter it reads as
       a smooth curve nobody would mistake for a tape. */
    out.push(
      v
      + Math.sin(t * 5.1 + seed * 0.37) * vol * 3.2
      + Math.sin(t * 13.7 + seed * 0.71) * vol * 1.1
      + (rnd() - 0.5) * vol * 0.45,
    )
  }
  // Pin both ends: the first point is the previous close, the last is the
  // live price, so the two real numbers the page prints are on the line.
  const last = out[out.length - 1]
  const adj = close - last
  const pinned = out.map((p, i) => p + adj * (i / (n - 1)))
  pinned[0] = open
  pinned[pinned.length - 1] = close
  return pinned
}

/** A stable seed from a symbol, so a chart does not reshuffle between renders. */
export function seedOf(symbol: string): number {
  let h = 0
  for (let i = 0; i < symbol.length; i++) h = (h * 31 + symbol.charCodeAt(i)) % 100000
  return h + 7
}

export interface Pt { x: number; y: number }

export function mapPoints(values: readonly number[], w: number, h: number, pad: number): {
  pts: Pt[]; min: number; max: number
} {
  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max - min || 1
  return {
    pts: values.map((v, i) => ({
      x: (i / (values.length - 1)) * w,
      y: pad + (1 - (v - min) / span) * (h - pad * 2),
    })),
    min, max,
  }
}

/** Straight polyline — used for dense series where curvature is invented. */
export function polyPath(pts: readonly Pt[]): string {
  return pts.map((p, i) => `${i ? 'L' : 'M'} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(' ')
}

/** Catmull-Rom to cubic — used for sparklines, which are too short to read raw. */
export function smoothPath(pts: readonly Pt[]): string {
  if (pts.length < 2) return ''
  let d = `M ${pts[0].x.toFixed(2)} ${pts[0].y.toFixed(2)}`
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i]
    const p1 = pts[i]
    const p2 = pts[i + 1]
    const p3 = pts[i + 2] ?? p2
    d += ` C ${(p1.x + (p2.x - p0.x) / 6).toFixed(2)} ${(p1.y + (p2.y - p0.y) / 6).toFixed(2)},` +
         ` ${(p2.x - (p3.x - p1.x) / 6).toFixed(2)} ${(p2.y - (p3.y - p1.y) / 6).toFixed(2)},` +
         ` ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}`
  }
  return d
}
