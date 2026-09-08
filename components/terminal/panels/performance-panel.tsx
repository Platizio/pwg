"use client";

import { money, pct } from "@/lib/market/format";
import {
  analystView,
  calendarYearRows,
  drawdownCurve,
  riskProfile,
  rollingPeriods,
  type AnalystView,
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
 * The analyst section is the only part of this page that is not derived from
 * the price record, which makes it the only part that can be wrong about
 * something outside this terminal. It renders four states and never blurs
 * them; the note above `AnalystSection` explains why each sentence is worded
 * the way it is.
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

/* ── the analyst section ───────────────────────────────────────────────── */

/**
 * The consensus, or an honest account of why there is not one.
 *
 * This is a regulated surface and the four states below are four different
 * sentences. Getting them wrong does not produce an error, it produces a
 * confident claim:
 *
 *   - `not-entitled` is a fact about THIS ACCOUNT. Our subscription does not
 *     reach the analyst endpoints; they answer 403. Rendering that as "no
 *     analyst coverage" would tell a reader that nobody on the street follows
 *     Apple, which is false, unfalsifiable from the page, and entirely our
 *     invention. Every ticker takes this branch today.
 *   - `no-coverage` is a fact about THIS COMPANY. We asked with a valid
 *     entitlement and the street had nothing to say. Ordinary for small caps
 *     and for funds; a real finding, and a different one.
 *   - `unavailable` is a fact about THE REQUEST. It failed. We do not know
 *     which of the two above is true, and saying either would be a guess
 *     dressed as research.
 *   - `available` prints figures, and then the only rules that matter are that
 *     a missing count is never nought, a missing target is never a currency
 *     symbol against nought — a "$0.00 price target" is the most bearish call
 *     on the street and it would be one this terminal made up — and the upside
 *     is the derived one. `vendorUpsideUnverified` is not even carried onto
 *     the view; see lib/market/derive-performance.ts.
 */
function AnalystSection({ view, ticker }: { view: AnalystView; ticker: string }) {
  if (view.state === "not-entitled") {
    return (
      <Section title="Analyst view" eyebrow="Not available on this account">
        <div className="flex max-w-[52ch] flex-col gap-3 text-[13px] leading-[1.75] text-ink-3">
          <p className="m-0">
            Analyst ratings, price targets and estimates are not available on this
            account. The endpoints exist; our data subscription does not reach
            them, and every request for one is refused at the provider.
          </p>
          <p className="m-0">
            That is a limit on what we can see, and nothing more. It is{" "}
            <span className="text-ink-2">not</span> a statement that no analyst
            covers {ticker}, and it should not be read as one. Every other figure
            on this tab is measured from the price record itself.
          </p>
        </div>
      </Section>
    );
  }

  if (view.state === "no-coverage") {
    return (
      <Section title="Analyst view" eyebrow="No coverage">
        <div className="flex max-w-[52ch] flex-col gap-3 text-[13px] leading-[1.75] text-ink-3">
          <p className="m-0">
            No analyst consensus has been published for {ticker}. Our provider
            answered in full and returned no ratings and no price target.
          </p>
          <p className="m-0">
            That is ordinary for smaller companies and for funds, which sell-side
            research rarely follows. It is a finding about {ticker} rather than a
            limit on this account.
          </p>
        </div>
      </Section>
    );
  }

  if (view.state === "unavailable") {
    return (
      <Section title="Analyst view" eyebrow="Could not be retrieved">
        <div className="flex max-w-[52ch] flex-col gap-3 text-[13px] leading-[1.75] text-ink-3">
          <p className="m-0">
            The request for analyst coverage did not complete
            {view.status > 0 ? ` (the provider answered ${view.status})` : ""}. We
            do not know whether {ticker} is covered.
          </p>
          <p className="m-0">
            This is a fault on our side rather than a finding about the company,
            and it may well succeed on a later load.
          </p>
        </div>
      </Section>
    );
  }

  const { label, ratings, target, upsidePct, price } = view;

  /* A target is printed in the currency the gateway named, or in none at all.
     This terminal sells US equities to readers who hold rupees, and "$290"
     where the feed meant ₹290 is not a formatting slip, it is a different
     investment case by a factor of eighty. A null currency prints the bare
     figure rather than picking a symbol. */
  const figure = (n: number | null) => {
    if (n === null) return DASH;
    const amount = money(n);
    if (target.currency === null) return amount;
    return target.currency === "USD" ? `$${amount}` : `${amount} ${target.currency}`;
  };

  const buckets = [
    { key: "buy", label: "Buy", count: ratings.buy, color: C.up },
    { key: "hold", label: "Hold", count: ratings.hold, color: C.gold },
    { key: "sell", label: "Sell", count: ratings.sell, color: C.down },
  ] as const;

  return (
    <Section title="Analyst view" eyebrow={label ?? "Consensus"}>
      <div className="flex flex-col gap-6">
        {/* ---- the street ---- */}
        <div>
          {/* Only drawn when all three buckets are known: scaled from two, the
              two would take the whole width and the third would vanish. */}
          {ratings.shares && (
            <div className="mb-4 flex w-full items-stretch gap-px">
              {buckets.map((b, i) => {
                const share = ratings.shares![b.key];
                if (share <= 0) return null;
                return (
                  <div key={b.key} style={{ width: `${share}%` }}>
                    <Meter width="100%" color={b.color} delay={i * 0.08} height={3} />
                  </div>
                );
              })}
            </div>
          )}

          <dl className="m-0 grid grid-cols-3 gap-x-4">
            {buckets.map((b) => (
              <div key={b.key}>
                <dt className="eyebrow">{b.label}</dt>
                <dd
                  className="font-mono m-0 mt-1.5 text-[19px]"
                  style={{ color: b.count === null ? C.ink4 : b.color }}
                >
                  {b.count === null ? DASH : b.count}
                </dd>
              </div>
            ))}
          </dl>

          <p className="mt-3 text-[12px] leading-[1.7] text-ink-3">
            {ratings.total === null
              ? "The provider did not report how many analysts cover this company."
              : `${ratings.total} ${ratings.total === 1 ? "analyst" : "analysts"} covering.`}
            {ratings.totalDisputed && ratings.reportedTotal !== null && (
              <>
                {" "}
                The provider reported {ratings.reportedTotal} in total; the figure
                above is the sum of the three buckets, which is the one the bar
                is drawn from.
              </>
            )}
          </p>
        </div>

        {/* ---- the target ---- */}
        <div className="border-t border-rule-section pt-5">
          <dl className="m-0 grid grid-cols-2 gap-x-6 gap-y-5">
            <div>
              <dt className="card-label">Consensus target</dt>
              <dd className="font-mono m-0 mt-1.5 text-[19px] text-ink">
                {figure(target.consensus)}
              </dd>
            </div>
            <div>
              <dt className="card-label">Implied upside</dt>
              <dd
                className="font-mono m-0 mt-1.5 text-[19px]"
                style={{ color: tone(upsidePct) }}
              >
                {signed(upsidePct)}
              </dd>
            </div>
          </dl>

          {target.pricePosition !== null && (
            <div className="mt-6">
              <div className="relative h-px w-full" style={{ background: C.ruleMono }}>
                {target.consensusPosition !== null && (
                  <span
                    className="absolute top-[-6px] h-[13px] w-px"
                    style={{ left: `${target.consensusPosition}%`, background: C.gold }}
                  />
                )}
                <span
                  className="absolute top-[-4px] h-[9px] w-px"
                  style={{ left: `${target.pricePosition}%`, background: C.ink }}
                />
              </div>
              <div className="mt-2.5 flex items-baseline justify-between">
                <span className="font-mono text-[11.5px] text-ink-3">
                  {figure(target.low)}
                </span>
                <span className="font-mono text-[11.5px] text-ink-3">
                  {figure(target.high)}
                </span>
              </div>
            </div>
          )}

          <p className="mt-4 max-w-[46ch] text-[12px] leading-[1.7] text-ink-3">
            {upsidePct !== null && price !== null && (
              <>Measured from the last price of {money(price)}. </>
            )}
            {target.pricePosition !== null && (
              <>
                The rail runs from the lowest published target to the highest;
                gold marks the consensus and ink marks the last price.{" "}
              </>
            )}
            {target.priceOutsideRange && (
              <span className="text-ink-2">
                The last price sits outside every published target, so its mark is
                pinned to the end of the rail.{" "}
              </span>
            )}
            {target.currency === null && target.consensus !== null && (
              <>
                The provider did not state a currency for these figures, so they
                are printed without one.{" "}
              </>
            )}
            The consensus is the provider&rsquo;s, not ours, and it carries no date
            &mdash; a target struck a year ago is not a current view.
          </p>
        </div>
      </div>
    </Section>
  );
}

/* ── the panel ─────────────────────────────────────────────────────────── */

export function PerformancePanel({ snapshot }: { snapshot: InstrumentSnapshot }) {
  const { profile, market } = snapshot;
  const points = snapshot.history.daily;

  const analyst = analystView(snapshot);

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
        <AnalystSection view={analyst} ticker={profile.id} />
      </div>
    );
  }

  const rows = rollingPeriods(snapshot);
  const years = calendarYearRows(snapshot);
  const risk = riskProfile(snapshot);
  const curve = drawdownCurve(snapshot);
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

  const summary = [
    {
      label: "1-year return",
      value: signed(oneYear?.stock ?? null),
      color: tone(oneYear?.stock ?? null),
      note: `${marketLabel} ${signed(oneYear?.market ?? null)}`,
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
      <dl className="grid grid-cols-2 border-t border-b border-rule-section sm:grid-cols-3 xl:grid-cols-5">
        {summary.map((s) => (
          <div
            key={s.label}
            className="border-r border-b border-rule-section px-5 py-5 last:border-r-0 xl:border-b-0"
          >
            <dt className="eyebrow mb-3">{s.label}</dt>
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
                  <th scope="col" className={`${TH} text-right`}>
                    {marketLabel}
                  </th>
                  <th scope="col" className={`${TH} text-right`}>
                    vs {marketLabel}
                  </th>
                  <th scope="col" className="hidden w-[96px] sm:table-cell">
                    <span className="sr-only">Relative strength</span>
                  </th>
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
                  <th scope="col" className={`${TH} text-right`}>
                    {marketLabel}
                  </th>
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
                    <td className="font-mono py-3 text-right text-[13px] text-ink-3">
                      {r.market}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <dl className="m-0 mt-6 grid grid-cols-3 gap-x-5">
              <div>
                <dt className="card-label">Five-year CAGR</dt>
                <dd
                  className="font-mono m-0 mt-1.5 text-[19px]"
                  style={{ color: tone(risk.cagr5y) }}
                >
                  {signed(risk.cagr5y)}
                </dd>
              </div>
              <div>
                <dt className="card-label">From 52-week high</dt>
                <dd
                  className="font-mono m-0 mt-1.5 text-[19px]"
                  style={{ color: fallTone(risk.drawdownFrom52WeekHigh) }}
                >
                  {fall(risk.drawdownFrom52WeekHigh)}
                </dd>
              </div>
              <div>
                <dt className="card-label">Beta (5Y)</dt>
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

          <AnalystSection view={analyst} ticker={profile.id} />

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
