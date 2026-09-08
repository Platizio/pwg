import { test } from "node:test";
import assert from "node:assert/strict";
import { revenueSeries, toFinancialYears } from "../lib/api/normalize/financials.ts";
import type {
  RawBalance,
  RawCashFlow,
  RawFinancials,
  RawIncome,
} from "../lib/api/clients/financials.ts";

/* The three statements arrive as three independent lists, and the page draws
   one row per year across all of them. Everything that can go wrong lives in
   that join: a year filed late in one statement and on time in another, a
   margin divided by a revenue the feed never reported, a capital expenditure
   whose sign changes between rows.

   The fixtures below spell out only the line items each case is about, which
   is also how the gateway answers — a filing that does not carry a line simply
   omits the key. A fixture listing all thirty fields would be tidier and less
   faithful. */

function income(year: number, fields: Partial<RawIncome> = {}): RawIncome {
  return {
    cik: "0000320193",
    period_end: `${year}-12-31`,
    filing_date: `${year + 1}-02-01`,
    fiscal_quarter: 4,
    fiscal_year: year,
    timeframe: "annual",
    ...fields,
  } as RawIncome;
}

function balance(year: number, fields: Partial<RawBalance> = {}): RawBalance {
  return {
    cik: "0000320193",
    period_end: `${year}-12-31`,
    filing_date: `${year + 1}-02-01`,
    fiscal_quarter: 4,
    fiscal_year: year,
    timeframe: "annual",
    ...fields,
  } as RawBalance;
}

function cashFlow(year: number, fields: Partial<RawCashFlow> = {}): RawCashFlow {
  return {
    cik: "0000320193",
    period_end: `${year}-12-31`,
    filing_date: `${year + 1}-02-01`,
    fiscal_quarter: 4,
    fiscal_year: year,
    timeframe: "annual",
    ...fields,
  } as RawCashFlow;
}

const payload = (p: Partial<RawFinancials> = {}): RawFinancials => ({
  status: "OK",
  income_statements: [],
  balance_sheets: [],
  cash_flow_statements: [],
  ...p,
});

/* ------------------------------------------------------------------ */
/* The join                                                            */
/* ------------------------------------------------------------------ */

test("the three statements are joined by fiscal year, not by position", () => {
  /* Different lengths and different orders, which is what a company that
     restated one statement and not the others actually produces. */
  const years = toFinancialYears(
    payload({
      income_statements: [income(2025, { revenue: 300 }), income(2024, { revenue: 200 })],
      balance_sheets: [balance(2024, { total_assets: 20 })],
      cash_flow_statements: [
        cashFlow(2024, { net_cash_from_operating_activities: 2 }),
        cashFlow(2025, { net_cash_from_operating_activities: 3 }),
      ],
    }),
  );

  assert.deepEqual(
    years.map((y) => y.year),
    [2024, 2025],
  );
  assert.equal(years[0].revenue, 200);
  assert.equal(years[0].totalAssets, 20);
  assert.equal(years[0].cashFromOps, 2);
  assert.equal(years[1].revenue, 300);
  assert.equal(years[1].cashFromOps, 3);
  assert.equal(years[1].totalAssets, null, "2025 has no balance sheet and must not borrow 2024's");
});

test("a year present in one statement alone still produces a row", () => {
  const years = toFinancialYears(
    payload({ cash_flow_statements: [cashFlow(2021, { net_cash_from_operating_activities: 9 })] }),
  );

  assert.equal(years.length, 1);
  assert.equal(years[0].year, 2021);
  assert.equal(years[0].cashFromOps, 9);
  assert.equal(years[0].revenue, null);
  assert.equal(years[0].netIncome, null);
  assert.equal(years[0].totalEquity, null);
});

test("years come out oldest first, because every chart reads left to right", () => {
  const years = toFinancialYears(
    payload({
      income_statements: [2025, 2021, 2023, 2022, 2024].map((y) => income(y, { revenue: y })),
    }),
  );

  assert.deepEqual(
    years.map((y) => y.year),
    [2021, 2022, 2023, 2024, 2025],
  );
});

/* ------------------------------------------------------------------ */
/* Margins                                                             */
/* ------------------------------------------------------------------ */

