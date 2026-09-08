import assert from "node:assert/strict";
import test from "node:test";

import {
  balanceLedger,
  cashFlowLedger,
  dividendRecord,
  growth,
  headline,
  incomeLedger,
  marginLedger,
  valuation,
} from "../lib/market/derive-fundamentals.ts";
import type { FinancialYear } from "../lib/api/normalize/financials.ts";
import type { CompanyProfile } from "../lib/api/normalize/profile.ts";
import type { InstrumentSnapshot } from "../lib/market/instrument.ts";

/* The fundamentals surface.

   Every figure on it is a quotient or a rate struck over lines a filing may
   simply not carry, and the live feed proves that is not a hypothetical: the
   long-term debt line comes back null for every year of every company this
   account can see, and the interest expense arrives signed as an outflow. A
   module that treats an absent line as nought publishes a debt-free Apple and
   a company whose earnings cover an interest bill of zero infinitely well.

   So the cases below are mostly absences and bad denominators. The happy path
   is worth one assertion each; the rest of the file is about what the page
   must refuse to say. */

const NOTHING: FinancialYear = {
  year: 0,
  revenue: null,
  grossProfit: null,
  operatingIncome: null,
  netIncome: null,
  eps: null,
  researchDevelopment: null,
  interestExpense: null,
  ebitda: null,
  dilutedSharesOutstanding: null,
  grossMargin: null,
  operatingMargin: null,
  netMargin: null,
  totalAssets: null,
  totalLiabilities: null,
  totalEquity: null,
  cashAndEquivalents: null,
  shortTermInvestments: null,
  totalCurrentAssets: null,
  totalCurrentLiabilities: null,
  debtCurrent: null,
  longTermDebt: null,
  cashFromOps: null,
  capex: null,
  freeCashFlow: null,
  depreciationAmortization: null,
  dividendsPaid: null,
  netCash: null,
  currentRatio: null,
  interestCoverage: null,
  bookValuePerShare: null,
  rdIntensity: null,
  payoutRatio: null,
  fcfMargin: null,
};

/** A fiscal year carrying only the lines a case is about, as the feed does. */
const year = (y: number, fields: Partial<FinancialYear> = {}): FinancialYear => ({
  ...NOTHING,
  year: y,
  ...fields,
});

function snapshot(over: {
  annual?: FinancialYear[];
  profile?: Partial<CompanyProfile>;
  dividends?: InstrumentSnapshot["dividends"];
} = {}): InstrumentSnapshot {
  return {
    profile: {
      id: "TEST",
      marketCap: null,
      enterpriseValue: null,
      evToEbitda: null,
      returnOnAssets: null,
      returnOnEquity: null,
      dividendYield: null,
      ...over.profile,
    },
    financials: { annual: over.annual ?? [], note: null },
    dividends: over.dividends ?? [],
  } as unknown as InstrumentSnapshot;
}

/** The cell of `ledger` under fiscal year `y`, on the row keyed `key`. */
function cell(
  ledger: { years: number[]; rows: Array<{ key: string; cells: Array<{ value: string }> }> },
  key: string,
  y: number,
): string {
  const row = ledger.rows.find((r) => r.key === key);
  assert.ok(row, `no ledger row keyed ${key}`);
  const at = ledger.years.indexOf(y);
  assert.ok(at >= 0, `no column for fiscal year ${y}`);
  return row.cells[at].value;
}

const rowOf = <T extends { key: string }>(rows: T[], key: string): T => {
  const found = rows.find((r) => r.key === key);
  assert.ok(found, `no row keyed ${key}`);
  return found;
};

/* ------------------------------------------------------------------ */
/* Growth                                                              */
/* ------------------------------------------------------------------ */

test("revenue growth reports the last step and the rate across the whole span", () => {
  const rows = growth(
    snapshot({
      annual: [
        year(2021, { revenue: 100 }),
        year(2022, { revenue: 120 }),
        year(2023, { revenue: 140 }),
        year(2024, { revenue: 160 }),
        year(2025, { revenue: 200 }),
      ],
    }),
  );

  const revenue = rowOf(rows, "revenue");
  // 200 over 160 is a quarter; 100 to 200 over four years is 18.92% a year.
  assert.equal(revenue.yoy, "+25.0%");
  assert.equal(revenue.cagr, "+18.9%");
  assert.equal(revenue.span, "2021–2025");
});

