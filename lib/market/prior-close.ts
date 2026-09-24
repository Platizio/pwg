import { tradingDays } from "./session-window.ts";

/* The close a session is measured against: the one before it.
 *
 * The day chart used the LAST daily bar, which is right only while it draws
 * today's live session. Before the bell it draws the previous session, and the
 * last daily bar is then that session's own close — or, before the bar is
 * published, the one before; the line landed on whichever happened to be
 * newest. Choosing by date fixes both: the last close strictly before the
 * drawn session's New York day.
 */

const EASTERN_DAY = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/New_York",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export function priorClose(
  daily: ReadonlyArray<{ at: number; price: number }>,
  sessionAtMs: number | null,
): number | null {
  if (sessionAtMs === null || !Number.isFinite(sessionAtMs)) return daily.at(-1)?.price ?? null;
  const session = EASTERN_DAY.format(sessionAtMs);
  for (let i = daily.length - 1; i >= 0; i -= 1) {
    if (EASTERN_DAY.format(daily[i].at) < session) return daily[i].price;
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* The two references a chart draws against                            */
/* ------------------------------------------------------------------ */

/**
 * What the chart's dashed line shows, and what its colour is measured from.
 *
 * TWO NUMBERS, AND THEY ARE KEPT APART ON PURPOSE.
 *
 * `line` is the page's "Previous close" figure, handed in, and nothing else.
 * The chart used to compute its own — the last daily bar on the day range, and
 * on the week the last five-minute bucket of the session before the final one.
 * With the market shut the owner read 339.73 off that line while the card on
 * the same page said something else, and asked why the graph did not end
 * there. A line labelled PREV CLOSE that disagrees with the figure labelled
 * Previous close is two answers to one question. No figure, no line: the card
 * then shows a dash, and a line the chart invented would be the only claim on
 * the page.
 *
 * `basis` colours the area and measures the tooltip. For the day it is the
 * close BEFORE the session on screen (priorClose), which is not always the
 * card's figure — before the bell the chart draws the last completed session
 * and the card already holds that session's own close. For every longer range
 * it is the first point drawn: a week is read from where the week began, and
 * colouring a year by a single session's move would contradict its own shape.
 */
export function chartReference(args: {
  intraday: boolean;
  points: ReadonlyArray<{ at: number; price: number }>;
  daily: ReadonlyArray<{ at: number; price: number }>;
  previousClose: number | null;
}): { line: number | null; basis: number | null } {
  const { previousClose } = args;
  const line =
    previousClose !== null && Number.isFinite(previousClose) && previousClose > 0
      ? previousClose
      : null;
  const first = args.points[0];
  if (!first) return { line, basis: null };
  const basis = args.intraday ? (priorClose(args.daily, first.at) ?? first.price) : first.price;
  return { line, basis };
}

/* ------------------------------------------------------------------ */
/* Which session a close belongs to                                    */
/* ------------------------------------------------------------------ */

/* The feed's trading day begins at 04:00 New York, when pre-market opens and
   the quote rolls over (lib/market/screen.ts records the volume reset at the
   same moment). */
const ROLL_MS = 4 * 3_600_000;

const ET_CLOCK = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

/**
 * The New York day whose close a quote's `yesterdayClose` is, from the quote's
 * own timestamp.
 *
 * Measured 24 Sep 2026 at 05:39 ET: AAPL's yesterdayClose was 337.02, the
 * official close of the 23rd. Until the 04:00 roll — through the 23rd's whole
 * session, its post-market and the night after — the same field is the 22nd's.
 * So the quote's trading day is its timestamp's date counted from 04:00, and
 * the close it carries is that of the last trading day before it; weekends and
 * holidays are stepped over by the same calendar the charts use.
 *
 * Read from the quote's time rather than the reader's clock on purpose: the
 * card on a cached page describes the moment its quote was taken, not now.
 */
export function quoteCloseDay(asOfMs: number | null): string | null {
  if (asOfMs === null || !Number.isFinite(asOfMs)) return null;
  const shifted = asOfMs - ROLL_MS;
  /* One second before New York midnight of the quote's trading day: the last
     trading day whose session had started by then is the one before it. */
  const parts = ET_CLOCK.formatToParts(shifted);
  const n = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((p) => p.type === type)?.value ?? "0");
  const intoDay = n("hour") * 3600 + n("minute") * 60 + n("second");
  const beforeMidnight = shifted - (intoDay + 1) * 1000;
  return tradingDays(beforeMidnight, 1)[0] ?? null;
}

/** A session's close from daily bars, found by its New York date. */
export function closeOnDay(
  daily: ReadonlyArray<{ at: number; price: number }>,
  day: string,
): number | null {
  for (let i = daily.length - 1; i >= 0; i -= 1) {
    const d = EASTERN_DAY.format(daily[i].at);
    if (d === day) return daily[i].price > 0 ? daily[i].price : null;
    if (d < day) return null;
  }
  return null;
}

/**
 * The official close of one session, from whichever of the page's two sources
 * describes it: the card's figure when its quote says it is that session's,
 * otherwise the daily bars (official since fetchHistory merges Polygon's) —
 * but only for a session OLDER than the card's.
 *
 * The card leads when it applies. It is the number the dashed line carries,
 * so a finished session ended on it meets the line exactly — and measured on
 * 24 Sep 2026 the stored daily series still lacked the 23rd and held the
 * gateway's 342.70 for the 22nd, where the card had the official 337.02.
 *
 * A session NEWER than the card's has no close here. That is the session that
 * ended hours ago, before the card rolls at 04:00 ET, and its daily bar may
 * still be RUNNING: the daily bars hold back only today's, the worker stores
 * them at 00:45 ET, and Polygon finalizes a day's bar sometime between 20:00
 * and 06:00 ET (official-close.ts) — until then its close is the last
 * post-market print. From 00:45 to 04:00 this read that print (AAPL's 23rd
 * would have ended on 336.86) and endOnClose wrote it over the route's point
 * at the bell, which the route had resolved to the cross, 337.02, with the
 * running-bar check this path does not have. The route's point stands instead.
 * A session older than the card's ended at least a day before it and is long
 * final. With no card at all, the bars are all there is.
 */
export function sessionClose(
  day: string,
  src: {
    daily: ReadonlyArray<{ at: number; price: number }>;
    previousClose: number | null;
    /** When the card's quote was taken; or, already resolved, `cardDay`. */
    asOf?: number | null;
    /** quoteCloseDay(asOf), for a caller that holds it — it changes once a
        day, where the timestamp behind it changes with every tick. */
    cardDay?: string | null;
  },
): number | null {
  const card = src.previousClose;
  const cardDay = src.cardDay !== undefined ? src.cardDay : quoteCloseDay(src.asOf ?? null);
  if (card !== null && Number.isFinite(card) && card > 0 && cardDay === day) return card;
  if (cardDay !== null && day > cardDay) return null;
  return closeOnDay(src.daily, day);
}
