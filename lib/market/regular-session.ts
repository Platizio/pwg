import { easternTime, regularCloseMinute } from "./session.ts";

/* The bars a chart is allowed to draw.
 *
 * WHAT THIS IS FOR. The gateway's intraday feed runs 04:00 to 20:00 Eastern —
 * pre-market, the regular session, and post-market, in one undifferentiated
 * series. The chart drew all of it, so a reader in India opening a day chart
 * saw it begin at 13:30 their time (04:00 ET) rather than at 19:00 (09:30 ET),
 * which is when the market they are watching actually opens.
 *
 * The rule, stated by Aayush: the CHART is the regular session, 09:30 to 16:00
 * Eastern, which is 19:00 to 01:30 in India — and 13:00 on the exchange's
 * half-days. Pre- and post-market are not drawn. Opening a stock while either
 * is running shows the previous regular session's chart, not a half-empty one.
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

/* The exchange's own wall clock AND calendar day, in one read: the close
   depends on the date (half-days), so both are needed per bar. Held rather
   than rebuilt — this is asked once per bar, and a year of 30-minute buckets
   is ~3,300 of them. */
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

/** The Eastern calendar day ("yyyy-mm-dd") and seconds into it. */
function eastern(atMs: number): { day: string; seconds: number } {
  const parts = ET.formatToParts(atMs);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? "";
  return {
    day: `${get("year")}-${get("month")}-${get("day")}`,
    seconds: Number(get("hour")) * 3600 + Number(get("minute")) * 60 + Number(get("second")),
  };
}

/** The Eastern calendar day an instant belongs to. */
export function easternDayOf(atMs: number): string {
  return eastern(atMs).day;
}

/**
 * How the bell itself is read.
 *
 * "include" — the FETCHED series. The route ends a finished day on a point
 * stamped exactly at the bell carrying the official close (the closing cross,
 * 16:00:00), and dropping it would take the day's close off the end of the
 * day's chart, which is the one point a reader is most likely looking for.
 *
 * "exclude" — the LIVE series. The gateway's live intraday has a minute
 * stamped 16:00 too, and it is a post-market print, not the close: measured
 * 23 Sep 2026, AAPL's closed at 337.02 while that minute read otherwise. A
 * minute bar is stamped at its START, so 15:59 is the last regular one and
 * anything from the bell on is after-hours.
 */
export type BellReading = { close?: "include" | "exclude" };

/**
 * Whether an instant falls inside the regular session: 09:30 to the day's
 * close, which is 16:00 or, on a half-day, 13:00.
 */
export function inRegularSession(atMs: number, opts: BellReading = {}): boolean {
  if (!Number.isFinite(atMs)) return false;
  const { day, seconds } = eastern(atMs);
  const close = regularCloseMinute(day) * 60;
  if (seconds < OPEN_ET) return false;
  return opts.close === "exclude" ? seconds < close : seconds <= close;
}

/**
 * Keep only the bars inside the regular session.
 *
 * Returns the SAME array when nothing is dropped, so a caller can cheaply tell
 * that it is holding the original — and so React sees an unchanged reference
 * rather than a new one on every render.
 */
export function regularSessionOnly<T extends { at: number }>(
  points: T[],
  opts: BellReading = {},
): T[] {
  let dropped = false;
  const kept: T[] = [];
  for (const p of points) {
    if (inRegularSession(p.at, opts)) kept.push(p);
    else dropped = true;
  }
  return dropped ? kept : points;
}

/* ------------------------------------------------------------------ */
/* The bell as an instant                                              */
/* ------------------------------------------------------------------ */

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * The regular close of an Eastern day as an instant, in ms: 16:00, or 13:00 on
 * a half-day. Read off the one calendar (easternTime in session.ts), so the
 * clock change moves it without a table and it is the very instant the route
 * stamps the official close at (closingBell in official-close.ts).
 */
export function bellOf(day: string): number | null {
  if (!DAY.test(day)) return null;
  const at = easternTime(day, regularCloseMinute(day) * 60);
  return at === null ? null : at * 1000;
}

/** Eastern midnight of a day — where a daily bar is stamped. */
function midnightOf(day: string): number | null {
  if (!DAY.test(day)) return null;
  const at = easternTime(day, 0);
  return at === null ? null : at * 1000;
}

