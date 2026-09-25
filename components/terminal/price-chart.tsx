"use client";

import {
  AreaSeries,
  ColorType,
  CrosshairMode,
  LineStyle,
  createChart,
  type AutoscaleInfoProvider,
  type BarPrice,
  type IChartApi,
  type IPriceLine,
  type ISeriesApi,
  type MouseEventParams,
  type SeriesType,
  type Time,
  TickMarkType,
  type UTCTimestamp,
} from "lightweight-charts";
import { motion, useReducedMotion } from "motion/react";
import { Fragment, useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { formatStamp, money } from "@/lib/market/format";
import { emptyChartText, rangeCaptionParts, readerZone, viewShowsAll } from "@/lib/market/ranges";
import { chartReference } from "@/lib/market/prior-close";
import { getRange } from "@/lib/market/ranges";
import type { RangeId } from "@/lib/market/types";
import type { PricePoint } from "@/lib/api/normalize/series";
import { chartPalette, EASE, type ChartPalette, chartFontFamily } from "@/lib/tokens";

/**
 * The resolved canvas palette, kept in step with the page's lighting.
 *
 * <canvas> cannot resolve CSS custom properties, so the chart needs literals.
 * `chartPalette()` reads them off the document — which does not exist during
 * server render, so the first value is the dark fallback and is corrected on
 * mount. The observer covers an explicit choice (`data-theme` on <html>); the
 * media query covers a reader still following their system setting.
 */
function useChartPalette(): ChartPalette {
  const [palette, setPalette] = useState<ChartPalette>(chartPalette);

  useEffect(() => {
    const read = () => setPalette(chartPalette());
    read();

    const observer = new MutationObserver(read);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });

    const mq = window.matchMedia("(prefers-color-scheme: light)");
    mq.addEventListener("change", read);

    return () => {
      observer.disconnect();
      mq.removeEventListener("change", read);
    };
  }, []);

  return palette;
}

/* How close, in pixels between centres, an axis label may come to the
   prev-close tag before it is left out: half the tag (about 14px tall at the
   axis's 10px type), half a label, and a few pixels of air. */
const TAG_CLEARANCE = 15;

