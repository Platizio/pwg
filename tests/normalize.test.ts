import { test } from "node:test";
import assert from "node:assert/strict";
import { toIndexView } from "../lib/api/normalize/index-proxy.ts";
import { toQuote, toQuotes } from "../lib/api/normalize/quote.ts";
import { toSectorGroups } from "../lib/api/normalize/sector.ts";
import { INDEX_PROXY, SECTOR_ETF, SECTOR_NAMES } from "../lib/market/universe.ts";
import type { RawEquityQuote } from "@/lib/api/clients/quotes";
import type { SweepRow } from "@/lib/api/sweep";
import type { Quote } from "@/lib/market/session";
import type { SectorName } from "@/lib/market/universe";

/* The normalizers, and the seam they sit on.

   Every number on the home page passes through here, and the one mistake that
   cannot be seen by reading the page is a factor of a hundred. The gateway
   reports a day move as a FRACTION; sweep.ts already multiplies it on its way
   into SweepRow.chg. So a normalizer taking a SweepRow must not multiply, and
   a normalizer taking a raw quote must — and either error renders a plausible
   page made of wrong numbers, since -1.49 and -149 are both just text.

   The first two tests are that guard rail. The rest cover what the callers
   depend on: the disclosure note that admits the level is a fund's price, and
   the null the index tab degrades on. */

/* Optional in, because the figures worth checking closely — turnover, weight —
   are the ones Quote and Sector leave optional. */
const close = (actual: number | undefined, expected: number, tol = 1e-9): void => {
  assert.ok(actual !== undefined, `expected about ${expected}, got nothing`);
  assert.ok(
    Math.abs(actual - expected) <= tol,
    `expected about ${expected}, got ${actual}`,
  );
};

function row(over: Partial<SweepRow> = {}): SweepRow {
  return {
    s: "AAPL",
    name: "APPLE INC",
    px: 311.56,
    // A percent already: toSweepRow multiplied the gateway's fraction.
    chg: -1.49,
    chgKnown: true,
    vol: 42_000_000,
    avgVol: 50_000_000,
    dollarVol: 13_085_520_000,
    relVol: 0.84,
    mcap: 4_623_870_000_000,
    pe: 32.1,
    ex: "NSDQ",
    asOf: 1_755_800_000_000,
    delayed: true,
    ...over,
  };
}

function raw(over: Partial<RawEquityQuote> = {}): RawEquityQuote {
  return {
    symbol: "SPY",
    companyName: "STATE STREET SPDR S&P 500 ETF",
    changePercent: null,
    change: null,
    lastPrice: null,
    closingPrice: null,
    yesterdayClose: null,
    openingPrice: null,
    dayHigh: null,
    dayLow: null,
    volume: null,
    averageVolume30: null,
    marketCap: null,
    priceEarningRatio: null,
    dividendYield: null,
    trailing12MonthsEps: null,
    high52week: null,
    low52week: null,
    beta: null,
    exchange: "NYSE",
    currency: "USD",
    isin: null,
    cusip: null,
    delayed: true,
    source: "Delay",
    updateTime: null,
    notFound: false,
    notPermissioned: false,
    ...over,
  };
}

const member = (s: string, chg: number, turnoverM = 0): Quote =>
  toQuote(row({ s, name: `${s} INC`, chg, dollarVol: turnoverM * 1e6 }), null);

/* ------------------------------------------------------------------ */
/* The percent seam                                                    */
/* ------------------------------------------------------------------ */

/** The breadth sample wrapper toIndexView now takes. */
const sample = (members: Quote[]) => ({
  members,
  size: members.length,
  basis: "the largest US companies this terminal quotes, by market value",
});

test("toQuote does not multiply a swept row's change a second time", () => {
  const q = toQuote(row({ chg: -1.49 }), "Information technology");
  assert.equal(q.chg, -1.49);
});

test("toIndexView turns a raw quote's fraction into a percent", () => {
  const view = toIndexView("SPX", raw({ lastPrice: 612.4, changePercent: -0.01492914 }), sample([]));
  assert.ok(view);
  close(view.index.chg, -1.492914);
});

test("toSectorGroups turns a raw quote's fraction into a percent", () => {
  const groups = toSectorGroups({
    etfQuotes: [raw({ symbol: SECTOR_ETF.Energy, changePercent: 0.021 })],
    weekByEtf: new Map(),
    membersBySector: new Map(),
  });
  const energy = groups.find((g) => g.name === "Energy");
  assert.ok(energy);
  assert.notEqual(energy.day, null, "a fund that quoted must produce a figure");
  close(energy.day ?? undefined, 2.1, 1e-12);
});

