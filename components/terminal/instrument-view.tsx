"use client";

import { useLiveSession } from "@/components/home/use-session";

import { motion } from "motion/react";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BUCKET_MINUTES } from "@/lib/market/intraday-buckets";
import {
  coversSessions,
  easternDayOf,
  endOnClose,
  pickDaySeries,
  regularSessionOnly,
  sessionTick,
  withLiveSession,
  withTick,
} from "@/lib/market/regular-session";
import { quoteCloseDay, sessionClose } from "@/lib/market/prior-close";
import {
  DEFAULT_RANGE,
  SPACING_MINUTES,
  getRange,
  parseFetchedRange,
  spacingLabel,
} from "@/lib/market/ranges";
import type { PricePoint } from "@/lib/api/normalize/series";
import type { RangeId, TabId } from "@/lib/market/types";
import type { InstrumentSnapshot } from "@/lib/market/instrument";
import { usePortfolio } from "@/lib/portfolio";
import { liveTail } from "@/lib/market/chart-tail";
import { useLastTick, useLiveQuote, useNow, useShownQuote } from "./live-provider";
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
import { AnalystPanel } from "./panels/analyst-panel";
import { analystModelFromAvailability } from "@/lib/market/analyst";
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

/* How much of a newly selected panel must already be on screen for the page
   to be left where it is: a heading and a row, roughly. Less than that and the
   reader cannot see that anything changed. */
const PANEL_IN_VIEW = 120;

/* The pinned header's lift: the theme's shadow colour, strong on the dark
   page and a quarter of that on the cream one, where the dark strength read as
   a grey smear under the tab strip. Keyed on the theme the way globals.css
   applies it — an explicit choice, else the system's — because the only
   difference is the strength, and no token carries one. Spelled out in full
   because Tailwind reads class names as literal text. */
