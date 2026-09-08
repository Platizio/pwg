/* Explicit .ts extensions, matching lib/api/ and instrument-derive.ts:
   Turbopack resolves without them but node --test does not, and a module here
   that cannot be imported outside the bundler is a module that cannot be
   tested. Everything in this file is arithmetic over numbers a filing may not
   have carried, which is precisely the code that has to be. */
import { C } from "../tokens.ts";
import { usd } from "./format.ts";
import type { FinancialYear } from "../api/normalize/financials.ts";
import type { InstrumentSnapshot } from "./instrument.ts";

/* The fundamentals surface: five filed years, read the way a buyer reads them.
 *
 * The panel this feeds used to show twelve trailing scalars and a revenue bar
 * chart with no growth rate on it — a reader could see that revenue was
 * $416B and not whether that was a good year. Everything here is about the
 * shape of the record rather than its last value: margins across the span,
 * the rate the top and bottom lines have compounded at, what the cash
 * statement did with the earnings, what the balance sheet looks like
 * underneath, and what the company has actually paid out.
 *
 * Two rules govern the whole file, and they are the same two that govern
 * lib/api/normalize/financials.ts, restated here because this module divides
 * far more often than that one does.
 *
 * FIRST — a missing input is nothing, and nothing is written as a dash. Never
 * nought, never a percent of nought, never an infinity that formats as a
 * plausible number. Every quotient below refuses a denominator that is absent
 * or not strictly positive, and every one re-checks that what came out is
 * finite: two finite operands can still overflow, and only the result can be
 * asked. The live feed makes this concrete rather than theoretical — it
 * carries no `longTermDebt` line for any year of any company this account can
 * see, so a module that read an absent borrowing as nought would publish a
 * debt-free Apple on the single figure a buyer is most likely to act on.
 *
 * SECOND — units are read, never guessed. The fields arriving here are in
 * four different registers and nothing about their names says which:
 *
 *   · statement lines (revenue, netIncome, cashFromOps, …) are in the
 *     filing's own reporting currency, whole units;
 *   · profile.marketCap is DOLLARS — the quotes feed reports millions and
 *     profile.ts has already multiplied, exactly once. Doing it again here
 *     would divide every yield on the page by a million;
 *   · every ...Margin, rdIntensity, payoutRatio and fcfMargin on a
 *     FinancialYear is already a PERCENT — a second ×100 puts a gross margin
 *     at 4,620%;
 *   · currentRatio, interestCoverage and evToEbitda are MULTIPLES.
 *
 * Where a field's unit is genuinely undocumented — profile.returnOnAssets and
 * profile.enterpriseValue are both handed on unconverted by profile.ts, which
 * says so at the point of mapping — this module either derives the figure
 * from inputs whose units are stated, or refuses to print it. Those two cases
 * carry their reasoning at the call.
 */

const DASH = "—";
/* U+2212, the true minus, as `pct` in ./format.ts uses. A hyphen next to a
   proportional figure reads as a dash in the wrong place. */
const MINUS = "−";
/** U+2013, for a span of years. */
const EN_DASH = "–";

export type Figure = { key: string; label: string; value: string; note: string | null };
export type LedgerCell = {
  value: string;
  /** Meter width, or null where there is nothing to draw. */
  width: string | null;
  color: string | null;
};
export type LedgerRow = { key: string; label: string; cells: LedgerCell[] };
/** Metric rows against fiscal-year columns — the five-year summary's shape. */
export type Ledger = { years: number[]; rows: LedgerRow[] };
export type GrowthRow = {
  key: string;
  label: string;
  latest: string;
  yoy: string;
  yoyColor: string;
  yoyWidth: string;
  cagr: string;
  cagrColor: string;
  /** The two fiscal years the compound rate was actually measured between. */
  span: string | null;
};
export type RatioRow = { key: string; label: string; value: string };
export type DividendPayment = { exDate: string; payDate: string | null; amount: string };
export type DividendRecord = {
  payments: DividendPayment[];
  figures: Figure[];
  /** "Quarterly", "Annual", … as the record's own spacing implies. */
  cadence: string | null;
};

/* ------------------------------------------------------------------ */
/* Guards                                                              */
/* ------------------------------------------------------------------ */

const finite = (n: number | null | undefined): number | null =>
  typeof n === "number" && Number.isFinite(n) ? n : null;

