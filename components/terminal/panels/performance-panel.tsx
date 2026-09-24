"use client";

import { useHistory } from "../use-history";
import { useLiveSnapshot } from "../live-provider";
import { MARKET_PROXY_SYMBOL as MARKET_PROXY } from "@/lib/market/store/types";
import { pct } from "@/lib/market/format";
import {
  calendarYearRows,
  drawdownCurve,
  riskProfile,
  rollingPeriods,
  type DrawdownPoint,
} from "@/lib/market/derive-performance";
import { notableMoves } from "@/lib/market/instrument-derive";
import type { InstrumentSnapshot } from "@/lib/market/instrument";
import { C, trend } from "@/lib/tokens";
import { Meter, Section } from "../ui";

/**
 * How the instrument has actually done.
 *
 * Every figure on the left of this tab is measured from the same
 * split-repaired daily series the chart above it draws, so nothing here can
 * disagree with the line the reader is looking at. Where the series does not
 * reach back far enough the cell shows a dash rather than a number borrowed
 * from a shorter window — see lib/market/derive-performance.ts, which is where
 * all of the arithmetic and all of the refusals live. This file only lays it
 * out.
 *
 * The market column is the tracking fund rather than the index, because no
 * index instrument is entitled on this account. That is the same admission the
 * market card makes on the dashboard, and the footnote says so rather than
 * letting "SPY" pass as "the S&P 500".
 *
 * Analyst ratings have their own tab (panels/analyst-panel.tsx).
 */

const DASH = "—";

/** A signed percentage, or a dash. Never a nought standing in for absence. */
const signed = (n: number | null, digits = 1) => (n === null ? DASH : pct(n, digits));

/** An unsigned magnitude — volatility has no direction to report. */
const magnitude = (n: number | null, digits = 1) =>
  n === null ? DASH : `${n.toFixed(digits)}%`;

/* A drawdown is never positive, so `pct` would print "+0.0%" for an instrument
   sitting exactly on its high — a plus sign on a fall reads as a gain. Nought
   here is a real and good reading: no drawdown at all. */
const fall = (n: number | null) => (n === null ? DASH : n === 0 ? "0.0%" : pct(n, 1));

const tone = (n: number | null) => (n === null ? C.ink4 : trend(n >= 0));

/* Sage for a fall would be absurd and terracotta for no fall would be alarmist,
   so a drawdown of nought takes the neutral ink instead of either. */
const fallTone = (n: number | null) => (n === null ? C.ink4 : n === 0 ? C.ink2 : C.down);

/* Fixed en-US and UTC, like every other formatter in this repo: the visitor's
   own locale would make the server and the client disagree and blow up
   hydration. */
const LONG_DATE = new Intl.DateTimeFormat("en-US", {
  timeZone: "UTC",
  day: "numeric",
  month: "long",
  year: "numeric",
});

const TH = "py-2 text-[11px] font-semibold tracking-[0.14em] text-ink-3 uppercase";

/* ── bars ──────────────────────────────────────────────────────────────── */

/**
 * A bar that reads from a centre line: left for behind, right for ahead.
 *
 * Both halves always draw their track, so the hairline runs the full width and
 * the zero axis sits where the eye expects it whichever way the bar points.
 * The losing half is mirrored with `scaleX(-1)` so its fill grows outward from
 * the centre rather than inward from the far edge — `Meter` pins its own
 * transform origin to the left, and a bar that grew towards nought would read
 * as a recovery.
 *
 * `Meter` animates a composited `scaleX`, NOT `width`. That matters here
 * because these sit inside the cells of a `border-collapse` table, where
 * animating a layout property re-resolves every column width on every frame —
 * see the note on `Meter` in components/terminal/ui.tsx. Do not replace this
 * with a width transition.
 */
function DivergingBar({
  value,
  scale,
  mark = null,
  delay = 0,
}: {
  value: number | null;
  /** The magnitude that fills half the width. */
  scale: number;
  /** A second figure, drawn as a tick on the same axis. */
  mark?: number | null;
  delay?: number;
}) {
  const share = (n: number) => Math.max(-1, Math.min(1, n / scale));

  const behind = value !== null && value < 0 ? `${Math.abs(share(value)) * 100}%` : "0%";
  const ahead = value !== null && value > 0 ? `${share(value) * 100}%` : "0%";
  const tick = mark === null ? null : 50 + share(mark) * 50;

  return (
    <div aria-hidden="true" className="relative flex w-full items-stretch">
      <div className="w-1/2" style={{ transform: "scaleX(-1)" }}>
        <Meter width={behind} color={C.down} delay={delay} />
      </div>
      <div className="w-1/2">
        <Meter width={ahead} color={C.up} delay={delay} />
      </div>
      <span
        className="absolute top-[-4px] bottom-[-4px] left-1/2 w-px"
        style={{ background: C.ruleMono }}
      />
      {tick !== null && (
        <span
          className="absolute top-[-3px] bottom-[-3px] w-px"
          style={{ left: `${tick}%`, background: C.gold }}
        />
      )}
    </div>
  );
}

