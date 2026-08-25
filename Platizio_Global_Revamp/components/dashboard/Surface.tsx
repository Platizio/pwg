import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { direction, formatPercent } from '../../lib/format'

/*
  Meridian v2 — the lit-card vocabulary.

  The first system refused cards on principle, and the principle was sound
  about the thing it was refusing: a flat grey box with a border and a radius,
  used as a container because no hierarchy had been decided. These are a
  different object. Each is lit along a single axis, seated by a shadow with
  negative spread, and edged by a highlight only where the light actually
  lands.
*/

type CardTone = 'up' | 'down'

export function Card({
  as: Tag = 'div', to, interactive, glow, lit, tone, className = '', children,
}: {
  as?: 'div' | 'section' | 'article'
  to?: string
  interactive?: boolean
  glow?: boolean
  /** Reserved for the few cards that carry the page. */
  lit?: boolean
  /** Only for a card whose subject IS a direction — the gainers and losers
      boards. Anywhere else a directional colour states something untrue. */
  tone?: CardTone
  className?: string
  children: ReactNode
}) {
  const base = glow ? 'card-glow' : tone ? `card-${tone}` : lit ? 'card-lit' : 'card'
  const classes = `${base}${interactive || to ? ' card-hover' : ''} edge-lit ${className}`.trim()

  if (to) return <Link to={to} className={`${classes} is-block`}>{children}</Link>
  return <Tag className={classes}>{children}</Tag>
}

function Caret({ up }: { up: boolean }) {
  return (
    <svg viewBox="0 0 12 12" aria-hidden="true" focusable="false">
      {up ? <path d="M6 2.5 10 8H2z" fill="currentColor" />
          : <path d="M6 9.5 2 4h8z" fill="currentColor" />}
    </svg>
  )
}

/**
 * A signed percentage as a pill.
 *
 * Direction is carried by a drawn caret and a tinted border as well as by
 * colour, so it never rests on hue alone — the same contract QuoteChange
 * holds on the light side of the site.
 */
export function DeltaPill({ value, className = '' }: { value: number; className?: string }) {
  const dir = direction(value)
  return (
    <span className={`delta-pill is-${dir} ${className}`.trim()}>
      {dir !== 'flat' && <Caret up={dir === 'up'} />}
      {formatPercent(value)}
    </span>
  )
}

/** A bare signed figure, for dense rows where a pill would be too much. */
export function Delta({ value, className = '' }: { value: number; className?: string }) {
  const dir = direction(value)
  return (
    <span className={`m-chg is-${dir} ${className}`.trim()}>
      {dir !== 'flat' && <Caret up={dir === 'up'} />}
      {formatPercent(value)}
    </span>
  )
}

/** A status badge — filled for the emphatic one, outlined for the rest. */
export function Badge({ tone = 'quiet', children }: {
  tone?: 'gold' | 'quiet' | 'outline'
  children: ReactNode
}) {
  return <span className={`badge badge--${tone}`}>{children}</span>
}

/** The square monogram plate that heads every instrument row. */
export function Plate({ symbol }: { symbol: string }) {
  return <span className="tile plate" aria-hidden="true">{symbol.charAt(0)}</span>
}
