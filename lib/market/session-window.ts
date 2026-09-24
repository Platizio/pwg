import { regularCloseMinute, tradingDay } from "./session.ts";

/* Which trading days a chart range covers, as the gateway wants them asked.
 *
 * WHY THIS EXISTS. /quotes/equity/intraday takes an undocumented `from`/`to`
 * in "yyyy-MM-dd HH:mm:ss" (New York time) and answers with one-minute bars for
 * PAST sessions — measured 21 Sep 2026: 391 bars for a single session, 4,243
 * across seven trading days, and nothing for a date a month back. Until that
 * was found, the week chart drew seven daily closes (six straight segments) and
 * the day chart drew ten-minute buckets captured one evening at a time. Asking
 * for the right window is the whole trick, and "the right window" means TRADING
 * days: weekends and exchange holidays have no bars and must not use up a slot.
 */

const DAY_MS = 86_400_000;
/** 09:30 New York, seconds into the day. */
const OPEN_S = 9 * 3600 + 30 * 60;

const ET = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/New_York",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

function eastern(ms: number): { day: string; seconds: number } {
  const parts = ET.formatToParts(ms);
  const get = (t: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === t)?.value ?? "";
  return {
    day: `${get("year")}-${get("month")}-${get("day")}`,
    seconds: Number(get("hour")) * 3600 + Number(get("minute")) * 60 + Number(get("second")),
  };
}

/* Whether the Eastern date of `ms` trades — asked of the one calendar
   (tradingDay in session.ts) that the phase, the pill and the worker read. */
const isTradingDay = (ms: number): boolean => tradingDay(eastern(ms).day) !== null;

/**
 * The last `count` trading days whose regular session has STARTED, oldest
 * first, as "YYYY-MM-DD" in New York.
 *
 * Today counts only once 09:30 has passed there: before the bell today has no
 * bars, and a window ending on it would leave the chart one session short —
 * which, for the day chart before the open, is exactly the previous session a
 * reader should be shown instead.
 */
export function tradingDays(nowMs: number, count: number): string[] {
  const out: string[] = [];
  const today = eastern(nowMs);
  let probe = nowMs;
  if (!isTradingDay(probe) || today.seconds < OPEN_S) probe -= DAY_MS;
  /* Bounded walk: a count of seven never needs more than a couple of weeks,
     and a runaway loop on a bad clock must not hang a request. */
  for (let i = 0; out.length < count && i < count * 3 + 10; i += 1) {
    if (isTradingDay(probe)) {
      const d = eastern(probe).day;
      if (out[0] !== d) out.unshift(d);
    }
    probe -= DAY_MS;
  }
  return out;
}

/** The gateway's `from`/`to` for those days: first open to last close —
    16:00, or 13:00 when the last day is a half-day. */
export function windowFor(days: readonly string[]): { from: string; to: string } | null {
  if (days.length === 0) return null;
  const last = days[days.length - 1];
  const close = regularCloseMinute(last);
  const hhmm = `${String(Math.floor(close / 60)).padStart(2, "0")}:${String(close % 60).padStart(2, "0")}`;
  return { from: `${days[0]} 09:30:00`, to: `${last} ${hhmm}:00` };
}
