import type { RawHistoryPoint } from "../clients/quotes.ts";
import { fail, ok, type ApiResult } from "../errors.ts";
import { isMarketHoliday } from "../../market/session.ts";
import { parseFeedDate } from "./time.ts";

/* Polygon's official daily bars, in the feed's own shape.
 *
 * WHY. The daily series came from /quotes/equity/historical, whose "price" is
 * not the official close — measured for AAPL on 24 Sep 2026: 342.70 for a
 * 22 Sep session that closed at 339.75, 340.04 for one that closed at 338.98
 * (beside a "low" of 250.12). Its open, high and low matched Polygon to the
 * cent; only the close was wrong, and the close is the number the whole app
 * reads: the PREV CLOSE line, every return and drawdown, the indicators.
 *
 * SHAPE. Every consumer parses "MM/DD/YYYY HH:MM:SS ZZZ" with parseFeedDate,
 * so these bars are written exactly that way, at the same Eastern midnight the
 * old source used — a drop-in, not a new contract.
 *
 * TODAY is always left out. "The last daily bar" is read across the app as
 * the last COMPLETED session, so a partial one there becomes the previous
 * close. Leaving it out only until 16:00 would not be enough: these fetches
 * are cached, and a response taken at 15:00 and served at 16:05 would carry a
 * mid-afternoon price as the close. Today's bar joins the series tomorrow,
 * which is when the worker reads it (publication, ~00:45 New York).
 */

export type RawAggBar = { t: number; o: number; h: number; l: number; c: number; v?: number };

const ET = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  timeZoneName: "short",
});

function eastern(ms: number) {
  const parts = ET.formatToParts(ms);
  const get = (t: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === t)?.value ?? "";
  return {
    ymd: `${get("year")}-${get("month")}-${get("day")}`,
    mdy: `${get("month")}/${get("day")}/${get("year")}`,
    zone: get("timeZoneName"),
  };
}

export function dailyBarsFromAggs(bars: readonly RawAggBar[], nowMs: number): RawHistoryPoint[] {
  const today = eastern(nowMs).ymd;
  return bars
    .filter((b) => Number.isFinite(b?.t) && Number.isFinite(b?.c) && b.c > 0)
    .filter((b) => eastern(b.t).ymd !== today)
    .sort((a, b) => a.t - b.t)
    .map((b) => {
      const e = eastern(b.t);
      return {
        date: `${e.mdy} 00:00:00 ${e.zone}`,
        price: b.c,
        opening: Number.isFinite(b.o) ? b.o : null,
        high: Number.isFinite(b.h) ? b.h : null,
        low: Number.isFinite(b.l) ? b.l : null,
        volume: Number.isFinite(b.v) ? (b.v as number) : null,
      };
    });
}

