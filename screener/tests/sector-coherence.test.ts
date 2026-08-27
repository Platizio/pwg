import { test } from "node:test";
import assert from "node:assert/strict";
import { toSectorGroups } from "../lib/api/normalize/sector.ts";
import { SECTOR_ETF, type SectorName } from "../lib/market/universe.ts";
import type { RawEquityQuote } from "../lib/api/clients/quotes.ts";
import type { Quote } from "../lib/market/session.ts";

/* A sector card shows a percentage taken from the sector fund and, underneath,
   member companies drawn from the swept universe. They are different measures
   of the same thing and they routinely disagree. The card must be able to say
   so rather than leaving a reader to reconcile them. */

const etf = (symbol: string, fraction: number) =>
  ({ symbol, changePercent: fraction, lastPrice: 100 }) as RawEquityQuote;

const member = (id: string, chg: number, turnoverM: number): Quote => ({
  id,
  name: id,
  mark: id[0],
  color: "#fff",
  price: 100,
  chg,
  seed: 1,
  sector: "",
  covered: false,
  turnoverM,
});

const allEtfs = (Object.values(SECTOR_ETF) as string[]).map((s) => etf(s, 0));

function groupFor(name: SectorName, members: Quote[]) {
  const quotes = allEtfs.map((q) => (q.symbol === SECTOR_ETF[name] ? etf(q.symbol, 0.0038) : q));
  const map = new Map<SectorName, Quote[]>([[name, members]]);
  return toSectorGroups({ etfQuotes: quotes, weekByEtf: new Map(), membersBySector: map }).find(
    (g) => g.name === name,
  )!;
}

test("a sector reports its members' own move alongside the fund's", () => {
  const g = groupFor("Industrials", [
    member("BIG", 1, 900),
    member("SMALL", -30, 1),
  ]);

  assert.ok(Math.abs(g.day - 0.38) < 0.001, `fund move should lead: ${g.day}`);
  assert.equal(typeof g.membersChg, "number");
  /* Turnover-weighted, not a plain mean: a plain average of +1 and -30 is
     -14.5, which lets a name trading a million dollars outvote one trading
     nine hundred. */
  assert.ok(g.membersChg > 0.5, `expected a weighted move near +1, got ${g.membersChg}`);
});

test("a sector explains where its headline figure comes from", () => {
  const g = groupFor("Financials", [member("AAA", 2, 100)]);
  assert.equal(typeof g.basis, "string");
  assert.ok(g.basis.length > 0);
  assert.match(g.basis, /fund/i, "the note must name the fund as the source of the headline");
});

test("the members shown are the sector's liquid names, not its loudest microcap", () => {
  const members = [
    member("SHELL", 40, 0.4),
    member("BIGA", 3, 900),
    member("BIGB", -4, 800),
    member("BIGC", 2, 700),
    member("BIGD", -1.5, 600),
    member("BIGE", 1.2, 500),
  ];
  const g = groupFor("Information technology", members);
  const shown = g.members.slice(0, 4).map((m) => m.id);

  assert.ok(!shown.includes("SHELL"), `a near-untraded name led the card: ${shown.join(", ")}`);
  assert.equal(g.total, members.length, "the count still reflects every member");
});