/* One division, one guard, as in financials.ts.

   The denominator must be present and strictly positive. Nought is how both
   the filing and the feed spell "no answer"; dividing by it gives an infinity
   that formats as a number, and an infinite interest coverage renders as a
   company that can service its debt forever. A negative denominator is worse
   than useless: free cash flow of 50 against a net loss of 100 gives a tidy
   −50% "cash conversion", which reads as a company converting nothing when it
   is in fact converting a loss into cash.

   The numerator keeps its sign throughout. A negative margin, a negative net
   cash position and a cash burn are all real readings, and nulling them would
   hide exactly the years that most deserve to be seen. */
function quotient(part: number | null, whole: number | null): number | null {
  if (part === null || whole === null || whole <= 0) return null;
  const out = part / whole;
  return Number.isFinite(out) ? out : null;
}

/** The same division as a PERCENT. */
function percentOf(part: number | null, whole: number | null): number | null {
  const out = quotient(part, whole);
  return out === null ? null : finite(out * 100);
}

/* Percentage change, refused off a base that is not strictly positive.

   Earnings per share moving from −2 to +1 is the case this exists for. The
   arithmetic answers −150%, which is both the wrong sign and the wrong
   magnitude for what happened — the company went from losing money to making
   it. There is no percentage that describes that transition, and the two
   figures printed beside each other in the ledger tell the reader far more
   than a rate pointing the wrong way would. */
function change(from: number | null, to: number | null): number | null {
  if (from === null || to === null || from <= 0) return null;
  return finite((to / from - 1) * 100);
}

/* Compound annual rate between two filed years.

   Three refusals, each for a different failure:

   · a base that is not strictly positive — the same reason `change` refuses
     one, and additionally because the root of a ratio with a negative
     denominator is not a rate at anything;
   · an end value that is not strictly positive — Math.pow of a negative base
     to a fractional power is NaN, and a NaN reaching toFixed prints "NaN%" on
     a page about somebody's money. A company whose free cash flow went from
     +100 to −50 has no annual rate; it has a story the ledger already tells;
   · a span under a year — two figures from the same fiscal year cannot
     compound, and the feed can hand back a single year.

   `years` is the difference between the two fiscal years actually used, not
   the count of rows between them. A series with a gap in the middle spans the
   real elapsed time, and dividing by the number of rows would annualise over
   a period that did not pass. */
function compound(from: number | null, to: number | null, years: number): number | null {
  if (from === null || to === null || from <= 0 || to <= 0 || years < 1) return null;
  return finite((Math.pow(to / from, 1 / years) - 1) * 100);
}

/* ------------------------------------------------------------------ */
/* Formatting                                                          */
/* ------------------------------------------------------------------ */

/* Statement figures, at the scale a column has room for.

   ./format.ts already has `marketCap`, and it cannot be used here: it returns
   a dash for anything at or below nought, which is right for a capitalisation
   and wrong for every line on these ledgers. A negative net cash position, a
   year that burned cash and a balance sheet in equity deficit are the three
   readings a buyer most needs to see, and the shared helper would silently
   erase all three. */
function compact(n: number | null): string {
  if (n === null) return DASH;
  const sign = n < 0 ? MINUS : "";
  const abs = Math.abs(n);
  if (abs >= 1e12) return `${sign}$${(abs / 1e12).toFixed(2)}T`;
  if (abs >= 1e9) return `${sign}$${(abs / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(1)}M`;
  /* Fixed en-US, like every other formatter in this layer: the page renders on
     the server too, and a visitor-locale separator breaks hydration. */
  return `${sign}$${Math.round(abs).toLocaleString("en-US")}`;
}

/** A level, already a percent. Unsigned unless it is genuinely negative. */
const percent = (n: number | null, digits = 1): string =>
  n === null ? DASH : `${n < 0 ? MINUS : ""}${Math.abs(n).toFixed(digits)}%`;

/** A move, where the sign is the point. */
const movePercent = (n: number | null, digits = 1): string =>
  n === null ? DASH : `${n >= 0 ? "+" : MINUS}${Math.abs(n).toFixed(digits)}%`;

/* A margin's move, in POINTS.

   An operating margin going 31.5% → 32.0% has risen half a point. Stated as a
   percentage change it is +1.5%, which is a true statement about a different
   quantity and reads, in a column of percents, as three times the improvement
   that occurred. */
const movePoints = (n: number | null): string =>
  n === null ? DASH : `${n >= 0 ? "+" : MINUS}${Math.abs(n).toFixed(1)} pts`;

const multiple = (n: number | null, digits = 2): string =>
  n === null ? DASH : `${n < 0 ? MINUS : ""}${Math.abs(n).toFixed(digits)}×`;

/* Per share. A quarterly dividend can be a fraction of a cent on a low-priced
   name, and two decimals would round a real payment to $0.00 — a dash's worth
   of nothing, printed as though the company paid nought. */
