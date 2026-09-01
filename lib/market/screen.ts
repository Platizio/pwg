import { isFund } from "./universe.ts";
import type { SweepRow, Snapshot } from "../api/sweep.ts";

/* Ranking, and the liquidity floor that makes it mean something.

   Every function here is pure over a snapshot, so the boards are testable
   without touching the network and the probe can print exactly what the page
   will render.

   The floor is the part that matters. An unfiltered "top gainers" board is a
   list of sub-dollar shells up three hundred percent on four thousand dollars
   of volume — technically the biggest gainers, and useless. Restricting to
   listed exchanges with a real price and real turnover is what the mainstream
   finance sites do, and it is why a genuine small-cap move still shows up
   while the noise does not. */

export const FLOOR = {
  exchanges: new Set(["NSDQ", "NYSE", "AMEX"]),
  minPrice: 1,
  /* Typical turnover — today's price against the thirty-day average volume —
     rather than turnover so far today.

     This distinction is the whole filter. Today's volume resets to nothing
     when the feed rolls into a new session at four in the morning Eastern, so
     a floor built on it drops thirteen thousand of thirteen and a half
     thousand names and every board on the page empties overnight. The
     thirty-day average does not move, which is the point: whether a company is
     normally liquid enough to belong on a movers board is a fact about the
     company, not about what time it is. */
  minTypicalDollarVol: 5_000_000,
} as const;

/** What this name trades on an ordinary day, in dollars. */
export const typicalDollarVol = (r: SweepRow): number => r.px * r.avgVol;

export function eligible(r: SweepRow): boolean {
  return (
    FLOOR.exchanges.has(r.ex) &&
    r.px >= FLOOR.minPrice &&
    typicalDollarVol(r) >= FLOOR.minTypicalDollarVol &&
    Number.isFinite(r.chg)
  );
}

export type FloorReport = {
  swept: number;
  eligible: number;
  droppedExchange: number;
  droppedPrice: number;
  droppedVolume: number;
  /** A day change that cannot be ranked — the boards sort on it. */
  droppedChange: number;
};

/** What the floor removed, so a thin board is explainable rather than mysterious. */
export function floorReport(s: Snapshot): FloorReport {
  let droppedExchange = 0;
  let droppedPrice = 0;
  let droppedVolume = 0;
  let droppedChange = 0;
  let kept = 0;

  /* The order of these tests mirrors eligible() exactly, and the last of them
     exists because it did not: a row with an unrankable day change was counted
     as eligible here while every board refused to draw it, so the one number
     consulted to explain a thin board was the one number that was wrong. */
  for (const r of s.rows) {
    if (!FLOOR.exchanges.has(r.ex)) droppedExchange += 1;
    else if (r.px < FLOOR.minPrice) droppedPrice += 1;
    else if (typicalDollarVol(r) < FLOOR.minTypicalDollarVol) droppedVolume += 1;
    else if (!Number.isFinite(r.chg)) droppedChange += 1;
    else kept += 1;
  }

  return {
    swept: s.rows.length,
    eligible: kept,
    droppedExchange,
    droppedPrice,
    droppedVolume,
    droppedChange,
  };
}

const pool = (s: Snapshot) => s.rows.filter(eligible);

/* Operating companies only.

   Gainers, losers and unusual volume are questions about businesses. A
   leveraged fund answers them with arithmetic on somebody else's move, so it
   is excluded from those three boards — but not from Most Active, where a
   heavily traded fund is a true answer to a question about turnover. */
const stocks = (s: Snapshot) => pool(s).filter((r) => !isFund(r.name));

export function gainers(s: Snapshot, n = 5): SweepRow[] {
  return stocks(s).sort((a, b) => b.chg - a.chg).slice(0, n);
}

export function losers(s: Snapshot, n = 5): SweepRow[] {
  return stocks(s).sort((a, b) => a.chg - b.chg).slice(0, n);
}

export function mostActive(s: Snapshot, n = 5): SweepRow[] {
  return pool(s).sort((a, b) => b.dollarVol - a.dollarVol).slice(0, n);
}

/* "Popular" has no endpoint either. Relative volume — today's turnover against
   the thirty-day average — is the closest honest proxy: it surfaces what the
   market is paying unusual attention to, rather than what is simply large. */
export const POPULAR_MIN_REL_VOL = 2;

export function popular(s: Snapshot, n = 12): SweepRow[] {
  return stocks(s)
    .filter((r) => r.relVol >= POPULAR_MIN_REL_VOL)
    .sort((a, b) => b.relVol - a.relVol)
    .slice(0, n);
}

/* Only `chg` is counted, so this reads a swept row and a rendered quote alike
   — the index tabs need breadth over members they hold as Quote. */
export function breadth(
  rows: readonly { chg: number }[],
): { total: number; up: number; down: number } {
  let up = 0;
  let down = 0;
  for (const r of rows) {
    if (r.chg > 0) up += 1;
    else if (r.chg < 0) down += 1;
  }
  return { total: rows.length, up, down };
}

export function eligibleRows(s: Snapshot): SweepRow[] {
  return pool(s);
}

export function bySymbol(s: Snapshot): Map<string, SweepRow> {
  return new Map(s.rows.map((r) => [r.s, r]));
}