/* ------------------------------------------------------------------ */
/* The live session, meeting the fetched ones                          */
/* ------------------------------------------------------------------ */

/** The shape every series here shares — PricePoint's, without the import. */
type Point = {
  at: number;
  price: number;
  open: number | null;
  high: number | null;
  low: number | null;
  volume: number | null;
};

/**
 * Points folded into buckets `minutes` wide, keeping the LAST price in each.
 *
 * Stamped at the bucket's START, the way Polygon stamps the aggregates the
 * long ranges are fetched as, so a live bucket and a fetched one for the same
 * half hour land on the same instant. The price is the last trade inside it —
 * for the newest bucket, the live tick itself — and the extremes only widen.
 * Buckets are aligned to the epoch, which is aligned to New York's half hours
 * because its offset is a whole number of hours.
 */
export function bucketLast<T extends Point>(points: readonly T[], minutes: number): Point[] {
  if (points.length === 0 || !(minutes > 0)) return [];
  const span = minutes * 60_000;
  const out: Point[] = [];
  let key = Number.NaN;
  for (const p of points) {
    if (!Number.isFinite(p.at) || !(p.price > 0)) continue;
    const k = Math.floor(p.at / span) * span;
    const high = p.high ?? p.price;
    const low = p.low ?? p.price;
    if (k !== key) {
      key = k;
      out.push({ at: k, price: p.price, open: p.open ?? p.price, high, low, volume: p.volume });
      continue;
    }
    const b = out[out.length - 1];
    b.price = p.price;
    b.high = Math.max(b.high ?? high, high);
    b.low = Math.min(b.low ?? low, low);
    b.volume = p.volume === null ? b.volume : (b.volume ?? 0) + p.volume;
  }
  return out;
}

/**
 * The last `sessions` New York days of a series. The SAME array when nothing
 * is dropped.
 *
 * Days are Eastern: a US session runs 19:00 to 01:30 in India, so counted in
 * the reader's zone one session passes for two.
 */
export function lastSessions<T extends { at: number }>(points: T[], sessions: number): T[] {
  if (!(sessions > 0) || points.length === 0) return points;
  let seen = 0;
  let day = "";
  for (let i = points.length - 1; i >= 0; i -= 1) {
    const d = easternDayOf(points[i].at);
    if (d === day) continue;
    day = d;
    seen += 1;
    if (seen > sessions) return points.slice(i + 1);
  }
  return points;
}

/* ------------------------------------------------------------------ */
/* Which copy of today is drawn                                        */
/* ------------------------------------------------------------------ */

/* THE LIVE SERIES IS THE SLOWER ONE. Measured 24 Sep 2026 between 06:44 and
 * 06:55 ET, three names at once: the gateway's live /intraday — what
 * use-intraday.ts polls — had AAPL, SPY and MSFT through 06:22-06:35, twenty to
 * twenty-two minutes behind, while Polygon's one-minute aggregates, which the
 * history route serves, had all three through 06:41-06:54, about a minute and
 * a half behind. The only thing on the page fresher than the fetch is the
 * websocket tick, seconds old.
 *
 * So every rule below takes the fetched copy of a session wherever it has one
 * and lets the live bars carry it on only past its end, and the tick joins
 * last, onto whichever series was chosen. The rules used to run the other way
 * — the live series won whenever it had anything — and at 09:30 ET, when its
 * only regular-session point was the tick, the whole day chart was that one
 * point: a blank plot with "1D · 1 prices, one a minute" under it for twenty
 * minutes, then a session drawn twenty minutes stale with one straight line up
 * to the price. */

const MINUTE_MS = 60_000;

/**
 * A live tick, if it is a price of the regular session; null otherwise.
 *
 * Pre-market, the bell and everything after it are real prices — the header
 * follows them (pricesMove) — but they are not session, so they are not drawn.
 * The bell itself is excluded for the reason BellReading gives: the official
 * close prints in the closing cross, and a tick stamped 16:00:25 is a
 * post-market trade that must never overwrite it.
 */
export function sessionTick<T extends { at: number; price: number }>(
  tick: T | null | undefined,
): T | null {
  if (!tick || !(tick.price > 0) || !Number.isFinite(tick.at)) return null;
  return inRegularSession(tick.at, { close: "exclude" }) ? tick : null;
}