/* A year the feed did not answer for is skipped from a trend rather than
   zero-filled, which is right — and it means the two newest years carrying
   revenue can sit two years apart. Dividing them and calling it a year over
   year is a rate over the wrong window, stated with total confidence. */
test("a gap in the series does not become a year-over-year across two years", () => {
  const rows = growth(
    snapshot({
      annual: [
        year(2021, { revenue: 100 }),
        year(2022, { revenue: 120 }),
        year(2023),
        year(2024, { revenue: 200 }),
      ],
    }),
  );

  const revenue = rowOf(rows, "revenue");
  assert.equal(revenue.yoy, "—", "2024 against 2022 is not a year-over-year");
  // The span rate is still honest: it names the two years it measured.
  assert.equal(revenue.cagr, "+26.0%");
  assert.equal(revenue.span, "2021–2024");
});

test("growth out of a loss is a dash, not a percentage", () => {
  const rows = growth(
    snapshot({ annual: [year(2024, { eps: -2 }), year(2025, { eps: 1 })] }),
  );

  const eps = rowOf(rows, "eps");
  assert.equal(eps.yoy, "—", "a swing from −2 to 1 has no percentage to report");
  assert.equal(eps.cagr, "—");
});

/* Math.pow of a negative base to a fractional power is NaN, and a NaN that
   reaches toFixed prints "NaN%" on an investment page. */
test("a compound rate into a loss is a dash rather than NaN", () => {
  const rows = growth(
    snapshot({
      annual: [
        year(2021, { freeCashFlow: 100 }),
        year(2025, { freeCashFlow: -50 }),
      ],
    }),
  );

  assert.equal(rowOf(rows, "fcf").cagr, "—");
});

test("growth off a base of nought is a dash, not an infinity", () => {
  const rows = growth(
    snapshot({ annual: [year(2024, { revenue: 0 }), year(2025, { revenue: 100 })] }),
  );

  const revenue = rowOf(rows, "revenue");
  assert.equal(revenue.yoy, "—");
  assert.equal(revenue.cagr, "—");
});

test("a single filed year has a figure but no growth to report", () => {
  const rows = growth(snapshot({ annual: [year(2025, { revenue: 4.16161e11 })] }));

  const revenue = rowOf(rows, "revenue");
  assert.equal(revenue.latest, "$416.16B");
  assert.equal(revenue.yoy, "—");
  assert.equal(revenue.cagr, "—");
  assert.equal(revenue.span, null);
});

/* ------------------------------------------------------------------ */
/* Margins                                                             */
/* ------------------------------------------------------------------ */

/* financials.ts strikes every ...Margin as a PERCENT already. A ×100 here
   would put Apple's gross margin at 4,620%. */
test("margins are already percents and are not scaled again", () => {
  const ledger = marginLedger(
    snapshot({
      annual: [year(2025, { grossMargin: 46.2, operatingMargin: 31.5, netMargin: 23.97 })],
    }),
  );

  assert.equal(cell(ledger, "gross", 2025), "46.2%");
  assert.equal(cell(ledger, "operating", 2025), "31.5%");
  assert.equal(cell(ledger, "net", 2025), "24.0%");
});

test("a year with no margin draws no bar and shows a dash", () => {
  const ledger = marginLedger(
    snapshot({ annual: [year(2024), year(2025, { grossMargin: 46.2 })] }),
  );

  assert.equal(cell(ledger, "gross", 2024), "—");
  const gross = rowOf(ledger.rows, "gross");
  assert.equal(gross.cells[0].width, null, "a missing margin must not draw a zero-width bar");
  assert.equal(gross.cells[1].width, "46.2%");
});