const perShare = (n: number | null): string =>
  n === null ? DASH : Math.abs(n) < 0.01 ? `$${n.toFixed(4)}` : usd(n);

const tone = (n: number | null): string => (n === null ? C.ink4 : n >= 0 ? C.up : C.down);

/* ------------------------------------------------------------------ */
/* The years under consideration                                       */
/* ------------------------------------------------------------------ */

/* Six at most. The feed sends five and could send more; a ledger wider than
   the column can hold starts scrolling sideways, and the sixth year is where
   the reader stops caring. Oldest-first, as normalize/financials.ts orders
   them, because every one of these tables reads left to right. */
const MAX_YEARS = 6;

const filed = (s: InstrumentSnapshot): FinancialYear[] =>
  s.financials.annual.slice(-MAX_YEARS);

/** The year the "latest" column of every section refers to. */
const latestYear = (s: InstrumentSnapshot): FinancialYear | null => filed(s).at(-1) ?? null;

/* The year immediately before the latest, and only if it is immediately
   before it. A company that filed 2022 and then 2024 has no year-over-year to
   report: the two columns are two years apart, and a figure labelled
   "YoY" over a two-year gap is a rate measured against the wrong window and
   stated with complete confidence. */
function priorYear(years: FinancialYear[], of: FinancialYear): FinancialYear | null {
  const at = years.indexOf(of);
  const prior = at > 0 ? years[at - 1] : null;
  return prior && of.year - prior.year === 1 ? prior : null;
}

/* ------------------------------------------------------------------ */
/* 1 · The headline strip                                              */
/* ------------------------------------------------------------------ */

/* Five figures, each with its year and its last move — a figure, its trend,
   its context, in that order, which is the scan path the rest of the panel
   then elaborates.
 *
 * The note names the fiscal year even where the figure itself is a dash. The
 * note is a fact about the column, not about the number: a reader looking at
 * a dash under "FY2025" knows the filing exists and does not carry the line,
 * which is different from knowing nothing at all. */
export function headline(s: InstrumentSnapshot): Figure[] {
  const years = filed(s);
  const latest = years.at(-1);
  if (!latest) return [];

  const prior = priorYear(years, latest);
  const stamp = `FY${latest.year}`;
  const withMove = (move: string) => (move === DASH ? stamp : `${stamp} · ${move}`);

  /* Cash and short-term investments, which is what the balance sheet does
     answer. Both lines are required: taking cash alone where the investments
     line is absent would swap the definition of the figure between one
     company and the next, and the reader comparing them has no way to see it. */
  const liquid = (y: FinancialYear | null): number | null =>
    y === null || y.cashAndEquivalents === null || y.shortTermInvestments === null
      ? null
      : y.cashAndEquivalents + y.shortTermInvestments;

  return [
    {
      key: "revenue",
      label: "Revenue",
      value: compact(latest.revenue),
      note: withMove(movePercent(change(prior?.revenue ?? null, latest.revenue))),
    },
    {
      key: "operatingMargin",
      label: "Operating margin",
      value: percent(latest.operatingMargin),
      /* Points, not percent: see `movePoints`. Both readings are already
         percents, so the difference between them is a difference of points
         and needs no conversion of any kind. */
      note: withMove(
        movePoints(
          latest.operatingMargin === null || prior?.operatingMargin == null
            ? null
            : latest.operatingMargin - prior.operatingMargin,
        ),
      ),
    },
    {
      key: "netIncome",
      label: "Net income",
      value: compact(latest.netIncome),
      note: withMove(movePercent(change(prior?.netIncome ?? null, latest.netIncome))),
    },
    {
      key: "fcf",
      label: "Free cash flow",
      value: compact(latest.freeCashFlow),
      note: withMove(movePercent(change(prior?.freeCashFlow ?? null, latest.freeCashFlow))),
    },
    {
      key: "liquid",
      label: "Cash & investments",
      value: compact(liquid(latest)),
      note: withMove(movePercent(change(liquid(prior), liquid(latest)))),
    },
  ];
}

/* ------------------------------------------------------------------ */
/* 2 · Growth                                                          */
/* ------------------------------------------------------------------ */

type Series = { years: FinancialYear[]; points: Array<{ year: number; value: number }> };

/* A metric's series, with the years it does not answer for left OUT rather
   than filled with nought. A zero-filled year draws a cliff that did not
   happen — and worse here than on a chart, because a nought would then become
   the base of a growth rate and produce an infinity. */
