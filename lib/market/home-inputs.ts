import { changeOverSessions } from "../api/normalize/time.ts";

import type { RawCorporateActions, RawTickerNews } from "../api/clients/fundamentals.ts";
import type { RawEquityQuote } from "../api/clients/quotes.ts";
import type { Snapshot, SweepRow } from "../api/sweep.ts";

/* One `market_home` answer, turned back into the five things the dashboard was
 * already built to consume.
 *
 * getHomeSnapshot opened with a five-way fan-out at the gateway — a sweep, the
 * index and sector strip, eleven months of history, the wire tickers' news, the
 * calendar tickers' corporate actions — and everything below it was written
 * against those five values. The store answers all five in one call, so the
 * only new code the switch needs is a translation, and this is it. Nothing
 * downstream is supposed to be able to tell which source it got.
 *
 * WHY IT IS ITS OWN MODULE, AND PURE. home.ts imports `server-only`, resolves
 * through the `@/` alias and pulls in next/cache by way of the cached readers,
 * so nothing exported from it is reachable by `node --test`. The translation is
 * the one part of this path with judgement in it and the one part that fails
 * silently when it is wrong — a dropped `chgKnown` renders a dash, a week map
 * built a column out of step renders a plausible wrong percentage — so it lives
 * where a test can hold it. Relative imports with `.ts` extensions, and no Next
 * import anywhere in the graph, are what keep that true.
 *
 * `unknown` IN, NEVER `StoredHome`. The payload is jsonb that left this process
 * days ago and came back through Postgres and PostgREST wearing a TypeScript
 * type that nothing checked at runtime; a cast is not a guarantee. So every
 * field is proved before it is used and anything malformed degrades to absent,
 * which is the rule lib/market/store/sections.ts already keeps: a null the
 * caller falls back on costs a gateway fan-out, while a throw in here takes down
 * a render the gateway path would have survived.
 */

/** What `getHomeSnapshot` and `getSectorSnapshot` need, whatever the source. */
export type HomeInputs = {
  /* The sweep the boards rank from. Its counters are zeros rather than the
     gateway's arithmetic — see `snapshotOf` for why that is the honest value
     and not a missing one. */
  snapshot: Snapshot;
  /* True when the store returned rows it could not date. `snapshot.sweptAt`
     then reads `now`, so the boards still rank, and the caller says so in the
     fault list rather than letting an unknown age pass for a fresh one. */
  undated: boolean;
  /** Raw quotes for the index and sector strips, in the order asked for. */
  strip: RawEquityQuote[];
  /** Percent move over five sessions per sector fund; null where unmeasurable. */
  weekByEtf: Map<string, number | null>;
  /** Sector funds with no stored bars at all — the same count `shortfall` took. */
  weekFailed: number;
  wire: Array<{ ticker: string; news: RawTickerNews[] }>;
  /** Wire tickers the store had something for, readable or not. */
  wireAnswered: number;
  calendar: Array<{ ticker: string; actions: RawCorporateActions }>;
  /** Calendar tickers whose stored document was readable. */
  calendarAnswered: number;
};

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const finite = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) ? v : null;

const text = (v: unknown): string | null => (typeof v === "string" && v !== "" ? v : null);

const listOf = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

/**
 * One row of `market.quotes`, or nothing.
 *
 * Strict, and dropping rather than repairing, because every field here is a
 * `not null` column that the RPC builds by name (migration:788-803) — a row
 * missing one did not come from a healthy store, and the boards rank on exactly
 * these numbers. Repairing would be worse than dropping: a `chg` invented as 0
 * is indistinguishable from a name that closed flat, which is the precise
 * confusion `chgKnown` exists to prevent, and it would sort into the middle of
 * the gainers board rather than off it.
 *
 * `mcap`, `pe` and `asOf` are the three nullable columns, and null is a real
 * answer for each: a fund has no P/E, and screen.ts's `current` treats an
 * unstamped quote as unjudged rather than as stale.
 */
