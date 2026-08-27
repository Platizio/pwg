import { test } from "node:test";
import assert from "node:assert/strict";
import { breadthSample, INDEX_BASIS } from "../lib/market/membership.ts";
import type { Quote } from "../lib/market/session.ts";

/* No constituent list is entitled on this account, so index membership is an
   approximation. An approximation is defensible; presenting it as the index is
   not, and neither is letting funds into it. */

const q = (over: Partial<Quote> & { id: string }): Quote => ({
  name: over.id,
  mark: over.id[0],
  color: "#fff",
  price: 100,
  chg: 0,
  seed: 1,
  sector: "",
  covered: false,
  ...over,
});

test("funds are never counted as index members", () => {
  const universe = [
    q({ id: "SPY", name: "STATE STREET SPDR S&P 500 ETF" }),
    q({ id: "AAPL", name: "Apple" }),
    q({ id: "TQQQ", name: "PROSHARES ULTRAPRO QQQ" }),
    q({ id: "MSFT", name: "Microsoft" }),
  ];
  const caps = new Map([["SPY", 6e11], ["AAPL", 4e12], ["TQQQ", 2e10], ["MSFT", 3e12]]);

  const sample = breadthSample("SPX", universe, (id) => caps.get(id) ?? 0, () => "NYSE");

  assert.deepEqual(
    sample.members.map((m) => m.id),
    ["AAPL", "MSFT"],
    "an exchange-traded fund is not a constituent of the index it tracks",
  );
});

test("the Nasdaq sample takes only Nasdaq listings", () => {
  const universe = [q({ id: "AAPL", name: "Apple" }), q({ id: "JPM", name: "JPMorgan" })];
  const caps = new Map([["AAPL", 4e12], ["JPM", 7e11]]);
  const exchange = new Map([["AAPL", "NSDQ"], ["JPM", "NYSE"]]);

  const sample = breadthSample(
    "NDX",
    universe,
    (id) => caps.get(id) ?? 0,
    (id) => exchange.get(id) ?? "",
  );

  assert.deepEqual(sample.members.map((m) => m.id), ["AAPL"]);
});

test("the sample reports its own size and basis rather than the page hardcoding one", () => {
  const universe = [q({ id: "AAPL" }), q({ id: "MSFT" })];
  const sample = breadthSample("SPX", universe, () => 1e12, () => "NYSE");

  assert.equal(sample.size, sample.members.length);
  assert.equal(typeof sample.basis, "string");
  assert.ok(sample.basis.length > 0);
  assert.doesNotMatch(
    sample.basis,
    /companies in this index|constituents of/i,
    "the copy must not claim membership the data cannot support",
  );
});

test("every index declares a basis", () => {
  for (const id of ["SPX", "NDX", "RUT"] as const) {
    assert.ok(INDEX_BASIS[id], `${id} has no basis string`);
  }
});

test("an index view carries the sample's size and basis through to the card", async () => {
  const { toIndexView } = await import("../lib/api/normalize/index-proxy.ts");
  const etf = {
    symbol: "SPY",
    companyName: "STATE STREET SPDR S&P 500 ETF",
    lastPrice: 765.17,
    changePercent: 0.0034,
    closingPrice: 762.6,
  } as Parameters<typeof toIndexView>[1];

  const members = [q({ id: "AAPL", chg: 1 }), q({ id: "MSFT", chg: -1 })];
  const view = toIndexView("SPX", etf, { members, size: 2, basis: INDEX_BASIS.SPX });

  assert.ok(view);
  assert.equal(view.sample.size, 2);
  assert.equal(view.sample.basis, INDEX_BASIS.SPX);
  assert.equal(view.breadth.total, 2);
});