/* ---------------------------------------------------------------------------
 * Merging the two sources.
 *
 * Neither is right alone (measured 24 Sep 2026). The gateway's /historical
 * knows which COMPANY a ticker was on each date — META in Sep 2021 is Facebook
 * at 352.96 — but its daily "price" is not the official close, and it runs a
 * session behind (on the 24th it ended on the 22nd). Polygon has the official
 * closes and the latest session, but its history follows the TICKER: META
 * before June 2022 is the Roundhill metaverse ETF that held the symbol, $14.91.
 *
 * So the gateway's series is the skeleton — where it starts, and whose prices
 * they are — and a date takes Polygon's bar wherever the two describe the same
 * security. That is judged in three steps.
 *
 * 1. SHARE COUNT. The gateway has not applied the splits of the last year or
 *    so — measured 24 Sep 2026: NFLX 10:1, NOW 5:1, XLK 2:1, ORLY 15:1, IBKR
 *    4:1, FAST 2:1 — while older ones match (NVDA, AVGO and WMT agree with
 *    Polygon on every day). Polygon's bars are always adjusted. So before a
 *    split the gateway never applied, its rows sit at that split's ratio to
 *    Polygon's: NFLX's are ten times, open and close alike, on all 772 days
 *    from Sep 2021 to Oct 2024. Walking back from the newest day, the factor a
 *    gateway row is divided by changes where (a) the ratio between the feeds,
 *    over five sessions, settles on a split ratio, and (b) Polygon's own
 *    series runs on unbroken across the change — a split never moves the
 *    adjusted series. META's ETF sits near 1/24th of Facebook for days, which
 *    passes (a); Polygon's own series jumps from $12.31 to $194.28 across
 *    that seam, which fails (b).
 *
 * 2. AGREEMENT, day by day: the restated opens OR closes within 15%. Two
 *    securities under one ticker are 20x apart; the same one is within a
 *    percent on an ordinary day.
 *
 * 3. RUNS. On an earnings or listing day the gateway's WHOLE row can be an
 *    after-hours print, open included — XYZ on 1 May 2025 opens 45.70 and
 *    closes 46.18 against an official 59.02 and 58.48, AVGO on 3 Jun 2026
 *    reads 416 against 479.23, CRCL's listing day 98.23 against 83.23 — and
 *    some rows are plain bad prints (CKX on 23 Jan 2025, 16.61 against
 *    11.71). None agrees on its own day, but each sits in Polygon's series
 *    unbroken (the 15% again, bar to next bar) from a neighbour that does, so
 *    Polygon's bar there is the same security's and it is taken.
 *
 * A date only Polygon has — the session the gateway has not published yet,
 * or a hole in its archive — joins while the gateway's last shared date is
 * the same security.
 *
 * Every row carries its own date's Eastern offset. The gateway stamps "EDT"
 * all year, and "01/15/2026 00:00:00 EDT" is 23:00 on the 14th in New York —
 * every winter row read as the session before it, so priorClose on the 15th
 * returned the 15th's own close. Polygon's date is kept where its bar is
 * taken; the gateway's rows are re-stamped.
 *
 * Before the gateway's first date, Polygon's sessions lead the series only
 * when that first date is itself the same security, and only back to the
 * first jump no single session makes. The gateway's window starts a session
 * late for a calendar-anchored return — measured 24 Sep 2026, AAPL's five
 * years began on 2021-09-24, the day after the 5Y anchor of a series ending on
 * the 23rd — and Polygon's request reaches ten days further. META's first
 * gateway date is Facebook and Polygon's is the ETF, so nothing leads it; a
 * ticker that changed hands inside those ten days stops the walk at the change.
 * ------------------------------------------------------------------------- */

const SAME_SECURITY = 0.15;

const near = (a: number | null | undefined, b: number | null | undefined) =>
  typeof a === "number" && typeof b === "number" && a > 0 && b > 0 && Math.abs(a - b) / b <= SAME_SECURITY;

/* Two bars for one date that plainly describe the same security. */
const agree = (pg: RawHistoryPoint, gw: RawHistoryPoint) =>
  near(pg.opening, gw.opening) || near(pg.price, gw.price);

/* A bar that follows on from the one before it in one series: within 15% of
   the close before, at its open or its close. */
const follows = (before: RawHistoryPoint, after: RawHistoryPoint) =>
  near(before.price, after.opening) || near(before.price, after.price);

/* A wick more than half-way beyond the body is not a price anybody paid —
   Polygon's VZ bar for 8 Jan 2026 has a low of 10.60 against a VWAP of 40.54,
   and the gateway's AAPL bar for 21 Sep 2026 a low of 250.12. It becomes "no
   figure" rather than a crash in every range, drawdown and ATR. */
function sane(bar: RawHistoryPoint): RawHistoryPoint {
  const open = bar.opening ?? bar.price;
  const bodyLow = Math.min(open, bar.price);
  const bodyHigh = Math.max(open, bar.price);
  return {
    ...bar,
    low: bar.low !== null && bar.low < bodyLow * 0.5 ? null : bar.low,
    high: bar.high !== null && bar.high > bodyHigh * 2 ? null : bar.high,
  };
}

/* Polygon's range is the official one and normally stands. A wick more than
   10% beyond the gateway's for the same day is a bad print on Polygon's side —
   NVDA 10 Jun 2024: a 195.95 high on a $121 day, the gateway 123.10 — and the
   gateway's figure replaces it, never inside the official bar's own body. */
const WICK_TOLERANCE = 0.1;

