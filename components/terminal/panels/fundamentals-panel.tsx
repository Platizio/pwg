"use client";

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
import { LeaderRow, Meter, Section } from "../ui";

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

  return (
    /* The ledger is wider than a phone. It scrolls inside its own box rather
       than making the whole page scroll sideways, and it bleeds to the column
       edge so the first scroll of a finger is on the table itself. */
    <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      <table className="w-full min-w-[540px] border-collapse text-left">
        <thead>
          <tr className="border-b border-rule">
            <th scope="col" className="eyebrow py-2.5 text-left">
              Fiscal year
            </th>
            {ledger.years.map((y, i) => (
              <th
                key={y}
                scope="col"
                /* The latest column is the one the eye should land in. */
                className={`font-mono py-2.5 pl-4 text-right text-[11px] tracking-[0.08em] ${
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
            <tr key={row.key} className="border-b border-rule-table">
              <th
                scope="row"
                className="py-3.5 pr-4 text-left text-[13px] font-normal text-ink-2"
              >
                {row.label}
              </th>
              {row.cells.map((c, i) => (
                <td key={ledger.years[i]} className="py-3.5 pl-4 text-right align-bottom">
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
  const valuationRows = [...ratios(snapshot), ...valuation(snapshot)];
  const filed = income.years.length > 0;

  return (
    <div className="flex flex-col gap-11">
      {filed ? (
        <dl className="grid grid-cols-2 border-t border-b border-rule-section sm:grid-cols-3 xl:grid-cols-5">
          {strip.map((f) => (
            <div
              key={f.key}
              className="border-r border-b border-rule-section px-5 py-5 last:border-r-0 xl:border-b-0"
            >
              <dt className="eyebrow mb-3">{f.label}</dt>
              <dd className="m-0">
                <span className="font-serif block text-[24px] tracking-[0.01em]">{f.value}</span>
                {f.note && (
                  <span className="font-mono mt-2 block text-[11px] text-ink-3">{f.note}</span>
                )}
              </dd>
            </div>
          ))}
        </dl>
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
                  <td className="py-3.5 pr-4 text-[13.5px] text-ink-2">
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
          <dl className="grid grid-cols-1 gap-x-10 sm:grid-cols-2">
            {valuationRows.map((r) => (
              <LeaderRow key={r.label} label={r.label} value={r.value} />
            ))}
          </dl>
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
                      Ex-dividend {p.exDate}
                      {p.payDate && (
                        <span className="text-ink-3"> · paid {p.payDate}</span>
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