test("margins are derived from the statement, never read off it", () => {
  const [y] = toFinancialYears(
    payload({
      income_statements: [
        income(2025, {
          revenue: 1_000,
          gross_profit: 400,
          operating_income: 250,
          net_income_loss_attributable_common_shareholders: 100,
        }),
      ],
    }),
  );

  assert.equal(y.grossMargin, 40);
  assert.equal(y.operatingMargin, 25);
  assert.equal(y.netMargin, 10);
});

test("a zero revenue yields no margin rather than an infinity", () => {
  const [y] = toFinancialYears(
    payload({
      income_statements: [
        income(2025, { revenue: 0, gross_profit: 400, operating_income: -50 }),
      ],
    }),
  );

  assert.equal(y.grossMargin, null);
  assert.equal(y.operatingMargin, null);
  assert.equal(y.netMargin, null);
});

test("a margin needs both sides, and an absent numerator is not a zero", () => {
  const [y] = toFinancialYears(
    payload({ income_statements: [income(2025, { revenue: 1_000 })] }),
  );

  assert.equal(y.revenue, 1_000);
  assert.equal(y.grossMargin, null);
  assert.equal(y.operatingMargin, null);
  assert.equal(y.netMargin, null);
});

test("a loss produces a negative margin rather than nothing", () => {
  const [y] = toFinancialYears(
    payload({
      income_statements: [
        income(2025, { revenue: 200, net_income_loss_attributable_common_shareholders: -50 }),
      ],
    }),
  );

  assert.equal(y.netIncome, -50);
  assert.equal(y.netMargin, -25);
});

test("earnings per share is the diluted figure where the filing carries one", () => {
  /* Diluted is the number the market quotes and the more conservative of the
     two; basic only stands in when diluted is absent. */
  const [both, basicOnly] = toFinancialYears(
    payload({
      income_statements: [
        income(2024, { basic_earnings_per_share: 7.49, diluted_earnings_per_share: 7.46 }),
        income(2025, { basic_earnings_per_share: 6.11 }),
      ],
    }),
  );

  assert.equal(both.eps, 7.46);
  assert.equal(basicOnly.eps, 6.11);
});

/* ------------------------------------------------------------------ */
/* Free cash flow                                                      */
/* ------------------------------------------------------------------ */

test("capital expenditure is subtracted whichever sign it arrives with", () => {
  const [negative, positive] = toFinancialYears(
    payload({
      cash_flow_statements: [
        cashFlow(2024, {
          net_cash_from_operating_activities: 1_000,
          purchase_of_property_plant_and_equipment: -200,
        }),
        cashFlow(2025, {
          net_cash_from_operating_activities: 1_000,
          capital_expenditure: 200,
        }),
      ],
    }),
  );

  assert.equal(negative.freeCashFlow, 800, "a negative outflow must not be added back");
  assert.equal(positive.freeCashFlow, 800);
  assert.equal(negative.capex, 200, "capex is reported as a magnitude, not a signed flow");
  assert.equal(positive.capex, 200);
});

test("free cash flow is absent when operating cash flow is", () => {
  const [y] = toFinancialYears(
    payload({
      cash_flow_statements: [
        cashFlow(2025, { purchase_of_property_plant_and_equipment: -200 }),
      ],
    }),
  );

  assert.equal(y.cashFromOps, null);
  assert.equal(y.capex, 200);
  assert.equal(y.freeCashFlow, null, "a bare capital expenditure is not a cash flow figure");
});

test("a company with no capital expenditure line has none to subtract", () => {
  const [y] = toFinancialYears(
    payload({
      cash_flow_statements: [cashFlow(2025, { net_cash_from_operating_activities: 640 })],
    }),
  );

  assert.equal(y.capex, null);
  assert.equal(y.freeCashFlow, 640);
});

/* ------------------------------------------------------------------ */
/* Degradation                                                         */
/* ------------------------------------------------------------------ */

test("an empty payload is an empty list rather than a throw", () => {
  assert.deepEqual(toFinancialYears(payload()), []);
});