function seriesOf(years: FinancialYear[], pick: (y: FinancialYear) => number | null): Series {
  const points: Array<{ year: number; value: number }> = [];
  for (const y of years) {
    const v = finite(pick(y));
    if (v !== null) points.push({ year: y.year, value: v });
  }
  return { years, points };
}

const GROWTH_METRICS: Array<{
  key: string;
  label: string;
  pick: (y: FinancialYear) => number | null;
  format: (n: number | null) => string;
}> = [
  { key: "revenue", label: "Revenue", pick: (y) => y.revenue, format: compact },
  {
    key: "eps",
    label: "Earnings per share",
    pick: (y) => y.eps,
    format: (n) => (n === null ? DASH : usd(n)),
  },
  { key: "fcf", label: "Free cash flow", pick: (y) => y.freeCashFlow, format: compact },
];

/** Bar width from a rate. Saturates: a triple-digit year is not six bars wide. */
const rateWidth = (n: number | null): string =>
  n === null ? "0%" : `${Math.max(4, Math.min(100, Math.abs(n) * 1.6 + 6)).toFixed(1)}%`;

/* The top line, the bottom line and the cash line, each as its last step and
   as the rate it has compounded at across the whole filed record. */
export function growth(s: InstrumentSnapshot): GrowthRow[] {
  const years = filed(s);
  if (years.length === 0) return [];

  return GROWTH_METRICS.map((m) => {
    const { points } = seriesOf(years, m.pick);
    const last = points.at(-1) ?? null;
    const first = points[0] ?? null;

    /* The step is measured between the two most recent years that both carry
       the metric, and only when they are consecutive — see `priorYear`. */
    const previous = points.length >= 2 ? points[points.length - 2] : null;
    const consecutive = last !== null && previous !== null && last.year - previous.year === 1;
    const yoy = consecutive ? change(previous.value, last.value) : null;

    const spans = first !== null && last !== null && last.year > first.year;
    const cagr = spans ? compound(first.value, last.value, last.year - first.year) : null;

    return {
      key: m.key,
      label: m.label,
      latest: m.format(last?.value ?? null),
      yoy: movePercent(yoy),
      yoyColor: tone(yoy),
      yoyWidth: rateWidth(yoy),
      cagr: movePercent(cagr),
      cagrColor: tone(cagr),
      /* Named rather than assumed. The rate above may span three years or
         five depending on what the company filed, and a reader comparing two
         companies' "CAGR" needs to see which windows they are. */
      span: spans ? `${first.year}${EN_DASH}${last.year}` : null,
    };
  });
}

/* ------------------------------------------------------------------ */
/* Ledger construction                                                 */
/* ------------------------------------------------------------------ */

type RowSpec = {
  key: string;
  label: string;
  /** The cell's text. */
  cell: (y: FinancialYear) => string;
  /** Optional meter, for the one ledger whose figures share a natural scale. */
  meter?: (y: FinancialYear, latest: boolean) => { width: string; color: string } | null;
};

function build(s: InstrumentSnapshot, specs: RowSpec[]): Ledger {
  const years = filed(s);
  if (years.length === 0) return { years: [], rows: [] };

  return {
    years: years.map((y) => y.year),
    rows: specs.map((spec) => ({
      key: spec.key,
      label: spec.label,
      cells: years.map((y, i) => {
        const meter = spec.meter?.(y, i === years.length - 1) ?? null;
        return {
          value: spec.cell(y),
          width: meter?.width ?? null,
          color: meter?.color ?? null,
        };
      }),
    })),
  };
}

/* ------------------------------------------------------------------ */
/* 3 · The income ledger                                               */
/* ------------------------------------------------------------------ */

export function incomeLedger(s: InstrumentSnapshot): Ledger {
  return build(s, [
    { key: "revenue", label: "Revenue", cell: (y) => compact(y.revenue) },
    { key: "grossProfit", label: "Gross profit", cell: (y) => compact(y.grossProfit) },
    { key: "operatingIncome", label: "Operating income", cell: (y) => compact(y.operatingIncome) },
    { key: "netIncome", label: "Net income", cell: (y) => compact(y.netIncome) },
    { key: "ebitda", label: "EBITDA", cell: (y) => compact(y.ebitda) },
    /* Diluted, as normalize/financials.ts picks it, and in dollars per share
       rather than at the scale of the rows above — the format is what tells
       the reader they have changed register. */
    { key: "eps", label: "Earnings per share", cell: (y) => (y.eps === null ? DASH : usd(y.eps)) },
    {
      key: "rd",
      label: "Research & development",
      cell: (y) => compact(y.researchDevelopment),
    },
  ]);
}

