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
