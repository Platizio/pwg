import { bellOf } from "./regular-session.ts";
import { easternTime } from "./session.ts";
import { tradingDays } from "./session-window.ts";
import type { RangeDef, RangeId } from "./types";

/* How far back the chart looks, and where each answer comes from.

   These definitions used to describe how to fabricate a series: a sample
   count, a volatility, a drift and a candle bucket size, all feeding a seeded
   generator. Nothing generates a price any more, so what a range needs to say
   now is simply which feed answers it and how much of that feed to show.

   Everything but the day is a slice of one five-year daily pull the snapshot
   already holds — asking the gateway for a week returns the same five rows
   that slice contains. Only the day needs its own call, because minute bars
   come from a different endpoint. */
export const RANGES: RangeDef[] = [
  { id: "1D", label: "1D", source: "intraday", intraday: true, interval: "prices, one a minute" },
  /* Five daily closes until 2026-09-21 — five points for a week, which is the
     straight line readers kept reporting. It is a week of ten-minute buckets
     now, fetched from the stored sessions: no `sessions` slice, because the
     fetched series IS the week and slicing five rows off it would draw the
     last fifty minutes. */
  /* No `sessions`, deliberately, and the omission is load-bearing: price-chart
     slices its source to `sessions` rows, so a five here would cut the fetched
     week — 480 ten-minute buckets — down to its last fifty minutes while still
     calling itself 1W. The week arrives already being exactly a week.
     The five-close fallback, for before the store has intraday sessions to
     draw from, is sized in instrument-view.tsx where the choice is made. */
  { id: "1W", label: "1W", source: "daily", intraday: false, interval: "prices, every 5 minutes" },
  { id: "1M", label: "1M", source: "daily", sessions: 21, intraday: false, interval: "prices, every 15 minutes" },
  { id: "3M", label: "3M", source: "daily", sessions: 64, intraday: false, interval: "prices, every 30 minutes" },
  { id: "1Y", label: "1Y", source: "daily", sessions: 252, intraday: false, interval: "prices, every 30 minutes" },
  { id: "5Y", label: "5Y", source: "daily", intraday: false, interval: "daily closes" },
];

/* A year, so a reader arriving while the market is shut still sees a chart:
   the day is the one range whose emptiness is a real state rather than a
   failure. */
export const DEFAULT_RANGE: RangeId = "1Y";

export function getRange(id: string): RangeDef {
  return RANGES.find((r) => r.id === id) ?? RANGES[4];
}

/* ------------------------------------------------------------------ */
/* What the chart says it is showing                                   */
/* ------------------------------------------------------------------ */

/* The reader's clock, and the zone named so it cannot be mistaken.
 *
 * Every timestamp here was UTC with no suffix once, so a US equity's day axis
 * opened at 13:30 and a reader in Mumbai could not tell whether that was a New
 * York hour, their own, or neither. The fix then was to state New York.
 *
 * That was still the wrong clock for the person reading it. A reader in India
 * watches the US session between 7pm and 1:30am — that is when they are at the
 * screen, that is what their own clock says, and an axis labelled 09:30 while
 * they sit down at 19:00 is asking them to do the arithmetic on every glance.
 * So the axis is THEIR zone, and the caption names it, which is what makes the
 * change safe: the previous fault was never the zone, it was the silence about
 * which zone.
 *
 * ET remains the fallback for the one case that cannot be asked — a runtime
 * that will not resolve a zone — because the session is a fact about New York
 * and a wrong guess about the reader is worse than an honest default.
 *
 * Safe to read at module scope only because the chart is client-only
 * (`dynamic(..., { ssr: false })` in instrument-view.tsx). Resolved lazily all
 * the same: this module is imported by lib/market/instrument.ts on the server,
 * where the answer would be the host's UTC and quietly wrong if it were ever
 * used there. */
const ET_ZONE = "America/New_York";

export function readerZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || ET_ZONE;
  } catch {
    return ET_ZONE;
  }
}

/* Built per zone rather than per call: constructing an Intl formatter is the
   expensive part, and the chart re-captions on every tick. */
const FORMATTERS = new Map<string, Intl.DateTimeFormat[]>();

function formattersFor(zone: string): Intl.DateTimeFormat[] {
  const held = FORMATTERS.get(zone);
  if (held) return held;
  const made = [
    new Intl.DateTimeFormat("en-US", { timeZone: zone, month: "short", day: "numeric" }),
    new Intl.DateTimeFormat("en-US", {
      timeZone: zone,
      month: "short",
      day: "numeric",
      year: "numeric",
    }),
    new Intl.DateTimeFormat("en-US", {
      timeZone: zone,
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
    }),
    new Intl.DateTimeFormat("en-US", { timeZone: zone, year: "numeric" }),
  ];
  FORMATTERS.set(zone, made);
  return made;
}

