/* Explicit .ts extensions, matching instrument-derive.ts: Turbopack resolves
   without them but `node --test` does not. */
import type { AnalystAvailability } from "../api/normalize/analyst.ts";
import { calendarWindow, easternDay, shiftYears } from "../api/normalize/returns.ts";
import type { PricePoint } from "../api/normalize/series.ts";
import { relativeReturn } from "./derive-performance.ts";
import { relativeVolume, rsi, sma, type IndicatorPoint } from "./indicators.ts";
import type { InstrumentSnapshot } from "./instrument.ts";
import { SECTOR_ETF, type SectorName } from "./sectors.ts";
import { tradingDay } from "./session.ts";

/* The Overview tab's insights: short, dated statements about one stock.
 *
 * WHAT THIS REPLACES. insights() in instrument-derive.ts printed at most three
 * readings: where the price sat in its 52-week range (as "near its
 * twelve-month high" at 80% of the range, however far below the high that
 * was), the gateway's RSI with a "momentum is unremarkable" line for every
 * ordinary reading, and a tally of the vendor's machine sentiment over the
 * three headlines on the page, credited to "the publisher". None of it named
 * a date, and none of it compared the stock with anything.
 *
 * WHAT AN INSIGHT HERE MUST BE:
 *   - a measured figure, with the date it was measured to and the data it came
 *     from. Every sentence below is arithmetic over one of the snapshot's own
 *     series or records; nothing is estimated and nothing is forecast.
 *   - never advice. No buy, sell, cheap, expensive or "opportunity". Where a
 *     convention exists (RSI's 70/30) it is named as a convention.
 *   - withheld when the data cannot carry it. A split record that could not be
 *     read silences every figure measured from the bars; a short-interest
 *     filing older than six weeks is not "short interest"; a benchmark whose
 *     bars end on a different day is not compared; an analyst feed this
 *     account cannot read produces no sentence at all, rather than one about
 *     the account.
 *
 * RELEVANCE. Each candidate carries a 0-100 score for how much it says today:
 * an earnings report inside a week, a fresh 52-week extreme or a close that
 * just crossed its 200-day average outrank a mid-range reading. The page
 * shows the top INSIGHT_LIMIT.
 *
 * PURITY. No clock, no fetch, no locale. `now` arrives in the input and is
 * used only for "is this date still ahead" questions (earnings, ex-dividend);
 * everything else is dated by the bars themselves. Numbers are formatted with
 * an explicit en-US locale so the server and the browser print the same
 * string. The caller is expected to run this where the full snapshot lives —
 * on the server, before shippedWithPage() drops the benchmark and trims the
 * bars to one year — and ship the result, which is a few hundred bytes. */

/** How many insights the Overview tab shows. */
export const INSIGHT_LIMIT = 5;

export type InsightId =
  | "earnings"
  | "range"
  | "relative"
  | "trend"
  | "big-move"
  | "volume"
  | "valuation"
  | "analyst"
  | "short-interest"
  | "dividend"
  | "momentum";

/** Direction of the fact, never a verdict: "up" is a price above a line or
    ahead of a benchmark, not a recommendation. Calendar items are neutral. */
export type InsightTone = "up" | "down" | "neutral";

export type StockInsight = {
  id: InsightId;
  title: string;
  body: string;
  tone: InsightTone;
  /** The data the figures come from, named. */
  source: string;
  /** The exchange date the figures describe, "yyyy-mm-dd", or null where the
      source carries no date (the analyst feed). */
  asOf: string | null;
  /** 0-100, for ranking only. */
  score: number;
};

/** A comparison series: the market proxy or the sector fund, split-repaired. */
export type Benchmark = { symbol: string; daily: readonly PricePoint[] };

export type EarningsDate = {
  /** "yyyy-mm-dd", the exchange date of the report. */
  date: string;
  /** Who says so, printed with the date. */
  source: string;
  timing?: "before-open" | "after-close" | null;
};

export type InsightInput = {
  ticker: string;
  /** Completed sessions only, oldest first, split-repaired. The server's five
      years is best; the shipped year is enough for everything but the age of
      a 50/200-day crossing. */
  daily: readonly PricePoint[];
  /** False when the corporate-actions record could not be read, so `daily` is
      unrepaired and every figure measured from it may straddle a split. */
  splitsKnown: boolean;
  market: Benchmark | null;
  sector: Benchmark | null;
  pe: number | null;
  evToEbitda: number | null;
  peers: ReadonlyArray<{ id: string; name: string; pe: number | null; evToEbitda?: number | null }>;
  sharesOutstanding: number | null;
  shortInterest: {
    shortInterest: number | null;
    daysToCover: number | null;
    settlementDate: string | null;
  } | null;
  analyst: AnalystAvailability | null;
  /** No feed on this account carries an earnings calendar; null until one does. */
  earnings: EarningsDate | null;
  dividends: ReadonlyArray<{ exDate: string; amount: number; payDate: string | null }>;
  /** When the quote (and so the P/E) was struck, epoch ms. */
  quoteAsOf: number | null;
  /** The instant the page is built. Only "still ahead?" questions read it. */
  now: number;
};

/* ── formatting: explicit, locale-free, the page's own conventions ────── */

const DAY_MS = 86_400_000;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const ISO_DAY = /^(\d{4})-(\d{2})-(\d{2})/;

