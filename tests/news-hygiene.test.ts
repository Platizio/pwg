import assert from "node:assert/strict";
import test from "node:test";

import { SOURCE_CAP, capPerSource, dedupeByTitle, titleKey } from "../lib/api/normalize/news-hygiene.ts";

/* Two things the feed does that no relevance score can fix.
 *
 * SYNDICATION. The same story runs under three mastheads. The API has its own
 * `isDuplicateFilter: "skipDuplicates"` and it is switched on, but it does not
 * catch cross-publisher copies. Observed in a single live page for AAPL:
 *
 *   "Apple changes name of Lake Ontario to Lake America for U.S. users"  Yahoo
 *   "Apple changes name of Lake Ontario to Lake America for U.S. users"  UPI
 *   "With Tim Cook's Era Ending, Is Apple Stock a Buy Under John Ternus?" NASDAQ
 *   "With Tim Cook's Era Ending, Is Apple Stock a Buy Under John Ternus?" Yahoo! Finance
 *
 * Four of ten slots, two stories. A rail of three would have shown one story
 * twice.
 *
 * CONCENTRATION. Every one of the gateway's three AAPL headlines came from The
 * Motley Fool. One publisher's editorial line is not the market's.
 */

const item = (title: string, source: string, id = title + source) => ({ id, title, source });

test("the same headline under two mastheads is one story", () => {
  const kept = dedupeByTitle([
    item("Apple changes name of Lake Ontario to Lake America for U.S. users", "Yahoo"),
    item("Apple changes name of Lake Ontario to Lake America for U.S. users", "UPI"),
    item("Apple Sets Pay Targets at $58 Million for Ternus", "Deccan Chronicle"),
  ]);
  assert.equal(kept.length, 2);
  assert.equal(kept[0]?.source, "Yahoo", "the first copy seen wins");
});

/* Punctuation, case and spacing differ between mastheads carrying one wire
   story, so the key has to survive all three. */
test("a headline is the same story through punctuation and case", () => {
  assert.equal(
    titleKey("With Tim Cook's Era Ending, Is Apple Stock a Buy Under John Ternus?"),
    titleKey("With Tim Cooks Era Ending  Is Apple Stock a Buy Under John Ternus"),
  );
  assert.equal(titleKey("Apple  Sets   Pay"), titleKey("apple sets pay"));
});

test("two genuinely different headlines are two stories", () => {
  assert.notEqual(
    titleKey("Apple Sets Pay Targets at $58 Million for Ternus"),
    titleKey("Apple Mac mini price hike: Is the M6 upgrade even worth it?"),
  );
});

/* A trailing masthead is what makes one publisher's copy look distinct. */
test("a publisher's own suffix does not make a copy look original", () => {
  const kept = dedupeByTitle([
    item("Apple's New CEO Hypes Product Launch in First Employee Address", "PYMNTS"),
    item("Apple's New CEO Hypes Product Launch in First Employee Address | PYMNTS.com", "PYMNTS.com"),
  ]);
  assert.equal(kept.length, 1);
});

test("an empty or missing headline is dropped rather than collapsing everything", () => {
  const kept = dedupeByTitle([item("", "A"), item("   ", "B"), item("Real headline", "C")]);
  assert.deepEqual(kept.map((k) => k.source), ["C"]);
});

/* ---------- concentration ---------- */

test("no single publisher may fill the rail", () => {
  const kept = capPerSource([
    item("one", "The Motley Fool"),
    item("two", "The Motley Fool"),
    item("three", "The Motley Fool"),
    item("four", "Reuters"),
  ]);
  assert.equal(kept.filter((k) => k.source === "The Motley Fool").length, SOURCE_CAP);
  assert.equal(kept.filter((k) => k.source === "Reuters").length, 1);
});

test("the cap keeps the earliest items, so a relevance-sorted list keeps its best", () => {
  const kept = capPerSource([
    item("best", "Fool"),
    item("second", "Fool"),
    item("worst", "Fool"),
  ]);
  assert.deepEqual(kept.map((k) => k.title), ["best", "second"]);
});

test("publishers are matched regardless of case and spacing", () => {
  const kept = capPerSource([
    item("a", "The Motley Fool"),
    item("b", "the motley fool"),
    item("c", "  The Motley Fool  "),
  ]);
  assert.equal(kept.length, SOURCE_CAP);
});

test("items with no publisher are not all treated as one publisher", () => {
  const kept = capPerSource([item("a", ""), item("b", ""), item("c", "")]);
  assert.equal(kept.length, 3, "an unknown source is not evidence of concentration");
});

test("neither pass throws on an empty list", () => {
  assert.deepEqual(dedupeByTitle([]), []);
  assert.deepEqual(capPerSource([]), []);
});
