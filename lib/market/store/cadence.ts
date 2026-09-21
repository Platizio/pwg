import type { RawCorporateActions } from "../../api/clients/fundamentals.ts";
import { parseFeedDate } from "../../api/normalize/time.ts";
import { pricesMove, type SessionPhase } from "../session.ts";
import type { Section } from "./sections.ts";

/* When to ask the gateway about a section again.
 *
 * There is no cheaper question on offer. The live catalogue carries no ETag,
 * no delta and no change notification, so "has this changed" costs a whole
 * fetch every time it is asked — which makes the only real saving *not asking*.
 * A company's annual filings move four times a year and its short interest
 * twice a month; reading either of them hourly buys nothing but calls against
 * a shared rate limit that the price sweep also has to get through.
 *
 * Three rules, in order of authority:
 *
 *   1. The table below, by section and by whether anyone is looking at the
 *      name. Priority ≥2 means covered, visited or on the wire.
 *   2. An unchanged read doubles the wait, up to the section's cap, so a
 *      dormant company drifts towards its ceiling on its own. A changed read
 *      drops straight back to base.
 *   3. What the data itself says, which overrules both: an ex-dividend date
 *      two days out, an earnings date inside the interval we were about to
 *      sleep through, and a tracking fund whose bars move while the market is
 *      open.
 *
 * No clock is read here and no randomness is drawn. `now` arrives as an
 * argument for the same reason it does everywhere else in lib/market — the
 * answer has to be reproducible, in a test and in the worker's own logs.
 */

const MINUTE = 60_000;
const HOUR = 3_600_000;
const DAY = 86_400_000;

export type CadenceInput = {
  section: Section;
  /** Whether the answer just fetched differed from the stored one. */
  changed: boolean;
  /** Consecutive unchanged reads INCLUDING this one — 0 after a change. */
  unchangedStreak: number;
  /** 3 covered/ETF/wire, 2 visited, 1 hot, 0 the rest of the universe. */
  priority: number;
  now: number;
  /** The exchange's state, for the sections that care. */
  phase?: SessionPhase;
  /** The section's own stored payload, where the next date lives in it. */
  payload?: unknown;
  /** Documents from other sections that bear on this one's timing. */
  context?: { actions?: RawCorporateActions | null };
};

type Row = {
  /** Priority ≥2: somebody is looking at this name. */
  covered: number;
  /** Everyone else. */
  rest: number;
  cap: number;
};

/* history_daily is in the table for completeness of the type; its interval is
   an absolute moment rather than a gap, and `historyNext` computes it. */
const TABLE: Record<Section, Row> = {
  profile: { covered: DAY, rest: 3 * DAY, cap: 7 * DAY },
  news_gateway: { covered: 6 * HOUR, rest: 6 * HOUR, cap: 6 * HOUR },
  corporate_actions: { covered: DAY, rest: DAY, cap: 7 * DAY },
  financials_annual: { covered: 7 * DAY, rest: 7 * DAY, cap: 30 * DAY },
  history_daily: { covered: DAY, rest: DAY, cap: DAY },
  /* Captured once a day and never backed off. Every other section doubles its
     interval when an answer comes back unchanged, on the reasoning that a
     document which has not moved in a week will not move tonight. That
     reasoning inverts here: an unchanged intraday answer does not mean the
     market stood still, it means the capture MISSED the session — and those
     bars are gone for good, because the gateway keeps them only while the
     session is live. Backing off from a miss would turn one lost day into a
     week of them. */
  history_intraday: { covered: DAY, rest: DAY, cap: DAY },
  short_interest: { covered: 3 * DAY, rest: 3 * DAY, cap: 14 * DAY },
  analyst: { covered: 30 * DAY, rest: 30 * DAY, cap: 30 * DAY },
};

/* When the day's own bar actually appears.
 *
 * This used to be twenty minutes after the bell, on the reasonable-sounding
 * assumption that a daily bar settles when the session ends. It does not, and
 * the refresh log says so plainly. Over five days of `history_daily`:
 *
 *   Thu 03–04 ET   6,551 changed      the whole universe, overnight
 *   Fri 00 ET      4,415 changed      again, just after midnight
 *   Fri 23 ET      2,011 UNCHANGED    seven hours after Friday's close
 *   Sat 00 ET        645 UNCHANGED    still nothing
 *   Mon 00–01 ET   1,780 changed      Friday's bar, finally
 *
 * The gateway publishes a session's daily bar somewhere around midnight
 * Eastern, not at the close. So a check at close+20min read a series that did
 * not yet contain the session that had just ended, recorded `unchanged` — no
 * write, no version bump, and a next check pushed to the FOLLOWING close — and
 * the stored series sat one whole session behind until something else forced a
 * re-read. Over a weekend that is three days: on Monday morning the terminal's
 * week still ended on Thursday, with Friday's bar sitting in the gateway the
 * whole time. Confirmed by hand — AAPL, NVDA and SPY stored through 09/17
 * while `/quotes/equity/historical` answered 09/18 for all three.
 *
 * Eight hours and forty-five minutes puts the read at about 00:45 ET, inside
 * the window where every one of those mass `changed` batches landed. It is a
 * measurement, not a guarantee, which is what the catch-up below is for. */
