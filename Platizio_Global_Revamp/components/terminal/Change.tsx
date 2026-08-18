import { direction, formatPercent } from '../../lib/format'

interface ChangeProps {
  changePercent: number
  size?: 'sm' | 'lg'
}

/**
 * A percentage move in the terminal's world.
 *
 * Same contract as QuoteChange on the light side of the site, restated here
 * rather than restyled: the glyph and the sign carry direction alongside the
 * hue, because WCAG 1.4.1 forbids colour as the sole carrier of meaning and
 * sage/terracotta is exactly the pair a deuteranopic reader cannot separate.
 * Never remove the arrow to tidy the design.
 */
export default function Change({ changePercent, size = 'sm' }: ChangeProps) {
  const dir = direction(changePercent)

  return (
    <span className={`m-chg${size === 'lg' ? ' m-chg--lg' : ''} is-${dir}`}>
      <svg viewBox="0 0 12 12" aria-hidden="true" focusable="false">
        {dir === 'up' && <path d="M6 2.5 10 8H2z" fill="currentColor" />}
        {dir === 'down' && <path d="M6 9.5 2 4h8z" fill="currentColor" />}
        {dir === 'flat' && <rect x="2" y="5.25" width="8" height="1.5" fill="currentColor" />}
      </svg>
      {formatPercent(changePercent)}
    </span>
  )
}
