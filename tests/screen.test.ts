import { test } from "node:test";
import assert from "node:assert/strict";
import {
  FLOOR,
  POPULAR_MIN_REL_VOL,
  breadth,
  eligible,
  eligibleRows,
  floorReport,
  gainers,
  losers,
  mostActive,
  popular,
} from "../lib/market/screen.ts";
import type { Snapshot, SweepRow } from "../lib/api/sweep.ts";

/* The floor and the boards.

   Everything the page states as a fact about the market — what rose, what
   fell, what traded — is decided in screen.ts, and it is decided silently: a
   wrong floor does not throw, it just renders a different market. The
   expensive mistakes are the ones the page cannot notice, so most of what
   follows pins down which field a rule is allowed to read rather than only
   what it returns. */

/* A row that clears the floor with room to spare, so each test can name the
   one field it is about. Derived fields follow their inputs the way
   toSweepRow derives them, which keeps a fixture from describing a row the
   sweep could never produce; an explicit override still wins. */
function row(over: Partial<SweepRow> = {}): SweepRow {
  const px = over.px ?? 50;
  const vol = over.vol ?? 1_000_000;
  const avgVol = over.avgVol ?? 1_000_000;
  return {
    s: "AAA",
    name: "Acme Industrial Corp",
    px,
    chg: 0,
    vol,
    avgVol,
    dollarVol: px * vol,
    relVol: avgVol > 0 ? vol / avgVol : 0,
    mcap: 12_000_000_000,
    pe: 18,
    ex: "NSDQ",
    asOf: null,
    delayed: true,
    ...over,
  };
}

const snapshot = (rows: SweepRow[]): Snapshot => ({
  rows,
  sweptAt: Date.UTC(2026, 7, 21, 14, 35),
  requested: rows.length,
  calls: 1,
  failedChunks: 0,
  missing: 0,
  ms: 12,
});

const symbols = (rows: readonly SweepRow[]) => rows.map((r) => r.s);

/* ------------------------------------------------------------------ */
/* The floor                                                           */
/* ------------------------------------------------------------------ */

test("the floor admits an ordinary listed name on any of the three exchanges", () => {
  for (const ex of FLOOR.exchanges) {
    assert.equal(eligible(row({ s: "MSFT", ex, px: 410, avgVol: 20_000_000 })), true, ex);
  }
});

test("the floor turns away off-exchange, sub-dollar and thin names", () => {
  // Each row fails on exactly one count; the others are comfortable.
  assert.equal(eligible(row({ s: "GBTC", ex: "PINK" })), false, "off-exchange");
  assert.equal(eligible(row({ s: "SHEL", ex: "" })), false, "no exchange at all");
  assert.equal(eligible(row({ s: "PENN", px: 0.42, avgVol: 90_000_000 })), false, "sub-dollar");
  assert.equal(eligible(row({ s: "THIN", px: 40, avgVol: 20_000 })), false, "thin turnover");
});

test("the floor is inclusive at the line and exclusive below it", () => {
  const atPrice = row({ px: FLOOR.minPrice, avgVol: 50_000_000 });
  const belowPrice = row({ px: FLOOR.minPrice - 0.01, avgVol: 50_000_000 });
  assert.equal(eligible(atPrice), true, "a dollar exactly");
  assert.equal(eligible(belowPrice), false, "a cent under");

  const atTurnover = row({ px: 10, avgVol: FLOOR.minTypicalDollarVol / 10 });
  const belowTurnover = row({ px: 10, avgVol: FLOOR.minTypicalDollarVol / 10 - 1 });
  assert.equal(eligible(atTurnover), true, "the floor exactly");
  assert.equal(eligible(belowTurnover), false, "a share under");
});

/* ------------------------------------------------------------------ */
/* The overnight regression                                            */
/* ------------------------------------------------------------------ */

