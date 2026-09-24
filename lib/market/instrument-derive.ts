/* Explicit .ts extensions, matching lib/api/: Turbopack resolves without them
   but node --test does not, and this module had no tests at all because it
   could not be imported outside the bundler. */
import { C, PEER_COLORS, trend } from "../tokens.ts";
import { marketCap as capOf, money, pct, ratio, usd } from "./format.ts";
import { regularCloseMinute, tradingDay } from "./session.ts";
import { easternDay, shiftYears, sinceLabel } from "../api/normalize/returns.ts";
import type { PricePoint } from "../api/normalize/series.ts";
/* Type-only: profile.ts imports the 2.4MB symbol master, and this module is
   read by client panels. Nothing at runtime may come from it here. */
import type { CompanyProfile } from "../api/normalize/profile.ts";
import type { InstrumentSnapshot } from "./instrument.ts";

/* The instrument page's readings, derived from what the feed actually says.

   This replaces a module that computed nearly all of it from a seed: RSI was
   `38 + seed % 34`, the fifty-day average was `price × 0.96`, the analyst
   split was `analysts × 0.62`, and the one-year return was `chg × 11`. Every
   one of those looked entirely reasonable on the page.

   The return shapes are unchanged, so the panels render exactly as they did.
   What changed is where the numbers come from, and that anything the feed
   cannot answer now arrives as a dash instead of a plausible invention. */

const DASH = "—";

const asUsd = (n: number | null) => (n === null ? DASH : usd(n));
const asNum = (n: number | null, digits = 2) => (n === null ? DASH : n.toFixed(digits));

/** Shares, abbreviated the way a statistics grid has room for. */
function shares(n: number | null): string {
  if (n === null || n <= 0) return DASH;
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  return Math.round(n).toLocaleString("en-US");
}

/* ── Which session the day's figures belong to ──────────────────────────
 *
 * Measured on the quotes feed, Thu 24 Sep 2026 at 06:00 ET, pre-market, over
 * 22 liquid names and 50 quiet ones:
 *
 *   - The feed ROLLS OVER at 04:00 ET. Quiet names were stamped 04:00:00-04:10
 *     with openingPrice, dayHigh, dayLow and volume all 0; yesterdayClose had
 *     become Wednesday's official close (AAPL 337.02, MSFT 500.59).
 *   - From then until the bell, "openingPrice" is the first PRE-MARKET trade
 *     (AAPL 335.26), and dayHigh/dayLow are the pre-market range padded with
 *     yesterday's close: dayHigh === yesterdayClose on 11 of the 22 (AAPL,
 *     NVDA, MSFT, META, AMZN, AVGO, AMD, ORCL, PLTR, SPY, QQQ).
 *   - The feed runs about twenty minutes behind (updateTime 05:40 at 06:00),
 *     so a quote read at 09:35 still describes 09:15.
 *
 * So none of those three is a Day's anything until the quote's OWN stamp has
 * passed 09:30. Before the rollover — the evening, the small hours, a weekend,
 * a holiday — the feed still carries the last session's figures, and those
 * stand.
 *
 * The rule is applied to two instants, the quote's stamp and the reader's
 * clock, and the card shows the figures only when both land on the same
 * session. That one comparison covers a page cached at 15:00 and read at 06:00
 * the next morning (yesterday's figures, today's pre-market: dashes), and one
 * rendered at 09:10 and read at 10:00 (pre-market figures: dashes until the
 * page is rebuilt with real ones).
 * ───────────────────────────────────────────────────────────────────────── */

/** The feed's rollover, 04:00 ET, in seconds into the Eastern day. */
const ROLLOVER_S = 4 * 3600;
/** The bell, 09:30 ET. */
const OPEN_S = 9 * 3600 + 30 * 60;

const ET_CLOCK = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

function easternSeconds(ms: number): number {
  const parts = ET_CLOCK.formatToParts(ms);
  const n = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((p) => p.type === type)?.value ?? "0");
  return n("hour") * 3600 + n("minute") * 60 + n("second");
}

/* Noon UTC is the same calendar date in New York in either offset, which is all
   these two need of an instant. */
