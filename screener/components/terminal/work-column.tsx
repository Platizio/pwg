"use client";

import type { ReactNode } from "react";
import { TickerTape } from "./ticker-tape";
import { cn } from "./ui";

/**
 * The working column and its reference rail, as a fragment so both land as
 * direct children of the shell's grid.
 *
 * The rail is rendered twice by design: once inside the column for viewports
 * below `xl`, where it reads as the last section of the page, and once as a
 * real column above it. Only one is ever in the accessibility tree, because
 * the other is `display: none`.
 *
 * `bleed` turns off the column's horizontal padding. The dashboard needs it:
 * its hairlines run the full width of the column and pad themselves, which is
 * the whole point of that layout and impossible through a padded parent.
 */
export function WorkColumn({
  aside,
  bleed = false,
  children,
}: {
  aside?: ReactNode;
  bleed?: boolean;
  children: ReactNode;
}) {
  return (
    /* The work area owns its own split. The shell is two columns now, so a
       route without a reference rail simply fills the space instead of
       leaving an empty third column behind. */
    <div
      className={cn(
        "grid min-w-0 lg:h-full lg:overflow-hidden",
        Boolean(aside) && "xl:grid-cols-[minmax(0,1fr)_358px]",
      )}
    >
      <main
        id="terminal-main"
        className="flex min-w-0 flex-col lg:h-full lg:overflow-hidden"
      >
        <TickerTape />

        <div
          className={cn(
            "flex-1 pb-10 lg:overflow-y-auto",
            bleed ? "pt-0" : "px-4 pt-6 sm:px-6 lg:px-7",
          )}
        >
          {children}

          {aside && (
            <div
              className={cn(
                "mt-10 border-t border-rule-section xl:hidden",
                bleed && "mt-0",
              )}
            >
              {aside}
            </div>
          )}
        </div>
      </main>

      {aside && (
        <aside
          aria-label="Reference"
          className="hidden border-l border-rule-section rail-lit xl:block xl:overflow-y-auto"
        >
          {aside}
        </aside>
      )}
    </div>
  );
}