const PUBLISH_LAG = 8 * HOUR + 45 * MINUTE;

/* If the bar still is not there, come back in an hour rather than tomorrow —
   the failure this whole block exists to prevent is precisely a missed
   publication turning into a lost day. */
const PUBLISH_RETRY = HOUR;

/* But stop asking by about 06:00 ET. A name that did not trade the session has
   no bar to wait for and would otherwise re-read for ever, and there are ~4,400
   of them sharing one rate limit. Five extra calls for a thin name is the
   cheaper mistake than a day of missing bars for a liquid one. */
const PUBLISH_GIVE_UP = 14 * HOUR;
/** How often the tracking funds re-read their bars while prices move. */
const ETF_WHILE_MOVING = 30 * MINUTE;
/** A calendar date this close is worth watching twice a day. */
const CALENDAR_NEAR = 3 * DAY;
const CALENDAR_INTERVAL = 12 * HOUR;

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const rowsOf = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

/* The feed writes calendar dates as bare "YYYY-MM-DD", with no zone. Read as
   UTC midnight: the exchange's own day starts four or five hours later, and
   against a three-day window that difference cannot change an answer. */
function dayMs(v: unknown): number | null {
  if (typeof v !== "string" || v === "") return null;
  const at = Date.parse(`${v}T00:00:00Z`);
  return Number.isFinite(at) ? at : null;
}

/* ------------------------------------------------------------------ */
/* Jitter                                                              */
/* ------------------------------------------------------------------ */

/* FNV-1a, for a deterministic ±10% spread.
 *
 * Math.random would make a scheduler that cannot be tested and a due time the
 * worker cannot re-derive from its own log line. Note what this deliberately
 * does NOT do: the hash takes no symbol, so every name in a section shares its
 * offset. Spreading load across symbols is the claim-queue's job — it leases
 * sixty at a time — and this only keeps whole sections from falling into
 * lockstep with each other. */
function fnv1a(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}

function jittered(interval: number, section: string, streak: number): number {
  // (h % 2001) / 1000 - 1 lands in [-1, 1]; a tenth of that is the band.
  const fraction = (((fnv1a(`${section}:${streak}`) % 2001) / 1000) - 1) * 0.1;
  return Math.round(interval * (1 + fraction));
}

/* ------------------------------------------------------------------ */
/* The close                                                           */
/* ------------------------------------------------------------------ */

/* The exchange's own wall clock. session.ts reads the same two fields the same
   way and for the same reason — a UTC weekday calls a Friday post-market a
   Saturday — but it keeps the reader private and works in seconds, and this
   module works in milliseconds. */
const ET_CLOCK = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  weekday: "short",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

function easternClock(ms: number): { weekday: string; msIntoDay: number } {
  const parts = ET_CLOCK.formatToParts(ms);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((p) => p.type === type)?.value ?? "0");
  return {
    weekday: parts.find((p) => p.type === "weekday")?.value ?? "",
    msIntoDay: (part("hour") * 3600 + part("minute") * 60 + part("second")) * 1000,
  };
}

const CLOSE_INTO_DAY = 16 * HOUR;

/** 16:00 Eastern on whichever Eastern day contains `ms`. */
function closeOn(ms: number): number {
  const { msIntoDay } = easternClock(ms);
  const midnight = Math.floor((ms - msIntoDay) / 1000) * 1000;
  const guess = midnight + CLOSE_INTO_DAY;

  /* One correction pass, because "midnight plus sixteen hours" is a UTC sum
     and the day it lands in may keep a different offset than the day it
     started in. The clocks move at 02:00 on a Sunday and the exchange does not
     trade on Sundays, so this never actually fires today — but it costs one
     formatToParts, and the alternative is a rule that is silently an hour
     wrong on some future Monday nobody is watching. */
  return guess - (easternClock(guess).msIntoDay - CLOSE_INTO_DAY);
}