export function PriceChart({
  history,
  range,
  intervalLabel,
  multiDay = false,
  previousClose,
  subject,
  status,
}: {
  /* Both series, so the control can switch between them without a refetch:
     the day comes from minute bars, everything else is a slice of the daily
     pull the snapshot already holds. */
  history: { daily: PricePoint[]; intraday: PricePoint[]; intradayNote: string | null };
  range: RangeId;
  /* What the caption should call these bars, when it is not what the range
     nominally holds. A week is ten-minute buckets once the store has sessions
     to draw them from, and five daily closes until it does; saying "10-minute
     bars" over five closes would be the kind of small invented fact the rest
     of this file refuses. */
  intervalLabel?: string;
  /* Minute-level bars spanning several sessions (the week range, drawn from
     the gateway's intraday window). The axis marks each day and the crosshair
     shows the time, rather than treating five-minute bars as daily closes. */
  multiDay?: boolean;
  /* The page's "Previous close" figure — the ONE number the dashed line may
     show. Not computed here: the chart's own guess (339.73, the last bucket of
     the session before the final one) sat under a card printing a different
     number, and the owner asked, reasonably, which was the previous close.
     Null draws no line, as the card then draws a dash. */
  previousClose: number | null;
  /* Whose prices these are. A different stock is a new series, and the
     entrance plays for it; a live point joining the same series is not. */
  subject?: string;
  /* Where the fetch for this range stands (use-history.ts), so an empty chart
     can say it is loading, or that loading failed, instead of claiming there
     is no history. Only read while nothing is drawn. */
  status?: "idle" | "loading" | "ready" | "empty" | "failed";
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const tipRef = useRef<HTMLDivElement>(null);
  const tipPriceRef = useRef<HTMLSpanElement>(null);
  const tipDeltaRef = useRef<HTMLSpanElement>(null);
  const tipMetaRef = useRef<HTMLDivElement>(null);

  const chartRef = useRef<IChartApi | null>(null);
  const mainRef = useRef<ISeriesApi<SeriesType> | null>(null);
  const prevLineRef = useRef<IPriceLine | null>(null);
  /* The price the prev-close tag sits at on the axis, or null with no line. */
  const tagRef = useRef<number | null>(null);
  /* How many points the series held after its last setData — what the
     visible window is measured against to tell a fitted view from a zoomed
     one (viewShowsAll). */
  const drawnRef = useRef(0);
  /* Which series type `mainRef` currently holds — the data effect needs it to
     pick the right payload shape without re-running on every series swap. */

  const reduceMotion = useReducedMotion();

  const P = useChartPalette();
  const rangeDef = useMemo(() => getRange(range), [range]);
  const intraday = rangeDef.intraday;
  /* Whether the bars carry a time of day worth showing: the day range always,
     the week range when it is drawn from minutes rather than closes. */
  const clocked = intraday || multiDay;

  /* The axis labels its own ticks.

     Left to itself the library mixes granularities inside one axis: a year of
     daily bars came out reading "Oct · Nov · 2 · 2026 · Feb · 3 · Apr", where
     the bare numbers are days of the month sitting among month names. One
     vocabulary per axis — clock inside a session, month across a year, year at
     the boundary.

     Fixed en-US to match every other formatter in the terminal. */
  /* Resolved once. The chart is client-only, so this is the browser's zone. */
  const zone = useMemo(() => readerZone(), []);

  /* Built once per zone, not per call.
   *
   * Both formatters below run on the chart's hot path — the axis one per
   * visible tick on every redraw, the crosshair one on every mouse move — and
   * CONSTRUCTING an Intl.DateTimeFormat is the expensive half of using one:
   * measured at ~24us to build-and-use against ~0.4us to reuse. Building them
   * inside the callbacks made panning and hovering pay that thirty-fold cost
   * for a string that only ever depends on the zone. */
  const F = useMemo(() => {
    const of = (opts: Intl.DateTimeFormatOptions) =>
      new Intl.DateTimeFormat("en-US", { timeZone: zone, ...opts });
    return {
      clock: of({ hour: "2-digit", minute: "2-digit", hour12: false }),
      month: of({ month: "short" }),
      year: of({ year: "numeric" }),
      dayClock: of({
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }),
      fullDate: of({ month: "short", day: "numeric", year: "numeric" }),
      monthDay: of({ month: "short", day: "numeric" }),
    };
  }, [zone]);

  const tickMarkFormatter = useCallback(
    (time: UTCTimestamp, tickMarkType: TickMarkType) => {
      const ms = (time as number) * 1000;
      /* The READER's zone, and the caption under the chart names it so the
         hour is never ambiguous. This axis was UTC once — a US session opening
         at 13:30 with nothing saying which clock that was — and then New York,
         which is the market's clock but not the clock of the person looking at
         it. Someone in India watches this session between 7pm and 1:30am; an
         axis reading 09:30 while they sit down at 19:00 makes them do the
         conversion on every glance. */
      if (intraday) return F.clock.format(ms);
      /* A week of minutes: each session's first tick names the day, the ticks
         inside it name the time. */
      if (multiDay) {
        if (tickMarkType === TickMarkType.Time || tickMarkType === TickMarkType.TimeWithSeconds) {
          return F.clock.format(ms);
        }
        if (tickMarkType === TickMarkType.Year) return F.year.format(ms);
        /* A month boundary on the quarter or the year reads "Oct"; a day
           boundary on the week or the month reads "Oct 14". */
        if (tickMarkType === TickMarkType.Month) return F.month.format(ms);
        return F.monthDay.format(ms);
      }
      if (tickMarkType === TickMarkType.Year) return F.year.format(ms);
      return F.month.format(ms);
    },
    [intraday, multiDay, F],
  );

  /* The crosshair's own time label, which the axis formatter above does NOT
     cover.
   *
   * `tickMarkFormatter` styles the ticks printed along the axis; the label that
   * follows the crosshair is a separate setting, `localization.timeFormatter`,
   * and it was never set. Its default renders the UTCTimestamp as UTC — so on
   * an intraday chart a reader in India saw 19:00 on the axis, 13:30 under the
   * crosshair and 13:30 again in the tooltip: three numbers for one instant,
   * none of them their own clock. Same zone as everything else here. */
  const timeFormatter = useCallback(
    (time: UTCTimestamp) => {
      const ms = (time as number) * 1000;
      return clocked ? F.dayClock.format(ms) : F.fullDate.format(ms);
    },
    [clocked, F],
  );


  const data = useMemo(() => {
    const source = rangeDef.source === "intraday" ? history.intraday : history.daily;
    /* `sessions` counts DAILY rows, so it slices only a daily series. A
       multi-day minute series is already exactly its window — slicing it to 21
       rows would have cut a month of 15-minute bars down to its last five
       hours. */
    const raw =
      rangeDef.sessions && !multiDay
        ? source.slice(Math.max(0, source.length - rangeDef.sessions))
        : source;
    const slice = raw;

    const at = (p: PricePoint) => Math.floor(p.at / 1000) as UTCTimestamp;

    /* Two references, kept apart (see chartReference). `prev` is the card's
       figure and nothing else. `basis` colours the area and measures the
       tooltip: on the day, the close BEFORE the session on
       screen — not the previous minute, which once painted a session up 2%
       red because its last tick was down a cent; on every longer range, the
       first point drawn, so a week is read from where the week began. Before
       the bell the two differ on the day chart, and correctly: the chart is
       the last completed session measured from the close before it, and the
       line is that session's own close, where the chart now ends. */
    const reference = chartReference({
      intraday: rangeDef.intraday,
      points: slice,
      daily: history.daily,
      previousClose,
    });

    return {
      values: slice.map((p) => p.price),
      /* The real ends of what is drawn. The window is a tail-slice of ROWS,
         not a date range, so these are the only honest source for the caption:
         if the feed's last row is Friday and today is Tuesday, 1W is showing
         last Mon-Fri and only these two numbers reveal it. */
      firstAt: raw[0]?.at ?? null,
      lastAt: raw.at(-1)?.at ?? null,
      line: slice.map((p) => ({ time: at(p), value: p.price })),
      base: slice[0]?.price ?? 0,
      basis: reference.basis ?? 0,
      prev: reference.line,
      empty: slice.length === 0,
      /* The extremes of this range, wicks included. The price axis is pinned
         to these rather than to whatever is inside the visible window. */
      bounds: slice.length
        ? slice.reduce(
            (acc, p) => ({
              min: Math.min(acc.min, p.low ?? p.price),
              max: Math.max(acc.max, p.high ?? p.price),
            }),
            { min: Infinity, max: -Infinity },
          )
        : null,
    };
  }, [history, rangeDef, multiDay, previousClose]);

  /* The crosshair handler is subscribed once, with the chart, so it cannot
     close over render values — they freeze at whatever the mount-time range
     was, which is always the 1Y default because this component is ssr:false.
     Switching to 1D then measured every hovered bar against a year-old base
     and printed a date with no time. This mirror is refreshed after every
     render and read inside the handler instead. */
  const liveRef = useRef({ base: data.basis, intraday: clocked, P });
  useEffect(() => {
    liveRef.current = { base: data.basis, intraday: clocked, P };
  });

  /* What the chart is actually showing, in words: interval, count, real span,
     timezone. None of this was stated anywhere before — six buttons labelled
     1D through 5Y and nothing distinguishing five daily closes from a week of
     minutes. */
  /* In parts, so the visible line can keep each one whole where a phone wraps
     it (rangeCaptionParts); joined, for the text alternative. */
  const captionParts = useMemo(
    () =>
      rangeCaptionParts(
        intervalLabel ? { ...rangeDef, interval: intervalLabel } : rangeDef,
        data.firstAt,
        data.lastAt,
        data.values.length,
      ),
    [rangeDef, intervalLabel, data.firstAt, data.lastAt, data.values.length],
  );
  const caption = captionParts.join(" · ");

  const last = data.values.at(-1) ?? 0;
  const up = last >= data.basis;
  const tone = up ? P.up : P.down;

  /* Create the chart once and keep it alive across every data change — tearing
     it down per ticker would drop the user's pan and flash the canvas. */
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const chart = createChart(host, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: P.ink4,
        fontFamily: chartFontFamily(),
        fontSize: 10,
        attributionLogo: false,
        panes: {
          separatorColor: P.ruleSection,
          separatorHoverColor: P.ruleMono,
          enableResize: false,
        },
      },
      grid: {
        horzLines: { color: P.gridH },
        vertLines: { color: P.gridV },
      },
      /* The design runs its price ladder down the left, so the right scale is off. */
      leftPriceScale: {
        visible: true,
        borderVisible: false,
        scaleMargins: { top: 0.12, bottom: 0.12 },
        entireTextOnly: true,
      },
      rightPriceScale: { visible: false },
      localization: { timeFormatter },
      timeScale: {
        borderVisible: false,
        timeVisible: clocked,
        secondsVisible: false,
        rightOffset: 2,
        barSpacing: 8,
        /* Without these the series can be dragged off into empty space, which
           reads as the chart wandering rather than as the end of the data. */
        fixLeftEdge: true,
        fixRightEdge: true,
        /* Far enough in to read a single session, not so far that the view
           becomes three fat bars. */
        minBarSpacing: 0.6,
      },
      crosshair: {
        mode: CrosshairMode.Magnet,
        /* Both guides. The vertical alone tells a reader which bar they are on
           but not what it is worth without tracking their eye to the axis; the
           horizontal closes that, and its axis label is the price. */
        vertLine: {
          color: P.crosshair,
          width: 1,
          style: LineStyle.Solid,
          labelBackgroundColor: P.raised,
        },
        horzLine: {
          color: P.crosshair,
          width: 1,
          style: LineStyle.Solid,
          visible: true,
          labelVisible: true,
          labelBackgroundColor: P.raised,
        },
      },
      handleScale: { axisPressedMouseMove: { price: false } },
      /* Vertical swipes belong to the PAGE. The library's default treats any
         mostly-vertical touch drag on the chart as a chart gesture and calls
         preventDefault, so on a phone — where this is a full-width band a third
         of the screen tall — swiping up over it to reach the tabs did nothing.
         Horizontal drags still pan the chart. */
      handleScroll: { vertTouchDrag: false },
    });

    chartRef.current = chart;

    const move = (param: MouseEventParams<Time>) => {
      const tip = tipRef.current;
      const series = mainRef.current;
      if (!tip || !series) return;

      if (!param.point || !param.time || param.point.x < 0) {
        tip.style.opacity = "0";
        return;
      }

      const point = param.seriesData.get(series) as
        | { value?: number; close?: number }
        | undefined;
      const value = point?.value ?? point?.close;
      if (value == null) {
        tip.style.opacity = "0";
        return;
      }

      const { base, intraday, P: palette } = liveRef.current;
      /* A range that slices to empty leaves base at 0; dividing by it printed
         NaN% into the tooltip. */
      const delta = base ? ((value - base) / base) * 100 : 0;
      if (tipPriceRef.current) tipPriceRef.current.textContent = money(value);
      if (tipDeltaRef.current) {
        tipDeltaRef.current.textContent = `${delta >= 0 ? "+" : "−"}${Math.abs(delta).toFixed(2)}%`;
        tipDeltaRef.current.style.color = delta >= 0 ? palette.up : palette.down;
      }
      if (tipMetaRef.current) {
        tipMetaRef.current.textContent = `${formatStamp(param.time as number, intraday)}`;
      }

      const width = host.clientWidth;
      const x = Math.max(80, Math.min(width - 80, param.point.x));
      tip.style.transform = `translate(${x}px, ${Math.max(8, param.point.y - 16)}px) translate(-50%, -100%)`;
      tip.style.opacity = "1";
    };

    chart.subscribeCrosshairMove(move);

    return () => {
      chart.unsubscribeCrosshairMove(move);
      chart.remove();
      chartRef.current = null;
      mainRef.current = null;
      prevLineRef.current = null;
    };
    // Created once; every subsequent update flows through applyOptions below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* Both formatters, together. The chart is created once, so a range switch
     between a session and a year has to push BOTH the axis formatter and the
     crosshair's — leaving `localization` behind would pin the crosshair to
     whichever range happened to be showing when the chart was built. */
  useEffect(() => {
    chartRef.current?.applyOptions({
      localization: { timeFormatter },
      timeScale: { timeVisible: clocked, secondsVisible: false, tickMarkFormatter },
    });
  }, [clocked, tickMarkFormatter, timeFormatter]);

  /* The family is read from a computed custom property, so on the first paint of
     a server render it is the fallback. Re-applying once the webfont has settled
     lets the axis pick up Outfit rather than keeping the stand-in for the life of
     the chart. */
  useEffect(() => {
    const apply = () => chartRef.current?.applyOptions({ layout: { fontFamily: chartFontFamily() } });
    apply();
    const fonts = (document as Document & { fonts?: FontFaceSet }).fonts;
    fonts?.ready.then(apply);
  }, []);

  /*
    Series lifecycle is deliberately split from data.

    The obvious version — remove the series, add a replacement — breaks on every
    instrument change: emptying pane 0 makes lightweight-charts drop the pane,
    the volume histogram migrates up into it, and volume magnitudes then own the
    price scale, flattening the price line to nothing. So the series is created
    only when the chart *type* changes, the replacement is added before the
    outgoing one is removed, and pane 0 is never empty.
  */
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;

    const previous = mainRef.current;

    const series = chart.addSeries(
      AreaSeries,
      {
        priceScaleId: "left",
        lineWidth: 1,
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: true,
        crosshairMarkerRadius: 4.5,
        crosshairMarkerBorderWidth: 1.5,
        crosshairMarkerBorderColor: P.shell,
      },
      0,
    );

    mainRef.current = series;
    prevLineRef.current = null;

    if (previous) chart.removeSeries(previous);
  }, [P]);

  /* Colour, data and the previous-close marker follow the instrument. */
  useEffect(() => {
    const chart = chartRef.current;
    const series = mainRef.current;
    if (!chart || !series) return;

    /* The price axis is pinned to this range's own high and low.

       Autoscaling fits the axis to whatever is inside the visible time window,
       so zooming the time axis dragged the series up and down with it — the
       chart appeared to move under the cursor. Returning a fixed range instead
       makes the vertical scale a function of the data being shown rather than
       of how far in the reader has zoomed.

       Previous close is folded in because it often sits outside the session's
       own high and low: on a day up 1.5% yesterday's close is below every
       tick, and clamping the marker to the plot edge would draw it at a price
       it never traded at. */
    const autoscaleInfoProvider: AutoscaleInfoProvider = () => {
      const b = data.bounds;
      if (!b || !Number.isFinite(b.min) || !Number.isFinite(b.max)) return null;

      const min = data.prev === null ? b.min : Math.min(b.min, data.prev);
      const max = data.prev === null ? b.max : Math.max(b.max, data.prev);
      // A flat series would otherwise collapse to a zero-height range.
      const pad = (max - min) * 0.08 || Math.max(max * 0.01, 0.01);

      return { priceRange: { minValue: min - pad, maxValue: max + pad } };
    };

    const area = series as ISeriesApi<"Area">;
    area.applyOptions({
      lineColor: tone,
      topColor: up ? "rgba(125, 211, 160, 0.22)" : "rgba(224, 121, 107, 0.22)",
      bottomColor: up ? "rgba(125, 211, 160, 0)" : "rgba(224, 121, 107, 0)",
      crosshairMarkerBackgroundColor: tone,
      autoscaleInfoProvider,
    });
    /* A point joining or leaving refits the view only if the view showed every
       point before it: read BEFORE setData, which shifts a window whose right
       edge was on the last point. A reader who zoomed keeps their zoom. */
    const scale = chart.timeScale();
    const count = data.line.length;
    const wasWhole = viewShowsAll(scale.getVisibleLogicalRange(), drawnRef.current);
    area.setData(data.line.map((d) => ({ time: d.time as UTCTimestamp, value: d.value })));
    if (count !== drawnRef.current && wasWhole) scale.fitContent();
    drawnRef.current = count;
  }, [data, tone, up, P]);

  /* The ladder's labels, less any the prev-close tag would cover.
   *
   * The tag is drawn over the axis labels, not beside them, so a tick within
   * a few pixels of the previous close came out half hidden behind it: on
   * AAPL at 375px, "350.00" under the 335.92 tag on 5Y, "340.00" on 3M, and
   * on 1M and 1Y labels touching its edges. The tick itself and its gridline
   * stay; only the words that would collide are left out, and the tag says
   * where the scale is at that height anyway.
   *
   * Stable, reading the tag through a ref, because the library holds on to
   * whatever it is handed; the price-line effect hands it over again whenever
   * the tag moves, which is what makes the labels be redone. */
  const ladderLabels = useCallback((prices: BarPrice[]): string[] => {
    const series = mainRef.current;
    if (!series) return prices.map((p) => p.toFixed(2));
    const labels = series.priceFormatter().formatTickmarks(prices);
    const tag = tagRef.current;
    const tagY = tag === null ? null : series.priceToCoordinate(tag);
    if (tagY === null) return labels;
    return labels.map((label, i) => {
      const y = series.priceToCoordinate(prices[i]);
      return y !== null && Math.abs(y - tagY) < TAG_CLEARANCE ? "" : label;
    });
  }, []);

  /* The dashed prev-close marker the Lux design adds. A native price line
     rather than an absolutely-positioned div, so it tracks the scale.

     Its own effect, keyed on the figure, so a live point joining the series
     does not tear the line down and redraw it on every tick. Runs after the
     series effect above, which resets the ref whenever it replaces the series
     (the old series' lines go with it).

     Skipped when there is nothing plotted: this once drew a dashed gold line
     labelled PREV CLOSE at 0.00 behind the "no trades yet this session"
     message, and handed the price axis a zero to scale against. And skipped
     when the page has no previous close to show — the card prints a dash. */
  /* On a phone the plot takes the whole width, the way a broker app draws it:
     no price ladder (56px of a 343px column) and no grid. The crosshair still
     reads the price at any point, and the caption keeps the previous close. */
  const narrow = useMaxWidth(639);
  useEffect(() => {
    chartRef.current?.applyOptions({
      leftPriceScale: { visible: !narrow },
      grid: { horzLines: { visible: !narrow }, vertLines: { visible: !narrow } },
    });
  }, [narrow]);

  useEffect(() => {
    const series = mainRef.current;
    if (!series) return;
    if (prevLineRef.current) {
      series.removePriceLine(prevLineRef.current);
      prevLineRef.current = null;
    }
    tagRef.current = null;
    if (!(data.empty || data.prev === null)) {
      /* No title. With the ladder on the left the library draws a line's
         title as a filled tag inside the plot, beside the axis, and at 375px
         that tag sat on the first 70px of the day's and the week's line and
         half over the axis labels on the longer ranges. The axis keeps the
         figure; the caption under the chart says what the dashed line is. */
      prevLineRef.current = series.createPriceLine({
        price: data.prev,
        color: P.goldDeep,
        lineWidth: 1,
        lineStyle: LineStyle.Dashed,
        axisLabelVisible: true,
      });
      tagRef.current = data.prev;
    }
    /* The ladder's labels were formatted against the old tag, and the
       library keeps them until its scale changes, which a new previous close
       alone need not do. Handing the formatter over again makes it redo them. */
    chartRef.current?.applyOptions({ localization: { tickmarksPriceFormatter: ladderLabels } });
  }, [data.empty, data.prev, P, ladderLabels]);

  /* Reset the time window. The price axis needs no resetting: it is pinned to
     the range's own extremes by the provider above, so it never drifted. */
  const refit = useCallback(() => {
    chartRef.current?.timeScale().fitContent();
  }, []);

  /* A NEW series is fitted: another range, another stock, or the same range
     starting somewhere else (the day chart moving from yesterday's session to
     today's, the week dropping its oldest day). Not its length — that changes
     every time a live point joins, a minute apart on the day and every five
     to thirty on 1W-1Y, and a reader zoomed into the last month of the year
     was thrown back to the whole year each time. Growth is handled beside
     setData above, and only for a view that was already whole. */
  useEffect(() => {
    refit();
  }, [refit, range, subject, data.firstAt]);

  /* The canvas holds literal colours, so it does not follow the theme on its
     own. Re-apply them when the lighting changes: without this the chart keeps
     the previous theme's grid and axis labels while the page around it flips. */
  useEffect(() => {
    chartRef.current?.applyOptions({
      layout: {
        textColor: P.ink4,
        panes: { separatorColor: P.ruleSection, separatorHoverColor: P.ruleMono },
      },
      grid: {
        horzLines: { color: P.gridH },
        vertLines: { color: P.gridV },
      },
      crosshair: {
        vertLine: { color: P.crosshair, labelBackgroundColor: P.raised },
      },
    });
  }, [P]);

  /* `base` rather than `values[0]`: it is the same first price in the range,
     but already defended against an empty slice the way `last`, `prev` and
     `bounds` are. Reading values[0] raw threw on any ticker whose range came
     back empty — the empty state below renders fine, but this label is built
     first, so the crash preceded it. */
  /* One baseline, named. The sentence used to open "Opened X, last Y" — which
     announces a range return — and then quote a percentage measured against
     the PREVIOUS BAR instead. Two baselines in one sentence, with only the
     percentage silently switching. The range move is now measured from the
     range's own first price, and the previous close is stated separately as
     the different fact it is. */
  const rangeMove = data.base > 0 ? (last / data.base - 1) * 100 : 0;
  const emptyText = emptyChartText(range, status, history.intradayNote);
  const summary = data.empty
    ? `${range} chart. ${emptyText}`
    : `${range} chart, ${caption}. Opened ${money(data.base)} dollars, last ${money(
        last,
      )} dollars, ${rangeMove >= 0 ? "up" : "down"} ${Math.abs(rangeMove).toFixed(
        2,
      )} percent across the range.${
        data.prev === null ? "" : ` Previous close ${money(data.prev)} dollars.`
      }`;

  return (
    /* A column, not a stack. The caption used to be absolutely positioned at
       bottom-0 of this figure, which put it exactly on top of the time axis —
       measured at 784-802px against an axis occupying 776-802px, so it covered
       the earliest date labels on every range. It now takes its own row and the
       plot gives up the ~18px. */
    <figure className="relative m-0 flex h-full flex-col">
      {/* `relative` so the empty-state overlay below covers the plot rather
          than the whole figure, caption included. */}
      <div className="relative w-full min-h-0 flex-1" role="img" aria-label={summary}>
        {/* Double-click restores the fitted view. With autoscale held off so
            zooming stays put, a reader who has zoomed into a corner needs a
            way back that does not involve reloading the page. */}
        <div
          ref={hostRef}
          onDoubleClick={refit}
          title="Double-click to reset the view"
          className="h-full w-full"
        />
        {data.empty && (
          <div className="absolute inset-0 grid place-items-center">
            <p className="max-w-[30ch] text-center text-[13px] leading-[1.7] text-ink-3">
              {emptyText}
            </p>
          </div>
        )}
      </div>

      {/*
        The source wipes the plot in from the left on every change. Done here as
        a curtain that retracts rather than a clip-path on the chart itself:
        keying it remounts a plain div, so a run that is interrupted mid-flight
        restarts cleanly instead of stranding the chart under a partial clip.
      */}
      {!reduceMotion && (
        <motion.div
          /* Keyed on the series' identity — whose, which range, where it
             starts — not on its length: a live point joining the day or the
             week must not replay the wipe every minute. */
          key={`${subject ?? ""}-${range}-${data.firstAt ?? "none"}`}
          aria-hidden="true"
          initial={{ scaleX: 1 }}
          animate={{ scaleX: 0 }}
          transition={{ duration: 1.25, ease: EASE }}
          style={{ transformOrigin: "right center" }}
          className="pointer-events-none absolute inset-0 z-[5] bg-shell"
        />
      )}

      {/* Crosshair readout. Written imperatively — routing every mousemove
          through React state would re-render the whole terminal. */}
      <div
        ref={tipRef}
        aria-hidden="true"
        className="pointer-events-none absolute top-0 left-0 z-10 border border-rule-raised bg-raised px-3 py-2 whitespace-nowrap opacity-0 shadow-[0_16px_34px_rgba(0,0,0,0.7)] transition-opacity duration-150"
      >
        <div className="font-mono flex items-baseline gap-2.5">
          <span ref={tipPriceRef} className="text-[12px] text-ink" />
          <span ref={tipDeltaRef} className="text-[11px]" />
        </div>
        <div
          ref={tipMetaRef}
          className="mt-1 text-[11px] font-bold tracking-[0.18em] text-ink-3"
        />
      </div>

      {/* A figure takes one figcaption, so the visible line and the readable
          equivalent of the canvas share it: the caption states what is drawn,
          the table beneath it carries the numbers for assistive tech. */}
      <figcaption>
        {/* Interval, count, real span, timezone. The chart said none of this —
            six buttons and no way to tell five daily closes from a week of
            minutes, nor that a 13:30 tick was UTC rather than a session hour.

            It WRAPS rather than truncating. On a 375px phone the column is
            343px, and the year's caption measured 387px in Outfit at this size
            — truncated, it lost the zone, the one word saying which clock the
            axis reads. Two lines on a phone cost the plot a line of height;
            one cut line cost the reader the clock. */}
        {/* The separator rides inside each part's no-wrap span, so a line
            never ends on a dangling "·". On a phone the caption keeps two
            lines' height on every range, so switching range never makes the
            plot above it jump. */}
        <p className="font-mono min-h-[calc(2.9em+0.375rem)] shrink-0 pt-1.5 text-[10.5px] leading-[1.45] tracking-[0.04em] text-pretty text-ink-4 sm:min-h-0">
          {captionParts.map((part, i) => (
            <Fragment key={i}>
              {i > 0 && " "}
              <span className="whitespace-nowrap">
                {i > 0 && "· "}
                {part}
              </span>
            </Fragment>
          ))}
          {/* The dashed line's key, out here rather than as a title on the
              canvas, where it covered the line it was naming. Kept whole so
              the swatch never wraps away from its words. */}
          {!data.empty && data.prev !== null && (
            <>
              {" · "}
              <span className="whitespace-nowrap">
                <span
                  aria-hidden="true"
                  className="mr-1.5 inline-block w-3.5 border-t border-dashed border-gold-deep align-middle"
                />
                Previous close {money(data.prev)}
              </span>
            </>
          )}
        </p>
        <span className="sr-only">
        <table>
          <caption>{summary}</caption>
          <thead>
            <tr>
              <th scope="col">Time</th>
              <th scope="col">Price (USD)</th>
            </tr>
          </thead>
          <tbody>
            {data.line
              .filter((_, i) => i % 6 === 0 || i === data.line.length - 1)
              .map((d) => (
                <tr key={d.time}>
                  <td>{formatStamp(d.time as number, clocked)}</td>
                  <td>{money(d.value)}</td>
                </tr>
              ))}
          </tbody>
        </table>
        </span>
      </figcaption>
    </figure>
  );
}

/* Whether the viewport is at most `px` wide; false on the server. */
function useMaxWidth(px: number): boolean {
  const query = `(max-width: ${px}px)`;
  return useSyncExternalStore(
    (notify) => {
      const mq = window.matchMedia(query);
      mq.addEventListener("change", notify);
      return () => mq.removeEventListener("change", notify);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}