test("a sector whose fund did not quote reports no figure, not a flat day", () => {
  /* The regression this pins: `?? 0` on the fund's changePercent turned a fund
     that never answered into a green "+0.00%" on the card and on the sector
     page, under prose asserting it was that fund's move. Zero is a real flat
     day; absence is not, and the two cannot share a value.

     Passing no ETF quotes is exactly the shape of an upstream timeout or 502,
     which lib/api/errors.ts is built to make routine. */
  const groups = toSectorGroups({
    etfQuotes: [],
    weekByEtf: new Map(),
    membersBySector: new Map(),
  });
  const energy = groups.find((g) => g.name === "Energy");
  assert.ok(energy);
  assert.equal(energy.day, null, "an unquoted fund must not read as 0.00%");
});

test("an unpriced sector sorts below every priced one", () => {
  /* It used to rank as flat, which placed a sector nobody could measure in the
     middle of the strip among sectors that had actually been measured. */
  const groups = toSectorGroups({
    etfQuotes: [raw({ symbol: SECTOR_ETF.Energy, changePercent: -0.03 })],
    weekByEtf: new Map(),
    membersBySector: new Map(),
  });
  const energyAt = groups.findIndex((g) => g.name === "Energy");
  const unpriced = groups.filter((g) => g.day === null);
  assert.ok(unpriced.length > 0, "fixture should leave most sectors unpriced");
  assert.ok(
    groups.slice(0, energyAt).every((g) => g.day !== null),
    "a sector with no figure sorted above the one sector that had one",
  );
});

/* ------------------------------------------------------------------ */
/* toQuote                                                             */
/* ------------------------------------------------------------------ */

test("toQuote carries the figures a seeded quote could only approximate", () => {
  const q = toQuote(row({ dollarVol: 13_085_520_000, relVol: 3.2 }), "Information technology");
  close(q.turnoverM, 13_085.52, 1e-6);
  assert.equal(q.relVol, 3.2);
  assert.equal(q.volume, 42_000_000);
  assert.equal(q.price, 311.56);
  assert.equal(q.delayed, true);
  assert.equal(q.asOf, 1_755_800_000_000);
});

