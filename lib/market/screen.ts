import { isFund, POPULAR_TICKERS } from "./universe.ts";
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
  /* How far behind the sweep a quote may be and still describe "today".
     Four days clears a long weekend plus a holiday, which is the same reason
     returns.ts allows a split's recorded date to miss its price break by four.
     The live distribution is bimodal — 99.2% of eligible rows are quoted
     within a day and the rest are weeks dead — so anything from one day to a
     week removes the same 36 rows. The wide end is chosen deliberately: it
     cannot strand a board on a quiet Tuesday after a Monday holiday. */
  maxQuoteAge: 4 * 86_400_000,
} as const;

/** What this name trades on an ordinary day, in dollars. */
export const typicalDollarVol = (r: SweepRow): number => r.px * r.avgVol;

/**
 * Does this row still describe the session the boards claim to be about?
 *
 * A separate question from the floor above. The floor asks whether a company
 * belongs on a board at all — its exchange, its price, whether it normally
 * trades enough to matter. Those are facts about the company. This asks
 * whether the quote in hand is still reporting, which is a fact about the data.
 *
 * It has to be asked because every board ranks on a quantity that means
 * "today": `chg` is today's move, `dollarVol` is today's turnover, `relVol` is
 * today's volume against a thirty-day average. When a symbol stops updating,
 * those three freeze at whatever they last read — and a frozen extreme never
 * decays, so it sorts to the top of a descending board and stays there.
 *
 * Observed live before this existed: Popular right now was four fossils out of
 * eight — EA at 19.4x on a 28-day-old quote, Webster at 16.2x on 13 days,
 * Stellar and Select Medical at 13.3x and 12.6x on 63 days. Gainers carried
 * RAAQ at +24.0% on a quote 62 days dead. Thirty-six of 4,453 eligible rows
 * were fossils, and they were disproportionately on the boards precisely
 * because the boards sort for extremes.
 *
 * Measured against the sweep rather than the wall clock, so the answer is a
 * property of the snapshot and does not change between renders of it.
 */
export function current(r: SweepRow, sweptAt: number): boolean {
  /* Unstampable rather than stale: not judged, and not dropped.
     This file's own history records a floor built on a field that empties
     overnight taking every board with it, and a feed that stopped stamping
     would do the same here. Degrading to the behaviour we had before the
     stamp existed is the safe direction. No row in the live universe is
     unstamped today. */
  if (r.asOf === null) return true;
  return sweptAt - r.asOf <= FLOOR.maxQuoteAge;
}

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
  /** Quotes too far behind the sweep to describe the session on the boards. */
  droppedStale: number;
};

/** What the floor removed, so a thin board is explainable rather than mysterious. */
export function floorReport(s: Snapshot): FloorReport {
  let droppedExchange = 0;
  let droppedPrice = 0;
  let droppedVolume = 0;
  let droppedChange = 0;
  let droppedStale = 0;
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
    else if (!current(r, s.sweptAt)) droppedStale += 1;
    else kept += 1;
  }

  return {
    swept: s.rows.length,
    eligible: kept,
    droppedExchange,
    droppedPrice,
    droppedVolume,
    droppedChange,
    droppedStale,
  };
}

/* Both questions, in one place: does the company belong here, and is the row
   still reporting. Every board draws from this, so neither test can be
   forgotten by one of them. */
const pool = (s: Snapshot) => s.rows.filter((r) => eligible(r) && current(r, s.sweptAt));

/* Operating companies only.

   Gainers and losers are questions about businesses. A leveraged fund answers
   them with arithmetic on somebody else's move, so it is excluded from those
   two boards — but not from Most Active, where a heavily traded fund is a true
   answer to a question about turnover, nor from Popular, which is curated by
   hand and so has already settled the question. */
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

/* The one board that ranks nothing.
 *
 * "Popular" used to mean relative volume — today's turnover against the
 * thirty-day average — on the reasoning that it was the closest honest proxy
 * for what the market is paying attention to. It is, and it still answers the
 * wrong question. The reader opening this page is not a desk looking for
 * unusual flow; they are someone who wants to see companies they recognise,
 * and relative volume is close to orthogonal to that. A mega-cap trades near
 * its average almost every day, which is precisely what disqualified Apple,
 * Microsoft and Google from a ribbon whose whole job was to show them.
 *
 * So the ranking is editorial, held in POPULAR_TICKERS, and this function does
 * not sort: it walks the curated order and keeps whatever the sweep can price.
 * Order-preserving matters downstream — popular-ribbon.tsx maps the rows in
 * place and says so, because re-ranking a strip that is already gliding past
 * swaps cells under the reader's eye.
 *
 * Drawn from pool() rather than stocks(): the fund test is a regex over the
 * feed's name string, and against a hand-picked list of operating companies it
 * can no longer do its job, only misfire — one unlucky name from the feed and
 * a household brand vanishes from the page with nothing to show why. Curation
 * has already answered the question stocks() exists to ask.
 */
export function popular(s: Snapshot, n = 12): SweepRow[] {
  const priced = new Map(pool(s).map((r) => [r.s, r]));
  const rows: SweepRow[] = [];
  for (const ticker of POPULAR_TICKERS) {
    const row = priced.get(ticker);
    if (row !== undefined) rows.push(row);
    if (rows.length === n) break;
  }
  return rows;
}

/* Only `chg` and `chgKnown` are read, so this takes a swept row and a rendered
   quote alike — the index tabs need breadth over members they hold as Quote.

   Four buckets, not two, and they are made to sum to `total`. The bar used to
   report up and down against a total of 500 and leave the reader to notice
   that 163 and 311 do not make 500. The remainder was never flat names: it was
   names the gateway priced but sent no change for, which toSweepRow lands on
   chg 0 — the same value a genuinely unmoved name carries. `chgKnown` is what
   separates them, so a name that never reported is counted as such instead of
   being folded into "unchanged" and quietly overstating how still the day was.

   An absent `chgKnown` reads as reported: a caller that predates the flag
   should not have its whole sample reclassified. */
export function breadth(
  rows: readonly { chg: number; chgKnown?: boolean }[],
): { total: number; up: number; down: number; flat: number; unreported: number } {
  let up = 0;
  let down = 0;
  let flat = 0;
  let unreported = 0;
  for (const r of rows) {
    if (r.chgKnown === false) unreported += 1;
    else if (r.chg > 0) up += 1;
    else if (r.chg < 0) down += 1;
    else flat += 1;
  }
  return { total: rows.length, up, down, flat, unreported };
}

export function eligibleRows(s: Snapshot): SweepRow[] {
  return pool(s);
}

export function bySymbol(s: Snapshot): Map<string, SweepRow> {
  return new Map(s.rows.map((r) => [r.s, r]));
}
