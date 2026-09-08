import Link from "next/link";
import type { WireItem } from "@/lib/market/home";
import { Card } from "@/components/ui/surface";
import { instrumentPath } from "@/lib/market/paths";

/**
 * The wire, in full.
 *
 * The rail carries eight headlines with no summaries — enough to notice
 * something, never enough to understand it. This page carries every story
 * Platizio Global holds, each with the paragraph that explains why it matters to the
 * price, because a headline on its own is the part of financial news that
 * misleads people who are not already fluent.
 *
 * Every story names the instrument it belongs to and links to it, so reading
 * about a company and looking at it are one step apart rather than two.
 */
export function WireView({ stories }: { stories: WireItem[] }) {
  /* Every story the universe holds, freshest first. The rail takes 8; this
     takes all of them, so the limit is set past the ceiling rather than
     guessed at. */

  return (
    <main id="terminal-main" className="flex min-w-0 flex-col overflow-hidden lg:h-full">
      <header className="border-b border-rule-section px-4 py-5 sm:px-6 lg:px-7">
        <h1 className="font-serif text-[clamp(1.75rem,3vw,2.25rem)] leading-none">
          The wire
        </h1>
        <p className="mt-3 max-w-[62ch] text-[13.5px] leading-[1.7] text-ink-3">
          Every story we hold across the names we cover, newest first — each one
          with what it actually means for the company.
        </p>
      </header>

      <div className="flex-1 px-4 pt-5 pb-10 sm:px-6 lg:overflow-y-auto lg:px-7">
        <p className="px-1 text-[12.5px] text-ink-3">
          {stories.length} stories
        </p>

        <ol className="m-0 mt-3 flex list-none flex-col gap-3 p-0">
          {stories.map((item) => (
            <li key={`${item.ticker}-${item.title}`}>
              <Card className="px-6 py-6">
                <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
                  <span className="text-[12px] font-semibold text-gold-dim">
                    {item.source}
                  </span>
                  <span aria-hidden="true" className="h-2.5 w-px bg-rule-mono" />
                  <Link
                    href={instrumentPath(item.ticker)}
                    /* -mx-1.5 keeps the row's rhythm while the padding takes
                       the hit area past the 24px minimum. */
                    className="font-mono -mx-1.5 inline-flex min-h-6 items-center px-1.5 text-[12px] tracking-[0.06em] transition-opacity hover:opacity-80"
                    style={{ color: item.color }}
                  >
                    {item.ticker}
                  </Link>
                  <span aria-hidden="true" className="h-2.5 w-px bg-rule-mono" />
                  <span className="text-[12px] text-ink-3">{item.time}</span>
                  <span aria-hidden="true" className="h-2.5 w-px bg-rule-mono" />
                  <span className="text-[12px] text-ink-3">{item.company}</span>
                </div>

                <h2 className="font-serif mt-3 text-[21px] leading-[1.35] text-pretty text-ink">
                  {item.title}
                </h2>

                <p className="mt-3.5 max-w-[70ch] text-[13.5px] leading-[1.75] text-ink-3">
                  {item.summary}
                </p>

                <p className="mt-5 border-t border-rule-section pt-4 text-[12.5px]">
                  <Link
                    href={instrumentPath(item.ticker)}
                    className="-mx-2 inline-flex min-h-9 items-center rounded-full px-2 text-gold transition-colors hover:bg-[rgba(217,189,139,0.06)] hover:text-ink"
                  >
                    Open {item.company}
                  </Link>
                </p>
              </Card>
            </li>
          ))}
        </ol>

        {/* This said every story was simulated and that no news feed was
            connected. Both were false: these are real published articles with
            real URLs. A page that disclaims its own live data teaches readers
            to ignore the disclaimers that matter. */}
        <p className="mt-8 max-w-[70ch] text-[12.5px] leading-[1.75] text-ink-3">
          Headlines come from the publishers named, are selected by the data
          provider against each symbol, and may mention a company without being
          about it. Nothing here is advice.
        </p>
      </div>
    </main>
  );
}
