"use client";

import { pct } from "@/lib/market/format";
import {
  annualisedVolatility,
  calendarYears,
  drawdownFromHigh,
  periodReturn,
  PERIODS,
  ytdReturn,
} from "@/lib/api/normalize/performance";
import type { InstrumentSnapshot } from "@/lib/market/instrument";
import { C, trend } from "@/lib/tokens";
import { Meter, Section } from "../ui";

/**
 * How the instrument has actually done.
 *
 * Every figure is measured from the same split-repaired daily series the chart
 * draws, so nothing here can disagree with the line above it. Where the series
 * does not reach back far enough the row shows a dash rather than a number
 * borrowed from a shorter window.
 *
 * The market column is the tracking fund rather than the index — no index
 * instrument is entitled on this account — which is the same admission the
 * market card makes on the dashboard.
 */
const DASH = "—";

const signed = (n: number | null) => (n === null ? DASH : pct(n, 1));
const tone = (n: number | null) => (n === null ? C.ink4 : trend(n >= 0));

/** Bar width from a percentage, so a row reads before it is read. */
const bar = (n: number | null) =>
  n === null ? "0%" : `${Math.max(4, Math.min(100, Math.abs(n) * 1.4 + 6))}%`;

export function PerformancePanel({ snapshot }: { snapshot: InstrumentSnapshot }) {
  const points = snapshot.history.daily;
  const { profile, market } = snapshot;

  /* The series' own last timestamp, not a clock: a Date.now() in the render
     path is what the whole data layer is built to avoid. */
  const now = points.length ? points[points.length - 1].at : 0;
  const ytd = ytdReturn(points, now);
  const years = calendarYears(points).slice(0, 6);
  const vol = annualisedVolatility(points);
  const fall = drawdownFromHigh(profile.price, profile.high52);

  const rows = PERIODS.map((p) => ({
    label: p.label,
    value: periodReturn(points, p.sessions),
    /* The same window measured on the tracking fund, so a reader can tell a
       company that rose from a market that did. */
    market: market ? periodReturn(market.daily, p.sessions) : null,
  }));

  if (points.length === 0) {
    return (
      <p className="max-w-[52ch] text-[13.5px] leading-[1.7] text-ink-3">
        No price history is available for this instrument, so there is nothing to
        measure performance against.
      </p>
    );
  }

  return (
    <div className="grid gap-11 xl:grid-cols-[1.35fr_1fr]">
      <div className="flex flex-col gap-11">
        <Section title="Trailing returns" eyebrow="Split-adjusted, to the last completed session">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-rule">
                <th scope="col" className="py-2 text-[11px] font-semibold tracking-[0.14em] text-ink-3 uppercase">
                  Period
                </th>
                <th scope="col" className="py-2 text-right text-[11px] font-semibold tracking-[0.14em] text-ink-3 uppercase">
                  {profile.id}
                </th>
                <th scope="col" className="py-2 text-right text-[11px] font-semibold tracking-[0.14em] text-ink-3 uppercase">
                  {market?.symbol ?? "Market"}
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.label} className="border-b border-rule/60">
                  <td className="py-3.5 text-[13.5px] text-ink-2">
                    {r.label}
                    <Meter width={bar(r.value)} color={tone(r.value)} delay={i * 0.04} />
                  </td>
                  <td className="font-mono py-3.5 text-right text-[14px]" style={{ color: tone(r.value) }}>
                    {signed(r.value)}
                  </td>
                  <td className="font-mono py-3.5 text-right text-[13px] text-ink-3">
                    {signed(r.market)}
                  </td>
                </tr>
              ))}
              <tr className="border-b border-rule/60">
                <td className="py-3.5 text-[13.5px] text-ink-2">Year to date</td>
                <td className="font-mono py-3.5 text-right text-[14px]" style={{ color: tone(ytd) }}>
                  {signed(ytd)}
                </td>
                <td className="font-mono py-3.5 text-right text-[13px] text-ink-3">
                  {signed(market ? ytdReturn(market.daily, now) : null)}
                </td>
              </tr>
            </tbody>
          </table>

          <p className="mt-4 max-w-[54ch] text-[12.5px] leading-[1.7] text-ink-3">
            Total returns, adjusted for splits. The comparison column is{" "}
            {market?.symbol ?? "the market"}, the fund that tracks the S&amp;P 500 — no
            index instrument is available on this account.
          </p>
        </Section>

        <Section title="Calendar years" eyebrow="Close to close">
          <ul className="m-0 flex list-none flex-col p-0">
            {years.map((y, i) => (
              <li key={y.year} className="border-t border-rule-list first:border-t-0">
                <div className="flex items-center gap-4 py-3.5">
                  <span className="font-mono w-[52px] flex-none text-[13px] text-ink-3">
                    {y.year}
                  </span>
                  <span className="min-w-0 flex-1">
                    <Meter width={bar(y.change)} color={tone(y.change)} delay={i * 0.04} />
                  </span>
                  <span
                    className="font-mono w-[76px] flex-none text-right text-[13.5px]"
                    style={{ color: tone(y.change) }}
                  >
                    {signed(y.change)}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </Section>
      </div>

      <div className="flex flex-col gap-11">
        <Section title="Risk" eyebrow="Measured from the same series">
          <dl className="m-0 grid grid-cols-2 gap-x-6 gap-y-6">
            <div>
              <dt className="card-label">Five-year CAGR</dt>
              <dd
                className="font-mono mt-2 text-[19px]"
                style={{ color: tone(snapshot.returns.cagr5y) }}
              >
                {snapshot.returns.cagr5y === null ? DASH : pct(snapshot.returns.cagr5y, 1)}
              </dd>
              <p className="mt-1 text-[11.5px] text-ink-3">Compound annual rate</p>
            </div>
            <div>
              <dt className="card-label">Volatility</dt>
              <dd className="font-mono mt-2 text-[19px] text-ink-2">
                {vol === null ? DASH : `${vol.toFixed(1)}%`}
              </dd>
              <p className="mt-1 text-[11.5px] text-ink-3">Annualised, daily</p>
            </div>
            <div>
              <dt className="card-label">From 52-week high</dt>
              <dd className="font-mono mt-2 text-[19px]" style={{ color: tone(fall) }}>
                {fall === null ? DASH : pct(fall, 1)}
              </dd>
            </div>
            <div>
              <dt className="card-label">Beta</dt>
              <dd className="font-mono mt-2 text-[19px] text-ink-2">
                {profile.beta === null ? DASH : profile.beta.toFixed(2)}
              </dd>
              <p className="mt-1 text-[11.5px] text-ink-3">Against the market, 5Y</p>
            </div>
          </dl>
        </Section>

        <Section title="Largest sessions" eyebrow="Single-day moves in the record">
          <ul className="m-0 flex list-none flex-col p-0">
            {snapshot.notableMoves.map((m) => (
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

        <Section title="Analyst view" eyebrow="Not available">
          {/* Ratings, price targets and estimates all answer 403 on this
              account — the endpoints exist, the entitlement does not. A
              consensus is the one thing on this page that cannot be derived
              from a price, so the space says so rather than filling itself. */}
          <p className="max-w-[46ch] text-[13.5px] leading-[1.7] text-ink-3">
            Analyst ratings and price targets are not available on this account.
            Everything above is measured from the price record itself.
          </p>
        </Section>
      </div>
    </div>
  );
}
