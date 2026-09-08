"use client";

import { motion } from "motion/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState, useMemo} from "react";
import {
  IconCalendar,
  IconChart,
  IconChevron,
  IconCollapse,
  IconGlobe,
  IconWatchlist,
  IconOverview,
  IconWire,
} from "@/components/icons";
import { pct } from "@/lib/market/format";
import { DEFAULT_TICKER, INSTRUMENTS } from "@/lib/market/instruments";
import { C } from "@/lib/tokens";
import { cn } from "@/lib/ui";
import { useLive } from "./live-provider";
import ThemeToggle from "@/components/terminal/theme-toggle";
import {
  CALENDAR_PATH,
  instrumentPath,
  TERMINAL_PATH,
  tickerFromPath,
  WIRE_PATH,
} from "@/lib/market/paths";

/**
 * The rail of a public screener.
 *
 * It carries destinations and nothing else. The account block that used to sit
 * at the foot — a portfolio value, buying power, a position count — has gone,
 * along with preferences and the concierge row. This page is open to anyone,
 * and a rail that opens by stating how much money is in an account is the
 * fastest way to tell a visitor with very little that the room is not theirs.
 *
 * What is left is the market, which belongs equally to everyone reading it.
 *
 * Every control here goes somewhere. Two of them used to render as bare
 * `<button>`s with no handler — Calendar and The wire — which is the worst
 * kind of dead control, because it carries a full hover state and a pointer
 * cursor and then does nothing. They are links to real pages now.
 */