function withWicks(pg: RawHistoryPoint, gw: RawHistoryPoint): RawHistoryPoint {
  const open = pg.opening ?? pg.price;
  const top = Math.max(open, pg.price);
  const bottom = Math.min(open, pg.price);
  let { high, low } = pg;
  if (high !== null && gw.high !== null && gw.high >= top && high > gw.high * (1 + WICK_TOLERANCE)) high = gw.high;
  if (low !== null && gw.low !== null && gw.low <= bottom && low < gw.low * (1 - WICK_TOLERANCE)) low = gw.low;
  return { ...pg, high, low };
}

/* A gateway row in today's share count: every price divided by the ratio of
   the splits it predates and the gateway never applied. */
function restated(bar: RawHistoryPoint, factor: number): RawHistoryPoint {
  if (factor === 1) return bar;
  const by = (v: number | null) => (v === null ? null : v / factor);
  return { ...bar, price: bar.price / factor, opening: by(bar.opening), high: by(bar.high), low: by(bar.low) };
}

/* A split as a price factor: n-for-1 up to 50-for-1, the fractional ones
   (3:2, 5:2, 4:3, 5:4), and each reversed for a reverse split. One day's
   ratio can stray — since late 2024 the gateway's rows are noisier, and an
   after-hours row sits up to 15% off — so the ratio is read as the median over
   up to SPLIT_WINDOW sessions (at least SPLIT_MIN_SESSIONS) and must land
   within 3% of a split. Measured 24 Sep 2026 on the six unapplied splits
   above, the medians were within 1%. */
const SPLIT_TOLERANCE = 0.03;
const SPLIT_WINDOW = 5;
const SPLIT_MIN_SESSIONS = 3;
const SPLIT_RATIOS: readonly number[] = (() => {
  const forward = [1.5, 2.5, 4 / 3, 1.25];
  for (let n = 2; n <= 50; n += 1) forward.push(n);
  return [...forward, ...forward.map((r) => 1 / r)];
})();

function asSplit(ratio: number): number | null {
  for (const r of SPLIT_RATIOS) if (Math.abs(ratio / r - 1) <= SPLIT_TOLERANCE) return r;
  return null;
}

function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/* The gateway's price over Polygon's for one date, at the open and the close. */
function ratios(gw: RawHistoryPoint, pg: RawHistoryPoint): number[] {
  const out: number[] = [];
  if (gw.opening !== null && pg.opening !== null && gw.opening > 0 && pg.opening > 0) out.push(gw.opening / pg.opening);
  if (gw.price > 0 && pg.price > 0) out.push(gw.price / pg.price);
  return out;
}

/* Step 1: the factor each shared date's gateway row is divided by. */
function shareCounts(
  shared: readonly string[],
  fromGateway: ReadonlyMap<string, RawHistoryPoint>,
  fromPolygon: ReadonlyMap<string, RawHistoryPoint>,
): Map<string, number> {
  const factors = new Map<string, number>();
  let factor = 1;
  let newestAgreed: RawHistoryPoint | null = null;
  for (let i = shared.length - 1; i >= 0; i -= 1) {
    const gw = fromGateway.get(shared[i])!;
    const pg = fromPolygon.get(shared[i])!;
    if (!agree(pg, restated(gw, factor)) && newestAgreed !== null && follows(pg, newestAgreed)) {
      const window = shared.slice(Math.max(0, i - SPLIT_WINDOW + 1), i + 1);
      if (window.length >= SPLIT_MIN_SESSIONS) {
        const m = median(window.flatMap((d) => ratios(fromGateway.get(d)!, fromPolygon.get(d)!)));
        const split = m === null ? null : asSplit(m / factor);
        if (split !== null) factor *= split;
      }
    }
    factors.set(shared[i], factor);
    if (agree(pg, restated(gw, factor))) newestAgreed = pg;
  }
  return factors;
}

/* A gateway-only row's factor: that of the shared dates around it — and
   where those differ (a split inside a hole in Polygon's archive), the side
   the row's own price sits nearer. */
function rowFactor(
  day: string,
  shared: readonly string[],
  factors: ReadonlyMap<string, number>,
  fromGateway: ReadonlyMap<string, RawHistoryPoint>,
): number {
  const known = factors.get(day);
  if (known !== undefined) return known;
  let lo = 0;
  let hi = shared.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (shared[mid] < day) lo = mid + 1;
    else hi = mid;
  }
  const before = lo > 0 ? shared[lo - 1] : undefined;
  const after = lo < shared.length ? shared[lo] : undefined;
  const fb = before === undefined ? undefined : factors.get(before);
  const fa = after === undefined ? undefined : factors.get(after);
  if (fb === undefined || fa === undefined || fb === fa) return fb ?? fa ?? 1;
  const price = fromGateway.get(day)!.price;
  const distance = (d: string) => Math.abs(Math.log(price / fromGateway.get(d)!.price));
  return distance(before!) <= distance(after!) ? fb : fa;
}

