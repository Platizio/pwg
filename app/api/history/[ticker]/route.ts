import type { NextRequest } from "next/server";
import { refusePublic } from "@/lib/api/public-guard";
import { readSections } from "@/lib/market/store/reads";
import { fromStored } from "@/lib/market/store/sections";
import { repairAgainst, splitRecord } from "@/lib/market/split-record";
import {
  SESSIONS_KEPT,
  bucketIntraday,
  easternDay,
  BUCKET_MINUTES,
  aggsToColumns,
  columnsToRows,
  lastSession,
  pickSessions,
  startsInRegularSession,
  withOfficialCloses,
  type IntradayColumns,
} from "@/lib/market/intraday-buckets";
import { dailySpan, officialCloses } from "@/lib/market/official-close";
import { fetchAggs, fetchIntradayRange, type RawAgg } from "@/lib/api/clients/quotes";
import { sinceLastSeam } from "@/lib/api/normalize/daily-bars";
import type { ApiResult } from "@/lib/api/errors";
import { tradingDays, windowFor } from "@/lib/market/session-window";
import { parseFetchedRange, type FetchedRange } from "@/lib/market/ranges";

/* One chart range, fetched when the reader asks for it.
 *
 * WHY THIS ROUTE EXISTS. The instrument page used to ship every range at once:
 * the company's five years of daily bars and the benchmark's, 2,549 of them,
 * 234KB of a 438KB payload, on every click. On a 512MB instance each of those
 * renders held forty to sixty megabytes and did not give it back — a fresh box
 * measured 81MB, then 200, then 212, and the next render returned 502. After
 * that every never-prerendered stock hung for as long as anyone waited, which
 * is what a reader experiences as clicking a gainer and nothing happening.
 *
 * So the page ships the range it OPENS with and this answers for the rest.
 *
 * Five years comes from the store. The day, week, month, quarter and year come
 * from Polygon's aggregates through the gateway (and, for the day and week, the
 * gateway's own minute archive and our captures), each call held in Next's
 * fetch cache so a popular symbol costs one upstream call per window rather
 * than one per reader.
 *
 * EVERY SESSION ENDS ON ITS OFFICIAL CLOSE. Minute bars stop at 15:59, whose
 * close is the last continuous trade — 336.95 for AAPL on 23 Sep 2026 against
 * an official 337.02 — so each drawn session gains one point at its bell
 * carrying the official close (lib/market/official-close.ts says which figure
 * that is and when there is one). The last point of a range drawn while the
 * market is shut is then the "Previous close" printed beside the chart.
 */

/* The longest listed US ticker is nine characters across the symbol master's
   33,440 rows; the class is the master's own, `$` included for the index
   instruments. Both borrowed from app/api/intraday/[ticker]/route.ts, which is
   this route's closest sibling. */
const MAX_SYMBOL = 16;
const SYMBOL = /^[A-Z0-9.$+_-]+$/;

const CACHE = "public, max-age=60, stale-while-revalidate=300";

/** The symbol, uppercased, or null if it is not one. */
function parseSymbol(raw: string): string | null {
  let decoded: string;
  try {
    decoded = decodeURIComponent(raw ?? "");
  } catch {
    /* A stray `%` makes decodeURIComponent throw URIError, which reaches the
       client as a 500 — a defect this route's two siblings still have. A
       malformed path is a 400 about the request, not a fault in the server. */
    return null;
  }
  const symbol = decoded.trim().toUpperCase();
  if (!symbol || symbol.length > MAX_SYMBOL || !SYMBOL.test(symbol)) return null;
  return symbol;
}

const EMPTY: IntradayColumns = {
  date: [],
  price: [],
  opening: [],
  high: [],
  low: [],
  volume: [],
};

const DAY_MS = 86_400_000;

/* HOW LONG AN ANSWER CARRYING THE NEWEST SESSION IS CACHED.
 *
 * The client refetches every range at the open and at the bell, then every
 * 30 s while an answer falls short of the boundary that has passed
 * (historyTarget in lib/market/ranges.ts). Those retries reach Polygon only as
 * often as Next's fetch cache lets them, and its entries are keyed by URL,
 * which for these requests is the same all day. So the request holding the
 * newest session sets how late a chart can be: under a range's own TTL (an
 * hour for 3M and 1Y) a copy cached at 15:30 kept the year's line off today's
 * official close until about 16:30. Older sessions never change and keep the
 * long lifetime; only the newest request is held this briefly. */
