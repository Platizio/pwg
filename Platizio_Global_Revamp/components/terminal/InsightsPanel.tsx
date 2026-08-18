import type { Insight } from '../../data/instrumentProfile'

/**
 * Numbered, not iconified.
 *
 * The source design grades each observation three ways — a strength, a plain
 * note, a caution — and carries that grade in the colour of the numeral
 * rather than in a badge. Everything else on the row is type.
 */
export default function InsightsPanel({ insights }: { insights: readonly Insight[] }) {
  return (
    <ol className="m-insights">
      {insights.map((i, index) => (
        <li className="m-insight" key={i.title}>
          <span className={`m-insight-n is-${i.kind}`} aria-hidden="true">
            {String(index + 1).padStart(2, '0')}
          </span>
          <div>
            <h4 className="m-insight-t">{i.title}</h4>
            <p className="m-insight-b">{i.body}</p>
          </div>
        </li>
      ))}
    </ol>
  )
}
