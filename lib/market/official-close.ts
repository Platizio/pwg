import { easternTime, regularCloseMinute } from "./session.ts";

/* "What was the official close of New York day D?"
 *
 * Every chart ends a session on this number, because it is the one printed
 * beside the chart as "Previous close". Minute bars stop at 15:59, whose close
 * is the last continuous trade — 336.95 for AAPL on 23 Sep 2026 against an
 * official 337.02 — so a session drawn from minutes alone ends a few cents
 * away from the figure beneath it.
 *
 * Two answers, and each is right only part of the time (measured 24 Sep 2026,
 * through the gateway's Polygon proxy):
 *
 *   A PAST DAY'S DAILY BAR. Its close is the official one: AAPL 338.98 on the
 *   21st, 339.75 on the 22nd, 337.02 on the 23rd. Daily bars are stamped at
 *   Eastern midnight (04:00Z in summer, 05:00Z in winter), and an answer runs
 *   through TODAY's bar, so a day is found by its Eastern date and never by
 *   position: at 06:00 ET on the 24th the last bar was the 24th's, closing at
 *   336.158 on 2,318 pre-market trades.
 *
 *   THE BAR THAT STARTS AT THE BELL. Today's daily bar is an all-hours running
 *   bar, so after 16:00 its close is a post-market trade. The bar starting at
 *   the bell usually opens on the closing cross — AAPL 337.02 on the 23rd at
 *   every width asked (1, 5, 15 and 30 minutes) — but not always: a stray
 *   print can land first in the bell's second (AAPL 16 Sep: 332.59 opened the
 *   bar, the cross at 332.41 was its low). Over 60 sessions it was exact on
 *   37-49 for AAPL, MSFT, NVDA, TSLA and AMZN, worst $1.79 (MSFT 29 Jul), and
 *   on 7 for SPY, typically 2-15 cents off. So it is the answer only for
 *   TODAY, between the bell and midnight, when nothing better exists; from the
 *   next morning the day's own daily bar takes over.
 *
 * On a half-day the bell is 13:00 (regularCloseMinute): AAPL's 13:00 bar on
 * 28 Nov 2025 opened at 278.86 against an official 278.85.
 */

/** The fields of a Polygon aggregate this reads. `t` is the bar's START, in ms. */
export type CloseBar = { t: number; o: number; c: number };

const ET = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/New_York",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

function eastern(ms: number): { day: string; minute: number } {
  const parts = ET.formatToParts(ms);
  const get = (t: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === t)?.value ?? "";
  return {
    day: `${get("year")}-${get("month")}-${get("day")}`,
    minute: Number(get("hour")) * 60 + Number(get("minute")),
  };
}

const ISO_DAY = /^(\d{4})-(\d{2})-(\d{2})$/;

/* How long after its bell a day's daily bar may still be running. */
const RUNNING_WINDOW_MS = 24 * 3_600_000;

const price = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v > 0;

/**
 * The instant the regular session ends on Eastern date `day`, in ms: 16:00,
 * or 13:00 on a half-day. Read off the one calendar (easternTime in
 * session.ts, which lets the zone database decide the offset) rather than
 * restated here, so the route's closing point and the client's bell
 * (bellOf in regular-session.ts) are the same instant by construction.
 */
export function closingBell(day: string): number | null {
  if (!ISO_DAY.test(day)) return null;
  const at = easternTime(day, regularCloseMinute(day) * 60);
  return at === null ? null : at * 1000;
}

/**
 * The official close of Eastern date `day`, or null when there is not one yet.
 *
 * `daily` is Polygon's daily answer for a span covering the day — or null when
 * that request FAILED, which is different from an answer without the day in
 * it. `bars` are the raw aggregates of any width, NOT trimmed to the session:
 * the bar that starts at the bell is post-market by its stamp and is exactly
 * the one needed.
 */
export function officialClose(
  day: string,
  daily: readonly CloseBar[] | null,
  bars: readonly CloseBar[] | null,
  nowMs: number,
): number | null {
  const bell = closingBell(day);
  if (bell === null || !Number.isFinite(nowMs)) return null;
  const today = eastern(nowMs).day;
  if (day > today) return null;

  const cross = (bars ?? []).find((b) => b?.t === bell && price(b.o))?.o ?? null;

  /* Today's daily bar is still running, so only the cross will do, and only
     once the bell has rung. */
  if (day === today) return nowMs >= bell ? cross : null;

  /* The daily request failed: the cross is the next-best figure (exact for
     AAPL and MSFT, cents off for SPY), and far better than 15:59's close. */
  if (daily === null) return cross;

  const official = daily.find((b) => price(b?.c) && eastern(b.t).day === day)?.c ?? null;
  if (official === null) return null;

  /* A day that has just ended keeps a RUNNING daily bar until Polygon
     finalizes it — sometime between 20:00 and 06:00 ET for 23 Sep 2026, not
     measured closer. A running bar is recognisable without knowing when: its
     close is the day's last post-bell trade, and not the cross. Over 60
     sessions of AAPL, MSFT, SPY, NVDA, TSLA and AMZN a running bar was caught
     every time, and a finalized close was mistaken for one once in 360 (MSFT,
     20 Aug: 481.15 was also the last post-market print; the cross said
     481.32). So the check runs only within a day of the bell, the one window
     in which a daily bar can still be running. */
  if (cross !== null && official !== cross && nowMs - bell < RUNNING_WINDOW_MS) {
    let last: CloseBar | null = null;
    for (const b of bars ?? []) {
      if (b?.t >= bell && eastern(b.t).day === day && (last === null || b.t > last.t)) last = b;
    }
    if (last !== null && last.c === official) return cross;
  }
  return official;
}

/** The official closes of several days, keyed by day, only where there is one. */
export function officialCloses(
  days: readonly string[],
  daily: readonly CloseBar[] | null,
  bars: readonly CloseBar[] | null,
  nowMs: number,
): Map<string, number> {
  const out = new Map<string, number>();
  for (const day of days) {
    const close = officialClose(day, daily, bars, nowMs);
    if (close !== null) out.set(day, close);
  }
  return out;
}

/**
 * The `from`/`to` of one daily request covering these days, in ms.
 *
 * Polygon reads a daily request's bounds as Eastern DATES, so midnight UTC —
 * 20:00 the evening before in New York — would ask for one day too many. Noon
 * UTC is the same date in New York all year round.
 */
export function dailySpan(days: readonly string[]): { fromMs: number; toMs: number } | null {
  if (days.length === 0) return null;
  const fromMs = Date.parse(`${days[0]}T12:00:00Z`);
  const toMs = Date.parse(`${days[days.length - 1]}T12:00:00Z`);
  return Number.isFinite(fromMs) && Number.isFinite(toMs) ? { fromMs, toMs } : null;
}