/** "yyyy-mm-dd" from a feed date string, or null when it is not one. */
function isoDay(value: string | null | undefined): string | null {
  const m = value ? ISO_DAY.exec(value.trim()) : null;
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

/** "23 Sep 2026" from "2026-09-23". */
function dateLabel(day: string): string {
  const [y, m, d] = day.split("-").map(Number);
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

const dayNumber = (day: string): number => {
  const [y, m, d] = day.split("-").map(Number);
  return Date.UTC(y, m - 1, d) / DAY_MS;
};

/** Signed percent with a true minus, the way pct() in format.ts prints it. */
function signedPct(n: number): string {
  const a = Math.abs(n).toFixed(1);
  return a === "0.0" ? "0.0%" : `${n > 0 ? "+" : "−"}${a}%`;
}

const absPct = (n: number): string => `${Math.abs(n).toFixed(1)}%`;

const usd = (n: number): string =>
  `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/* Dividends are declared to the tenth of a cent and beyond; two decimals
   would round a real declaration into one the company never made. */
const cash = (n: number): string =>
  `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`;

const times = (n: number): string => `${n.toFixed(1)}×`;

function shareCount(n: number): string {
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return String(Math.round(n));
}

function ordinal(n: number): string {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return `${n}th`;
  return `${n}${["th", "st", "nd", "rd"][n % 10] ?? "th"}`;
}

const cap = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

const positive = (v: number | null | undefined): number | null =>
  typeof v === "number" && Number.isFinite(v) && v > 0 ? v : null;

const clampScore = (n: number): number => Math.round(Math.max(0, Math.min(100, n)) * 10) / 10;

function median(xs: readonly number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 === 1 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/* ── the bars, once ───────────────────────────────────────────────────── */

type Bar = PricePoint & { high: number; low: number; day: string };

/* Usable bars, oldest first, each with its exchange date. A bar without a
   high or low stands in with its close — the 52-week range then reads the
   close for that session, which is the most it can honestly say. */
function barsOf(points: readonly PricePoint[], dayOf: (at: number) => string): Bar[] {
  const out: Bar[] = [];
  for (const p of points) {
    if (!Number.isFinite(p.at) || !(p.price > 0) || !Number.isFinite(p.price)) continue;
    const high = positive(p.high) ?? p.price;
    const low = positive(p.low) ?? p.price;
    out.push({
      ...p,
      high: Math.max(high, p.price),
      low: Math.min(low, p.price),
      day: dayOf(p.at),
    });
  }
  return out.sort((a, b) => a.at - b.at);
}

/* The subject and its benchmarks share one calendar, so each session's
   exchange date is formatted once per call rather than once per series:
   three five-year series is 3,800 Intl calls otherwise. Per call, not per
   module, so nothing outlives the render that built it. */
function dayCache(): (at: number) => string {
  const seen = new Map<number, string>();
  return (at) => {
    let day = seen.get(at);
    if (day === undefined) {
      day = easternDay(at);
      seen.set(at, day);
    }
    return day;
  };
}

/* ── 52-week range ────────────────────────────────────────────────────── */

function rangeInsight(bars: Bar[]): StockInsight | null {
  /* The record must reach back a year, or the "52-week" high is really the
     high since listing wearing a longer label. calendarWindow applies the
     same week of grace the page's 1Y return does. */
  if (bars.length < 2 || calendarWindow(bars, 1) === null) return null;

  const last = bars[bars.length - 1];
  const anchor = shiftYears(last.day, -1);
  const year = bars.filter((b) => b.day > anchor);
  if (year.length < 2) return null;

  // `>=`/`<=` so the most recent session to touch an extreme is the one named.
  let hi = year[0];
  let lo = year[0];
  for (const b of year) {
    if (b.high >= hi.high) hi = b;
    if (b.low <= lo.low) lo = b;
  }
  const spread = hi.high - lo.low;
  if (!(spread > 0)) return null;

  const position = ((last.price - lo.low) / spread) * 100;
  const belowHigh = (1 - last.price / hi.high) * 100;
  const aboveLow = (last.price / lo.low - 1) * 100;
  const body = `Closed at ${usd(last.price)} on ${dateLabel(last.day)}: ${absPct(belowHigh)} below the 52-week high of ${usd(hi.high)} (${dateLabel(hi.day)}) and ${absPct(aboveLow)} above the low of ${usd(lo.low)} (${dateLabel(lo.day)}).`;
  const base = { id: "range" as const, body, source: "Daily price bars, split-adjusted", asOf: last.day };

  if (hi === last) {
    return { ...base, title: `Set a 52-week high on ${dateLabel(last.day)}`, tone: "up", score: 90 };
  }
  if (lo === last) {
    return { ...base, title: `Set a 52-week low on ${dateLabel(last.day)}`, tone: "down", score: 90 };
  }

  /* "Near" is measured both ways: within 5% of the extreme, or in the outer
     15% of the range. The old rule was the second alone at 20%, which on a
     wide range called a price 6% under its high "near" it. */
  const upper = position >= 50;
  const fromExtreme = upper ? belowHigh : aboveLow;
  const edge = upper ? 100 - position : position;
  if (fromExtreme <= 5 || edge <= 15) {
    return {
      ...base,
      title: upper
        ? `${absPct(belowHigh)} below its 52-week high`
        : `${absPct(aboveLow)} above its 52-week low`,
      tone: upper ? "up" : "down",
      score: clampScore(
        Math.min(88, 50 + (15 - Math.min(edge, 15)) * 2 + Math.max(0, 5 - fromExtreme) * 3),
      ),
    };
  }
  return {
    ...base,
    title: `${Math.round(position)}% of the way up its 52-week range`,
    tone: "neutral",
    score: 20,
  };
}

/* ── trend against the 50- and 200-day averages ───────────────────────── */

type Run = { sign: number; sessions: number; since: string | null };

/* How long `line` has sat on its current side of `base`, in sessions, paired
   by timestamp. `since` is the first session of the run, or null when the run
   reaches back to where the two series first overlap — then the crossing
   happened before the record, or never, and no date can be given. */
function runAgainst(line: readonly IndicatorPoint[], base: readonly IndicatorPoint[], days: Map<number, string>): Run | null {
  const byAt = new Map<number, number>();
  for (const p of base) byAt.set(p.at, p.value);
  const paired: Array<{ at: number; sign: number }> = [];
  for (const p of line) {
    const other = byAt.get(p.at);
    if (other !== undefined) paired.push({ at: p.at, sign: Math.sign(p.value - other) });
  }
  if (paired.length === 0) return null;
  const sign = paired[paired.length - 1].sign;
  if (sign === 0) return { sign, sessions: 0, since: null };
  let start = paired.length - 1;
  while (start > 0 && paired[start - 1].sign === sign) start -= 1;
  return {
    sign,
    sessions: paired.length - start,
    since: start === 0 ? null : (days.get(paired[start].at) ?? null),
  };
}

const sideOf = (gap: number): "above" | "below" | "at" => (gap > 0 ? "above" : gap < 0 ? "below" : "at");
const gapPhrase = (gap: number): string => (gap === 0 ? "at" : `${absPct(gap)} ${sideOf(gap)}`);

function trendInsight(bars: Bar[]): StockInsight | null {
  const s50 = sma(bars, 50);
  if (s50.length === 0) return null;
  const s200 = sma(bars, 200);
  const last = bars[bars.length - 1];
  const a50 = s50[s50.length - 1];
  const a200 = s200.length ? s200[s200.length - 1] : null;
  if (a50.at !== last.at || (a200 !== null && a200.at !== last.at) || !(a50.value > 0)) return null;

  const gap50 = (last.price / a50.value - 1) * 100;
  const gap200 = a200 === null ? null : (last.price / a200.value - 1) * 100;
  const side50 = sideOf(gap50);
  const side200 = gap200 === null ? null : sideOf(gap200);

  const title =
    side200 === null
      ? `${cap(side50)} its 50-day average`
      : side50 === side200
        ? `${cap(side50)} its 50- and 200-day averages`
        : `${cap(side50)} its 50-day average, ${side200} its 200-day`;

  let body = `The ${dateLabel(last.day)} close of ${usd(last.price)} was ${gapPhrase(gap50)} its 50-day average (${usd(a50.value)})`;
  body += a200 === null || gap200 === null ? "." : ` and ${gapPhrase(gap200)} its 200-day average (${usd(a200.value)}).`;

  let score = 35 + Math.min(10, Math.abs(gap200 ?? gap50) / 3);

  if (a200 !== null) {
    const days = new Map(bars.map((b) => [b.at, b.day]));
    const closes: IndicatorPoint[] = bars.map((b) => ({ at: b.at, value: b.price }));

    const priceRun = runAgainst(closes, s200, days);
    if (priceRun && priceRun.sign !== 0 && priceRun.since !== null) {
      const n = priceRun.sessions;
      body += ` It has closed ${priceRun.sign > 0 ? "above" : "below"} the 200-day for ${n} session${n === 1 ? "" : "s"}, since ${dateLabel(priceRun.since)}.`;
      if (n <= 10) score += 35;
    }

    const cross = runAgainst(s50, s200, days);
    if (cross && cross.sign !== 0 && cross.since !== null) {
      body += ` The 50-day average crossed ${cross.sign > 0 ? "above" : "below"} the 200-day on ${dateLabel(cross.since)}.`;
      if (cross.sessions <= 20) score += 25;
    }
  }

  const tone: InsightTone =
    side200 === null
      ? side50 === "above" ? "up" : side50 === "below" ? "down" : "neutral"
      : side50 === side200 && side50 !== "at"
        ? side50 === "above" ? "up" : "down"
        : "neutral";

  return {
    id: "trend",
    title,
    body,
    tone,
    source: "Daily closes, split-adjusted; 50- and 200-session simple averages",
    asOf: last.day,
    score: clampScore(Math.min(95, score)),
  };
}

/* ── performance against SPY and the sector fund ──────────────────────── */

/* How far apart two records' closes may sit and still be called the same
   session: a long weekend with a holiday beside it. The same slack
   derive-performance.ts allows the market proxy. */
const ALIGN_SLACK_MS = 4 * DAY_MS;

/* A single session beyond this in a benchmark is a split the record did not
   repair, not a market. A sector fund quoted −50% overnight would otherwise
   become "ahead of its sector by 90%". */
const CLIFF_PCT = 25;

/** The last bar at or before `at`, within the alignment slack, or null. */
function barAt(bars: readonly Bar[], at: number): Bar | null {
  let lo = 0;
  let hi = bars.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (bars[mid].at <= at) {
      found = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  if (found < 0 || at - bars[found].at > ALIGN_SLACK_MS) return null;
  return bars[found];
}

function hasCliff(bars: readonly Bar[], from: number, to: number): boolean {
  for (let i = 1; i < bars.length; i += 1) {
    if (bars[i].at <= from || bars[i].at > to) continue;
    if (Math.abs((bars[i].price / bars[i - 1].price - 1) * 100) > CLIFF_PCT) return true;
  }
  return false;
}

type Window = { label: string; sessions?: number; years?: number; weight: number };

/* The same windows as the Performance tab: 21 and 64 sessions, and a
   calendar year struck exactly as the page's 1Y figure is. The weights only
   rank: a month's gap counts a little more than the same gap over a year,
   and not so much more that one noisy month outranks a year. */
const WINDOWS: readonly Window[] = [
  { label: "1 month", sessions: 21, weight: 1.25 },
  { label: "3 months", sessions: 64, weight: 1.25 },
  { label: "1 year", years: 1, weight: 1 },
];

/** A benchmark ready to measure: its bars, and how a sentence names it. */
type Leg = { symbol: string; label: string; bars: Bar[] };

/* The market proxy and the sector fund, each only if it is not the subject
   itself (SPY's page is not "in line with SPY") and not the other leg. */
function legsFor(input: InsightInput, dayOf: (at: number) => string): { market: Leg | null; sector: Leg | null } {
  const self = input.ticker.trim().toUpperCase();
  const { market: m, sector: s } = input;
  const market =
    m && m.symbol.trim().toUpperCase() !== self
      ? { symbol: m.symbol, label: m.symbol, bars: barsOf(m.daily, dayOf) }
      : null;
  const sector =
    s &&
    s.symbol.trim().toUpperCase() !== self &&
    s.symbol.trim().toUpperCase() !== m?.symbol.trim().toUpperCase()
      ? { symbol: s.symbol, label: `its sector fund ${s.symbol}`, bars: barsOf(s.daily, dayOf) }
      : null;
  return { market, sector };
}

function relativeInsight(ticker: string, bars: Bar[], market: Leg | null, sector: Leg | null): StockInsight | null {
  if (bars.length < 2) return null;
  const self = ticker.trim().toUpperCase();
  const legs = [market, sector].filter((l): l is Leg => l !== null && l.bars.length > 0);
  if (legs.length === 0) return null;

  const last = bars[bars.length - 1];
  type Row = { window: Window; stock: number; bench: Array<{ leg: Leg; ret: number; rel: number } | null> };
  const rows: Row[] = [];

  for (const w of WINDOWS) {
    let from: Bar | null = null;
    if (w.sessions !== undefined) {
      from = bars.length > w.sessions ? bars[bars.length - 1 - w.sessions] : null;
    } else if (w.years !== undefined) {
      from = calendarWindow(bars, w.years)?.from ?? null;
    }
    if (from === null) continue;
    const stock = (last.price / from.price - 1) * 100;

    const bench = legs.map((leg) => {
      const a = barAt(leg.bars, from.at);
      const b = barAt(leg.bars, last.at);
      if (!a || !b || a.at >= b.at || hasCliff(leg.bars, a.at, b.at)) return null;
      const ret = (b.price / a.price - 1) * 100;
      const rel = relativeReturn(stock, ret);
      return rel === null ? null : { leg, ret, rel };
    });
    if (bench.some((x) => x !== null)) rows.push({ window: w, stock, bench });
  }
  if (rows.length === 0) return null;

  /* The headline is the longest window measured: a year says more than a
     month, and the month is still in the sentence. */
  const head = rows[rows.length - 1];
  const verdicts = head.bench
    .filter((x): x is NonNullable<typeof x> => x !== null)
    .map((x) => ({
      label: x.leg.label,
      word: x.rel >= 1 ? "ahead of" : x.rel <= -1 ? "behind" : "in line with",
      rel: x.rel,
    }));

  const title =
    verdicts.length === 2 && verdicts[0].word === verdicts[1].word
      ? `${cap(verdicts[0].word)} ${verdicts[0].label} and ${verdicts[1].label} over ${head.window.label}`
      : `${verdicts.map((v, i) => `${i === 0 ? cap(v.word) : v.word} ${v.label}`).join(", ")} over ${head.window.label}`;

  const sentences = rows.map((r) => {
    const parts = r.bench
      .filter((x): x is NonNullable<typeof x> => x !== null)
      .map((x) => `${x.leg.symbol} ${signedPct(x.ret)}`);
    return `${cap(r.window.label)}: ${signedPct(r.stock)} (${parts.join(", ")}).`;
  });
  const body = `${sentences.join(" ")} Price change to the ${dateLabel(last.day)} close; dividends excluded.`;

  let magnitude = 0;
  for (const r of rows) {
    for (const x of r.bench) if (x) magnitude = Math.max(magnitude, Math.abs(x.rel) * r.window.weight);
  }

  const lead = verdicts[0];
  return {
    id: "relative",
    title,
    body,
    tone: lead.rel >= 1 ? "up" : lead.rel <= -1 ? "down" : "neutral",
    source: `Daily closes, split-adjusted: ${self}, ${legs.map((l) => l.symbol).join(" and ")}`,
    asOf: last.day,
    score: clampScore(25 + Math.min(55, magnitude * 1.5)),
  };
}

/* ── valuation against the peers the company record names ────────────── */

function valuationInsight(input: InsightInput): StockInsight | null {
  const pe = positive(input.pe);
  if (pe === null) return null;
  const self = input.ticker.trim().toUpperCase();

  /* One vote per company: GOOG and GOOGL are the same earnings twice, and
     counting both would tilt the median toward whoever has two classes. */
  const pes: number[] = [];
  const evs: number[] = [];
  const seenPe = new Set<string>();
  const seenEv = new Set<string>();
  for (const p of input.peers) {
    if (p.id.trim().toUpperCase() === self) continue;
    const key = p.name.trim().toLowerCase() || p.id.trim().toUpperCase();
    const q = positive(p.pe);
    if (q !== null && !seenPe.has(key)) {
      seenPe.add(key);
      pes.push(q);
    }
    const e = positive(p.evToEbitda ?? null);
    if (e !== null && !seenEv.has(key)) {
      seenEv.add(key);
      evs.push(e);
    }
  }
  if (pes.length < 3) return null;

  const mid = median(pes);
  const ratio = pe / mid;
  const premium = (ratio - 1) * 100;
  const title =
    ratio >= 2
      ? `P/E ${times(ratio)} its peers' median`
      : premium >= 10
        ? `P/E ${absPct(premium)} above its peers' median`
        : premium <= -10
          ? `P/E ${absPct(premium)} below its peers' median`
          : "P/E in line with its peers' median";

  let body = `Trailing P/E of ${pe.toFixed(1)} against a median of ${mid.toFixed(1)} across ${pes.length} peers named in its company record (range ${Math.min(...pes).toFixed(1)} to ${Math.max(...pes).toFixed(1)}).`;
  const ev = positive(input.evToEbitda);
  if (ev !== null && evs.length >= 3) {
    body += ` EV/EBITDA of ${times(ev)} against a peer median of ${times(median(evs))}.`;
  }

  return {
    id: "valuation",
    title,
    body,
    tone: "neutral",
    source: "Quote feed P/E (price ÷ trailing 12-month EPS); peers as named in the company record",
    asOf: input.quoteAsOf !== null && Number.isFinite(input.quoteAsOf) ? easternDay(input.quoteAsOf) : null,
    score: clampScore(30 + Math.min(35, Math.abs(premium) / 3)),
  };
}

/* ── earnings date ────────────────────────────────────────────────────── */

const EARNINGS_HORIZON_DAYS = 45;

function earningsInsight(e: EarningsDate | null, now: number): StockInsight | null {
  if (!e) return null;
  const day = isoDay(e.date);
  const source = e.source.trim();
  if (!day || !source) return null;
  const today = easternDay(now);
  const days = dayNumber(day) - dayNumber(today);
  if (days < 0 || days > EARNINGS_HORIZON_DAYS) return null;

  const timing =
    e.timing === "before-open" ? ", before the open" : e.timing === "after-close" ? ", after the close" : "";
  return {
    id: "earnings",
    title: `Next earnings report: ${dateLabel(day)}`,
    body: `Scheduled for ${dateLabel(day)}${timing}, per ${source}.`,
    tone: "neutral",
    source: `Earnings calendar: ${source}`,
    asOf: today,
    score: days <= 7 ? 92 : days <= 14 ? 80 : days <= 30 ? 60 : 35,
  };
}

/* ── analyst consensus ────────────────────────────────────────────────── */

function analystInsight(a: AnalystAvailability | null): StockInsight | null {
  /* Only an answered feed says anything. "Not entitled" is a fact about this
     account and belongs to the Performance tab's analyst panel, not here. */
  if (!a || a.state !== "available") return null;
  const c = a.consensus;
  const r = c.ratings;

  const counted =
    r.buy !== null && r.hold !== null && r.sell !== null && r.total !== null && r.total > 0;
  /* A target in another currency cannot be set against a dollar price, so
     it is withheld rather than compared (see AnalystTarget.currency). */
  const target = c.target.consensus;
  const upside = c.upsidePct;
  const priced =
    target !== null &&
    upside !== null &&
    Number.isFinite(upside) &&
    (c.target.currency === null || c.target.currency === "USD");
  if (!counted && !priced) return null;

  const parts: string[] = [];
  if (counted) {
    parts.push(
      `Of ${r.total} analysts in the consensus, ${r.buy} rate it positively, ${r.hold} neutrally and ${r.sell} negatively.`,
    );
  }
  if (priced) {
    const range =
      c.target.low !== null && c.target.high !== null
        ? ` (range ${usd(c.target.low)} to ${usd(c.target.high)})`
        : "";
    parts.push(`The consensus price target is ${usd(target)}${range}.`);
  }

  return {
    id: "analyst",
    title: priced
      ? `Consensus target ${absPct(upside)} ${upside >= 0 ? "above" : "below"} the price`
      : `${r.buy} of ${r.total} analysts rate it positively`,
    body: parts.join(" "),
    tone: "neutral",
    source: "Analyst consensus feed (the feed states no date)",
    asOf: null,
    score: clampScore(40 + (priced ? Math.min(30, Math.abs(upside) / 1.5) : 0)),
  };
}

/* ── short interest ───────────────────────────────────────────────────── */

/* Filings settle twice a month and publish about a week later, so the newest
   is normally ten to twenty-five days old. Past six weeks it is not the
   current position. Every record on file on 24 Sep 2026 settled on
   29 Dec 2017: the client reads the FIRST row of an ascending list. */
const SHORT_MAX_AGE_DAYS = 45;

function shortInsight(input: InsightInput, reference: string): StockInsight | null {
  const s = input.shortInterest;
  if (!s) return null;
  const si = positive(s.shortInterest);
  const day = isoDay(s.settlementDate);
  if (si === null || !day) return null;
  const age = dayNumber(reference) - dayNumber(day);
  if (age < -3 || age > SHORT_MAX_AGE_DAYS) return null;

  const outstanding = positive(input.sharesOutstanding);
  const share = outstanding === null ? null : (si / outstanding) * 100;
  const cover = positive(s.daysToCover);

  const title =
    cover !== null && cover >= 5
      ? `${cover.toFixed(1)} days to cover short interest`
      : share !== null
        ? `Short interest at ${share.toFixed(1)}% of shares outstanding`
        : `${shareCount(si)} shares sold short`;

  const body =
    `${shareCount(si)} shares were sold short at the ${dateLabel(day)} settlement` +
    (share !== null && outstanding !== null
      ? `, ${share.toFixed(1)}% of the ${shareCount(outstanding)} shares outstanding`
      : "") +
    (cover !== null ? `; covering them would take ${cover.toFixed(1)} days of average volume` : "") +
    ". Short interest is reported twice a month, on a lag.";

  const heavy = (cover ?? 0) >= 8 || (share ?? 0) >= 15;
  const notable = (cover ?? 0) >= 5 || (share ?? 0) >= 10;
  return {
    id: "short-interest",
    title,
    body,
    tone: "neutral",
    source: "Exchange short-interest filing",
    asOf: day,
    score: heavy ? 70 : notable ? 55 : 18,
  };
}

/* ── volume ───────────────────────────────────────────────────────────── */

/* The same guard as the Technicals tab (derive-technicals.ts): a baseline
   whose mean is four times its median is mostly fragments of one venue's
   tape, and a multiple of it measures the feed, not the market. */
const MAX_BASELINE_SKEW = 4;
const VOLUME_WINDOW = 30;

type Turnover = { at: number; volume: number };

function turnoverOf(bars: readonly Bar[]): Turnover[] {
  const out: Turnover[] = [];
  for (const b of bars) {
    if (b.volume === null || !Number.isFinite(b.volume) || b.volume < 0) continue;
    out.push({ at: b.at, volume: b.volume });
  }
  return out;
}

/** The thirty sessions before `at`, or null when there are not thirty or
    they do not describe an ordinary session. */
function baselineBefore(turnover: readonly Turnover[], at: number): number[] | null {
  const k = turnover.findIndex((t) => t.at === at);
  if (k < VOLUME_WINDOW) return null;
  const window = turnover.slice(k - VOLUME_WINDOW, k).map((t) => t.volume);
  const mid = median(window);
  const mean = window.reduce((a, b) => a + b, 0) / window.length;
  if (!(mid > 0) || mean / mid > MAX_BASELINE_SKEW) return null;
  return window;
}

/* The quarterly expiry: index rebalancing and the expiry put a market-wide
   spike in every stock's volume. It is the third Friday of March, June,
   September or December, or the last trading day before it when that Friday
   is a holiday. Juneteenth is that Friday twice in this calendar: 19 Jun 2026
   (OCC moved the June 2026 expiration to Thu 18 Jun; SPY traded 80.9M that
   day against 50-67M around it) and 18 Jun 2027, so a Friday-only test never
   fired in either quarter. */
export function quarterlyExpiry(day: string): boolean {
  const [y, m] = day.split("-").map(Number);
  if (!Number.isInteger(y) || !Number.isInteger(m) || m % 3 !== 0) return false;
  // The first of the month's weekday decides the third Friday: the 15th-21st.
  const firstWeekday = new Date(Date.UTC(y, m - 1, 1)).getUTCDay();
  let date = new Date(Date.UTC(y, m - 1, 15 + ((5 - firstWeekday + 7) % 7)));
  // A holiday week can only push it back a day or two; a week is ample.
  for (let back = 0; back < 7 && tradingDay(isoDate(date)) === null; back += 1) {
    date = new Date(date.getTime() - DAY_MS);
  }
  return isoDate(date) === day && tradingDay(day) !== null;
}

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/* "Friday" almost always, but a holiday expiry is a Thursday, and calling
   18 Jun 2026 a Friday would be a false statement. */
function weekdayOf(day: string): string {
  const [y, m, d] = day.split("-").map(Number);
  return WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
}

function volumeInsight(bars: Bar[], market: Leg | null): StockInsight | null {
  if (bars.length < VOLUME_WINDOW + 2) return null;
  const turnover = turnoverOf(bars);
  const multiples = relativeVolume(bars, VOLUME_WINDOW);
  const last = bars[bars.length - 1];
  const byAt = new Map(multiples.map((p) => [p.at, p.value]));

  // An incoherent feed today makes every reading suspect, not just today's.
  if (!byAt.has(last.at) || baselineBefore(turnover, last.at) === null) return null;

  const index = new Map(bars.map((b, i) => [b.at, i]));
  const lastMultiple = byAt.get(last.at) as number;
  let pick: Bar | null = null;
  if (lastMultiple >= 1.5 || lastMultiple <= 0.5) {
    pick = last;
  } else {
    for (let i = bars.length - 2; i >= Math.max(1, bars.length - 5); i -= 1) {
      const m = byAt.get(bars[i].at);
      if (m !== undefined && m >= 2) {
        pick = bars[i];
        break;
      }
    }
  }
  if (pick === null) return null;

  const window = baselineBefore(turnover, pick.at);
  const multiple = byAt.get(pick.at);
  const i = index.get(pick.at) ?? 0;
  if (window === null || multiple === undefined || pick.volume === null || i < 1) return null;
  const baseline = window.reduce((a, b) => a + b, 0) / window.length;

  const move = (pick.price / bars[i - 1].price - 1) * 100;
  const moved =
    absPct(move) === "0.0%"
      ? "with the price unchanged"
      : `as the price ${move > 0 ? "rose" : "fell"} ${absPct(move)}`;

  const expiry = quarterlyExpiry(pick.day);
  let context = "";
  let marketMultiple: number | null = null;
  if (market) {
    const mb = market.bars;
    const same = mb.find((b) => b.day === pick.day);
    if (same && baselineBefore(turnoverOf(mb), same.at) !== null) {
      marketMultiple = relativeVolume(mb, VOLUME_WINDOW).find((p) => p.at === same.at)?.value ?? null;
    }
    if (marketMultiple !== null) {
      context = ` ${market.symbol} traded ${times(marketMultiple)} its own average that session${expiry ? `, a quarterly options-expiry ${weekdayOf(pick.day)}` : ""}.`;
    }
  }
  if (context === "" && expiry) context = ` It was a quarterly options-expiry ${weekdayOf(pick.day)}.`;

  /* Ranked on the stock's OWN share of the spike. On 18 Sep 2026, a
     quarterly expiry, SPY traded 1.7× its average and so did half the
     market: AAPL's 2.1× that day is mostly the market's, NFLX's 4.2× is
     mostly its own. The sentence prints both multiples either way. */
  const own =
    marketMultiple !== null && marketMultiple > 1 ? multiple / marketMultiple : multiple;
  let score =
    multiple <= 0.5 ? 25 : own >= 3 ? 75 : own >= 2 ? 60 : own >= 1.5 ? 45 : 20;
  if (pick !== last) score -= 10;
  if (expiry) score -= 5;

  return {
    id: "volume",
    title:
      multiple >= 1
        ? `Volume ${times(multiple)} its 30-session average on ${dateLabel(pick.day)}`
        : `Light volume: ${times(multiple)} its 30-session average on ${dateLabel(pick.day)}`,
    body: `${dateLabel(pick.day)} volume of ${shareCount(pick.volume)} shares was ${times(multiple)} the average of the 30 sessions before it (${shareCount(baseline)}), ${moved}.${context}`,
    tone: "neutral",
    source: "Daily volume against a 30-session baseline",
    asOf: pick.day,
    score: clampScore(Math.max(10, score)),
  };
}

/* ── an outsized last session ─────────────────────────────────────────── */

const YEAR_SESSIONS = 252;

function bigMoveInsight(bars: Bar[]): StockInsight | null {
  if (bars.length < 62) return null;
  const rets: number[] = [];
  for (let i = 1; i < bars.length; i += 1) rets.push((bars[i].price / bars[i - 1].price - 1) * 100);

  const last = rets[rets.length - 1];
  const prior = rets.slice(Math.max(0, rets.length - 1 - YEAR_SESSIONS), -1);
  if (prior.length < 60) return null;
  const mean = prior.reduce((a, b) => a + b, 0) / prior.length;
  const sd = Math.sqrt(prior.reduce((a, b) => a + (b - mean) ** 2, 0) / prior.length);
  const typical = prior.reduce((a, b) => a + Math.abs(b), 0) / prior.length;
  if (!(sd > 0) || !(typical > 0)) return null;
  if (Math.abs(last) < 2 || Math.abs(last) < 2.5 * sd) return null;

  const day = bars[bars.length - 1].day;
  const kind = last < 0 ? "decline" : "gain";
  let since: string | null = null;
  for (let j = rets.length - 2; j >= 0; j -= 1) {
    if (Math.sign(rets[j]) === Math.sign(last) && Math.abs(rets[j]) >= Math.abs(last)) {
      since = bars[j + 1].day;
      break;
    }
  }
  const span = prior.length >= YEAR_SESSIONS - 2 ? "over the past year" : `over the prior ${prior.length} sessions`;
  const record =
    since === null
      ? `its largest one-day ${kind} in a record that begins ${dateLabel(bars[0].day)}`
      : `its largest one-day ${kind} since ${dateLabel(since)}`;

  return {
    id: "big-move",
    title: `${last < 0 ? "Fell" : "Rose"} ${absPct(last)} on ${dateLabel(day)}`,
    body: `The ${dateLabel(day)} ${kind} of ${absPct(last)} was ${times(Math.abs(last) / typical)} its average daily move of ${typical.toFixed(1)}% ${span}, and ${record}.`,
    tone: last < 0 ? "down" : "up",
    source: "Daily closes, split-adjusted",
    asOf: day,
    score: clampScore(60 + Math.min(30, (Math.abs(last) / sd - 2.5) * 10)),
  };
}

/* ── RSI at an extreme ────────────────────────────────────────────────── */

function momentumInsight(bars: Bar[]): StockInsight | null {
  /* Computed from the bars, as the Technicals tab computes it, so the two
     tabs cannot print different RSIs. The old insight read the gateway's,
     which on the gateway path is measured off unrepaired closes. */
  const series = rsi(bars, 14);
  if (series.length === 0) return null;
  const latest = series[series.length - 1];
  const last = bars[bars.length - 1];
  if (latest.at !== last.at) return null;
  // Strictly beyond the line: an ordinary reading is not an insight.
  if (latest.value <= 70 && latest.value >= 30) return null;

  const high = latest.value > 70;
  let run = 0;
  for (let i = series.length - 1; i >= 0 && (high ? series[i].value > 70 : series[i].value < 30); i -= 1) run += 1;
  const line = high ? "above 70" : "below 30";

  return {
    id: "momentum",
    title: `RSI(14) at ${latest.value.toFixed(1)}, ${line}`,
    body: `The 14-session relative strength index closed at ${latest.value.toFixed(1)} on ${dateLabel(last.day)}, its ${ordinal(run)} session ${line}. By convention a reading ${high ? "above 70 is called overbought and below 30 oversold" : "below 30 is called oversold and above 70 overbought"}.`,
    tone: "neutral",
    source: "Daily closes, split-adjusted; Wilder's 14-session RSI",
    asOf: last.day,
    score: clampScore(30 + Math.min(25, (Math.abs(latest.value - 50) - 20) * 1.5)),
  };
}

/* ── the next ex-dividend date ────────────────────────────────────────── */

const DIVIDEND_HORIZON_DAYS = 45;

function dividendInsight(input: InsightInput): StockInsight | null {
  const today = easternDay(input.now);
  const rows = input.dividends
    .map((d) => ({ day: isoDay(d.exDate), amount: d.amount, pay: isoDay(d.payDate) }))
    .filter((d): d is { day: string; amount: number; pay: string | null } =>
      d.day !== null && Number.isFinite(d.amount) && d.amount > 0,
    )
    .sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0));

  const k = rows.findIndex((d) => d.day >= today);
  if (k < 0) return null;
  const next = rows[k];
  const days = dayNumber(next.day) - dayNumber(today);
  if (days > DIVIDEND_HORIZON_DAYS) return null;

  const prev = k > 0 ? rows[k - 1] : null;
  const change = prev === null ? null : (next.amount / prev.amount - 1) * 100;
  const versus =
    prev === null || change === null
      ? ""
      : Math.abs(change) < 0.5
        ? `; unchanged from the previous payment (ex-date ${dateLabel(prev.day)})`
        : `; ${change > 0 ? "up" : "down"} ${absPct(change)} from the previous ${cash(prev.amount)} (ex-date ${dateLabel(prev.day)})`;

  return {
    id: "dividend",
    title: `Next ex-dividend date: ${dateLabel(next.day)}`,
    body: `${cash(next.amount)} a share${next.pay ? `, payable ${dateLabel(next.pay)}` : ""}${versus}.`,
    tone: "neutral",
    source: "Corporate actions record",
    asOf: today,
    score: (days <= 14 ? 40 : 25) + (change !== null && Math.abs(change) >= 0.5 ? 10 : 0),
  };
}

