import test from "node:test";
import assert from "node:assert/strict";

/* A reader whose browser speaks en-IN or hi-IN. zoneLabel asks the locale for
   the zone's name, and those locales call India "IST" — where the chart's rule
   is that its clocks are labelled "India Time". Installed before the module
   under test builds any formatter, so every one it builds inherits it. */
const Real = Intl.DateTimeFormat;
class InIndia extends Real {
  constructor(locales?: string | string[], options?: Intl.DateTimeFormatOptions) {
    super(locales ?? "en-IN", options);
  }
}
(Intl as { DateTimeFormat: unknown }).DateTimeFormat = InIndia;

const { emptyChartText, viewShowsAll, zoneLabel } = await import("../lib/market/ranges.ts");

const SEP_24 = Date.parse("2026-09-24T14:00:00Z");

test("an Indian browser's chart clock is labelled India Time, not IST", () => {
  assert.equal(new Intl.DateTimeFormat().resolvedOptions().locale, "en-IN", "the stand-in is installed");
  assert.equal(zoneLabel("Asia/Kolkata", SEP_24), "India Time");
  assert.equal(zoneLabel("Asia/Calcutta", SEP_24), "India Time");
});

/* ---------- what an empty chart says ---------- */

test("an empty chart says it is loading while it is", () => {
  assert.equal(emptyChartText("5Y", "loading", null), "Loading five years…");
  assert.equal(emptyChartText("1D", "loading", "This session's trades load with the chart."), "Loading the day…");
});

test("and that it failed, when it did, rather than that nothing exists", () => {
  const failed = emptyChartText("5Y", "failed", null);
  assert.doesNotMatch(failed, /No price history/);
  assert.match(failed, /could not be loaded/i);
  assert.match(failed, /again/i);
});

test("an answer with nothing in it keeps the sentences it had", () => {
  assert.equal(emptyChartText("5Y", "empty", null), "No price history is available for this stock.");
  assert.equal(emptyChartText("5Y", "ready", null), "No price history is available for this stock.");
  assert.equal(emptyChartText("1D", "empty", "The market is closed."), "The market is closed.");
  assert.equal(emptyChartText("1D", undefined, null), "No trades yet this session.");
});

/* ---------- whether a new point may refit the view ---------- */

test("a view showing every point is refitted when one joins; a zoomed one is left alone", () => {
  assert.equal(viewShowsAll(null, 0), true, "nothing drawn yet");
  assert.equal(viewShowsAll({ from: 0, to: 391 }, 390), true, "fitted, with the right offset");
  assert.equal(viewShowsAll({ from: -0.3, to: 389.2 }, 390), true);
  assert.equal(viewShowsAll({ from: 2900, to: 3276 }, 3276), false, "zoomed into the last month of a year");
  assert.equal(viewShowsAll({ from: 0, to: 300 }, 3276), false, "zoomed into the first months");
});