/* ------------------------------------------------------------------ */
/* 4 · Margins                                                         */
/* ------------------------------------------------------------------ */

/* The one ledger that draws bars, because it is the one whose figures share a
   natural scale: a margin is a percent of revenue, so the meter is the figure
   itself against a hundred and needs no normalisation that could mislead.
   Everything else on this page is in dollars, where the only honest scale is
   relative to the largest value in view — a bar that says nothing except
   which year was biggest.
 *
 * A year with no margin gets a null width and draws no meter at all. A
 * zero-width bar in a row of full ones is indistinguishable from a company
 * that earned nothing that year. */
const MARGIN_BAR = (v: number | null, latest: boolean) => {
  if (v === null) return null;
  return {
    width: `${Math.min(100, Math.max(2, Math.abs(v))).toFixed(1)}%`,
    /* Gold for the most recent year and dim gold for the ones behind it —
       the same "only the latest bar earns gold" convention the revenue chart
       in instrument-derive.ts uses. A negative margin is a direction, and
       takes the falling tone instead. */
    color: v < 0 ? C.down : latest ? C.gold : C.goldDim,
  };
};

export function marginLedger(s: InstrumentSnapshot): Ledger {
  /* Every one of these is ALREADY A PERCENT off the FinancialYear row. They
     are printed, not converted. */
  const row = (key: string, label: string, pick: (y: FinancialYear) => number | null): RowSpec => ({
    key,
    label,
    cell: (y) => percent(pick(y)),
    meter: (y, latest) => MARGIN_BAR(pick(y), latest),
  });

  return build(s, [
    row("gross", "Gross margin", (y) => y.grossMargin),
    row("operating", "Operating margin", (y) => y.operatingMargin),
    row("net", "Net margin", (y) => y.netMargin),
    row("rd", "R&D intensity", (y) => y.rdIntensity),
  ]);
}

/* ------------------------------------------------------------------ */
/* 5 · Cash flow                                                       */
/* ------------------------------------------------------------------ */

export function cashFlowLedger(s: InstrumentSnapshot): Ledger {
  return build(s, [
    { key: "cfo", label: "Operating cash flow", cell: (y) => compact(y.cashFromOps) },
    /* A magnitude, which is how normalize/financials.ts stores it after
       repairing a feed that signs the line inconsistently. Printed as a
       magnitude too: the row beneath is what is left after it, so the column
       reads as the subtraction it is, and inventing a minus here would be
       re-imposing the very convention that layer had to normalise away. */
    { key: "capex", label: "Capital spend", cell: (y) => compact(y.capex) },
    { key: "fcf", label: "Free cash flow", cell: (y) => compact(y.freeCashFlow) },
    /* Already a percent on the row. */
    { key: "fcfMargin", label: "FCF margin", cell: (y) => percent(y.fcfMargin) },
    {
      key: "conversion",
      label: "Cash conversion",
      /* Free cash flow as a percent of what the income statement claimed —
         the earnings-quality reading, and the one a buyer uses to tell
         accounting profit from money. Refused against a loss: 50 of cash over
         100 of losses answers −50%, which reads as a company converting
         nothing when it is converting a loss into cash. */
      cell: (y) => percent(percentOf(y.freeCashFlow, y.netIncome), 0),
    },
    {
      key: "dividendsPaid",
      label: "Dividends paid",
      cell: (y) => compact(y.dividendsPaid),
    },
  ]);
}

/* ------------------------------------------------------------------ */
/* 6 · The balance sheet                                               */
/* ------------------------------------------------------------------ */

/** Cash plus short-term investments; both lines required, as in `headline`. */
const liquidOf = (y: FinancialYear): number | null =>
  y.cashAndEquivalents === null || y.shortTermInvestments === null
    ? null
    : y.cashAndEquivalents + y.shortTermInvestments;

/* Total borrowings. BOTH lines are required, and this is the same refusal
   normalize/financials.ts makes when it strikes net cash.
 *
 * An absent long-term debt line on a balance sheet is an absent reading, not
 * an absent liability, and treating it as nought publishes a leverage figure
 * struck off the current portion alone. On the live feed that is not a corner
 * case: the long-term line comes back null for every year of every company
 * this account can see, so the permissive version of this function would
 * report a debt-to-equity of 0.27× for a company carrying five times that.
 * The dash is the honest answer, and the total-liabilities row two lines down
 * gives the reader the obligation figure the filing did answer. */
const borrowingsOf = (y: FinancialYear): number | null =>
  y.debtCurrent === null || y.longTermDebt === null ? null : y.debtCurrent + y.longTermDebt;