/* Steps 2 and 3: the shared dates whose Polygon bar is the gateway's security. */
function sameSecurityDays(
  polygonDays: readonly string[],
  fromGateway: ReadonlyMap<string, RawHistoryPoint>,
  fromPolygon: ReadonlyMap<string, RawHistoryPoint>,
  factors: ReadonlyMap<string, number>,
): Set<string> {
  const same = new Set<string>();
  for (const day of polygonDays) {
    const gw = fromGateway.get(day);
    if (gw && agree(fromPolygon.get(day)!, restated(gw, factors.get(day)!))) same.add(day);
  }
  const bar = (i: number) => fromPolygon.get(polygonDays[i])!;
  const joins = (i: number) =>
    (i > 0 && same.has(polygonDays[i - 1]) && follows(bar(i - 1), bar(i))) ||
    (i + 1 < polygonDays.length && same.has(polygonDays[i + 1]) && follows(bar(i), bar(i + 1)));
  for (let grew = true; grew; ) {
    grew = false;
    for (let k = 0; k < 2 * polygonDays.length; k += 1) {
      // Forward, then back: a run of bad rows can hang off either end.
      const i = k < polygonDays.length ? k : 2 * polygonDays.length - 1 - k;
      const day = polygonDays[i];
      if (same.has(day) || !fromGateway.has(day) || !joins(i)) continue;
      same.add(day);
      grew = true;
    }
  }
  return same;
}

const FEED_MDY = /^(\d{2})\/(\d{2})\/(\d{4})/;

/* "09/22/2026 …" → "2026-09-22", which sorts. */
function dayKey(date: string | undefined): string | null {
  const m = FEED_MDY.exec(date ?? "");
  return m ? `${m[3]}-${m[1]}-${m[2]}` : null;
}

/* A gateway row stamped with the Eastern offset its own date had. */
function stamped(bar: RawHistoryPoint, day: string): RawHistoryPoint {
  const [y, m, d] = day.split("-");
  return { ...bar, date: `${m}/${d}/${y} 00:00:00 ${eastern(Date.parse(`${day}T12:00:00Z`)).zone}` };
}

export function mergeOfficial(
  gateway: readonly RawHistoryPoint[],
  polygon: readonly RawAggBar[],
  nowMs: number,
): RawHistoryPoint[] {
  const official = dailyBarsFromAggs(polygon, nowMs);
  if (gateway.length === 0) return sinceLastSeam(official.map(sane));

  const today = dayKey(eastern(nowMs).mdy);
  const fromGateway = new Map<string, RawHistoryPoint>();
  for (const bar of gateway) {
    const key = dayKey(bar.date);
    if (key && key !== today && Number.isFinite(bar.price) && bar.price > 0) fromGateway.set(key, bar);
  }
  const fromPolygon = new Map<string, RawHistoryPoint>();
  for (const bar of official) fromPolygon.set(dayKey(bar.date)!, bar);

  const days = [...new Set([...fromGateway.keys(), ...fromPolygon.keys()])].sort();
  const polygonDays = [...fromPolygon.keys()].sort();
  const shared = polygonDays.filter((d) => fromGateway.has(d));
  const factors = shareCounts(shared, fromGateway, fromPolygon);
  const same = sameSecurityDays(polygonDays, fromGateway, fromPolygon, factors);
  const gatewayRow = (day: string) =>
    stamped(restated(fromGateway.get(day)!, rowFactor(day, shared, factors, fromGateway)), day);

  const lastPolygonDay = polygonDays.length > 0 ? polygonDays[polygonDays.length - 1] : null;
  const out: RawHistoryPoint[] = leadIn(days, fromGateway, fromPolygon, same);
  let begun = false;
  let sameSecurity = false;
  for (const day of days) {
    const pg = fromPolygon.get(day);
    if (fromGateway.has(day)) {
      begun = true;
      const gw = gatewayRow(day);
      if (pg) {
        sameSecurity = same.has(day);
        out.push(sane(sameSecurity ? withWicks(pg, gw) : gw));
      } else if (!closedDay(day) && !(sameSecurity && lastPolygonDay !== null && day < lastPolygonDay)) {
        out.push(sane(gw));
      }
    } else if (pg && begun && sameSecurity) {
      out.push(sane(pg));
    }
  }
  return out;
}

