"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import {
  IconCalendar,
  IconChart,
  IconCollapse,
  IconGlobe,
  IconWatchlist,
  IconOverview,
  IconWire,
} from "@/components/icons";
import { cn } from "@/lib/ui";
import ThemeToggle from "@/components/terminal/theme-toggle";
import { SidebarWatchlist } from "@/components/terminal/watchlist/sidebar-watchlist";
import { WATCHLIST_PATH, routeTicker } from "@/components/terminal/watchlist/paths";
import { CALENDAR_PATH, TERMINAL_PATH, WIRE_PATH } from "@/lib/market/paths";

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

  /* The ticker being read, if any — never the watchlist page's own segment,
     which the shared path helper would otherwise take for the ticker
     WATCHLIST. The rail's figures are the watchlist section's business now:
     server snapshot first, live ticks over it, exactly as before, for
     whichever list is active. */
  const current = routeTicker(pathname);

  const nav = [
    {
      key: "overview",
      label: "Overview",
      Icon: IconOverview,
      href: TERMINAL_PATH,
      active: pathname === TERMINAL_PATH,
    },
    /* A destination of its own now. It used to open whichever stock was on
       screen (or Apple), which made "Watch list" a second name for the stock
       page and left no place to manage a list at all. One word, as the
       section under it, the Follow button and the page all spell it. */
    {
      key: "watchlist",
      label: "Watchlist",
      Icon: IconWatchlist,
      href: WATCHLIST_PATH,
      active: pathname === WATCHLIST_PATH,
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
    /* Three fixed bands and one that flexes: the brand and the navigation at
       the top, the lighting and language row at the foot, and the watchlist
       between them taking whatever height is left and scrolling inside it.
       The foot is a row of its own in the flow — not pinned over the column
       with mt-auto and hoping the list stops short of it — so no length of
       list and no height of window can put the two on top of each other. */
    <div
      className={cn(
        "flex h-full min-h-0 flex-col pt-5 pb-4",
        collapsed ? "items-center px-3" : "px-4",
      )}
    >
      <div
        className={cn(
          "flex flex-none gap-3",
          /* px-2.5, the nav rows' own inset, so the logo tile stands on the
             same left edge as the icon tiles and monograms beneath it. */
          collapsed ? "flex-col items-center" : "items-start justify-between px-2.5",
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
        className={cn("mt-7 flex flex-none flex-col gap-1", collapsed && "w-full items-center")}
      >
        {nav.map((item) => (
          <Link
            key={item.key}
            href={item.href}
            aria-current={item.active ? "page" : undefined}
            title={collapsed ? item.label : undefined}
            className={cn(
              "group flex min-h-12 items-center gap-3.5 rounded-[12px] text-[14px] font-medium transition-[color,background-color,border-color,box-shadow,opacity,transform] duration-300",
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

      <SidebarWatchlist collapsed={collapsed} quotes={quotes} current={current} />

      <SidebarFooter collapsed={collapsed} />
    </div>
  );
}

/**
 * The rail's foot: lighting and language, side by side on one row.
 *
 * They used to be a two-high stack pinned to the bottom with `mt-auto`, over a
 * list that only had `overflow-y-auto` to keep it out of the way — and on a
 * short window the stack sat on top of the last rows. Now the foot is its own
 * band under a hairline, the list above it scrolls within what is left, and the
 * two controls share one row so the list keeps the height a second row cost.
 *
 * The row runs the full width of the rail's content box, the same box the
 * navigation rows fill, so its left edge is the rail's left edge. Collapsed, the
 * two become the same 44px circles as everything else in the icon rail.
 */
function SidebarFooter({ collapsed }: { collapsed: boolean }) {
  return (
    <div
      className={cn(
        "relative mt-2 w-full flex-none border-t border-rule-section pt-3",
        collapsed ? "flex flex-col items-center gap-2" : "grid grid-cols-2 gap-2",
      )}
    >
      <ThemeToggle collapsed={collapsed} />
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
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();
  /* Collapsed, the rail is 76px wide and scrolls, so a panel anchored inside
     it would be clipped to a sliver. It is placed against the viewport instead,
     beside the button. Open, it anchors to the footer row (see SidebarFooter),
     whose width it shares. */
  const [fixedAt, setFixedAt] = useState<{ left: number; bottom: number } | null>(null);

  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return;

    const onDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    /* Heard in the capture phase and marked handled, so that inside the
       mobile drawer Escape closes this panel and only this panel: the
       drawer's own listener sits on the same document, was registered first,
       and would otherwise close the drawer on the same keystroke. */
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      setOpen(false);
      buttonRef.current?.focus();
    };

    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey, true);
    window.addEventListener("resize", close);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey, true);
      window.removeEventListener("resize", close);
    };
  }, [open, close]);

  useLayoutEffect(() => {
    if (!open || !collapsed) return;
    const rect = buttonRef.current?.getBoundingClientRect();
    if (!rect) return;
    setFixedAt({ left: rect.right + 12, bottom: window.innerHeight - rect.bottom });
  }, [open, collapsed]);

  return (
    /* `contents`, so the button is the footer grid's own cell and the panel
       anchors to the footer row rather than to a half-width wrapper. */
    <div ref={rootRef} className="contents">
      {open && (!collapsed || fixedAt) && (
        <div
          id={menuId}
          role="dialog"
          aria-label="Language"
          className={cn(
            "z-40",
            collapsed
              ? "fixed w-[224px]"
              : "absolute right-0 bottom-[calc(100%+10px)] left-0",
          )}
          style={collapsed && fixedAt ? { left: fixedAt.left, bottom: fixedAt.bottom } : undefined}
        >
          <div className="card edge-lit p-4 shadow-[0_18px_36px_-12px_rgba(var(--c-shadow-rgb),0.85)]">
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
        </div>
      )}

      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={collapsed ? "Language, English" : undefined}
        title={collapsed ? "Language · English" : undefined}
        className={cn(
          "flex min-h-11 items-center gap-2 rounded-full border text-[13px] font-medium transition-colors",
          /* pl-[9px]: with the 1px border, the globe lands on the icon
             column the nav tiles and monograms above share. */
          collapsed ? "w-11 justify-center px-0" : "w-full min-w-0 pr-3.5 pl-[9px]",
          open
            ? "border-[rgba(var(--c-gold-rgb),0.34)] text-ink"
            : "border-rule-control text-ink-2 hover:border-gold hover:text-ink",
        )}
      >
        <IconGlobe aria-hidden="true" className="h-4 w-4 flex-none text-gold" />
        {!collapsed && <span className="truncate">English</span>}
      </button>
    </div>
  );
}