/** The largest magnitude a set of figures needs to draw, never nought. */
const scaleOf = (values: Array<number | null>): number =>
  Math.max(1, ...values.filter((v): v is number => v !== null).map(Math.abs));

/* ── the underwater curve ──────────────────────────────────────────────── */

const CURVE_W = 600;
const CURVE_H = 56;

/* Drawn in a fixed coordinate space and stretched to the column with
   `preserveAspectRatio="none"`, which is what lets it fill any width without
   re-deriving the path. The stroke would be stretched with it, so it is pinned
   at one device pixel by `vectorEffect`. */
function underwater(curve: DrawdownPoint[]) {
  const deepest = Math.min(...curve.map((p) => p.pct));

  /* Floored at one per cent. Scaling to the deepest point alone would divide
     by nought for an instrument that never fell, and — worse — would stretch a
     record whose worst day was −0.4% to the full height of the figure, drawing
     a placid fund as though it had crashed. */
  const scale = Math.min(-1, deepest);

  const x = (i: number) => (curve.length === 1 ? CURVE_W : (i / (curve.length - 1)) * CURVE_W);
  const y = (v: number) => Math.min(CURVE_H, Math.max(0, (v / scale) * CURVE_H));

  const line = curve
    .map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(2)},${y(p.pct).toFixed(2)}`)
    .join(" ");

  return { line, area: `${line} L${CURVE_W},0 L0,0 Z` };
}

/* ── the panel ─────────────────────────────────────────────────────────── */

export function PerformancePanel({ snapshot }: { snapshot: InstrumentSnapshot }) {
  const { profile } = snapshot;

  /* THE FULL SERIES, FETCHED — and this is a correctness requirement, not an
   * optimisation.
   *
   * Everything on this tab is measured over five years: the CAGR, the maximum
   * drawdown, the volatility, the year-by-year table. The page no longer ships
   * five years — it carries the year the chart opens with, because shipping
   * both this series and the benchmark's put 234KB of bars in every click and
   * killed a 512MB instance on the third one. Measuring five-year figures over
   * the shipped year would not fail; it would quietly print different numbers
   * under the same labels, which is the worst way for this to go wrong.
   *
   * So the panel asks for what it measures. Until it arrives there is nothing
   * to measure and the panel says so, which is the state it already draws for
   * a company with no price record.
   *
   * The benchmark is fetched for the same reason and is separately optional: a
   * comparison line is worth one request, and worth nothing if it fails. */
  const full = useHistory(profile.id, "5Y");
  const benchmark = useHistory(MARKET_PROXY, "5Y");

  const points = full.points.length > 0 ? full.points : snapshot.history.daily;
  const market =
    benchmark.points.length > 0
      ? { symbol: MARKET_PROXY, daily: benchmark.points }
      : snapshot.market;

  /* The live profile, for the two figures here that read the price: the fall
     from the 52-week high (which now takes in today's regular-session prints
     and the session the feed has not folded in) and the analyst rail. */
  const live = useLiveSnapshot(snapshot);

  /* Nothing on the left of this tab can be measured without a price record —
     but the analyst state can still be reported, and it is the one thing on
     this page that does not come from the series. Returning a single sentence
     and dropping it would tell a reader nothing about why the section is
     missing. */
  if (points.length === 0) {
    return (
      <div className="grid gap-11 xl:grid-cols-[1.35fr_1fr]">
        <p className="max-w-[54ch] text-[13.5px] leading-[1.7] text-ink-3">
          No price history is available for this instrument, so none of the
          return, risk or market-comparison figures on this tab can be measured.
        </p>
      </div>
    );
  }

  /* Measured from the FETCHED five years and benchmark, not the shipped page.
     The page ships one year of bars and no benchmark (instrument.ts trims both
     to keep the payload small), and these four were still reading it — so the
     1-year return was a dash (it needs 253 bars and got 252), the 3- and
     5-year rows and every S&P comparison were dashes, and "Volatility, full
     record" described a single year. The series above were being fetched for
     exactly this and only used for the as-of date. */
  const measured = { ...live, history: { ...live.history, daily: points }, market };
  const rows = rollingPeriods(measured);
  const years = calendarYearRows(measured);
  const risk = riskProfile(measured);
  const curve = drawdownCurve(measured);
  const moves = notableMoves(snapshot);

  const marketLabel = market?.symbol ?? "Market";
  const asOf = LONG_DATE.format(points[points.length - 1].at);
  const oneYear = rows.find((r) => r.key === "1y");

  /* Built once. The two paths share a scale, and deriving them twice in the
     JSX would let the fill and the stroke drift apart if either ever gained a
     dependency. */
  const paths = curve.length >= 2 ? underwater(curve) : null;

  const relativeScale = scaleOf(rows.map((r) => r.relative));
  const yearScale = scaleOf([...years.map((y) => y.stock), ...years.map((y) => y.market)]);
  const anyPartial = years.some((y) => y.partial);

  const riskRows = [
    {
      label: "Volatility, past year",
      stock: magnitude(risk.volatility1y),
      market: magnitude(risk.marketVolatility1y),
      color: C.ink2,
    },
    {
      label: "Volatility, full record",
      stock: magnitude(risk.volatility),
      market: magnitude(risk.marketVolatility),
      color: C.ink2,
    },
    {
      label: "Deepest drawdown",
      stock: fall(risk.maxDrawdown),
      market: fall(risk.marketMaxDrawdown),
      color: fallTone(risk.maxDrawdown),
    },
    {
      label: "Drawdown today",
      stock: fall(risk.currentDrawdown),
      market: fall(risk.marketCurrentDrawdown),
      color: fallTone(risk.currentDrawdown),
    },
  ];

  /* SPY measured against SPY: every comparison column repeats the figure
     beside it and every relative reads +0.0%. The benchmark's own page shows
     its figures once. */
  const isBenchmark = profile.id === MARKET_PROXY;

  const summary = [
    {
      /* Named by its first close, like the table row, when the record opens
         after the anchor (a name listed about a year ago). */
      label: oneYear?.since ? oneYear.label : "1-year return",
      value: signed(oneYear?.stock ?? null),
      color: tone(oneYear?.stock ?? null),
      note: isBenchmark ? "Price return, past year" : `${marketLabel} ${signed(oneYear?.market ?? null)}`,
    },
    {
      label: "Five-year CAGR",
      value: signed(risk.cagr5y),
      color: tone(risk.cagr5y),
      note: "Compound annual rate",
    },
    {
      label: "Volatility",
      value: magnitude(risk.volatility1y),
      color: C.ink,
      note: "Annualised, past year",
    },
    {
      label: "Deepest drawdown",
      value: fall(risk.maxDrawdown),
      color: fallTone(risk.maxDrawdown),
      note:
        risk.maxDrawdownAt === null
          ? "Across the record"
          : `Trough ${LONG_DATE.format(risk.maxDrawdownAt)}`,
    },
    {
      label: "Beta",
      value: risk.beta === null ? DASH : risk.beta.toFixed(2),
      color: C.ink,
      note: "Against the market, 5Y",
    },
  ];

  return (
    <div className="flex flex-col gap-11">
      {/* Ruled strip, not cards — Lux draws structure with lines only. */}
      {/* Each cell spans three rows of a subgrid (label, figure, note), so a
          label that wraps — "Five-year CAGR" and "Deepest drawdown" do at
          1440 — lowers the whole row's figure line, not its own figure alone.
          The rules are each cell's top and left edges, and the wrapper clips
          the ones that land on the strip's outer edge, so no column count
          leaves a stray rule at the right or a doubled one at the foot. */}
      <div className="overflow-hidden border-t border-b border-rule-section">
        <dl className="-mt-px -ml-px grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5">
          {summary.map((s) => (
            <div
              key={s.label}
              className="row-span-3 grid grid-rows-subgrid border-t border-l border-rule-section px-5 py-5"
            >
              <dt className="eyebrow mb-3 self-end">{s.label}</dt>
              <dd
                className="font-serif m-0 text-[24px] tracking-[0.01em]"
                style={{ color: s.color }}
              >
                {s.value}
              </dd>
              <p className="mt-2 text-[11.5px] leading-[1.5] text-ink-3">{s.note}</p>
            </div>
          ))}
        </dl>
      </div>

      <div className="grid gap-11 xl:grid-cols-[1.35fr_1fr]">
        <div className="flex flex-col gap-11">
          <Section title="Return" eyebrow="Rolling windows, close to close">
            <table className="w-full border-collapse text-left">
              <caption className="sr-only">
                Price return for {profile.id} and for {marketLabel} over each window
              </caption>
              <thead>
                <tr className="border-b border-rule">
                  <th scope="col" className={TH}>
                    Period
                  </th>
                  <th scope="col" className={`${TH} text-right`}>
                    {profile.id}
                  </th>
                  {!isBenchmark && (
                    <>
                      <th scope="col" className={`${TH} text-right`}>
                        {marketLabel}
                      </th>
                      <th scope="col" className={`${TH} text-right`}>
                        vs {marketLabel}
                      </th>
                      <th scope="col" className="hidden w-[96px] sm:table-cell">
                        <span className="sr-only">Relative strength</span>
                      </th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={r.key} className="border-b border-rule-table">
                    <th
                      scope="row"
                      className="py-3 text-left text-[13.5px] font-normal text-ink-2"
                    >
                      {r.label}
                    </th>
                    <td
                      className="font-mono py-3 text-right text-[14px]"
                      style={{ color: tone(r.stock) }}
                    >
                      {signed(r.stock)}
                    </td>
                    {!isBenchmark && (
                      <>
                        <td className="font-mono py-3 text-right text-[13px] text-ink-3">
                          {signed(r.market)}
                        </td>
                        <td
                          className="font-mono py-3 text-right text-[13px]"
                          style={{ color: tone(r.relative) }}
                        >
                          {signed(r.relative)}
                        </td>
                        <td className="hidden py-3 pl-5 sm:table-cell">
                          <DivergingBar
                            value={r.relative}
                            scale={relativeScale}
                            delay={i * 0.04}
                          />
                        </td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>

            <p className="mt-4 max-w-[62ch] text-[12.5px] leading-[1.7] text-ink-3">
              Price returns, adjusted for splits &mdash; dividends are not
              included. Measured close to close, to the last completed session on{" "}
              {asOf}. The comparison column is {marketLabel}, the fund that tracks
              the S&amp;P 500 &mdash; no index instrument is available on this
              account. The last column compounds the two rather than subtracting
              them, so it reads as a return rather than a gap in percentage
              points.
            </p>
          </Section>

          <Section
            title="Calendar years"
            eyebrow={`First close to last close · gold marks ${marketLabel}`}
          >
            <div className="flex items-center gap-4 border-b border-rule pb-2">
              <span className="eyebrow w-[62px] flex-none">Year</span>
              <span className="min-w-0 flex-1" />
              <span className="eyebrow w-[76px] flex-none text-right">{profile.id}</span>
              <span className="eyebrow hidden w-[68px] flex-none text-right sm:block">
                {marketLabel}
              </span>
            </div>

            <ul className="m-0 flex list-none flex-col p-0">
              {years.map((y, i) => (
                <li key={y.year} className="border-b border-rule-table">
                  <div className="flex items-center gap-4 py-3.5">
                    <span className="font-mono w-[62px] flex-none text-[13px] text-ink-3">
                      {y.year}
                      {y.partial && <span className="text-ink-4">&#8224;</span>}
                    </span>
                    <span className="min-w-0 flex-1">
                      <DivergingBar
                        value={y.stock}
                        mark={y.market}
                        scale={yearScale}
                        delay={i * 0.04}
                      />
                    </span>
                    <span
                      className="font-mono w-[76px] flex-none text-right text-[13.5px]"
                      style={{ color: tone(y.stock) }}
                    >
                      {signed(y.stock)}
                    </span>
                    <span className="font-mono hidden w-[68px] flex-none text-right text-[13px] text-ink-3 sm:block">
                      {signed(y.market)}
                    </span>
                  </div>
                </li>
              ))}
            </ul>

            {anyPartial && (
              <p className="mt-4 max-w-[58ch] text-[12.5px] leading-[1.7] text-ink-3">
                &#8224; The record does not span the whole of this year, so the
                figure is a part-year change rather than a calendar-year return,
                and it should not be compared straight across to a full year.
              </p>
            )}
          </Section>
        </div>

        <div className="flex flex-col gap-11">
          <Section
            title="Risk"
            eyebrow={`Measured from ${risk.sessions.toLocaleString("en-US")} daily sessions`}
          >
            {paths && (
              <figure className="m-0 mb-6">
                <div className="border-t" style={{ borderColor: C.ruleMono }}>
                  <svg
                    viewBox={`0 0 ${CURVE_W} ${CURVE_H}`}
                    width="100%"
                    height={CURVE_H}
                    preserveAspectRatio="none"
                    role="img"
                    aria-label={`Fall from the highest previous close, across the record. Deepest ${fall(
                      risk.maxDrawdown,
                    )}.`}
                    className="block"
                  >
                    <path d={paths.area} style={{ fill: C.down, fillOpacity: 0.15 }} />
                    <path
                      d={paths.line}
                      fill="none"
                      strokeWidth={1}
                      vectorEffect="non-scaling-stroke"
                      style={{ stroke: C.down }}
                    />
                  </svg>
                </div>
                <figcaption className="mt-2.5 text-[11.5px] leading-[1.6] text-ink-3">
                  Every session, as a fall from the highest close before it. The
                  line touches the top wherever the instrument set a new high.
                  {risk.maxDrawdownAt !== null && (
                    <> Deepest {fall(risk.maxDrawdown)} on {LONG_DATE.format(risk.maxDrawdownAt)}.</>
                  )}
                </figcaption>
              </figure>
            )}

            <table className="w-full border-collapse text-left">
              <caption className="sr-only">
                Risk measures for {profile.id} and for {marketLabel}
              </caption>
              <thead>
                <tr className="border-b border-rule">
                  <th scope="col" className={TH}>
                    Measure
                  </th>
                  <th scope="col" className={`${TH} text-right`}>
                    {profile.id}
                  </th>
                  {!isBenchmark && (
                    <th scope="col" className={`${TH} text-right`}>
                      {marketLabel}
                    </th>
                  )}
                </tr>
              </thead>
              <tbody>
                {riskRows.map((r) => (
                  <tr key={r.label} className="border-b border-rule-table">
                    <th
                      scope="row"
                      className="py-3 text-left text-[13.5px] font-normal text-ink-2"
                    >
                      {r.label}
                    </th>
                    <td
                      className="font-mono py-3 text-right text-[14px]"
                      style={{ color: r.color }}
                    >
                      {r.stock}
                    </td>
                    {!isBenchmark && (
                      <td className="font-mono py-3 text-right text-[13px] text-ink-3">
                        {r.market}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>

            <dl className="m-0 mt-6 grid grid-cols-3 gap-x-5">
              <div className="row-span-2 grid grid-rows-subgrid">
                <dt className="card-label self-end">Five-year CAGR</dt>
                <dd
                  className="font-mono m-0 mt-1.5 text-[19px]"
                  style={{ color: tone(risk.cagr5y) }}
                >
                  {signed(risk.cagr5y)}
                </dd>
              </div>
              <div className="row-span-2 grid grid-rows-subgrid">
                <dt className="card-label self-end">From 52-week high</dt>
                <dd
                  className="font-mono m-0 mt-1.5 text-[19px]"
                  style={{ color: fallTone(risk.drawdownFrom52WeekHigh) }}
                >
                  {fall(risk.drawdownFrom52WeekHigh)}
                </dd>
              </div>
              <div className="row-span-2 grid grid-rows-subgrid">
                <dt className="card-label self-end">Beta (5Y)</dt>
                <dd className="font-mono m-0 mt-1.5 text-[19px] text-ink-2">
                  {risk.beta === null ? DASH : risk.beta.toFixed(2)}
                </dd>
              </div>
            </dl>

            <p className="mt-5 max-w-[50ch] text-[12px] leading-[1.7] text-ink-3">
              Volatility is the annualised standard deviation of daily price
              moves. A drawdown is measured from the highest close before it, not
              from the start of the record, so it is the worst an investor holding
              through the window would have seen.
            </p>
          </Section>

          <Section title="Largest sessions" eyebrow="Single-day moves in the record">
            <ul className="m-0 flex list-none flex-col p-0">
              {moves.map((m) => (
                <li
                  key={m.date}
                  className="flex items-baseline justify-between gap-3 border-t border-rule-list py-3.5 first:border-t-0"
                >
                  <span className="text-[13.5px] text-ink-2">{m.date}</span>
                  <span className="font-mono text-[13.5px]" style={{ color: m.color }}>
                    {m.chg}
                  </span>
                </li>
              ))}
            </ul>
          </Section>
        </div>
      </div>
    </div>
  );
}
