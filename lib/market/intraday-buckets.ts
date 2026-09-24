import type { RawHistoryPoint } from "../api/clients/quotes.ts";
import { closingBell } from "./official-close.ts";
import { regularCloseMinute } from "./session.ts";

/* Minute bars, reduced to the grid a chart can actually draw.
 *
 * WHY THIS EXISTS AT ALL. The gateway answers one-minute bars for the CURRENT
 * session and keeps nothing afterwards — there is no endpoint that will answer
 * for a past day. (The vendor catalog advertises `range=1d` and `range=5d`;
 * the API rejects both with "Invalid range format. Use [num][y/m]".) So a week
 * of intraday detail can exist only if this system keeps it, and what it keeps
 * has to fit: `market.sections` already holds 217MB of a 500MB ceiling.
 *
 * Measured against a real session, one symbol-day is ~49KB at one minute and
 * ~5KB at ten. Across the hot set for five sessions that is ~1GB against
 * ~110MB. Ten-minute buckets are what makes full coverage affordable, and
 * across a week on a chart a few hundred pixels wide the difference is not
 * visible — 1-minute detail is kept where it IS visible, which is the day, and
 * the day is served live from the gateway rather than from here.
 *
 * Columnar, matching `storedHistory` in ./store/sections.ts: six parallel
 * arrays name their fields once instead of once per bar.
 */
export type IntradayColumns = {
  /** ISO-8601 UTC, stamped at the bucket's own boundary. */
  date: string[];
  price: number[];
  opening: number[];
  high: number[];
  low: number[];
  volume: number[];
};

/* Ten minutes, and the number is a storage decision measured rather than
   preferred: a real full session is ~49KB per symbol at one minute and ~5KB at
   ten, against a database already at 288MB of a 500MB ceiling. Across the hot
   set for five sessions that is ~1GB versus ~110MB. */
export const BUCKET_MINUTES = 10;

/* Seven TRADING days. Aayush's definition, and it is a product decision rather
 * than one to be derived.
 *
 * Trading days, so Saturday and Sunday are not counted and not drawn — seven
 * sessions span about nine calendar days. Standing on a Wednesday the window
 * runs from the Monday of the week before through today.
 *
 * It has been five and briefly six while I guessed at what "a week" meant here;
 * it is seven because that is what was asked for. The storage estimate that
 * once argued for five is wrong by an order of magnitude and should not be
 * allowed to argue against an eighth: it guessed ~5KB per symbol per session,
 * but measured on the live table after the first real capture a whole session
 * is 1.79MB across the entire set — 415 bytes a symbol once jsonb TOAST
 * compression has had it. Seven sessions cost about 12MB against a 318MB
 * database. */
export const SESSIONS_KEPT = 7;

const empty = (): IntradayColumns => ({
  date: [],
  price: [],
  opening: [],
  high: [],
  low: [],
  volume: [],
});

const num = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) ? v : null;

/**
 * Aggregate one-minute bars into buckets of `minutes`.
 *
 * Each field aggregates differently, and getting one wrong draws a candle that
 * never traded: the open is the FIRST open in the bucket, the close the LAST
 * price, the high the maximum, the low the minimum, the volume the sum.
 *
 * A bucket with no trades is ABSENT rather than flat. A thin name goes minutes
 * at a time without a print — ASND printed 239.1, 241, 239.29 on about a
 * thousand shares a minute the morning this was written — and carrying the
 * last price forward across those minutes would draw exactly the straight
 * lines this change was asked to remove. A gap is the honest shape of no
 * trading, and the chart already knows how to leave one.
 */
