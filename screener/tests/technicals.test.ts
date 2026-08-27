import { test } from "node:test";
import assert from "node:assert/strict";
import { toIndicator, toTechnicalRead } from "../lib/api/normalize/technicals.ts";
import type { RawIndicator } from "../lib/api/clients/technicals.ts";

/* Indicator order is the trap this file exists for.

   The gateway answers newest first; every chart in the terminal draws left to
   right from the oldest point. A series left in arrival order still renders a
   smooth, believable line — of the period running backwards — so the
   assertions below name the values they expect rather than checking the
   output against its own shape, which a flipped series satisfies just as
   well. */

const DAY = 86_400_000;
/** An arbitrary session close. The newest point of every fixture. */
const NEWEST = Date.UTC(2026, 7, 20, 20, 0, 0);

/** A fixture in the gateway's own order: values[0] is the newest reading. */
function newestFirst(values: readonly number[]): RawIndicator {
  return {
    results: { values: values.map((value, i) => ({ timestamp: NEWEST - i * DAY, value })) },
  };
}

/** The same readings the other way up, to prove the order is read and not assumed. */
function oldestFirst(values: readonly number[]): RawIndicator {
  const n = values.length - 1;
  return {
    results: { values: values.map((value, i) => ({ timestamp: NEWEST - (n - i) * DAY, value })) },
  };
}

/** What a failed or unentitled call leaves the normalizer to work with. */
const ABSENT: RawIndicator = {};

test("a series comes out oldest first, whatever order the gateway sent", () => {
  const { series } = toIndicator(newestFirst([44, 43, 42, 41]));
  assert.deepEqual(
    series,
    [
      { at: NEWEST - 3 * DAY, value: 41 },
      { at: NEWEST - 2 * DAY, value: 42 },
      { at: NEWEST - DAY, value: 43 },
      { at: NEWEST, value: 44 },
    ],
    "series left in arrival order — every chart drawn from it runs backwards",
  );
});

test("latest is the newest reading, not the first row", () => {
  assert.equal(toIndicator(newestFirst([68, 55, 31])).latest, 68);
});

test("an ascending payload is read, not reversed on faith", () => {
  const ascending = toIndicator(oldestFirst([41, 42, 43, 44]));
  assert.deepEqual(ascending, toIndicator(newestFirst([44, 43, 42, 41])));
  assert.equal(ascending.latest, 44);
});

test("an empty result yields no reading rather than a zero", () => {
  // A zero RSI is not "no RSI" — it reads as the most oversold a stock can be.
  for (const raw of [ABSENT, { results: {} }, { results: { values: [] } }]) {
    assert.deepEqual(toIndicator(raw), { latest: null, series: [] });
  }
});

test("a malformed point is dropped rather than poisoning the series", () => {
  const r = toIndicator({
    results: {
      values: [
        { timestamp: NEWEST, value: Number.NaN },
        { timestamp: NEWEST - DAY, value: 42 },
      ],
    },
  });
  assert.deepEqual(r.series, [{ at: NEWEST - DAY, value: 42 }]);
  assert.equal(r.latest, 42);
});

type ReadArgs = Parameters<typeof toTechnicalRead>[0];

/** A read with nothing in it, so each test states only what it is about. */
function read(over: Partial<ReadArgs> = {}) {
  return toTechnicalRead({
    rsi: ABSENT,
    sma: ABSENT,
    ema: ABSENT,
    price: null,
    low52: null,
    high52: null,
    ...over,
  });
}

test("range position places the last price between the year's extremes", () => {
  assert.equal(read({ price: 150, low52: 100, high52: 200 }).rangePosition, 50);
  assert.equal(read({ price: 100, low52: 100, high52: 200 }).rangePosition, 0);
  assert.equal(read({ price: 200, low52: 100, high52: 200 }).rangePosition, 100);
});

test("a price beyond the year's extremes is clamped to the ends", () => {
  // The 52-week figures come off the quote feed and lag the last trade, so a
  // new high arrives as a price above its own high.
  assert.equal(read({ price: 250, low52: 100, high52: 200 }).rangePosition, 100);
  assert.equal(read({ price: 50, low52: 100, high52: 200 }).rangePosition, 0);
});

test("range position is withheld when any of the three is missing", () => {
  assert.equal(read({ price: null, low52: 100, high52: 200 }).rangePosition, null);
  assert.equal(read({ price: 150, low52: null, high52: 200 }).rangePosition, null);
  assert.equal(read({ price: 150, low52: 100, high52: null }).rangePosition, null);
});

test("a flat or inverted year range yields nothing rather than a division", () => {
  assert.equal(read({ price: 100, low52: 100, high52: 100 }).rangePosition, null);
  assert.equal(read({ price: 95, low52: 100, high52: 90 }).rangePosition, null);
});

test("rsi state follows the conventional seventy and thirty", () => {
  assert.equal(read({ rsi: newestFirst([72]) }).rsiState, "overbought");
  assert.equal(read({ rsi: newestFirst([70]) }).rsiState, "overbought");
  assert.equal(read({ rsi: newestFirst([50]) }).rsiState, "neutral");
  assert.equal(read({ rsi: newestFirst([30]) }).rsiState, "oversold");
  assert.equal(read({ rsi: newestFirst([28]) }).rsiState, "oversold");
});

test("rsi state reads the newest value, not the oldest", () => {
  assert.equal(read({ rsi: newestFirst([75, 25, 25]) }).rsiState, "overbought");
});

test("no rsi means no state, and the rest of the read still stands", () => {
  const r = read({ price: 150, low52: 100, high52: 200 });
  assert.equal(r.rsiState, null);
  assert.equal(r.rsi.latest, null);
  assert.equal(r.rangePosition, 50);
});

test("all three indicators are normalized, each oldest first", () => {
  const r = read({
    rsi: newestFirst([60, 55]),
    sma: newestFirst([102, 101]),
    ema: newestFirst([103, 100]),
  });
  assert.deepEqual(r.rsi.series.map((p) => p.value), [55, 60]);
  assert.deepEqual(r.sma.series.map((p) => p.value), [101, 102]);
  assert.deepEqual(r.ema.series.map((p) => p.value), [100, 103]);
  assert.equal(r.sma.latest, 102);
  assert.equal(r.ema.latest, 103);
});