test("toQuote takes name, mark and colour from presentation()", () => {
  const seeded = toQuote(row({ s: "AAPL", name: "APPLE INC" }), "Information technology");
  assert.equal(seeded.id, "AAPL");
  assert.equal(seeded.name, "Apple");
  assert.equal(seeded.mark, "A");
  assert.equal(seeded.color, "#E5DDD1");
  assert.equal(seeded.covered, true);

  // Uncurated names still render: a derived monogram and a palette colour.
  const derived = toQuote(row({ s: "ZWDG", name: "ZETA WIDGETS INC" }), null);
  assert.equal(derived.name, "Zeta Widgets");
  assert.equal(derived.mark, "Z");
  assert.match(derived.color, /^#[0-9A-F]{6}$/i);
  assert.equal(derived.covered, false);
});

test("toQuote leaves an unclassified sector empty rather than guessing", () => {
  assert.equal(toQuote(row(), null).sector, "");
});

test("toQuotes looks the sector up per symbol", () => {
  const sectors = new Map([["AAPL", "Information technology"], ["XOM", "Energy"]]);
  const quotes = toQuotes(
    [row({ s: "AAPL" }), row({ s: "XOM" }), row({ s: "ZWDG" })],
    (t) => sectors.get(t) ?? null,
  );
  assert.deepEqual(
    quotes.map((q) => q.sector),
    ["Information technology", "Energy", ""],
  );
});

/* ------------------------------------------------------------------ */
/* toIndexView                                                         */
/* ------------------------------------------------------------------ */

test("toIndexView degrades to null when the ETF quote is missing", () => {
  assert.equal(toIndexView("SPX", undefined, sample([])), null);
});

test("toIndexView degrades to null when the ETF quote carries no price", () => {
  assert.equal(toIndexView("NDX", raw({ symbol: "QQQ", changePercent: 0.004 }), sample([])), null);
  // Zero is the gateway saying "no trade", not a fund that is worth nothing.
  assert.equal(toIndexView("NDX", raw({ symbol: "QQQ", lastPrice: 0 }), sample([])), null);
});

test("toIndexView falls back to the closing price when there is no last price", () => {
  const view = toIndexView("RUT", raw({ symbol: "IWM", closingPrice: 231.08 }), sample([]));
  assert.ok(view);
  assert.equal(view.index.level, 231.08);
});

test("toIndexView copies the proxy note verbatim", () => {
  for (const id of ["SPX", "NDX", "RUT"] as const) {
    const view = toIndexView(id, raw({ symbol: INDEX_PROXY[id].etf, lastPrice: 100 }), sample([]));
    assert.ok(view);
    /* The note is the disclosure that the level is the fund's share price and
       not the index. Paraphrasing it here would make the page misstate what it
       is showing. */
    assert.equal(view.index.note, INDEX_PROXY[id].note);
    assert.equal(view.index.name, INDEX_PROXY[id].name);
    assert.equal(view.index.short, INDEX_PROXY[id].short);
    assert.equal(view.index.id, id);
  }
});

test("toIndexView reads breadth, leaders and laggards from the members", () => {
  const members = [member("AAA", 3.1), member("BBB", -2.4), member("CCC", 0), member("DDD", 1.2)];
  const view = toIndexView("SPX", raw({ lastPrice: 612.4 }), sample(members));
  assert.ok(view);
  assert.deepEqual(view.breadth, { total: 4, up: 2, down: 1, flat: 1, unreported: 0 });
  assert.deepEqual(view.leaders.map((q) => q.id), ["AAA", "DDD", "CCC"]);
  assert.deepEqual(view.laggards.map((q) => q.id), ["BBB", "CCC", "DDD"]);
  // The caller's array is not the normalizer's to reorder.
  assert.deepEqual(members.map((q) => q.id), ["AAA", "BBB", "CCC", "DDD"]);
});

/* ------------------------------------------------------------------ */
/* toSectorGroups                                                      */
/* ------------------------------------------------------------------ */

test("toSectorGroups returns all eleven sectors, strongest day first", () => {
  const groups = toSectorGroups({
    etfQuotes: [
      raw({ symbol: SECTOR_ETF.Energy, changePercent: 0.021 }),
      raw({ symbol: SECTOR_ETF["Information technology"], changePercent: -0.0149 }),
      raw({ symbol: SECTOR_ETF.Utilities, changePercent: 0.005 }),
    ],
    weekByEtf: new Map([[SECTOR_ETF.Energy, 3.4]]),
    membersBySector: new Map(),
  });

  assert.equal(groups.length, SECTOR_NAMES.length);
  assert.deepEqual([...groups].map((g) => g.name).sort(), [...SECTOR_NAMES].sort());
  assert.equal(groups[0].name, "Energy");
  /* Only three of the eleven are quoted here. Information technology is the
     weakest of those three, so it is the last sector with a figure — the eight
     that never quoted follow it.

     This assertion used to read `groups.at(-1) === "Information technology"`,
     which was only true because the eight unquoted sectors were being given a
     fabricated 0.00% that sorted them above a real −1.49%. The old expectation
     was pinning that bug in place. */
  const priced_ = groups.filter((g) => g.day !== null);
  assert.equal(priced_.length, 3, "only three funds quoted in this fixture");
  assert.equal(priced_.at(-1)?.name, "Information technology");
  assert.equal(groups.at(-1)?.day, null, "an unquoted sector belongs at the end");
  /* Descending among the sectors that have a figure, with any unpriced sector
     after all of them — absence is not a rank. */
  const priced = groups.filter((g) => g.day !== null);
  for (let i = 1; i < priced.length; i += 1) {
    assert.ok(
      (priced[i - 1].day ?? 0) >= (priced[i].day ?? 0),
      "sectors are not in descending day order",
    );
  }
  const firstUnpriced = groups.findIndex((g) => g.day === null);
  if (firstUnpriced !== -1) {
    assert.ok(
      groups.slice(firstUnpriced).every((g) => g.day === null),
      "an unpriced sector must not sort above a priced one",
    );
  }
  assert.equal(groups[0].week, 3.4);
});

test("toSectorGroups weights sum to a hundred across sectors", () => {
  const membersBySector = new Map<SectorName, Quote[]>([
    ["Information technology", [member("AAA", 1.1, 400), member("BBB", -2.2, 200)]],
    ["Energy", [member("CCC", 0.4, 300)]],
    ["Utilities", [member("DDD", -0.1, 100)]],
  ]);

  const groups = toSectorGroups({ etfQuotes: [], weekByEtf: new Map(), membersBySector });
  const byName = new Map(groups.map((g) => [g.name, g]));

  close(
    groups.reduce((sum, g) => sum + g.weight, 0),
    100,
    1e-9,
  );
  close(byName.get("Information technology")?.weight, 60, 1e-9);
  close(byName.get("Energy")?.weight, 30, 1e-9);
  assert.equal(byName.get("Materials")?.weight, 0);

  // Four names fit on a card: the four that moved, not the first four given.
  assert.deepEqual(
    byName.get("Information technology")?.members.map((q) => q.id),
    ["BBB", "AAA"],
  );
  assert.equal(byName.get("Information technology")?.total, 2);
});