test("a malformed payload is an empty list rather than a throw", () => {
  const missing = { status: "ERROR" } as unknown as RawFinancials;
  assert.deepEqual(toFinancialYears(missing), []);

  const nulled = payload({ income_statements: null as unknown as RawIncome[] });
  assert.deepEqual(toFinancialYears(nulled), []);
});

test("a row with no fiscal year is dropped, not filed under NaN", () => {
  const undated = { revenue: 500 } as unknown as RawIncome;
  const years = toFinancialYears(
    payload({ income_statements: [undated, income(2025, { revenue: 700 })] }),
  );

  assert.deepEqual(
    years.map((y) => y.year),
    [2025],
  );
});

test("a non-finite line item reads as absent rather than as a number", () => {
  const [y] = toFinancialYears(
    payload({
      income_statements: [
        income(2025, { revenue: Number.NaN, gross_profit: 400 }),
      ],
    }),
  );

  assert.equal(y.revenue, null);
  assert.equal(y.grossMargin, null);
});

/* ------------------------------------------------------------------ */
/* The revenue chart                                                   */
/* ------------------------------------------------------------------ */

test("the revenue series is stated in billions, oldest first", () => {
  const years = toFinancialYears(
    payload({
      income_statements: [
        income(2025, { revenue: 416_161_000_000 }),
        income(2024, { revenue: 391_035_000_000 }),
      ],
    }),
  );

  assert.deepEqual(revenueSeries(years), [391.035, 416.161]);
});

test("a year the feed has no revenue for is omitted, not drawn as zero", () => {
  /* A zero bar asserts that the company earned nothing that year, which is a
     claim the feed never made. */
  const years = toFinancialYears(
    payload({
      income_statements: [income(2024, { revenue: 200_000_000_000 }), income(2025)],
    }),
  );

  assert.deepEqual(revenueSeries(years), [200]);
  assert.deepEqual(revenueSeries([]), []);
});

/* ------------------------------------------------------------------ */
/* The rest of the statement                                           */
/* ------------------------------------------------------------------ */

/* The gateway sends thirty-odd line items per statement and the panel used to
   read fourteen of them. The rest were fetched, paid for and thrown away, so
   the tests below are mostly about carriage: the line arrives, it is named in
   the house's own camel case, and an omitted line is an absence rather than a
   nought. The two sign traps — dividends and the capital-lease debt line —
   are the only places where carrying the feed's own answer would be wrong. */

test("the income statement's research, interest, EBITDA and share count are carried across", () => {
  const [y] = toFinancialYears(
    payload({
      income_statements: [
        income(2025, {
          research_development: 31_370_000_000,
          interest_expense: 3_933_000_000,
          ebitda: 134_661_000_000,
          diluted_shares_outstanding: 15_408_095_000,
        }),
      ],
    }),
  );

  assert.equal(y.researchDevelopment, 31_370_000_000);
  assert.equal(y.interestExpense, 3_933_000_000);
  assert.equal(y.ebitda, 134_661_000_000);
  assert.equal(y.dilutedSharesOutstanding, 15_408_095_000);
});

test("the balance sheet's liquidity and debt lines are carried across", () => {
  const [y] = toFinancialYears(
    payload({
      balance_sheets: [
        balance(2025, {
          cash_and_equivalents: 30_000,
          short_term_investments: 35_000,
          total_current_assets: 152_000,
          total_current_liabilities: 176_000,
          debt_current: 20_000,
          long_term_debt: 85_000,
        }),
      ],
    }),
  );

  assert.equal(y.cashAndEquivalents, 30_000);
  assert.equal(y.shortTermInvestments, 35_000);
  assert.equal(y.totalCurrentAssets, 152_000);
  assert.equal(y.totalCurrentLiabilities, 176_000);
  assert.equal(y.debtCurrent, 20_000);
  assert.equal(y.longTermDebt, 85_000);
});

test("the cash flow statement's depreciation and dividend lines are carried across", () => {
  const [y] = toFinancialYears(
    payload({
      cash_flow_statements: [
        cashFlow(2025, {
          depreciation_depletion_and_amortization: 11_445_000_000,
          dividends: 15_234_000_000,
        }),
      ],
    }),
  );

  assert.equal(y.depreciationAmortization, 11_445_000_000);
  assert.equal(y.dividendsPaid, 15_234_000_000);
});