/* A label that is a bare offset tells the reader nothing they did not already
   know from the number beside it. */
const OFFSET_ONLY = /^(GMT|UTC)[+-]/;

/* The zone is NAMED in en-US, like every date in the terminal, and not in the
   reader's locale. The rule for the chart is that its clock is labelled "India
   Time", and asked in the reader's locale it was not: en-IN and hi-IN call
   Asia/Kolkata "IST" in both styles (measured in Node's ICU, 24 Sep 2026), so
   the label depended on a browser setting the reader never chose for this
   page. en-US has no abbreviation for India — its `short` is "GMT+5:30" — so
   the generic name below always answers: "India Time". */
const ZONE_NAMES_IN = "en-US";

/* Held, because this is on the chart's hot path and CONSTRUCTING an
   Intl.DateTimeFormat is the expensive part of using one — measured on this
   machine at 24-29us to build-and-use against 0.4-2.1us to reuse, a factor of
   thirty. `formatStamp` calls zoneLabel on every crosshair move, and asking for
   two names doubled that cost the day it was added. The INSTANCE is cached, not
   the answer: `formatToParts(at)` still runs per call, so EDT still becomes EST
   at the moment it should. */
const NAMERS = new Map<string, Intl.DateTimeFormat | null>();

function zoneNamer(zone: string, timeZoneName: "short" | "shortGeneric"): Intl.DateTimeFormat | null {
  const key = `${zone}|${timeZoneName}`;
  const held = NAMERS.get(key);
  if (held !== undefined) return held;
  let made: Intl.DateTimeFormat | null = null;
  try {
    made = new Intl.DateTimeFormat(ZONE_NAMES_IN, { timeZone: zone, timeZoneName });
  } catch {
    made = null;
  }
  NAMERS.set(key, made);
  return made;
}

/**
 * What to call the zone in the caption and on a stamp.
 *
 * TWO ATTEMPTS. `short` is the right answer when there is an abbreviation for
 * the zone — "EDT" for New York. But with no abbreviation it falls back to a
 * bare offset, and the case where that bites is exactly ours: India comes back
 * "GMT+5:30", which does not help a reader who has just asked why the chart is
 * not in Indian time.
 *
 * So when `short` comes back as nothing but an offset, ask again for the
 * generic name — "India Time", "United Kingdom Time". The offset survives as
 * the last resort, unambiguous even when it is ugly.
 */
export function zoneLabel(zone: string = readerZone(), at: number = Date.now()): string {
  const read = (timeZoneName: "short" | "shortGeneric"): string | null => {
    try {
      const parts = zoneNamer(zone, timeZoneName)?.formatToParts(at);
      return parts?.find((p) => p.type === "timeZoneName")?.value ?? null;
    } catch {
      return null;
    }
  };

  const short = read("short");
  if (short !== null && !OFFSET_ONLY.test(short)) return short;
  return read("shortGeneric") ?? short ?? zone;
}

const COUNT = new Intl.NumberFormat("en-US");

/* Read off the plotted points, never computed from today. The window is a
   tail-slice of rows: if the feed's last row is Friday and today is Tuesday,
   1W is last Mon-Fri, and only the real first and last timestamps show it. */
function spanOf(firstMs: number | null, lastMs: number | null, zone: string): string | null {
  if (firstMs === null || lastMs === null) return null;
  if (!Number.isFinite(firstMs) || !Number.isFinite(lastMs)) return null;

  const [DAY, DAY_YEAR, WEEKDAY, YEAR] = formattersFor(zone);
  const firstDay = WEEKDAY.format(firstMs);
  const lastDay = WEEKDAY.format(lastMs);
  /* One session is a date, not a range from a date to itself. */
  if (firstDay === lastDay) return lastDay;

  /* An en dash, and the year stated once when both ends share it. */
  const sameYear = YEAR.format(firstMs) === YEAR.format(lastMs);
  return `${sameYear ? DAY.format(firstMs) : DAY_YEAR.format(firstMs)} \u2013 ${DAY_YEAR.format(lastMs)}`;
}