const midday = (day: string): number => Date.parse(`${day}T16:00:00Z`);

/* The one calendar (tradingDay in session.ts): weekends and listed holidays. */
const isTradingDay = (day: string): boolean => tradingDay(day) !== null;

function tradingDayBefore(day: string): string {
  let t = midday(day);
  // Ten days clears the longest closure on the calendar with room to spare.
  for (let i = 0; i < 10; i += 1) {
    t -= 86_400_000;
    const candidate = new Date(t).toISOString().slice(0, 10);
    if (isTradingDay(candidate)) return candidate;
  }
  return new Date(t).toISOString().slice(0, 10);
}

/**
 * The regular session ("yyyy-mm-dd", Eastern) whose open, high and low a quote
 * stamped at `atMs` is reporting — or null between the feed's 04:00 rollover
 * and the bell, when what it reports is pre-market.
 *
 * The same function answers "which session should the card be showing" for
 * the reader's clock, which is why it is written once.
 */
export function figuresSession(atMs: number): string | null {
  const day = easternDay(atMs);
  const s = easternSeconds(atMs);
  if (!isTradingDay(day) || s < ROLLOVER_S) return tradingDayBefore(day);
  return s < OPEN_S ? null : day;
}

/**
 * Whether a quote stamped `asOf` carries the Day's figures a reader at `nowMs`
 * should see. False all through a trading day's pre-market, whatever the quote.
 * A quote with no stamp cannot be placed, and is given the benefit of the doubt
 * only outside that window.
 */
export function dayFiguresCurrent(asOf: number | null, nowMs: number): boolean {
  const expected = figuresSession(nowMs);
  if (expected === null) return false;
  return asOf === null || figuresSession(asOf) === expected;
}

/**
 * The trading day an instant belongs to if it falls inside that day's regular
 * session — 09:30 to the close, the closing print included, 13:00 on a
 * half-day — and null for anything pre-market, post-market or on a closed day.
 * A tick that passes this is a price the Day's and 52-week figures may take in.
 */
export function regularSessionDay(atMs: number): string | null {
  if (!Number.isFinite(atMs)) return null;
  const day = easternDay(atMs);
  if (!isTradingDay(day)) return null;
  const s = easternSeconds(atMs);
  return s >= OPEN_S && s <= regularCloseMinute(day) * 60 ? day : null;
}

/* ── The 52-week range ────────────────────────────────────────────────────
 *
 * Measured 24 Sep 2026 against Polygon's daily bars, 22 of 22 names: the
 * feed's high52week/low52week are the extreme intraday HIGH and LOW from 24 Sep
 * 2025 through 22 Sep 2026. The window opens on today's date a year ago, and it
 * CLOSES A SESSION EARLY — the one that finished yesterday is not in it, and
 * neither is today. META traded 763.90 on the 23rd against a feed high of
 * 761.11; AMD 624.69 against 624.52. A stock at a new high reads as sitting
 * above its own 52-week high.
 *
 * So the range is the feed's, widened by the official daily bars inside the
 * same window (history.daily, which does carry the last completed session) and
 * by today's high and low once they are the regular session's.
 * ───────────────────────────────────────────────────────────────────────── */

/* A wick more than half again beyond its close is not taken at its word; the
   bar counts at its close instead. mergeOfficial already refuses the gross bad
   prints, and repairSplitBreaks now restates a missed split's whole bar, but a
   bar kept from the gateway alone is not checked against anything, and one
   wrong wick would stand as the 52-week high for a year. Half again beyond the
   close is well clear of any real session on a listed name. */
const WICK_LIMIT = 1.5;

const barHigh = (p: PricePoint): number =>
  p.high !== null && p.high >= p.price && p.high <= p.price * WICK_LIMIT ? p.high : p.price;
const barLow = (p: PricePoint): number =>
  p.low !== null && p.low > 0 && p.low <= p.price && p.low * WICK_LIMIT >= p.price ? p.low : p.price;