/* ── ranking ──────────────────────────────────────────────────────────── */

/* Tie-break only: a scheduled event first, then the price's own position,
   then comparisons, then the slower-moving records. */
const PRIORITY: readonly InsightId[] = [
  "earnings",
  "range",
  "relative",
  "trend",
  "big-move",
  "volume",
  "valuation",
  "analyst",
  "short-interest",
  "dividend",
  "momentum",
];

/** Every insight the data supports, most relevant first. */
export function insightCandidates(input: InsightInput): StockInsight[] {
  const dayOf = dayCache();
  const bars = barsOf(input.daily, dayOf);
  const measured = input.splitsKnown && bars.length > 0;
  const legs = measured ? legsFor(input, dayOf) : { market: null, sector: null };
  const reference = bars.length > 0 ? bars[bars.length - 1].day : easternDay(input.now);

  const all: Array<StockInsight | null> = [
    earningsInsight(input.earnings, input.now),
    measured ? rangeInsight(bars) : null,
    measured ? relativeInsight(input.ticker, bars, legs.market, legs.sector) : null,
    measured ? trendInsight(bars) : null,
    measured ? bigMoveInsight(bars) : null,
    measured ? volumeInsight(bars, legs.market) : null,
    valuationInsight(input),
    analystInsight(input.analyst),
    shortInsight(input, reference),
    dividendInsight(input),
    measured ? momentumInsight(bars) : null,
  ];

  return all
    .filter((i): i is StockInsight => i !== null)
    .sort((a, b) => b.score - a.score || PRIORITY.indexOf(a.id) - PRIORITY.indexOf(b.id));
}