/**
 * One line under the chart saying exactly what is drawn:
 *
 *     1M \u00b7 21 daily closes \u00b7 Aug 4 \u2013 Sep 1, 2026 \u00b7 IST
 *
 * `count` is the number of points actually plotted, not the range's nominal
 * `sessions` \u2014 a short feed draws fewer, and claiming 252 while drawing 200 is
 * the same class of untruth the rest of this file exists to avoid.
 */
export function rangeCaption(
  def: RangeDef,
  firstMs: number | null,
  lastMs: number | null,
  count: number,
  /* Injected so a test can pin a zone rather than inherit the machine's. */
  zone: string = readerZone(),
): string {
  const parts: string[] = [def.label];

  parts.push(count > 0 ? `${COUNT.format(count)} ${def.interval}` : def.interval);

  const span = spanOf(firstMs, lastMs, zone);
  /* No span means no dates to stamp, and a lone zone name would be labelling
     nothing. An empty day says what it would have drawn and stops. */
  if (span) {
    parts.push(span);
    parts.push(zoneLabel(zone, lastMs ?? undefined));
  }

  return parts.join(" \u00b7 ");
}

/* What each range is called in a sentence. */
const RANGE_NOUN: Record<RangeId, string> = {
  "1D": "the day",
  "1W": "the week",
  "1M": "the month",
  "3M": "three months",
  "1Y": "the year",
  "5Y": "five years",
};

/**
 * What an empty chart says, by why it is empty.
 *
 * It used to say one thing whatever the reason. Pressing 5Y printed "No price
 * history is available for this stock." for the second or so the store read
 * takes from Render (MSFT 1.12s, NVDA 0.83s, measured 24 Sep 2026) \u2014 and for
 * as long as a 503 lasted, retried every thirty seconds under a sentence
 * saying there was nothing to retry for. Loading and failing now say so; the
 * old sentences stay for an answer that really had nothing in it.
 *
 * `state` is the fetch's (use-history.ts), for the ranges drawn from it;
 * `note` the day's own reason, when the route gave one.
 */
export function emptyChartText(
  range: RangeId,
  state: "idle" | "loading" | "ready" | "empty" | "failed" | null | undefined,
  note: string | null,
): string {
  if (state === "loading") return `Loading ${RANGE_NOUN[range]}\u2026`;
  if (state === "failed") return "These prices could not be loaded just now. Trying again shortly.";
  if (getRange(range).source === "intraday") return note ?? "No trades yet this session.";
  return "No price history is available for this stock.";
}

/**
 * Whether the chart's visible window shows every point of a series `count`
 * long \u2014 the fitted view, as opposed to one the reader zoomed or panned.
 *
 * WHY. The chart refitted itself whenever the series changed length, and
 * since 1W to 1Y began ending on the live price their length changes all
 * session \u2014 a new bucket every 5 to 30 minutes, a new point a minute on the
 * day. A reader zoomed into the last month of the year was thrown back to the
 * whole year each time. A view that already showed everything is refitted, so
 * the new point is on screen; any other view is the reader's and is left alone.
 *
 * Logical indices, as lightweight-charts reports them: the first point is 0,
 * the last `count - 1`, and the fitted view runs a little past it on the right.
 */
export function viewShowsAll(
  visible: { from: number; to: number } | null,
  count: number,
): boolean {
  if (visible === null || count <= 0) return true;
  return visible.from <= 0.5 && visible.to >= count - 1.5;
}

/* ------------------------------------------------------------------ */
/* Which ranges the page does not carry                                */
/* ------------------------------------------------------------------ */

/**
 * The ranges fetched on demand rather than shipped with the page.
 *
 * The instrument page carries the range it OPENS with — a year of daily bars —
 * and 1M and 3M are slices of that same year, so they need no request and stay
 * instant. What is left is the three it genuinely does not hold: the week and
 * the day, which are drawn from stored intraday sessions, and five years,
 * which is thirteen hundred bars nobody should download to look at a one-year
 * chart.
 *
 * The page used to ship all of them at once — the company's five years and the
 * benchmark's, 2,549 bars, 234KB of a 438KB payload, on every click — and on a
 * 512MB instance three such renders were enough to kill the process.
 */
export const FETCHED_RANGES = ["1D", "1W", "1M", "3M", "1Y", "5Y"] as const;

export type FetchedRange = (typeof FETCHED_RANGES)[number];

/**
 * The range a caller asked for, or null.
 *
 * 1M, 3M and 1Y are refused rather than merely absent from the list, and the
 * difference is worth stating: they are valid ranges that this path must not
 * answer for, because answering would spend a request on bars the reader is
 * already holding.
 *
 * Nothing is defaulted. A typo that silently fetched something would have that
 * something charted as though it were what was asked for.
 */
