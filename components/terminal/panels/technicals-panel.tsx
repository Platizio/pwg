"use client";

import { useMemo } from "react";
import { money, pct, signed } from "@/lib/market/format";
import {
  momentum,
  movingAverages,
  sparkPath,
  volatility,
  yearRange,
  type AverageRow,
} from "@/lib/market/derive-technicals";
import type { IndicatorPoint } from "@/lib/market/indicators";
import type { InstrumentSnapshot } from "@/lib/market/instrument";
import { C } from "@/lib/tokens";
import { Meter, Section } from "../ui";

/* What the instrument's price has been doing, rather than five scalars.

   This panel used to print an RSI, a 50-day average, a 20-day average, a
   52-week position and a beta — three of them the tip of a ten-point series
   fetched separately from the gateway — and then repeated the Overview tab's
   trailing-returns block underneath, which the Performance tab also carries.
   Two of the five were the same fact stated twice (a price above its 50-day
   and above its 20-day), and none of them had a direction: "RSI 63" does not
   say whether it has been falling for a fortnight, which is the only thing
   anybody reads an RSI for.

   Everything here is computed from the 1,274 split-adjusted daily bars the
   snapshot already carries, through lib/market/indicators.ts. The returns
   block is gone; the space it took is where the trends went.

   The drawing rules are Lux's, and they are tight. No cards — structure comes
   from hairline rules. The sparklines are single-stroke paths with no fill,
   no axis, no gridline beyond the one or two thresholds that make a reading
   mean something, and no tooltip: a sparkline here is a gesture at the shape
   of a series, and the number beside it is the reading. Where a series cannot
   be drawn the box is not drawn either — an em-dash and the sentence saying
   what was missing take its place, because an empty sparkline and a flat one
   look identical and only one of them is a fact about the market. */

const DASH = "—";

/* The sparkline's internal coordinate space. The svg is stretched to whatever
   width the column gives it with preserveAspectRatio="none", and every stroke
   carries vectorEffect="non-scaling-stroke", so the line stays a true hairline
   at any column width instead of fattening as the box grows. */
const SPARK_W = 240;

type Line = { points: IndicatorPoint[]; color: string };
type Domain = { min: number; max: number };

/** The drawing domain across every line sharing one box. */
function domainAcross(lines: readonly Line[]): Domain | null {
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (const line of lines) {
    for (const p of line.points) {
      if (!Number.isFinite(p.value)) continue;
      if (p.value < min) min = p.value;
      if (p.value > max) max = p.value;
    }
  }
  return Number.isFinite(min) && Number.isFinite(max) ? { min, max } : null;
}

function guideY(value: number, domain: Domain, height: number): number {
  const span = domain.max - domain.min;
  const t = span > 0 ? (value - domain.min) / span : 0.5;
  return height - Math.min(1, Math.max(0, t)) * height;
}

/**
 * One or more indicator series in a single hairline box.
 *
 * Returns null when there is nothing real to draw, so the caller renders the
 * shortfall instead. Two lines share a domain deliberately: a close drawn
 * against its own moving average only means something if both are on the same
 * scale.
 */
function Spark({
  lines,
  height = 40,
  bounds,
  guides = [],
}: {
  lines: Line[];
  height?: number;
  /** A fixed domain, where the quantity has one — RSI runs 0 to 100. */
  bounds?: Domain | null;
  /** Threshold values, drawn as hairlines in the same domain. */
  guides?: number[];
}) {
  const domain = bounds ?? domainAcross(lines);
  const drawn = lines
    .map((l) => ({ color: l.color, d: sparkPath(l.points, { width: SPARK_W, height }, domain) }))
    .filter((l): l is { color: string; d: string } => l.d !== null);

  if (drawn.length === 0) return null;

  return (
    <svg
      viewBox={`0 0 ${SPARK_W} ${height}`}
      width="100%"
      height={height}
      preserveAspectRatio="none"
      /* The reading is printed beside every one of these; the line is the
         gesture. A screen reader that announced a path would be reading out
         the decoration and skipping the number. */
      aria-hidden="true"
      className="block"
    >
      {domain &&
        guides.map((g) => (
          <line
            key={g}
            x1={0}
            x2={SPARK_W}
            y1={guideY(g, domain, height)}
            y2={guideY(g, domain, height)}
            style={{ stroke: C.ruleTable }}
            strokeWidth={1}
            vectorEffect="non-scaling-stroke"
          />
        ))}
      {drawn.map((l) => (
        <path
          key={l.color + l.d.length}
          d={l.d}
          fill="none"
          style={{ stroke: l.color }}
          strokeWidth={1}
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      ))}
    </svg>
  );
}

