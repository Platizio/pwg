"use client";

import { MotionConfig, motion } from "motion/react";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { IconClose, IconMenu } from "@/components/icons";
import { money, pct } from "@/lib/market/format";
import { sessionAt, type Session } from "@/lib/market/session";
import { C, EASE } from "@/lib/tokens";
import { usePortfolio } from "@/lib/portfolio";
import { usePresence } from "@/lib/use-presence";
import { Grain } from "./grain";
import { InvestButton } from "./invest-button";
import { MarketStatus } from "./market-status";
import { OrderTicket } from "./order-ticket";
import { InstrumentSearch, type SearchData } from "./search";
import { Sidebar } from "./sidebar";
import { cn } from "./ui";

const NAV_EXIT_MS = 340;

/** As much of a MarketIndex as the compact bar's headline needs. */
type Lead = { short: string; level: number; chg: number };

/**
 * The terminal frame: navigation rail, the off-canvas drawer that replaces it
 * below `lg`, the compact bar that replaces both on a phone, the search that
 * heads the working column, and the order ticket. Everything routed sits
 * inside it as `children`.
 *
 * The frame stays dumb about what it wraps: it reads the book from context and
 * the current route from the pathname, so adding a route costs nothing here.
 * The figures are the exception. The compact bar carries a live index level and
 * the search reads the session's own boards, and the frame sits above the page
 * in the tree, where a client component can neither fetch data nor be handed it
 * by its children — so the layout passes all three in. Each is optional, and a
 * route that supplies none still renders.
 */