export function bucketIntraday(
  rows: readonly RawHistoryPoint[],
  minutes: number,
): IntradayColumns {
  if (!Array.isArray(rows) || rows.length === 0 || !(minutes > 0)) return empty();

  const span = minutes * 60_000;

  /* Keyed by bucket start rather than accumulated in sequence, so a row that
     arrives out of order lands in its own bucket instead of extending whatever
     came before it. The gateway has answered in order every time it has been
     observed, which is precisely the kind of thing that holds until it does
     not, and the failure would be silent. */
  const buckets = new Map<number, { o: number; c: number; h: number; l: number; v: number }>();

  for (const row of rows) {
    const at = Date.parse(String(row?.date ?? ""));
    const price = num(row?.price);
    /* A bar with no usable price is not a bar. Letting it through would put a
       NaN on the axis, which scales the whole chart to nothing. */
    if (!Number.isFinite(at) || price === null) continue;

    const key = Math.floor(at / span) * span;
    const open = num(row?.opening) ?? price;
    const high = num(row?.high) ?? price;
    const low = num(row?.low) ?? price;
    const volume = num(row?.volume) ?? 0;

    const found = buckets.get(key);
    if (!found) {
      buckets.set(key, { o: open, c: price, h: high, l: low, v: volume });
      continue;
    }

    /* `o` is deliberately not reassigned: the first row to land in a bucket
       owns its open, whatever order the rest arrive in. */
    found.c = price;
    if (high > found.h) found.h = high;
    if (low < found.l) found.l = low;
    found.v += volume;
  }

  const out = empty();
  for (const key of [...buckets.keys()].sort((a, b) => a - b)) {
    const b = buckets.get(key);
    if (!b) continue;
    out.date.push(new Date(key).toISOString());
    out.opening.push(b.o);
    out.price.push(b.c);
    out.high.push(b.h);
    out.low.push(b.l);
    out.volume.push(b.v);
  }
  return out;
}

/* Held rather than built per call. Constructing an Intl.DateTimeFormat costs
   ~25us against ~0.4us to reuse one, and this runs once per bar across 4,400
   symbols in a capture. */
const EASTERN_DAY = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/New_York",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** Which Eastern calendar day a bar belongs to. */
export function easternDay(iso: string): string {
  /* The session runs 04:00-20:00 Eastern and straddles midnight UTC, so a UTC
     date would split one session across two days. */
  return EASTERN_DAY.format(new Date(iso));
}

/**
 * How many distinct TRADING days a run of instants covers.
 *
 * Eastern days, not the reader's. A US session runs 04:00-20:00 in New York,
 * which is 13:30 to 05:30 the next morning in India — so counted in the
 * reader's zone one session looks like two days, and a week would look like
 * ten. The question this answers is "how many sessions do we actually have",
 * and a session is a fact about New York.
 */
export function sessionsAt(instants: readonly number[]): number {
  const days = new Set<string>();
  for (const at of instants) {
    if (!Number.isFinite(at)) continue;
    days.add(EASTERN_DAY.format(at));
  }
  return days.size;
}

/**
 * The most recent stored session out of the five.
 *
 * What the 1D chart falls back to when the market is shut. The live gateway
 * has nothing then — it keeps a session's minute bars only while that session
 * runs — so without this the day view is simply blank, which is what it has
 * been outside trading hours all along.
 *
 * Coarser than the live view: ten-minute buckets rather than one-minute, about
 * ninety points rather than several hundred. Keeping a one-minute copy of the
 * last session for every hot symbol would cost ~216MB against a database with
 * ~200MB of headroom, and ninety points of the last real session is a great
 * deal more than nothing.
 */
export function lastSession(series: IntradayColumns): IntradayColumns {
  const out: IntradayColumns = { date: [], price: [], opening: [], high: [], low: [], volume: [] };
  if (series.date.length === 0) return out;

  const newest = easternDay(series.date[series.date.length - 1]);
  for (let i = 0; i < series.date.length; i += 1) {
    if (easternDay(series.date[i]) !== newest) continue;
    out.date.push(series.date[i]);
    out.price.push(series.price[i]);
    out.opening.push(series.opening[i]);
    out.high.push(series.high[i]);
    out.low.push(series.low[i]);
    out.volume.push(series.volume[i]);
  }
  return out;
}

