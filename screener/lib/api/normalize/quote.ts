import { presentation, seedOf } from "../../market/universe.ts";
import type { SweepRow } from "../sweep.ts";
import type { Quote } from "@/lib/market/session";

/* Sweep row → Quote.

   The sweep speaks the gateway's language: symbols, volumes, exchange codes.
   The components speak the terminal's: a monogram, a colour, a seed to draw a
   sparkline from. This is the single seam between the two, so that no
   component ever has to know a SweepRow exists, and no ranking function in
   lib/market/screen.ts ever has to know what a Quote looks like.

   The extras ride along on the optional half of Quote. They are the figures
   the mock could only approximate — real volume, real turnover — and carrying
   them here is what lets `turnover()` stop guessing. */

export function toQuote(row: SweepRow, sector: string | null): Quote {
  const { name, mark, color, covered } = presentation(row.s, row.name);

  return {
    id: row.s,
    name,
    mark,
    color,
    price: row.px,
    // Already a percent by the time it leaves toSweepRow.
    chg: row.chg,
    seed: seedOf(row.s),
    /* Empty rather than a guessed sector: an unclassified name is a fact the
       callers filter on, and a wrong sector would quietly survive them. */
    sector: sector ?? "",
    covered,
    volume: row.vol,
    turnoverM: row.dollarVol / 1e6,
    relVol: row.relVol,
    asOf: row.asOf ?? undefined,
    delayed: row.delayed,
  };
}

export function toQuotes(
  rows: SweepRow[],
  sectorOf: (ticker: string) => string | null,
): Quote[] {
  return rows.map((row) => toQuote(row, sectorOf(row.s)));
}