const NEWEST_TTL = 300;
/* The day and the week while TODAY is their newest session: the chart takes
   the fetched copy whenever it reaches further than the live bars
   (pickDaySeries), and at the bell the 16:00 cross it needs is in this
   answer. A minute bounds that delay without a call per reader. */
const TODAY_TTL = 60;

const aggsOf =(a: ApiResult<{ results?: RawAgg[] }> | null): RawAgg[] =>
  a?.ok && Array.isArray(a.data?.results) ? a.data.results : [];

/* A series drawn from what came back. */
const served = (range: FetchedRange, series: unknown, sessions?: number) =>
  Response.json(
    sessions === undefined ? { range, series } : { range, series, sessions },
    { headers: { "Cache-Control": CACHE } },
  );

/* WHY A FAILURE IS A 503 AND NOT AN EMPTY 200.
 *
 * The client (components/terminal/use-history.ts) keeps a 200 that carries
 * points for the range's lifetime — three hours for 5Y and 1Y. A store that
 * was unreachable for a second, or a Polygon chunk that timed out, used to
 * come back as an empty 200 and left the five-year chart blank for the
 * afternoon. Only a 200 is an answer there (historyAnswered, in
 * lib/market/ranges.ts): anything else is held as a failure, asked again
 * thirty seconds later past the browser's cache, and never replaces points
 * already drawn. no-store keeps any cache in between from holding it either.
 * An empty 200 still means what it says — every source answered and had
 * nothing — and the client re-asks that after thirty seconds as well. */
const unavailable = (range: FetchedRange) =>
  Response.json(
    { range, series: EMPTY, error: "unavailable" },
    { status: 503, headers: { "Cache-Control": "no-store" } },
  );

export async function GET(
  request: NextRequest,
  /* Spelled out rather than taken from the generated RouteContext helper, for
     the reason app/api/intraday/[ticker]/route.ts gives at length: that helper
     is generated from the route list and a route added since the last typegen
     is not in it. `next build` checks this signature; `tsc --noEmit` does not. */
  context: { params: Promise<{ ticker: string }> },
) {
  /* Serves licensed prices and makes (cached) upstream calls — a public URL
     that handed either out without limit would be both the licence problem and
     the cost one. */
  const refused = refusePublic(request.headers, {
    route: "history",
    limit: 60,
    windowMs: 60_000,
  });
  if (refused) return refused;

  const { ticker } = await context.params;
  const symbol = parseSymbol(ticker);
  const range = parseFetchedRange(new URL(request.url).searchParams.get("range"));

  if (!symbol || !range) {
    return Response.json(
      { range: null, series: EMPTY },
      { status: 400, headers: { "Cache-Control": CACHE } },
    );
  }

  const now = Date.now();
  if (range === "1D" || range === "1W") return dayOrWeek(symbol, range, now);
  if (range === "1M" || range === "3M" || range === "1Y") return monthsOrYear(symbol, range, now);
  return fiveYears(symbol);
}

/* THE DAY AND THE WEEK, IN MINUTES.
 *
 * These used to come only from the store's ten-minute buckets, captured one
 * evening at a time, which left the week chart drawing seven daily closes —
 * six straight segments — until a week of captures had accumulated. Both are
 * now drawn from real minutes: every minute of the last session for 1D, and
 * five-minute buckets for the week (7 x 78, about 550 points — the full 2,700
 * minutes would be a heavier payload than a chart a few hundred pixels wide
 * can show).
 *
 * Three sources at once; each session is then taken from whichever covers it
 * (pickSessions), finest first. Polygon's aggregates lead: they have every
 * minute for years, where the gateway's intraday archive has holes (16 Sep
 * 2026 held 18 of 391 bars) and lags a day behind (on 24 Sep it had not yet
 * filled the 23rd). The archive and our own captures remain behind it, so one
 * source failing never blanks a day. A fourth request, Polygon's daily bars
 * over the same days, supplies the official closes.
 *
 * Trimmed to the regular session by where each bar STARTS — 09:30 to 16:00,
 * 13:00 on a half-day — so neither the gateway's 16:00 minute (a post-market
 * print) nor a half-day's afternoon is drawn as session. */