test("dividends are a magnitude whichever sign the financing section gives them", () => {
  /* The same trap capital expenditure already walked into: the feed writes a
     financing outflow as a signed negative on some rows and as a bare
     magnitude on others, and a payout ratio that flips sign between adjacent
     years is worse than no payout ratio at all. */
  const [outflow, magnitude] = toFinancialYears(
    payload({
      cash_flow_statements: [
        cashFlow(2024, { dividends: -15_234_000_000 }),
        cashFlow(2025, { dividends: 15_234_000_000 }),
      ],
    }),
  );

  assert.equal(outflow.dividendsPaid, 15_234_000_000);
  assert.equal(magnitude.dividendsPaid, 15_234_000_000);
});

test("the capital-lease line is not a stand-in for long-term debt", () => {
  /* long_term_debt_and_capital_lease_obligations is a different quantity, and
     a column that silently swaps one definition for the other on the years
     where the plain line is missing is not a series anyone can read. */
  const [y] = toFinancialYears(
    payload({
      balance_sheets: [
        balance(2025, { long_term_debt_and_capital_lease_obligations: 98_000 }),
      ],
    }),
  );

  assert.equal(y.longTermDebt, null);
});

test("a statement line the filing omits is null on every one of the new fields", () => {
  const [y] = toFinancialYears(
    payload({
      income_statements: [income(2025)],
      balance_sheets: [balance(2025)],
      cash_flow_statements: [cashFlow(2025)],
    }),
  );

  for (const key of [
    "researchDevelopment",
    "interestExpense",
    "ebitda",
    "dilutedSharesOutstanding",
    "cashAndEquivalents",
    "shortTermInvestments",
    "totalCurrentAssets",
    "totalCurrentLiabilities",
    "debtCurrent",
    "longTermDebt",
    "depreciationAmortization",
    "dividendsPaid",
  ] as const) {
    assert.equal(y[key], null, `${key} should be null, not nought`);
  }
});

/* ------------------------------------------------------------------ */
/* The balance-sheet derivations                                       */
/* ------------------------------------------------------------------ */

test("net cash nets the whole balance sheet, not just the cash line", () => {
  const [y] = toFinancialYears(
    payload({
      balance_sheets: [
        balance(2025, {
          cash_and_equivalents: 30_000,
          short_term_investments: 35_000,
          debt_current: 20_000,
          long_term_debt: 85_000,
        }),
      ],
    }),
  );

  assert.equal(y.netCash, -40_000, "a company owing more than it holds is in net debt");
});

test("a debt-free balance sheet reports its whole hoard as net cash", () => {
  const [y] = toFinancialYears(
    payload({
      balance_sheets: [
        balance(2025, {
          cash_and_equivalents: 30_000,
          short_term_investments: 35_000,
          debt_current: 0,
          long_term_debt: 0,
        }),
      ],
    }),
  );

  assert.equal(y.netCash, 65_000, "a reported nought debt is a reading, and it nets to nothing");
});

test("net cash needs all four readings, and an omitted debt line is not a nought", () => {
  /* This is the one place the free-cash-flow precedent below deliberately does
     not apply. An absent capital expenditure line is an absent activity on a
     statement that itemises activities, and there is genuinely nothing to
     subtract. An absent debt line on a balance sheet is an absent reading, and
     treating it as nought publishes a debt-free company the filing never
     claimed — the exact figure a reader would act on. */
  const missing = toFinancialYears(
    payload({
      balance_sheets: [
        balance(2024, { short_term_investments: 35_000, debt_current: 1, long_term_debt: 1 }),
        balance(2025, { cash_and_equivalents: 30_000, debt_current: 1, long_term_debt: 1 }),
        balance(2026, { cash_and_equivalents: 30_000, short_term_investments: 35_000, long_term_debt: 1 }),
        balance(2027, { cash_and_equivalents: 30_000, short_term_investments: 35_000, debt_current: 1 }),
      ],
    }),
  );

  for (const y of missing) {
    assert.equal(y.netCash, null, `${y.year} is missing a reading and must not report net cash`);
  }
});