/* Polygon's sessions before the gateway's first real date, oldest first —
   empty unless that date is the same security. See the rule above. */
function leadIn(
  days: readonly string[],
  fromGateway: ReadonlyMap<string, RawHistoryPoint>,
  fromPolygon: ReadonlyMap<string, RawHistoryPoint>,
  same: ReadonlySet<string>,
): RawHistoryPoint[] {
  const first = days.find((d) => fromGateway.has(d) && !closedDay(d));
  if (first === undefined || !same.has(first)) return [];
  let next = fromPolygon.get(first)!;
  const lead: RawHistoryPoint[] = [];
  for (let i = days.indexOf(first) - 1; i >= 0; i -= 1) {
    const pg = fromPolygon.get(days[i]);
    // A gateway holiday row is stepped over; nothing traded to compare.
    if (!pg && closedDay(days[i])) continue;
    if (!pg || !follows(pg, next)) break;
    lead.unshift(sane(pg));
    next = pg;
  }
  return lead;
}

/* A day the exchange did not trade. Measured 24 Sep 2026: /historical emits a
   row on every exchange holiday since Sep 2024 — 21 in AAPL's five years —
   repeating the session before, so a holiday drew as a flat day and counted
   as a session in every "N days back". The same holds for any day Polygon
   skips inside a stretch where it and the gateway agree on the security:
   Polygon has every day that traded, so a gateway-only day there (a holiday
   older than the list in session.ts) is one on which nothing did. */
function closedDay(key: string): boolean {
  const noonUtc = Date.parse(`${key}T12:00:00Z`);
  const weekday = new Date(noonUtc).getUTCDay();
  return weekday === 0 || weekday === 6 || isMarketHoliday(noonUtc / 1000);
}

/* ---------------------------------------------------------------------------
 * Seams: where a series stops being one security.
 *
 * A ticker handed from one security to another leaves a hole and a jump in a
 * per-ticker history. META's on Polygon, as the store held it on 24 Sep 2026:
 * the Roundhill ETF to $12.31 on 28 Jan 2022, nothing for four months, then
 * Facebook at $184 on 9 Jun 2022 — fifteen times. Served whole, that read as
 * a 5Y return of +4,884%. A split leaves a jump too, but with no hole: the
 * repair handles those, and a split inside a month's hole is rare enough to
 * cost only the history before it. So a seam is a gap of more than a month
 * with a move of 3x or more across it, and a series is used from the last one.
 * ------------------------------------------------------------------------- */

const DAY_MS = 86_400_000;
const SEAM_GAP_DAYS = 30;
const SEAM_RATIO = 3;

/** The series (oldest first) from its last seam on; the same array if it has none. */
export function sinceLastSeam<T extends { date: string; price: number }>(points: readonly T[]): T[] {
  for (let i = points.length - 1; i > 0; i -= 1) {
    const before = parseFeedDate(points[i - 1].date);
    const after = parseFeedDate(points[i].date);
    if (before === null || after === null || after - before <= SEAM_GAP_DAYS * DAY_MS) continue;
    const move = points[i].price / points[i - 1].price;
    if (move >= SEAM_RATIO || move <= 1 / SEAM_RATIO) return points.slice(i);
  }
  return points as T[];
}

