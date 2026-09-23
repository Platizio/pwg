"use client";

import Link from "next/link";
import { WorkColumn } from "@/components/terminal/work-column";
import { TERMINAL_PATH } from "@/lib/market/paths";
import { REGISTER_X, cn } from "@/lib/ui";

/**
 * Something under /terminal threw while rendering.
 *
 * Without this, a page that failed became Next's bare "Application error" —
 * no shell, no search, no way back but the browser's own button. Placed at the
 * terminal segment, it renders INSIDE app/terminal/layout.tsx, so the rail, the
 * search and the reader's watchlist all survive and only the work column is
 * replaced. It covers the instrument, sector, calendar and wire pages alike.
 *
 * `reset` re-renders the segment in place, which is the right first move: most
 * failures here are a store or gateway read that timed out, and those answer on
 * the next try.
 */
export default function TerminalError({ reset }: { error: Error; reset: () => void }) {
  return (
    <WorkColumn bleed>
      <div className={cn("border-b border-rule-section py-3.5", REGISTER_X)}>
        <p className="eyebrow">Something went wrong</p>
      </div>

      <div className={cn("py-12", REGISTER_X)}>
        <h1 className="font-serif text-[clamp(1.875rem,3vw,2.5rem)] leading-none tracking-[0.005em]">
          This page did not load
        </h1>
        <p className="mt-4 max-w-[54ch] text-[13.5px] leading-[1.75] text-pretty text-ink-3">
          Usually that is a data source that was slow to answer, and trying again
          is enough. If it keeps happening, the rest of the terminal is still
          available from the menu and the search above.
        </p>
      </div>

      <div className="border-t border-rule-section">
        <button
          type="button"
          onClick={reset}
          className={cn(
            "eyebrow eyebrow-gold flex min-h-11 w-full items-center py-4 text-left transition-colors hover:text-gold",
            REGISTER_X,
          )}
        >
          Try again
        </button>
      </div>
      <div className="border-t border-rule-section">
        <Link
          href={TERMINAL_PATH}
          className={cn(
            "eyebrow flex min-h-11 items-center py-4 transition-colors hover:text-gold",
            REGISTER_X,
          )}
        >
          Back to the session
        </Link>
      </div>
    </WorkColumn>
  );
}
