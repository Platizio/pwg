/* Whether a live tick belongs to the session a row was drawn from. Pure, so the
   dashboard boards, the market card, the popular ribbon and the sector table
   all use one rule, and that rule has tests
   (tests/dashboard-same-session.test.ts). */

/**
 * How far apart two previous closes can be and still count as one close.
 *
 * The row's basis is back-solved from a price and a rounded percent, and the
 * feed's previous close can be the official close where the snapshot used the
 * last trade. An exact match would therefore refuse ticks from the right
 * session. A new session measures from the previous session's close, which
 * sits outside this band for any name that moved more than 0.5% that session.
 * Every name on the gainers and losers boards moved much more than that. A
 * name that barely moved cannot be told apart this way. Its tick's price and
 * change still agree with each other, and a board ranked by the move rarely
 * shows a name that barely moved.
 */
export const BASIS_TOLERANCE = 0.005;

/** The figures a row printed. `chgKnown: false` marks a stand-in 0. */
type Row = { price: number; chg: number | null; chgKnown?: boolean };

/** The parts of a tick this rule reads. */
type Live = { price: number; previousClose: number | null; changePercent: number | null };

/**
 * True when the tick measures its move from the same previous close as the row.
 *
 * Checking the clock would not work here. Pre- and post-market ticks are real
 * prices (the US market is more than 09:30–16:00 ET), so the test is the basis
 * itself. A post-market tick shares the regular session's previous close and
 * is taken. The next morning's pre-market tick measures from the close the row
 * ended on and is refused. Without this check, a board ranked on yesterday's
 * move showed today's figures, and "Top gainers" printed red rows.
 *
 * A row with no change of its own has no basis to compare, so it cannot be
 * shown to share one.
 */
export function sameBasis(row: Row, tick: Live): boolean {
  if (row.chg === null || row.chgKnown === false) return false;
  if (tick.previousClose === null || tick.changePercent === null) return false;
  const basis = row.price / (1 + row.chg / 100);
  if (!Number.isFinite(basis) || basis <= 0) return false;
  return Math.abs(tick.previousClose - basis) <= basis * BASIS_TOLERANCE;
}

/**
 * The row with the tick's price and change written in, or the row unchanged.
 *
 * The tick is taken whole or not at all: this second's price beside the
 * snapshot's change would pair two different bases. Order, ranking and every
 * other field stay as the server sent them.
 */
export function withTick<T extends Row>(row: T, tick: Live | undefined): T {
  if (!tick || tick.changePercent === null || !sameBasis(row, tick)) return row;
  return { ...row, price: tick.price, chg: tick.changePercent };
}