test("a loss-making year keeps its sign and takes the falling tone", () => {
  const ledger = marginLedger(snapshot({ annual: [year(2025, { netMargin: -12.4 })] }));

  assert.equal(cell(ledger, "net", 2025), "−12.4%");
  const net = rowOf(ledger.rows, "net");
  assert.notEqual(net.cells[0].color, null);
  assert.notEqual(
    net.cells[0].color,
    marginLedger(snapshot({ annual: [year(2025, { netMargin: 12.4 })] })).rows.find(
      (r) => r.key === "net",
    )?.cells[0].color,
    "a negative margin must not wear the same colour as a positive one",
  );
});

/* ------------------------------------------------------------------ */
/* Cash flow                                                           */
/* ------------------------------------------------------------------ */

test("capital spend reads as a magnitude and free cash flow keeps its sign", () => {
  const ledger = cashFlowLedger(
    snapshot({
      annual: [
        year(2025, { cashFromOps: 1.11482e11, capex: 1.2715e10, freeCashFlow: -9.8767e10 }),
      ],
    }),
  );

  assert.equal(cell(ledger, "cfo", 2025), "$111.48B");
  /* $12.71B rather than $12.72B: 12.715 is not representable in binary and
     lands a hair below the half, which is toFixed doing exactly what the
     language specifies. A hundredth of a billion, pinned here so nobody
     later "fixes" the rounding and changes every figure on the page. */
  assert.equal(cell(ledger, "capex", 2025), "$12.71B");
  assert.equal(cell(ledger, "fcf", 2025), "−$98.77B");
});

/* Cash conversion against a loss is the payout-ratio trap again: 50 of cash
   over 100 of losses is −50%, which reads as a company converting nothing
   when it is in fact a company converting a loss into cash. */
test("cash conversion is refused against a loss", () => {
  const ledger = cashFlowLedger(
    snapshot({ annual: [year(2025, { freeCashFlow: 50, netIncome: -100 })] }),
  );

  assert.equal(cell(ledger, "conversion", 2025), "—");
});

/* ------------------------------------------------------------------ */
/* Balance sheet                                                       */
/* ------------------------------------------------------------------ */

/* The live feed carries no long-term debt line for any year of any company
   this account can see. Defaulting it to nought would publish a debt-free
   balance sheet on the strength of a line the filing never showed us. */
test("net cash is a dash where a borrowing line is missing, never a zero", () => {
  const ledger = balanceLedger(
    snapshot({
      annual: [
        year(2025, {
          cashAndEquivalents: 35.934e9,
          shortTermInvestments: 18.763e9,
          debtCurrent: 20.329e9,
          longTermDebt: null,
          netCash: null,
        }),
      ],
    }),
  );

  assert.equal(cell(ledger, "netCash", 2025), "—");
  // What the filing did answer is still shown.
  assert.equal(cell(ledger, "liquid", 2025), "$54.70B");
});

test("a missing long-term debt line does not produce a flattering debt-to-equity", () => {
  const ledger = balanceLedger(
    snapshot({
      annual: [year(2025, { debtCurrent: 20e9, longTermDebt: null, totalEquity: 73.733e9 })],
    }),
  );

  assert.equal(
    cell(ledger, "debtToEquity", 2025),
    "—",
    "0.27× off the current portion alone understates a leveraged company",
  );
});

test("both borrowing lines present give a debt-to-equity multiple", () => {
  const ledger = balanceLedger(
    snapshot({
      annual: [year(2025, { debtCurrent: 20e9, longTermDebt: 80e9, totalEquity: 50e9 })],
    }),
  );

  assert.equal(cell(ledger, "debtToEquity", 2025), "2.00×");
});

/* Every interest expense the feed has returned is signed as an outflow, so
   the coverage struck straight off it is refused on every row and the column
   is dead. The bill is its magnitude. */
test("interest coverage reads the magnitude of a negatively signed interest bill", () => {
  const ledger = balanceLedger(
    snapshot({ annual: [year(2025, { operatingIncome: 108.949e9, interestExpense: -2.645e9 })] }),
  );

  assert.equal(cell(ledger, "interestCoverage", 2025), "41.19×");
});

