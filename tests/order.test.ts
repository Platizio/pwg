import { test } from "node:test";
import assert from "node:assert/strict";
import {
  executionPrice,
  formatShares,
  parseMoney,
  resolveOrder,
  validateOrder,
  type OrderDraft,
} from "../lib/market/order.ts";

/* The ticket lets a reader enter either side of `shares × price = amount` and
   derives the other. Every figure it prints — the approximate quantity, the
   order value, the button — comes out of these functions, and so does the
   fill. They are the one place the two can disagree, so they are tested
   rather than trusted. */

const draft = (over: Partial<OrderDraft> = {}): OrderDraft => ({
  side: "buy",
  type: "Market",
  mode: "amount",
  amount: "",
  shares: "",
  trigger: "",
  price: 310.66,
  ...over,
});

test("a market order executes at the last traded price", () => {
  assert.equal(executionPrice(draft()), 310.66);
});

test("a limit or stop order executes at the price the reader set, not the last trade", () => {
  assert.equal(executionPrice(draft({ type: "Limit", trigger: "300" })), 300);
  assert.equal(executionPrice(draft({ type: "Stop", trigger: "250.5" })), 250.5);
});

test("a limit or stop order with no trigger yet has no execution price", () => {
  assert.equal(executionPrice(draft({ type: "Limit" })), null);
  assert.equal(executionPrice(draft({ type: "Stop", trigger: "  " })), null);
});

test("an amount buys a fractional quantity", () => {
  const r = resolveOrder(draft({ mode: "amount", amount: "500" }));
  assert.equal(r.amount, 500);
  /* 500 / 310.66 — the whole point of fractional shares. */
  assert.ok(Math.abs(r.shares - 1.6095) < 0.0001, `got ${r.shares}`);
});

test("a quantity costs what the quantity is worth", () => {
  const r = resolveOrder(draft({ mode: "shares", shares: "2.5" }));
  assert.equal(r.shares, 2.5);
  assert.ok(Math.abs(r.amount - 776.65) < 0.005, `got ${r.amount}`);
});

test("the derived side of a limit order uses the limit price", () => {
  const r = resolveOrder(draft({ mode: "amount", amount: "600", type: "Limit", trigger: "300" }));
  assert.equal(r.shares, 2, "600 at a 300 limit is two shares, not 600/310.66");
});

test("an empty or unpriceable draft resolves to nothing rather than NaN", () => {
  for (const d of [
    draft(),
    draft({ mode: "shares" }),
    draft({ mode: "amount", amount: "500", price: 0 }),
    draft({ mode: "amount", amount: "500", type: "Limit" }),
    draft({ mode: "amount", amount: "abc" }),
  ]) {
    const r = resolveOrder(d);
    assert.equal(r.shares, 0);
    assert.equal(r.amount, 0);
  }
});

test("money parses what a reader actually types", () => {
  assert.equal(parseMoney("1,250.50"), 1250.5);
  assert.equal(parseMoney("$40"), 40);
  assert.equal(parseMoney(" 0.5 "), 0.5);
  assert.equal(parseMoney(""), null);
  assert.equal(parseMoney("-20"), null, "a negative order is not an order");
  assert.equal(parseMoney("abc"), null);
});

test("a buy is refused above buying power and allowed at it", () => {
  const over = validateOrder(draft({ mode: "amount", amount: "600" }), { cash: 500, held: 0 });
  assert.equal(over.ok, false);
  assert.match(over.ok ? "" : over.reason, /buying power/i);

  const exact = validateOrder(draft({ mode: "amount", amount: "500" }), { cash: 500, held: 0 });
  assert.equal(exact.ok, true, "spending the last dollar is allowed");
});

test("a sell is refused above the holding, including a fractional one", () => {
  const none = validateOrder(draft({ side: "sell", mode: "shares", shares: "1" }), { cash: 0, held: 0 });
  assert.equal(none.ok, false);
  assert.match(none.ok ? "" : none.reason, /hold no/i);

  const some = validateOrder(draft({ side: "sell", mode: "shares", shares: "2.5" }), { cash: 0, held: 1.5 });
  assert.equal(some.ok, false);
  assert.match(some.ok ? "" : some.reason, /1\.5/);

  const fine = validateOrder(draft({ side: "sell", mode: "shares", shares: "1.5" }), { cash: 0, held: 1.5 });
  assert.equal(fine.ok, true, "selling the whole fractional holding is allowed");
});

test("an order with nothing entered names what is missing", () => {
  const empty = validateOrder(draft(), { cash: 1e6, held: 0 });
  assert.equal(empty.ok, false);
  assert.match(empty.ok ? "" : empty.reason, /amount/i);

  const noTrigger = validateOrder(
    draft({ mode: "amount", amount: "500", type: "Limit" }),
    { cash: 1e6, held: 0 },
  );
  assert.equal(noTrigger.ok, false);
  assert.match(noTrigger.ok ? "" : noTrigger.reason, /limit price/i);

  const noStop = validateOrder(
    draft({ mode: "amount", amount: "500", type: "Stop" }),
    { cash: 1e6, held: 0 },
  );
  assert.match(noStop.ok ? "" : noStop.reason, /stop price/i);
});

test("a quantity is shown to the precision it was bought at, without trailing noise", () => {
  assert.equal(formatShares(5), "5");
  assert.equal(formatShares(1.6095), "1.6095");
  assert.equal(formatShares(1.5), "1.5");
  assert.equal(formatShares(0.00004), "0.0001", "a sliver still reads as more than nothing");
  assert.equal(formatShares(0), "0");
  assert.equal(formatShares(1234.5), "1,234.5");
});
