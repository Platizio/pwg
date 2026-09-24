/* The instrument page's furniture, drawn while the instrument is still being
 * assembled.
 *
 * The page this stands in for is the expensive one. A ticker outside the
 * prerendered head of the universe is built on its first visit out of thirteen
 * upstream calls — measured at 8-15 seconds against production — and until now
 * a reader who typed a small listing sat on the previous page with nothing to
 * say that anything was happening. This is what they see instead, and because
 * it is prefetched along with the route, it is on screen before the request
 * that fills it has returned.
 *
 * Every measurement is copied from the thing it stands in for rather than
 * invented, so the real page lands into the shape already drawn instead of
 * pushing it around: work-column.tsx for the grid and its paddings,
 * instrument-header.tsx for the header line, tab-bar.tsx for the strip,
 * price-header.tsx for the price block, and instrument-view.tsx for the
 * 240/300/340 chart box.
 *
 * A Server Component with no data reads and no component imports. A fallback
 * that has to fetch or hydrate before it can paint is not a fallback, and
 * every client component it might reach for — the tape, the header, the chart
 * — is exactly the code the navigation is waiting on.
 */

/**
 * One placeholder bar.
 *
 * The tint is the chart skeleton's own (`--tint-gold-ghost` at 3% champagne),
 * so a loading page reads as one material rather than two, and it is faint
 * enough not to cut the wash the way a grey block would. `rounded-none` is
 * stated rather than left to the default: the Square Rule is a law here, and
 * a base style that ever rounded a `div` should not quietly round these.
 */
function Bar({ className }: { className: string }) {
  return (
    <div
      className={`animate-pulse rounded-none bg-[var(--tint-gold-ghost)] ${className}`}
    />
  );
}

/**
 * The reference rail.
 *
 * Rendered twice, exactly as the real page renders it — as a column at `xl`,
 * and appended to the foot of the working column below that. The duplicate is
 * what keeps the working column the same width at every size, and only one of
 * the two is ever in the tree because the other is `display: none`.
 */
function RailSkeleton() {
  return (
    <div className="flex flex-col gap-8 px-6 py-6 lg:gap-9">
      {["newswire", "about", "moves"].map((section) => (
        <section key={section}>
          <Bar className="mb-4 h-6 w-40" />
          {[0, 1, 2].map((row) => (
            <div
              key={row}
              className="rule-t flex flex-col gap-2.5 py-4 first:border-t-0 first:pt-0"
            >
              <Bar className="h-2.5 w-24" />
              <Bar className="h-4 w-[85%]" />
            </div>
          ))}
        </section>
      ))}
    </div>
  );
}

