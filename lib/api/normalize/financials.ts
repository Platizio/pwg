import type { RawFinancials } from "../clients/financials.ts";

/* Three filed statements, flattened into one row per fiscal year.

   The statements page and the revenue chart both want a year to be a single
   thing — revenue beside total assets beside free cash flow — while the feed
   sends three independent lists that need not agree on length or order. A
   restatement filed against the balance sheet alone is enough to knock the
   arrays out of step, so the join is by fiscal_year and a year that only one
   statement covers still produces a row with nulls in the rest of it.

   Margins are computed here rather than taken from the ratios endpoint, whose
   figures are trailing-twelve-month and would sit in a column of fiscal years
   claiming to be one of them. A margin over a revenue the feed did not report
   is nothing at all: never zero, and never the infinity that dividing by an
   absent or zero revenue would otherwise produce.

   Ordering is oldest-first because every consumer draws left to right, and a
   series in the feed's own newest-first order renders every trend backwards. */

export type FinancialYear = {
  year: number;
  revenue: number | null;
  grossProfit: number | null;
  operatingIncome: number | null;
  netIncome: number | null;
  eps: number | null;
  grossMargin: number | null;
  operatingMargin: number | null;
  netMargin: number | null;
  totalAssets: number | null;
  totalLiabilities: number | null;
  totalEquity: number | null;
  cashFromOps: number | null;
  capex: number | null;
  freeCashFlow: number | null;
};

/** A line item the filing omits arrives as undefined, not as null. */
const num = (v: number | null | undefined): number | null =>
  typeof v === "number" && Number.isFinite(v) ? v : null;

/** The first name the feed actually answered to. A reported zero is an answer. */
function pick(...candidates: Array<number | null | undefined>): number | null {
  for (const c of candidates) {
    const n = num(c);
    if (n !== null) return n;
  }
  return null;
}

function margin(part: number | null, revenue: number | null): number | null {
  if (part === null || revenue === null || revenue === 0) return null;
  return (part / revenue) * 100;
}

/* Rows keyed by year, tolerating a payload that is not what it claims to be —
   a failed upstream can answer 200 with an error envelope and no arrays at all.

   Where a year appears twice the first row wins: the feed sends newest first
   within each statement, so the first occurrence is the most recently filed
   version of that year. */
function byYear<T extends { fiscal_year: number }>(rows: readonly T[]): Map<number, T> {
  const out = new Map<number, T>();
  const list: readonly T[] = Array.isArray(rows) ? rows : [];
  for (const row of list) {
    if (!row) continue;
    const year = num(row.fiscal_year);
    if (year === null || out.has(year)) continue;
    out.set(year, row);
  }
  return out;
}

export function toFinancialYears(raw: RawFinancials): FinancialYear[] {
  if (!raw) return [];

  const income = byYear(raw.income_statements);
  const balance = byYear(raw.balance_sheets);
  const cash = byYear(raw.cash_flow_statements);

  const years = [...new Set([...income.keys(), ...balance.keys(), ...cash.keys()])];
  years.sort((a, b) => a - b);

  return years.map((year) => {
    const i = income.get(year);
    const b = balance.get(year);
    const c = cash.get(year);

    const revenue = num(i?.revenue);
    const grossProfit = num(i?.gross_profit);
    const operatingIncome = num(i?.operating_income);

    /* Attributable to common shareholders first: it is the figure the
       per-share numbers divide, and it is the one that differs from the
       consolidated total where minority interests exist. */
    const netIncome = pick(
      i?.net_income_loss_attributable_common_shareholders,
      i?.consolidated_net_income_loss,
      i?.net_income,
    );

    const cashFromOps = pick(
      c?.net_cash_from_operating_activities,
      c?.cash_from_operating_activities_continuing_operations,
    );

    /* Capital expenditure arrives as a signed outflow on some rows and as a
       bare magnitude on others. Carrying that inconsistency through would put
       the subtraction below the wrong way round on half a company's history
       and give a column that changes sign between adjacent years. */
    const reportedCapex = pick(c?.capital_expenditure, c?.purchase_of_property_plant_and_equipment);
    const capex = reportedCapex === null ? null : Math.abs(reportedCapex);

    return {
      year,
      revenue,
      grossProfit,
      operatingIncome,
      netIncome,
      /* Diluted is what the market quotes, and the more conservative of the
         two; basic only stands in where diluted is absent. */
      eps: pick(i?.diluted_earnings_per_share, i?.basic_earnings_per_share),
      grossMargin: margin(grossProfit, revenue),
      operatingMargin: margin(operatingIncome, revenue),
      netMargin: margin(netIncome, revenue),
      totalAssets: num(b?.total_assets),
      totalLiabilities: num(b?.total_liabilities),
      totalEquity: pick(b?.total_equity, b?.total_equity_attributable_to_parent),
      cashFromOps,
      capex,
      // A filing with no capital expenditure line has none to subtract.
      freeCashFlow: cashFromOps === null ? null : cashFromOps - (capex ?? 0),
    };
  });
}

const BILLION = 1_000_000_000;

/** Revenue in billions, the unit the bar chart's axis is drawn in.

    A year the feed has no revenue for is left out rather than passed on as a
    zero, which would draw a bar asserting the company earned nothing. */
export function revenueSeries(years: FinancialYear[]): number[] {
  const out: number[] = [];
  for (const y of years) {
    if (y.revenue === null) continue;
    out.push(y.revenue / BILLION);
  }
  return out;
}