const higher = (a: number | null, b: number | null) => (a === null ? b : b === null ? a : Math.max(a, b));
const lower = (a: number | null, b: number | null) => (a === null ? b : b === null ? a : Math.min(a, b));

function yearRangeOf(
  p: CompanyProfile,
  daily: readonly PricePoint[],
  nowMs: number,
  dayHigh: number | null,
  dayLow: number | null,
): { high52: number | null; low52: number | null } {
  let high52 = higher(p.high52, dayHigh);
  let low52 = lower(p.low52, dayLow);
  const from = shiftYears(easternDay(nowMs), -1);
  // Ascending, so the walk back stops at the first bar outside the year.
  for (let i = daily.length - 1; i >= 0; i -= 1) {
    const bar = daily[i];
    if (easternDay(bar.at) < from) break;
    high52 = higher(high52, barHigh(bar));
    low52 = lower(low52, barLow(bar));
  }
  return { high52, low52 };
}

/* ── The market cap ───────────────────────────────────────────────────────
 *
 * Neither feed moves its cap with the price: both are struck at the previous
 * close (see capBasis in lib/api/normalize/profile.ts for the measurement), so
 * the header could read $335.67 while the grid valued the company at $337.02.
 * The cap is scaled by the price on the page over the price it was struck at.
 * ───────────────────────────────────────────────────────────────────────── */

/** `cap`, re-struck at `price` from the `basis` it was struck at. No basis, no
    scaling: a guessed basis would move the figure by whatever the guess missed
    by. */
export function capAt(cap: number | null, basis: number | null, price: number | null): number | null {
  if (cap === null) return null;
  if (basis === null || price === null || !(basis > 0) || !(price > 0)) return cap;
  /* Exactly the cap at its own price: (cap × p) / p is not always bit-exact,
     and liveProfile's "nothing moved, same object" answer depends on it. */
  if (price === basis) return cap;
  return (cap * price) / basis;
}

/**
 * Where the price sits in its 52-week range, 0-100 and clamped — the same
 * reading toTechnicalRead (lib/api/normalize/technicals.ts) makes on the
 * server, restated so the client can re-strike it against a live price and a
 * live range. tests/stat-cards.test.ts holds the two to the same answers.
 */
export function yearPosition(
  price: number | null,
  low: number | null,
  high: number | null,
): number | null {
  if (price === null || low === null || high === null) return null;
  if (!Number.isFinite(price) || !Number.isFinite(low) || !Number.isFinite(high)) return null;
  if (high <= low) return null;
  return Math.min(100, Math.max(0, ((price - low) / (high - low)) * 100));
}

/**
 * The profile as the page should print it at `nowMs`, on the server.
 *
 * The Day's open, high and low are withheld unless they are the session the
 * clock expects; the 52-week range takes in the daily bars and today's
 * regular-session range; the cap is re-struck at the quote's price, and the
 * basis moves with it so the client can re-strike it again from there.
 */
export function settleProfile(
  p: CompanyProfile,
  daily: readonly PricePoint[],
  nowMs: number,
): CompanyProfile {
  const current = dayFiguresCurrent(p.asOf, nowMs);
  const open = current ? p.open : null;
  const dayHigh = current ? p.dayHigh : null;
  const dayLow = current ? p.dayLow : null;
  const { high52, low52 } = yearRangeOf(p, daily, nowMs, dayHigh, dayLow);
  const marketCap = capAt(p.marketCap, p.capBasis, p.price);
  const capBasis = marketCap !== null && p.capBasis !== null && p.price !== null ? p.price : p.capBasis;
  return { ...p, open, dayHigh, dayLow, high52, low52, marketCap, capBasis };
}

/** The regular-session extremes the live feed has shown for one symbol. */
export type SessionRange = { day: string; high: number; low: number };

export type LiveReading = {
  /** The price the header is showing, and the change and basis beside it. */
  price: number | null;
  chg: number | null;
  previousClose: number | null;
  /** Regular-session ticks seen since the page loaded, or null. */
  range: SessionRange | null;
  /** The reader's clock — null until hydration, so the first client render
      matches the server's. */
  nowMs: number | null;
};