test("a name that has not traded yet today is still eligible", () => {
  /* The regression this file exists for. Today's volume resets to nothing
     when the feed rolls into a new session at four in the morning Eastern. A
     floor read against it dropped 12,440 of 13,546 names and every board on
     the page went empty, which is why eligibility keys off the thirty-day
     average: whether a company is normally liquid is a fact about the
     company, not about the time of day. */
  const overnight = row({ s: "KO", px: 62, vol: 0, avgVol: 12_000_000 });

  assert.equal(overnight.dollarVol, 0, "nothing has traded");
  assert.equal(overnight.relVol, 0, "and so relative volume is nothing too");
  assert.equal(eligible(overnight), true);
});

test("the boards still fill before the first trade of the session", () => {
  const overnight = [4.2, 1.1, -0.6, 8.7, -3.3, 0.4, -7.9, 2.5].map((chg, i) =>
    row({ s: `S${i}`, chg, px: 30, vol: 0, avgVol: 4_000_000 }),
  );
  const s = snapshot(overnight);

  assert.equal(eligibleRows(s).length, overnight.length, "the whole pool survives");
  assert.equal(floorReport(s).droppedVolume, 0, "nothing was dropped for turnover");
  assert.equal(gainers(s, 5).length, 5);
  assert.equal(losers(s, 5).length, 5);
  assert.equal(mostActive(s, 5).length, 5);
});

/* ------------------------------------------------------------------ */
/* Ranking                                                             */
/* ------------------------------------------------------------------ */

const movers = () =>
  snapshot([
    row({ s: "AAA", chg: 4.1 }),
    row({ s: "BBB", chg: 12.5 }),
    row({ s: "CCC", chg: -0.8 }),
    row({ s: "DDD", chg: 7.9 }),
    row({ s: "EEE", chg: -6.2 }),
  ]);

test("gainers run down from the largest rise, losers up from the largest fall", () => {
  const s = movers();
  assert.deepEqual(symbols(gainers(s, 3)), ["BBB", "DDD", "AAA"]);
  assert.deepEqual(symbols(losers(s, 3)), ["EEE", "CCC", "AAA"]);
});

test("the boards honour the count asked for and never pad it", () => {
  const s = movers();
  assert.equal(gainers(s, 2).length, 2);
  assert.equal(losers(s, 2).length, 2);
  assert.equal(gainers(s, 99).length, 5, "a short pool stays short");
});

test("most active ranks by dollars traded, not by shares", () => {
  const s = snapshot([
    row({ s: "AAPL", name: "APPLE INC", px: 200, vol: 20_000_000 }),
    row({ s: "F", name: "FORD MOTOR CO", px: 11, vol: 60_000_000 }),
  ]);
  // Ford trades three times the shares and a sixth of the money.
  assert.deepEqual(symbols(mostActive(s, 2)), ["AAPL", "F"]);
});

test("most active includes funds, because turnover is a fair question to ask of one", () => {
  const s = snapshot([
    row({ s: "SPY", name: "STATE STREET SPDR S&P 500 ETF", px: 600, vol: 80_000_000 }),
    row({ s: "AAPL", name: "APPLE INC", px: 200, vol: 20_000_000 }),
  ]);
  assert.deepEqual(symbols(mostActive(s, 2)), ["SPY", "AAPL"]);
});

test("gainers, losers and popular are operating companies only", () => {
  /* A leveraged fund's move is arithmetic on somebody else's, so it tells a
     reader nothing about what happened today — and left in, the pair of them
     own both ends of the board. */
  const s = snapshot([
    row({
      s: "SOXL",
      name: "DIREXION DAILY SEMICONDUCTOR BULL 3X SHARES",
      chg: 21.4,
      vol: 6_000_000,
    }),
    row({
      s: "SOXS",
      name: "DIREXION DAILY SEMICONDUCTOR BEAR 3X SHARES",
      chg: -19.8,
      vol: 5_000_000,
    }),
    row({ s: "NVDA", name: "NVIDIA CORP", chg: 7.1, vol: 3_000_000 }),
    row({ s: "INTC", name: "INTEL CORP", chg: -4.3, vol: 2_400_000 }),
    row({ s: "KO", name: "COCA-COLA CO", chg: 0.6, vol: 2_100_000 }),
  ]);

  assert.deepEqual(symbols(gainers(s, 5)), ["NVDA", "KO", "INTC"]);
  assert.deepEqual(symbols(losers(s, 5)), ["INTC", "KO", "NVDA"]);
  assert.deepEqual(symbols(popular(s, 5)), ["NVDA", "INTC", "KO"]);
});

