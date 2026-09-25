import Link from "next/link";
import type { WireItem } from "@/lib/market/home";
import { Card } from "@/components/ui/surface";
import { instrumentPath } from "@/lib/market/paths";
import { cn } from "@/lib/ui";
import { CARD_X } from "./inset";
import { newestFirst } from "./reading-order";

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
     guessed at.

     The feed arrives ranked on relevance and impact, which is how the stories
     were chosen, not how they read. The page promises "newest first", so it
     is put in time order here; `age` is hours since publication. */
  const ordered = newestFirst(stories);

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
        {/* Text outside a card sits on the page gutter, under the h1. Text
            inside a card sits on CARD_X, as it does on the dashboard. */}
        <p className="text-[12.5px] text-ink-3">
          {stories.length} stories
        </p>

        <ol className="m-0 mt-3 flex list-none flex-col gap-3 p-0">
          {ordered.map((item) => (
            <li key={`${item.ticker}-${item.title}`}>
              <Card className={cn("py-6", CARD_X)}>
                <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
                  <span className="text-[12px] font-semibold text-gold-dim">
                    {item.source}
                  </span>
                  <span aria-hidden="true" className="h-2.5 w-px bg-rule-mono" />
                  {/* A label, not a link. "Open {company}" at the foot of
                      the card goes to the same page with a 44px target, and
                      a 24px duplicate here made forty small targets. */}
                  <span
                    className="font-mono text-[12px] tracking-[0.06em]"
                    style={{ color: item.color }}
                  >
                    {item.ticker}
                  </span>
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
                    className="-mx-2 inline-flex min-h-11 items-center rounded-full px-2 text-gold transition-colors hover:bg-[rgba(217,189,139,0.06)] hover:text-ink"
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