export function Shell({
  children,
  session,
  lead,
  quotes,
  search,
}: {
  children: ReactNode;
  session?: Session;
  lead?: Lead;
  /** Live day changes for the covered names, keyed by ticker. */
  quotes?: Record<string, number>;
  /** The corpus and the boards behind the search. Absent, there is no search. */
  search?: SearchData;
}) {
  /* The chrome bar earns its grid track if either half has something to say. */
  const chrome = Boolean(search || session);

  const [navOpen, setNavOpen] = useState(false);
  /* Collapsing the rail is a view preference, not a route, so it lives here:
     the shell sits in the layout and does not re-mount between pages, which
     is what lets the choice survive navigation without being persisted. */
  const [railCollapsed, setRailCollapsed] = useState(false);
  const navMounted = usePresence(navOpen, NAV_EXIT_MS);
  const { ticket, closeTrade } = usePortfolio();

  const drawerRef = useRef<HTMLDivElement>(null);
  const drawerCloseRef = useRef<HTMLButtonElement>(null);

  /*
    The drawer declares `aria-modal`, so it has to behave like one: move focus
    in, keep Tab inside it, close on Escape, and hand focus back to whatever
    opened it. Claiming modality without any of that strands a keyboard user
    behind a scrim they cannot see and cannot leave.

    Mirrors the order ticket's implementation deliberately — two dialogs in one
    shell that trap focus differently is how one of them ends up broken.
  */
  useEffect(() => {
    if (!navOpen) return;

    const opener = document.activeElement as HTMLElement | null;
    drawerCloseRef.current?.focus();

    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setNavOpen(false);
        return;
      }
      if (e.key !== "Tab") return;

      const focusable = drawerRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      if (!focusable?.length) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = overflow;
      opener?.focus?.();
    };
  }, [navOpen]);

  return (
    <MotionConfig reducedMotion="user">
      <a
        href="#terminal-main"
        className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:border focus:border-gold focus:bg-shell focus:px-4 focus:py-2 focus:text-[11px] focus:tracking-[0.16em] focus:uppercase"
      >
        Skip to content
      </a>

      <div className="flex min-h-screen justify-center p-0 lg:p-3">
        <div
          className={cn(
            /* Full bleed. The terminal used to cap at 1560px and sit centred,
               which left two columns of dead ground on a wide display; the
               rails are fixed-width, so every pixel returned goes to the
               working column where the data is. */
                /* `lg:` deliberately. Unconditional overflow-hidden made this a scroll
       container that never scrolls, so every `position: sticky` inside it —
       including the compact bar below — silently resolved to nothing. The
       rounded corners it was clipping only exist at `lg` anyway. */
    "relative flex w-full flex-col border-rule shell-lit lg:overflow-hidden",
            "lg:h-[calc(100vh-24px)] lg:rounded-[3px] lg:border lg:shadow-[0_50px_140px_rgba(0,0,0,0.75)]",
            "lg:grid",
            /* The collapsed rail keeps every destination reachable as an icon
               rather than hiding navigation behind a second click. */
            railCollapsed
              ? "lg:grid-cols-[76px_minmax(0,1fr)]"
              : "lg:grid-cols-[246px_minmax(0,1fr)]",
            /* Two rows only when there is chrome to put in the first one.
               The routed pages size themselves against their track, so an
               empty header row would take height from the page beneath it. */
            chrome ? "lg:grid-rows-[auto_minmax(0,1fr)]" : "lg:grid-rows-[minmax(0,1fr)]",
          )}
        >
          <Grain />

          <CompactBar
            onOpenNav={() => setNavOpen(true)}
            navOpen={navOpen}
            session={session}
            lead={lead}
          />

          {/* Full height beside both rows, so the search heads the working
              column rather than the whole frame — the rail opens with the
              wordmark, and a bar spanning the width would sit on top of it. */}
          <aside
            aria-label="Navigation and watchlist"
            className="hidden border-r border-rule-section rail-lit lg:row-span-full lg:block lg:overflow-y-auto"
          >
            <Sidebar
              collapsed={railCollapsed}
              onToggleCollapse={() => setRailCollapsed((v) => !v)}
              quotes={quotes}
            />
          </aside>

          {/* Off-canvas rail below `lg`. Presence is owned by usePresence
              rather than AnimatePresence — see lib/use-presence.ts. */}
          {navMounted && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: navOpen ? 1 : 0 }}
              transition={{ duration: 0.25 }}
              style={{ pointerEvents: navOpen ? "auto" : "none" }}
              className="fixed inset-0 z-40 lg:hidden"
            >
              <button
                type="button"
                aria-label="Close navigation"
                onClick={() => setNavOpen(false)}
                className="absolute inset-0 h-full w-full cursor-default bg-[rgba(6,5,4,0.78)] backdrop-blur-[7px]"
              />
              <motion.div
                ref={drawerRef}
                initial={{ x: "-100%" }}
                animate={{ x: navOpen ? 0 : "-100%" }}
                transition={{ duration: NAV_EXIT_MS / 1000, ease: EASE }}
                role="dialog"
                aria-modal="true"
                aria-label="Navigation and watchlist"
                /* The drawer is navigation, so following any link inside it
                   is the signal that it has done its job. Delegated from the
                   panel rather than wired into each link, so a link added
                   later cannot forget to close it. */
                onClick={(e) => {
                  if ((e.target as HTMLElement).closest("a")) setNavOpen(false);
                }}
                className="absolute inset-y-0 left-0 w-[86%] max-w-[320px] overflow-y-auto border-r border-rule-section bg-rail"
              >
                <button
                  ref={drawerCloseRef}
                  type="button"
                  onClick={() => setNavOpen(false)}
                  aria-label="Close navigation"
                  className="absolute top-4 right-4 z-10 grid h-11 w-11 place-items-center border border-rule text-ink-3 transition-colors hover:border-gold hover:text-ink"
                >
                  <IconClose className="h-4 w-4" />
                </button>
                <Sidebar quotes={quotes} />
              </motion.div>
            </motion.div>
          )}

          {/*
            The terminal's chrome bar, held above every route: the one way into
            a name on the left, and whether the market is trading on the right.

            Both used to be somewhere else. The search had a band of its own
            stacked above the page's header, so a reader met two ruled strips
            before any content and the box floated alone in a width it did not
            need. The session state was written by the dashboard and therefore
            stated on exactly one route — a reader on /instrument/NVDA could
            not tell whether the figures in front of them were live. They are
            now the two ends of one bar, and there is only one bar.

            It sits between the compact bar and the page on a phone and heads
            the working column from `lg`, which is the same place in the
            reading order at both sizes. The stacking is a ladder rather than a
            taste: the panel has to fall over a page's own sticky header (20)
            and stay under the compact bar (30), which slides over this strip
            as soon as the reader scrolls on a phone.
          */}
          {chrome && (
            <div className="relative z-[25] grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 border-b border-rule-section px-4 py-3 sm:gap-x-6 sm:px-6 lg:px-7">
              <div className="min-w-0 max-w-[460px]">
                {search && <InstrumentSearch data={search} />}
              </div>

              {/* The bar's right-hand end: whether the market is trading, and
                  the one way out of a terminal that reads into the platform
                  that transacts.

                  The two are gated differently on purpose. The session goes off
                  the phone, where the compact bar above already names it and
                  the two of them side by side would leave the search a stub.
                  Invest stays at every width: it is stated nowhere else in the
                  terminal chrome, and an action that disappears at the size
                  most readers arrive at is not a call to action. The search
                  gives up the width instead, which is what minmax(0,1fr) on
                  this grid's first track has always been for. */}
              <div className="flex items-center justify-end gap-2 sm:gap-3">
                {session && (
                  <div className="hidden sm:flex">
                    <MarketStatus session={session} />
                  </div>
                )}
                <InvestButton />
              </div>
            </div>
          )}

          {children}

          <OrderTicket
            open={!!ticket}
            stock={ticket}
            onClose={closeTrade}
          />
        </div>
      </div>
    </MotionConfig>
  );
}

