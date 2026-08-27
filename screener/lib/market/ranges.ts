import type { RangeDef, RangeId } from "./types";

/* How far back the chart looks, and where each answer comes from.

   These definitions used to describe how to fabricate a series: a sample
   count, a volatility, a drift and a candle bucket size, all feeding a seeded
   generator. Nothing generates a price any more, so what a range needs to say
   now is simply which feed answers it and how much of that feed to show.

   Everything but the day is a slice of one five-year daily pull the snapshot
   already holds — asking the gateway for a week returns the same five rows
   that slice contains. Only the day needs its own call, because minute bars
   come from a different endpoint. */
export const RANGES: RangeDef[] = [
  { id: "1D", label: "1D", source: "intraday", intraday: true },
  { id: "1W", label: "1W", source: "daily", sessions: 5, intraday: false },
  { id: "1M", label: "1M", source: "daily", sessions: 21, intraday: false },
  { id: "3M", label: "3M", source: "daily", sessions: 64, intraday: false },
  { id: "1Y", label: "1Y", source: "daily", sessions: 252, intraday: false },
  { id: "5Y", label: "5Y", source: "daily", intraday: false },
];

/* A year, so a reader arriving while the market is shut still sees a chart:
   the day is the one range whose emptiness is a real state rather than a
   failure. */
export const DEFAULT_RANGE: RangeId = "1Y";

export function getRange(id: string): RangeDef {
  return RANGES.find((r) => r.id === id) ?? RANGES[4];
}
