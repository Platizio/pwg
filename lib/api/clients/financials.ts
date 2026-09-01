import "server-only";
import { vtGet } from "../http.ts";
import type { ApiResult } from "../errors.ts";

/* /mdp/api/v1/aggregation/financials/{ticker} — the filed statements.

   Five periods of income statement, balance sheet and cash flow, newest first.
   This is the only place on the gateway that carries a company's own reported
   figures rather than a ratio computed from them, which makes it the source
   for the revenue history, the margin trend and free cash flow.

   Two habits of the feed shape every type below. Line items are omitted rather
   than nulled when a filing does not carry them, so nothing here may be read
   without a presence check even though the fields are declared. And the three
   lists are independent: a restated balance sheet can leave a year in one
   statement and not the others, so they are joined by fiscal_year and never by
   position. The join lives in ../normalize/financials.ts.

   The names are the feed's own. Notably there is no `net_income` on the income
   statement — the figure arrives as consolidated_net_income_loss and as
   net_income_loss_attributable_common_shareholders — while the cash flow
   statement does call its opening line `net_income`. */

export type FinancialsTimeframe = "annual" | "quarterly";

/** What every row carries regardless of which statement it belongs to. */
type RawStatementRow = {
  tickers: string[];
  cik: string;
  /** "YYYY-MM-DD" — the last day of the fiscal period, not the filing day. */
  period_end: string;
  filing_date: string;
  fiscal_quarter: number;
  fiscal_year: number;
  timeframe: string;
};

export type RawIncome = RawStatementRow & {
  revenue: number | null;
  cost_of_revenue: number | null;
  gross_profit: number | null;
  research_development: number | null;
  selling_general_administrative: number | null;
  other_operating_expenses: number | null;
  total_operating_expenses: number | null;
  operating_income: number | null;
  interest_income: number | null;
  interest_expense: number | null;
  other_income_expense: number | null;
  total_other_income_expense: number | null;
  income_before_income_taxes: number | null;
  income_taxes: number | null;
  /** Documented, but the live payload answers with the two below instead. */
  net_income: number | null;
  consolidated_net_income_loss: number | null;
  /** After minority interests — the figure the per-share numbers divide. */
  net_income_loss_attributable_common_shareholders: number | null;
  basic_earnings_per_share: number | null;
  diluted_earnings_per_share: number | null;
  basic_shares_outstanding: number | null;
  diluted_shares_outstanding: number | null;
  ebitda: number | null;
};

export type RawBalance = RawStatementRow & {
  cash_and_equivalents: number | null;
  short_term_investments: number | null;
  receivables: number | null;
  inventories: number | null;
  other_current_assets: number | null;
  total_current_assets: number | null;
  property_plant_equipment_net: number | null;
  intangible_assets_net: number | null;
  other_assets: number | null;
  total_assets: number | null;
  accounts_payable: number | null;
  accrued_and_other_current_liabilities: number | null;
  deferred_revenue_current: number | null;
  debt_current: number | null;
  total_current_liabilities: number | null;
  long_term_debt: number | null;
  long_term_debt_and_capital_lease_obligations: number | null;
  other_noncurrent_liabilities: number | null;
  total_liabilities: number | null;
  common_stock: number | null;
  retained_earnings_deficit: number | null;
  accumulated_other_comprehensive_income: number | null;
  other_equity: number | null;
  total_equity_attributable_to_parent: number | null;
  total_equity: number | null;
  total_liabilities_and_equity: number | null;
};

export type RawCashFlow = RawStatementRow & {
  net_income: number | null;
  depreciation_depletion_and_amortization: number | null;
  change_in_other_operating_assets_and_liabilities_net: number | null;
  other_operating_activities: number | null;
  cash_from_operating_activities_continuing_operations: number | null;
  net_cash_from_operating_activities: number | null;
  /** Documented; the live payload answers with the purchase line instead.
      Either may arrive signed as an outflow. */
  capital_expenditure: number | null;
  purchase_of_property_plant_and_equipment: number | null;
  other_investing_activities: number | null;
  net_cash_from_investing_activities_continuing_operations: number | null;
  net_cash_from_investing_activities: number | null;
  dividends: number | null;
  short_term_debt_issuances_repayments: number | null;
  long_term_debt_issuances_repayments: number | null;
  other_financing_activities: number | null;
  net_cash_from_financing_activities_continuing_operations: number | null;
  net_cash_from_financing_activities: number | null;
  change_in_cash_and_equivalents: number | null;
};

export type RawFinancials = {
  status: string;
  income_statements: RawIncome[];
  balance_sheets: RawBalance[];
  cash_flow_statements: RawCashFlow[];
};

export function fetchFinancials(
  ticker: string,
  timeframe: FinancialsTimeframe,
  revalidate: number,
  tags: string[],
  noStore = false,
): Promise<ApiResult<RawFinancials>> {
  return vtGet<RawFinancials>(
    `/mdp/api/v1/aggregation/financials/${encodeURIComponent(ticker)}`,
    { query: { timeframe }, revalidate, tags, noStore },
  );
}
