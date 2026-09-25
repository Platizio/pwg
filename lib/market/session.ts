/**
 * The session model — everything the dashboard reads that is not a single
 * instrument: indices, breadth, sectors, volatility and the events calendar.
 *
 * Two rules bind this module, both inherited from `series.ts`:
 *
 * 1. Every figure derives from a seed or a constant. No `Math.random`, no
 *    `Date.now`. The server and the browser must produce identical bytes.
 * 2. "Now" is `ANCHOR`, never the wall clock. When a live feed arrives, the
 *    swap happens in `sessionAt()` and nowhere else — which is why session
 *    state is computed from a timestamp argument rather than read from a
 *    constant.
 */
import { INSTRUMENTS } from "./instruments.ts";


/* The mock's fixed "now", kept only as the default argument of sessionAt and
   calendarDate. Every live caller passes a real clock — see
   lib/market/clock.ts — so this is what a surface falls back to when it has no
   snapshot to date itself from. */
export const ANCHOR = Date.UTC(2026, 7, 3, 16, 0, 0) / 1000;

/* ------------------------------------------------------------------ */
/* Session state                                                       */
/* ------------------------------------------------------------------ */

export type SessionPhase =
  | "pre-market"
  | "open"
  | "post-market"
  | "closed"
  | "halted";

export type Session = {
  phase: SessionPhase;
  /** Tracked-caps label for the dateline. */
  label: string;
  /** Long-form date, e.g. "Monday, 3 August 2026". */
  date: string;
  /** Clock in the reader's zone (IST), e.g. "7:00 pm". */
  clock: string;
  /** Seconds since the last tick arrived — the staleness readout. */
  lastTick: string;
  /** The next opening, whenever it is — the pill rotates onto it. Null only
      if nothing opens inside the next eight days. */
  opens: Moment | null;
  /** On a half-day only, the early end of what is trading: "US Market closes
      early" at 13:00 ET through the pre-market and the session, then "US
      Post-market ends" at 17:00. Null on every other day, and once nothing is
      left to close. */
  closes: Moment | null;
  /** True only during the regular session. This is the narrow reading: the
      chrome bar renders it as the words "US markets Open"/"Closed", and an
      08:00 ET pre-market book is quoting but is not open. For "are these
      numbers moving", which is a wider question, use pricesMove(phase). */
  live: boolean;

  /* Only a live feed carries these; sessionAt leaves them unset. */
  /** True while the quotes behind the page are the delayed feed. */
  delayed?: boolean;
  /** What the gateway calls the feed, e.g. "Delay". */
  feedSource?: string;
};

/** Something the pill announces: what happens, when in IST, and the instant. */
export type Moment = { label: string; time: string; at: number };

/*
  US cash equities, as seconds past midnight *Eastern*: the pre-market opens at
  04:00, the regular session runs 09:30–16:00, and the post-market runs on to
  20:00. Seconds rather than dates so the comparison stays integer arithmetic.

  These were frozen UTC offsets — `PRE_OPEN_UTC = 12 * 3600` and so on, with a
  comment that began "US cash equities in August". August is the tell: an
  offset that is right in August is an hour wrong from November to March,
  because the exchange keeps its hours in Eastern time and Eastern time changes
  offset twice a year. Read against 13:30 UTC, a January session opened at
  08:30 ET and shut at 15:00 ET — an hour early in both directions, and quietly,
  since nothing about a wrong label looks wrong. The holiday list below already
  read its dates through America/New_York for exactly this reason; the clock
  now does too.

  The close is not a constant: it is regularCloseMinute(day) below, 16:00 or
  13:00 on a half-day. On a half-day the post-market runs 13:00-17:00 rather
  than to 20:00 — the extended session ends when the exchanges' late sessions
  do, four hours after the early bell.
*/
const PRE_OPEN_ET = 4 * 3600;
const OPEN_ET = 9 * 3600 + 30 * 60;
const POST_CLOSE_ET = 20 * 3600;
const EARLY_POST_CLOSE_ET = 17 * 3600;