/**
 * The settled profile, carried forward on the reader's clock and the live feed.
 *
 * Returns the SAME object when nothing changes, so a memo keyed on it holds.
 * Never fills a figure the server withheld: a pre-market render read after the
 * bell has no true open or high to show, and ticks seen since the page loaded
 * are not the session's range. They only ever WIDEN figures that are already
 * the session's.
 */
export function liveProfile(p: CompanyProfile, live: LiveReading): CompanyProfile {
  let { open, dayHigh, dayLow, high52, low52 } = p;

  if (live.nowMs !== null && !dayFiguresCurrent(p.asOf, live.nowMs)) {
    open = null;
    dayHigh = null;
    dayLow = null;
  }

  const r = live.range;
  if (r !== null) {
    const session = p.asOf !== null ? figuresSession(p.asOf) : live.nowMs !== null ? figuresSession(live.nowMs) : null;
    if (session !== null && r.day === session) {
      if (dayHigh !== null && r.high > dayHigh) dayHigh = r.high;
      if (dayLow !== null && r.low < dayLow) dayLow = r.low;
    }
    // Any regular-session print inside the year belongs to its range.
    if (live.nowMs === null || r.day >= shiftYears(easternDay(live.nowMs), -1)) {
      if (high52 !== null && r.high > high52) high52 = r.high;
      if (low52 !== null && r.low < low52) low52 = r.low;
    }
  }

  const price = live.price ?? p.price;
  const chg = live.price === null ? p.chg : live.chg;
  const previousClose = live.previousClose ?? p.previousClose;
  const marketCap = capAt(p.marketCap, p.capBasis, price);

  if (
    price === p.price &&
    chg === p.chg &&
    previousClose === p.previousClose &&
    open === p.open &&
    dayHigh === p.dayHigh &&
    dayLow === p.dayLow &&
    high52 === p.high52 &&
    low52 === p.low52 &&
    marketCap === p.marketCap
  ) {
    return p;
  }
  return {
    ...p,
    price,
    chg,
    previousClose,
    open,
    dayHigh,
    dayLow,
    high52,
    low52,
    marketCap,
    capBasis: marketCap === p.marketCap ? p.capBasis : price,
  };
}

/** The five figures in the bordered strip under the chart. */
export function dayStats(s: InstrumentSnapshot) {
  const p = s.profile;
  return [
    { label: "Day's open", value: asUsd(p.open) },
    { label: "Previous close", value: asUsd(p.previousClose) },
    { label: "Volume", value: p.volume === null ? DASH : shares(p.volume) },
    { label: "Day's high", value: asUsd(p.dayHigh) },
    { label: "Day's low", value: asUsd(p.dayLow) },
  ];
}

const INSIGHT_TONE = { up: C.up, note: C.gold, warn: C.down } as const;
type Kind = keyof typeof INSIGHT_TONE;

/* Observations, not opinions.

   The authored version carried three sentences of analysis per company. These
   are statements about figures on this page and nothing else — where the price
   sits in its year, what the momentum indicator reads, and how recent coverage
   has leaned. Anything that cannot be traced to a number is simply not said. */
