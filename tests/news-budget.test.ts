import assert from "node:assert/strict";
import test from "node:test";

import { BUDGET_FLOOR, budgetExhausted, remainingTokens } from "../lib/api/clients/news.ts";

/* The stop that never stopped.
 *
 * newsapi.ai bills against a hard, non-renewable lifetime allowance. The client
 * has always carried a floor meant to stop spending before the wall:
 *
 *     if (budget.ok && budget.data.availableTokens < BUDGET_FLOOR) …
 *
 * `availableTokens` is the plan's CAP, not the remainder. Measured live it
 * reads 2000 while `usedTokens` reads 15 — so the comparison is 2000 < 100,
 * which is false, and stays false at 1999 used. The guard could never fire and
 * the account would have run to zero without a word.
 *
 * It went unnoticed because nothing spent the budget: the rail was served by
 * the gateway's own ticker_news and this module was dormant. It stops being
 * theoretical the moment a per-stock query starts spending on every ticker.
 */

const budget = (used: number, cap = 2000) => ({ availableTokens: cap, usedTokens: used });

test("what is left is the cap minus what was spent, not the cap", () => {
  assert.equal(remainingTokens(budget(15)), 1985);
  assert.equal(remainingTokens(budget(0)), 2000);
  assert.equal(remainingTokens(budget(2000)), 0);
});

/* The regression, stated directly: a nearly spent account must trip the floor.
   Under the old comparison this case read 2000 < 100 and sailed through. */
test("an account down to its last few requests is exhausted", () => {
  assert.equal(budgetExhausted(budget(1950)), true, "50 left is below the floor");
  assert.equal(budgetExhausted(budget(2000)), true, "nothing left at all");
});

test("a healthy account is not exhausted", () => {
  assert.equal(budgetExhausted(budget(15)), false);
  assert.equal(budgetExhausted(budget(1000)), false);
});

test("the floor is the boundary, and sitting exactly on it still spends", () => {
  assert.equal(budgetExhausted(budget(2000 - BUDGET_FLOOR)), false, "exactly at the floor");
  assert.equal(budgetExhausted(budget(2000 - BUDGET_FLOOR + 1)), true, "one below it");
});

/* Fails closed. An unreadable balance against a non-renewable allowance is not
   permission to spend — the cost of being wrong is permanent, and the cost of
   being cautious is a rail that falls back to the gateway's own headlines. */
test("a balance we cannot read counts as exhausted", () => {
  for (const bad of [
    { availableTokens: Number.NaN, usedTokens: 15 },
    { availableTokens: 2000, usedTokens: Number.NaN },
    { availableTokens: null as unknown as number, usedTokens: 15 },
    { availableTokens: 2000, usedTokens: undefined as unknown as number },
  ]) {
    assert.equal(budgetExhausted(bad), true, JSON.stringify(bad));
  }
});

test("a used count above the cap does not produce a negative remainder", () => {
  assert.equal(remainingTokens(budget(2400)), 0);
  assert.equal(budgetExhausted(budget(2400)), true);
});
