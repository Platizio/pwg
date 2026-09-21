"use client";

import { motion } from "motion/react";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DEFAULT_RANGE, parseFetchedRange } from "@/lib/market/ranges";
import type { RangeId, TabId } from "@/lib/market/types";
import type { InstrumentSnapshot } from "@/lib/market/instrument";
import { usePortfolio } from "@/lib/portfolio";
import { liveTail } from "@/lib/market/chart-tail";
import { useLiveQuote } from "./live-provider";
import { useHistory } from "./use-history";
import { useIntraday } from "./use-intraday";
import { useStockNews } from "./use-stock-news";
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
/* Said plainly, because a stale session presented as today's is worse than an
   empty chart: the reader is looking at the last day that traded, not this one. */
/* A trading week, for the fallback below. Not in the range table, because
   price-chart slices its source to whatever `sessions` says and a five there
   would cut the fetched 480-bucket week down to its last fifty minutes. */
const WEEK_CLOSES = 5;

const LAST_SESSION_NOTE = "The market is closed. Showing the last completed session.";

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

  /* The day chart, carried up to the headline price.

     The session's bars no longer travel with the snapshot — they were one of
     the calls a cold page made the reader wait on, and they are the only part
     of this page too fast-moving to keep in the store, so they are fetched
     here instead. Everything else about this arrangement is unchanged: the
     price above the chart comes off the websocket seconds old, the series
     underneath it is minutes old, and two numbers for one stock on one screen
     is the failure this terminal keeps coming back to. liveTail folds the tick
     onto the tail.

     Two memos rather than one, and the split is what keeps the old identity
     guarantee: liveTail returns the very same array whenever it refuses a
     tick, so the first memo's value does not change, so the second hands back
     the object it handed back last time and the chart does not rebuild its
     series for a tick that said nothing.

     The note follows the series. Until the first answer lands the snapshot's
     own note stands, which says where the bars are coming from; after it, the
     route's note says whether the market has simply not opened.

     The phase handed over is only an opening bid. It was read by whichever
     clock drew this page — the build machine's, for the five hundred prerendered
     ahead of time — so the hook keeps it just long enough to swap in the
     reader's own. */
  const tick = useLiveQuote(stock.id);
  const session = useIntraday(stock.id, snapshot.session.phase);
  const intraday = useMemo(() => liveTail(session.intraday, tick), [session.intraday, tick]);
  /* The ranges the page does not carry.
   *
   * It ships the year it opens with — 1M and 3M are slices of that same year
   * and cost nothing — and this fetches the rest on press. Before, every click
   * downloaded all of them: 2,549 bars, 234KB of a 438KB payload, on a 512MB
   * box where three such renders were enough to kill the process.
   *
   * `parseFetchedRange` answers null for the ranges already in hand, and the
   * hook then fetches nothing at all. */
  const fetched = useHistory(stock.id, parseFetchedRange(range));

  /* A fetched range replaces the DAILY series the chart slices, because that
     is the series price-chart reads for every non-intraday range. The stored
     intraday ranges come back as points of the same shape, so the chart needs
     to know nothing about where they came from. */
  const chartHistory = useMemo(() => {
    const base = {
      ...snapshot.history,
      intraday,
      intradayNote: session.note ?? snapshot.history.intradayNote,
    };

    /* The day range is the live session, and it only falls back to the stored
       one when the gateway has nothing — which is every hour the market is
       shut, and the reason this chart has always been blank overnight. */
    if (range === "1D") {
      return intraday.length > 0 || fetched.points.length === 0
        ? base
        : { ...base, intraday: fetched.points, intradayNote: LAST_SESSION_NOTE };
    }

    const wanted = parseFetchedRange(range);
    if (!wanted) return base;
    if (fetched.points.length > 0) return { ...base, daily: fetched.points };

    /* Nothing fetched. What that means depends on the range, and getting it
       wrong either way is a lie.
     *
     * A WEEK still has something to draw. The store has five years of daily
     * closes, and the last five of them ARE the week — coarser than the
     * ten-minute buckets the capture will supply, and exactly what this range
     * showed before it existed. Drawing nothing because the better series has
     * not accumulated yet would be worse than the crude line it replaced.
     *
     * FIVE YEARS has not. The page ships one year, and five years of axis over
     * one year of bars is the mislabelling this guard was written for — a
     * reader cannot see that it is wrong.
     *
     * The caption is told which of the two it got, so "5 daily closes" is
     * never printed as "10-minute bars". */
    if (range === "1W") return { ...base, daily: base.daily.slice(-WEEK_CLOSES) };
    return { ...base, daily: fetched.points };
  }, [snapshot.history, intraday, session.note, range, fetched.points]);

  /* What the caption should call the bars it is drawing. Only the week is ever
     two things — ten-minute buckets once the store has sessions, five daily
     closes until then — and a caption saying "10-minute bars" over five closes
     is exactly the sort of small invented fact this codebase refuses. */
  const chartInterval = useMemo(
    () => (range === "1W" && fetched.points.length === 0 ? "daily closes" : undefined),
    [range, fetched.points.length],
  );

  /* The newswire, widened after the page has appeared.

     The rail is already drawn from the gateway's own headlines, which ride the
     snapshot and cost nothing. The second source did not: it was the last
     third-party call left in the render and about a second and a half of a
     cold page. It is fetched here instead and the rail swaps its whole list
     for the richer one — see use-stock-news.ts for why the swap can only ever
     improve it, and why this hook, unlike useIntraday above, has no timer.

     Called here rather than inside RightRail because WorkColumn renders the
     rail TWICE — once as a real column at xl and once appended to the bottom
     of the working column below it, with the other display:none — and both
     copies mount. A hook inside the rail would be two fetches for one page.

     `settled` travels with the list because the rail has a sentence it may
     only say once both feeds have spoken — see use-stock-news.ts. */
  const newswire = useStockNews(stock.id, snapshot.news);

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
    <WorkColumn
      aside={
        <RightRail snapshot={snapshot} news={newswire.news} newsSettled={newswire.settled} />
      }
    >
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
        <PriceChart history={chartHistory} range={range} intervalLabel={chartInterval} />
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
