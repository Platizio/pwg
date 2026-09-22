/* The bars a chart is allowed to draw.
 *
 * WHAT THIS IS FOR. The gateway's intraday feed runs 04:00 to 20:00 Eastern —
 * pre-market, the regular session, and post-market, in one undifferentiated
 * series. The chart drew all of it, so a reader in India opening a day chart
 * saw it begin at 13:30 their time (04:00 ET) rather than at 19:00 (09:30 ET),
 * which is when the market they are watching actually opens.
 *
 * The rule, stated by Aayush: the CHART is the regular session, 09:30 to 16:00
 * Eastern, which is 19:00 to 01:30 in India. Pre- and post-market are not
 * drawn. Opening a stock while either is running shows the previous regular
 * session's chart, not a half-empty one.
 *
 * WHAT THIS IS NOT FOR. Prices. A pre- or post-market print is a real price and
 * the header, the tape and the change figure all keep following it — that is
 * `pricesMove`, and nothing here touches it. The distinction is deliberate: the
 * number in front of a reader should be the latest one that exists, while the
 * shape they read a session from should be one session, drawn end to end,
 * without two thin tails that make the middle unreadable.
 *
 * Filtering rather than re-capturing: the store keeps the whole 04:00-20:00
 * window (it costs 1.79MB a session across the entire symbol set) so the
 * decision stays reversible and no bar is destroyed to make a display choice.
 */

/** 09:30 Eastern, in seconds into the day. Mirrors session.ts's OPEN_ET. */
const OPEN_ET = 9 * 3600 + 30 * 60;
/** 16:00 Eastern. Mirrors session.ts's CLOSE_ET. */
const CLOSE_ET = 16 * 3600;

/* The exchange's own wall clock. Held rather than rebuilt: this is asked once
   per bar, and a full session is ~390 minute bars per symbol. */
const ET_CLOCK = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

/** Seconds into the Eastern day for an instant. */
function easternSeconds(atMs: number): number {
  const parts = ET_CLOCK.formatToParts(atMs);
  const n = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((p) => p.type === type)?.value ?? "0");
  return n("hour") * 3600 + n("minute") * 60 + n("second");
}

/**
 * Whether an instant falls inside the regular session.
 *
 * The close is INCLUDED. A bar stamped exactly 16:00 is the closing print, not
 * the first post-market one — dropping it would take the day's close off the
 * end of the day's chart, which is the one bar a reader is most likely to be
 * looking for.
 */
export function inRegularSession(atMs: number): boolean {
  if (!Number.isFinite(atMs)) return false;
  const s = easternSeconds(atMs);
  return s >= OPEN_ET && s <= CLOSE_ET;
}

/**
 * Keep only the bars inside the regular session.
 *
 * Returns the SAME array when nothing is dropped, so a caller can cheaply tell
 * that it is holding the original — and so React sees an unchanged reference
 * rather than a new one on every render.
 */
export function regularSessionOnly<T extends { at: number }>(points: T[]): T[] {
  let dropped = false;
  const kept: T[] = [];
  for (const p of points) {
    if (inRegularSession(p.at)) kept.push(p);
    else dropped = true;
  }
  return dropped ? kept : points;
}
