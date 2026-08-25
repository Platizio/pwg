import type { Quote } from '../../types/market'

/**
 * How the index moved today, as a counted proportion.
 *
 * A solid bar would state the proportion; a ruled one states that it was
 * counted — which is the ledger idea surviving into the card surface, and the
 * reason this is a comb rather than a two-colour bar.
 *
 * The comb is a MASK over two coloured halves rather than two combed
 * elements side by side. Two adjacent combs would each start their pattern at
 * their own origin and leave a visible phase break exactly where the eye is
 * trying to read the split.
 */
export default function BreadthBar({ quotes }: { quotes: Quote[] }) {
  const rose = quotes.filter((q) => q.changePercent > 0).length
  const fell = quotes.filter((q) => q.changePercent < 0).length
  const counted = rose + fell
  if (!counted) return null

  const rosePct = (rose / counted) * 100

  return (
    <div className="breadth">
      <div className="breadth-bar tick-split" role="img"
           aria-label={`${rose} of ${counted} constituents rose today, ${fell} fell.`}>
        <span className="breadth-up" style={{ width: `${rosePct}%` }} />
        <span className="breadth-down" style={{ width: `${100 - rosePct}%` }} />
      </div>
      <div className="breadth-counts">
        <span className="breadth-rose">{rose} rose</span>
        <span className="breadth-fell">{fell} fell</span>
      </div>
    </div>
  )
}