export default function LoadingInstrument() {
  return (
    <div
      aria-busy="true"
      className="grid min-w-0 lg:h-full lg:overflow-hidden xl:grid-cols-[minmax(0,1fr)_358px] xl:[:root[data-news-rail=collapsed]_&]:grid-cols-[minmax(0,1fr)_56px]"
    >
      <main
        id="terminal-main"
        className="flex min-w-0 flex-col lg:h-full lg:overflow-hidden"
      >
        <p className="sr-only">Loading instrument</p>

        {/* The tape's strip, held open. It is a live client component on the
            real page and deliberately not imported here; all the layout wants
            from it is its 40px and its hairline. */}
        <div className="h-10 flex-none border-b border-rule-list" />

        <div className="flex-1 px-4 pt-6 pb-10 sm:px-6 lg:overflow-y-auto lg:px-7">
          {/* The sticky block, at its resting height. Nothing is pinned yet, so
              it carries no ground and no shadow — the same as the real header
              before the reader has scrolled. */}
          <div className="pt-4">
            <div className="flex flex-wrap items-end gap-x-5 gap-y-4 border-b border-rule-section pb-5">
              {/* The monogram tile: a hairline square, never a fill. The
                  instrument's colour lives in the letter, and there is no
                  letter yet. */}
              <div className="h-14 w-14 flex-none border border-rule-mono" />

              <div className="min-w-0 flex-1">
                <Bar className="h-[30px] w-[15ch] max-w-full sm:h-[40px]" />
                <div className="mt-2.5 flex h-5 items-center gap-3">
                  <Bar className="h-2.5 w-14" />
                  <span className="h-2.5 w-px bg-rule-mono" />
                  <Bar className="h-2.5 w-24" />
                </div>
              </div>

              {/* Follow and Trade, both as outlines. The real page fills
                  exactly one of them in gold; a skeleton that filled a second
                  would put two gold surfaces on one screen. */}
              <div className="ms-auto flex flex-wrap items-center gap-3">
                <div className="h-11 w-[116px] border border-rule-control" />
                <div className="h-11 w-[104px] border border-rule-control" />
              </div>
            </div>

            {/* The tab strip, at the widths the six words take, so the rule
                under it lands where it is going to land. Spaced as tab-bar.tsx
                spaces its labels: 24px apart on a narrow strip, 32px from a
                736px column (its container is 24px wider, hence 760 there). */}
            <div className="@container">
              <div className="no-scrollbar flex gap-6 overflow-x-auto border-b border-rule-section @min-[736px]:gap-8">
                {[
                  "w-[72px]",
                  "w-[112px]",
                  "w-[124px]",
                  "w-[92px]",
                  "w-[108px]",
                  "w-[76px]",
                ].map((width) => (
                  <div key={width} className="flex-none py-4">
                    <Bar className={`h-4 ${width}`} />
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="pt-7" />

          {/* The price block: its eyebrow, the display figure, the change chip
              and the liveness line, then the toolbar under them. The chip is
              drawn as a hairline box rather than a bar because that is what a
              chip is in this system — a border tinted to the direction, and
              there is no direction to tint it to yet. */}
          <div className="mb-6 flex flex-col gap-6">
            <div>
              <Bar className="mb-2.5 h-3 w-44" />
              <div className="flex flex-wrap items-baseline gap-x-4 gap-y-3">
                <Bar className="h-[42px] w-[184px] sm:h-[58px] sm:w-[248px]" />
                <div className="h-[30px] w-[86px] border border-rule-control" />
                <Bar className="h-3 w-28" />
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-x-8 gap-y-5">
              <Bar className="h-11 w-[104px] md:h-[34px]" />
              <div className="h-11 w-[318px] max-w-full border border-rule" />
            </div>
          </div>

          {/* The one fixed-height element on the page, reserved at exactly the
              heights the canvas mounts into. This is the same pulse the chart's
              own dynamic-import skeleton draws, so the handover from this page
              to that one is invisible. */}
          <div className="h-[240px] sm:h-[300px] lg:h-[340px]">
            <div className="h-full w-full animate-pulse bg-[var(--tint-gold-ghost)]" />
          </div>

          {/* The panel. Four ruled rows: whichever tab opens, what sits under
              the strip is a ledger of label-and-figure lines separated by
              hairlines, and that is the shape worth holding. */}
          <div className="mt-8">
            {[0, 1, 2, 3].map((row) => (
              <div
                key={row}
                className="rule-t flex items-center gap-4 py-5 first:border-t-0 first:pt-0"
              >
                <Bar className="h-3 w-[26%]" />
                <Bar className="h-3 w-[14%] ms-auto" />
              </div>
            ))}
          </div>

          {/* Below `xl` the rail is not a rail: it reads as the last section of
              the page. */}
          <div className="mt-10 border-t border-rule-section xl:hidden">
            <RailSkeleton />
          </div>
        </div>
      </main>

      <aside
        aria-label="Reference"
        className="hidden border-l border-rule-section rail-lit xl:block xl:overflow-y-auto"
      >
        {/* A reader who folded the rail (work-column.tsx) sees the 56px strip
            here too, not a full rail that snaps shut when the page lands. */}
        <div className="[:root[data-news-rail=collapsed]_&]:invisible">
          <RailSkeleton />
        </div>
      </aside>
    </div>
  );
}
