"use client";

import { motion } from "motion/react";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import { DEFAULT_RANGE } from "@/lib/market/ranges";
import type { RangeId, TabId } from "@/lib/market/types";
import type { InstrumentSnapshot } from "@/lib/market/instrument";
import { usePortfolio } from "@/lib/portfolio";
import { EASE } from "@/lib/tokens";
import { InstrumentHeader } from "./instrument-header";
import { CompetitorsPanel } from "./panels/competitors-panel";
import { FundamentalsPanel } from "./panels/fundamentals-panel";
import { HoldingsPanel } from "./panels/holdings-panel";
import { OverviewPanel } from "./panels/overview-panel";
import { PerformancePanel } from "./panels/performance-panel";
import { TechnicalsPanel } from "./panels/technicals-panel";
import { PriceHeader } from "./price-header";
import { RightRail } from "./right-rail";
import { TabBar } from "./tab-bar";
import { cn } from "./ui";
import { WorkColumn } from "./work-column";

/* The canvas has nothing to render on the server, and shipping it there only
   delays hydration. The skeleton reserves the exact height so nothing shifts. */
const PriceChart = dynamic(
  () => import("./price-chart").then((m) => m.PriceChart),
  {
    ssr: false,
    loading: () => (
      <div className="h-full w-full animate-pulse bg-[var(--tint-gold-ghost)]" />
    ),
  },
);

/**
 * The screener: one instrument, read five ways. Chart state is local because
 * it is a reading preference, not a fact about the book — a range or a candle
 * mode is meaningless anywhere else in the terminal.
 */