/**
 * One row per bar for the given sessions, taking each session from whichever
 * source actually covers it.
 *
 * WHY PER SESSION. The gateway's intraday window is the finer source — one
 * minute — but its archive has holes: for 16 Sep 2026 it held 14 to 20 bars for
 * AAPL, MSFT and TSLA against the 391 a session has, even asked for that day
 * alone, and a chart drawn from 18 points across six and a half hours is a
 * handful of straight segments. The store's ten-minute buckets were captured
 * from the LIVE session, when every minute existed, so a day the archive lost
 * may still be whole there. Covered minutes decide it: a bucket covers its
 * width, a gateway bar covers one minute.
 *
 * Each source's rows are expected already limited to the regular session and
 * listed finest first; the result is rows, ready for bucketIntraday.
 */
export function pickSessions(
  days: readonly string[],
  sources: ReadonlyArray<{ rows: readonly RawHistoryPoint[]; width: number }>,
): RawHistoryPoint[] {
  const split = (rows: readonly RawHistoryPoint[]) => {
    const byDay = new Map<string, RawHistoryPoint[]>();
    for (const row of rows) {
      const at = Date.parse(String(row?.date ?? ""));
      if (!Number.isFinite(at)) continue;
      const day = easternDay(new Date(at).toISOString());
      (byDay.get(day) ?? byDay.set(day, []).get(day)!).push(row);
    }
    return byDay;
  };
  const byDay = sources.map((src) => ({ width: src.width, days: split(src.rows) }));

  const out: RawHistoryPoint[] = [];
  for (const day of days) {
    /* Minutes each source SPANS: n rows w minutes apart span (n - 1) x w + 1.
       A full session is 391 whether it is 391 one-minute rows or 40 ten-minute
       buckets; counting n x w instead once scored forty buckets at 400 and
       swapped a whole week of minutes for buckets. Sources are listed finest
       first, and a later one wins only when it covers CLEARLY more (10%) —
       the hole it exists to fill, not a rounding difference. */
    let best: RawHistoryPoint[] = [];
    let bestSpan = 0;
    for (const src of byDay) {
      const rows = src.days.get(day) ?? [];
      const span = rows.length > 0 ? (rows.length - 1) * src.width + 1 : 0;
      if (best.length === 0 ? span > 0 : span > bestSpan * 1.1) {
        best = rows;
        bestSpan = span;
      }
    }
    out.push(...best);
  }
  return out;
}

/** Columns back into rows, for merging with row-shaped sources. */
export function columnsToRows(c: IntradayColumns): RawHistoryPoint[] {
  return c.date.map((date, i) => ({
    date,
    price: c.price[i],
    opening: c.opening[i],
    high: c.high[i],
    low: c.low[i],
    volume: c.volume[i],
  })) as RawHistoryPoint[];
}

/* A bar is judged by where it STARTS, in [09:30, the day's close) New York —
   16:00, or 13:00 on a half-day. For an aggregate the stamp is where the
   bucket begins, so a bucket starting at the bell is post-market from its
   first second and is dropped, while the one before it closes on the last
   continuous trade. The gateway's minute rows are judged the same way: its
   16:00 row is a post-market print (measured 23 Sep 2026), not the close.
   The official close is drawn at the bell by withOfficialCloses instead. */
const ET_DAY_MINUTE = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/New_York",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/* One format() and a regex rather than formatToParts: a year of 30-minute
   bars is ~8,000 of them with extended hours, and on a shared CPU that
   difference is the route's. The parts path stays as the fallback should the
   locale ever print differently. */
const STAMP = /^(\d{4})-(\d{2})-(\d{2})\D+(\d{2}):(\d{2})/;

function easternStamp(ms: number): { day: string; minute: number } {
  const m = STAMP.exec(ET_DAY_MINUTE.format(ms));
  if (m) return { day: `${m[1]}-${m[2]}-${m[3]}`, minute: Number(m[4]) * 60 + Number(m[5]) };
  const parts = ET_DAY_MINUTE.formatToParts(ms);
  const get = (t: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === t)?.value ?? "";
  return {
    day: `${get("year")}-${get("month")}-${get("day")}`,
    minute: Number(get("hour")) * 60 + Number(get("minute")),
  };
}