export function parseFetchedRange(value: string | null | undefined): FetchedRange | null {
  return typeof value === "string" && (FETCHED_RANGES as readonly string[]).includes(value)
    ? (value as FetchedRange)
    : null;
}

/**
 * How the caption names the spacing of a line's points.
 *
 * "Prices, every 15 minutes" rather than "15-minute bars": every range is drawn
 * as a LINE, and "bars" read to a reader as a bar chart — which this is not.
 */
export function spacingLabel(minutes: number): string {
  return minutes <= 1 ? "prices, one a minute" : `prices, every ${minutes} minutes`;
}

/**
 * The spacing of each intraday range's points, in minutes — the same fact the
 * range's caption states in words, as a number the live tail can bucket to.
 *
 * 1W/1M/3M/1Y end on the live price by folding today's minutes into buckets
 * this wide (withLiveSession in regular-session.ts), so the tail joins the
 * fetched series at the spacing it was drawn in. Five years is daily closes
 * and never bucketed.
 */
export const SPACING_MINUTES: Partial<Record<RangeId, number>> = {
  "1D": 1,
  "1W": 5,
  "1M": 15,
  "3M": 30,
  "1Y": 30,
};

/* ------------------------------------------------------------------ */
/* How long a fetched range may be kept                                */
/* ------------------------------------------------------------------ */

/* Short for the intraday ranges, which gain a session each evening and whose
   "last session" changes identity at the bell; long for five years, which
   gains one bar a day. Refetched in the background while the held points stay
   on screen, so a failed refresh never blanks a drawn chart. */
export const HISTORY_TTL_MS: Record<FetchedRange, number> = {
  "1D": 5 * 60_000,
  "1W": 5 * 60_000,
  "1M": 15 * 60_000,
  "3M": 60 * 60_000,
  "1Y": 3 * 60 * 60_000,
  "5Y": 3 * 60 * 60_000,
};

/* How soon an empty answer or a failure is asked again — and the soonest an
 * answer that fell short of the open or the bell is (historyNextFetch).
 *
 * Both used to stand far longer. An empty series was cached like a full one,
 * so a single bad moment upstream left 1Y blank for three hours; a failure was
 * never retried at all until the reader pressed another range. Half a minute
 * is the route's own max-age, so a retry is never answered from a cache that
 * has not had the chance to change. */
export const HISTORY_RETRY_MS = 30_000;

/* ------------------------------------------------------------------ */
/* When a held answer is asked for again                               */
/* ------------------------------------------------------------------ */

/* BY WHAT IT REACHES, NOT BY THE PHASE IT WAS FETCHED IN.
 *
 * The rule this replaces bound 1D and 1W to the phase: an answer fetched on
 * the other side of the open or the bell was dropped on the spot, drawn as
 * nothing, and fetched again. Two things went wrong with it.
 *
 *   The refetch landed too soon to help. At 09:30 no source has a bar of
 *   today — Polygon publishes a bucket once it is complete, measured 1.5 to 12
 *   minutes behind on 24 Sep 2026; the gateway ran 20-22 minutes behind — so
 *   the week came back six sessions long and the chart fell to seven daily
 *   closes ending yesterday, and the day at 16:00 came back without its
 *   16:00 bar. Each was then kept for the full five-minute TTL, and the
 *   route's own five-minute fetch cache handed the same body back once more.
 *
 *   And it bound only the day and the week. After the bell 1M, 3M and 1Y —
 *   1Y is the range a page opens on — kept an answer fetched at 15:00 for up
 *   to three hours, ending on the 15:59 trade while 1D ended on the official
 *   close: two last prices for one session.
 *
 * So an answer is judged by whether it reaches the last boundary that has
 * passed (historyTarget). One asked for BEFORE that boundary, and short of it,
 * is due at once. One asked for after it and still short — upstream has not
 * caught up — is asked again in half a minute, then less often as the
 * boundary recedes: a quarter of the time since it, never longer than the
 * TTL. A feed a minute or two behind is caught within half a minute of
 * catching up, and a symbol that never gets the bar costs a handful of
 * requests, not one every thirty seconds.
 *
 * Nothing held is dropped meanwhile. The chart reconciles an answer from the
 * other side of a boundary with the live session on its own (pickDaySeries,
 * withLiveSession in regular-session.ts), and a chart that goes blank to be
 * refetched shows the reader less than the one it replaced. */