/* Below this a candidate is true but says too little to take a slot — a
   volume spike the whole market shared, four sessions ago. Fewer than five
   insights is a better page than a fifth that is filler. */
export const MIN_INSIGHT_SCORE = 15;

/** The insights the Overview tab shows: the top `limit` candidates worth a slot. */
export function stockInsights(
  input: InsightInput,
  opts: { limit?: number } = {},
): StockInsight[] {
  const limit = Math.max(0, Math.floor(opts.limit ?? INSIGHT_LIMIT));
  return insightCandidates(input)
    .filter((i) => i.score >= MIN_INSIGHT_SCORE)
    .slice(0, limit);
}

/* ── wiring helpers ───────────────────────────────────────────────────── */

/** "as of 23 Sep 2026" for an insight's `asOf`, or null. Locale-free, so the
    panel can render it on the server and the browser alike. */
export function asOfLabel(day: string | null | undefined): string | null {
  const iso = isoDay(day);
  return iso === null ? null : `as of ${dateLabel(iso)}`;
}

/** The SPDR sector fund for a page's sector name, or null. */
export function sectorFundFor(sector: string | null | undefined): string | null {
  if (!sector) return null;
  return (SECTOR_ETF as Record<string, string | undefined>)[sector as SectorName] ?? null;
}