const inSession = ({ day, minute }: { day: string; minute: number }) =>
  minute >= 9 * 60 + 30 && minute < regularCloseMinute(day);

/** Whether a bar starting at `ms` is inside that day's regular session. */
export function startsInRegularSession(ms: number): boolean {
  return Number.isFinite(ms) && inSession(easternStamp(ms));
}

/**
 * Polygon aggregate bars as the chart's columns, limited to the regular
 * session and to the given trading days, oldest first, de-duplicated (the
 * chunked requests overlap at their edges).
 */
export function aggsToColumns(
  bars: ReadonlyArray<{ t: number; o: number; h: number; l: number; c: number; v?: number }>,
  days: readonly string[],
): IntradayColumns {
  const wanted = new Set(days);
  const seen = new Set<number>();
  const kept = bars
    .filter((b) => Number.isFinite(b?.t) && Number.isFinite(b?.c))
    .filter((b) => {
      const at = easternStamp(b.t);
      return wanted.has(at.day) && inSession(at);
    })
    .filter((b) => (seen.has(b.t) ? false : (seen.add(b.t), true)))
    .sort((a, b) => a.t - b.t);
  return {
    date: kept.map((b) => new Date(b.t).toISOString()),
    price: kept.map((b) => b.c),
    opening: kept.map((b) => b.o),
    high: kept.map((b) => b.h),
    low: kept.map((b) => b.l),
    volume: kept.map((b) => b.v ?? 0),
  };
}

/**
 * A finished session, ended on its OFFICIAL close.
 *
 * Minute bars stop at 15:59, whose close is the last continuous trade; the
 * official close prints in the closing cross at 16:00:00 — 13:00 on a half-day
 * — and is the figure the "Previous close" card shows. Without this point the
 * day chart ended a few cents away from the number printed beneath it (336.95
 * against 337.02 on 23 Sep 2026). It is a real price at its real time, added
 * only where the series stops short of the bell.
 */
export function withOfficialClose(
  series: IntradayColumns,
  day: string,
  close: number | null,
  nowMs: number = Number.POSITIVE_INFINITY,
): IntradayColumns {
  if (close === null) return series;
  const bell = closingBell(day);
  /* A session still running has no official close yet — a partial daily bar's
     "close" is just the latest trade. */
  if (bell === null || nowMs < bell) return series;
  return withOfficialCloses(series, new Map([[day, close]]));
}

/**
 * Every session in a series, each ended on its own official close at its own
 * bell — what the week, month, quarter and year draw, so that no session in
 * them ends on 15:59's last trade and the last one ends on the figure the page
 * prints as the close.
 *
 * `closes` holds only closes that exist (officialCloses in official-close.ts
 * decides, including "not yet" for a session still running). A day with a
 * close and nothing drawn stays undrawn: one dot is not a session.
 */
export function withOfficialCloses(
  series: IntradayColumns,
  closes: ReadonlyMap<string, number>,
): IntradayColumns {
  if (closes.size === 0 || series.date.length === 0) return series;
  const out = empty();
  const push = (i: number) => {
    out.date.push(series.date[i]);
    out.price.push(series.price[i]);
    out.opening.push(series.opening[i]);
    out.high.push(series.high[i]);
    out.low.push(series.low[i]);
    out.volume.push(series.volume[i]);
  };
  let added = 0;
  let nextDay = easternDay(series.date[0]);
  for (let i = 0; i < series.date.length; i += 1) {
    push(i);
    const day = nextDay;
    nextDay = i + 1 < series.date.length ? easternDay(series.date[i + 1]) : "";
    if (nextDay === day) continue;
    /* The last point of this day's session. */
    const close = closes.get(day);
    const bell = closingBell(day);
    if (close === undefined || !Number.isFinite(close) || close <= 0 || bell === null) continue;
    if (!(Date.parse(series.date[i]) < bell)) continue;
    out.date.push(new Date(bell).toISOString());
    out.price.push(close);
    out.opening.push(close);
    out.high.push(close);
    out.low.push(close);
    out.volume.push(0);
    added += 1;
  }
  return added > 0 ? out : series;
}