export function insights(s: InstrumentSnapshot) {
  const out: Array<{ kind: Kind; title: string; body: string }> = [];
  const { profile, technical, news, returns } = s;

  if (technical.rangePosition !== null && profile.high52 !== null && profile.low52 !== null) {
    const at = technical.rangePosition;
    out.push({
      kind: at >= 80 ? "up" : at <= 20 ? "warn" : "note",
      title:
        at >= 80
          ? "Near its twelve-month high"
          : at <= 20
            ? "Near its twelve-month low"
            : "Mid-range for the year",
      body: `The last price sits ${at.toFixed(0)}% of the way between ${usd(profile.low52)} and ${usd(profile.high52)}, the lowest and highest it has traded in a year.`,
    });
  }

  if (technical.rsiState !== null && technical.rsi.latest !== null) {
    out.push({
      kind: technical.rsiState === "overbought" ? "warn" : technical.rsiState === "oversold" ? "up" : "note",
      title:
        technical.rsiState === "overbought"
          ? "Momentum reads stretched"
          : technical.rsiState === "oversold"
            ? "Momentum reads washed out"
            : "Momentum is unremarkable",
      body: `The fourteen-day relative strength index is ${technical.rsi.latest.toFixed(1)}. Above seventy is conventionally read as overbought and below thirty as oversold.`,
    });
  }

  const scored = news.filter((n) => n.sentiment !== null);
  if (scored.length >= 3) {
    const positive = scored.filter((n) => n.sentiment === "positive").length;
    const negative = scored.filter((n) => n.sentiment === "negative").length;
    out.push({
      kind: positive > negative ? "up" : negative > positive ? "warn" : "note",
      title: "Recent coverage",
      body: `Of ${scored.length} recent stories carrying a tone, ${positive} read positive and ${negative} negative. The tone is the publisher's, not ours.`,
    });
  }

  if (out.length < 3 && returns.ret1y !== null) {
    out.push({
      kind: returns.ret1y >= 0 ? "up" : "warn",
      title: "Over the past year",
      /* "Price", not "Total": this is the change in price, and dividends are
         not reinvested into it. Calling it a total return overstates it for
         every dividend payer, by the yield. */
      body: `Price return of ${pct(returns.ret1y, 1)}, measured to the last completed session and adjusted for splits (dividends excluded).`,
    });
  }

  return out.slice(0, 3).map((i, index) => ({
    ...i,
    num: `0${index + 1}`,
    color: INSIGHT_TONE[i.kind],
  }));
}

/** Percent change across the last `sessions` trading days of the series. */
function over(points: PricePoint[], sessions: number): number | null {
  if (points.length < sessions + 1) return null;
  const last = points[points.length - 1].price;
  const prev = points[points.length - 1 - sessions].price;
  return prev > 0 ? (last / prev - 1) * 100 : null;
}

export function returns(s: InstrumentSnapshot) {
  const pts = s.history.daily;
  const rows: Array<[string, number | null]> = [
    /* Withheld with the split record, the same way 1Y and 5Y already are
       (returnsAgainst). Without it the bars are unrepaired, and a split inside
       the window reads as a crash or a leap — a 10-for-1 prints as -90%. The
       year figures below were already dashes in that case; these two went on
       printing confident numbers beside them. `!== false` so a snapshot built
       before the field existed keeps its figures. */
    ["1 month", s.splitsKnown !== false ? over(pts, 21) : null],
    ["6 months", s.splitsKnown !== false ? over(pts, 126) : null],
    /* Named by the first close when the record opens after the anchor, as
       META's does (a renamed ticker Polygon cannot lead into): "5 years" over
       a base a session late printed +110.8% for a +115.1% five years. The
       Performance tab names its rows the same way off the same series. */
    [s.returns.since1y ? sinceLabel(s.returns.since1y) : "1 year", s.returns.ret1y],
    [s.returns.since5y ? sinceLabel(s.returns.since5y) : "5 years", s.returns.ret5y],
  ];

  return rows.map(([label, v]) => ({
    label,
    value: v === null ? DASH : `${v >= 0 ? "+" : "−"}${Math.abs(v).toFixed(1)}%`,
    color: v === null ? C.ink4 : trend(v >= 0),
    width: v === null ? "0%" : `${Math.min(100, Math.abs(v) * 1.6 + 8)}%`,
  }));
}

export function ratios(s: InstrumentSnapshot) {
  const p = s.profile;
  const latest = s.financials.annual.at(-1);
  return [
    { label: "Market cap", value: capOf(p.marketCap) },
    { label: "P/E ratio", value: ratio(p.pe) },
    { label: "EPS (TTM)", value: p.eps === null ? DASH : usd(p.eps) },
    { label: "Dividend yield", value: p.dividendYield === null ? DASH : `${p.dividendYield.toFixed(2)}%` },
    { label: "Price / sales", value: ratio(p.priceToSales) },
    { label: "Price / book", value: ratio(p.priceToBook) },
    { label: "Return on equity", value: p.returnOnEquity === null ? DASH : `${(p.returnOnEquity * 100).toFixed(1)}%` },
    { label: "Profit margin", value: latest?.netMargin == null ? DASH : `${latest.netMargin.toFixed(1)}%` },
    { label: "Debt / equity", value: asNum(p.debtToEquity) },
    { label: "Beta (5Y)", value: asNum(p.beta) },
    { label: "Shares outstanding", value: shares(p.sharesOutstanding) },
    { label: "Average volume", value: shares(p.avgVolume) },
  ];
}