/**
 * Live bars with the tick as their newest point. The SAME array when the tick
 * adds nothing.
 *
 * For the long ranges, where it is folded into buckets (withLiveSession). It
 * differs from chart-tail's liveTail on purpose, in two refusals it does not
 * make. A tick with no bars before it is kept: at 09:30 the gateway has not yet
 * delivered a single bar of today, and the tick is then today's first price —
 * which on a week or a year is the start of a session, not a session invented
 * from one point. And no gap is refused: on a line of five- to thirty-minute
 * buckets that already spans nights and weekends, the stretch between the
 * last bar and the live price is one segment, where on the day chart it is
 * the lie liveTail exists to refuse.
 */
export function withTick<T extends Point>(
  bars: T[],
  tick: { at: number; price: number } | null | undefined,
): Array<T | Point> {
  if (!tick || !(tick.price > 0) || !Number.isFinite(tick.at)) return bars;
  const point: Point = {
    at: tick.at,
    price: tick.price,
    open: tick.price,
    high: tick.price,
    low: tick.price,
    /* The tick's volume is the day's running total, not this minute's. */
    volume: null,
  };
  const last = bars.at(-1);
  if (!last) return [point];
  if (tick.at <= last.at) return bars;
  if (Math.floor(tick.at / MINUTE_MS) !== Math.floor(last.at / MINUTE_MS)) return [...bars, point];
  return [
    ...bars.slice(0, -1),
    {
      ...last,
      at: tick.at,
      price: tick.price,
      high: Math.max(last.high ?? last.price, tick.price),
      low: Math.min(last.low ?? last.price, tick.price),
    },
  ];
}

/**
 * A fetched multi-day series carried on to the live price.
 *
 * WHY. 1W, 1M, 3M and 1Y are fetched once and cached for five minutes to three
 * hours, so all session long they stood still while the header above them
 * ticked — the long chart ended an hour or more behind the price printed over
 * it. The live points past the fetch's end are folded in at the range's own
 * spacing, so the long chart ends where the header is.
 *
 * The fetch's own points of today STAY. They used to be thrown away for the
 * live ones, which are the slower copy (see above): Polygon's buckets through
 * 10:15 gave way to the gateway's minutes through 09:55 and one line to the
 * tick. Now a live point joins only past the end of the fetch's last bucket —
 * a bucket is stamped at its start and published once it is complete, so its
 * last price already has every trade up to its end.
 *
 * `live` is expected already trimmed to the regular session (the live reading,
 * bell excluded), with the tick at its end (withTick). A live session OLDER
 * than the fetch is ignored — that is a day chart left over from yesterday,
 * not today's trading — and so is one the fetch has already carried to its
 * official close, where the live series stops at the last trade before it.
 * `keep` holds the window at its size: seven sessions for the week, not eight
 * once today joins.
 */
export function withLiveSession<T extends Point>(
  fetched: T[],
  live: readonly Point[],
  minutes: number,
  keep?: number,
): Array<T | Point> {
  const held = (series: Array<T | Point>) => (keep ? lastSessions(series, keep) : series);
  const newest = live.at(-1);
  if (!newest || !(minutes > 0)) return fetched;
  const today = easternDayOf(newest.at);
  const fetchedLast = fetched.at(-1);
  if (fetchedLast && easternDayOf(fetchedLast.at) > today) return fetched;
  const bell = bellOf(today);
  if (fetchedLast && bell !== null && fetchedLast.at >= bell) return held(fetched);

  const reachedToday = fetchedLast && easternDayOf(fetchedLast.at) === today ? fetchedLast : null;
  const from = reachedToday ? reachedToday.at + minutes * MINUTE_MS : Number.NEGATIVE_INFINITY;
  const tail = bucketLast(
    live.filter((p) => p.at >= from && easternDayOf(p.at) === today),
    minutes,
  );
  if (tail.length === 0) return held(fetched);
  return held([...fetched, ...tail]);
}

