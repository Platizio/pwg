import { test } from "node:test";
import assert from "node:assert/strict";
import {
  FLOOR,
  breadth,
  current,
  eligible,
  eligibleRows,
  floorReport,
  gainers,
  losers,
  mostActive,
  popular,
} from "../lib/market/screen.ts";
import { POPULAR_TICKERS } from "../lib/market/universe.ts";
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
    chgKnown: true,
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

/* The tape is fed from this board, and the tape is meant to read like a real
   one: what changed hands, whatever it did with the money. A direction filter
   here would quietly turn the strip along the top of the page into a second
   gainers board. */
test("most active keeps a name that fell, because turnover has no direction", () => {
  const s = snapshot([
    row({ s: "UP", px: 100, vol: 10_000_000, chg: 3.2 }),
    row({ s: "DOWN", px: 100, vol: 30_000_000, chg: -8.7 }),
    row({ s: "FLAT", px: 100, vol: 20_000_000, chg: 0 }),
  ]);
  assert.deepEqual(symbols(mostActive(s, 3)), ["DOWN", "FLAT", "UP"]);
});

test("gainers and losers are operating companies only", () => {
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
});

/* ------------------------------------------------------------------ */
/* Popular                                                             */
/* ------------------------------------------------------------------ */

/* Popular is the only board with no market question underneath it. The other
   three each rank a number the feed reports — a move, a turnover. Fame is not
   a field in any feed, so it is committed by hand, and what these tests guard
   is that it stays committed: every plausible proxy for "popular" that can be
   computed from a sweep is a volume measure, and this board was one until it
   was noticed that it answers a different question than the reader is asking.

   Someone opening the page has heard of Apple. They have not heard of
   whichever mid-cap is at nine times its average volume today, and being told
   it is "popular" teaches them nothing. */

/* Priced by the feed and clearing the floor, so a test can name the one thing
   it is about. */
const listed = (s: string, over: Partial<SweepRow> = {}) => row({ s, ...over });

test("popular is the curated list, and only the curated list", () => {
  const s = snapshot([
    listed("ZZZZ"),
    ...POPULAR_TICKERS.map((t) => listed(t)),
    listed("QQQQ"),
  ]);
  assert.deepEqual(symbols(popular(s, POPULAR_TICKERS.length)), [...POPULAR_TICKERS]);
});

test("popular holds its curated order however the sweep happened to arrive", () => {
  /* Swept backwards, and with turnover running the other way to the curation,
     so a stray .sort() on any numeric field would show up here. */
  const reversed = [...POPULAR_TICKERS].reverse();
  const s = snapshot(reversed.map((t, i) => listed(t, { vol: 1_000_000 * (i + 1) })));
  assert.deepEqual(symbols(popular(s, 4)), [...POPULAR_TICKERS].slice(0, 4));
});

test("popular never renders a name the feed did not price", () => {
  /* The ribbon links every cell to an instrument page and prints a price on
     it. A curated symbol that is absent from the sweep has neither, so it has
     to be dropped rather than drawn empty. */
  const present = [POPULAR_TICKERS[1], POPULAR_TICKERS[4]];
  const s = snapshot(present.map((t) => listed(t)));
  assert.deepEqual(symbols(popular(s)), present);
});

test("popular ignores volume, which is the whole point of the change", () => {
  const avg = 1_000_000;
  const s = snapshot([
    listed("PUMP", { vol: avg * 40, avgVol: avg }),
    listed(POPULAR_TICKERS[0], { vol: avg / 20, avgVol: avg }),
  ]);
  assert.deepEqual(symbols(popular(s)), [POPULAR_TICKERS[0]]);
});

test("a famous name still has to clear the floor like anything else", () => {
  /* Curation says which companies belong, not which rows are fit to render.
     A name quoted off-exchange, or under a dollar, is a row the boards cannot
     trust — being a household name does not repair it. */
  const s = snapshot([
    listed(POPULAR_TICKERS[0], { ex: "OTC" }),
    listed(POPULAR_TICKERS[1], { px: 0.4 }),
    listed(POPULAR_TICKERS[2]),
  ]);
  assert.deepEqual(symbols(popular(s)), [POPULAR_TICKERS[2]]);
});

test("popular honours the count asked for and never pads it", () => {
  const s = snapshot(POPULAR_TICKERS.map((t) => listed(t)));
  assert.equal(popular(s, 3).length, 3);
  assert.equal(popular(s, 999).length, POPULAR_TICKERS.length, "a short pool stays short");
});