/** Revenue by fiscal year, in billions, for the bar chart. */
export function revenue(s: InstrumentSnapshot) {
  const years = s.financials.annual.filter((y) => y.revenue !== null);
  if (years.length === 0) return [];
  const billions = years.map((y) => (y.revenue as number) / 1e9);
  const max = Math.max(...billions);

  return years.map((y, i) => {
    const latest = i === years.length - 1;
    const v = billions[i];
    return {
      year: y.year,
      value: v >= 100 ? String(Math.round(v)) : v.toFixed(1),
      height: max > 0 ? `${((v / max) * 100).toFixed(1)}%` : "0%",
      /* The most recent fiscal year is the only bar that earns gold. */
      background: latest ? "linear-gradient(180deg, #E8CFA3, #8A6E43)" : C.rule,
      latest,
    };
  });
}

type Signal =
  | "BULLISH"
  | "BEARISH"
  | "NEUTRAL"
  | "ABOVE"
  | "BELOW"
  | "ELEVATED"
  | "MODERATE"
  | "STRETCHED"
  | "WASHED OUT"
  | "—";
/* STRETCHED and WASHED OUT exist because RSI has no bullish or bearish reading
   to give. This row used to map overbought to BULLISH and oversold to BEARISH,
   which is the convention backwards and, worse, the exact opposite of what
   insights() five hundred lines up tells the reader about the same number: it
   calls overbought "Momentum reads stretched" and tints it warn. One page, two
   tabs, one RSI, two contradictory verdicts. */
const NEGATIVE: Signal[] = ["BEARISH", "BELOW", "STRETCHED"];
const POSITIVE: Signal[] = ["BULLISH", "ABOVE", "WASHED OUT"];

export function technicals(s: InstrumentSnapshot) {
  const { technical: t, profile: p } = s;

  /* The meter reads against a midpoint: half-full is the price sitting exactly
     on its average, and the bar leans right above it and left below it.

     It used to take the ABSOLUTE gap — `50 + |gap| * 4` — so a price five per
     cent under its fifty-day average drew precisely the same seventy per cent
     bar as one five per cent over it. The bar could not express direction at
     all; only the word beside it could, and a reader scanning the column saw
     two identical bars saying opposite things. Signed, the glance and the word
     finally agree. */
  const against = (avg: number | null): { value: string; signal: Signal; fill: number } => {
    if (avg === null || p.price === null) return { value: DASH, signal: "—", fill: 0 };
    const above = p.price >= avg;
    const gap = (p.price / avg - 1) * 100;
    return {
      value: money(avg),
      signal: above ? "ABOVE" : "BELOW",
      fill: Math.max(4, Math.min(96, 50 + gap * 4)),
    };
  };

  const sma = against(t.sma.latest);
  const ema = against(t.ema.latest);

  const rows: Array<{ label: string; value: string; signal: Signal; fill: number }> = [
    {
      label: "RSI (14)",
      value: t.rsi.latest === null ? DASH : t.rsi.latest.toFixed(1),
      signal:
        t.rsiState === "overbought"
          ? "STRETCHED"
          : t.rsiState === "oversold"
            ? "WASHED OUT"
            : t.rsiState === null
              ? "—"
              : "NEUTRAL",
      fill: t.rsi.latest ?? 0,
    },
    { label: "SMA (50)", ...sma },
    { label: "EMA (20)", ...ema },
    {
      label: "52-week range",
      value: t.rangePosition === null ? DASH : `${t.rangePosition.toFixed(0)}%`,
      signal: t.rangePosition === null ? "—" : t.rangePosition >= 50 ? "ABOVE" : "BELOW",
      fill: t.rangePosition ?? 0,
    },
    {
      label: "Beta (5Y)",
      value: asNum(p.beta),
      signal: p.beta === null ? "—" : p.beta > 1.5 ? "ELEVATED" : "MODERATE",
      fill: p.beta === null ? 0 : Math.min(96, p.beta * 45),
    },
  ];

  /* Everything that is neither clearly good nor clearly bad reads gold — the
     palette has no neutral grey for signal. A row with nothing to say is dim. */
  return rows.map((r) => ({
    ...r,
    color:
      r.signal === "—"
        ? C.ink4
        : NEGATIVE.includes(r.signal)
          ? C.down
          : POSITIVE.includes(r.signal)
            ? C.up
            : C.gold,
    width: `${Math.max(6, Math.min(100, r.fill))}%`,
  }));
}