test("the current ratio divides current assets by current liabilities", () => {
  const [y] = toFinancialYears(
    payload({
      balance_sheets: [
        balance(2025, { total_current_assets: 152_987, total_current_liabilities: 76_493.5 }),
      ],
    }),
  );

  assert.equal(y.currentRatio, 2);
});

test("no current liabilities, no current ratio", () => {
  /* Dividing by a nought that means "the feed did not say" gives an infinity,
     and an infinite liquidity ratio renders as a company that can pay
     everything forever. */
  const [zero, negative, absent] = toFinancialYears(
    payload({
      balance_sheets: [
        balance(2024, { total_current_assets: 152_987, total_current_liabilities: 0 }),
        balance(2025, { total_current_assets: 152_987, total_current_liabilities: -10 }),
        balance(2026, { total_current_assets: 152_987 }),
      ],
    }),
  );

  assert.equal(zero.currentRatio, null);
  assert.equal(negative.currentRatio, null);
  assert.equal(absent.currentRatio, null);
});

test("book value per share divides equity by the diluted share count", () => {
  const [y] = toFinancialYears(
    payload({
      income_statements: [income(2025, { diluted_shares_outstanding: 15_000 })],
      balance_sheets: [balance(2025, { total_equity: 60_000 })],
    }),
  );

  assert.equal(y.bookValuePerShare, 4);
});

test("negative equity is a real reading and keeps its sign per share", () => {
  const [y] = toFinancialYears(
    payload({
      income_statements: [income(2025, { diluted_shares_outstanding: 15_000 })],
      balance_sheets: [balance(2025, { total_equity: -30_000 })],
    }),
  );

  assert.equal(y.bookValuePerShare, -2, "a balance sheet in deficit is a fact, not a gap");
});

test("no share count, no book value per share", () => {
  const [zero, absent] = toFinancialYears(
    payload({
      income_statements: [
        income(2024, { diluted_shares_outstanding: 0 }),
        income(2025),
      ],
      balance_sheets: [balance(2024, { total_equity: 60_000 }), balance(2025, { total_equity: 60_000 })],
    }),
  );

  assert.equal(zero.bookValuePerShare, null, "a company with no shares is a feed with no answer");
  assert.equal(absent.bookValuePerShare, null);
});

test("interest coverage divides operating income by the interest bill", () => {
  const [y] = toFinancialYears(
    payload({
      income_statements: [income(2025, { operating_income: 40_000, interest_expense: 5_000 })],
    }),
  );

  assert.equal(y.interestCoverage, 8);
});

test("an operating loss covers nothing and says so with a sign", () => {
  const [y] = toFinancialYears(
    payload({
      income_statements: [income(2025, { operating_income: -10_000, interest_expense: 5_000 })],
    }),
  );

  assert.equal(y.interestCoverage, -2);
});

test("no interest bill, no coverage ratio", () => {
  /* A nought interest expense is a debt-free year or a feed that did not
     answer, and neither is a coverage of infinity. A signed-negative expense
     would give a company earning well a coverage of -8x, which reads as
     distress; refusing it is the honest answer, because nothing in the payload
     distinguishes an outflow convention from an interest credit. */
  const [zero, signed, absent] = toFinancialYears(
    payload({
      income_statements: [
        income(2024, { operating_income: 40_000, interest_expense: 0 }),
        income(2025, { operating_income: 40_000, interest_expense: -5_000 }),
        income(2026, { operating_income: 40_000 }),
      ],
    }),
  );

  assert.equal(zero.interestCoverage, null);
  assert.equal(signed.interestCoverage, null);
  assert.equal(absent.interestCoverage, null);
});

test("the derived balance-sheet fields are null on a year with no balance sheet", () => {
  const [y] = toFinancialYears(
    payload({ income_statements: [income(2025, { revenue: 1_000 })] }),
  );

  assert.equal(y.netCash, null);
  assert.equal(y.currentRatio, null);
  assert.equal(y.bookValuePerShare, null);
  assert.equal(y.interestCoverage, null);
});

/* ------------------------------------------------------------------ */
/* The percent derivations                                             */
/* ------------------------------------------------------------------ */

