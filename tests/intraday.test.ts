import { test } from "node:test";
import assert from "node:assert/strict";
import { parseFeedDate } from "../lib/api/normalize/time.ts";
import { toPricePoints } from "../lib/api/normalize/series.ts";

/* Two endpoints, two date formats.

   The daily history writes "MM/DD/YYYY HH:MM:SS EDT". The intraday endpoint
   writes ISO-8601 with an offset. parseFeedDate understands the first and
   refuses the second, which is correct — but it means one shared normalizer
   has to know which it is holding, and a silent null here would empty a chart
   rather than fail it. */

const DAILY = "08/21/2026 16:00:00 EDT";
const INTRA = "2026-08-24T04:00:00.000-0400";

test("the daily format parses and the intraday format is refused by parseFeedDate", () => {
  assert.equal(parseFeedDate(DAILY), Date.UTC(2026, 7, 21, 20, 0, 0));
  assert.equal(parseFeedDate(INTRA), null, "ISO must not be silently mis-parsed as a feed date");
});

test("both formats survive the shared normalizer", () => {
  const daily = toPricePoints([
    { date: DAILY, price: 309.69, opening: 312.05, high: 312.38, low: 307.01, volume: 46876815 },
  ]);
  assert.equal(daily.length, 1);
  assert.equal(daily[0].at, Date.UTC(2026, 7, 21, 20, 0, 0));
  assert.deepEqual(
    { o: daily[0].open, h: daily[0].high, l: daily[0].low, v: daily[0].volume },
    { o: 312.05, h: 312.38, l: 307.01, v: 46876815 },
    "the daily feed carries real OHLC and it must not be discarded",
  );

  const intra = toPricePoints([
    { date: INTRA, price: 309.45, opening: 309.45, high: 310.121, low: 309.095, volume: 7098 },
  ]);
  assert.equal(intra.length, 1);
  assert.equal(intra[0].at, Date.parse(INTRA));
  assert.equal(intra[0].high, 310.121);
});

test("rows the parser cannot date are dropped, not zeroed", () => {
  const pts = toPricePoints([
    { date: "not a date", price: 100, opening: 100, high: 100, low: 100, volume: 1 },
    { date: DAILY, price: 100, opening: 100, high: 100, low: 100, volume: 1 },
  ]);
  assert.equal(pts.length, 1);
});

test("a non-positive price is a data hole, not a valuation", () => {
  const pts = toPricePoints([
    { date: DAILY, price: 0, opening: 0, high: 0, low: 0, volume: 0 },
  ]);
  assert.equal(pts.length, 0);
});

test("points come out oldest first whatever order they arrived in", () => {
  const older = "08/19/2026 16:00:00 EDT";
  const pts = toPricePoints([
    { date: DAILY, price: 2, opening: 2, high: 2, low: 2, volume: 1 },
    { date: older, price: 1, opening: 1, high: 1, low: 1, volume: 1 },
  ]);
  assert.deepEqual(pts.map((p) => p.price), [1, 2]);
});