function sweepRowOf(value: unknown): SweepRow | null {
  if (!isRecord(value)) return null;

  const s = text(value.s);
  const px = finite(value.px);
  const chg = finite(value.chg);
  const vol = finite(value.vol);
  const avgVol = finite(value.avgVol);
  const dollarVol = finite(value.dollarVol);
  const relVol = finite(value.relVol);

  if (s === null || px === null || chg === null) return null;
  if (vol === null || avgVol === null || dollarVol === null || relVol === null) return null;
  if (typeof value.name !== "string" || typeof value.ex !== "string") return null;
  if (typeof value.chgKnown !== "boolean" || typeof value.delayed !== "boolean") return null;

  return {
    s,
    name: value.name,
    px,
    chg,
    chgKnown: value.chgKnown,
    vol,
    avgVol,
    dollarVol,
    relVol,
    mcap: finite(value.mcap),
    pe: finite(value.pe),
    ex: value.ex,
    asOf: finite(value.asOf),
    delayed: value.delayed,
  };
}

/**
 * The stored rows as a `Snapshot`, with counters that describe this read.
 *
 * `calls`, `failedChunks` and `missing` are zeros, and they are true ones. They
 * counted a chunked fan-out at the gateway — 276 requests, some of which fail —
 * and no such thing happened here: one RPC either answered or did not. Carrying
 * the gateway's arithmetic across would put a shortfall in the fault list that
 * nothing experienced, and `shortfall` correctly reports nothing from 0 of 0.
 *
 * `sweptAt` falls back to `now` when the store did not date the sweep, which
 * cannot happen while rows exist — both come from `market.quotes` and the
 * column is `not null` — but is worth handling all the same. `now` is the safe
 * direction: `current()` measures a row's own `asOf` against this, so an
 * undated sweep is judged against the wall clock, which is what the gateway
 * path does anyway. Zero would date the sweep to 1970 and empty every board.
 */
function snapshotOf(rows: SweepRow[], sweptAt: number | null, now: number): Snapshot {
  return {
    rows,
    sweptAt: sweptAt ?? now,
    requested: rows.length,
    calls: 0,
    failedChunks: 0,
    missing: 0,
    ms: 0,
  };
}

/* The strip, which the store keeps verbatim precisely because the normalisers
   read fields `SweepRow` drops — the 52-week range, beta, the dividend yield.
   `market.quotes.raw` is `jsonb not null`, but a JSON null satisfies that and
   the worker writes one for a symbol it could not quote, so the guard is over
   the value rather than over its presence. A quote with no symbol is unusable:
   every consumer keys on it. */
function stripOf(value: unknown): RawEquityQuote[] {
  const out: RawEquityQuote[] = [];
  for (const quote of listOf(value)) {
    if (!isRecord(quote) || text(quote.symbol) === null) continue;
    out.push(quote as unknown as RawEquityQuote);
  }
  return out;
}

/* `changeOverSessions` reads a date and a close and nothing else, so the bars
   are narrowed to those two here. A bar missing either is discarded rather than
   defaulted: the function itself already drops a non-positive price, and a date
   it cannot parse would be silently sorted to one end of the series. */
function closesOf(bars: readonly unknown[]): Array<{ date: string; price: number }> {
  const out: Array<{ date: string; price: number }> = [];
  for (const b of bars) {
    if (!isRecord(b)) continue;
    const date = text(b.date);
    const price = finite(b.price);
    if (date === null || price === null) continue;
    out.push({ date, price });
  }
  return out;
}

/**
 * The week move per sector fund, and how many funds had nothing to measure.
 *
 * market_home slices the last eleven bars out of the stored `history_daily`
 * columns (migration:821-843), which is one more than the six
 * `changeOverSessions` needs — so a fund the refresher has filled always
 * answers, and a fund it has not is absent from the object entirely.
 *
 * The two outcomes are deliberately not the same fact. An absent fund is a
 * shortfall, exactly as a rejected history call was on the gateway path, and
 * the fault list says so. A fund whose stored series is too short to span five
 * sessions is not a shortfall — the bars arrived, they simply do not answer the
 * question — and it maps to null, which the sector card already renders as a
 * dash. `weekByEtf.get(etf) ?? null` in normalize/sector.ts reads absent and
 * null identically, so both are set explicitly to keep the count honest.
 */