test("interest coverage against a bill of nought is a dash, not an infinity", () => {
  const ledger = balanceLedger(
    snapshot({ annual: [year(2025, { operatingIncome: 100e9, interestExpense: 0 })] }),
  );

  assert.equal(cell(ledger, "interestCoverage", 2025), "—");
});

test("a balance sheet in deficit divides into nothing", () => {
  const ledger = balanceLedger(
    snapshot({
      annual: [
        year(2025, {
          totalEquity: -5e9,
          totalLiabilities: 40e9,
          debtCurrent: 10e9,
          longTermDebt: 20e9,
        }),
      ],
    }),
  );

  assert.equal(cell(ledger, "debtToEquity", 2025), "—");
  assert.equal(cell(ledger, "liabilitiesToEquity", 2025), "—");
  // The deficit itself is a fact the column states.
  assert.equal(cell(ledger, "equity", 2025), "−$5.00B");
});

/* ------------------------------------------------------------------ */
/* Valuation                                                           */
/* ------------------------------------------------------------------ */

/* profile.marketCap has already been converted to dollars — the quotes feed's
   millions are multiplied once, in profile.ts. Doing it again here divides
   the yield by a million and reports 0.00% on a company yielding 5%. */
test("free cash flow yield divides dollars by dollars", () => {
  const rows = valuation(
    snapshot({
      annual: [year(2025, { freeCashFlow: 5e10 })],
      profile: { marketCap: 1e12 },
    }),
  );

  assert.equal(rowOf(rows, "fcfYield").value, "5.00%");
  assert.equal(rowOf(rows, "priceToFcf").value, "20.00×");
});

test("a year that burned cash reports a negative yield rather than a gap", () => {
  const rows = valuation(
    snapshot({ annual: [year(2025, { freeCashFlow: -2e10 })], profile: { marketCap: 1e12 } }),
  );

  assert.equal(rowOf(rows, "fcfYield").value, "−2.00%");
  assert.equal(rowOf(rows, "priceToFcf").value, "—", "a multiple of a cash burn says nothing");
});

test("no market capitalisation means no yield", () => {
  const rows = valuation(
    snapshot({ annual: [year(2025, { freeCashFlow: 5e10 })], profile: { marketCap: null } }),
  );

  assert.equal(rowOf(rows, "fcfYield").value, "—");
});

/* profile.ts hands enterprise value on in whatever unit the record used,
   documenting that nothing in the payload says which. A figure a million
   times too small still renders as a tidy number. */
test("an enterprise value that cannot be reconciled with market cap is refused", () => {
  const millions = valuation(
    snapshot({ profile: { marketCap: 1e12, enterpriseValue: 1.05e6 } }),
  );
  assert.equal(rowOf(millions, "enterpriseValue").value, "—");

  const dollars = valuation(
    snapshot({ profile: { marketCap: 1e12, enterpriseValue: 1.05e12 } }),
  );
  assert.equal(rowOf(dollars, "enterpriseValue").value, "$1.05T");
});

test("return on assets is struck from the filings, not from the record's unconverted ratio", () => {
  const rows = valuation(
    snapshot({
      annual: [year(2025, { netIncome: 10, totalAssets: 100 })],
      profile: { returnOnAssets: 0.9 },
    }),
  );

  assert.equal(rowOf(rows, "returnOnAssets").value, "10.0%");
});

/* ------------------------------------------------------------------ */
/* Dividends                                                           */
/* ------------------------------------------------------------------ */

const QUARTERLY = [
  { exDate: "2026-08-10", amount: 0.27, payDate: "2026-08-13" },
  { exDate: "2026-05-11", amount: 0.27, payDate: "2026-05-14" },
  { exDate: "2026-02-09", amount: 0.26, payDate: "2026-02-12" },
  { exDate: "2025-11-10", amount: 0.26, payDate: "2025-11-13" },
  { exDate: "2025-08-11", amount: 0.26, payDate: "2025-08-14" },
  { exDate: "2025-05-12", amount: 0.26, payDate: "2025-05-15" },
];

/* Ex-dates drift earlier each year, so a plain 365-day window catches five
   quarterly payments and reports an annual rate a quarter too high — on the
   figure a buyer holds the stock for. */