test("the curated list names each company once", () => {
  /* A duplicate is invisible in review and unmissable on the page: the ribbon
     is a loop, so the same cell twice reads as the loop having gone wrong. */
  assert.equal(new Set(POPULAR_TICKERS).size, POPULAR_TICKERS.length);
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

test("breadth counts both directions and holds flat names in their own bucket", () => {
  const b = breadth([{ chg: 1.2 }, { chg: 0 }, { chg: -0.4 }, { chg: 0 }, { chg: 3 }]);
  assert.deepEqual(b, { total: 5, up: 2, down: 1, flat: 2, unreported: 0 });
});

test("breadth reads a swept row as readily as a rendered quote", () => {
  const b = breadth([row({ chg: 2 }), row({ chg: -2 }), row({ chg: 0 })]);
  assert.deepEqual(b, { total: 3, up: 1, down: 1, flat: 1, unreported: 0 });
});

/* The bar used to print "163 rose" and "311 fell" under a total of 500, and the
   two never reconciled. The gap was every name the gateway priced but never
   sent a change for: toSweepRow lands those on chg 0, which is also what a
   genuinely unmoved name looks like. Counting them as flat is a lie about
   twenty-odd large caps a day — American Tower quoting one share — so they get
   their own bucket and the four numbers are made to add up. */
test("breadth separates a name that never reported from one that truly did not move", () => {
  const b = breadth([
    { chg: 1.5, chgKnown: true },
    { chg: 0, chgKnown: true },
    { chg: 0, chgKnown: false },
    { chg: -2, chgKnown: true },
  ]);
  assert.deepEqual(b, { total: 4, up: 1, down: 1, flat: 1, unreported: 1 });
});

test("breadth always reconciles: up + down + flat + unreported equals total", () => {
  const rows = [
    { chg: 3, chgKnown: true },
    { chg: -1, chgKnown: true },
    { chg: 0, chgKnown: true },
    { chg: 0, chgKnown: false },
    { chg: 0, chgKnown: false },
    { chg: 0.2, chgKnown: true },
  ];
  const b = breadth(rows);
  assert.equal(b.up + b.down + b.flat + b.unreported, b.total);
  assert.equal(b.total, rows.length);
});

/* A row with no chgKnown at all is a caller that predates the flag; treat it as
   reported rather than silently moving every legacy row into "unreported". */
test("breadth treats an absent chgKnown as reported", () => {
  const b = breadth([{ chg: 0 }, { chg: 1 }]);
  assert.deepEqual(b, { total: 2, up: 1, down: 0, flat: 1, unreported: 0 });
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

/* ------------------------------------------------------------------ */
/* Recency                                                             */
/* ------------------------------------------------------------------ */

/* Every board ranks on a quantity that means "today": chg is today's move,
   dollarVol is today's turnover, relVol is today's volume against a thirty-day
   average. A quote that stopped updating supplies a frozen "today", and a
   frozen extreme never decays — so it sorts to the top of a descending board
   and stays there.

   Observed live: Popular right now carried EA at 19.4x on a 28-day-old quote,
   Webster at 16.2x on 13 days, Stellar and Select Medical at 13.3x and 12.6x
   on 63 days. Four of the eight rows were fossils. Gainers carried RAAQ at
   +24.0% on a 62-day-old quote for the same reason.

   The floor already asks whether a company belongs on a board. This asks the
   separate question of whether the row still describes the session the board
   claims to be about. */

const SWEPT = Date.UTC(2026, 7, 21, 14, 35);
const DAY = 86_400_000;

test("a row quoted during the sweep's own session is current", () => {
  assert.equal(current(row({ asOf: SWEPT - 60_000 }), SWEPT), true);
});

test("a row quoted across a long weekend is still current", () => {
  assert.equal(current(row({ asOf: SWEPT - 3 * DAY }), SWEPT), true);
});

test("a row that stopped updating weeks ago is not current", () => {
  assert.equal(current(row({ asOf: SWEPT - 28 * DAY }), SWEPT), false);
  assert.equal(current(row({ asOf: SWEPT - 63 * DAY }), SWEPT), false);
});

/* Fails open, deliberately. The floor's own history records a filter built on
   a field that empties overnight taking every board with it. A feed that stops
   stamping must degrade to the behaviour we had before the stamp existed, not
   to a blank page. No row in the live universe is unstamped today. */
test("a row with no timestamp is not judged, and is not dropped", () => {
  assert.equal(current(row({ asOf: null }), SWEPT), true);
});

/* The four regressions, one per board. */
test("popular refuses a famous name whose quote stopped reporting", () => {
  /* Curation cannot rescue a fossil either. The ribbon prints a price beside
     every household name it carries, and a price 28 days dead under a logo
     the reader trusts is worse than the same price under one they do not. */
  const rows = [
    row({ s: POPULAR_TICKERS[0], asOf: SWEPT - 60_000 }),
    row({ s: POPULAR_TICKERS[1], asOf: SWEPT - 28 * DAY }),
  ];
  assert.deepEqual(symbols(popular(snapshot(rows))), [POPULAR_TICKERS[0]]);
});

test("gainers refuses a fossil however large its frozen move looks", () => {
  const rows = [
    row({ s: "FRESH", chg: 4, asOf: SWEPT - 60_000 }),
    row({ s: "FOSSIL", chg: 24, asOf: SWEPT - 62 * DAY }),
  ];
  assert.deepEqual(symbols(gainers(snapshot(rows))), ["FRESH"]);
});

test("losers refuses a fossil however large its frozen fall looks", () => {
  const rows = [
    row({ s: "FRESH", chg: -4, asOf: SWEPT - 60_000 }),
    row({ s: "FOSSIL", chg: -24, asOf: SWEPT - 62 * DAY }),
  ];
  assert.deepEqual(symbols(losers(snapshot(rows))), ["FRESH"]);
});

test("most active refuses a fossil however large its frozen turnover looks", () => {
  const rows = [
    row({ s: "FRESH", px: 100, vol: 1_000_000, asOf: SWEPT - 60_000 }),
    row({ s: "FOSSIL", px: 100, vol: 90_000_000, asOf: SWEPT - 40 * DAY }),
  ];
  assert.deepEqual(symbols(mostActive(snapshot(rows))), ["FRESH"]);
});

/* The floor report exists so a thin board is explainable. It already had to be
   corrected once for counting a row as eligible that every board refused to
   draw; a recency test that the report does not know about would reintroduce
   exactly that. */
test("the floor report accounts for the rows dropped as stale", () => {
  const rows = [
    row({ s: "FRESH", asOf: SWEPT - 60_000 }),
    row({ s: "FOSSIL", asOf: SWEPT - 30 * DAY }),
  ];
  const r = floorReport(snapshot(rows));
  assert.equal(r.droppedStale, 1);
  assert.equal(r.eligible, 1);
});