/* The interest bill, as a magnitude.
 *
 * This is the one place in the file that reads a line differently from the
 * derived block on the FinancialYear row, and it is worth saying why at
 * length. `financials.ts` computes `interestCoverage` straight off
 * `interestExpense` as filed, refusing a non-positive denominator on the
 * grounds that taking a magnitude would be "inventing a convention rather
 * than repairing one" — correct reasoning at the time it was written, when
 * there was no evidence about how the feed signs the line.
 *
 * There is evidence now. Every interest expense this feed has returned is
 * signed negative, as an outflow: the line is consistently an expense stated
 * with the sign of a cash movement. Against that, the strict guard does not
 * make the column conservative — it makes it dead, refusing every row that
 * exists and rendering an entire measure of solvency as a dash for every
 * company on the platform.
 *
 * A magnitude is right under either convention, because the size of the
 * interest bill is what coverage divides into and a bill has no direction.
 * Nought is still refused: it is a debt-free year or an unanswered line, and
 * a coverage against nothing is the infinity that reads as perfect safety.
 * The operating income above keeps its sign, so a company covering its
 * interest out of an operating loss still reports the negative multiple that
 * says so. */
const interestBillOf = (y: FinancialYear): number | null => {
  const asFiled = finite(y.interestExpense);
  return asFiled === null ? null : Math.abs(asFiled);
};

export function balanceLedger(s: InstrumentSnapshot): Ledger {
  return build(s, [
    { key: "assets", label: "Total assets", cell: (y) => compact(y.totalAssets) },
    { key: "liabilities", label: "Total liabilities", cell: (y) => compact(y.totalLiabilities) },
    /* Equity may properly be negative. A balance sheet in deficit is a fact
       the column states rather than a gap it hides. */
    { key: "equity", label: "Shareholders' equity", cell: (y) => compact(y.totalEquity) },
    { key: "liquid", label: "Cash & investments", cell: (y) => compact(liquidOf(y)) },
    /* Struck on the FinancialYear row itself, under exactly the four-line
       requirement described at `borrowingsOf`. Passed through rather than
       recomputed so this column cannot drift from the one financials.ts
       reasoned about. */
    { key: "netCash", label: "Net cash", cell: (y) => compact(y.netCash) },
    { key: "currentRatio", label: "Current ratio", cell: (y) => multiple(y.currentRatio) },
    {
      key: "interestCoverage",
      label: "Interest coverage",
      cell: (y) => multiple(quotient(y.operatingIncome, interestBillOf(y))),
    },
    {
      key: "debtToEquity",
      /* "Borrowings", not "Debt". The valuation list on the same panel already
         carries a "Debt / equity" row from the record's own trailing ratios,
         and two rows under one name showing different figures — one filed, one
         trailing, and on the live feed one of them a dash — is the same "one
         page, two answers" failure the RSI signal in instrument-derive.ts had
         to be corrected for. Naming this row for exactly what it divides keeps
         both readings on the page without either contradicting the other. */
      label: "Borrowings / equity",
      cell: (y) => multiple(quotient(borrowingsOf(y), y.totalEquity)),
    },
    {
      key: "liabilitiesToEquity",
      label: "Liabilities / equity",
      /* Every obligation rather than only the borrowings, which is a
         different and broader measure — kept beside the row above rather
         than folded into it, because a feed that stops carrying the debt
         lines must not silently change what "debt / equity" means. */
      cell: (y) => multiple(quotient(y.totalLiabilities, y.totalEquity)),
    },
    {
      key: "bookValue",
      label: "Book value / share",
      cell: (y) => (y.bookValuePerShare === null ? DASH : usd(y.bookValuePerShare)),
    },
  ]);
}

/* ------------------------------------------------------------------ */
/* 7 · Valuation                                                       */
/* ------------------------------------------------------------------ */

/* An enterprise value that can be reconciled in scale with the market
   capitalisation beside it, or nothing.
 *
 * profile.ts maps this field unconverted and documents why: nothing in the
 * payload or its documentation states the unit, the record counts market cap
 * in dollars where the quotes feed counts millions, and there was no live
 * response to calibrate against. That leaves one failure mode, and it is the
 * worst kind — a figure a million times too small still renders as a tidy
 * number with a currency sign in front of it, on the line a valuation is
 * built from.
 *
 * A scale check catches exactly that error and nothing else. Enterprise value
 * is market capitalisation plus net debt, so the two quantities are the same
 * order of magnitude for every company that has ever existed; a thousandfold
 * band either side lets through every real reading — including the negative
 * one a company holding more cash than it is worth genuinely has — and
 * refuses a figure that has been divided by a million. Where there is no
 * market capitalisation to check against there is nothing to reconcile, and
 * the figure is refused rather than trusted. */
