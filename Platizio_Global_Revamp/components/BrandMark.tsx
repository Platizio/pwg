/*
 * Company marks for the eight names the page leads with.
 *
 * Drawn here rather than fetched. A logo CDN would put a third-party request
 * on every render of this page, hand that service a log of who is reading it,
 * and break the moment the service moves a path — none of which is worth
 * saving an afternoon of bezier work. These are simplified marks in one
 * weight, sized on a 24-unit grid and painted in `currentColor`, so they
 * inherit the card's own ink and sit at the same optical weight beside the
 * company's name.
 *
 * They are identifying marks used to name the company whose stock is quoted
 * beside them, which is what a logo is for; none of them is redrawn tightly
 * enough to stand in for the brand's own asset, and none should be lifted out
 * of this file and used as one.
 */

export type BrandSymbol =
  | 'AAPL' | 'MSFT' | 'NVDA' | 'GOOGL' | 'AMZN' | 'META' | 'TSLA' | 'NFLX'

interface BrandMarkProps {
  symbol: string
  className?: string
}

/* Each mark is authored to fill the 24-box optically, not geometrically: a
   round form is drawn a little larger than a square one so the two read the
   same size in a row. */
type Mark = { node: React.ReactNode; stroke?: boolean }

const MARKS: Record<string, Mark> = {
  /* Apple — the bitten silhouette, with the leaf as a separate stroke. */
  AAPL: { node: (
    <>
      <path d="M16.7 12.6c0-2.3 1.9-3.4 2-3.5-1.1-1.6-2.8-1.8-3.4-1.8-1.4-.1-2.8.9-3.5.9-.7 0-1.8-.8-3-.8-1.5 0-3 .9-3.8 2.3-1.6 2.8-.4 7 1.2 9.3.8 1.1 1.7 2.4 3 2.3 1.2 0 1.6-.8 3.1-.8 1.4 0 1.8.8 3.1.7 1.3 0 2.1-1.1 2.8-2.3.9-1.3 1.3-2.6 1.3-2.7 0 0-2.5-1-2.5-3.6Z" />
      <path d="M14.4 5.9c.6-.8 1.1-1.9 1-3-1 0-2.1.7-2.8 1.5-.6.7-1.1 1.8-1 2.9 1.1.1 2.2-.6 2.8-1.4Z" />
    </>
  ) },

  /* Microsoft — four squares, a hair of air between them. */
  MSFT: { node: (
    <>
      <rect x="3" y="3" width="8.4" height="8.4" />
      <rect x="12.6" y="3" width="8.4" height="8.4" />
      <rect x="3" y="12.6" width="8.4" height="8.4" />
      <rect x="12.6" y="12.6" width="8.4" height="8.4" />
    </>
  ) },

  /* NVIDIA — the eye, as a lens with a curled inner counter. */
  NVDA: { node: (
    <path d="M3 12c2.6-3.7 5.9-5.6 9.9-5.6 4.6 0 8.1 2.7 8.1 6.3 0 3.1-2.6 5-5.6 5-2.6 0-4.6-1.5-4.6-3.6 0-1.8 1.4-3 3.2-3 1.5 0 2.6.9 2.6 2.2 0 1-.7 1.7-1.6 1.7-.7 0-1.2-.4-1.2-1 0-.5.3-.9.8-.9.2 0 .3 0 .4.1-.2-.4-.6-.6-1.2-.6-1 0-1.7.7-1.7 1.8 0 1.4 1.3 2.4 3.1 2.4 2.2 0 3.8-1.5 3.8-3.7 0-2.8-2.8-5-6.5-5-3.4 0-6.3 1.6-8.6 4.6L3 12Z" />
  ) },

  /* Alphabet — the G, drawn as a ring opened at the right with the crossbar. */
  GOOGL: { node: (
    <path d="M12.2 10.5v3h4.2c-.2 1.1-1.4 3.2-4.2 3.2-2.5 0-4.6-2.1-4.6-4.7s2.1-4.7 4.6-4.7c1.4 0 2.4.6 3 1.2l2.1-2C15.9 5.3 14.2 4.5 12.2 4.5 8 4.5 4.6 7.9 4.6 12s3.4 7.5 7.6 7.5c4.4 0 7.3-3.1 7.3-7.4 0-.5 0-.9-.1-1.3l-7.2-.3Z" />
  ) },

  /* Amazon — the swoosh that runs under the name, drawn as the line it is. */
  AMZN: {
    stroke: true,
    node: (
      <>
        <path d="M3.4 13.4c2.9 2 6.3 3 9.6 3 2.3 0 4.8-.5 7.1-1.5" />
        <path d="M17.6 15.4l2.9-.7-.8 2.9" />
      </>
    ),
  },

  /* Meta — the loop, one continuous ribbon. */
  META: {
    stroke: true,
    node: (
      <path d="M7.4 8.1C4.5 8.1 3 10 3 12s1.5 3.9 4.4 3.9c3.1 0 4.2-3.9 4.6-3.9s1.5 3.9 4.6 3.9c2.9 0 4.4-1.9 4.4-3.9s-1.5-3.9-4.4-3.9c-3.1 0-4.2 3.9-4.6 3.9S10.5 8.1 7.4 8.1Z" />
    ),
  },

  /* Tesla — the T, with the shoulder yoke arcing above it. */
  TSLA: {
    node: (
      <>
        <path d="M10.85 20.4V9.15H6.05l-.75-2.3c2.15-.5 4.4-.75 6.7-.75s4.55.25 6.7.75l-.75 2.3h-4.8V20.4h-2.3Z" />
        <path d="M12 5.15c-2.6 0-5.2.4-7.7 1.2l-.95-1.7C6.15 3.75 9.05 3.3 12 3.3s5.85.45 8.65 1.35l-.95 1.7c-2.5-.8-5.1-1.2-7.7-1.2Z" />
      </>
    ),
  },

  /* Netflix — the N, as two uprights with the diagonal between them. */
  NFLX: { node: (
    <path d="M6.4 2.8v18.4l3.5-.3V12l4.2 9.5 3.5.4V2.8h-3.5v8.6L9.9 2.8H6.4Z" />
  ) },
}

/**
 * The company's mark, or its initial when we have not drawn one.
 *
 * The fallback is deliberate rather than an error state: the eight names the
 * page leads with are drawn, and any other company the reader looks up gets a
 * monogram in the same square, at the same weight, so a row never breaks.
 */
export default function BrandMark({ symbol, className }: BrandMarkProps) {
  const mark = MARKS[symbol]

  if (!mark) {
    return (
      <span className={className} aria-hidden="true" data-mono="true">
        {symbol.charAt(0)}
      </span>
    )
  }

  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill={mark.stroke ? 'none' : 'currentColor'}
      stroke={mark.stroke ? 'currentColor' : undefined}
      strokeWidth={mark.stroke ? 1.9 : undefined}
      strokeLinecap={mark.stroke ? 'round' : undefined}
      strokeLinejoin={mark.stroke ? 'round' : undefined}
      aria-hidden="true"
      focusable="false"
    >
      {mark.node}
    </svg>
  )
}