test("R&D intensity, payout ratio and FCF margin all leave as percents", () => {
  /* Three figures a reader compares against a peer's without checking the
     unit, so a fraction escaping here would be read as a percent and be wrong
     by a hundred in the direction that flatters. */
  const [y] = toFinancialYears(
    payload({
      income_statements: [
        income(2025, {
          revenue: 100_000,
          research_development: 8_000,
          net_income_loss_attributable_common_shareholders: 20_000,
        }),
      ],
      cash_flow_statements: [
        cashFlow(2025, {
          net_cash_from_operating_activities: 30_000,
          capital_expenditure: -5_000,
          dividends: -5_000,
        }),
      ],
    }),
  );

  assert.equal(y.rdIntensity, 8);
  assert.equal(y.payoutRatio, 25, "five thousand paid out of twenty thousand earned");
  assert.equal(y.fcfMargin, 25, "twenty-five thousand of free cash on a hundred of revenue");
});

test("a company that pays out of a loss has no payout ratio", () => {
  /* Dividends of five against a loss of twenty is -25%, which renders as a
     company returning a quarter of its earnings to shareholders. It is in fact
     a company funding a dividend out of the balance sheet, and the honest
     column says nothing rather than saying the opposite. */
  const [loss, breakeven] = toFinancialYears(
    payload({
      income_statements: [
        income(2024, { net_income_loss_attributable_common_shareholders: -20_000 }),
        income(2025, { net_income_loss_attributable_common_shareholders: 0 }),
      ],
      cash_flow_statements: [cashFlow(2024, { dividends: -5_000 }), cashFlow(2025, { dividends: -5_000 })],
    }),
  );

  assert.equal(loss.payoutRatio, null);
  assert.equal(breakeven.payoutRatio, null);
});

test("a cash-burning year keeps its negative FCF margin", () => {
  const [y] = toFinancialYears(
    payload({
      income_statements: [income(2025, { revenue: 100_000 })],
      cash_flow_statements: [
        cashFlow(2025, { net_cash_from_operating_activities: -5_000, capital_expenditure: 5_000 }),
      ],
    }),
  );

  assert.equal(y.fcfMargin, -10);
});

test("the percent derivations need a numerator, and an absent one is not a nought", () => {
  const [y] = toFinancialYears(
    payload({ income_statements: [income(2025, { revenue: 100_000 })] }),
  );

  assert.equal(y.rdIntensity, null, "a filing with no R&D line did not report spending nothing");
  assert.equal(y.payoutRatio, null);
  assert.equal(y.fcfMargin, null, "no operating cash flow is no free cash flow, and no margin");
});

test("a zero revenue yields no intensity and no FCF margin", () => {
  const [y] = toFinancialYears(
    payload({
      income_statements: [income(2025, { revenue: 0, research_development: 8_000 })],
      cash_flow_statements: [cashFlow(2025, { net_cash_from_operating_activities: 30_000 })],
    }),
  );

  assert.equal(y.rdIntensity, null);
  assert.equal(y.fcfMargin, null);
});

test("a negative revenue is not a denominator either", () => {
  /* A revenue of -100 against a gross profit of -40 divides out to a tidy 40%,
     which is the sort of number that survives a review because it looks
     ordinary. Nothing here was measured. */
  const [y] = toFinancialYears(
    payload({
      income_statements: [
        income(2025, { revenue: -100_000, gross_profit: -40_000, research_development: 8_000 }),
      ],
    }),
  );

  assert.equal(y.grossMargin, null);
  assert.equal(y.rdIntensity, null);
});

test("a division that overflows is nothing, not an infinity", () => {
  /* Both sides finite, the quotient not. Infinity formats as a number and
     would print as a research budget of Infinity percent of revenue. */
  const [y] = toFinancialYears(
    payload({
      income_statements: [
        income(2025, { revenue: 1e-10, research_development: 1e308, operating_income: 1e308 }),
        income(2024, { interest_expense: 1e-320, operating_income: 1e308 }),
      ],
    }),
  );

  assert.equal(y.rdIntensity, null);
  const [older] = toFinancialYears(
    payload({ income_statements: [income(2024, { interest_expense: 1e-320, operating_income: 1e308 })] }),
  );
  assert.equal(older.interestCoverage, null);
});
