/* Whether the corporate-actions record was read, and what follows from that.
 *
 * The gateway's history is already split-adjusted for almost everything, and
 * repairSplitBreaks exists for the rare case where it is not: it applies a
 * split only where the prices visibly step by that split's own ratio on that
 * split's own date. To do that it has to be told which splits to look for, and
 * that list comes from a separate call which can fail like any other.
 *
 * The assembler used to spell both answers `actions?.splits ?? []`, which
 * collapses "this company has never split" into "we could not ask". The two
 * are opposites. The first says the raw series is already correct and may be
 * measured. The second says nothing at all about the series, and measuring it
 * is a coin toss.
 *
 * That coin has already come up wrong here. Netflix published a −93.3%
 * trailing year off an $80.58 price — a ten-for-one split the vendor had never
 * applied to the earlier bars, read as a collapse and printed as a real return
 * under a real company's name. Nothing on the page said the split record was
 * missing, because as far as the code was concerned it wasn't: the company
 * simply had no splits.
 *
 * So the record carries its own readability, and the measurements are gated on
 * it. The series itself is not: a break in a drawn line is visible to a reader
 * in a way a number is not, and blanking the chart would hide a five-year
 * history to avoid one suspect figure.
 *
 * Lives apart from instrument.ts because that module imports `server-only` and
 * does the network I/O, so nothing in it can be reached by `node --test`. This
 * is the part worth pinning, and it is pure.
 */

import {
  repairSplitBreaks,
  returnsFrom,
  type Returns,
  type Split,
} from "../api/normalize/returns.ts";
import type { RawHistoryPoint } from "../api/clients/quotes.ts";

/* As much of the corporate-actions document as a split repair needs. The
   dividends alongside it are shown rather than measured, so their absence
   costs a row and never a number. */
export type ActionsRecord = { splits?: readonly Split[] | null };

export type SplitRecord = {
  /** The splits to repair against — none when the record could not be read. */
  readonly splits: readonly Split[];
  /** Whether the record was read at all, as opposed to naming no splits. */
  readonly readable: boolean;
};

/** Nothing measured, for a series we cannot vouch for. */
const NO_RETURNS: Returns = { ret1y: null, ret5y: null, cagr5y: null };

/**
 * Read the corporate-actions document.
 *
 * `null` is what `dataOf` yields for a call that failed, and `undefined` for
 * one that never settled; neither is a company without splits. A document that
 * arrived with the key absent or null is: the gateway omits it for a company
 * that has never split, and that is an answer.
 */
export function splitRecord(actions: ActionsRecord | null | undefined): SplitRecord {
  if (actions === null || actions === undefined) return { splits: [], readable: false };
  return { splits: actions.splits ?? [], readable: true };
}

/**
 * The series with the record's splits repaired out of it.
 *
 * An unreadable record repairs nothing, which is what the old code did too —
 * the difference is that `returnsAgainst` now knows it happened. Nothing to
 * repair passes the series straight through, the way repairSplitBreaks itself
 * does when it finds no break to fix.
 */
export function repairAgainst(
  points: readonly RawHistoryPoint[],
  record: SplitRecord,
): RawHistoryPoint[] {
  if (record.splits.length === 0) return points as RawHistoryPoint[];
  return repairSplitBreaks(points, record.splits);
}

/**
 * Trailing returns across the repaired series, or nothing at all.
 *
 * Takes the raw series and repairs it here, so no caller can measure a series
 * it forgot to repair. Withheld wholesale when the record is unreadable: the
 * five-year figures ride the same unrepairable break the one-year figure does,
 * and a dash is a smaller lie than a number.
 */
export function returnsAgainst(
  points: readonly RawHistoryPoint[],
  record: SplitRecord,
): Returns {
  if (!record.readable) return NO_RETURNS;
  return returnsFrom(repairAgainst(points, record));
}