/* ---------------------------------------------------------------------------
 * The daily series from what each source answered.
 *
 * A PAGE degrades to whichever source answered: the gateway's bars alone
 * (wrong closes, a session behind) or Polygon's alone (from its last seam).
 *
 * THE WORKER (noStore) writes what it gets into the store, where a series
 * built from one source replaces a merged one — official closes with the
 * gateway's, or a company's history with the ETF's. So there a failure from
 * EITHER source is returned, whatever its status, and the job backs off with
 * the stored series untouched. That includes answers that are failures in all
 * but status: a body that was not JSON arrives as ok:false under HTTP 200, and
 * a throttle body under 200 is not a list. Measured 24 Sep 2026, every symbol
 * shape in the master (BRK.B, BAC-K, SPX$, ACHR+, …) gets HTTP 200 from
 * Polygon, with no bars when it does not know one, so no symbol is locked out
 * by this.
 *
 * An EMPTY list from the gateway is an answer — measured, /historical says
 * 200 [] for a symbol it does not carry — and Polygon's bars stand, from
 * their last seam.
 * ------------------------------------------------------------------------- */

export function settleHistory(
  gateway: ApiResult<unknown>,
  official: ApiResult<unknown>,
  nowMs: number,
  noStore: boolean,
): ApiResult<RawHistoryPoint[]> {
  const series = gateway.ok && Array.isArray(gateway.data) ? (gateway.data as RawHistoryPoint[]) : null;
  const aggs = official.ok ? aggsIn(official.data) : null;
  if (noStore) {
    if (!official.ok) return official;
    if (!gateway.ok) return gateway;
    if (aggs === null) return fail("Polygon's daily answer carried no list of bars", official.status, official.ms);
    if (series === null) return fail("The gateway's history was not a list", gateway.status, gateway.ms);
  }

  const bars = mergeOfficial(series ?? [], aggs ?? [], nowMs);
  if (bars.length > 0) {
    const basis = gateway.ok ? gateway : official;
    return ok(bars, basis.status, Math.max(gateway.ms, official.ms));
  }
  return gateway.ok ? ok([], gateway.status, gateway.ms) : gateway;
}

/* ---------------------------------------------------------------------------
 * A company's bars across a change of ticker.
 *
 * Polygon files history under the ticker, so a company that renamed has its
 * earlier bars under its earlier ticker, and the current one's bars for those
 * days belong to whoever held it then (META's are an ETF's). PREDECESSORS in
 * polygon-ticker.ts lists the measured cases. Each predecessor answers for its
 * own days, from `from` (or the start) through `until`, and the current
 * ticker's bars for those days are dropped. What results is one company's
 * series, and mergeOfficial judges it against the gateway exactly as it would
 * any other Polygon answer.
 *
 * A predecessor request that failed is handled as settleHistory handles a
 * failure. The worker (noStore) gets the failure back and leaves the stored
 * series alone. A page gets the current ticker's bars on their own, which is
 * how it drew before this existed.
 * ------------------------------------------------------------------------- */

export type EarlierTicker = { from?: string; until: string; answer: ApiResult<unknown> };

const inSpan = (day: string, p: { from?: string; until: string }) =>
  (p.from === undefined || day >= p.from) && day <= p.until;

export function withPredecessors(
  own: ApiResult<unknown>,
  earlier: readonly EarlierTicker[],
  noStore: boolean,
): ApiResult<unknown> {
  if (earlier.length === 0 || !own.ok) return own;
  const ownBars = aggsIn(own.data);
  if (ownBars === null) return own;
  const results: RawAggBar[] = ownBars.filter(
    (b) => !Number.isFinite(b?.t) || !earlier.some((p) => inSpan(eastern(b.t).ymd, p)),
  );
  let ms = own.ms;
  for (const p of earlier) {
    const bars = p.answer.ok ? aggsIn(p.answer.data) : null;
    if (bars === null) {
      if (!noStore) return own;
      return p.answer.ok
        ? fail("A predecessor's daily answer carried no list of bars", p.answer.status, p.answer.ms)
        : p.answer;
    }
    ms = Math.max(ms, p.answer.ms);
    for (const b of bars) if (Number.isFinite(b?.t) && inSpan(eastern(b.t).ymd, p)) results.push(b);
  }
  results.sort((a, b) => a.t - b.t);
  return ok({ results }, own.status, ms);
}

/* Polygon's bars from an aggregates answer. No `results` key is Polygon's
   way of saying it has none (an unknown symbol); anything else is malformed. */
function aggsIn(data: unknown): RawAggBar[] | null {
  if (data === null || typeof data !== "object") return null;
  const results = (data as { results?: unknown }).results;
  if (results === undefined) return [];
  return Array.isArray(results) ? (results as RawAggBar[]) : null;
}
