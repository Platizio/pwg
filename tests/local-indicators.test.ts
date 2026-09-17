import test from "node:test";
import assert from "node:assert/strict";

import { indicatorsFromDaily } from "../lib/market/store/local-indicators.ts";
import { ema, rsi, sma } from "../lib/market/indicators.ts";
import { toTechnicalRead } from "../lib/api/normalize/technicals.ts";
import type { PricePoint } from "../lib/api/normalize/series.ts";

/* RSI, the fifty-day average and the twenty-day average, computed here rather
   than asked for.
 *
 * Three of the eleven gateway calls an instrument page's fan-out makes are
 * indicator calls, and all three are arithmetic over a series the store
 * already holds. Dropping them is worth about a quarter of that fan-out.
 *
 * The only thing that can go wrong is the shape. `toIndicator` reads
 * `results.values`, expects the gateway's newest-first order and epoch
 * milliseconds, and sorts before taking `latest` — so a series handed over in
 * the wrong order still produces a plausible number and a correct-looking
 * chart drawn backwards. Nothing about that announces itself, which is why
 * these tests run the real normaliser rather than inspecting the object.
 */

const DAY = 86_400_000;
const START = Date.UTC(2025, 0, 2, 21, 0, 0);

/** `count` daily bars, priced by `at`. */
function bars(count: number, priceAt: (i: number) => number): PricePoint[] {
  const out: PricePoint[] = [];
  for (let i = 0; i < count; i += 1) {
    const price = priceAt(i);
    out.push({
      at: START + i * DAY,
      price,
      open: price * 0.995,
      high: price * 1.01,
      low: price * 0.99,
      volume: 1_000_000 + i,
    });
  }
  return out;
}

/* Three hundred sessions: more than the fifty-day window needs, and long
   enough that a 200-day average would also have something to say. */
const RISING = bars(300, (i) => 100 + i * 0.4);
const FALLING = bars(300, (i) => 220 - i * 0.4);

const read = (daily: PricePoint[]) => {
  const { rsi: r, sma: s, ema: e } = indicatorsFromDaily(daily);
  return toTechnicalRead({ rsi: r, sma: s, ema: e, price: 220, low52: 100, high52: 240 });
};

test("the normaliser gets three readings it can actually use", () => {
  const t = read(RISING);
  for (const [name, indicator] of [["rsi", t.rsi], ["sma", t.sma], ["ema", t.ema]] as const) {
    assert.ok(indicator.latest !== null, `${name} has no latest reading`);
    assert.ok(Number.isFinite(indicator.latest), `${name} latest is not a number`);
    assert.ok(indicator.series.length > 1, `${name} has no series to draw`);
  }
});

/* The gateway sends its values newest first and every chart here draws oldest
   first, so `toIndicator` sorts. If these were handed over already ascending
   the sort would hide it — this checks the reading the panel prints is the
   one from the last bar, whichever way round it travelled. */
test("the latest reading belongs to the most recent bar", () => {
  const t = read(RISING);
  const last = RISING[RISING.length - 1].at;
  for (const [name, indicator] of [["rsi", t.rsi], ["sma", t.sma], ["ema", t.ema]] as const) {
    assert.equal(indicator.series[indicator.series.length - 1].at, last, `${name} ends elsewhere`);
  }
});

test("the readings are the ones lib/market/indicators.ts computes, unaltered", () => {
  const t = read(RISING);
  const tail = <T,>(xs: readonly T[]): T => xs[xs.length - 1];
  assert.equal(t.rsi.latest, tail(rsi(RISING, 14)).value);
  assert.equal(t.sma.latest, tail(sma(RISING, 50)).value);
  assert.equal(t.ema.latest, tail(ema(RISING, 20)).value);
});

/* Wilder's thresholds are vocabulary rather than a tuning knob, and the panel
   prints the word beside the number. A series that only rises is the textbook
   overbought case; one that only falls is the textbook oversold one. */
test("the RSI state reads the way the number does", () => {
  const up = read(RISING);
  assert.ok(up.rsi.latest !== null && up.rsi.latest >= 70, `expected a high RSI, got ${up.rsi.latest}`);
  assert.equal(up.rsiState, "overbought");

  const down = read(FALLING);
  assert.ok(
    down.rsi.latest !== null && down.rsi.latest <= 30,
    `expected a low RSI, got ${down.rsi.latest}`,
  );
  assert.equal(down.rsiState, "oversold");
});

/* A name on its second week has no fifty-day average, and inventing one from
   eleven bars would put a line on the chart that means nothing. The normaliser
   already renders the absence; this only has to hand it an honest emptiness. */
test("a series too short for a window yields no reading rather than a guess", () => {
  const t = read(bars(11, (i) => 100 + i));
  assert.equal(t.sma.latest, null, "fifty days cannot come from eleven bars");
  assert.equal(t.rsi.latest, null);
  assert.equal(t.ema.latest, null);
});

test("an empty history is an empty read, not a throw", () => {
  const t = read([]);
  assert.equal(t.rsi.latest, null);
  assert.equal(t.rsiState, null);
});