function reconciledEnterpriseValue(marketCap: number | null, reported: number | null): number | null {
  const cap = finite(marketCap);
  const ev = finite(reported);
  if (cap === null || cap <= 0 || ev === null) return null;
  const scale = Math.abs(ev) / cap;
  return scale >= 0.001 && scale <= 1000 ? ev : null;
}

/* The four readings the twelve trailing scalars in instrument-derive's
   `ratios()` do not carry, in the same LeaderRow vocabulary so the panel can
   run them on as one list.
 *
 * Everything struck here divides the live market capitalisation — DOLLARS,
 * converted once in profile.ts — into the latest filed year. That mixes a
 * price from this afternoon with a balance sheet from last autumn, which is
 * what every yield and every multiple in the industry does; what it must not
 * do is mix a dollar with a million, which is why the market cap is used
 * exactly as profile.ts hands it over. */
export function valuation(s: InstrumentSnapshot): RatioRow[] {
  const p = s.profile;
  const latest = latestYear(s);
  const cap = finite(p.marketCap);
  const fcf = latest === null ? null : finite(latest.freeCashFlow);

  return [
    {
      key: "enterpriseValue",
      label: "Enterprise value",
      value: compact(reconciledEnterpriseValue(cap, p.enterpriseValue)),
    },
    {
      key: "evToEbitda",
      label: "EV / EBITDA",
      /* Taken from the record as it arrives. Unlike the currency figure above
         this one carries no unit risk at all: profile.ts documents it as a
         MULTIPLE and has already refused a non-positive value, and a multiple
         is the same number whatever currency and scale it was struck in. */
      value: multiple(finite(p.evToEbitda)),
    },
    {
      key: "fcfYield",
      label: "Free cash flow yield",
      /* Dollars over dollars. Free cash flow keeps its sign: a year that
         burned cash reports a negative yield, which is a reading, where a
         dash would merely look like missing data. */
      value: percent(percentOf(fcf, cap), 2),
    },
    {
      key: "priceToFcf",
      label: "Price / free cash flow",
      /* Refused against a burn, unlike the yield above. A yield of −2% is a
         sentence; a multiple of −50× sits in a column beside 20× and 34× and
         reads as the cheapest company on the page. */
      value: multiple(quotient(cap, fcf)),
    },
    {
      key: "returnOnAssets",
      label: "Return on assets",
      /* Struck from the filings rather than read off profile.returnOnAssets.
         That field is handed on in whatever unit the record used — profile.ts
         says so where it maps it, and 0.3364 is equally readable as 33.64% or
         as a third of a percent. Printing it would mean guessing a ×100 on a
         headline measure of quality. Net income over total assets is the same
         reading with no guess in it, and it comes from the same two lines the
         ledgers above already show. */
      value: percent(latest === null ? null : percentOf(latest.netIncome, latest.totalAssets)),
    },
  ];
}

/* ------------------------------------------------------------------ */
/* 8 · The dividend record                                             */
/* ------------------------------------------------------------------ */

const DAY = 24 * 60 * 60 * 1000;

const CADENCE: Record<number, string> = {
  1: "Annual",
  2: "Semi-annual",
  4: "Quarterly",
  12: "Monthly",
};

type Paid = { exDate: string; payDate: string | null; amount: number; at: number };

/* Newest first, whatever order the feed sent. The corporate-actions endpoint
   happens to answer newest-first today; a record read in the wrong order
   would report the oldest payment as the current rate and invert every
   growth figure struck from it, silently and plausibly. A payment whose
   ex-date will not parse cannot be placed on the timeline at all, so it is
   dropped rather than sorted to one end where it would corrupt the spacing
   the cadence is read from. */
function paidNewestFirst(s: InstrumentSnapshot): Paid[] {
  const out: Paid[] = [];
  for (const d of s.dividends) {
    const at = Date.parse(d.exDate);
    const amount = finite(d.amount);
    if (!Number.isFinite(at) || amount === null || amount <= 0) continue;
    out.push({ exDate: d.exDate, payDate: d.payDate, amount, at });
  }
  return out.sort((a, b) => b.at - a.at);
}

/* How many payments a year, read from the record's own spacing.
 *
 * The median gap rather than the mean, so one missed or one special payment
 * does not drag the estimate onto a cadence the company never had. */
