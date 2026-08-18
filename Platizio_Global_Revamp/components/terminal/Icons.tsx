/**
 * The terminal's icons, drawn rather than borrowed.
 *
 * Two of them, both 1.5px stroke on a 24-grid, because a ruled system that
 * suddenly sprouts a filled icon set has changed voice mid-sentence. No emoji,
 * no unicode glyphs standing in for drawn marks.
 */

export function ArrowRight() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}
         strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d="M4 12h15M13 6l6 6-6 6" />
    </svg>
  )
}

export function ArrowUpRight() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}
         strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d="M7 17 17 7M8 7h9v9" />
    </svg>
  )
}
