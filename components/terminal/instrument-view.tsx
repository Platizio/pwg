"use client";

import { useLiveSession } from "@/components/home/use-session";

import { motion } from "motion/react";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BUCKET_MINUTES, sessionsAt } from "@/lib/market/intraday-buckets";
import { regularSessionOnly } from "@/lib/market/regular-session";
import { DEFAULT_RANGE, parseFetchedRange, spacingLabel } from "@/lib/market/ranges";
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
/* What "1W" spans: seven TRADING days, weekends excluded.
 *
 * Matches SESSIONS_KEPT in intraday-buckets.ts, so the stored buckets and the
 * daily-close fallback describe the same window rather than two nearly-equal
 * ones — the bug that let one captured session pass for a week. */
const WEEK_CLOSES = 7;

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
  /* The phase decides whether the day chart polls for new bars, so it has to
     be the live one — a page rendered before the bell would otherwise never
     start polling once the session opened. */
  const marketSession = useLiveSession(snapshot.session);
  const session = useIntraday(stock.id, marketSession.phase);
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
  /* The chart is the REGULAR session and nothing else.
   *
   * The gateway's intraday feed runs 04:00-20:00 Eastern in one series, so the
   * day chart used to open at 13:30 in India — 04:00 in New York — instead of
   * at 19:00, when the market a reader is watching actually opens. Both the
   * live series and the stored one are trimmed to 09:30-16:00 ET here, at the
   * one point where they meet, so neither path can drift from the other.
   *
   * This gates the DRAWING only. A pre- or post-market print is a real price
   * and the header, the tape and the change figure all keep following it — see
   * `pricesMove`. The number in front of a reader should be the latest one
   * that exists; the shape they read a session from should be one session.
   *
   * It also produces the behaviour asked for during pre- and post-market
   * without a rule of its own: the live feed's bars are all outside the
   * session, so `liveSession` is empty, and the day chart falls through to the
   * last stored regular session — the previous day's trading, which is what a
   * reader opening a stock before the bell should see. */
  const liveSession = useMemo(() => regularSessionOnly(intraday), [intraday]);
  /* Trimmed only for the MINUTE ranges. The five-year series is daily bars,
     each stamped at Eastern midnight — outside 09:30-16:00 by construction —
     so running it through the session trim dropped every point and left the
     5Y chart blank. */
  const storedSession = useMemo(
    () => (range === "5Y" ? fetched.points : regularSessionOnly(fetched.points)),
    [fetched.points, range],
  );

  /* How many TRADING days the fetched buckets actually cover. Counted in New
     York, because a US session is 13:30 to 05:30 the next morning here — count
     it in the reader's zone and one session passes for two. Counted on the
     TRIMMED series, so a day present only as pre-market does not count as a
     session the chart can draw. */
  const fetchedSessions = useMemo(
    () => sessionsAt(storedSession.map((p) => p.at)),
    [storedSession],
  );

  /* Whether the week has a week to draw. Capture began on 21 Sep 2026 and adds
     one session a day, so for the first four days the store held fewer than
     five — and drawing them under a 1W label made 1W and 1D the SAME chart
     with different words under it. Five daily closes are coarse, but they are
     a week; one day of ten-minute buckets is not, however fine it is. */
  const weekIsWhole = fetchedSessions >= WEEK_CLOSES;

  const chartHistory = useMemo(() => {
    const base = {
      ...snapshot.history,
      intraday: liveSession,
      intradayNote: session.note ?? snapshot.history.intradayNote,
    };

    /* The day range is the live session, and it falls back to the stored one
       whenever the gateway has nothing INSIDE the session — which is every
       hour the market is shut, and now also the pre- and post-market hours,
       whose bars this chart does not draw. */
    if (range === "1D") {
      return liveSession.length > 0 || storedSession.length === 0
        ? base
        : { ...base, intraday: storedSession, intradayNote: LAST_SESSION_NOTE };
    }

    const wanted = parseFetchedRange(range);
    if (!wanted) return base;
    if (range === "1W" && !weekIsWhole) {
      /* Not a week yet. Fall through to the daily closes below. */
    } else if (storedSession.length > 0) {
      return { ...base, daily: storedSession };
    }

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
    /* The month, quarter and year fall back to the page's own daily closes
       while their minutes load or if the fetch fails — the chart slices those
       to the range's session count. Five years does NOT: the page ships one
       year, and one year drawn under a five-year label would mislead. */
    if (range === "5Y") return { ...base, daily: storedSession };
    return base;
  }, [snapshot.history, liveSession, storedSession, session.note, range, weekIsWhole]);

  /* Minute bars spanning several sessions: the week once whole, and the month,
     quarter and year once their intraday bars have arrived. The chart then marks
     days and months on its axis, shows the time under the crosshair, and does
     not slice the series by a count of DAILY rows. */
  const intradayLong = range === "1M" || range === "3M" || range === "1Y";
  const multiDay = (range === "1W" && weekIsWhole) || (intradayLong && storedSession.length > 0);

  /* What the caption should CALL the bars it is drawing.
   *
   * Neither of these ranges draws one fixed thing, and the range table can only
   * name one. The week is ten-minute buckets once five sessions exist and five
   * daily closes until then. The day is the live gateway's one-minute bars
   * while the market is open, and the store's ten-minute buckets when it is
   * shut — which is most of the day from India, and which was printing "70
   * 1-minute bars" over seventy ten-minute ones.
   *
   * A caption that names an interval the chart is not drawing is the small
   * invented fact this codebase refuses: the reader cannot check it, so it has
   * to be right. */
  const chartInterval = useMemo(() => {
    if (range === "1W" && !weekIsWhole) return "daily closes";
    /* Read off the bars themselves rather than assumed. The day and week
       ranges now come from the gateway's minutes (1-minute and 5-minute), and
       fall back to the store's ten-minute buckets if that call fails — so the
       only way the caption can be sure what it is looking at is to measure. */
    if (intradayLong && storedSession.length === 0) return "daily closes";
    const fromStore =
      (range === "1D" && liveSession.length === 0 && storedSession.length > 0) ||
      (range === "1W" && weekIsWhole) ||
      intradayLong;
    if (fromStore) {
      const m = barMinutes(storedSession);
      return spacingLabel(m ?? BUCKET_MINUTES);
    }
    return undefined;
  }, [range, weekIsWhole, liveSession.length, storedSession, intradayLong]);

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
        <PriceChart
          history={chartHistory}
          range={range}
          intervalLabel={chartInterval}
          multiDay={multiDay}
        />
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

/* The spacing of a minute series, in minutes: the smallest gap between
   neighbouring bars inside a session. Buckets sit on multiples of their own
   width, so the smallest gap IS the width; an overnight gap is never the
   smallest, and a missing minute only makes one gap larger. */
function barMinutes(points: readonly { at: number }[]): number | null {
  let best = Infinity;
  for (let i = 1; i < points.length; i += 1) {
    const gap = points[i].at - points[i - 1].at;
    if (gap > 0 && gap < best) best = gap;
  }
  return Number.isFinite(best) ? Math.round(best / 60_000) || null : null;
}
