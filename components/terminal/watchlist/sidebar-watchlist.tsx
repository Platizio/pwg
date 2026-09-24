"use client";

import { motion } from "motion/react";
import Link from "next/link";
import { useCallback, useId, useMemo } from "react";
import { IconPlus } from "@/components/icons";
import { pct } from "@/lib/market/format";
import { instrumentPath } from "@/lib/market/paths";
import { C } from "@/lib/tokens";
import { cn } from "@/lib/ui";
import { ListSwitcher } from "./list-switcher";
import { WATCHLIST_ADD_PATH } from "./paths";
import { lookOf, useWatchFigures, type SeedQuote } from "./quotes";
import { useWatchlists } from "./store";

/**
 * The active watchlist, in the rail.
 *
 * The rows are the rail's rows as they always were — monogram, ticker, short
 * name, day change — so the six names a first visit is seeded with look
 * exactly as they did before lists existed. What changed is where they come
 * from: the reader's active list, switched from the row above them.
 *
 * The section takes whatever height the rail has left and scrolls inside it,
 * so a hundred names never push the lighting and language controls off the
 * rail or, as they used to, underneath the list.
 */
export function SidebarWatchlist({
  collapsed,
  quotes,
  current,
}: {
  collapsed: boolean;
  /** Day changes the layout already rendered, keyed by ticker. */
  quotes?: Record<string, number>;
  /** The ticker the reader is looking at, if any. */
  current: string | null;
}) {
  const state = useWatchlists();
  const list = state.lists.find((l) => l.id === state.activeId) ?? state.lists[0];
  const headingId = useId();

  const seed = useMemo(
    () =>
      new Map<string, SeedQuote>(
        Object.entries(quotes ?? {}).map(([symbol, chg]) => [symbol, { price: null, chg }]),
      ),
    [quotes],
  );
  const names = state.names;
  const named = useCallback((symbol: string) => symbol in names, [names]);
  const { figures } = useWatchFigures(list.symbols, seed, { seedCoversPrice: false, named });

  return (
    <section
      aria-labelledby={headingId}
      className={cn(
        /* flex-1 takes the height the rail has left; the floor keeps two rows
           on screen when it has almost none, at which point the rail itself
           scrolls rather than the list collapsing to nothing. Two, not more,
           so the foot stays in view down to a 600px window. */
        "mt-6 flex min-h-[96px] flex-1 flex-col",
        collapsed && "w-full items-center",
      )}
    >
      <h2 id={headingId} className="sr-only">
        Watchlist: {list.name}
      </h2>

      {!collapsed && (
        <div className="relative flex flex-none items-center gap-1.5 pb-2">
          <ListSwitcher />
          <Link
            href={WATCHLIST_ADD_PATH}
            aria-label={`Add stocks to ${list.name}`}
            title="Add stocks"
            className="grid h-11 w-11 flex-none place-items-center rounded-[10px] border border-rule-control text-ink-3 transition-colors hover:border-gold hover:text-gold lg:h-9 lg:w-9"
          >
            <IconPlus className="h-4 w-4" />
          </Link>
        </div>
      )}

      <div
        className={cn(
          /* -mx-1/px-1: room for the rows' 3px hover nudge inside the scroller,
             which would otherwise clip it or show a sideways scrollbar. */
          "-mx-1 min-h-0 flex-1 overflow-x-hidden overflow-y-auto px-1 pb-3",
          collapsed && "w-full",
        )}
      >
        {list.symbols.length === 0 ? (
          collapsed ? (
            <Link
              href={WATCHLIST_ADD_PATH}
              aria-label={`${list.name} is empty. Add stocks`}
              title="Add stocks"
              className="mx-auto grid h-11 w-11 place-items-center rounded-[10px] border border-dashed border-rule-control text-ink-3 transition-colors hover:border-gold hover:text-gold"
            >
              <IconPlus className="h-4 w-4" />
            </Link>
          ) : (
            <div className="rounded-[12px] border border-dashed border-rule-control px-3.5 py-4">
              <p className="text-[13px] leading-[1.55] text-ink-2">This list is empty.</p>
              <p className="mt-1 text-[12px] leading-[1.55] text-ink-3">
                Add the stocks you want to keep an eye on.
              </p>
              <Link
                href={WATCHLIST_ADD_PATH}
                className="mt-3 inline-flex min-h-10 items-center gap-2 rounded-full border border-[rgba(var(--c-gold-rgb),0.34)] px-3.5 text-[12.5px] font-medium text-ink transition-colors hover:border-gold hover:bg-[rgba(var(--c-gold-rgb),0.06)]"
              >
                <IconPlus className="h-3.5 w-3.5 text-gold" />
                Add stocks
              </Link>
            </div>
          )
        ) : (
          <ul className={cn("m-0 flex list-none flex-col gap-0.5 p-0", collapsed && "items-center")}>
            {list.symbols.map((symbol) => {
              const selected = symbol === current;
              const look = lookOf(symbol, state.names);
              const chg = figures.get(symbol)?.chg ?? null;
              return (
                <li key={symbol} className={cn(collapsed && "w-full")}>
                  <motion.div
                    initial={false}
                    whileHover={collapsed ? undefined : { x: 3 }}
                    transition={{ duration: 0.28, ease: "easeOut" }}
                  >
                    <Link
                      href={instrumentPath(symbol)}
                      aria-current={selected ? "true" : undefined}
                      title={collapsed ? `${symbol}${look.name ? ` · ${look.name}` : ""}` : undefined}
                      className={cn(
                        "flex min-h-11 items-center gap-3 rounded-[10px] transition-colors",
                        collapsed ? "justify-center px-0" : "px-2.5",
                        selected
                          ? "bg-[rgba(var(--c-gold-rgb),0.09)]"
                          : "hover:bg-[rgba(var(--c-gold-rgb),0.04)]",
                      )}
                    >
                      <span
                        aria-hidden="true"
                        /* Sized from its tile, per the monogram rule. */
                        className="font-serif grid h-8 w-8 flex-none place-items-center rounded-[9px] border border-[rgba(var(--c-gold-rgb),0.14)]"
                        style={{ color: look.color, fontSize: 15 }}
                      >
                        {look.mark}
                      </span>
                      <span className={cn("min-w-0 flex-1", collapsed && "sr-only")}>
                        <span
                          className={cn(
                            "font-mono block text-[13px] font-medium tracking-[0.05em]",
                            selected ? "text-ink" : "text-ink-2",
                          )}
                        >
                          {symbol}
                        </span>
                        {/* A non-breaking space holds the line while a name is
                            on its way, so the row does not grow when it lands. */}
                        <span className="mt-0.5 block truncate text-[12px] text-ink-3">
                          {look.name ?? " "}
                        </span>
                      </span>
                      {!collapsed &&
                        (chg === null ? (
                          <span className="font-mono flex-none text-right text-[12px] text-ink-3">
                            —
                          </span>
                        ) : (
                          <span
                            className="font-mono flex-none text-right text-[12px] tabular-nums"
                            style={{ color: chg >= 0 ? C.up : C.down }}
                          >
                            {pct(chg)}
                          </span>
                        ))}
                    </Link>
                  </motion.div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