export function Sidebar({
  collapsed = false,
  onToggleCollapse,
  quotes,
}: {
  /** Icon-only rail. The drawer never collapses — it is already a panel. */
  collapsed?: boolean;
  onToggleCollapse?: () => void;
  /* Live day changes for the covered names, keyed by ticker. Absent on routes
     that have no snapshot to hand, and absent again when the feed is down —
     in both cases the rail shows the names without a figure rather than the
     authored one it used to print. */
  quotes?: Record<string, number>;
}) {
  const pathname = usePathname();

  /* The rail's percentages come from the server snapshot and are then patched
     by live ticks. A tick with no previous close cannot carry a change, so that
     symbol keeps the snapshot's figure rather than showing a move computed
     against nothing. */
  const covered = useMemo(() => INSTRUMENTS.map((i) => i.id), []);
  const ticks = useLive(covered);
  const liveQuotes = useMemo(() => {
    const merged: Record<string, number> = { ...(quotes ?? {}) };
    for (const [symbol, tick] of ticks) {
      if (tick.changePercent !== null) merged[symbol] = tick.changePercent;
    }
    return merged;
  }, [quotes, ticks]);

  const current = tickerFromPath(pathname);

  const nav = [
    {
      key: "overview",
      label: "Overview",
      Icon: IconOverview,
      href: TERMINAL_PATH,
      active: pathname === TERMINAL_PATH,
    },
    {
      key: "watchlist",
      label: "Watch list",
      Icon: IconWatchlist,
      href: instrumentPath(current ?? DEFAULT_TICKER),
      active: current !== null,
    },
    {
      key: "calendar",
      label: "Calendar",
      Icon: IconCalendar,
      href: CALENDAR_PATH,
      active: pathname === CALENDAR_PATH,
    },
    {
      key: "wire",
      label: "The wire",
      Icon: IconWire,
      href: WIRE_PATH,
      active: pathname === WIRE_PATH,
    },
  ];

  return (
    <div
      className={cn(
        "flex h-full flex-col overflow-y-auto py-5",
        collapsed ? "items-center px-3" : "px-4",
      )}
    >
      <div
        className={cn(
          "flex gap-3",
          collapsed ? "flex-col items-center" : "items-start justify-between px-2",
        )}
      >
        <Link
          href="/"
          aria-label="Platizio Global, home"
          className={cn(
            "flex min-w-0 items-center gap-3 transition-opacity hover:opacity-90",
            collapsed && "justify-center",
          )}
        >
          <span
            aria-hidden="true"
            /* The brand mark does not invert with the theme — a logo lockup that
               flips reads as a different logo. The tile stays dark in both
               lightings, so the icon is pinned to the dark gold (#d9bd8b, the
               dark theme's own --c-gold) rather than text-gold: under the light
               theme that token resolves to #7e6238, which on this near-black
               tile left the mark barely visible. */
            className="grid h-10 w-10 flex-none place-items-center rounded-[11px] bg-[linear-gradient(150deg,#2a2318,#171310)] text-[#d9bd8b]"
          >
            <IconChart className="h-[18px] w-[18px]" />
          </span>
          {!collapsed && (
            <span className="min-w-0">
              {/* Two lines, not one. On one line at 21px the wordmark measured
                  129px against a 97px box, so `truncate` was rendering it as
                  "Platizio Glo…" — the brand name, ellipsised. Stacking the two
                  words fits each within the rail at a slightly smaller size and
                  keeps the serif proportion. `truncate` stays per line as a
                  guard, but neither word reaches the edge now. */}
              <span className="font-serif block text-[19px] leading-[1.12] tracking-[0.02em]">
                <span className="block truncate">Platizio</span>
                <span className="block truncate">Global</span>
              </span>
              <span className="mt-1.5 block truncate text-[12px] text-ink-3">
                Read · Judge · Act
              </span>
            </span>
          )}
        </Link>

        {/* Only rendered where collapsing is possible. In the mobile drawer
            there is no second width to collapse to, so the control would be
            a button that does nothing — which is the thing being fixed. */}
        {onToggleCollapse && (
          <button
            type="button"
            onClick={onToggleCollapse}
            aria-label={collapsed ? "Expand navigation" : "Collapse navigation"}
            aria-expanded={!collapsed}
            title={collapsed ? "Expand navigation" : "Collapse navigation"}
            className="grid h-9 w-9 flex-none place-items-center rounded-[10px] border border-rule-control text-ink-3 transition-colors hover:border-gold hover:text-gold"
          >
            <IconCollapse
              className={cn("h-4 w-4 transition-transform duration-300", collapsed && "rotate-180")}
            />
          </button>
        )}
      </div>

      <nav
        aria-label="Main"
        className={cn("mt-7 flex flex-col gap-1", collapsed && "w-full items-center")}
      >
        {nav.map((item) => (
          <Link
            key={item.key}
            href={item.href}
            aria-current={item.active ? "page" : undefined}
            title={collapsed ? item.label : undefined}
            className={cn(
              "group flex min-h-12 items-center gap-3.5 rounded-[12px] text-[14px] font-medium transition-all duration-300",
              collapsed ? "w-11 justify-center px-0" : "px-2.5",
              item.active
                ? "bg-[linear-gradient(140deg,rgba(var(--c-gold-rgb),0.13),rgba(var(--c-gold-rgb),0.04))] text-ink shadow-[inset_0_1px_0_rgba(var(--c-gold-hi-rgb),0.08)]"
                : "text-ink-3 hover:bg-[rgba(var(--c-gold-rgb),0.045)] hover:text-ink",
            )}
          >
            <span
              aria-hidden="true"
              className={cn(
                "grid h-9 w-9 flex-none place-items-center rounded-[10px] border transition-colors",
                item.active
                  ? "border-[rgba(var(--c-gold-rgb),0.28)] bg-[rgba(var(--c-gold-rgb),0.14)] text-gold"
                  : "border-rule-control text-ink-3 group-hover:border-[rgba(var(--c-gold-rgb),0.24)] group-hover:text-gold",
              )}
            >
              <item.Icon className="h-[18px] w-[18px]" />
            </span>
            {/* Kept in the tree when collapsed so the link never loses its
                accessible name to a purely visual change. */}
            <span className={cn(collapsed && "sr-only")}>{item.label}</span>
          </Link>
        ))}
      </nav>

      <section
        aria-labelledby="watchlist-label"
        /* min-h-0 lets this shrink inside the flex column, but without a
           scroller of its own the rows simply overflow the box it was shrunk
           to and paint over the lighting and language controls that mt-auto
           has pinned below. Scroll the list instead of spilling it. */
        className={cn("mt-7 min-h-0 overflow-y-auto pb-8", collapsed && "w-full")}
      >
        <p
          id="watchlist-label"
          className={cn("card-label pb-2.5", collapsed ? "sr-only" : "px-2.5")}
        >
          Covered stocks
        </p>
        <ul
          className={cn(
            "m-0 flex list-none flex-col gap-0.5 p-0",
            collapsed && "items-center",
          )}
        >
          {INSTRUMENTS.map((s) => {
            const selected = s.id === current;
            return (
              <li key={s.id} className={cn(collapsed && "w-full")}>
                <motion.div
                  initial={false}
                  whileHover={collapsed ? undefined : { x: 3 }}
                  transition={{ duration: 0.28, ease: "easeOut" }}
                >
                  <Link
                    href={instrumentPath(s.id)}
                    aria-current={selected ? "true" : undefined}
                    title={collapsed ? `${s.id} · ${s.short}` : undefined}
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
                      style={{ color: s.color, fontSize: 15 }}
                    >
                      {s.mark}
                    </span>
                    <span className={cn("min-w-0 flex-1", collapsed && "sr-only")}>
                      <span
                        className={cn(
                          "font-mono block text-[13px] font-medium tracking-[0.05em]",
                          selected ? "text-ink" : "text-ink-2",
                        )}
                      >
                        {s.id}
                      </span>
                      <span className="mt-0.5 block truncate text-[12px] text-ink-3">
                        {s.short}
                      </span>
                    </span>
                    {!collapsed &&
                      (liveQuotes[s.id] === undefined ? (
                        <span className="font-mono flex-none text-right text-[12px] text-ink-3">
                          —
                        </span>
                      ) : (
                        <span
                          className="font-mono flex-none text-right text-[12px]"
                          style={{ color: liveQuotes[s.id] >= 0 ? C.up : C.down }}
                        >
                          {pct(liveQuotes[s.id])}
                        </span>
                      ))}
                  </Link>
                </motion.div>
              </li>
            );
          })}
        </ul>
      </section>

      <LanguagePicker collapsed={collapsed} />
    </div>
  );
}