test("popular ranks by relative volume and drops anything under the threshold", () => {
  const avg = 1_000_000;
  const rel = (x: number) => ({ vol: Math.round(avg * x), avgVol: avg });
  const s = snapshot([
    row({ s: "AAA", ...rel(5) }),
    row({ s: "BBB", ...rel(3) }),
    row({ s: "CCC", ...rel(POPULAR_MIN_REL_VOL) }),
    row({ s: "DDD", ...rel(POPULAR_MIN_REL_VOL - 0.1) }),
  ]);

  assert.deepEqual(symbols(popular(s)), ["AAA", "BBB", "CCC"], "the line itself is in");
  assert.deepEqual(symbols(popular(s, 2)), ["AAA", "BBB"]);
});

test("ranking leaves the snapshot in the order it was swept", () => {
  // Every board sorts. Sorting s.rows in place would hand the next one a
  // different market.
  const s = movers();
  gainers(s);
  losers(s);
  mostActive(s);
  popular(s);
  assert.deepEqual(symbols(s.rows), ["AAA", "BBB", "CCC", "DDD", "EEE"]);
});

/* ------------------------------------------------------------------ */
/* Breadth                                                             */
/* ------------------------------------------------------------------ */

test("breadth counts both directions and leaves flat names out of each", () => {
  const b = breadth([{ chg: 1.2 }, { chg: 0 }, { chg: -0.4 }, { chg: 0 }, { chg: 3 }]);
  assert.deepEqual(b, { total: 5, up: 2, down: 1 });
});

test("breadth reads a swept row as readily as a rendered quote", () => {
  const b = breadth([row({ chg: 2 }), row({ chg: -2 }), row({ chg: 0 })]);
  assert.deepEqual(b, { total: 3, up: 1, down: 1 });
});

/* ------------------------------------------------------------------ */
/* The floor report                                                    */
/* ------------------------------------------------------------------ */

test("the report charges every swept row to exactly one outcome", () => {
  const s = snapshot([
    row({ s: "AAA" }),
    row({ s: "BBB" }),
    row({ s: "GBTC", ex: "PINK" }),
    // Off-exchange and sub-dollar and thin: still one row, counted once.
    row({ s: "JUNK", ex: "PINK", px: 0.2, avgVol: 100 }),
    row({ s: "PENN", px: 0.42, avgVol: 90_000_000 }),
    row({ s: "THIN", px: 40, avgVol: 20_000 }),
  ]);
  const f = floorReport(s);

  assert.equal(f.swept, 6);
  assert.equal(f.eligible, 2);
  assert.equal(f.droppedExchange, 2);
  assert.equal(f.droppedPrice, 1);
  assert.equal(f.droppedVolume, 1);
  assert.equal(
    f.eligible + f.droppedExchange + f.droppedPrice + f.droppedVolume + f.droppedChange,
    f.swept,
    "the breakdown accounts for the whole sweep",
  );
});

test("the report's eligible count is the pool the boards actually draw from", () => {
  /* The report exists so a thin board is explainable rather than mysterious.
     A count that includes a row no board will draw is wrong in precisely the
     situation it is consulted. */
  const s = snapshot([row({ s: "AAA" }), row({ s: "BBB", chg: Number.NaN })]);
  const f = floorReport(s);

  assert.equal(f.eligible, eligibleRows(s).length);
  assert.equal(f.droppedChange, 1, "an unrankable day change is a reason of its own");
});