/**
 * The input, read off an assembled snapshot. Call it with the FULL snapshot
 * (five years of bars and the SPY series), before shippedWithPage() trims it.
 */
export function insightInputFrom(
  s: InstrumentSnapshot,
  extra: { now: number; sector?: Benchmark | null; earnings?: EarningsDate | null },
): InsightInput {
  return {
    ticker: s.profile.id,
    daily: s.history.daily,
    // `!== false` so a snapshot built before the field existed is not silenced.
    splitsKnown: s.splitsKnown !== false,
    market: s.market && s.market.daily.length > 0 ? { symbol: s.market.symbol, daily: s.market.daily } : null,
    sector: extra.sector ?? null,
    pe: s.profile.pe,
    evToEbitda: s.profile.evToEbitda,
    /* PeerQuote carries no EV/EBITDA today; read it if it ever does, so the
       peer comparison gains its second multiple without touching this. */
    peers: s.peers.map((p) => ({
      id: p.id,
      name: p.name,
      pe: p.pe,
      evToEbitda: (p as { evToEbitda?: number | null }).evToEbitda ?? null,
    })),
    sharesOutstanding: s.profile.sharesOutstanding,
    shortInterest: s.shortInterest,
    analyst: s.analyst,
    earnings: extra.earnings ?? null,
    dividends: s.dividends,
    quoteAsOf: s.profile.asOf,
    now: extra.now,
  };
}
