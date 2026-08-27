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

export type SessionPhase = "pre-market" | "open" | "closed" | "halted";

export type Session = {
  phase: SessionPhase;
  /** Tracked-caps label for the dateline. */
  label: string;
  /** Long-form date, e.g. "Monday, 3 August 2026". */
  date: string;
  /** Clock, e.g. "16:00 UTC". */
  clock: string;
  /** Seconds since the last tick arrived — the staleness readout. */
  lastTick: string;
  /** True only while the book is live; drives the pulsing gold dot. */
  live: boolean;

  /* Only a live feed carries these; sessionAt leaves them unset. */
  /** True while the quotes behind the page are the delayed feed. */
  delayed?: boolean;
  /** What the gateway calls the feed, e.g. "Delay". */
  feedSource?: string;
};

/*
  US cash equities in August: 09:30–16:00 ET is 13:30–20:00 UTC, with the
  pre-market opening at 08:00 ET / 12:00 UTC. Expressed in seconds past
  midnight UTC so the comparison is integer arithmetic rather than date math.
*/
const PRE_OPEN_UTC = 12 * 3600;
const OPEN_UTC = 13 * 3600 + 30 * 60;
const CLOSE_UTC = 20 * 3600;

const DATE_FMT = new Intl.DateTimeFormat("en-US", {
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

const CLOCK_FMT = new Intl.DateTimeFormat("en-US", {
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: "UTC",
});

const PHASE_LABEL: Record<SessionPhase, string> = {
  "pre-market": "Pre-market",
  open: "Market open",
  closed: "Market closed",
  halted: "Trading halted",
};

/**
 * Resolve the session at a given instant. Weekends read as closed; every other
 * boundary comes from the three constants above.
 *
 * `at` is a parameter rather than a module constant so that the day a real
 * clock replaces `ANCHOR`, this function is the only thing that changes.
 */
/* Full-day NYSE and Nasdaq closures, as ISO dates in US Eastern terms.

   A weekday check alone is not enough: without this the dateline announces an
   open market on Thanksgiving and the live dot pulses against a book that is
   not trading. Committed rather than computed because the rules are irregular
   — Good Friday moves with Easter, and a holiday falling at a weekend is
   observed on an adjacent weekday — and a wrong guess is worse than a list
   that has to be extended.

   Half-days (the early closes after Thanksgiving and before Christmas) are not
   modelled: the market genuinely is open on those days, and a session that
   ends ninety minutes early reads as "closed" a little sooner, which is the
   harmless direction to be wrong in.

   Extend before January 2029. */
const MARKET_HOLIDAYS = new Set([
  "2026-01-01", "2026-01-19", "2026-02-16", "2026-04-03", "2026-05-25",
  "2026-06-19", "2026-07-03", "2026-09-07", "2026-11-26", "2026-12-25",
  "2027-01-01", "2027-01-18", "2027-02-15", "2027-03-26", "2027-05-31",
  "2027-06-18", "2027-07-05", "2027-09-06", "2027-11-25", "2027-12-24",
  "2028-01-17", "2028-02-21", "2028-04-14", "2028-05-29", "2028-06-19",
  "2028-07-04", "2028-09-04", "2028-11-23", "2028-12-25",
]);

/* The exchange's own calendar day, not the server's. A UTC timestamp inside the
   session belongs to the Eastern date five hours earlier. */
const easternDate = (ms: number): string =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(ms);

export function isMarketHoliday(at: number): boolean {
  return MARKET_HOLIDAYS.has(easternDate(at * 1000));
}

export function sessionAt(at: number = ANCHOR): Session {
  const ms = at * 1000;
  const dayOfWeek = new Date(ms).getUTCDay();
  const secondsIntoDay = ((at % 86400) + 86400) % 86400;
  const weekend = dayOfWeek === 0 || dayOfWeek === 6;
  const shut = weekend || isMarketHoliday(at);

  const phase: SessionPhase = shut
    ? "closed"
    : secondsIntoDay < PRE_OPEN_UTC || secondsIntoDay >= CLOSE_UTC
      ? "closed"
      : secondsIntoDay < OPEN_UTC
        ? "pre-market"
        : "open";

  return {
    phase,
    label: PHASE_LABEL[phase],
    date: DATE_FMT.format(ms),
    clock: `${CLOCK_FMT.format(ms)} UTC`,
    /* Fixed rather than counted: a ticking staleness readout would need a
       clock, and a clock would need to agree with the server. The shape is
       what matters — a live feed fills it in. */
    lastTick: phase === "open" ? "2s ago" : "—",
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
  /** Day change, percent. */
  day: number;
  /** Week change, percent. */
  week: number;
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
  /** Days from ANCHOR — negative is past, 0 is today. */
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

export const CALENDAR: CalendarEvent[] = [
  {
    offset: 0,
    time: "20:05 UTC",
    title: "Spotify · Q2 results",
    kind: "earnings",
    ticker: "SPOT",
    summary:
      "Second-quarter results, reported after the US close. The last price rise on the premium tier produced less cancellation than the company had modelled, so this is the first full quarter showing whether that held.",
    watch:
      "Revenue per user, and whether subscriber growth slowed to pay for it.",
  },
  {
    offset: 1,
    time: "12:30 UTC",
    title: "US non-farm payrolls",
    kind: "macro",
    summary:
      "The monthly count of jobs added across the US economy, excluding farms. It is the single most closely watched economic release, because employment drives both consumer spending and the interest-rate path.",
    watch:
      "The figure against the forecast, and any revision to the two months before it.",
  },
  {
    offset: 1,
    time: "20:05 UTC",
    title: "Amazon · Q2 results",
    kind: "earnings",
    ticker: "AMZN",
    summary:
      "Second-quarter results, after the US close. Retail is the larger business, but cloud and advertising carry most of the profit, so the segment split matters more here than the headline revenue.",
    watch: "Cloud growth rate and retail operating margin, in that order.",
  },
  {
    offset: 3,
    time: "18:00 UTC",
    title: "FOMC rate decision",
    kind: "policy",
    summary:
      "The US central bank sets its target interest rate. Rates set the return available on cash, so they move the price of every other asset — a company's future profits are worth less today when cash pays more.",
    watch:
      "The decision itself, then the projections for where rates go next.",
  },
  {
    offset: 8,
    time: "20:05 UTC",
    title: "Nvidia · Q2 results",
    kind: "earnings",
    ticker: "NVDA",
    summary:
      "Second-quarter results, after the US close. Supply rather than demand has been the constraint, so the guidance for next quarter usually moves the share price more than the quarter just reported.",
    watch: "Data-centre revenue and the guide for the quarter ahead.",
  },
];

const DAY = 86400;

const SHORT_DATE = new Intl.DateTimeFormat("en-US", {
  weekday: "short",
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});

/** Absolute date for an event, and a relative label for the ones nearby. */
export function calendarDate(event: CalendarEvent, at: number = ANCHOR) {
  const stamp = (at + event.offset * DAY) * 1000;
  return {
    date: SHORT_DATE.format(stamp),
    relative:
      event.offset === 0
        ? "Today"
        : event.offset === 1
          ? "Tomorrow"
          : `In ${event.offset} days`,
  };
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
  { id: "GOOGL", name: "Alphabet", mark: "G", color: "#B0BFCB", price: 176.5, chg: 2.41, seed: 41, sector: "Communication services" },
  { id: "META", name: "Meta Platforms", mark: "M", color: "#93C7A8", price: 502.3, chg: 1.86, seed: 53, sector: "Communication services" },
  { id: "NFLX", name: "Netflix", mark: "N", color: "#C9A88A", price: 664.18, chg: -0.74, seed: 67, sector: "Communication services" },
  { id: "AMD", name: "Advanced Micro Devices", mark: "A", color: "#E5DDD1", price: 158.42, chg: 4.62, seed: 71, sector: "Information technology" },
  { id: "AVGO", name: "Broadcom", mark: "B", color: "#93C7A8", price: 1642.9, chg: 2.18, seed: 83, sector: "Information technology" },
  { id: "ORCL", name: "Oracle", mark: "O", color: "#B0BFCB", price: 141.06, chg: -1.32, seed: 97, sector: "Information technology" },
  { id: "CRM", name: "Salesforce", mark: "S", color: "#C9A88A", price: 264.71, chg: -2.87, seed: 103, sector: "Information technology" },
  { id: "XOM", name: "Exxon Mobil", mark: "X", color: "#C9A88A", price: 118.44, chg: 1.94, seed: 109, sector: "Energy" },
  { id: "CVX", name: "Chevron", mark: "C", color: "#E5DDD1", price: 156.82, chg: 1.21, seed: 127, sector: "Energy" },
  { id: "SLB", name: "SLB", mark: "S", color: "#93C7A8", price: 44.18, chg: -1.68, seed: 137, sector: "Energy" },
  { id: "COP", name: "ConocoPhillips", mark: "C", color: "#B0BFCB", price: 109.35, chg: 0.86, seed: 149, sector: "Energy" },
  { id: "JPM", name: "JPMorgan Chase", mark: "J", color: "#E5DDD1", price: 214.6, chg: 0.74, seed: 157, sector: "Financials" },
  { id: "GS", name: "Goldman Sachs", mark: "G", color: "#C9A88A", price: 486.12, chg: -0.41, seed: 163, sector: "Financials" },
  { id: "BRK.B", name: "Berkshire Hathaway", mark: "B", color: "#B0BFCB", price: 441.28, chg: 0.32, seed: 173, sector: "Financials" },
  { id: "V", name: "Visa", mark: "V", color: "#93C7A8", price: 276.94, chg: -1.09, seed: 179, sector: "Financials" },
  { id: "LLY", name: "Eli Lilly", mark: "L", color: "#93C7A8", price: 892.4, chg: 3.12, seed: 191, sector: "Health care" },
  { id: "UNH", name: "UnitedHealth", mark: "U", color: "#B0BFCB", price: 512.77, chg: -3.44, seed: 197, sector: "Health care" },
  { id: "JNJ", name: "Johnson & Johnson", mark: "J", color: "#E5DDD1", price: 158.9, chg: 0.28, seed: 211, sector: "Health care" },
  { id: "PFE", name: "Pfizer", mark: "P", color: "#C9A88A", price: 28.64, chg: -2.06, seed: 223, sector: "Health care" },
  { id: "F", name: "Ford Motor", mark: "F", color: "#B0BFCB", price: 12.1, chg: -1.94, seed: 229, sector: "Consumer discretionary" },
  { id: "HD", name: "Home Depot", mark: "H", color: "#C9A88A", price: 362.18, chg: 0.61, seed: 233, sector: "Consumer discretionary" },
  { id: "RIVN", name: "Rivian", mark: "R", color: "#E0796B", price: 13.7, chg: -4.86, seed: 239, sector: "Consumer discretionary" },
  { id: "CAT", name: "Caterpillar", mark: "C", color: "#E5DDD1", price: 338.5, chg: 1.42, seed: 251, sector: "Industrials" },
  { id: "BA", name: "Boeing", mark: "B", color: "#E0796B", price: 178.24, chg: -3.91, seed: 257, sector: "Industrials" },
  { id: "GE", name: "GE Aerospace", mark: "G", color: "#93C7A8", price: 172.63, chg: 0.94, seed: 263, sector: "Industrials" },
  { id: "KO", name: "Coca-Cola", mark: "K", color: "#C9A88A", price: 63.42, chg: -0.18, seed: 269, sector: "Consumer staples" },
  { id: "PG", name: "Procter & Gamble", mark: "P", color: "#E5DDD1", price: 167.85, chg: -0.36, seed: 271, sector: "Consumer staples" },
  { id: "NEE", name: "NextEra Energy", mark: "N", color: "#B0BFCB", price: 71.29, chg: -0.52, seed: 277, sector: "Utilities" },
  { id: "AMT", name: "American Tower", mark: "A", color: "#C9A88A", price: 196.4, chg: -1.14, seed: 281, sector: "Real estate" },
  { id: "LIN", name: "Linde", mark: "L", color: "#93C7A8", price: 462.9, chg: 0.44, seed: 283, sector: "Materials" },
  /* Small caps. Without them the Russell tab would have almost nothing in it,
     and a tab that opens on an empty room is worse than no tab. */
  { id: "SOFI", name: "SoFi Technologies", mark: "S", color: "#93C7A8", price: 8.42, chg: 3.28, seed: 293, sector: "Financials" },
  { id: "CHPT", name: "ChargePoint", mark: "C", color: "#E0796B", price: 1.36, chg: -5.42, seed: 307, sector: "Industrials" },
  { id: "PLUG", name: "Plug Power", mark: "P", color: "#E0796B", price: 2.18, chg: -3.86, seed: 311, sector: "Industrials" },
  { id: "RUN", name: "Sunrun", mark: "R", color: "#C9A88A", price: 11.74, chg: 2.64, seed: 313, sector: "Utilities" },
  { id: "FUBO", name: "fuboTV", mark: "F", color: "#B0BFCB", price: 1.92, chg: 1.58, seed: 317, sector: "Communication services" },
  { id: "CELH", name: "Celsius Holdings", mark: "C", color: "#93C7A8", price: 32.66, chg: -2.14, seed: 331, sector: "Consumer staples" },
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