export function competitors(s: InstrumentSnapshot) {
  const p = s.profile;
  return [
    {
      id: p.id,
      mark: p.mark,
      name: p.short,
      color: p.color,
      price: asUsd(p.price),
      mcap: capOf(p.marketCap),
      pe: ratio(p.pe),
      ret: s.returns.ret1y === null ? DASH : pct(s.returns.ret1y, 1),
      retColor: s.returns.ret1y === null ? C.ink4 : trend(s.returns.ret1y >= 0),
      isSelf: true,
      covered: true,
    },
    ...s.peers.map((c, i) => ({
      id: c.id,
      mark: c.id.charAt(0),
      name: c.name,
      color: PEER_COLORS[i % PEER_COLORS.length],
      price: asUsd(c.price),
      mcap: capOf(c.marketCap),
      pe: ratio(c.pe),
      /* c.ret1y, not c.chg: the column header says 1Y return and the
         subject's row above supplies exactly that. */
      ret: c.ret1y === null ? DASH : pct(c.ret1y, 1),
      retColor: c.ret1y === null ? C.ink4 : trend(c.ret1y >= 0),
      isSelf: false,
      /* Every quoted symbol has a page now, so a peer row always leads
         somewhere real. */
      covered: true,
    })),
  ];
}

export function position(s: InstrumentSnapshot, held: number, portfolio: number) {
  const p = s.profile;
  const price = p.price ?? 0;
  const weight = portfolio > 0 ? ((held * price) / portfolio) * 100 : 0;
  const dayMove = p.chg === null || p.price === null ? null : (held * price * p.chg) / 100;

  return [
    { label: "Shares held", value: String(held), color: C.ink },
    { label: "Market value", value: p.price === null ? DASH : usd(held * price), color: C.ink },
    {
      label: "Today's move",
      value: dayMove === null ? DASH : `${dayMove >= 0 ? "+$" : "−$"}${money(Math.abs(dayMove))}`,
      color: dayMove === null ? C.ink4 : trend(dayMove >= 0),
    },
    { label: "Portfolio weight", value: `${weight.toFixed(1)}%`, color: C.ink },
  ];
}

/* The largest single-session moves, as the snapshot decided them.
 *
 * This used to recompute the list from `s.history.daily`, which was a second
 * implementation of something getInstrumentSnapshot already computes — and,
 * critically, already GUARDS: it publishes
 * `notableMoves: record.readable ? largestSessions(daily) : []`, withholding
 * the list when a failed corporate-actions call means a split could not be
 * repaired.
 *
 * The daily series is left unrepaired in that case on purpose (a break in a
 * drawn line is visible to a reader in a way a number is not), so recomputing
 * from it walked straight past the guard and rendered a missed 10:1 split as a
 * "−90.00%" session — a fabricated event, on a finance page, with nothing
 * saying so. right-rail.tsx and performance-panel.tsx both call this one, so
 * the guard reached no reader at all.
 *
 * One source of truth now. The formatting is identical either way — same UTC
 * long-date, same shape — so nothing on the page moves except the wrong number,
 * which disappears. */
export function notableMoves(s: InstrumentSnapshot, count = 3) {
  return (s.notableMoves ?? []).slice(0, count);
}

