/**
 * The site's arrow, defined once.
 *
 * Six independent copies of this same five-line SVG existed across Home,
 * Pricing, About, Products, FeesTable and Regulations. Identical today, and
 * exactly the kind of thing that drifts the first time one of them is nudged.
 */
export default function ArrowIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
         strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d="M5 12h14M13 5l7 7-7 7" />
    </svg>
  )
}
