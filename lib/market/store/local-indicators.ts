import type { RawIndicator } from "../../api/clients/technicals.ts";
import type { PricePoint } from "../../api/normalize/series.ts";
import { ema, rsi, sma, type IndicatorPoint } from "../indicators.ts";

/* RSI, the fifty-day average and the twenty-day average, computed rather than
 * fetched.
 *
 * Three of the thirteen calls an instrument page makes are indicator calls,
 * and every one of them is arithmetic over a series the store already holds.
 * Once five years of daily bars live in Postgres there is nothing left for the
 * gateway to tell us: the same numbers come out of lib/market/indicators.ts
 * for free, and they come out of the SPLIT-REPAIRED series, which the
 * gateway's own do not — derive-technicals.ts already prints a note where the
 * two disagree by a point or more.
 *
 * The output wears the gateway's shape on purpose. `toIndicator` is the one
 * place in this codebase that knows indicator values arrive newest first, and
 * the whole read path downstream of it — toTechnicalRead, derive-technicals,
 * the panel — is written against that. Handing it a shape of our own would
 * mean a second normaliser for the same three numbers, and the moment it
 * drifted from the first the page would print two different RSIs depending on
 * which path served it.
 */

/* The windows the instrument page has always asked the gateway for: Wilder's
   fourteen for RSI, fifty sessions for the simple average, twenty for the
   exponential one. They are what the panel's labels say, so they are not a
   tuning knob. */
const RSI_WINDOW = 14;
const SMA_WINDOW = 50;
const EMA_WINDOW = 20;

/* How many readings to keep, and a deliberate loss rather than a translation.
 *
 * The gateway sends about ten, so keeping ten is the shape the read path has
 * always been handed. It is still a choice: the bars are right here, and five
 * years of a fifty-day average would be 1,224 points riding the flight payload
 * for every instrument page.
 *
 * Checked before settling on it, because throwing data away deserves the
 * check. Nothing downstream reads an indicator series at all. `toIndicator`
 * sorts the values and exposes `.latest`; the only two readers in the repo are
 * derive-technicals.ts, which takes `rsi.latest` to print the note where the
 * provider's RSI and ours disagree, and instrument-derive.ts, which takes
 * `rsi.latest` and the RSI state for a headline. The ten-point traces the
 * technicals panel draws are computed there from the daily closes, not from
 * these values — so widening this window would change the payload's size and
 * nothing at all on the screen. Widen it the day something plots `.series`. */
const KEPT = 10;

/**
 * The three indicator documents an instrument page needs, from its own bars.
 *
 * `daily` is the repaired, oldest-first series — `toPricePoints(repairAgainst(…))`
 * — because that is what every other figure on the page is measured from.
 */
export function indicatorsFromDaily(daily: readonly PricePoint[]): {
  rsi: RawIndicator;
  sma: RawIndicator;
  ema: RawIndicator;
} {
  return {
    rsi: asRawIndicator(rsi(daily, RSI_WINDOW)),
    sma: asRawIndicator(sma(daily, SMA_WINDOW)),
    ema: asRawIndicator(ema(daily, EMA_WINDOW)),
  };
}

/* Newest first, and stamped in epoch milliseconds — both the gateway's own
   conventions, verified against the live catalogue's sample response for
   /mdp/api/v1/polygon/indicators/{kind}/{ticker}. toIndicator sorts before it
   reads, so getting the order wrong would not throw; it would quietly draw the
   period backwards. */
function asRawIndicator(points: readonly IndicatorPoint[]): RawIndicator {
  const values = points
    .slice(-KEPT)
    .map((p) => ({ timestamp: p.at, value: p.value }))
    .reverse();
  return { results: { values } };
}