function weekFrom(
  value: unknown,
  sectorEtfs: readonly string[],
): { byEtf: Map<string, number | null>; failed: number } {
  const stored = isRecord(value) ? value : {};
  const byEtf = new Map<string, number | null>();
  let failed = 0;

  for (const etf of sectorEtfs) {
    const bars = stored[etf];
    if (!Array.isArray(bars)) {
      byEtf.set(etf, null);
      failed += 1;
      continue;
    }
    byEtf.set(etf, changeOverSessions(closesOf(bars), 5));
  }

  return { byEtf, failed };
}

/**
 * The wire tickers' news, and how many of them the store had heard of.
 *
 * A ticker whose `news` is null counts as ANSWERED and contributes nothing,
 * which mirrors the gateway path exactly: a fundamentals document carrying
 * `ticker_news: null` is a successful answer about a company with no news, and
 * home.ts filtered those out of `toWireItems` while still counting the fetch as
 * a success. market_home passes the null straight through (migration:846-847),
 * which is why `StoredHome.wire` declares the list nullable.
 */
function wireFrom(value: unknown): {
  items: Array<{ ticker: string; news: RawTickerNews[] }>;
  answered: number;
} {
  const items: Array<{ ticker: string; news: RawTickerNews[] }> = [];
  let answered = 0;

  for (const entry of listOf(value)) {
    if (!isRecord(entry)) continue;
    const ticker = text(entry.ticker);
    if (ticker === null) continue;
    answered += 1;
    if (!Array.isArray(entry.news)) continue;
    items.push({ ticker, news: entry.news as RawTickerNews[] });
  }

  return { items, answered };
}

/* Corporate actions, where an unreadable document is NOT an answer — the
   asymmetry with the wire above is the RPC's, not an oversight. market_home
   joins the calendar on `s.payload is not null` (migration:858-859), so a
   ticker reaching here with no document at all reached here broken, and
   `toCalendarEvents` reads `actions.dividends` and `actions.splits` off it. */
function calendarFrom(value: unknown): {
  items: Array<{ ticker: string; actions: RawCorporateActions }>;
  answered: number;
} {
  const items: Array<{ ticker: string; actions: RawCorporateActions }> = [];
  let answered = 0;

  for (const entry of listOf(value)) {
    if (!isRecord(entry)) continue;
    const ticker = text(entry.ticker);
    if (ticker === null || !isRecord(entry.actions)) continue;
    answered += 1;
    items.push({ ticker, actions: entry.actions as unknown as RawCorporateActions });
  }

  return { items, answered };
}

/**
 * A `market_home` payload, translated into what the dashboard consumes.
 *
 * `sectorEtfs` is passed rather than imported so this module stays free of the
 * universe's graph and so a test can name its own three funds; the callers
 * already hold the list — home.ts the eleven SPDRs, sector.ts the one fund
 * whose card it is drawing.
 *
 * `now` only ever dates a sweep the store could not date. Everything else here
 * is a fact about the payload.
 */
export function homeInputsFrom(
  payload: unknown,
  sectorEtfs: readonly string[],
  now: number,
): HomeInputs {
  const home = isRecord(payload) ? payload : {};

  const rows = listOf(home.rows)
    .map(sweepRowOf)
    .filter((r): r is SweepRow => r !== null);
  const sweptAt = finite(home.sweptAt);
  const week = weekFrom(home.weekBars, sectorEtfs);
  const wire = wireFrom(home.wire);
  const calendar = calendarFrom(home.calendar);

  return {
    snapshot: snapshotOf(rows, sweptAt, now),
    undated: sweptAt === null,
    strip: stripOf(home.strip),
    weekByEtf: week.byEtf,
    weekFailed: week.failed,
    wire: wire.items,
    wireAnswered: wire.answered,
    calendar: calendar.items,
    calendarAnswered: calendar.answered,
  };
}