/**
 * The next 16:00 America/New_York strictly after `nowMs`, weekends skipped.
 *
 * Holidays are deliberately ignored. session.ts keeps a committed list of full
 * closures, and honouring it here would mean the daily-bar refresh for
 * Thanksgiving skips to Friday — but the gateway publishes no bar for a day
 * that did not trade either, so the extra read costs one call and finds
 * nothing changed, while a wrong holiday list would cost a whole day of bars.
 * Being early is the harmless direction to be wrong in.
 */
export function nextEasternClose(nowMs: number): number {
  // A weekday is never more than three days away; eight is the same bound
  // nextOpening uses, so a bad clock cannot spin here either.
  for (let day = 0; day <= 8; day += 1) {
    const probe = nowMs + day * DAY;
    const { weekday } = easternClock(probe);
    if (weekday === "Sat" || weekday === "Sun") continue;
    const close = closeOn(probe);
    if (close > nowMs) return close;
  }
  // Unreachable with a real clock; a day out beats a thrown scheduler.
  return nowMs + DAY;
}

/* ------------------------------------------------------------------ */
/* The schedule                                                        */
/* ------------------------------------------------------------------ */

/** Whether the document names a date inside the next `window`. */
function calendarNear(payload: unknown, now: number, window: number): boolean {
  if (!isRecord(payload)) return false;

  const dates: Array<number | null> = [
    ...rowsOf(payload.dividends).map((d) => (isRecord(d) ? dayMs(d.ex_dividend_date) : null)),
    ...rowsOf(payload.events).map((e) => (isRecord(e) ? dayMs(e.date) : null)),
  ];

  // `at > now - DAY` rather than `>= now`: a date read at UTC midnight is
  // already behind a mid-afternoon `now` on the very day it names.
  return dates.some((at) => at !== null && at > now - DAY && at <= now + window);
}

/** The earliest event the record names strictly inside (from, to]. */
function firstEventBetween(
  actions: RawCorporateActions | null | undefined,
  from: number,
  to: number,
): number | null {
  let best: number | null = null;
  for (const e of actions?.events ?? []) {
    const at = dayMs(e?.date);
    if (at === null || at <= from || at > to) continue;
    if (best === null || at < best) best = at;
  }
  return best;
}

function baseFor(section: Section, priority: number): number {
  const row = TABLE[section];
  return priority >= 2 ? row.covered : row.rest;
}

/* Daily bars are the one section scheduled to a moment rather than after an
   interval: they change once, when the session's last bar is published, and
   a doubling streak would only walk away from that moment. */
/* Five minutes before the close, not after it.
 *
 * The endpoint answers an empty array outside a session, so a capture timed
 * after the bell would store nothing and the day would be lost with no way to
 * fetch it back. Before the bell it is certain there is something to take; the
 * cost is that day's post-market bars, which is the cheaper mistake. */
const CAPTURE_BEFORE_CLOSE = 5 * MINUTE;

function intradayNext(now: number): number {
  /* The same walk nextEasternClose does, and strictly-after for the same
     reason: a capture that ran at 15:57 must schedule tomorrow, not compute a
     15:55 already past and become due again immediately. */
  for (let day = 0; day <= 8; day += 1) {
    const probe = now + day * DAY;
    const { weekday } = easternClock(probe);
    if (weekday === "Sat" || weekday === "Sun") continue;
    const capture = closeOn(probe) - CAPTURE_BEFORE_CLOSE;
    if (capture > now) return capture;
  }
  return now + DAY;
}

/** The most recent 16:00 Eastern strictly before `nowMs`, weekends skipped. */
function lastEasternClose(nowMs: number): number {
  for (let day = 0; day <= 8; day += 1) {
    const probe = nowMs - day * DAY;
    const { weekday } = easternClock(probe);
    if (weekday === "Sat" || weekday === "Sun") continue;
    const close = closeOn(probe);
    if (close < nowMs) return close;
  }
  return nowMs - DAY;
}

/**
 * The next moment a daily bar is expected to be published, strictly after
 * `nowMs`.
 *
 * Not `nextEasternClose + lag`. At 17:00 on a Monday the next close is
 * Tuesday's, and Tuesday's close plus the lag is Wednesday morning — which
 * would sail straight past Monday's own bar, due in eight hours. The walk has
 * to be over publication moments, not over closes.
 */
