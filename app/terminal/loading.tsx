/* The session's shape, drawn while the sweep is being read.
 *
 * The dashboard is a hundred and twenty-nine upstream calls behind a five
 * minute window, so most visits are served from the cache and land at once —
 * but the visit that misses waits on the whole sweep, and a reader who clicked
 * in from the marketing page has nothing on screen until it returns. This is
 * what stands there in the meantime, and because Next prefetches the fallback
 * along with the route, it is already in the browser when the click happens.
 *
 * The grid is copied from dashboard.tsx — the same two columns, the same rail
 * breakpoint, the same paddings — so the skeleton occupies the columns the
 * page will occupy. What sits inside it is not: the boards below are ruled
 * rows rather than the cards they stand in for, because a screen of empty
 * filled panels is a wall of grey furniture, and this system separates things
 * with a hairline and vertical space rather than with a box.
 *
 * A Server Component with no data reads and no component imports, for the same
 * reason the instrument fallback has none: the client code it would pull in is
 * the code the navigation is waiting on.
 */

/**
 * One placeholder bar.
 *
 * The chart skeleton's tint (`--tint-gold-ghost`, champagne at 3%), so every
 * loading surface in the terminal is made of the same material, and faint
 * enough to sit inside the champagne wash without cutting it. `rounded-none`
 * is stated rather than assumed — the Square Rule is a law here.
 */
function Bar({ className }: { className: string }) {
  return (
    <div
      className={`animate-pulse rounded-none bg-[var(--tint-gold-ghost)] ${className}`}
    />
  );
}

/**
 * One board, as a ruled row: what it is called, then a few figures.
 *
 * The rule is the top edge and the space beneath it is the padding — there is
 * no panel, because there is nothing in it yet to need one.
 */
function Board({ className = "" }: { className?: string }) {
  return (
    <section className={`border-t border-rule-section pt-4 ${className}`}>
      <Bar className="h-4 w-32" />
      <div className="mt-4 flex flex-col">
        {[0, 1, 2].map((row) => (
          <div
            key={row}
            className="rule-t flex items-center gap-4 py-3.5 first:border-t-0 first:pt-0"
          >
            <Bar className="h-3 w-[38%]" />
            <Bar className="ms-auto h-3 w-[18%]" />
          </div>
        ))}
      </div>
    </section>
  );
}

/**
 * The reference rail: two halves, each its own scroller on the real page.
 *
 * Rendered twice like the page renders it — as a column at `xl`, and as the
 * last section of the working column below that — so the working column is the
 * same width at both sizes.
 */
function RailSkeleton() {
  return (
    <div className="grid h-full min-h-0 grid-rows-2 gap-4 p-4 sm:p-5">
      {["events", "wire"].map((half) => (
        <section key={half} className="min-h-0">
          <div className="flex items-baseline justify-between gap-3 pb-3">
            <Bar className="h-4 w-28" />
            <Bar className="h-2.5 w-16" />
          </div>
          {[0, 1, 2, 3].map((row) => (
            <div
              key={row}
              className="rule-t flex flex-col gap-2 py-3.5 first:border-t-0 first:pt-0"
            >
              <Bar className="h-2.5 w-20" />
              <Bar className="h-3.5 w-[82%]" />
            </div>
          ))}
        </section>
      ))}
    </div>
  );
}

export default function LoadingTerminal() {
  return (
    <div
      aria-busy="true"
      className="grid min-w-0 lg:h-full lg:overflow-hidden xl:grid-cols-[minmax(0,1fr)_340px]"
    >
      <main
        id="terminal-main"
        className="flex min-w-0 flex-col overflow-hidden lg:h-full"
      >
        <p className="sr-only">Loading the session</p>

        {/* The tape's strip, held open. It is a live client component on the
            real page; what the layout wants from it here is its 40px and its
            hairline. */}
        <div className="h-10 flex-none border-b border-rule-list" />

        <div className="flex-1 px-4 pt-5 pb-10 sm:px-6 lg:overflow-y-auto lg:px-7">
          {/* The market card, which is the page's hero: one index level, the
              move beside it, and the breadth line under them. */}
          <section>
            <Bar className="h-3 w-40" />
            <div className="mt-5 flex flex-wrap items-end gap-x-8 gap-y-4">
              <Bar className="h-[40px] w-[220px] sm:h-[60px] sm:w-[300px]" />
              <Bar className="mb-1.5 h-4 w-24" />
            </div>
            <div className="mt-7 border-t border-rule-section pt-6">
              <Bar className="h-3 w-[58%] max-w-[46ch]" />
            </div>
          </section>

          {/* Top gainers, top losers, most active — in the columns they take. */}
          <div className="mt-8 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            <Board />
            <Board />
            <Board />
          </div>

          {/* The popular ribbon: one row of names, scrolled sideways. */}
          <section className="mt-8 border-t border-rule-section pt-4">
            <Bar className="h-4 w-24" />
            <div className="mt-5 flex gap-6 overflow-hidden">
              {[0, 1, 2, 3, 4].map((item) => (
                <div key={item} className="flex w-[128px] flex-none flex-col gap-2.5">
                  <Bar className="h-3.5 w-full" />
                  <Bar className="h-3 w-3/5" />
                </div>
              ))}
            </div>
          </section>

          {/* By sector, four cards deep before the reader asks for the rest. */}
          <section className="mt-8">
            <div className="flex flex-wrap items-baseline justify-between gap-3 px-1">
              <Bar className="h-4 w-28" />
              <Bar className="h-2.5 w-48" />
            </div>
            <div className="mt-4 grid gap-5 md:grid-cols-2 2xl:grid-cols-4">
              <Board />
              <Board />
              <Board />
              <Board />
            </div>
          </section>

          {/* Below `xl` the rail is the last section of the page rather than a
              squeezed column. */}
          <div className="mt-5 h-[860px] xl:hidden">
            <RailSkeleton />
          </div>
        </div>
      </main>

      <aside
        aria-label="Reference"
        className="hidden min-h-0 border-l border-rule-section xl:block xl:overflow-hidden"
      >
        <RailSkeleton />
      </aside>
    </div>
  );
}
