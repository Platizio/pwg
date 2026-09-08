import assert from "node:assert/strict";
import test from "node:test";

import { marketImpactOf } from "../lib/api/normalize/market-impact.ts";

/* Does this story bear on the share price, or is it merely about the company?
 *
 * Two different questions, and the relevance scorers only answer the first.
 * Once they were working, Apple's rail read:
 *
 *   John Ternus takes helm as Apple eyes AI, foldable phones     <- yes
 *   How Much Is Apple's New CEO John Ternus Getting Paid?        <- yes
 *   Apple Maps Renames Lake Ontario To Lake America              <- no
 *
 * All three are genuinely about Apple. The third will not move the stock a
 * cent. The brief was "news that says why the stock is going up, down or
 * sideways", so aboutness is necessary and not sufficient.
 *
 * This is a WEIGHT, not a gate. Filtering trivia out entirely takes a quiet
 * name back to an empty rail — Tesla had already been there once — so the job
 * is to make the earnings story outrank the app update, and let trivia occupy
 * a slot only when nothing better exists.
 *
 * Fixtures are real headlines observed on the live rail.
 */

const impact = (title: string) => marketImpactOf({ title }).score;

/* ---------- the things that actually move a price ---------- */

test("earnings and results carry impact", () => {
  assert.ok(impact("Broadcom Needs Nvidia-Like Earnings to Stop $520 Billion Skid") > 0.6);
  assert.ok(impact("Apple beats Q3 revenue estimates as services grow") > 0.6);
  assert.ok(impact("Nvidia lifts full-year guidance") > 0.6);
});

test("analyst actions carry impact", () => {
  assert.ok(impact("Morgan Stanley upgrades Apple to overweight") > 0.6);
  assert.ok(impact("Apple price target raised to $290 at Wedbush") > 0.6);
  assert.ok(impact("Is Apple Stock a Buy Under John Ternus?") > 0.6);
});

test("leadership change carries impact", () => {
  assert.ok(impact("John Ternus takes helm as Apple eyes AI, foldable phones") > 0.6);
  assert.ok(impact("Tim Cook steps down as Apple CEO") > 0.6);
  assert.ok(impact("Apple Sets Pay Targets at $58 Million for Ternus") > 0.6);
});

test("deals, capital and legal trouble carry impact", () => {
  assert.ok(impact("Apple to acquire AI startup for $2 billion") > 0.6);
  assert.ok(impact("Apple announces $110 billion buyback") > 0.6);
  assert.ok(impact("EU fines Apple over App Store antitrust breach") > 0.6);
});

/* The plainest case of all: the headline states the move. */
test("a stated move in the shares carries impact", () => {
  assert.ok(impact("Apple shares slump 4% after guidance miss") > 0.6);
  assert.ok(impact("Tesla stock jumps on delivery beat") > 0.6);
});

/* ---------- the things that do not ---------- */

test("product trivia carries none", () => {
  assert.ok(impact("Apple Maps Renames Lake Ontario To Lake America, Joining Google") < 0.4);
  assert.ok(impact("Thatchers begins earliest apple harvest in 122-year history") < 0.4);
});

test("a feature update is not a market event", () => {
  assert.ok(impact("Tesla's Grok Now Does 116 Voice Commands, But Many Owners Are Locked Out") < 0.4);
  assert.ok(impact("Apple TV Surprises Subscribers With Fifteen Free Classic Movies") < 0.4);
});

test("a leak or a rumour is not a market event", () => {
  assert.ok(impact("Is this the iPhone 18 Ultra? Leaker claims to reveal Apple's foldable") < 0.4);
});

/* ---------- ordering is the whole point ---------- */

test("the earnings story outranks the app update", () => {
  assert.ok(
    impact("Broadcom Needs Nvidia-Like Earnings to Stop $520 Billion Skid") >
      impact("Tesla's Grok Now Does 116 Voice Commands"),
  );
});

test("the leadership change outranks the map trivia", () => {
  assert.ok(
    impact("John Ternus takes helm as Apple eyes AI, foldable phones") >
      impact("Apple Maps Renames Lake Ontario To Lake America"),
  );
});

/* A product LAUNCH event is somewhere between the two: it is a real corporate
   event a market prices, but it is not an earnings print. It must beat trivia
   without beating a results story. */
test("a launch event sits above trivia and below earnings", () => {
  const launch = impact("Tesla set to hold Cybercab event in Austin, Texas");
  assert.ok(launch > impact("Apple Maps Renames Lake Ontario To Lake America"));
  assert.ok(launch < impact("Apple beats Q3 revenue estimates as services grow"));
});

/* ---------- degenerate input ---------- */

test("an empty headline scores nothing and does not throw", () => {
  assert.equal(marketImpactOf({ title: "" }).score, 0);
  assert.equal(marketImpactOf({ title: "   " }).score, 0);
});

test("the score never leaves nought to one", () => {
  for (const t of [
    "Apple earnings guidance upgrade acquisition buyback lawsuit shares surge dividend",
    "a",
    "the the the",
  ]) {
    const s = marketImpactOf({ title: t }).score;
    assert.ok(Number.isFinite(s) && s >= 0 && s <= 1, `${t} -> ${s}`);
  }
});

test("the summary is read when the headline is thin", () => {
  const bare = marketImpactOf({ title: "Apple update" }).score;
  const withBody = marketImpactOf({
    title: "Apple update",
    summary: "The company raised its full-year guidance and announced a buyback.",
  }).score;
  assert.ok(withBody > bare);
});

test("each verdict names the kind of event, for the rail to label", () => {
  assert.equal(marketImpactOf({ title: "Apple beats Q3 revenue estimates" }).kind, "earnings");
  assert.equal(marketImpactOf({ title: "Tim Cook steps down as Apple CEO" }).kind, "leadership");
  assert.equal(marketImpactOf({ title: "Apple Maps renames a lake" }).kind, "none");
});
