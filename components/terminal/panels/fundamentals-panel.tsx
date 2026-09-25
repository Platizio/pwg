"use client";

import { useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import {
  balanceLedger,
  cashFlowLedger,
  dividendRecord,
  growth,
  headline,
  incomeLedger,
  marginLedger,
  valuation,
  type Ledger,
} from "@/lib/market/derive-fundamentals";
import { ratios } from "@/lib/market/instrument-derive";
import type { InstrumentSnapshot } from "@/lib/market/instrument";
import { useLiveSnapshot } from "../live-provider";
import { overflowEdges } from "../tab-strip";
import { cn, LeaderRow, Meter, Section } from "../ui";
import { dayLabel } from "./day-label";

/* The filed record, read the way somebody deciding whether to buy reads it.
 *
 * This panel used to be twelve trailing scalars and a bar chart of revenue
 * with no growth rate on it: a reader could see the company earned $416B and
 * not whether that was a good year, could not see a margin move, a cash
 * statement, a balance sheet or a dividend. It was the thinnest surface in the
 * product and it sat under the tab a long-term holder opens first.
 *
 * The scan path is deliberate and it repeats at every scale — a figure, its
 * trend, its context:
 *
 *   · the strip gives five figures, each stamped with its fiscal year and its
 *     last move, so the page answers "how did the year go" before it is read;
 *   · growth turns those into rates, over one year and over the whole record;
 *   · four ledgers put the years side by side, metric down the page, the way
 *     an annual report's five-year summary does — one shape, learned once and
 *     then reused, which is what keeps a page this dense calm;
 *   · valuation and the dividend record close it, because they are what the
 *     reader does with everything above.
 *
 * Lux: no cards, hairlines only, serif for names and mono for figures, and the
 * one 2px Meter for the only row of numbers that shares a natural scale. Every
 * value arrives pre-formatted from lib/market/derive-fundamentals.ts — this
 * file does no arithmetic at all, which is what keeps the guarding of absent
 * lines and zero denominators in one place that has tests around it. */

/** Metric rows against fiscal-year columns, shared by all four ledgers. */
function LedgerTable({
  ledger,
  meters = false,
}: {
  ledger: Ledger;
  /** Draw the 2px bar beneath each figure. Margins only — see the module. */
  meters?: boolean;
}) {
  const last = ledger.years.length - 1;
  const scroller = useRef<HTMLDivElement>(null);
  /* Whether any year is scrolled away under the pinned labels. */
  const [beneath, setBeneath] = useState(false);

  /* Opened on the latest year. On a phone the ledger is wider than the
     screen, and resting at its start showed 2021 and 2022 — on the balance
     sheet two columns of dashes — while the gold column the eye is meant to
     land in sat off the right edge with nothing saying the table scrolled.

     Keyed on the years rather than the ledger object, which is rebuilt on
     every render: a live price re-renders this panel several times a minute,
     and each of those would otherwise yank a reader's scroll back to the end. */
  const span = ledger.years.join(" ");
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    el.scrollLeft = el.scrollWidth;
    const measure = () =>
      setBeneath(overflowEdges(el.scrollLeft, el.clientWidth, el.scrollWidth).start);
    measure();
    el.addEventListener("scroll", measure, { passive: true });
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => {
      el.removeEventListener("scroll", measure);
      observer.disconnect();
    };
  }, [span]);

  /* The label column, pinned on a phone so a figure scrolled into view still
     has its name beside it, on the shell's own ground so the figures pass
     beneath it. Only below `sm`: above it every ledger fits its column, and an
     opaque cell there would sit as a flat block on the champagne wash near the
     top of the working column. Once there are years hidden under it, a
     hairline marks its edge, the way a spreadsheet marks a frozen pane. */
  const pinned = cn(
    "max-sm:sticky max-sm:left-0 max-sm:z-[1] max-sm:bg-shell",
    beneath &&
      "max-sm:after:pointer-events-none max-sm:after:absolute max-sm:after:inset-y-0 max-sm:after:right-0 max-sm:after:w-px max-sm:after:bg-rule max-sm:after:content-['']",
  );

  return (
    /* The ledger is wider than a phone. It scrolls inside its own box rather
       than making the whole page scroll sideways, and the box stops on the
       column's gutters like every other rule on the page.

       Fixed layout, one label width and equal year columns, so the four
       ledgers stacked on this tab — which always share their years — put
       every year in the same place: in auto layout each sized its columns to
       its own labels and figures, and 2021 sat four pixels apart from one to
       the next.

       On a phone each year column is half the width the pinned labels leave,
       and the years snap to the labels' edge, so every resting position shows
       two whole years and never a figure cut in half beneath the labels. From
       sm up the table is simply the column's width, which holds every year:
       the widest figure ("$416.16B") needs 74px with its padding.

       From sm the label column is a share of the table rather than a fixed
       128 or 160px. Fixed, it stayed that narrow on a desktop column three
       times as wide, and "Research & development" or "Shareholders' equity"
       broke onto two lines beside years with 100px each to spare. A quarter
       for six years, 28% for five or fewer: at the narrowest sm column
       (592px) that is 142px beside six 75px years, or 166px beside five of
       85px; at 1440 (756px) 181px or 212px, with years of 96px and 109px. */
    <div
      ref={scroller}
      className="overflow-x-auto overscroll-x-contain max-sm:snap-x max-sm:snap-mandatory max-sm:scroll-pl-32"
    >
      <table
        className="w-full table-fixed border-separate border-spacing-0 text-left max-sm:w-(--ledger-width)"
        style={
          {
            "--ledger-width": `max(100%, calc(8rem + ${ledger.years.length} * (100% - 8rem) / 2))`,
          } as CSSProperties
        }
      >
        <thead>
          {/* Rules on the cells rather than the row: a row's border belongs
              to a collapsed table, which leaves it behind when a pinned cell
              moves, and draws nothing at all in a separated one. */}
          <tr className="[&>th]:border-b [&>th]:border-rule">
            <th
              scope="col"
              className={cn(
                "eyebrow py-2.5 pr-4 text-left",
                ledger.years.length > 5 ? "w-32 sm:w-[24%]" : "w-32 sm:w-[28%]",
                pinned,
              )}
            >
              Fiscal year
            </th>
            {ledger.years.map((y, i) => (
              <th
                key={y}
                scope="col"
                /* The latest column is the one the eye should land in. */
                className={`font-mono py-2.5 pl-4 text-right text-[11px] tracking-[0.08em] max-sm:snap-start ${
                  i === last ? "text-gold" : "text-ink-3"
                }`}
              >
                {y}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {ledger.rows.map((row) => (
            <tr key={row.key} className="[&>*]:border-b [&>*]:border-rule-table">
              {/* Everything top-aligned. The first line of each cell is the
                  one the eye reads across, so it shares a single line with the
                  row label; the margins' meters hang below it. */}
              <th
                scope="row"
                className={cn(
                  "py-3.5 pr-4 text-left align-top text-[13px] font-normal text-ink-2",
                  pinned,
                )}
              >
                {row.label}
              </th>
              {row.cells.map((c, i) => (
                <td key={ledger.years[i]} className="py-3.5 pl-4 text-right align-top">
                  <span
                    className={`font-mono text-[13px] ${i === last ? "text-ink" : "text-ink-2"}`}
                  >
                    {c.value}
                  </span>
                  {meters && (
                    <span className="mt-2 block">
                      {c.width && c.color ? (
                        <Meter width={c.width} color={c.color} delay={i * 0.05} />
                      ) : (
                        /* A year with no reading draws no bar at all. A
                           zero-width one in a row of full ones is
                           indistinguishable from a year that earned nothing;
                           the spacer keeps the rows aligned without saying so. */
                        <span aria-hidden="true" className="block h-[2px]" />
                      )}
                    </span>
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function FundamentalsPanel({ snapshot }: { snapshot: InstrumentSnapshot }) {
  /* The market cap, and the FCF yield, EV and P/FCF struck from it, follow
     the header's price: the stored cap was fixed at the previous close, and
     this page is cached. The filed figures below do not move with price. */
  const live = useLiveSnapshot(snapshot);
  const strip = headline(snapshot);
  const rates = growth(snapshot);
  const income = incomeLedger(snapshot);
  const margins = marginLedger(snapshot);
  const cash = cashFlowLedger(snapshot);
  const balance = balanceLedger(snapshot);
  const dividends = dividendRecord(snapshot);
  /* The twelve trailing ratios stay exactly as they were — imported, not
     reimplemented — and the five this module adds run on after them in the
     same list. */
  const valuationRows = [...ratios(live), ...valuation(live)];
  const filed = income.years.length > 0;

  return (
    <div className="flex flex-col gap-11">
      {filed ? (
        /* Ruled like the Overview and Performance strips: each cell draws its
           top and left edges and the wrapper clips the ones on the outer edge,
           so two columns on a phone close the box on neither side rather than
           the right only, and nothing doubles the rule at the foot. */
        <div className="overflow-hidden border-t border-b border-rule-section">
          <dl className="-mt-px -ml-px grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5">
            {/* Each cell spans two rows of the strip's own grid, label over
                figure, so every figure in a row shares one top line however
                many lines its label takes. A single-line label sits on the
                bottom of the label track, level with the last line of a wrapped
                one, and the figures and their notes line up across the strip.
                The odd fifth cell takes the rest of its row wherever the
                columns do not divide five. */}
            {strip.map((f) => (
              <div
                key={f.key}
                className="row-span-2 grid grid-rows-subgrid border-t border-l border-rule-section px-5 py-5 last:col-span-2 xl:last:col-span-1"
              >
                <dt className="eyebrow mb-3 self-end">{f.label}</dt>
                <dd className="m-0">
                  <span className="font-serif block text-[24px] tracking-[0.01em]">{f.value}</span>
                  {f.note && (
                    <span className="font-mono mt-2 block text-[11px] text-ink-3">{f.note}</span>
                  )}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      ) : (
        <p className="max-w-[54ch] text-[13.5px] leading-[1.7] text-ink-3">
          {snapshot.financials.note ??
            "No filings are available for this company, so there is nothing to read here beyond the ratios below."}
        </p>
      )}

      {filed && (
        <Section title="Growth" eyebrow="Year over year, and compounded across the record">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-rule">
                <th scope="col" className="eyebrow py-2.5 text-left">
                  Measure
                </th>
                <th scope="col" className="eyebrow py-2.5 pl-4 text-right">
                  Latest
                </th>
                <th scope="col" className="eyebrow py-2.5 pl-4 text-right">
                  Year on year
                </th>
                <th scope="col" className="eyebrow py-2.5 pl-4 text-right">
                  Annualised
                </th>
              </tr>
            </thead>
            <tbody>
              {rates.map((r, i) => (
                <tr key={r.key} className="border-b border-rule-table">
                  {/* Top-aligned like the three figures beside it: the meter
                      hangs below the label, so the label is the cell's first
                      line and has to share the row's top line. */}
                  <td className="py-3.5 pr-4 align-top text-[13.5px] text-ink-2">
                    {r.label}
                    <span className="mt-2 block">
                      <Meter width={r.yoyWidth} color={r.yoyColor} delay={i * 0.06} />
                    </span>
                  </td>
                  <td className="font-mono py-3.5 pl-4 text-right align-top text-[14px] text-ink">
                    {r.latest}
                  </td>
                  <td
                    className="font-mono py-3.5 pl-4 text-right align-top text-[14px]"
                    style={{ color: r.yoyColor }}
                  >
                    {r.yoy}
                  </td>
                  <td className="py-3.5 pl-4 text-right align-top">
                    <span className="font-mono block text-[14px]" style={{ color: r.cagrColor }}>
                      {r.cagr}
                    </span>
                    {/* The window, named rather than assumed: a rate over three
                        filed years and one over five are not comparable, and
                        the reader cannot tell them apart from the figure. */}
                    {r.span && (
                      <span className="font-mono mt-1 block text-[11px] text-ink-3">{r.span}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>
      )}

      {filed && (
        <Section title="Income statement" eyebrow="As filed, in the reporting currency">
          <LedgerTable ledger={income} />
        </Section>
      )}

      {filed && (
        <Section title="Margins" eyebrow="Percent of revenue · the bar is the figure against a hundred">
          <LedgerTable ledger={margins} meters />
        </Section>
      )}

      {filed && (
        <Section title="Cash flow" eyebrow="What the earnings turned into">
          <LedgerTable ledger={cash} />
          <p className="mt-4 max-w-[62ch] text-[12.5px] leading-[1.7] text-ink-3">
            Capital spend is shown as the outflow it is, so the free cash flow
            beneath it reads as the subtraction. Cash conversion is free cash
            flow against net income — above a hundred per cent, the company
            collected more money than it booked as profit.
          </p>
        </Section>
      )}

      {filed && (
        <Section title="Balance sheet" eyebrow="What stands behind the earnings">
          <LedgerTable ledger={balance} />
          <p className="mt-4 max-w-[62ch] text-[12.5px] leading-[1.7] text-ink-3">
            A dash is a line the filing did not carry — never a nought.
            Borrowings are counted only where both the current and the
            long-term debt lines are disclosed, because treating a line that is
            absent as a debt that is zero would report a company as unlevered
            on the strength of a figure nobody filed. Where they are not
            disclosed, liabilities over equity is the leverage the record does
            support.
          </p>
        </Section>
      )}

      <div className="grid gap-11 xl:grid-cols-[1.15fr_1fr]">
        <Section title="Valuation" eyebrow="Live price against the latest filed year">
          {/* Two columns only when the list's own column can hold them. Sized
              by the viewport, it split into two ~170px columns inside the
              narrow xl column, and five labels wrapped around their leaders. */}
          <div className="@container">
            <dl className="grid grid-cols-1 gap-x-10 @min-[40rem]:grid-cols-2">
              {valuationRows.map((r) => (
                <LeaderRow key={r.label} label={r.label} value={r.value} />
              ))}
            </dl>
          </div>
        </Section>

        <Section
          title="Dividends"
          eyebrow={dividends.cadence ? `${dividends.cadence} · declared` : "Distribution record"}
        >
          {dividends.payments.length === 0 ? (
            <p className="max-w-[46ch] text-[13.5px] leading-[1.7] text-ink-3">
              No dividend has been recorded for this company.
            </p>
          ) : (
            <>
              <dl className="m-0 grid grid-cols-2 gap-x-8 gap-y-5">
                {dividends.figures.map((f) => (
                  <div key={f.key}>
                    <dt className="eyebrow mb-2">{f.label}</dt>
                    <dd className="m-0">
                      <span className="font-mono block text-[15px] text-ink">{f.value}</span>
                      {f.note && (
                        <span className="mt-1 block text-[11.5px] leading-[1.5] text-ink-3">
                          {f.note}
                        </span>
                      )}
                    </dd>
                  </div>
                ))}
              </dl>

              <p className="eyebrow mt-8">Recent payments</p>
              <ul className="m-0 mt-3 flex list-none flex-col p-0">
                {dividends.payments.map((p) => (
                  <li
                    key={p.exDate}
                    className="rule-t flex items-baseline justify-between gap-3 py-3"
                  >
                    <span className="text-[13px] text-ink-2">
                      Ex-dividend {dayLabel(p.exDate) ?? p.exDate}
                      {p.payDate && (
                        <span className="text-ink-3"> · paid {dayLabel(p.payDate) ?? p.payDate}</span>
                      )}
                    </span>
                    <span className="font-mono flex-none text-[13px] text-ink">{p.amount}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </Section>
      </div>
    </div>
  );
}
