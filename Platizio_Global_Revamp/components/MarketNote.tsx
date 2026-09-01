import Link from 'next/link'
import { formatAsOf } from '../lib/format'

interface MarketNoteProps {
  /** ISO timestamp of the stalest displayed quote. Null while loading. */
  asOf: string | null
  delayed: boolean
  /** `dark` on the navy band, `light` on white sections. */
  tone?: 'light' | 'dark'
}

/**
 * The disclosure that must sit under every block of prices on this site.
 *
 * Deliberately one shared component rather than markup repeated per section:
 * a regulated intermediary showing delayed quotes needs this to be structurally
 * impossible to forget, not a copy-paste convention.
 *
 * Renders nothing until data arrives — claiming a freshness time while still
 * loading would be worse than saying nothing.
 */
export default function MarketNote({ asOf, delayed, tone = 'light' }: MarketNoteProps) {
  if (!asOf) return null

  return (
    <p className={`market-note market-note--${tone}`}>
      {delayed ? 'Prices delayed.' : 'Prices'} Last updated {formatAsOf(asOf)}.{' '}
      For information only — not investment advice or a recommendation to buy or sell.{' '}
      <Link href="/disclaimer">Risk disclosure</Link>
    </p>
  )
}