async function dayOrWeek(symbol: string, range: "1D" | "1W", now: number): Promise<Response> {
  const days = tradingDays(now, range === "1D" ? 1 : SESSIONS_KEPT);
  const window = windowFor(days);
  const span = dailySpan(days);
  if (!window || !span) return unavailable(range);

  const width = range === "1D" ? 1 : 5;
  const today = easternDay(new Date(now).toISOString());
  const ttl = days[days.length - 1] === today ? TODAY_TTL : NEWEST_TTL;
  const [poly, res, storedRows, daily] = await Promise.all([
    fetchAggs(
      symbol,
      width,
      "minute",
      Date.parse(`${days[0]}T00:00:00Z`),
      Date.parse(`${days[days.length - 1]}T00:00:00Z`) + DAY_MS + 6 * 3_600_000,
      ttl,
    ).catch(() => null),
    fetchIntradayRange(symbol, window.from, window.to, 300, [`history:${symbol}`]).catch(() => null),
    readSections([symbol], "history_intraday").catch(() => null),
    fetchAggs(symbol, 1, "day", span.fromMs, span.toMs, ttl).catch(() => null),
  ]);

  /* Untrimmed on purpose: the bar that STARTS at the bell is post-market by its
     stamp, and its open is the best figure for today's official close until
     the daily bar is final (official-close.ts has the measured accuracy). */
  const raw = aggsOf(poly);
  const closes = officialCloses(days, daily?.ok ? aggsOf(daily) : null, raw, now);

  const wanted = new Set(days);
  const inWindow = (ms: number) =>
    startsInRegularSession(ms) && wanted.has(easternDay(new Date(ms).toISOString()));
  const polyRows = columnsToRows(aggsToColumns(raw, days));
  const gatewayRows =
    res?.ok && Array.isArray(res.data)
      ? res.data.filter((row) => inWindow(Date.parse(String(row?.date ?? ""))))
      : [];
  const storedPayload = storedRows?.ok
    ? (storedRows.data.find((r) => r.symbol === symbol)?.payload ?? null)
    : null;
  const stored = storedPayload ? fromStored("history_intraday", storedPayload) : null;
  const storedInWindow = stored ? keepColumns(stored, (iso) => inWindow(Date.parse(iso))) : null;

  const rows = pickSessions(days, [
    { rows: polyRows, width },
    { rows: gatewayRows, width: 1 },
    { rows: storedInWindow ? columnsToRows(storedInWindow) : [], width: BUCKET_MINUTES },
  ]);
  if (rows.length > 0) {
    const series = withOfficialCloses(bucketIntraday(rows, width), closes);
    if (series.date.length > 0) return served(range, series, days.length);
  }

  /* Nothing inside the window. If the store could not be read either, that
     is a failure rather than an answer: it may well hold the session. If it
     could, its newest sessions, whichever days they are, are still a better
     chart than none — and an empty store is an answer. */
  if (!storedRows?.ok) return unavailable(range);
  const kept = stored ? keepColumns(stored, (iso) => startsInRegularSession(Date.parse(iso))) : EMPTY;
  const fallback = withOfficialCloses(range === "1D" ? lastSession(kept) : kept, closes);
  return served(range, fallback, SESSIONS_KEPT);
}

/* THE MONTH, THE QUARTER AND THE YEAR, AS INTRADAY LINES.
 *
 * These drew a line through 21, 64 and 252 daily closes — straight segments —
 * because the intraday archive reaches back only about seventeen sessions.
 * Polygon's aggregates hold intraday bars for years, so each is drawn from
 * real intraday bars: 15-minute for the month (~550 points), 30-minute for the
 * quarter (~830) and the year (~3,300), trimmed to the regular session.
 *
 * CHUNKED because each request is capped at 50,000 base one-minute bars —
 * about fifty trading days once extended hours count. Forty sessions a chunk
 * leaves margin, and the chunks run in parallel. Each chunk's window is the
 * whole UTC span of its New York days (a day there runs 04:00Z to 04:00Z the
 * next, give or take DST), trimmed back to the exact days by aggsToColumns.
 * Cached in Next's fetch cache per chunk: the older chunks never change. One
 * daily request beside them carries every session's official close.
 *
 * ALL OR NOTHING. A chunk that failed is up to forty sessions missing from
 * the middle of the line, which the chart would bridge with one straight
 * segment and the reader could not tell from a quiet two months. The page's
 * own daily closes are the honest fallback, and a 503 is what sends the
 * client to them without caching the hole (see `unavailable`). */
