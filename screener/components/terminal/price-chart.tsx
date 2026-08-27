"use client";

import {
  AreaSeries,
  CandlestickSeries,
  ColorType,
  CrosshairMode,
  LineStyle,
  createChart,
  type AutoscaleInfoProvider,
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
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { formatStamp, money } from "@/lib/market/format";
import { getRange } from "@/lib/market/ranges";
import type { RangeId } from "@/lib/market/types";
import type { PricePoint } from "@/lib/api/normalize/series";
import { chartPalette, EASE, type ChartPalette } from "@/lib/tokens";

export type ChartKind = "area" | "candles";

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


export function PriceChart({
  history,
  range,
  kind,
}: {
  /* Both series, so the control can switch between them without a refetch:
     the day comes from minute bars, everything else is a slice of the daily
     pull the snapshot already holds. */
  history: { daily: PricePoint[]; intraday: PricePoint[]; intradayNote: string | null };
  range: RangeId;
  kind: ChartKind;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const tipRef = useRef<HTMLDivElement>(null);
  const tipPriceRef = useRef<HTMLSpanElement>(null);
  const tipDeltaRef = useRef<HTMLSpanElement>(null);
  const tipMetaRef = useRef<HTMLDivElement>(null);

  const chartRef = useRef<IChartApi | null>(null);
  const mainRef = useRef<ISeriesApi<SeriesType> | null>(null);
  const prevLineRef = useRef<IPriceLine | null>(null);
  /* Which series type `mainRef` currently holds — the data effect needs it to
     pick the right payload shape without re-running on every series swap. */
  const kindRef = useRef<ChartKind>(kind);

  const reduceMotion = useReducedMotion();

  const P = useChartPalette();
  const rangeDef = useMemo(() => getRange(range), [range]);
  const intraday = rangeDef.intraday;

  /* The axis labels its own ticks.

     Left to itself the library mixes granularities inside one axis: a year of
     daily bars came out reading "Oct · Nov · 2 · 2026 · Feb · 3 · Apr", where
     the bare numbers are days of the month sitting among month names. One
     vocabulary per axis — clock inside a session, month across a year, year at
     the boundary.

     Fixed en-US to match every other formatter in the terminal. */
  const tickMarkFormatter = useCallback(
    (time: UTCTimestamp, tickMarkType: TickMarkType) => {
      const ms = (time as number) * 1000;
      const fmt = (opts: Intl.DateTimeFormatOptions) =>
        new Intl.DateTimeFormat("en-US", { timeZone: "UTC", ...opts }).format(ms);

      if (intraday) return fmt({ hour: "2-digit", minute: "2-digit", hour12: false });
      if (tickMarkType === TickMarkType.Year) return fmt({ year: "numeric" });
      return fmt({ month: "short" });
    },
    [intraday],
  );


  const data = useMemo(() => {
    const source = rangeDef.source === "intraday" ? history.intraday : history.daily;
    const slice = rangeDef.sessions
      ? source.slice(Math.max(0, source.length - rangeDef.sessions))
      : source;

    const at = (p: PricePoint) => Math.floor(p.at / 1000) as UTCTimestamp;

    /* Real bodies and wicks. Both feeds carry open, high and low; the chart
       used to keep only the close and set all four equal to it, which drew a
       candlestick view made entirely of flat dashes. */
    const candles = slice.map((p) => ({
      time: at(p),
      open: p.open ?? p.price,
      high: p.high ?? p.price,
      low: p.low ?? p.price,
      close: p.price,
    }));

    return {
      values: slice.map((p) => p.price),
      line: slice.map((p) => ({ time: at(p), value: p.price })),
      candles,
      base: slice[0]?.price ?? 0,
      prev: slice.length > 1 ? slice[slice.length - 2].price : (slice[0]?.price ?? 0),
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
  }, [history, rangeDef]);

  const last = data.values.at(-1) ?? 0;
  const up = last >= data.prev;
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
        fontFamily: "var(--font-plex-mono), ui-monospace, monospace",
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
      timeScale: {
        borderVisible: false,
        timeVisible: rangeDef.intraday,
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
        /* The source draws a vertical guide only — no horizontal line, no
           label floating over the ladder. */
        vertLine: {
          color: P.crosshair,
          width: 1,
          style: LineStyle.Solid,
          labelBackgroundColor: P.raised,
        },
        horzLine: { visible: false, labelVisible: false },
      },
      handleScale: { axisPressedMouseMove: { price: false } },
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

      const delta = ((value - data.base) / data.base) * 100;
      if (tipPriceRef.current) tipPriceRef.current.textContent = money(value);
      if (tipDeltaRef.current) {
        tipDeltaRef.current.textContent = `${delta >= 0 ? "+" : "−"}${Math.abs(delta).toFixed(2)}%`;
        tipDeltaRef.current.style.color = delta >= 0 ? P.up : P.down;
      }
      if (tipMetaRef.current) {
        tipMetaRef.current.textContent = `${formatStamp(
          param.time as number,
          rangeDef.intraday,
        )}`;
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

  useEffect(() => {
    chartRef.current?.applyOptions({
      timeScale: { timeVisible: intraday, secondsVisible: false, tickMarkFormatter },
    });
  }, [intraday, tickMarkFormatter]);

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

    const series =
      kind === "area"
        ? chart.addSeries(
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
          )
        : chart.addSeries(
            CandlestickSeries,
            {
              priceScaleId: "left",
              borderVisible: false,
              priceLineVisible: false,
              lastValueVisible: false,
            },
            0,
          );

    mainRef.current = series;
    kindRef.current = kind;
    prevLineRef.current = null;

    if (previous) chart.removeSeries(previous);
  }, [kind, P]);

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

      const min = Math.min(b.min, data.prev);
      const max = Math.max(b.max, data.prev);
      // A flat series would otherwise collapse to a zero-height range.
      const pad = (max - min) * 0.08 || Math.max(max * 0.01, 0.01);

      return { priceRange: { minValue: min - pad, maxValue: max + pad } };
    };

    if (kindRef.current === "area") {
      const area = series as ISeriesApi<"Area">;
      area.applyOptions({
        lineColor: tone,
        topColor: up ? "rgba(125, 211, 160, 0.22)" : "rgba(224, 121, 107, 0.22)",
        bottomColor: up ? "rgba(125, 211, 160, 0)" : "rgba(224, 121, 107, 0)",
        crosshairMarkerBackgroundColor: tone,
        autoscaleInfoProvider,
      });
      area.setData(
        data.line.map((d) => ({ time: d.time as UTCTimestamp, value: d.value })),
      );
    } else {
      const candles = series as ISeriesApi<"Candlestick">;
      candles.applyOptions({
        upColor: P.up,
        downColor: P.down,
        wickUpColor: P.up,
        wickDownColor: P.down,
        autoscaleInfoProvider,
      });
      candles.setData(
        data.candles.map((c) => ({
          time: c.time as UTCTimestamp,
          open: c.open,
          high: c.high,
          low: c.low,
          close: c.close,
        })),
      );
    }

    /* The dashed prev-close marker the Lux design adds. A native price line
       rather than an absolutely-positioned div, so it tracks the scale. */
    if (prevLineRef.current) series.removePriceLine(prevLineRef.current);
    prevLineRef.current = series.createPriceLine({
      price: data.prev,
      color: P.goldDeep,
      lineWidth: 1,
      lineStyle: LineStyle.Dashed,
      axisLabelVisible: true,
      title: "PREV CLOSE",
    });

  }, [data, tone, up, kind, P]);

  /* Reset the time window. The price axis needs no resetting: it is pinned to
     the range's own extremes by the provider above, so it never drifted. */
  const refit = useCallback(() => {
    chartRef.current?.timeScale().fitContent();
  }, []);

  useEffect(() => {
    refit();
  }, [refit, range, kind, data.values.length]);

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
  const summary = data.empty
    ? `${range} chart. No price history available for this range.`
    : `${range} chart. Opened ${money(
        data.base,
      )} dollars, last ${money(last)} dollars, ${up ? "up" : "down"} ${Math.abs(
        data.prev > 0 ? (last / data.prev - 1) * 100 : 0,
      ).toFixed(2)} percent. Previous close ${money(data.prev)} dollars.`;

  return (
    <figure className="relative m-0 h-full">
      <div className="h-full w-full" role="img" aria-label={summary}>
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
              {rangeDef.source === "intraday"
                ? (history.intradayNote ?? "No trades yet this session.")
                : "No price history is available for this instrument."}
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
          key={`${range}-${kind}-${data.values.length}`}
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

      {/* Canvas is opaque to assistive tech — this is the readable equivalent. */}
      <figcaption className="sr-only">
        <table>
          <caption>{summary}</caption>
          <thead>
            <tr>
              <th scope="col">Time</th>
              <th scope="col">Price (USD)</th>
            </tr>
          </thead>
          <tbody>
            {data.candles
              .filter((_, i) => i % 6 === 0 || i === data.candles.length - 1)
              .map((c) => (
                <tr key={c.time}>
                  <td>{formatStamp(c.time, rangeDef.intraday)}</td>
                  <td>{money(c.close)}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </figcaption>
    </figure>
  );
}