export function InstrumentView({ snapshot }: { snapshot: InstrumentSnapshot }) {
  const stock = snapshot.profile;
  const [range, setRange] = useState<RangeId>(DEFAULT_RANGE);
  const [tab, setTab] = useState<TabId>("overview");

  const { following, toggleFollow, openTrade, portfolio, sharesOf } = usePortfolio();
  const held = sharesOf(stock.id);

  /* The quote the desk trades on is the one this page is showing, handed over
     whole. It used to pass an id, which the desk looked up in the six mock
     names — so a ticket on a $310 Apple opened at 147.04, and a ticket on
     anything outside those six opened as Apple. */
  const trade = useCallback(
    () =>
      openTrade({
        id: stock.id,
        name: stock.short,
        exchange: stock.exchange ?? "",
        mark: stock.mark,
        color: stock.color,
        price: stock.price ?? 0,
        chg: stock.chg ?? 0,
      }),
    [openTrade, stock],
  );

  /* A zero-height sentinel above the header, watched so the block knows the
     moment it starts sticking. Everything that should only be true of a
     floating header hangs off this one flag: the condensed layout, the opaque
     ground and the shadow.

     An observer rather than a scroll listener: this fires twice per page
     rather than on every frame, and it needs no reference to whichever
     ancestor happens to be the scroller at this breakpoint.

     The root is shrunk by the distance between the two, because they are not
     in the same place. The sentinel leaves the scrollport at its very top edge,
     while the block pins lower — by its own `top` (62px under the compact bar
     on a phone, 0 on a desktop) plus whatever top padding the scroller holds,
     since a sticky element pins against the padding edge and not the
     scrollport. Left unshrunk, the flag lagged the pin by those 24px, and for
     that scroll the header floated over the page with nothing behind it. */
  const sentinelRef = useRef<HTMLDivElement>(null);
  const blockRef = useRef<HTMLDivElement>(null);
  const [condensed, setCondensed] = useState(false);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    const block = blockRef.current;
    if (!sentinel || !block) return;

    let observer: IntersectionObserver | undefined;

    /* Both terms are read rather than written down: `top` steps at `lg` and
       the scroller only exists there, so a literal would be wrong at one size
       or the other, and wrong again the day either value is edited in CSS. */
    const watch = () => {
      observer?.disconnect();

      /* Named as the root rather than left implicit. `rootMargin` shrinks the
         root's own rectangle and nothing else — an intermediate scroller still
         clips at its full height — so with the viewport as root the margin had
         no effect at all and the flag went on lagging the pin. */
      let root: Element | null = null;
      let padding = 0;
      for (let el = block.parentElement; el; el = el.parentElement) {
        const overflowY = getComputedStyle(el).overflowY;
        if (overflowY === "auto" || overflowY === "scroll") {
          root = el;
          padding = parseFloat(getComputedStyle(el).paddingTop) || 0;
          break;
        }
      }
      const offset = Math.round(
        (parseFloat(getComputedStyle(block).top) || 0) + padding,
      );

      observer = new IntersectionObserver(
        ([entry]) => setCondensed(!entry.isIntersecting),
        { root, threshold: 0, rootMargin: `-${offset}px 0px 0px 0px` },
      );
      observer.observe(sentinel);
    };

    watch();
    window.addEventListener("resize", watch);
    return () => {
      window.removeEventListener("resize", watch);
      observer?.disconnect();
    };
  }, []);

  const panels: Record<TabId, React.ReactNode> = {
    overview: <OverviewPanel snapshot={snapshot} />,
    performance: <PerformancePanel snapshot={snapshot} />,
    fundamentals: <FundamentalsPanel snapshot={snapshot} />,
    technicals: <TechnicalsPanel snapshot={snapshot} />,
    competitors: <CompetitorsPanel snapshot={snapshot} />,
    holdings: (
      <HoldingsPanel
        snapshot={snapshot}
        held={held}
        portfolio={portfolio}
        onTrade={trade}
      />
    ),
  };

  return (
    <WorkColumn aside={<RightRail snapshot={snapshot} />}>
      <div ref={sentinelRef} aria-hidden="true" className="h-px" />

      {/* The name and the tabs stay; everything under them scrolls.

          One wrapper rather than two sticky elements: InstrumentHeader returns
          a fragment, and its height is not fixed — the title steps at `sm` and
          the Follow/Trade pair wraps on narrow widths — so a hardcoded offset
          for the tab bar would be wrong at most sizes.

          The negative margins pull the opaque ground out to the column edges;
          the scroller owns the horizontal padding, so without them content
          would scroll visibly through the gutters. `top-[62px]` clears the
          compact bar on mobile, which only became sticky when the shell's
          overflow was scoped to `lg`.

          The `::before` band is the vertical half of the same problem. A
          sticky element pins against its scroller's *padding* edge, not its
          scrollport, so the column's own `pt-6` left a 24px window between the
          chrome bar and the pinned header — and the chart scrolled through it
          in full view. The band travels with the block and closes it.

          Ground, band and shadow all arrive together and only while the block
          is floating. An always-opaque header punched a hard-edged rectangle
          out of the shell's own light: the champagne wash falls 440px from the
          top of the terminal, and this block covered the first 200 of them, so
          the glow died at a razor edge along the chrome bar and the page below
          read as flat black. Unpinned, the block has no ground of its own and
          the light simply falls through it. */}
      <div
        ref={blockRef}
        className={cn(
          "sticky top-[62px] z-20 -mx-4 px-4 pt-4 sm:-mx-6 sm:px-6 lg:top-0 lg:-mx-7 lg:px-7",
          condensed &&
            "bg-shell shadow-[0_18px_28px_-24px_rgba(0,0,0,0.95)] before:pointer-events-none before:absolute before:inset-x-0 before:bottom-full before:h-6 before:bg-shell before:content-['']",
        )}
      >
        <InstrumentHeader
          profile={stock}
          following={!!following[stock.id]}
          onToggleFollow={() => toggleFollow(stock.id)}
          onTrade={trade}
          condensed={condensed}
        />

        <TabBar active={tab} onChange={setTab} />
      </div>

      <div className="pt-7" />

      <PriceHeader
        profile={stock}
        session={snapshot.session}
        range={range}
        onRange={setRange}
      />

      <div className="h-[240px] sm:h-[300px] lg:h-[340px]">
        <PriceChart history={snapshot.history} range={range} />
      </div>

      {/* Keyed entrance rather than AnimatePresence: the outgoing panel has
          nothing to say on its way out, and `mode="wait"` would hold the
          incoming one back behind an exit that never resolves in this stack. */}
      <motion.div
        key={`${tab}-${stock.id}`}
        id={`panel-${tab}`}
        role="tabpanel"
        aria-labelledby={`tab-${tab}`}
        tabIndex={0}
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: EASE }}
        className="mt-8 focus-visible:outline-offset-8"
      >
        {panels[tab]}
      </motion.div>
    </WorkColumn>
  );
}