/** The em-dash and the reason for it, where a series cannot be drawn. */
function Absent({ reason }: { reason: string | null }) {
  return (
    <span className="flex items-baseline gap-3">
      <span className="font-mono text-[13px] text-ink-4">{DASH}</span>
      {reason && <span className="text-[11.5px] leading-[1.5] text-ink-4">{reason}</span>}
    </span>
  );
}

/* Words and tone.

   The vocabulary is deliberately the one instrument-derive.ts already uses on
   the Overview tab: STRETCHED and WASHED OUT rather than BULLISH and BEARISH,
   because an RSI has no bullish reading to give and the two tabs describing
   one number in contradictory terms is a bug a reader can see.

   Terracotta on a price above its upper band follows the same logic: it is a
   stretch reading, not a fall, and it takes the same tone the stretched RSI
   does. Volatility and turnover get gilt or ink instead — neither is good or
   bad news, and painting a busy session sage would say it was. */
const meterWidth = (fraction: number): string =>
  `${Math.max(4, Math.min(100, fraction))}%`;

export function TechnicalsPanel({ snapshot }: { snapshot: InstrumentSnapshot }) {
  /* One pass over the bars per render. Four functions rather than one so each
     is testable on its own; the whole set costs well under a millisecond on
     1,274 points, and the memo keeps it off re-renders the live quote causes. */
  const { m, avg, vol, range } = useMemo(
    () => ({
      m: momentum(snapshot),
      avg: movingAverages(snapshot),
      vol: volatility(snapshot),
      range: yearRange(snapshot),
    }),
    [snapshot],
  );

  if (m.bars === 0) {
    return (
      <p className="max-w-[52ch] text-[13.5px] leading-[1.7] text-ink-3">
        No price history is available for this instrument, so there is nothing to
        measure. Every reading on this tab is computed from the daily series the
        chart draws; none of it is fetched separately.
      </p>
    );
  }

  const rsiTone =
    m.rsi.state === "overbought" ? C.down : m.rsi.state === "oversold" ? C.up : C.gold;
  const rsiWord =
    m.rsi.state === "overbought"
      ? "STRETCHED"
      : m.rsi.state === "oversold"
        ? "WASHED OUT"
        : m.rsi.state === "neutral"
          ? "NEUTRAL"
          : DASH;

  const histTone =
    m.macd.histogram === null ? C.ink4 : m.macd.histogram >= 0 ? C.up : C.down;
  const histSpan = Math.max(...m.macd.trace.map((p) => Math.abs(p.value)), 0);

  const bandWord =
    vol.bands.state === "above"
      ? "ABOVE BAND"
      : vol.bands.state === "below"
        ? "BELOW BAND"
        : vol.bands.state === "inside"
          ? "IN BAND"
          : DASH;
  const bandTone =
    vol.bands.state === "above" ? C.down : vol.bands.state === "below" ? C.up : C.gold;

  const atrWord =
    vol.atr.percentile === null
      ? DASH
      : vol.atr.percentile >= 80
        ? "ELEVATED"
        : vol.atr.percentile <= 20
          ? "SUBDUED"
          : "ORDINARY";

  const volumeWord =
    vol.volume.latest === null
      ? DASH
      : vol.volume.latest >= 2
        ? "HEAVY"
        : vol.volume.latest <= 0.5
          ? "THIN"
          : "ORDINARY";

  return (
    <div className="flex flex-col gap-11">
      <div className="grid gap-11 xl:grid-cols-[1.35fr_1fr]">
        {/* ---------------------------------------------------- momentum */}
        <Section title="Momentum" eyebrow="Relative strength (14) · MACD (12 / 26 / 9)">
          <div className="rule-t pt-5">
            <div className="flex items-end justify-between gap-6">
              <div>
                <p className="eyebrow mb-2">Relative strength</p>
                <p className="font-serif m-0 text-[40px] leading-none" style={{ color: rsiTone }}>
                  {m.rsi.latest === null ? DASH : m.rsi.latest.toFixed(1)}
                </p>
              </div>
              <div className="text-right">
                <p
                  className="mb-2 text-[11px] font-bold tracking-[0.18em]"
                  style={{ color: rsiTone }}
                >
                  {rsiWord}
                </p>
                {/* The index's own drift. A level of 58 says little; 58 having
                    come down from 74 is the reading. */}
                <p className="font-mono m-0 text-[12px] text-ink-3">
                  {m.rsi.change === null
                    ? DASH
                    : `${signed(m.rsi.change, 1)} pts over ten sessions`}
                </p>
              </div>
            </div>

            <div className="mt-4">
              {m.rsi.trace.length > 1 ? (
                <>
                  {/* Fixed 0-100 with the conventional thresholds ruled in, so
                      the line's height is comparable between instruments and
                      the 30 and 70 mean what they mean everywhere else. */}
                  {/* Ink, not gilt. On this panel gilt has exactly one job —
                      marking the derived line in a box that also holds the
                      close — and spending it on a lone series as well would
                      leave the reader with two golds meaning two things. */}
                  <Spark
                    lines={[{ points: m.rsi.trace, color: C.ink3 }]}
                    height={46}
                    bounds={{ min: 0, max: 100 }}
                    guides={[30, 70]}
                  />
                  <div className="mt-1.5 flex justify-between">
                    <span className="eyebrow">{m.rsi.trace.length} sessions</span>
                    <span className="eyebrow">Thresholds 30 · 70</span>
                  </div>
                </>
              ) : (
                <Absent reason={m.rsi.shortfall} />
              )}
            </div>
          </div>

          <div className="mt-8">
            <p className="eyebrow mb-3">Convergence · divergence</p>
            <dl className="grid grid-cols-3 border-t border-rule-section">
              {([
                { label: "MACD", value: m.macd.line, color: C.ink },
                { label: "Signal", value: m.macd.signal, color: C.ink },
                /* Only the histogram takes a tone: it is the one of the three
                   whose sign is the reading rather than a level. */
                { label: "Histogram", value: m.macd.histogram, color: histTone },
              ] as const).map((cell) => (
                <div
                  key={cell.label}
                  className="border-r border-rule-section py-3.5 pr-4 last:border-r-0"
                >
                  <dt className="eyebrow mb-2">{cell.label}</dt>
                  <dd className="font-mono m-0 text-[14px]" style={{ color: cell.color }}>
                    {cell.value === null ? DASH : cell.value.toFixed(2)}
                  </dd>
                </div>
              ))}
            </dl>

            <div className="mt-4">
              {m.macd.trace.length > 1 ? (
                /* Symmetric about zero with the zero ruled in: the histogram's
                   sign is the whole signal, and a box scaled to the data alone
                   would put the zero line wherever the extremes happened to
                   fall. */
                <Spark
                  lines={[{ points: m.macd.trace, color: histTone }]}
                  height={34}
                  bounds={histSpan > 0 ? { min: -histSpan, max: histSpan } : null}
                  guides={[0]}
                />
              ) : (
                <Absent reason={m.macd.shortfall} />
              )}
            </div>

            <p className="mt-4 max-w-[52ch] text-[12.5px] leading-[1.7] text-ink-3">
              {m.macd.cross.state === null
                ? "The line and its signal are level, or there is not yet enough history to place one against the other."
                : `The line has been ${m.macd.cross.state} its signal${
                    m.macd.cross.sinceDays === null
                      ? " for longer than this record reaches"
                      : ` for ${m.macd.cross.sinceDays} days`
                  }.`}
            </p>
          </div>
        </Section>

        {/* -------------------------------------------------- volatility */}
        <Section
          title="Volatility"
          eyebrow="Bollinger (20, 2σ) · True range (14)"
          className="xl:border-l xl:border-rule-section xl:pl-[34px]"
        >
          <div className="rule-t pt-4">
            <div className="mb-3 flex items-baseline justify-between gap-4">
              <span className="eyebrow">Position in band</span>
              <span className="text-[11px] font-bold tracking-[0.18em]" style={{ color: bandTone }}>
                {bandWord}
              </span>
            </div>

            {vol.bands.position === null ? (
              <Absent
                reason={
                  vol.bands.shortfall ??
                  "The last twenty closes are identical, so the envelope has no width to sit inside."
                }
              />
            ) : (
              <>
                {/* Clamped only here, at the edge of the box. The reading
                    itself keeps going past 100 — a close outside the envelope
                    is the thing the indicator exists to catch. */}
                <Meter width={meterWidth(vol.bands.position)} color={bandTone} />
                <div className="mt-2.5 flex items-baseline justify-between">
                  <span className="font-mono text-[11.5px] text-ink-4">
                    {vol.bands.lower === null ? DASH : money(vol.bands.lower)}
                  </span>
                  <span className="font-mono text-[12px]" style={{ color: bandTone }}>
                    {vol.bands.position.toFixed(0)}%
                  </span>
                  <span className="font-mono text-[11.5px] text-ink-4">
                    {vol.bands.upper === null ? DASH : money(vol.bands.upper)}
                  </span>
                </div>
              </>
            )}

            <dl className="mt-4 flex list-none flex-col p-0">
              <div className="rule-t flex items-baseline justify-between py-2.5">
                <dt className="eyebrow">Middle band</dt>
                <dd className="font-mono m-0 text-[12px]">
                  {vol.bands.middle === null ? DASH : money(vol.bands.middle)}
                </dd>
              </div>
              <div className="rule-t flex items-baseline justify-between py-2.5">
                <dt className="eyebrow">Band width</dt>
                <dd className="font-mono m-0 text-[12px]">
                  {vol.bands.width === null ? DASH : `${vol.bands.width.toFixed(1)}%`}
                </dd>
              </div>
            </dl>
          </div>

          <div className="mt-7">
            <div className="mb-3 flex items-baseline justify-between gap-4">
              <span className="eyebrow">Average true range</span>
              <span
                className="text-[11px] font-bold tracking-[0.18em]"
                style={{ color: atrWord === "ELEVATED" ? C.gold : C.ink3 }}
              >
                {atrWord}
              </span>
            </div>

            {vol.atr.latest === null ? (
              <Absent reason={vol.atr.shortfall} />
            ) : (
              <>
                <div className="flex items-baseline justify-between gap-4">
                  <span className="font-serif text-[24px] leading-none">
                    {money(vol.atr.latest)}
                  </span>
                  <span className="font-mono text-[12px] text-ink-3">
                    {vol.atr.ofPrice === null ? DASH : `${vol.atr.ofPrice.toFixed(2)}% of price`}
                  </span>
                </div>
                <div className="mt-3">
                  <Spark lines={[{ points: vol.atr.trace, color: C.ink3 }]} height={30} />
                </div>
                <p className="mt-2 text-[11.5px] leading-[1.6] text-ink-4">
                  {vol.atr.percentile === null
                    ? "Not yet enough readings behind it to rank against its own year."
                    : `Wider than ${vol.atr.percentile.toFixed(0)}% of the sessions in its trailing year.`}
                </p>
              </>
            )}
          </div>

          <div className="mt-7">
            <div className="mb-3 flex items-baseline justify-between gap-4">
              <span className="eyebrow">Turnover</span>
              <span
                className="text-[11px] font-bold tracking-[0.18em]"
                style={{ color: volumeWord === "HEAVY" ? C.gold : C.ink3 }}
              >
                {volumeWord}
              </span>
            </div>

            {vol.volume.latest === null ? (
              /* Two different absences, and the reader is owed the difference:
                 too few sessions to measure, or enough sessions of a figure
                 that cannot carry the measure. */
              <Absent reason={vol.volume.shortfall ?? vol.volume.unreliable} />
            ) : (
              <>
                <div className="mb-2.5 flex items-baseline justify-between gap-4">
                  <span className="font-mono text-[14px]">
                    {`${vol.volume.latest.toFixed(2)}×`}
                  </span>
                  <span className="text-[11.5px] text-ink-4">
                    against its thirty-session baseline
                  </span>
                </div>
                {/* Half the bar is an ordinary session, so the eye reads the
                    excess rather than the level. */}
                <Meter
                  width={meterWidth((vol.volume.latest / 2) * 100)}
                  color={vol.volume.latest >= 2 ? C.gold : C.ink3}
                />
              </>
            )}
          </div>
        </Section>
      </div>

      {/* ------------------------------------------------ moving averages */}
      <Section
        title="Moving averages"
        eyebrow="Gilt is the average · the close runs behind it"
        className="border-t border-rule-section pt-8"
      >
        <ul className="flex list-none flex-col p-0">
          {avg.rows.map((r: AverageRow) => {
            const tone = r.state === "above" ? C.up : r.state === "below" ? C.down : C.ink4;
            return (
              <li
                key={r.label}
                className="rule-t grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-5 gap-y-3 py-4 sm:grid-cols-[104px_92px_84px_minmax(0,1fr)_84px] sm:gap-[18px]"
              >
                <span className="eyebrow">{r.label}</span>
                <span className="font-mono text-[13px]">
                  {r.value === null ? DASH : money(r.value)}
                </span>
                <span className="font-mono text-[13px]" style={{ color: tone }}>
                  {r.gap === null ? DASH : pct(r.gap, 2)}
                </span>
                {/* On a narrow column the drawing drops to its own full-width
                    row rather than being squeezed to nothing between figures. */}
                <span className="order-last col-span-full sm:order-none sm:col-span-1">
                  {r.trace.length > 1 ? (
                    <Spark
                      lines={[
                        { points: r.price, color: C.ink4 },
                        { points: r.trace, color: C.gold },
                      ]}
                      height={30}
                    />
                  ) : (
                    <Absent reason={r.shortfall} />
                  )}
                </span>
                <span
                  className="text-right text-[11px] font-bold tracking-[0.18em]"
                  style={{ color: tone }}
                >
                  {r.state === null ? DASH : r.state.toUpperCase()}
                </span>
              </li>
            );
          })}
        </ul>

        <p className="mt-5 max-w-[62ch] text-[12.5px] leading-[1.7] text-ink-3">
          {avg.cross.shortfall
            ? `The fifty-day and two-hundred-day averages cannot be set against each other yet. ${avg.cross.shortfall}`
            : avg.cross.state === null
              ? "The fifty-day and two-hundred-day averages are level."
              : `The fifty-day average has been ${avg.cross.state} the two-hundred-day ${
                  avg.cross.sinceDays === null
                    ? "for as long as this five-year record reaches — the crossing that put it there is older than the history on file."
                    : `for ${avg.cross.sinceDays} days.`
                }`}
        </p>
      </Section>

      {/* ----------------------------------------------- fifty-two weeks */}
      <Section
        title="Fifty-two week range"
        eyebrow="From the quote feed's own yearly extremes"
        className="border-t border-rule-section pt-8"
      >
        {range.position === null ? (
          <Absent reason="The quote feed carries no twelve-month high and low for this instrument." />
        ) : (
          <>
            <Meter width={meterWidth(range.position)} color={C.gold} height={2} />
            <div className="mt-3 flex items-baseline justify-between gap-4">
              <span className="font-mono text-[12px] text-ink-3">
                {range.low === null ? DASH : money(range.low)}
              </span>
              <span className="font-mono text-[12.5px]" style={{ color: C.gold }}>
                {range.price === null ? DASH : money(range.price)} ·{" "}
                {range.position.toFixed(0)}% of the way up
              </span>
              <span className="font-mono text-[12px] text-ink-3">
                {range.high === null ? DASH : money(range.high)}
              </span>
            </div>
          </>
        )}
      </Section>

      {/* ------------------------------------------------------ provenance */}
      <div className="border-t border-rule-section pt-5">
        <p className="max-w-[68ch] text-[12px] leading-[1.7] text-ink-4">
          Every reading on this tab is computed from the same {m.bars.toLocaleString("en-US")}{" "}
          split-adjusted daily closes the chart above draws, and none of it costs a
          request of its own. Where a window reaches further back than the record
          goes, the reading is withheld rather than struck from a shorter one.
          {m.gateway.rsi !== null && m.gateway.delta !== null && m.gateway.delta >= 1 ? (
            <>
              {" "}
              The data provider publishes {m.gateway.rsi.toFixed(1)} for the same
              fourteen-day index. The figure above is ours: it is struck from the
              split-repaired series, which the provider&rsquo;s is not.
            </>
          ) : null}
        </p>
      </div>
    </div>
  );
}