function nextPublication(nowMs: number): number {
  for (let day = 0; day <= 8; day += 1) {
    const probe = nowMs + day * DAY;
    const { weekday } = easternClock(probe);
    if (weekday === "Sat" || weekday === "Sun") continue;
    const at = closeOn(probe) + PUBLISH_LAG;
    if (at > nowMs) return at;
  }
  return nowMs + DAY;
}

/** The Eastern midnight of the last bar the stored columns carry. */
function lastBarAt(payload: unknown): number | null {
  if (!isRecord(payload)) return null;
  const dates = rowsOf(payload.date);
  const last = dates[dates.length - 1];
  /* parseFeedDate is the only thing in this codebase allowed to read the
     feed's "MM/DD/YYYY HH:MM:SS EDT", and it is what stored those columns. */
  return typeof last === "string" ? parseFeedDate(last) : null;
}

function historyNext(input: CadenceInput): number {
  if (input.priority >= 3 && input.phase !== undefined && pricesMove(input.phase)) {
    /* The fourteen tracking funds. Every strip, every sector row and the
       market comparison on an instrument page are drawn from their bars, so
       they are the only series a reader watches move. pricesMove rather than
       session.live: an 08:00 pre-market book is thin, but it is not still. */
    return input.now + jittered(ETF_WHILE_MOVING, input.section, input.unchangedStreak);
  }

  /* Does the series we just read actually cover the session that has already
     closed? The bar's stamp is that trading day's Eastern midnight, so it is
     compared against the close's own midnight rather than against the close. */
  const closed = lastEasternClose(input.now);
  const covered = lastBarAt(input.payload);
  const behind = covered !== null && covered < closed - CLOSE_INTO_DAY;

  if (behind) {
    const due = closed + PUBLISH_LAG;
    /* Not published yet — which is the ordinary case for anything read in the
       hours between the bell and midnight. Wait for the moment itself. */
    if (input.now < due) return due;
    /* Past the moment and still missing: publication is late, or this name did
       not trade. Ask again hourly for a few hours, then let it go. */
    if (input.now < closed + PUBLISH_GIVE_UP) {
      return input.now + jittered(PUBLISH_RETRY, input.section, input.unchangedStreak);
    }
  }

  /* The series already covers the last close. If that session's own
     publication moment has not passed yet, there is nothing to learn by
     reading at it — the bar is already stored — so the walk starts after it
     and the next read is the next session's. Without this, every Friday
     evening read would schedule a pointless Saturday one. */
  return nextPublication(Math.max(input.now, closed + PUBLISH_LAG));
}

/**
 * When this section should next be read, as an epoch millisecond.
 */
export function nextCheckAt(input: CadenceInput): number {
  const { section, now } = input;
  if (section === "history_daily") return historyNext(input);
  if (section === "history_intraday") return intradayNext(now);

  let interval: number;
  if (section === "corporate_actions" && calendarNear(input.payload, now, CALENDAR_NEAR)) {
    /* A flat twelve hours, overruling both the base and the cap. An ex-date or
       an event a couple of days out is the only time this document moves at
       all, and a company on its seventh unchanged read is exactly the one
       whose cap would otherwise have it sleeping through the week it does. */
    interval = CALENDAR_INTERVAL;
  } else if (input.changed) {
    interval = baseFor(section, input.priority);
  } else {
    const streak = Math.max(0, Math.floor(input.unchangedStreak));
    interval = Math.min(baseFor(section, input.priority) * 2 ** streak, TABLE[section].cap);
  }

  let at = now + jittered(interval, section, input.unchangedStreak);

  if (section === "financials_annual") {
    /* Seven days is the right interval for a document that changes four times
       a year, and the wrong one for the week it changes in. The corporate
       actions record is the only place on this gateway that names the date,
       so when it names one inside the stretch we were about to sleep through,
       the filings are read the day after it instead. */
    const event = firstEventBetween(input.context?.actions, now, at);
    if (event !== null) at = event + DAY;
  }

  return at;
}

/**
 * How long to wait after a section's fetch failed: five minutes, tripling,
 * capped at six hours.
 *
 * Tripling rather than doubling because the failures worth backing off from
 * here are outages and throttles, which last minutes to hours, not the
 * milliseconds a socket retry is sized for. The cap is what keeps a symbol the
 * gateway has permanently stopped answering from being retried forever while
 * still being retried at all.
 */
export function errorBackoffMs(attempts: number): number {
  const n = Math.max(1, Math.floor(attempts));
  return Math.min(5 * MINUTE * 3 ** (n - 1), 6 * HOUR);
}