async function monthsOrYear(
  symbol: string,
  range: "1M" | "3M" | "1Y",
  now: number,
): Promise<Response> {
  const spec = {
    "1M": { sessions: 21, minutes: 15, ttl: 900 },
    "3M": { sessions: 64, minutes: 30, ttl: 3600 },
    "1Y": { sessions: 252, minutes: 30, ttl: 3600 },
  }[range];
  const days = tradingDays(now, spec.sessions);
  const span = dailySpan(days);
  if (!span) return unavailable(range);
  const chunks: string[][] = [];
  for (let i = 0; i < days.length; i += 40) chunks.push(days.slice(i, i + 40));

  const [daily, ...answers] = await Promise.all([
    fetchAggs(symbol, 1, "day", span.fromMs, span.toMs, NEWEST_TTL).catch(() => null),
    ...chunks.map((c, i) =>
      fetchAggs(
        symbol,
        spec.minutes,
        "minute",
        Date.parse(`${c[0]}T00:00:00Z`),
        Date.parse(`${c[c.length - 1]}T00:00:00Z`) + DAY_MS + 6 * 3_600_000,
        i === chunks.length - 1 ? NEWEST_TTL : spec.ttl,
      ).catch(() => null),
    ),
  ]);
  if (answers.some((a) => !a?.ok)) return unavailable(range);

  const raw = answers.flatMap(aggsOf);
  const closes = officialCloses(days, daily?.ok ? aggsOf(daily) : null, raw, now);
  const series = withOfficialCloses(aggsToColumns(raw, days), closes);
  /* Every chunk answered and none had a bar: a symbol Polygon does not know.
     That is an answer — the client draws the page's daily closes instead. */
  return served(range, series.date.length > 0 ? series : EMPTY, days.length);
}

/* FIVE YEARS, from the store's daily bars. */
async function fiveYears(symbol: string): Promise<Response> {
  const [rows, actionsRows] = await Promise.all([
    readSections([symbol], "history_daily").catch(() => null),
    readSections([symbol], "corporate_actions").catch(() => null),
  ]);
  if (!rows?.ok) return unavailable("5Y");

  /* REPAIRED for splits, the same way the page's own series is
     (lib/market/instrument.ts repairs at read time). The store keeps the
     feed's bars as they came, and those carry a cliff at every split — a
     Netflix 10-for-1 reads as a 90% crash. This series feeds the Performance
     tab's five-year figures as well as the 5Y chart, so an unrepaired one
     would put that cliff into every return and drawdown. When the
     corporate-actions record cannot be read, splitRecord says so and the bars
     pass through unchanged, exactly as they do on the page.

     And served from the series' last SEAM (sinceLastSeam, normalize/daily-
     bars.ts): a store written from Polygon alone can carry the history of a
     security that held the ticker before. Measured 24 Sep 2026, production
     served META's five years as the Roundhill ETF at $14.99 until a four-month
     hole, then Facebook at $184 — a +4,884% five-year return. That clears
     only when the worker rewrites the row, so the route does not wait for it. */
  const payload = rows.data.find((r) => r.symbol === symbol)?.payload ?? null;
  const daily = fromStored("history_daily", payload);
  const actionsPayload = actionsRows?.ok
    ? (actionsRows.data.find((r) => r.symbol === symbol)?.payload ?? null)
    : null;
  const actions = actionsPayload ? fromStored("corporate_actions", actionsPayload) : null;
  const repaired = daily ? sinceLastSeam(repairAgainst(daily, splitRecord(actions))) : [];
  return served("5Y", repaired);
}

/* A columnar series with only the bars whose date passes. */
function keepColumns(c: IntradayColumns, keep: (iso: string) => boolean): IntradayColumns {
  const out: IntradayColumns = { date: [], price: [], opening: [], high: [], low: [], volume: [] };
  for (let i = 0; i < c.date.length; i += 1) {
    if (!keep(c.date[i])) continue;
    out.date.push(c.date[i]);
    out.price.push(c.price[i]);
    out.opening.push(c.opening[i]);
    out.high.push(c.high[i]);
    out.low.push(c.low[i]);
    out.volume.push(c.volume[i]);
  }
  return out;
}
