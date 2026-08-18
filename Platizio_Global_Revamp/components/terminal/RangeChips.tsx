interface RangeChipsProps {
  active: string
  onChange: (id: string) => void
  ranges?: readonly string[]
}

const DEFAULT = ['1H', '1D', '1W', '1M', '1Y', 'ALL'] as const

/**
 * The time-horizon strip.
 *
 * Only 1D is selectable while the quote feed is the only feed we have — the
 * rest are shown disabled rather than hidden, because a horizon selector with
 * one option in it is not a selector, and hiding the range the product will
 * have would misrepresent it in the other direction.
 */
export default function RangeChips({ active, onChange, ranges = DEFAULT }: RangeChipsProps) {
  return (
    <div className="m-ranges" role="group" aria-label="Time range">
      {ranges.map((r) => {
        const available = r === '1D'
        return (
          <button
            key={r}
            type="button"
            className="m-range"
            aria-pressed={r === active}
            disabled={!available}
            title={available ? undefined : 'Available once intraday history is connected'}
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); if (available) onChange(r) }}
          >
            {r}
          </button>
        )
      })}
    </div>
  )
}