test("the annual rate sums one cadence of payments, not a 365-day window", () => {
  const record = dividendRecord(snapshot({ dividends: QUARTERLY }));

  assert.equal(record.cadence, "Quarterly");
  assert.equal(rowOf(record.figures, "annual").value, "$1.06");
});

test("per-share growth compares against the payment a year earlier", () => {
  const record = dividendRecord(snapshot({ dividends: QUARTERLY }));

  // 0.27 against the 0.26 of 2025-08-11, which is 364 days back.
  assert.equal(rowOf(record.figures, "growth").value, "+3.8%");
});

test("payments are read newest-first whatever order the feed sent them", () => {
  const record = dividendRecord(snapshot({ dividends: [...QUARTERLY].reverse() }));

  assert.equal(record.payments[0].exDate, "2026-08-10");
  assert.equal(rowOf(record.figures, "annual").value, "$1.06");
});

test("a record too short to reach back a year reports no growth", () => {
  const record = dividendRecord(
    snapshot({
      dividends: [
        { exDate: "2026-08-10", amount: 0.27, payDate: null },
        { exDate: "2026-05-11", amount: 0.26, payDate: null },
      ],
    }),
  );

  assert.equal(rowOf(record.figures, "growth").value, "—");
  assert.equal(rowOf(record.figures, "annual").value, "—", "two payments are not a year");
});

test("a company that has never paid has an empty record rather than a row of noughts", () => {
  const record = dividendRecord(snapshot({ dividends: [] }));

  assert.equal(record.payments.length, 0);
  assert.equal(record.figures.length, 0);
  assert.equal(record.cadence, null);
});

test("the payout ratio is carried through as the percent the filing struck", () => {
  const record = dividendRecord(
    snapshot({
      annual: [year(2025, { payoutRatio: 13.77 })],
      dividends: QUARTERLY,
      profile: { dividendYield: 0.41 },
    }),
  );

  assert.equal(rowOf(record.figures, "payout").value, "13.8%");
  assert.equal(rowOf(record.figures, "yield").value, "0.41%");
});

/* ------------------------------------------------------------------ */
/* Headline and the income ledger                                      */
/* ------------------------------------------------------------------ */

/* A margin moving from 31.5% to 32.0% has risen half a POINT, not half a
   percent — and certainly not the 1.5% a percentage change would print. */
test("a margin's move is stated in points, not percent", () => {
  const figures = headline(
    snapshot({
      annual: [
        year(2024, { revenue: 100, operatingMargin: 31.5 }),
        year(2025, { revenue: 106, operatingMargin: 32.0 }),
      ],
    }),
  );

  const margin = rowOf(figures, "operatingMargin");
  assert.equal(margin.value, "32.0%");
  assert.equal(margin.note, "FY2025 · +0.5 pts");

  assert.equal(rowOf(figures, "revenue").note, "FY2025 · +6.0%");
});

test("a headline figure with nothing behind it is a dash with no invented note", () => {
  const figures = headline(snapshot({ annual: [year(2025)] }));

  const revenue = rowOf(figures, "revenue");
  assert.equal(revenue.value, "—");
  assert.equal(revenue.note, "FY2025");
});

test("the income ledger reports per-share earnings in dollars and the rest in scale", () => {
  const ledger = incomeLedger(
    snapshot({ annual: [year(2025, { revenue: 4.16161e11, eps: 7.46, netIncome: 1.1201e11 })] }),
  );

  assert.equal(cell(ledger, "revenue", 2025), "$416.16B");
  assert.equal(cell(ledger, "netIncome", 2025), "$112.01B");
  assert.equal(cell(ledger, "eps", 2025), "$7.46");
  assert.equal(cell(ledger, "grossProfit", 2025), "—");
});

test("a company with no filings yields empty ledgers rather than a row of dashes", () => {
  const empty = snapshot({ annual: [] });

  assert.deepEqual(incomeLedger(empty).years, []);
  assert.deepEqual(marginLedger(empty).rows, []);
  assert.deepEqual(growth(empty), []);
  assert.deepEqual(headline(empty), []);
});