/**
 * The language control.
 *
 * Platizio Global is published in English only: `lib/market/format.ts` pins the
 * locale to `en-US` on purpose, because a visitor-derived locale makes the
 * server and the client disagree about decimal separators and breaks
 * hydration. So this opens, it is operable by keyboard, and it says what is
 * actually true rather than offering choices that would do nothing.
 */
function LanguagePicker({ collapsed }: { collapsed: boolean }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;

    const onDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };

    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} className={cn("relative mt-auto shrink-0", collapsed && "w-full")}>
      {open && (
        <div
          id={menuId}
          role="dialog"
          aria-label="Language"
          className={cn(
            "card edge-lit absolute bottom-[calc(100%+10px)] z-30 w-[224px] p-4",
            collapsed ? "left-0" : "left-0",
          )}
        >
          <p className="card-label">Language</p>
          <p className="mt-2 flex items-center gap-2 text-[13.5px] text-ink">
            <IconGlobe aria-hidden="true" className="h-4 w-4 flex-none text-gold" />
            English
            <span className="ml-auto text-[12px] text-gold">Current</span>
          </p>
          <p className="mt-3 border-t border-rule-section pt-3 text-[12.5px] leading-[1.6] text-ink-3">
            Platizio Global is published in English only for now. Prices and dates are
            formatted to US conventions throughout.
          </p>
        </div>
      )}

      <ThemeToggle collapsed={collapsed} />

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={collapsed ? "Language, English" : undefined}
        title={collapsed ? "Language · English" : undefined}
        className={cn(
          "flex min-h-11 items-center gap-2.5 rounded-full border text-[13px] font-medium transition-colors",
          collapsed ? "w-11 justify-center px-0" : "w-fit px-4",
          open
            ? "border-[rgba(var(--c-gold-rgb),0.34)] text-ink"
            : "border-rule-control text-ink-2 hover:border-gold hover:text-ink",
        )}
      >
        <IconGlobe className="h-4 w-4 flex-none text-gold" />
        {!collapsed && (
          <>
            English
            <IconChevron
              aria-hidden="true"
              className={cn(
                "h-3 w-3 flex-none transition-transform duration-300",
                open ? "-rotate-90" : "rotate-0",
              )}
            />
          </>
        )}
      </button>
    </div>
  );
}