/** What the cache knows about a held answer. */
export type HeldHistory = {
  /** How many points it carried. */
  count: number;
  /** When it landed, epoch ms. */
  at: number;
  /** Its newest point, epoch ms; null when it had none. */
  lastAt: number | null;
};

/* The ranges drawn from minutes, whose newest session moves with the clock.
   Five years is the store's daily closes, one bar a day. */
const SESSION_RANGES: ReadonlySet<FetchedRange> = new Set(["1D", "1W", "1M", "3M", "1Y"]);

/* The ranges whose TODAY comes from the fetch. The month, quarter and year
   take today from the live tail while it trades (withLiveSession), so their
   fetch is only asked to reach the session before — refetching a year at the
   open would buy nothing the tail does not already draw. */
const TODAY_FROM_FETCH: ReadonlySet<FetchedRange> = new Set(["1D", "1W"]);

/** 09:30 New York, seconds into the day. */
const OPEN_S = 9 * 3600 + 30 * 60;

const openOf = (day: string): number | null => {
  const at = easternTime(day, OPEN_S);
  return at === null ? null : at * 1000;
};

/**
 * What an answer for `range` should reach at `nowMs`, and since when.
 *
 * After a bell and until the next open: that bell, where the route stamps the
 * session's official close. While a session runs: its open, for the day and
 * the week (a point of today), and the previous bell for the rest. Null for
 * five years, which has no session to reach. Half-days and holidays come from
 * the one calendar (tradingDays, bellOf).
 */
export function historyTarget(
  range: FetchedRange,
  nowMs: number,
): { reach: number; since: number } | null {
  if (!SESSION_RANGES.has(range) || !Number.isFinite(nowMs)) return null;
  /* The last two sessions that have STARTED: today's counts from 09:30. */
  const [before, day] = tradingDays(nowMs, 2);
  if (!day) return null;
  const bell = bellOf(day);
  if (bell === null) return null;
  if (nowMs >= bell) return { reach: bell, since: bell };
  const reach = TODAY_FROM_FETCH.has(range) ? openOf(day) : before ? bellOf(before) : null;
  return reach === null ? null : { reach, since: reach };
}

/**
 * When the next fetch for a range is due, epoch ms: at or before now means now.
 *
 * A held answer that reaches its target lasts its TTL; one that falls short is
 * due as the note above says; an empty one is asked again in HISTORY_RETRY_MS.
 * A failure is retried HISTORY_RETRY_MS after it, whatever is held — held
 * points stay drawn meanwhile.
 */
export function historyNextFetch(
  held: HeldHistory | undefined,
  failedAt: number | undefined,
  range: FetchedRange,
  nowMs: number,
): number {
  let due = 0;
  if (held) {
    const ttl = HISTORY_TTL_MS[range];
    const target = held.count > 0 ? historyTarget(range, nowMs) : null;
    const short = target !== null && (held.lastAt === null || held.lastAt < target.reach);
    if (held.count === 0) due = held.at + HISTORY_RETRY_MS;
    else if (!short) due = held.at + ttl;
    else if (held.at < target.since) due = 0;
    else due = held.at + Math.min(ttl, Math.max(HISTORY_RETRY_MS, (held.at - target.since) / 4));
  }
  if (failedAt !== undefined) due = Math.max(due, failedAt + HISTORY_RETRY_MS);
  return due;
}

/**
 * Whether a new answer replaces the one held: not when it reaches less far.
 *
 * A refetch never moves the chart backwards — the same rule chart-tail.ts
 * keeps for a single tick. Measured case: at 09:30 the day's route has no bar
 * of today, and falls back to the store's ten-minute buckets of yesterday,
 * which stop at 15:50; the answer held from before the open is yesterday's
 * every minute, ending on the official close at 16:00. Taking the newer
 * answer only because it is newer swapped the better copy of the same session
 * for the worse. An empty answer never replaces points either. As far or
 * further, the newer copy wins.
 */
export function historyReplaces(
  held: { count: number; lastAt: number | null } | undefined,
  next: { count: number; lastAt: number | null },
): boolean {
  if (!held || held.count === 0 || held.lastAt === null) return true;
  if (next.count === 0 || next.lastAt === null) return false;
  return next.lastAt >= held.lastAt;
}

/**
 * Whether a response is an answer. Only a 200: the route answers every
 * readable request with one, and anything else — a 204 with no body, a 429
 * from the public guard, a 502 from the host — is a failure to be retried,
 * not a series to be cached.
 */
export function historyAnswered(status: number): boolean {
  return status === 200;
}
