import type { RawIndicator } from "../clients/technicals.ts";

/* Indicator readings, put the right way round.

   The gateway hands back indicator values newest first, and every chart in
   the terminal draws left to right from the oldest point. A series left in
   arrival order still renders — smoothly, with a plausible shape and a
   correct-looking axis — it simply draws the period backwards. Nothing about
   the output announces the mistake, so the order is settled once, here,
   rather than remembered at each call site.

   Sorted rather than reversed, on the same reasoning as returnsFrom: the
   documented order is worth honouring and not worth trusting.

   The derived readings follow the same rule as the rest of the terminal. An
   indicator the account has no coverage for comes back null, never zero: a
   zero RSI is not the absence of an RSI, it is the most oversold a security
   can be, and a panel that prints one has invented a signal. */

export type Indicator = {
  /** The newest reading, or null when there is none. */
  latest: number | null;
  /** Oldest first, ready to draw. */
  series: Array<{ at: number; value: number }>;
};

export function toIndicator(raw: RawIndicator): Indicator {
  const series: Array<{ at: number; value: number }> = [];

  /* Both halves are checked because this is parsed JSON wearing a type: a
     point missing either one cannot be plotted, and a NaN sorted into the
     series would carry through to `latest` as a reading. */
  for (const v of raw.results?.values ?? []) {
    if (!v || !Number.isFinite(v.timestamp) || !Number.isFinite(v.value)) continue;
    series.push({ at: v.timestamp, value: v.value });
  }
  if (series.length === 0) return { latest: null, series };

  series.sort((a, b) => a.at - b.at);
  return { latest: series[series.length - 1].value, series };
}

export type TechnicalRead = {
  rsi: Indicator;
  sma: Indicator;
  ema: Indicator;
  /** Where the last price sits between the 52-week low and high, 0-100. */
  rangePosition: number | null;
  /** "overbought" | "oversold" | "neutral", from RSI, or null when RSI is absent. */
  rsiState: "overbought" | "oversold" | "neutral" | null;
};

/* Wilder's thresholds, unchanged since 1978 and the ones every other terminal
   prints. Moving them would relabel the same number against everyone else's
   reading of it, so they are treated as vocabulary rather than as a tuning
   knob. The boundaries themselves are inclusive: a reading of exactly seventy
   is conventionally overbought. */
const OVERBOUGHT = 70;
const OVERSOLD = 30;

function rsiStateOf(latest: number | null): TechnicalRead["rsiState"] {
  if (latest === null) return null;
  if (latest >= OVERBOUGHT) return "overbought";
  if (latest <= OVERSOLD) return "oversold";
  return "neutral";
}

/* Clamped because the two inputs are measured at different moments: the
   52-week extremes come off the quote feed's own daily figures while the
   price is the last trade, so a stock making a new high arrives here as a
   price above its own high. That is a lag, not a hundred-and-three per cent,
   and the bar this draws has only a hundred to give. */
function rangePositionOf(
  price: number | null,
  low: number | null,
  high: number | null,
): number | null {
  if (price === null || low === null || high === null) return null;
  if (!Number.isFinite(price) || !Number.isFinite(low) || !Number.isFinite(high)) return null;
  // A flat or inverted range describes no position, and dividing by it
  // produces an infinity that would render as a full bar.
  if (high <= low) return null;
  return Math.min(100, Math.max(0, ((price - low) / (high - low)) * 100));
}

export function toTechnicalRead(args: {
  /** Null where the call failed — the panel then says so rather than guessing. */
  rsi: RawIndicator | null;
  sma: RawIndicator | null;
  ema: RawIndicator | null;
  price: number | null;
  low52: number | null;
  high52: number | null;
}): TechnicalRead {
  const rsi = toIndicator(args.rsi ?? {});

  return {
    rsi,
    sma: toIndicator(args.sma ?? {}),
    ema: toIndicator(args.ema ?? {}),
    rangePosition: rangePositionOf(args.price, args.low52, args.high52),
    rsiState: rsiStateOf(rsi.latest),
  };
}
