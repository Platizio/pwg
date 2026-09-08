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
   series in the feed's own newest-first order renders every trend backwards.

   The same reasoning governs the derived block at the foot of the row — net
   cash, the current ratio, interest coverage, book value per share and the
   three percents. Each is struck from lines that arrived in this very
   response, so none of them can disagree with the column beside it the way a
   trailing-twelve-month figure would. Each also inherits the rule above: a
   quotient over a denominator the feed did not report, or reported as nought
   or as a negative, is not a small number or a large one. It is nothing, and
   it is written as null. */

export type FinancialYear = {
  year: number;

  /* Income statement, in the filing's own reporting currency. */
  revenue: number | null;
  grossProfit: number | null;
  operatingIncome: number | null;
  netIncome: number | null;
  eps: number | null;
  researchDevelopment: number | null;
  /** As the filing signs it; see the note at the interest-coverage call below. */
  interestExpense: number | null;
  ebitda: number | null;
  /** The diluted count, so it divides the same way `eps` was struck. */
  dilutedSharesOutstanding: number | null;

  /** A PERCENT of revenue. */
  grossMargin: number | null;
  /** A PERCENT of revenue. */
  operatingMargin: number | null;
  /** A PERCENT of revenue. */
  netMargin: number | null;

  /* Balance sheet, in the filing's own reporting currency. */
  totalAssets: number | null;
  totalLiabilities: number | null;
  totalEquity: number | null;
  cashAndEquivalents: number | null;
  shortTermInvestments: number | null;
  totalCurrentAssets: number | null;
  totalCurrentLiabilities: number | null;
  debtCurrent: number | null;
  longTermDebt: number | null;

  /* Cash flow, in the filing's own reporting currency. */
  cashFromOps: number | null;
  capex: number | null;
  freeCashFlow: number | null;
  depreciationAmortization: number | null;
  /** A positive magnitude, whichever sign the financing section wrote it with. */
  dividendsPaid: number | null;

  /* Derived from the fields above and from nothing else. Each is null wherever
     an input is absent or the division would not describe anything; the
     reasoning for each sits at its computation. */

  /** Liquid holdings less all borrowings, in the reporting currency. */
  netCash: number | null;
  /** A MULTIPLE (x): current assets over current liabilities. */
  currentRatio: number | null;
  /** A MULTIPLE (x): operating income over the interest bill. */
  interestCoverage: number | null;
  /** Reporting currency per diluted share. */
  bookValuePerShare: number | null;
  /** A PERCENT of revenue spent on research and development. */
  rdIntensity: number | null;
  /** A PERCENT of net income paid out to shareholders as dividends. */
  payoutRatio: number | null;
  /** A PERCENT: free cash flow over revenue. */
  fcfMargin: number | null;
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

/* One division, one guard, behind every derived figure in this file.

   The denominator must be present and strictly positive. Nought is how both
   the filing and the feed spell "no answer", and dividing by it gives an
   infinity that formats as a number — an infinite current ratio renders as a
   company that can pay everything forever, which is the most flattering
   possible way to be wrong. A negative denominator is worse than useless: a
   revenue of -100 against a gross profit of -40 produces a tidy 40% margin,
   and a net loss against a dividend produces a payout ratio that reads as
   prudent. Neither number was ever measured.

   The finiteness check on the way out is not redundant with num(). Both sides
   can be perfectly finite and still overflow — a large numerator over a
   denormal denominator is Infinity — and only the result can be checked. */
function ratio(part: number | null, whole: number | null): number | null {
  if (part === null || whole === null || whole <= 0) return null;
  const out = part / whole;
  return Number.isFinite(out) ? out : null;
}

/** The same division stated as a PERCENT, for every ...Margin, rdIntensity
    and payoutRatio field on the row. */
function margin(part: number | null, whole: number | null): number | null {
  const out = ratio(part, whole);
  return out === null ? null : num(out * 100);
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

    /* Dividends walk into the same trap capital expenditure did: a financing
       outflow arrives signed on some rows and as a bare magnitude on others.
       Left alone it would give a payout ratio that flips sign between adjacent
       years of the same company, which reads as a policy change that never
       happened. Taken as a magnitude, because a company cannot pay a negative
       dividend and the sign carries no information the column can use. */
    const reportedDividends = num(c?.dividends);
    const dividendsPaid = reportedDividends === null ? null : Math.abs(reportedDividends);

    // A filing with no capital expenditure line has none to subtract.
    const freeCashFlow = cashFromOps === null ? null : cashFromOps - (capex ?? 0);

    const researchDevelopment = num(i?.research_development);
    const interestExpense = num(i?.interest_expense);
    const dilutedSharesOutstanding = num(i?.diluted_shares_outstanding);

    const totalEquity = pick(b?.total_equity, b?.total_equity_attributable_to_parent);
    const cashAndEquivalents = num(b?.cash_and_equivalents);
    const shortTermInvestments = num(b?.short_term_investments);
    const totalCurrentAssets = num(b?.total_current_assets);
    const totalCurrentLiabilities = num(b?.total_current_liabilities);
    const debtCurrent = num(b?.debt_current);
    const longTermDebt = num(b?.long_term_debt);

    /* Net cash — what would be left if every borrowing were repaid today out
       of what the company holds in liquid form.

       All four readings are required, and this is the one place in the file
       that does not follow the free-cash-flow rule just above. There, an
       absent capital expenditure line is an absent activity on a statement that
       itemises activities, and there is genuinely nothing to subtract. Here,
       an absent debt line on a balance sheet is an absent reading, and
       defaulting it to nought would publish a debt-free company that the
       filing never claimed — on the single figure a reader is most likely to
       act on. A reported nought, on the other hand, is an answer, and nets to
       nothing exactly as it should. */
    const netCash =
      cashAndEquivalents === null ||
      shortTermInvestments === null ||
      debtCurrent === null ||
      longTermDebt === null
        ? null
        : num(cashAndEquivalents + shortTermInvestments - (debtCurrent + longTermDebt));

    return {
      year,
      revenue,
      grossProfit,
      operatingIncome,
      netIncome,
      /* Diluted is what the market quotes, and the more conservative of the
         two; basic only stands in where diluted is absent. */
      eps: pick(i?.diluted_earnings_per_share, i?.basic_earnings_per_share),
      researchDevelopment,
      /* Passed on exactly as filed. Unlike capital expenditure there is no
         evidence the feed signs this line inconsistently, so taking a
         magnitude here would be inventing a convention rather than repairing
         one; the coverage ratio below refuses a non-positive expense instead. */
      interestExpense,
      ebitda: num(i?.ebitda),
      dilutedSharesOutstanding,
      grossMargin: margin(grossProfit, revenue),
      operatingMargin: margin(operatingIncome, revenue),
      netMargin: margin(netIncome, revenue),
      totalAssets: num(b?.total_assets),
      totalLiabilities: num(b?.total_liabilities),
      totalEquity,
      cashAndEquivalents,
      shortTermInvestments,
      totalCurrentAssets,
      totalCurrentLiabilities,
      debtCurrent,
      /* The plain line only. `long_term_debt_and_capital_lease_obligations`
         sits beside it and is a larger, different quantity, so falling back to
         it would swap the definition of the debt column on exactly the years
         where the plain line is missing — the sort of silent mixed series that
         the net-cash figure below would then report as a balance sheet
         improving or deteriorating on nothing but a change of disclosure. */
      longTermDebt,
      cashFromOps,
      capex,
      freeCashFlow,
      depreciationAmortization: num(c?.depreciation_depletion_and_amortization),
      dividendsPaid,
      netCash,
      currentRatio: ratio(totalCurrentAssets, totalCurrentLiabilities),
      /* An operating loss keeps its sign — a coverage of -2x is a real and
         alarming reading — but a nought or negative interest bill produces
         nothing. Nought is a debt-free year or an unanswered line, and a
         signed-negative expense would turn a company earning forty against a
         bill of five into a coverage of -8x, which reads as distress from a
         statement that reports the opposite. */
      interestCoverage: ratio(operatingIncome, interestExpense),
      /* Equity may properly be negative — a balance sheet in deficit is a fact
         the column should state — but the share count may not be nought, and a
         company with no shares is a feed that did not answer. */
      bookValuePerShare: ratio(totalEquity, dilutedSharesOutstanding),
      /* A PERCENT, like every margin on the row and for the same reason: the
         reader compares it against a peer's without checking the unit, and a
         fraction escaping here would understate a research budget by a
         hundredfold in the direction that flatters. */
      rdIntensity: margin(researchDevelopment, revenue),
      /* A PERCENT, and refused against a loss. Five paid out of twenty lost is
         -25%, which renders as a company returning a quarter of its earnings;
         it is in fact a company funding a dividend out of the balance sheet,
         and the column that says nothing is nearer the truth than the one that
         says the opposite. */
      payoutRatio: margin(dividendsPaid, netIncome),
      /* A PERCENT. Free cash flow keeps its sign, so a year that burned cash
         reports a negative margin rather than a gap. */
      fcfMargin: margin(freeCashFlow, revenue),
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