const DATE_FMT = new Intl.DateTimeFormat("en-US", {
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

/*
  The tag that sits beside the price on an instrument page.

  "open" reads as plain "Market" rather than "Market open" because the three
  trading phases are now one series — Pre-market, Market, Post-market — and a
  reader picks a member out of a series by its name. "Market open" alongside
  "Pre-market" reads as a different kind of fact, a state rather than a phase,
  and invites the question of whether "Pre-market" means open or not.

  The two non-trading phases keep their fuller wording: they are not members of
  that series, they are the absence of it, and "Closed" on its own beside a
  price is ambiguous about what closed.
*/
const PHASE_LABEL: Record<SessionPhase, string> = {
  "pre-market": "Pre-market",
  open: "Market",
  "post-market": "Post-market",
  closed: "Market closed",
  halted: "Trading halted",
};

/* The word the chrome-bar pill puts after "US markets".
 *
 * Deliberately NOT PHASE_LABEL. That names the phase beside a price, where
 * "Market" is the right word for the bell; after "US markets" it would read
 * "US markets Market". The two are different sentences and only diverge here.
 *
 * This exists because the pill and the price tag were answering the same
 * question differently: at 06:49 ET the tag read "Pre-market" with a pulsing
 * dot while the pill read "US markets Closed", on the same screen. Both were
 * defensible alone — "open/closed" properly describes the regular session —
 * and together they made the reader arbitrate. One clock, one answer. */
const PHASE_WORD: Record<SessionPhase, string> = {
  "pre-market": "Pre-market",
  open: "Market",
  "post-market": "Post-market",
  closed: "Closed",
  halted: "Halted",
};

export const phaseWord = (phase: SessionPhase): string => PHASE_WORD[phase];

/**
 * Whether the numbers on the page are changing.
 *
 * Deliberately not `session.live`. The two questions look identical and are
 * not: `live` is consumed as the literal words "US markets Open"/"Closed" in
 * the chrome bar, so it has to stay the regular session and nothing else,
 * while the pulsing gold dot beside the price claims only that the figure it
 * sits next to is moving. Extended-hours quotes do move — thinly, on wider
 * spreads, but they move — so a frozen dot over a changing price was the
 * wrong half of the pair to be honest about.
 *
 * A phase, not a clock: the half-day's 13:00 bell and 17:00 post-market close
 * are decided once, in sessionAt, and everything gated on this follows them.
 */
export const pricesMove = (phase: SessionPhase): boolean =>
  phase === "pre-market" || phase === "open" || phase === "post-market";

/* Full-day NYSE and Nasdaq closures, as ISO dates in US Eastern terms.

   A weekday check alone is not enough: without this the dateline announces an
   open market on Thanksgiving and the live dot pulses against a book that is
   not trading. Committed rather than computed because the rules are irregular
   — Good Friday moves with Easter, and a holiday falling at a weekend is
   observed on an adjacent weekday — and a wrong guess is worse than a list
   that has to be extended.

   2024 and 2025 are here for the charts, not the dateline: the one-year chart
   counts 252 sessions back into 2025, and without them it asks for bars on
   closed days and comes up two sessions short. 9 Jan 2025 is the national day
   of mourning for President Carter, an unscheduled closure.

   Half-days are in EARLY_CLOSES below.

   Extend before January 2029. */
const MARKET_HOLIDAYS = new Set([
  "2024-01-01", "2024-01-15", "2024-02-19", "2024-03-29", "2024-05-27",
  "2024-06-19", "2024-07-04", "2024-09-02", "2024-11-28", "2024-12-25",
  "2025-01-01", "2025-01-09", "2025-01-20", "2025-02-17", "2025-04-18",
  "2025-05-26", "2025-06-19", "2025-07-04", "2025-09-01", "2025-11-27",
  "2025-12-25",
  "2026-01-01", "2026-01-19", "2026-02-16", "2026-04-03", "2026-05-25",
  "2026-06-19", "2026-07-03", "2026-09-07", "2026-11-26", "2026-12-25",
  "2027-01-01", "2027-01-18", "2027-02-15", "2027-03-26", "2027-05-31",
  "2027-06-18", "2027-07-05", "2027-09-06", "2027-11-25", "2027-12-24",
  "2028-01-17", "2028-02-21", "2028-04-14", "2028-05-29", "2028-06-19",
  "2028-07-04", "2028-09-04", "2028-11-23", "2028-12-25",
]);

/* The exchange's own calendar day, not the server's. A UTC timestamp inside the
   session belongs to the Eastern date five hours earlier.

   One formatter, held: mergeOfficial asks this of every day in a five-year
   series, and building an Intl formatter is the expensive half of the call. */
const ET_DAY = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/New_York",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
const easternDate = (ms: number): string => ET_DAY.format(ms);

/** The Eastern calendar date ("yyyy-mm-dd") of an instant, in epoch seconds. */
export const easternDay = (at: number): string => easternDate(at * 1000);

export function isMarketHoliday(at: number): boolean {
  return MARKET_HOLIDAYS.has(easternDate(at * 1000));
}

/* Half-days: the regular session ends at 13:00 ET and the closing auction runs
   then, not at 16:00. The day before Independence Day, the day after
   Thanksgiving, and Christmas Eve — each only when it is itself a trading day
   (in 2026 July 3 is the observed holiday, so there is no July half-day).
   Minute bars after 13:00 on these days are post-market trades, and a chart
   that keeps them draws three hours of after-hours as if it were the session. */
const EARLY_CLOSES = new Set([
  "2024-07-03", "2024-11-29", "2024-12-24",
  "2025-07-03", "2025-11-28", "2025-12-24",
  "2026-11-27", "2026-12-24",
  "2027-11-26",
  "2028-07-03", "2028-11-24",
]);

/** Is this Eastern date ("yyyy-mm-dd") a half-day? */
export function isEarlyClose(isoDay: string): boolean {
  return EARLY_CLOSES.has(isoDay);
}

/** Minutes after Eastern midnight when the regular session ends on this Eastern
    date ("yyyy-mm-dd"): 960 (16:00), or 780 (13:00) on a half-day. */
export function regularCloseMinute(isoDay: string): number {
  return EARLY_CLOSES.has(isoDay) ? 13 * 60 : 16 * 60;
}

/* The exchange's own wall clock, read for the same reason as its calendar day.
   Weekday comes from this read rather than from getUTCDay(): a Friday
   post-market at 19:00 EST is already Saturday in UTC, so a UTC weekday shut
   the book as a weekend four hours before the Friday session actually ended.

   hourCycle "h23" rather than hour12: false because the two disagree at exactly
   one instant — midnight, which some ICU builds render as hour 24 — and
   midnight is inside the closed stretch this arithmetic has to get right. */
const ET_CLOCK = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  weekday: "short",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

function easternClock(ms: number): { day: string; weekday: string; secondsIntoDay: number } {
  const parts = ET_CLOCK.formatToParts(ms);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? "";
  return {
    day: `${part("year")}-${part("month")}-${part("day")}`,
    weekday: part("weekday"),
    secondsIntoDay:
      Number(part("hour")) * 3600 +
      Number(part("minute")) * 60 +
      Number(part("second")),
  };
}

/* ------------------------------------------------------------------ */
/* One trading day's hours                                              */
/* ------------------------------------------------------------------ */

const ISO_DAY = /^(\d{4})-(\d{2})-(\d{2})$/;

/* A calendar date as the UTC midnight of the same three numbers — arithmetic
   on a DATE, not an instant. getUTCDay on this is exact: no zone is consulted,
   so there is none to be wrong about. (getUTCDay on an INSTANT is the bug
   easternClock exists to avoid; that is a different question.) Null for
   anything that is not a real "yyyy-mm-dd", including a 30 February. */
function civilMs(isoDay: string): number | null {
  const m = ISO_DAY.exec(isoDay);
  if (m === null) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const at = Date.UTC(y, mo - 1, d);
  const back = new Date(at);
  return back.getUTCFullYear() === y && back.getUTCMonth() === mo - 1 && back.getUTCDate() === d
    ? at
    : null;
}

/** The calendar date `n` days after (or before) `isoDay`. */
export function shiftDay(isoDay: string, n: number): string {
  const at = civilMs(isoDay);
  if (at === null) return isoDay;
  return new Date(at + n * 86_400_000).toISOString().slice(0, 10);
}

/**
 * The instant, in epoch seconds, at which the Eastern wall clock on `isoDay`
 * reads `secondsIntoDay`. Null when it never does.
 *
 * Eastern is UTC-4 or UTC-5, so both are tried and the zone itself confirms
 * which — no DST rule is restated here. Every time this module asks for
 * (midnight, 00:45, 04:00-20:00, 06:00) exists exactly once on every date,
 * because the clocks change at 02:00. For the hour that happens twice on the
 * November Sunday the first, EDT, reading is returned; for the hour that never
 * happens in March, null.
 */
export function easternTime(isoDay: string, secondsIntoDay: number): number | null {
  const base = civilMs(isoDay);
  if (base === null) return null;
  const naive = base / 1000 + secondsIntoDay;
  for (const offsetHours of [4, 5]) {
    const at = naive + offsetHours * 3600;
    const read = easternClock(at * 1000);
    if (read.day === isoDay && read.secondsIntoDay === secondsIntoDay) return at;
  }
  return null;
}

/** One trading day's hours, as epoch seconds. */
export type TradingDay = {
  /** The Eastern date, "yyyy-mm-dd". */
  day: string;
  /** A half-day: the bell at 13:00, the post-market to 17:00. */
  earlyClose: boolean;
  preOpen: number;
  open: number;
  /** The regular close — 16:00, or 13:00 on a half-day. */
  close: number;
  /** The end of the post-market — 20:00, or 17:00 on a half-day. */
  postClose: number;
};

/* Held per date: a date's hours are a fixed fact, and sessionAt asks for the
   same one or two days on every call — every thirty seconds in the browser,
   and once per job in the refresh worker. Cleared rather than evicted when it
   grows, since a process only ever asks about the days around it. */
const HOURS = new Map<string, TradingDay | null>();

/**
 * The hours the exchange keeps on an Eastern date, or null when it does not
 * trade: a weekend, a listed holiday, or something that is not a date.
 *
 * The one place a day's shape is decided. The phase, the pill's announcements
 * and the refresh worker's schedule (store/cadence.ts) all read it, so a
 * half-day cannot close at 13:00 on the pill and at 16:00 in the worker.
 */
export function tradingDay(isoDay: string): TradingDay | null {
  const held = HOURS.get(isoDay);
  if (held !== undefined) return held;
  if (HOURS.size > 4_096) HOURS.clear();

  const hours = computeTradingDay(isoDay);
  HOURS.set(isoDay, hours);
  return hours;
}

function computeTradingDay(isoDay: string): TradingDay | null {
  const civil = civilMs(isoDay);
  if (civil === null) return null;
  const weekday = new Date(civil).getUTCDay();
  if (weekday === 0 || weekday === 6 || MARKET_HOLIDAYS.has(isoDay)) return null;

  const earlyClose = EARLY_CLOSES.has(isoDay);
  const preOpen = easternTime(isoDay, PRE_OPEN_ET);
  const open = easternTime(isoDay, OPEN_ET);
  const close = easternTime(isoDay, regularCloseMinute(isoDay) * 60);
  const postClose = easternTime(isoDay, earlyClose ? EARLY_POST_CLOSE_ET : POST_CLOSE_ET);
  if (preOpen === null || open === null || close === null || postClose === null) return null;
  return { day: isoDay, earlyClose, preOpen, open, close, postClose };
}

/* The reader's clock. This terminal is built for Indian investors trading US
   equities, and the pill used to report UTC — a zone neither the reader nor the
   market lives in. Times are formatted, never arithmetic'd: IST is UTC+5:30 and
   US hours are Eastern, so the gap between them is 9:30 in summer and 10:30 in
   winter. Intl does that; a constant would be wrong for half the year. */
const IST_CLOCK = new Intl.DateTimeFormat("en-US", {
  timeZone: "Asia/Kolkata",
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});

/** e.g. "7:00 pm" — lower-cased, because the pill is not shouting. */
const istTime = (ms: number): string =>
  IST_CLOCK.format(ms).replace(/\s*([AP])M$/i, (_m, p: string) => ` ${p.toLowerCase()}m`);

const moment = (label: string, at: number): Moment => ({ label, time: istTime(at * 1000), at });

/**
 * The next moment something starts trading — always, not only when it is near.
 *
 * The pill rotates between what the market is doing now and what it does next,
 * so it needs an answer at every hour of the day, including the ones where the
 * next opening is on the far side of a weekend or a holiday.
 *
 * Three openings a day: the pre-market at 04:00, the bell at 09:30, and the
 * post-market at the close — 16:00, or 13:00 on a half-day, when the early
 * bell is also the moment after-hours trading starts. The end of the
 * post-market is not an opening and is not announced here; on a half-day,
 * when it comes three hours early, `closes` says so instead.
 *
 * Walks forward a date at a time and takes the first opening it can reach. The
 * eight-day bound clears the longest real gap — a Friday evening followed by a
 * Monday holiday still lands inside it — and returning null past that is
 * better than looping forever if the holiday list is ever fed something odd.
 *
 * Each date's hours are resolved from its own Eastern wall clock (tradingDay),
 * so a DST change cannot drag a boundary an hour off: the Monday after either
 * Sunday opens at 04:00 in its own offset.
 */
export function nextOpening(at: number = ANCHOR): Moment | null {
  const today = easternDay(at);
  for (let d = 0; d <= 8; d += 1) {
    const hours = tradingDay(shiftDay(today, d));
    if (hours === null) continue;
    const openings: Array<[number, string]> = [
      [hours.preOpen, "Pre-market"],
      [hours.open, "Market"],
      [hours.close, "Post-market"],
    ];
    for (const [when, word] of openings) {
      if (when > at) return moment(`US ${word} opens`, when);
    }
  }
  return null;
}

/* A half-day's early end, for as long as there is something left to end.
 *
 * Why announce a close at all, when openings are the rule: because this one is
 * a surprise. A reader in India knows the bell as 01:30 and the post-market as
 * running to 05:30; on Black Friday the session ends at 23:30 IST and the
 * post-market at 03:30, and nothing else on the page says so. From the
 * pre-market onward the pill names the early bell; once it has rung, the early
 * end of the post-market.
 *
 * "US Post-market ends" rather than "... closes early": the home pill sits on a
 * phone with its line unbroken, and "US Post-market closes early" beside
 * "3:30 am IST" comes to about 358px against the 343 a 375px screen leaves
 * inside its gutters. That this line appears at all says the day is short —
 * it is never announced on an ordinary one. */
function earlyEnd(hours: TradingDay | null, phase: SessionPhase): Moment | null {
  if (hours === null || !hours.earlyClose) return null;
  if (phase === "pre-market" || phase === "open") return moment("US Market closes early", hours.close);
  if (phase === "post-market") return moment("US Post-market ends", hours.postClose);
  return null;
}

/**
 * What the pill rotates onto after the status line, in the order they happen.
 *
 * Ordinarily just the next opening. On a half-day the early close joins it —
 * and during that day's regular session replaces it, because the next opening
 * then IS the early bell (the post-market starts at 13:00) and one instant
 * should be said once, in the words that explain it.
 *
 * `closes` is read as possibly absent: a page rendered before the field existed
 * still hands over a session without it, and must still roll onto its opening.
 */
export function sessionNotices(session: { opens: Moment | null; closes?: Moment | null }): Moment[] {
  const closes = session.closes ?? null;
  const opens = session.opens ?? null;
  const out: Moment[] = [];
  if (closes !== null) out.push(closes);
  if (opens !== null && !(closes !== null && opens.at === closes.at)) out.push(opens);
  return out.sort((a, b) => a.at - b.at);
}

/**
 * Resolve the session at a given instant.
 *
 * Weekends and listed holidays read as closed. Every other boundary is the
 * day's own: 04:00 and 09:30 always, the close and the end of the post-market
 * from tradingDay — 16:00 and 20:00, or 13:00 and 17:00 on a half-day.
 *
 * `at` is a parameter rather than a module constant so that the day a real
 * clock replaces `ANCHOR`, this function is the only thing that changes.
 */
export function sessionAt(at: number = ANCHOR): Session {
  const ms = at * 1000;
  const { day } = easternClock(ms);
  const hours = tradingDay(day);

  /* Order matters: the shut test runs first, so a holiday or a weekend can
     never fall through into an extended-hours phase. Thanksgiving at 05:00 ET
     is closed, not pre-market. */
  const phase: SessionPhase =
    hours === null || at < hours.preOpen || at >= hours.postClose
      ? "closed"
      : at < hours.open
        ? "pre-market"
        : at < hours.close
          ? "open"
          : "post-market";

  return {
    phase,
    label: PHASE_LABEL[phase],
    date: DATE_FMT.format(ms),
    clock: istTime(ms),
    /* Fixed rather than counted: a ticking staleness readout would need a
       clock, and a clock would need to agree with the server. The shape is
       what matters — a live feed fills it in. */
    lastTick: pricesMove(phase) ? "2s ago" : "—",
    opens: nextOpening(at),
    closes: earlyEnd(hours, phase),
    live: phase === "open",
  };
}

/* ------------------------------------------------------------------ */
/* Indices                                                             */
/* ------------------------------------------------------------------ */

export type MarketIndex = {
  id: string;
  name: string;
  /** Compact name for the tab strip. */
  short: string;
  level: number;
  /** Day change, percent. */
  chg: number;
  seed: number;
  /** What the index actually tracks — the register's one line of prose. */
  note: string;
};

export const INDICES: MarketIndex[] = [
  {
    id: "SPX",
    name: "S&P 500",
    short: "S&P 500",
    level: 5412.8,
    chg: 0.62,
    seed: 131,
    note: "Five hundred large-capitalisation US companies, weighted by float.",
  },
  {
    id: "NDX",
    name: "Nasdaq 100",
    short: "Nasdaq 100",
    level: 18904.36,
    chg: 0.91,
    seed: 227,
    note: "The hundred largest non-financial listings on the Nasdaq exchange.",
  },
  {
    id: "RUT",
    name: "Russell 2000",
    short: "Russell 2000",
    level: 2140.14,
    chg: -0.14,
    seed: 349,
    note: "Two thousand small-capitalisation US companies.",
  },
];

export const DEFAULT_INDEX = "SPX";

export function getIndex(id: string): MarketIndex {
  return INDICES.find((i) => i.id === id) ?? INDICES[0];
}

/** Previous close, back-solved from the level and the day change. */
export const indexPreviousClose = (index: MarketIndex) =>
  index.level / (1 + index.chg / 100);

/* ------------------------------------------------------------------ */
/* Sectors                                                             */
/* ------------------------------------------------------------------ */

export type Sector = {
  name: string;
  /** Day change, percent. Null when the sector fund did not quote — a flat day
      and an absent figure are different facts and must not share a value. */
  day: number | null;
  /** Week change, percent. Null for the same reason. */
  week: number | null;
  /** Share of total session volume, percent. */
  weight: number;
};

/* Ordered strongest to weakest — the interface does the ranking, so the
   reader never sorts this themselves. */
export const SECTORS: Sector[] = [
  { name: "Information technology", day: 1.84, week: 3.42, weight: 31.6 },
  { name: "Communication services", day: 1.41, week: 2.18, weight: 9.4 },
  { name: "Energy", day: 1.12, week: -0.64, weight: 4.1 },
  { name: "Consumer discretionary", day: 0.86, week: 1.94, weight: 10.8 },
  { name: "Industrials", day: 0.61, week: 0.42, weight: 8.2 },
  { name: "Financials", day: 0.48, week: 1.16, weight: 13.1 },
  { name: "Materials", day: 0.24, week: -0.31, weight: 2.4 },
  { name: "Health care", day: 0.19, week: -1.08, weight: 11.2 },
  { name: "Consumer staples", day: -0.22, week: -0.47, weight: 5.6 },
  { name: "Utilities", day: -0.38, week: -1.62, weight: 2.3 },
  { name: "Real estate", day: -0.91, week: -2.14, weight: 1.3 },
];

/* ------------------------------------------------------------------ */
/* Calendar                                                            */
/* ------------------------------------------------------------------ */

export type CalendarEvent = {
  /**
   * The exchange's own date, "YYYY-MM-DD".
   *
   * Zone-free on purpose. An ex-dividend or execution date is a fact the
   * exchange declares about a calendar day — it has no instant, so it has no
   * zone, and the feed already hands it over in exactly this form. Carried
   * rather than derived: the date used to be REBUILT at render as
   * `now + offset days`, which made it a function of whichever clock the
   * renderer happened to pass and let it drift from the date it came from.
   */
  date: string;
  /** Whole days from the reader's today — negative is past, 0 is today. */
  offset: number;
  time: string;
  title: string;
  kind: "earnings" | "macro" | "policy" | "corporate";
  /** Ticker this belongs to, when it belongs to one. */
  ticker?: string;
  /** What the event is and why a reader should care — shown when opened. */
  summary: string;
  /** The one thing to watch when it lands. */
  watch: string;
};

const SHORT_DATE = new Intl.DateTimeFormat("en-US", {
  weekday: "short",
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});

/* UTC, and the zone cancels out rather than being a choice.
 *
 * The value handed to it is built with Date.UTC from the event's own
 * "YYYY-MM-DD", so reading it back in UTC returns the same three numbers that
 * went in. That is what makes this safe on a server, a build box and a browser
 * alike: no wall clock is consulted, so there is nothing for them to disagree
 * about and nothing for hydration to repair.
 *
 * It must stay UTC for that reason. Pointing it at New York, or at the
 * reader's zone, would read a midnight instant back through an offset and
 * shift every date a day for part of the clock. */
function civilDate(iso: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (m === null) return null;
  const at = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isFinite(at) ? SHORT_DATE.format(at) : null;
}

/**
 * Absolute date for an event, and a relative label for the ones nearby.
 *
 * The date is the event's OWN, formatted. It used to be reconstructed as
 * `(at + offset * DAY)`, which had two faults. It made the printed date a
 * function of whatever clock the caller passed — and the dashboard passes the
 * sweep's timestamp while the offsets were measured against the wall clock, so
 * on the committed-baseline path the rail could print "Today" beside a date a
 * month old. And it meant the formatter's zone was load-bearing in a way
 * nothing marked: any change to it silently moved every row a day.
 *
 * `relative` is a gloss on the date beside it, measured against the READER's
 * day in India, so the word and the date can no longer contradict what the
 * reader's own calendar says.
 *
 * WHICH DAY IS TODAY. `event.offset` was counted when the event was
 * normalised, on the server, and a cached page carries it for as long as the
 * page lives: on Friday 25 Sep 2026 at 14:15 IST the calendar headed its first
 * section "Tomorrow · Fri, Sep 25", said "In 6 days" of the 30th and "3 days
 * ago" of the 21st — every word a day behind. So `today` ("yyyy-mm-dd", from
 * `readerDay` on the reader's own clock) re-counts the offset from the event's
 * own date, and the returned `offset` is the one to group and split by.
 * Without it — on the server, and in the first render that must match the
 * server's — the stored offset stands.
 */
export function calendarDate(event: CalendarEvent, today?: string | null) {
  const offset = offsetFrom(event, today);
  return {
    /* The raw string rather than nothing, if it ever arrives malformed: a
       reader can still read "2026-09-24", and a blank cell tells them less
       than the feed already told us. */
    date: civilDate(event.date) ?? event.date,
    /* A past event fell through to `In ${offset} days` and rendered "In -12
       days" — in an h2 and in the section's aria-label. The calendar carries
       recent ex-dividends deliberately, so the past branch is not an edge
       case. The dashboard rail had its own wrapper for this; the full page
       never got one, so the reading now lives here for both. */
    relative:
      offset === 0
        ? "Today"
        : offset === 1
          ? "Tomorrow"
          : offset === -1
            ? "Yesterday"
            : offset > 0
              ? `In ${offset} days`
              : `${Math.abs(offset)} days ago`,
    offset,
  };
}

/* The reader's day. A named zone, as in lib/api/normalize/calendar.ts where
   the stored offset is counted: this audience's calendar, and one answer on
   every machine that asks. */
const READER_DAY = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Kolkata",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** The reader's calendar day at `nowMs`, "yyyy-mm-dd", for `calendarDate`. */
export function readerDay(nowMs: number): string | null {
  return Number.isFinite(nowMs) ? READER_DAY.format(nowMs) : null;
}

/* A "yyyy-mm-dd" as a whole day number, so two of them subtract to whole days
   whatever the offset or the season. */
function dayIndex(iso: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (m === null) return null;
  const at = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isFinite(at) ? Math.round(at / 86_400_000) : null;
}

/** Whole days from `today` to the event's own date; the stored offset when
    there is no today or either date cannot be read. */
export function offsetFrom(event: CalendarEvent, today?: string | null): number {
  if (!today) return event.offset;
  const from = dayIndex(today);
  const to = dayIndex(event.date);
  return from === null || to === null ? event.offset : to - from;
}

/* ------------------------------------------------------------------ */
/* Cross-instrument views                                              */
/* ------------------------------------------------------------------ */

/** The followed universe, ranked by day change — gainers first. */
export function movers() {
  return [...INSTRUMENTS].sort((a, b) => b.chg - a.chg);
}

/**
 * The wire, pooled across the universe and carrying the ticker it came from.
 *
 * `time` on a news item is prose ("3 days ago"), so it is parsed back into a
 * sortable magnitude here rather than being trusted as written order.
 */
const AGE_UNIT: Record<string, number> = {
  hour: 1,
  hours: 1,
  day: 24,
  days: 24,
  week: 168,
  weeks: 168,
  month: 720,
  months: 720,
};

function ageInHours(time: string): number {
  const match = /^(\d+)\s+(\w+)/.exec(time);
  if (!match) return Number.MAX_SAFE_INTEGER;
  return Number(match[1]) * (AGE_UNIT[match[2]] ?? 1);
}

export function wire(limit = 6) {
  return INSTRUMENTS.flatMap((stock) =>
    stock.news.map((item) => ({
      ...item,
      ticker: stock.id,
      company: stock.short,
      mark: stock.mark,
      color: stock.color,
      age: ageInHours(item.time),
    })),
  )
    .sort((a, b) => a.age - b.age)
    .slice(0, limit);
}

/* ------------------------------------------------------------------ */
/* The quote universe                                                  */
/* ------------------------------------------------------------------ */

export type Quote = {
  id: string;
  name: string;
  /** Single-letter monogram, set in the serif inside a hairline square. */
  mark: string;
  color: string;
  price: number;
  /** Day change, percent. */
  chg: number;
  /* Whether `chg` is a reading or a stand-in. The gateway prices names it sends
     no change for, and those arrive as 0 — the same value a flat close carries.
     Absent means reported: the authored quotes below predate the flag. */
  chgKnown?: boolean;
  seed: number;
  /** GICS sector, matching a name in SECTORS. */
  sector: string;
  /** True when this symbol has an instrument page of its own. */
  covered: boolean;

  /* Only a live feed carries these. The authored quotes below leave them
     unset, so anything reading them must have a seeded fallback to hand. */
  /** Shares traded today. */
  volume?: number;
  /** Money traded today, in millions. */
  turnoverM?: number;
  /** Today's volume against the 30-day average. */
  relVol?: number;
  /** Epoch ms of the quote's own timestamp. */
  asOf?: number;
  delayed?: boolean;
};

/*
  The six covered instruments carry the terminal; they are not a market. A
  gainers board drawn from them alone would list five names and a losers board
  exactly one, which is a board that cannot do its job.

  These are the rest of the tape: authored at full fidelity, deterministic, and
  synthetic like everything else here. They quote and they sort, but they have
  no instrument page, so they never render as links — a row that looks like it
  leads somewhere and does not is worse than a row that plainly doesn't.
*/
const TAPE: Array<Omit<Quote, "covered">> = [
  { id: "GOOGL", name: "Alphabet", mark: "G", color: "var(--c-mark-4)", price: 176.5, chg: 2.41, seed: 41, sector: "Communication services" },
  { id: "META", name: "Meta Platforms", mark: "M", color: "var(--c-mark-3)", price: 502.3, chg: 1.86, seed: 53, sector: "Communication services" },
  { id: "NFLX", name: "Netflix", mark: "N", color: "var(--c-mark-5)", price: 664.18, chg: -0.74, seed: 67, sector: "Communication services" },
  { id: "AMD", name: "Advanced Micro Devices", mark: "A", color: "var(--c-mark-1)", price: 158.42, chg: 4.62, seed: 71, sector: "Information technology" },
  { id: "AVGO", name: "Broadcom", mark: "B", color: "var(--c-mark-3)", price: 1642.9, chg: 2.18, seed: 83, sector: "Information technology" },
  { id: "ORCL", name: "Oracle", mark: "O", color: "var(--c-mark-4)", price: 141.06, chg: -1.32, seed: 97, sector: "Information technology" },
  { id: "CRM", name: "Salesforce", mark: "S", color: "var(--c-mark-5)", price: 264.71, chg: -2.87, seed: 103, sector: "Information technology" },
  { id: "XOM", name: "Exxon Mobil", mark: "X", color: "var(--c-mark-5)", price: 118.44, chg: 1.94, seed: 109, sector: "Energy" },
  { id: "CVX", name: "Chevron", mark: "C", color: "var(--c-mark-1)", price: 156.82, chg: 1.21, seed: 127, sector: "Energy" },
  { id: "SLB", name: "SLB", mark: "S", color: "var(--c-mark-3)", price: 44.18, chg: -1.68, seed: 137, sector: "Energy" },
  { id: "COP", name: "ConocoPhillips", mark: "C", color: "var(--c-mark-4)", price: 109.35, chg: 0.86, seed: 149, sector: "Energy" },
  { id: "JPM", name: "JPMorgan Chase", mark: "J", color: "var(--c-mark-1)", price: 214.6, chg: 0.74, seed: 157, sector: "Financials" },
  { id: "GS", name: "Goldman Sachs", mark: "G", color: "var(--c-mark-5)", price: 486.12, chg: -0.41, seed: 163, sector: "Financials" },
  { id: "BRK.B", name: "Berkshire Hathaway", mark: "B", color: "var(--c-mark-4)", price: 441.28, chg: 0.32, seed: 173, sector: "Financials" },
  { id: "V", name: "Visa", mark: "V", color: "var(--c-mark-3)", price: 276.94, chg: -1.09, seed: 179, sector: "Financials" },
  { id: "LLY", name: "Eli Lilly", mark: "L", color: "var(--c-mark-3)", price: 892.4, chg: 3.12, seed: 191, sector: "Health care" },
  { id: "UNH", name: "UnitedHealth", mark: "U", color: "var(--c-mark-4)", price: 512.77, chg: -3.44, seed: 197, sector: "Health care" },
  { id: "JNJ", name: "Johnson & Johnson", mark: "J", color: "var(--c-mark-1)", price: 158.9, chg: 0.28, seed: 211, sector: "Health care" },
  { id: "PFE", name: "Pfizer", mark: "P", color: "var(--c-mark-5)", price: 28.64, chg: -2.06, seed: 223, sector: "Health care" },
  { id: "F", name: "Ford Motor", mark: "F", color: "var(--c-mark-4)", price: 12.1, chg: -1.94, seed: 229, sector: "Consumer discretionary" },
  { id: "HD", name: "Home Depot", mark: "H", color: "var(--c-mark-5)", price: 362.18, chg: 0.61, seed: 233, sector: "Consumer discretionary" },
  { id: "RIVN", name: "Rivian", mark: "R", color: "#E0796B", price: 13.7, chg: -4.86, seed: 239, sector: "Consumer discretionary" },
  { id: "CAT", name: "Caterpillar", mark: "C", color: "var(--c-mark-1)", price: 338.5, chg: 1.42, seed: 251, sector: "Industrials" },
  { id: "BA", name: "Boeing", mark: "B", color: "#E0796B", price: 178.24, chg: -3.91, seed: 257, sector: "Industrials" },
  { id: "GE", name: "GE Aerospace", mark: "G", color: "var(--c-mark-3)", price: 172.63, chg: 0.94, seed: 263, sector: "Industrials" },
  { id: "KO", name: "Coca-Cola", mark: "K", color: "var(--c-mark-5)", price: 63.42, chg: -0.18, seed: 269, sector: "Consumer staples" },
  { id: "PG", name: "Procter & Gamble", mark: "P", color: "var(--c-mark-1)", price: 167.85, chg: -0.36, seed: 271, sector: "Consumer staples" },
  { id: "NEE", name: "NextEra Energy", mark: "N", color: "var(--c-mark-4)", price: 71.29, chg: -0.52, seed: 277, sector: "Utilities" },
  { id: "AMT", name: "American Tower", mark: "A", color: "var(--c-mark-5)", price: 196.4, chg: -1.14, seed: 281, sector: "Real estate" },
  { id: "LIN", name: "Linde", mark: "L", color: "var(--c-mark-3)", price: 462.9, chg: 0.44, seed: 283, sector: "Materials" },
  /* Small caps. Without them the Russell tab would have almost nothing in it,
     and a tab that opens on an empty room is worse than no tab. */
  { id: "SOFI", name: "SoFi Technologies", mark: "S", color: "var(--c-mark-3)", price: 8.42, chg: 3.28, seed: 293, sector: "Financials" },
  { id: "CHPT", name: "ChargePoint", mark: "C", color: "#E0796B", price: 1.36, chg: -5.42, seed: 307, sector: "Industrials" },
  { id: "PLUG", name: "Plug Power", mark: "P", color: "#E0796B", price: 2.18, chg: -3.86, seed: 311, sector: "Industrials" },
  { id: "RUN", name: "Sunrun", mark: "R", color: "var(--c-mark-5)", price: 11.74, chg: 2.64, seed: 313, sector: "Utilities" },
  { id: "FUBO", name: "fuboTV", mark: "F", color: "var(--c-mark-4)", price: 1.92, chg: 1.58, seed: 317, sector: "Communication services" },
  { id: "CELH", name: "Celsius Holdings", mark: "C", color: "var(--c-mark-3)", price: 32.66, chg: -2.14, seed: 331, sector: "Consumer staples" },
];

/*
  Index membership.

  Authored rather than derived: which index a name belongs to is a fact about
  the index provider's rules, not something you can infer from a price. A name
  can sit in more than one — most of the Nasdaq 100 is also in the S&P 500 —
  which is exactly how the real indices overlap.
*/
const MEMBERSHIP: Record<string, string[]> = {
  AAPL: ["SPX", "NDX"], MSFT: ["SPX", "NDX"], NVDA: ["SPX", "NDX"],
  AMZN: ["SPX", "NDX"], TSLA: ["SPX", "NDX"], GOOGL: ["SPX", "NDX"],
  META: ["SPX", "NDX"], NFLX: ["SPX", "NDX"], AMD: ["SPX", "NDX"],
  AVGO: ["SPX", "NDX"], ORCL: ["SPX"], CRM: ["SPX"], SPOT: ["NDX"],
  XOM: ["SPX"], CVX: ["SPX"], SLB: ["SPX"], COP: ["SPX"],
  JPM: ["SPX"], GS: ["SPX"], "BRK.B": ["SPX"], V: ["SPX"],
  LLY: ["SPX"], UNH: ["SPX"], JNJ: ["SPX"], PFE: ["SPX"],
  F: ["SPX"], HD: ["SPX"], CAT: ["SPX"], BA: ["SPX"], GE: ["SPX"],
  KO: ["SPX"], PG: ["SPX"], NEE: ["SPX"], AMT: ["SPX"], LIN: ["SPX"],
  RIVN: ["NDX"],
  SOFI: ["RUT"], CHPT: ["RUT"], PLUG: ["RUT"], RUN: ["RUT"],
  FUBO: ["RUT"], CELH: ["RUT"],
};

/** Every quoted name that sits in a given index. */
export function constituents(indexId: string): Quote[] {
  return UNIVERSE.filter((q) => MEMBERSHIP[q.id]?.includes(indexId));
}

/** How that index's own names finished today. */
export function indexBreadth(indexId: string) {
  const names = constituents(indexId);
  const up = names.filter((q) => q.chg > 0).length;
  return { total: names.length, up, down: names.length - up };
}

/** An index's own leaders and laggards, strongest first then weakest. */
export function indexMovers(indexId: string, each = 3) {
  const sorted = [...constituents(indexId)].sort((a, b) => b.chg - a.chg);
  return {
    leaders: sorted.slice(0, each),
    laggards: sorted.slice(-each).reverse(),
  };
}

/** Which GICS sector each covered instrument reports into. */
const COVERED_SECTOR: Record<string, string> = {
  AAPL: "Information technology",
  MSFT: "Information technology",
  NVDA: "Information technology",
  TSLA: "Consumer discretionary",
  AMZN: "Consumer discretionary",
  SPOT: "Communication services",
};

/** Every symbol the terminal quotes — covered instruments first. */
export const UNIVERSE: Quote[] = [
  ...INSTRUMENTS.map((stock) => ({
    id: stock.id,
    name: stock.short,
    mark: stock.mark,
    color: stock.color,
    price: stock.price,
    chg: stock.chg,
    seed: stock.seed,
    sector: COVERED_SECTOR[stock.id] ?? "Information technology",
    covered: true,
  })),
  ...TAPE.map((quote) => ({ ...quote, covered: false })),
];

/** The day's largest advances, strongest first. */
export function gainers(limit = 6): Quote[] {
  return UNIVERSE.filter((q) => q.chg > 0)
    .sort((a, b) => b.chg - a.chg)
    .slice(0, limit);
}

/** The day's largest declines, steepest first. */
export function losers(limit = 6): Quote[] {
  return UNIVERSE.filter((q) => q.chg < 0)
    .sort((a, b) => a.chg - b.chg)
    .slice(0, limit);
}

/**
 * The names the desk is asked about most — the ribbon's contents.
 *
 * Covered instruments lead, because those are the ones a reader can actually
 * open; the rest of the tape follows by the size of its move.
 */
export function popular(): Quote[] {
  const covered = UNIVERSE.filter((q) => q.covered);
  const rest = UNIVERSE.filter((q) => !q.covered)
    .sort((a, b) => Math.abs(b.chg) - Math.abs(a.chg))
    .slice(0, 6);
  return [...covered, ...rest];
}

/**
 * Sectors as groups of stocks rather than as a single bar each — every sector
 * shows its four largest movers, and the count says what is behind the four.
 */
export function sectorGroups(perSector = 4) {
  return SECTORS.map((sector) => {
    const members = UNIVERSE.filter((q) => q.sector === sector.name).sort(
      (a, b) => Math.abs(b.chg) - Math.abs(a.chg),
    );
    return {
      ...sector,
      members: members.slice(0, perSector),
      total: members.length,
    };
    /* Filtered on the real count, not on the sliced one — a caller asking for
       zero members still wants the sector and its number. */
  }).filter((group) => group.total > 0);
}

/* ------------------------------------------------------------------ */
/* Monthly performance                                                 */
/* ------------------------------------------------------------------ */

export type MonthBar = {
  label: string;
  /** Return for the month, percent. */
  value: number;
  /** True for the month still being counted. */
  running: boolean;
};

/*
  The book's last four months. The current month is marked `running` and is
  drawn hatched rather than solid — a month in progress is not a result, and
  the design should not let it look like one.
*/
export const MONTHS: MonthBar[] = [
  { label: "Jan", value: 4.12, running: false },
  { label: "Feb", value: 2.36, running: false },
  { label: "Mar", value: 6.84, running: true },
  { label: "Apr", value: 3.05, running: false },
];

/** Share of the universe that advanced, as a headline figure. */
export const ADVANCING_SHARE = BREADTH_SHARE();

function BREADTH_SHARE() {
  const advancing = UNIVERSE.filter((q) => q.chg > 0).length;
  return (advancing / UNIVERSE.length) * 100;
}

/** When each held position was opened. Fixed dates — nothing is timed here. */
export const OPENED: Record<string, string> = {
  AAPL: "12 Feb 2026",
  NVDA: "3 Mar 2026",
  MSFT: "21 Jan 2026",
};

/* ------------------------------------------------------------------ */
/* Turnover                                                            */
/* ------------------------------------------------------------------ */

/**
 * Money traded in a name today, in millions.
 *
 * A live quote carries the real figure and it is taken as given. Everything
 * else falls back to the seeded shape below, so the boards still rank when the
 * feed is absent and callers never have to ask which of the two they got.
 */
export function turnover(quote: Quote): number {
  return quote.turnoverM ?? seededTurnover(quote);
}

/*
  The mock path. Derived rather than authored, from the same seed everything
  else uses, and shaped the way real turnover behaves: it scales with the size
  of the name and swells when the price moves, because a quiet name does not
  suddenly trade heavily for no reason.
*/
function seededTurnover(quote: Quote): number {
  const base = quote.price * (58 + (quote.seed % 94));
  const excitement = 1 + Math.abs(quote.chg) / 5.5;
  return Math.round((base * excitement) / 10) / 100;
}

/**
 * The heaviest-traded names.
 *
 * Often the more useful board for someone new to this: "what is everyone
 * looking at" is a more answerable question than "what rose most", and the
 * biggest riser is frequently a small name nobody is actually trading.
 */
export function mostActive(limit = 6): Quote[] {
  return [...UNIVERSE].sort((a, b) => turnover(b) - turnover(a)).slice(0, limit);
}

/** How many of the quoted universe finished higher. */
export const ADVANCING_COUNT = UNIVERSE.filter((q) => q.chg > 0).length;


/* ------------------------------------------------------------------ */
/* Sector routing                                                      */
/* ------------------------------------------------------------------ */

/** URL-safe form of a sector name: "Information technology" -> "information-technology". */
export const sectorSlug = (name: string) =>
  name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

export function getSector(slug: string) {
  const sector = SECTORS.find((s) => sectorSlug(s.name) === slug);
  if (!sector) return null;
  const members = UNIVERSE.filter((q) => q.sector === sector.name).sort(
    (a, b) => b.chg - a.chg,
  );
  const up = members.filter((q) => q.chg > 0).length;
  return { ...sector, members, up, down: members.length - up };
}

/** Every sector that has at least one quoted name behind it. */
export function allSectors() {
  return SECTORS.filter((s) => UNIVERSE.some((q) => q.sector === s.name));
}
