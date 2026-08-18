/**
 * The label that keeps this page honest.
 *
 * Every panel built on the profile dataset renders one. The dataset is
 * reference material carried over from the design-system source, not a live
 * feed — our provider exposes no fundamentals, ownership or analyst endpoint
 * (docs/03-viewtrade-api.md) — and a page that shows a P/E beside a live price
 * without saying which is which is the exact failure this note exists to
 * prevent.
 */
export default function ReferenceNote({ missing = false }: { missing?: boolean }) {
  if (missing) {
    return (
      <p className="m-prose">
        We do not carry a reference profile for this instrument yet. Its live price, the
        cost of the trade and the tax rules are all on the other tabs and are unaffected.
      </p>
    )
  }
  return (
    <p className="m-illus">
      <strong>Reference data.</strong> Ratios, peers, holders and analyst figures on this
      tab are reference material, not a live feed — our market-data provider serves quotes
      only. Prices, changes and the cost of the trade are live and delayed. Check a filing
      before acting on any figure here.
    </p>
  )
}