/**
 * The only chrome below `lg`, where both rails collapse. It carries whatever
 * the current route's headline figure is — the instrument on a detail page,
 * the lead index on the dashboard — so the essential number survives scrolling
 * on a phone.
 */
function CompactBar({
  onOpenNav,
  navOpen,
  /* The session is a clock and a calendar, so it is safe to derive locally
     when a route hands none down. The lead index is a price, and there is no
     honest local source for a price: when it is absent the bar shows the
     market state and no figure at all, rather than the seeded number it used
     to fall back to. A plausible wrong price is worse than a blank one. */
  session = sessionAt(),
  lead,
}: {
  onOpenNav: () => void;
  navOpen: boolean;
  session?: Session;
  lead?: Lead;
}) {
  const pathname = usePathname();
  const match = /^\/instrument\/([^/]+)/.exec(pathname);

  /* On an instrument route the bar names the instrument and shows no figure.
     It sits above the page in the tree, so it cannot see the snapshot, and it
     used to fill the gap from the authored instruments file — which is how a
     mobile header came to read 147.04 while the page beneath it read 303.99.
     The real price is a few pixels below; a wrong one here is worse than
     none. */
  const headline = match
    ? {
        key: decodeURIComponent(match[1]).toUpperCase(),
        sub: session.label,
        value: null,
        chg: null,
      }
    : lead
      ? {
          key: lead.short,
          sub: session.label,
          value: money(lead.level),
          chg: lead.chg,
        }
      : { key: "Platizio Global", sub: session.label, value: null, chg: null };

  return (
    /* Opaque, not `rail-lit`. The bar carries `sticky top-0` and only began
       actually sticking once the shell's overflow was scoped to `lg` — at
       which point its translucent ground let the page scroll visibly through
       it. A sticky surface has to be a surface. */
    <div className="sticky top-0 z-30 flex items-center gap-3 border-b border-rule-section bg-shell px-4 py-3 lg:hidden">
      <button
        type="button"
        onClick={onOpenNav}
        aria-label="Open navigation and watchlist"
        aria-expanded={navOpen}
        className="grid h-11 w-11 flex-none place-items-center border border-rule text-ink-3 transition-colors hover:border-gold hover:text-ink"
      >
        <IconMenu className="h-4 w-4" />
      </button>
      <div className="min-w-0 flex-1">
        <p className="font-mono truncate text-[11.5px] tracking-[0.06em]">
          {headline.key}
        </p>
        <p className="truncate text-[11px] text-ink-3">{headline.sub}</p>
      </div>
      <div className="text-right">
        {headline.value === null || headline.chg === null ? (
          <p className="font-mono text-[11px] text-ink-3">No quote</p>
        ) : (
          <>
            <p className="font-serif text-[21px] leading-none">{headline.value}</p>
            <p
              className="font-mono mt-1 text-[11px]"
              style={{ color: headline.chg >= 0 ? C.up : C.down }}
            >
              {pct(headline.chg)}
            </p>
          </>
        )}
      </div>
    </div>
  );
}