function paymentsPerYear(payments: Paid[]): number | null {
  if (payments.length < 2) return null;
  const gaps: number[] = [];
  for (let i = 1; i < payments.length; i += 1) {
    const gap = (payments[i - 1].at - payments[i].at) / DAY;
    if (gap > 0) gaps.push(gap);
  }
  if (gaps.length === 0) return null;
  gaps.sort((a, b) => a - b);
  const median = gaps[Math.floor(gaps.length / 2)];
  if (!Number.isFinite(median) || median <= 0) return null;
  const perYear = Math.round(365.25 / median);
  return perYear >= 1 && perYear <= 12 ? perYear : null;
}

/* The annual rate: one full cadence of payments, summed.
 *
 * The obvious implementation — everything inside a 365-day window — is wrong
 * in a way that always errs high. Ex-dates drift earlier from year to year,
 * so on a quarterly payer the window regularly catches five payments and
 * reports an annual rate a quarter above what the company pays, on the single
 * figure somebody buys the stock for. Counting a cadence instead of a window
 * cannot make that mistake: four quarterly payments are a year's dividends
 * whatever dates they fell on.
 *
 * A record shorter than one full cadence has no annual rate. Summing what is
 * there would report a company's first two quarters as its yearly payment. */
function annualRate(payments: Paid[], perYear: number | null): number | null {
  if (perYear === null || payments.length < perYear) return null;
  let total = 0;
  for (let i = 0; i < perYear; i += 1) total += payments[i].amount;
  return finite(total);
}

/* Per-share growth, against the payment one cadence-year back.
 *
 * Comparing the latest payment to the one before it would answer nothing for
 * a quarterly payer that raises once a year — three quarters in four it reads
 * 0.0%, which is a true statement that misleads. Comparing calendar-year
 * totals is worse: the newest year is always partial, so a company that has
 * raised its dividend every year for a decade shows a collapse.
 *
 * So: the payment `perYear` positions back, and only when it actually falls
 * about a year earlier. The window is deliberately loose — a payer that
 * shifted its schedule by a month is still comparable — and deliberately
 * bounded, so a company that changed cadence mid-record does not have two
 * different intervals divided into each other and called annual growth. */
function perShareGrowth(payments: Paid[], perYear: number | null): number | null {
  if (perYear === null || payments.length <= perYear) return null;
  const now = payments[0];
  const then = payments[perYear];
  const gapDays = (now.at - then.at) / DAY;
  if (gapDays < 300 || gapDays > 430) return null;
  return change(then.amount, now.amount);
}

/* What the company has actually paid, which until now appeared only on the
   Holdings panel — a page a reader reaches after buying. A buyer deciding
   whether to buy looks for it here. */
export function dividendRecord(s: InstrumentSnapshot): DividendRecord {
  const payments = paidNewestFirst(s);
  if (payments.length === 0) {
    /* Not a row of noughts. A company that has never declared a dividend has
       no payout ratio, no yield and no growth rate, and printing "0.0%" four
       times states a policy the filing never announced. The panel says so in
       words instead. */
    return { payments: [], figures: [], cadence: null };
  }

  const perYear = paymentsPerYear(payments);
  const latest = latestYear(s);

  const figures: Figure[] = [
    {
      key: "annual",
      label: "Annual rate",
      value: perShare(annualRate(payments, perYear)),
      note: perYear === null ? null : `Last ${perYear} payment${perYear === 1 ? "" : "s"}`,
    },
    {
      key: "latest",
      label: "Latest payment",
      value: perShare(payments[0].amount),
      note: `Ex-dividend ${payments[0].exDate}`,
    },
    {
      key: "yield",
      label: "Dividend yield",
      /* Already a PERCENT on the profile: the quotes feed's figure is a
         percent and the record's fraction was multiplied once, in profile.ts. */
      value: percent(finite(s.profile.dividendYield), 2),
      note: "Trailing, on the last price",
    },
    {
      key: "payout",
      label: "Payout ratio",
      /* Also already a percent, struck on the FinancialYear row against that
         year's net income and refused against a loss. */
      value: percent(latest === null ? null : latest.payoutRatio),
      note: latest === null ? null : `FY${latest.year} earnings`,
    },
    {
      key: "growth",
      label: "Per-share growth",
      value: movePercent(perShareGrowth(payments, perYear)),
      note: "Against the payment a year earlier",
    },
  ];

  return {
    payments: payments.map((p) => ({
      exDate: p.exDate,
      payDate: p.payDate,
      amount: perShare(p.amount),
    })),
    figures,
    cadence: perYear === null ? null : (CADENCE[perYear] ?? `${perYear} a year`),
  };
}