const PIN_SHADOW = [
  "shadow-[0_18px_28px_-24px_rgba(var(--c-shadow-rgb),0.95)]",
  "[:root[data-theme=light]_&]:shadow-[0_18px_28px_-24px_rgba(var(--c-shadow-rgb),0.28)]",
  "[@media(prefers-color-scheme:light)]:[:root:not([data-theme=dark])_&]:shadow-[0_18px_28px_-24px_rgba(var(--c-shadow-rgb),0.28)]",
].join(" ");

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
     is the failure this terminal keeps coming back to. The tick joins the end
     of whichever series is drawn — AFTER the series is chosen (`dayBase`).

     Separate memos for the choice and the tick, and the split is what keeps
     the old identity guarantee: liveTail returns the very same array whenever
     it refuses a tick, so the chart does not rebuild its series for a tick
     that said nothing.

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
  /* The ranges the page does not carry.
   *
   * It ships the year it opens with — 1M and 3M are slices of that same year
   * and cost nothing — and this fetches the rest on press. Before, every click
   * downloaded all of them: 2,549 bars, 234KB of a 438KB payload, on a 512MB
   * box where three such renders were enough to kill the process.
   *
   * `parseFetchedRange` answers null for the ranges already in hand, and the
   * hook then fetches nothing at all. */
  /* The phase wakes the fetch at the open and the bell, when a held range
     falls short of what it should reach (historyTarget in ranges.ts) and is
     asked for again — and stays drawn until the new answer lands. */
  const fetched = useHistory(stock.id, parseFetchedRange(range), marketSession.phase);

  /* A fetched range replaces the DAILY series the chart slices, because that
     is the series price-chart reads for every non-intraday range. The stored
     intraday ranges come back as points of the same shape, so the chart needs
     to know nothing about where they came from. */
  /* The chart is the REGULAR session and nothing else.
   *
   * The gateway's intraday feed runs 04:00-20:00 Eastern in one series, so the
   * day chart used to open at 13:30 in India — 04:00 in New York — instead of
   * at 19:00, when the market a reader is watching actually opens. Both the
   * live series and the stored one are trimmed to the session here, at the
   * one point where they meet, so neither path can drift from the other.
   *
   * The two trims read the bell differently. The LIVE series stops before it:
   * the gateway's live 16:00 minute is a post-market print, not the close
   * (13:00 on a half-day). The FETCHED series keeps a point stamped exactly at
   * the bell, because that is where the route puts the official close.
   *
   * This gates the DRAWING only. A pre- or post-market print is a real price
   * and the header, the tape and the change figure all keep following it — see
   * `pricesMove`. The number in front of a reader should be the latest one
   * that exists; the shape they read a session from should be one session.
   *
   * It also produces the behaviour asked for during pre- and post-market
   * without a rule of its own: the live feed's bars are all outside the
   * session, so `liveBars` is empty, the tick is not a session price, and the
   * day chart falls through to the last fetched regular session — the
   * previous day's trading, which is what a reader opening a stock before the
   * bell should see.
   *
   * The gateway's bars and the tick are kept apart until a series is chosen.
   * The bars run twenty minutes behind Polygon's (regular-session.ts has the
   * measurements), so they only ever carry the fetched session on past its
   * end; the tick, seconds old, joins whatever was chosen. Folded in first,
   * the tick alone made a "live session" at 09:30 that outranked all of
   * yesterday's, and the day chart was one point for twenty minutes. */
  const liveBars = useMemo(
    () => regularSessionOnly(session.intraday, { close: "exclude" }),
    [session.intraday],
  );
  const liveTick = useMemo(() => sessionTick(tick), [tick]);
  /* Today as the long ranges fold it in: the bars, then the tick — which at
     the open, before the gateway has a bar of today, is today's first price. */
  const liveSession = useMemo(
    () => withTick(liveBars, liveTick) as PricePoint[],
    [liveBars, liveTick],
  );
  /* Trimmed only for the MINUTE ranges. The five-year series is daily bars,
     each stamped at Eastern midnight — outside 09:30-16:00 by construction —
     so running it through the session trim dropped every point and left the
     5Y chart blank. */
  const storedSession = useMemo(
    () => (range === "5Y" ? fetched.points : regularSessionOnly(fetched.points)),
    [fetched.points, range],
  );

  /* The previous close the reader is shown, handed to the chart as the one
     number its dashed line may carry. The chart used to compute its own, and
     with the market shut drew 339.73 under a card that said otherwise.

     Read from the same hook, with the same inputs, as the card and the header
     (useShownQuote; the card prints liveProfile's `shown.previousClose ??
     profile.previousClose`, which is this expression). It is live: the page's
     own figure is fixed at render and these pages are cached, so one drawn
     before the 04:00 roll carries the session before last while the header,
     reading the tick, has moved on — and the card, the header and this line
     move together. */
  const shown = useShownQuote(stock, marketSession.phase);
  const lastTick = useLastTick(stock.id);
  const previousClose = shown.previousClose ?? stock.previousClose;
  /* When the quote behind that figure was taken, which says whose close it is
     (quoteCloseDay): the live tick's, the last tick's, or the page's own. */
  const shownAt = shown.showing
    ? (tick?.at ?? null)
    : shown.fromLast
      ? (lastTick?.at ?? null)
      : stock.asOf;
  /* Which session that figure closes. It changes at the roll, where the
     timestamp changes with every tick, so it is what the memos below key on. */
  const cardDay = useMemo(() => quoteCloseDay(shownAt), [shownAt]);

  /* The official close of any one session, from the shown figure when its
     quote says it IS that session's close (pre-market, after the 04:00 roll),
     and from the daily bars for a session older than that. Both describe
     finished sessions only — the figure rolls at 04:00 the next day, and a
     session newer than the figure's gets no close here at all, because its
     daily bar may still be running (sessionClose) — which is why no clock
     guards its use below. The route has already ended such a session on its
     own official close, and that point stands. */
  const closeOf = useCallback(
    (day: string) =>
      sessionClose(day, { daily: snapshot.history.daily, previousClose, cardDay }),
    [snapshot.history.daily, previousClose, cardDay],
  );

  /* The daily closes, reaching the session the card describes.
   *
   * The daily series runs a session behind — measured 24 Sep 2026 at 05:04
   * ET, the page's ended on the 22nd while the card already held the 23rd's
   * official 337.02 — so every range drawn from it (5Y, and the week, month
   * and year while their minutes load) ended a session short and a few
   * dollars from the dashed line. The card's close is that session's bar. */
  const daily = useMemo(() => {
    const withCard = (points: PricePoint[]) =>
      cardDay === null
        ? points
        : (endOnClose(points, closeOf(cardDay), Number.POSITIVE_INFINITY, {
            daily: true,
            day: cardDay,
          }) as PricePoint[]);
    return { page: withCard(snapshot.history.daily), withCard };
  }, [snapshot.history.daily, cardDay, closeOf]);

  /* The day chart's series before the tick, and where it came from. See
     pickDaySeries: whichever copy of the session reaches further — the
     fetched one wherever it has the session, carried on by any live bars
     past its end. A finished fetched session ends on its official close. */
  const dayBase = useMemo(() => {
    const chosen = pickDaySeries(liveBars, storedSession);
    if (chosen === liveBars || chosen.length === 0) {
      return { series: chosen, fromStore: false };
    }
    const last = chosen[chosen.length - 1];
    return {
      series: endOnClose(chosen, closeOf(easternDayOf(last.at)), Number.POSITIVE_INFINITY) as PricePoint[],
      fromStore: true,
    };
  }, [liveBars, storedSession, closeOf]);

  /* ...and the tick on its end. liveTail refuses a tick more than thirty
     minutes past the series, so before today has a bar the day chart stays
     the last session rather than drawing a line from yesterday's close. */
  const daySeries = useMemo(() => liveTail(dayBase.series, liveTick), [dayBase.series, liveTick]);

  /* The week, month, quarter and year, carried on to the live price.
   *
   * Today's live points are folded in past the end of the fetch, bucketed to
   * the range's own spacing, so 1W to 1Y end on the live price instead of on
   * whatever the fetch held when it was cached — up to three hours old for the
   * year. Held at the range's size, so today joining does not make the week
   * eight sessions. With the market shut there is no live session, and a
   * finished last session ends on its official close. */
  const longDrawn = useMemo(() => {
    if (range === "1D" || range === "5Y" || storedSession.length === 0) return null;
    const minutes = barMinutes(storedSession) ?? SPACING_MINUTES[range] ?? BUCKET_MINUTES;
    const keep = range === "1W" ? WEEK_CLOSES : getRange(range).sessions;
    const drawn = withLiveSession(storedSession, liveSession, minutes, keep) as PricePoint[];
    const last = drawn[drawn.length - 1];
    return last
      ? (endOnClose(drawn, closeOf(easternDayOf(last.at)), Number.POSITIVE_INFINITY) as PricePoint[])
      : drawn;
  }, [range, storedSession, liveSession, closeOf]);

  /* Whether the week has a week to draw.
   *
   * Capture began on 21 Sep 2026 and adds one session a day, so for the first
   * four days the store held fewer than five — and drawing them under a 1W
   * label made 1W and 1D the SAME chart with different words under it. Seven
   * daily closes are coarse, but they are a week; one day of ten-minute
   * buckets is not, however fine it is.
   *
   * Counted on what is DRAWN, today's live session included, and with a
   * running session counted before it has a point. At 09:30 the window turns
   * to include today while nothing yet has a bar of it, so the route serves
   * six sessions; counting only those sent the week back to daily closes
   * ending yesterday for the first five to fifteen minutes of every session
   * (coversSessions). Counted in New York, because a US session is 19:00 to
   * 01:30 here — counted in the reader's zone one session passes for two. */
  const now = useNow();
  const running = marketSession.phase === "open" || marketSession.phase === "halted";
  const runningDay = running ? easternDayOf(now) : null;
  const weekIsWhole =
    range === "1W" && longDrawn !== null && coversSessions(longDrawn, WEEK_CLOSES, runningDay);

  const chartHistory = useMemo(() => {
    /* The day is its own series (daySeries); every other range reads
       `daily`, which the branches below replace. */
    const base = {
      ...snapshot.history,
      daily: daily.page,
      intraday: daySeries,
      intradayNote: session.note ?? snapshot.history.intradayNote,
    };

    if (range === "1D") return base;

    const wanted = parseFetchedRange(range);
    if (!wanted) return base;
    if (range === "5Y") {
      /* Five years does NOT fall back: the page ships one year, and one year
         drawn under a five-year label would mislead. */
      return { ...base, daily: daily.withCard(storedSession) };
    }
    if (longDrawn !== null && (range !== "1W" || weekIsWhole)) {
      return { ...base, daily: longDrawn };
    }

    /* Nothing fetched. What that means depends on the range, and getting it
       wrong either way is a lie.
     *
     * A WEEK still has something to draw. The store has five years of daily
     * closes, and the last seven of them ARE the week — coarser than the
     * five-minute buckets the fetch will supply, and exactly what this range
     * showed before it existed. Drawing nothing because the better series has
     * not arrived yet would be worse than the crude line it replaced.
     *
     * The caption is told which of the two it got, so "7 daily closes" is
     * never printed as "prices, every 5 minutes". */
    if (range === "1W") return { ...base, daily: base.daily.slice(-WEEK_CLOSES) };
    /* The month, quarter and year fall back to the page's own daily closes
       while their minutes load or if the fetch fails — the chart slices those
       to the range's session count. */
    return base;
  }, [snapshot.history, daily, daySeries, storedSession, session.note, range, weekIsWhole, longDrawn]);

  /* Minute bars spanning several sessions: the week once whole, and the month,
     quarter and year once their intraday bars have arrived. The chart then marks
     days and months on its axis, shows the time under the crosshair, and does
     not slice the series by a count of DAILY rows. */
  const intradayLong = range === "1M" || range === "3M" || range === "1Y";
  const multiDay = (range === "1W" && weekIsWhole) || (intradayLong && storedSession.length > 0);

  /* What the caption should CALL the points it is drawing.
   *
   * Neither of these ranges draws one fixed thing, and the range table can only
   * name one. The week is five-minute buckets once seven sessions exist and
   * seven daily closes until then. The day is the fetched series wherever it
   * has the session — Polygon's minutes, or the store's ten-minute buckets if
   * those were not available — and the live gateway's one-minute prices only
   * when they are a newer session than the fetch.
   *
   * A caption that names an interval the chart is not drawing is the small
   * invented fact this codebase refuses: the reader cannot check it, so it has
   * to be right. */
  const chartInterval = useMemo(() => {
    if (range === "1W" && !weekIsWhole) return "daily closes";
    /* Read off the points themselves rather than assumed. The day and week
       ranges come from Polygon's and the gateway's minutes, and fall back to
       the store's ten-minute buckets if those fail — so the only way the
       caption can be sure what it is looking at is to measure. */
    if (intradayLong && storedSession.length === 0) return "daily closes";
    const fromStore =
      (range === "1D" && dayBase.fromStore) || (range === "1W" && weekIsWhole) || intradayLong;
    if (fromStore) {
      const m = barMinutes(storedSession);
      return spacingLabel(m ?? BUCKET_MINUTES);
    }
    return undefined;
  }, [range, weekIsWhole, dayBase.fromStore, storedSession, intradayLong]);

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
     anything outside those six opened as Apple.

     "Showing" means the header's figure, `shown`, not the page's own. The
     page's is the cached snapshot's: measured pre-market, the header read
     $336.05 +0.04% live while the ticket opened at 337.57 +0.16%, the
     snapshot's move off the close before last. `shown` falls back to the
     page's figure itself when there is no tick. */
  const trade = useCallback(
    () =>
      openTrade({
        id: stock.id,
        name: stock.short,
        exchange: stock.exchange ?? "",
        mark: stock.mark,
        color: stock.color,
        price: shown.price ?? 0,
        chg: shown.chg ?? 0,
      }),
    [openTrade, stock, shown.price, shown.chg],
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
     while the block pins lower — by its own `top` (69px under the compact bar
     on a phone, 0 on a desktop) plus whatever top padding the scroller holds,
     since a sticky element pins against the padding edge and not the
     scrollport. Left unshrunk, the flag lagged the pin by those 24px, and for
     that scroll the header floated over the page with nothing behind it. */
  const sentinelRef = useRef<HTMLDivElement>(null);
  const blockRef = useRef<HTMLDivElement>(null);
  /* Whatever scrolls this page: the column below `lg`'s shell is the document
     (null here), and from `lg` up it is the column's own scroller. Found by
     the observer below, which needs it too. */
  const scrollerRef = useRef<Element | null>(null);
  /* The 32px above the panel, which the panel starts under. Measured rather
     than the panel itself because the panel enters from 16px lower, and a
     transformed box would put the jump below out by that much. */
  const panelLeadRef = useRef<HTMLDivElement>(null);
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
      scrollerRef.current = root;
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

  /* A tab pressed in the PINNED strip brings its panel into view.
   *
   * The panels differ in height by thousands of pixels, and swapping one left
   * the scroll where it was: from deep in Performance (scrollY 2600 at 375px),
   * Analysts clamped the page to 1345 with the whole panel above the screen,
   * and the reader landed in the newswire under a tab they had not asked
   * for. So when the panel's first line is not on screen under the pinned
   * header, the page is moved so that it is, with the page's own 32px above
   * it. When it is already in view — the reader is just past the header,
   * looking at the chart — nothing moves.
   *
   * Only while pinned: at the top of the page the tabs sit over the chart,
   * and pressing one there should not carry the reader away from it.
   *
   * A frame later, so the new panel has been committed and laid out and the
   * browser has done any clamping of its own. Instant, because the content
   * has already changed under the reader; gliding over it helps no one. */
  const selectTab = useCallback(
    (id: TabId) => {
      setTab(id);
      if (!condensed) return;
      requestAnimationFrame(() => {
        const block = blockRef.current;
        const lead = panelLeadRef.current;
        if (!block || !lead) return;
        const scroller = scrollerRef.current;
        const pinned = block.getBoundingClientRect().bottom;
        const { top, bottom: panelTop } = lead.getBoundingClientRect();
        const floor = scroller ? scroller.getBoundingClientRect().bottom : window.innerHeight;
        if (panelTop >= pinned && panelTop <= floor - PANEL_IN_VIEW) return;
        (scroller ?? window).scrollBy({ top: top - pinned, behavior: "instant" });
      });
    },
    [condensed],
  );

  const panels: Record<TabId, React.ReactNode> = {
    overview: <OverviewPanel snapshot={snapshot} />,
    performance: <PerformancePanel snapshot={snapshot} />,
    analysts: (
      <AnalystPanel
        ticker={snapshot.profile.id}
        model={analystModelFromAvailability(snapshot.analyst, {
          ticker: snapshot.profile.id,
          price: snapshot.profile.price,
        })}
      />
    ),
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
          would scroll visibly through the gutters. `top-[69px]` clears the
          compact bar on mobile, which only became sticky when the shell's
          overflow was scoped to `lg`: 12px of padding each side of its 44px
          menu button and a 1px rule (shell.tsx). It read 62, which tucked 7px
          of this block's top padding under the bar.

          The shadow is the theme's shadow colour at a strength per theme
          (PIN_SHADOW). At one strength black enough to lift the block off the
          dark page, it laid a grey band the width of the screen across the
          cream one.

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
          "sticky top-[69px] z-20 -mx-4 px-4 pt-4 sm:-mx-6 sm:px-6 lg:top-0 lg:-mx-7 lg:px-7",
          condensed &&
            "bg-shell before:pointer-events-none before:absolute before:inset-x-0 before:bottom-full before:h-6 before:bg-shell before:content-['']",
          condensed && PIN_SHADOW,
        )}
      >
        <InstrumentHeader
          profile={stock}
          following={!!following[stock.id]}
          onToggleFollow={() => toggleFollow(stock.id)}
          onTrade={trade}
          condensed={condensed}
        />

        <TabBar active={tab} onChange={selectTab} />
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
          previousClose={previousClose}
          subject={stock.id}
          status={fetched.state}
        />
      </div>

      {/* The space above the panel, as an element so selectTab can measure
          where the panel starts without its entrance transform. */}
      <div ref={panelLeadRef} aria-hidden="true" className="h-8" />

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
        className="focus-visible:outline-offset-8"
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