/**
 * Which series the day chart draws, before the tick joins it: whichever
 * reaches further, and both at once when they are the same session.
 *
 * Neither copy is preferred for being "live". The fetched one wins wherever
 * it has the session — before the open and overnight it is the only one, at
 * the open the live one has nothing but pre-market for twenty minutes, all
 * session it is the fresher (see above), and after the bell it ends on the
 * official close stamped at 16:00:00 where the live one stops at 15:59. The
 * live bars carry it on past its end when they have any, and are the day on
 * their own only when they are a NEWER session than the fetch — the fetch
 * failing all morning, say.
 *
 * `live` is real bars only, trimmed to the session: the tick joins after this
 * choice (liveTail), onto whichever series won. Chosen first, a tick at 09:30
 * made a one-point "session" that outranked the whole of yesterday's.
 *
 * The SAME array comes back when one side is taken whole, so a caller can tell
 * which it holds and React sees no change.
 */
export function pickDaySeries<T extends { at: number }>(live: T[], fetched: T[]): T[] {
  const newest = live.at(-1);
  const reached = fetched.at(-1);
  if (!newest) return fetched;
  if (!reached) return live;
  const liveDay = easternDayOf(newest.at);
  const fetchedDay = easternDayOf(reached.at);
  if (fetchedDay > liveDay) return fetched;
  if (fetchedDay < liveDay) return live;
  /* A minute bar is stamped at its start, so the fetch's last one already has
     every trade before the next minute. */
  const after = live.filter((p) => p.at >= reached.at + MINUTE_MS);
  return after.length === 0 ? fetched : [...fetched, ...after];
}

/**
 * Whether a multi-day series covers `want` sessions — counting the session
 * that is running now (`runningDay`, its New York date, or null when none is)
 * even before it has a point.
 *
 * WHY. At 09:30 ET the week's window turns to include today, and for the first
 * minutes nothing has a bar of it: Polygon publishes a five-minute bucket once
 * it is complete, the gateway runs twenty minutes behind, the store captures
 * in the evening. The route then serves six sessions for a seven-session week,
 * and counting only those threw the chart back to seven daily closes ending
 * yesterday — six straight segments — every morning, for five to fifteen
 * minutes. Six sessions and the one that has just opened ARE the week.
 */
export function coversSessions(
  points: readonly { at: number }[],
  want: number,
  runningDay: string | null,
): boolean {
  const days = new Set<string>();
  for (const p of points) {
    if (Number.isFinite(p.at)) days.add(easternDayOf(p.at));
  }
  if (runningDay !== null) days.add(runningDay);
  return days.size >= want;
}

/**
 * A finished session, ended on its OFFICIAL close.
 *
 * Every intraday series stops short of it: minute bars at 15:59 and buckets at
 * 15:30, whose closes are the last continuous trade, while the official close
 * prints in the closing cross at the bell — the figure the page's "Previous
 * close" card shows once the session is the last completed one. Measured 23
 * Sep 2026: AAPL's last minute 336.95, its close 337.02. Without this point a
 * chart drawn while the market is shut ends a few cents from the dashed line
 * that carries the card's figure, which is the complaint that asked for it.
 *
 * Intraday series: the close is placed at the bell of the last point's day,
 * or corrects a point already there. Daily series (`daily`, with the `day`
 * the close belongs to): the close is that day's bar, stamped at New York
 * midnight as the feed stamps them, appended if the series has not reached it
 * yet or correcting its price if it has.
 *
 * Nothing happens before the bell has rung (`nowMs`): a running session has
 * no official close, and a daily bar's "close" then is just its latest trade.
 */
export function endOnClose<T extends Point>(
  points: T[],
  close: number | null,
  nowMs: number,
  opts: { daily?: boolean; day?: string } = {},
): Array<T | Point> {
  if (close === null || !Number.isFinite(close) || close <= 0) return points;
  const last = points.at(-1);
  if (!last) return points;

  const day = opts.day ?? easternDayOf(last.at);
  const bell = bellOf(day);
  if (bell === null || nowMs < bell) return points;

  const stamp = opts.daily ? midnightOf(day) : bell;
  if (stamp === null) return points;
  if (!opts.daily && easternDayOf(last.at) !== day) return points;

  const point: Point = { at: stamp, price: close, open: close, high: close, low: close, volume: null };
  if (last.at === stamp) {
    return [
      ...points.slice(0, -1),
      {
        ...last,
        price: close,
        high: Math.max(last.high ?? close, close),
        low: Math.min(last.low ?? close, close),
      },
    ];
  }
  if (last.at < stamp) return [...points, point];
  return points;
}
