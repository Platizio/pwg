import "server-only";
import { cache } from "react";

import { getCorporateActions, getFundamentals } from "@/lib/api/cache-layer";
import { fetchHistory, fetchQuotes } from "@/lib/api/clients/quotes";
import { toCalendarEvents } from "@/lib/api/normalize/calendar";
import { INDEX_ETF_SYMBOLS, toIndexView } from "@/lib/api/normalize/index-proxy";
import { toQuote, toQuotes } from "@/lib/api/normalize/quote";
import { SECTOR_ETF_SYMBOLS, toSectorGroups } from "@/lib/api/normalize/sector";
import { changeOverSessions, relativeAge } from "@/lib/api/normalize/time";
import { toWireItems } from "@/lib/api/normalize/wire";
import { runSweep } from "@/lib/api/sweep";
import { TAGS, TTL } from "@/lib/api/ttl";
import { breadthSample } from "@/lib/market/membership";
import { baselineSnapshot, describeBaseline } from "@/lib/market/baseline";
import { nowMs, nowSeconds } from "@/lib/market/clock";
import { eligibleRows, gainers, losers, mostActive, popular } from "@/lib/market/screen";
import { sessionAt } from "@/lib/market/session";
import {
  CALENDAR_TICKERS,
  COVERED,
  INDEX_IDS,
  INDEX_PROXY,
  isFund,
  SECTOR_NAMES,
  WIRE_TICKERS,
} from "@/lib/market/universe";
import sectorMap from "@/lib/market/data/sector-map.json" with { type: "json" };

import type { RawEquityQuote } from "@/lib/api/clients/quotes";
import type { ApiResult } from "@/lib/api/errors";
import type { Snapshot, SweepRow } from "@/lib/api/sweep";
import type { CalendarEvent, MarketIndex, Quote, Sector, Session } from "@/lib/market/session";
import type { SectorName } from "@/lib/market/universe";

/* The home page, assembled once per request.

   Everything the dashboard renders is gathered here and handed down as plain
   data, for two reasons. The tree below app/(terminal)/layout.tsx is a client
   tree — PortfolioProvider sits above every route — so nothing inside it can
   fetch. And nothing inside it may read a clock either: the mock was built
   around a fixed ANCHOR precisely so that the server and the browser render
   identical bytes, and a Date.now() down there is a hydration failure. Time
   enters in one place, lib/market/clock.ts, and leaves this module as a
   pre-formatted string.

   The other rule is that this function does not throw. Every upstream is
   awaited through allSettled, and a panel whose source died renders as an
   empty card with an honest line in it. It never falls back to the seeded
   mock: a plausible wrong price is worse than a blank one. */

export type PanelStatus = "live" | "stale" | "degraded" | "down";

export type Panel<T> = {
  status: PanelStatus;
  data: T;
  /** ISO timestamp of the freshest figure behind this panel. */
  asOf: string | null;
  /** A short sentence for the reader whenever status is not "live". */
  note: string | null;
};

export type TapeRow = { id: string; price: number; chg: number };

export type IndexView = {
  index: MarketIndex;
  breadth: { total: number; up: number; down: number };
  leaders: Quote[];
  laggards: Quote[];
  /* How the breadth figures were drawn. Carried in the data rather than
     written into the component, because the count changes with the sweep and
     the wording must never harden into a claim of index membership. */
  sample: { size: number; basis: string };
  /** The fund the level actually belongs to, so the figure can name itself. */
  proxyTicker: string;
};

export type SectorGroup = Sector & {
  members: Quote[];
  total: number;
  /* The members' own turnover-weighted move. The headline `day` is the sector
     fund's; these are different measures and the card says which is which. */
  membersChg: number;
  basis: string;
};

export type WireItem = {
  id: string;
  source: string;
  title: string;
  summary: string;
  url: string;
  ticker: string;
  company: string;
  mark: string;
  color: string;
  /** Pre-formatted for display, e.g. "3h ago". */
  time: string;
  /** Hours, for sorting. */
  age: number;
  /** Section label, e.g. "Markets". */
  tag: string;
  sentiment: "positive" | "neutral" | "negative" | null;
};

export type HomeSnapshot = {
  session: Session;
  tape: Panel<TapeRow[]>;
  indices: Panel<IndexView[]>;
  gainers: Panel<Quote[]>;
  losers: Panel<Quote[]>;
  mostActive: Panel<Quote[]>;
  popular: Panel<Quote[]>;
  sectors: Panel<SectorGroup[]>;
  events: Panel<CalendarEvent[]>;
  wire: Panel<WireItem[]>;
  /** Every eligible name — the corpus the search box reads. */
  universe: Quote[];
  diagnostics: {
    calls: number;
    ms: number;
    sweptAt: string;
    rows: number;
    eligible: number;
    failures: string[];
  };
};

/* ------------------------------------------------------------------ */
/* The sector map                                                      */
/* ------------------------------------------------------------------ */

type SectorMapFile = {
  builtAt: string;
  classified: number;
  sectors: Record<string, string>;
  logos: Record<string, string>;
};

/* A static JSON import cannot be wrapped in a try/catch — an absent file is a
   build error rather than a runtime one — so the guard is over the shape. The
   map is generated offline from SIC codes and a render can land while it is
   half-built, in which case the unclassified names still quote and rank; they
   simply do not appear on a sector card. */
const SECTOR_FILE = sectorMap as Partial<SectorMapFile>;
const SECTOR_BY_TICKER: Record<string, string> = SECTOR_FILE.sectors ?? {};

const sectorOf = (ticker: string): string | null => SECTOR_BY_TICKER[ticker] ?? null;

/* Below this the sector weights stop describing the market and start
   describing the part of it that happens to have been classified. */
const SECTOR_COVERAGE_FLOOR = 0.9;

/* ------------------------------------------------------------------ */
/* Panels                                                              */
/* ------------------------------------------------------------------ */

const HOUR_MS = 3_600_000;

/** A quote counts as stale once it is older than the feed's own delay. */
const STALE_AFTER_MS = 15 * 60 * 1000;

/* `ages` separates the two kinds of timestamp on the page. A quote goes off:
   fifteen minutes on and it is history. A dividend date or a headline does
   not, so its stamp is shown and never judged. */
type Freshness = { at: number | null; delayed: boolean; ages: boolean };

function newest(stamps: Array<number | null>): number | null {
  let latest: number | null = null;
  for (const at of stamps) {
    if (at !== null && (latest === null || at > latest)) latest = at;
  }
  return latest;
}

const quoteAge = (rows: ReadonlyArray<{ asOf?: number | null; delayed?: boolean }>): Freshness => ({
  at: newest(rows.map((r) => r.asOf ?? null)),
  delayed: rows.some((r) => r.delayed === true),
  ages: true,
});

const stampOf = (q: RawEquityQuote): number | null => {
  const at = q.updateTime === null ? Number.NaN : Date.parse(q.updateTime);
  return Number.isFinite(at) ? at : null;
};

const rawAge = (quotes: readonly RawEquityQuote[]): Freshness => ({
  at: newest(quotes.map(stampOf)),
  delayed: quotes.some((q) => q.delayed),
  ages: true,
});

/** For dated records: a timestamp worth showing, no staleness verdict. */
const recordAge = (at: number | null): Freshness => ({ at, delayed: false, ages: false });

function panelOf<T>(args: {
  data: T;
  /** True only when there is nothing to show and the reason is upstream. */
  empty: boolean;
  now: number;
  fresh: Freshness;
  /** Set when the panel is present but knowingly incomplete. */
  degraded?: string | null;
  downNote: string;
  /* Drawn from the committed baseline rather than a live sweep. Never "live",
     whatever the timestamps say, because the figures are as old as the file. */
  baseline?: string | null;
}): Panel<T> {
  if (args.baseline && !args.empty) {
    return {
      status: "stale",
      data: args.data,
      asOf: args.fresh.at === null ? null : new Date(args.fresh.at).toISOString(),
      note: args.baseline,
    };
  }
  const { data, empty, now, fresh, degraded, downNote } = args;
  if (empty) return { status: "down", data, asOf: null, note: downNote };

  const asOf = fresh.at === null ? null : new Date(fresh.at).toISOString();
  if (degraded) return { status: "degraded", data, asOf, note: degraded };

  const aged = fresh.at !== null && now - fresh.at > STALE_AFTER_MS;
  if (fresh.ages && (fresh.delayed || aged)) {
    return {
      status: "stale",
      data,
      asOf,
      note:
        fresh.at === null
          ? "The quote feed is running behind."
          : `Quotes run fifteen minutes behind; the last tick arrived ${relativeAge(fresh.at, now)}.`,
    };
  }

  return { status: "live", data, asOf, note: null };
}

/* ------------------------------------------------------------------ */
/* Fan-outs                                                            */
/* ------------------------------------------------------------------ */

/** The value, or the stand-in when the branch rejected outright. */
const settledOr = <T>(outcome: PromiseSettledResult<T>, fallback: T): T =>
  outcome.status === "fulfilled" ? outcome.value : fallback;

/** One call per ticker, keeping the ticker attached to whatever came back. */
async function perTicker<T>(
  tickers: readonly string[],
  call: (ticker: string) => Promise<ApiResult<T>>,
): Promise<{ rows: Array<{ ticker: string; data: T }>; failed: number }> {
  const settled = await Promise.allSettled(
    tickers.map(async (ticker) => ({ ticker, result: await call(ticker) })),
  );

  const rows: Array<{ ticker: string; data: T }> = [];
  let failed = 0;

  for (const outcome of settled) {
    if (outcome.status === "fulfilled" && outcome.value.result.ok) {
      rows.push({ ticker: outcome.value.ticker, data: outcome.value.result.data });
    } else {
      failed += 1;
    }
  }

  return { rows, failed };
}

/* The week move is sliced out of the one-month series rather than fetched: the
   gateway rejects the "5d" range outright, and a month of daily closes is the
   shortest thing it will sell that contains five sessions. */
async function weekChanges(): Promise<{ byEtf: Map<string, number | null>; failed: number }> {
  const settled = await Promise.allSettled(
    SECTOR_ETF_SYMBOLS.map(async (etf) => ({
      etf,
      result: await fetchHistory(etf, "1m", TTL.history1m, [TAGS.history]),
    })),
  );

  const byEtf = new Map<string, number | null>();
  let failed = 0;

  for (const outcome of settled) {
    if (outcome.status !== "fulfilled") {
      failed += 1;
      continue;
    }
    const { etf, result } = outcome.value;
    if (!result.ok) {
      failed += 1;
      byEtf.set(etf, null);
      continue;
    }
    byEtf.set(etf, changeOverSessions(result.data, 5));
  }

  return { byEtf, failed };
}

/* ------------------------------------------------------------------ */
/* The assembler                                                       */
/* ------------------------------------------------------------------ */

export const getHomeSnapshot = cache(async (): Promise<HomeSnapshot> => {
  const startedAt = Date.now();
  const now = nowMs();
  const failures: string[] = [];

  /* Three index funds and eleven sector funds is fourteen symbols, well inside
     the gateway's fifty-symbol cap, so both strips cost one request. */
  const strip = [...INDEX_ETF_SYMBOLS, ...SECTOR_ETF_SYMBOLS];

  const [sweepSettled, stripSettled, weekSettled, newsSettled, actionsSettled] =
    await Promise.allSettled([
      runSweep(),
      fetchQuotes(strip, TTL.indexEtf, [TAGS.indices]),
      weekChanges(),
      perTicker(WIRE_TICKERS, getFundamentals),
      perTicker(CALENDAR_TICKERS, getCorporateActions),
    ]);

  /* ---- the sweep, which every board is drawn from ---- */
  const swept = settledOr(sweepSettled, null);
  if (swept === null) failures.push("sweep: no snapshot returned");
  else if (swept.failedChunks > 0) failures.push(`sweep: ${swept.failedChunks} chunks failed`);

  /* A live sweep, else the committed baseline, else nothing.

     The baseline is real data that was once true, so it renders — flagged
     stale and dated. What never happens is a fall back to the seeded quotes in
     session.ts: those were invented, and an invented price wearing a real
     company's name is the one failure mode this layer exists to prevent. */
  const fallback = swept === null || swept.rows.length === 0 ? baselineSnapshot() : null;
  if (fallback !== null) failures.push("sweep: serving the committed baseline");

  const s: Snapshot = swept?.rows.length
    ? swept
    : (fallback ?? {
        rows: [],
        sweptAt: now,
        requested: 0,
        calls: 0,
        failedChunks: 0,
        missing: 0,
        ms: 0,
      });

  const fromBaseline = fallback !== null && s.rows.length > 0;
  const dead = s.rows.length === 0;
  const sweepNote = fromBaseline
    ? describeBaseline()
    : s.failedChunks > 0
      ? `${s.failedChunks} of ${s.calls} sweep requests failed; this is drawn from what returned.`
      : null;

  const eligible = eligibleRows(s);
  const universe = toQuotes(eligible, sectorOf);
  const asQuote = (row: SweepRow): Quote => toQuote(row, sectorOf(row.s));

  const rowBySymbol = new Map(s.rows.map((r) => [r.s, r]));
  const exchangeOf = new Map(s.rows.map((r) => [r.s, r.ex]));

  /* ---- the strip ---- */
  const stripResult = settledOr(stripSettled, null);
  const stripQuotes: RawEquityQuote[] =
    stripResult !== null && stripResult.ok ? stripResult.data : [];
  if (stripQuotes.length === 0) {
    const why = stripResult !== null && !stripResult.ok ? `: ${stripResult.error}` : "";
    failures.push(`index and sector fund quotes failed${why}`);
  }
  const stripBySymbol = new Map(stripQuotes.map((q) => [q.symbol, q]));

  /* ---- indices ---- */
  const indexQuotes = INDEX_IDS.map((id) => stripBySymbol.get(INDEX_PROXY[id].etf)).filter(
    (q): q is RawEquityQuote => q !== undefined,
  );

  const indices: IndexView[] = [];
  for (const id of INDEX_IDS) {
    const view = toIndexView(
      id,
      stripBySymbol.get(INDEX_PROXY[id].etf),
      breadthSample(
        id,
        universe,
        (ticker) => rowBySymbol.get(ticker)?.mcap ?? 0,
        (ticker) => exchangeOf.get(ticker) ?? "",
      ),
    );
    if (view !== null) indices.push(view);
  }

  /* ---- sectors ---- */
  const week = settledOr(weekSettled, {
    byEtf: new Map<string, number | null>(),
    failed: SECTOR_ETF_SYMBOLS.length,
  });
  if (week.failed > 0) {
    failures.push(`week history: ${week.failed} of ${SECTOR_ETF_SYMBOLS.length} failed`);
  }

  /* Eleven passes over the eligible list, which is cheaper than it looks and
     spares the map a cast from an unvalidated sector string. */
  /* Funds are held out here as well as from the boards. A leveraged ETF can
     carry a SIC code, and would otherwise sit inside a sector card beside the
     operating companies whose move it is levering: "Leverage Shares 2x Long
     CRCL Daily ETF" is not an industrial. */
  const operating = universe.filter((q) => !isFund(q.name));
  const membersBySector = new Map<SectorName, Quote[]>(
    SECTOR_NAMES.map((name) => [name, operating.filter((q) => q.sector === name)]),
  );

  const sectorEtfSet = new Set(SECTOR_ETF_SYMBOLS);
  const sectorQuotes = stripQuotes.filter((q) => sectorEtfSet.has(q.symbol));
  /* A sector card shows four names, so four names is what crosses the wire —
     plus a little headroom. `total` still counts every member, because that is
     what "View all N" promises, and the sector page fetches its own rows.
     Sending all thirteen hundred classified quotes instead put a megabyte of
     JSON into the document for the sake of forty-four visible rows. */
  const SECTOR_MEMBERS_SENT = 8;
  const sectors = toSectorGroups({
    etfQuotes: sectorQuotes,
    weekByEtf: week.byEtf,
    membersBySector,
  }).map((group) => ({ ...group, members: group.members.slice(0, SECTOR_MEMBERS_SENT) }));

  /* The search corpus is the one list the browser genuinely needs in full, and
     it is also the largest. It ships stripped of the fields the combobox never
     reads — seed, sector, volume, turnover, staleness — and capped at the most
     liquid names, which is every company a reader is plausibly typing. The
     long tail stays reachable through /aes/api/quotes/search when that lands. */
  const SEARCH_CORPUS_LIMIT = 900;
  const searchUniverse: Quote[] = [...eligible]
    .sort((a, b) => b.px * b.avgVol - a.px * a.avgVol)
    .slice(0, SEARCH_CORPUS_LIMIT)
    .map((r) => {
      const q = asQuote(r);
      return {
        id: q.id,
        name: q.name,
        mark: q.mark,
        color: q.color,
        price: q.price,
        chg: q.chg,
        seed: q.seed,
        sector: q.sector,
        covered: q.covered,
      };
    });

  /* Coverage is measured against operating companies, not the whole universe.
     A third of the eligible names are funds, which have no business of their
     own to classify and correctly carry no sector; counting them as
     unclassified understated the map by twenty points and invited someone to
     go looking for a gap that was not there. */
  const operatingCount = universe.reduce((n, q) => (isFund(q.name) ? n : n + 1), 0);
  const classified = universe.reduce((n, q) => (q.sector === "" ? n : n + 1), 0);
  const coverage = operatingCount === 0 ? 0 : classified / operatingCount;
  if (classified === 0 && universe.length > 0) failures.push("sector map is empty");

  /* ---- the wire ---- */
  const news = settledOr(newsSettled, { rows: [], failed: WIRE_TICKERS.length });
  if (news.failed > 0) failures.push(`ticker news: ${news.failed} of ${WIRE_TICKERS.length} failed`);

  const wire = toWireItems(
    news.rows
      .filter((r) => r.data.ticker_news !== null)
      .map((r) => ({ ticker: r.ticker, news: r.data.ticker_news ?? [] })),
    now,
    8,
  );

  /* ---- dated corporate actions ---- */
  const actions = settledOr(actionsSettled, { rows: [], failed: CALENDAR_TICKERS.length });
  if (actions.failed > 0) {
    failures.push(`corporate actions: ${actions.failed} of ${CALENDAR_TICKERS.length} failed`);
  }

  const events = toCalendarEvents(
    actions.rows.map((r) => ({ ticker: r.ticker, actions: r.data })),
    now,
    5,
  );

  /* ---- the tape ---- */
  const tapeRows = COVERED.map((t) => rowBySymbol.get(t)).filter(
    (r): r is SweepRow => r !== undefined,
  );
  const tape: TapeRow[] = tapeRows.map((r) => ({ id: r.s, price: r.px, chg: r.chg }));

  /* ---- the dateline ---- */
  const freshestQuote = newest([quoteAge(universe).at, rawAge(stripQuotes).at]);
  const session: Session = {
    ...sessionAt(nowSeconds()),
    /* session.ts ships a fixed "2s ago" and says in its own comment that the
       shape is what matters and a live feed fills it in. This is that. */
    lastTick: freshestQuote === null ? "—" : relativeAge(freshestQuote, now),
    delayed: tapeRows.some((r) => r.delayed) || stripQuotes.some((q) => q.delayed),
    feedSource: stripQuotes.find((q) => q.source !== null)?.source ?? undefined,
  };

  const thin = (n: number, wanted: number) =>
    `Only ${n} of ${wanted} names cleared the liquidity floor.`;

  const board = (rows: Quote[], wanted: number, short: string): Panel<Quote[]> =>
    panelOf({
      data: rows,
      empty: dead,
      now,
      fresh: quoteAge(rows),
      degraded: rows.length < wanted ? short : null,
      baseline: fromBaseline ? sweepNote : null,
      downNote: "Quotes are unavailable; this board fills when the feed returns.",
    });

  const gainerRows = gainers(s, 5).map(asQuote);
  const loserRows = losers(s, 5).map(asQuote);
  const activeRows = mostActive(s, 5).map(asQuote);
  const popularRows = popular(s, 12).map(asQuote);

  return {
    session,

    tape: panelOf({
      data: tape,
      empty: tape.length === 0,
      now,
      fresh: quoteAge(tapeRows),
      degraded:
        tape.length < COVERED.length
          ? `${COVERED.length - tape.length} of the covered names are not quoting.`
          : null,
      downNote: "The tape is offline.",
    }),

    indices: panelOf({
      data: indices,
      empty: indices.length === 0,
      now,
      fresh: rawAge(indexQuotes),
      degraded:
        indices.length < INDEX_IDS.length
          ? `${indices.length} of ${INDEX_IDS.length} index funds are quoting.`
          : null,
      downNote: "The index funds are not quoting, so there is no level to show.",
    }),

    gainers: board(gainerRows, 5, thin(gainerRows.length, 5)),
    losers: board(loserRows, 5, thin(loserRows.length, 5)),
    mostActive: board(activeRows, 5, thin(activeRows.length, 5)),
    /* Wanted is one rather than twelve: the ribbon is a relative-volume filter,
       so a short list is usually the market being quiet, not the feed failing. */
    popular: board(
      popularRows,
      1,
      "No name is trading at unusual volume just now; the ribbon fills when one is.",
    ),

    sectors: panelOf({
      data: sectors,
      empty: sectors.length === 0 || sectorQuotes.length === 0,
      now,
      fresh: rawAge(sectorQuotes),
      degraded:
        coverage < SECTOR_COVERAGE_FLOOR
          ? `Sectors are assigned to ${classified} of the ${operatingCount} companies quoted here; ` +
            "the fund's move covers the whole sector, the names below only those."
          : sweepNote,
      downNote: "The sector funds are not quoting.",
    }),

    events: panelOf({
      data: events,
      empty: events.length === 0,
      now,
      fresh: recordAge(null),
      degraded:
        actions.failed > 0
          ? `${actions.failed} of ${CALENDAR_TICKERS.length} companies did not answer.`
          : null,
      downNote: "No dated corporate actions are available.",
    }),

    wire: panelOf({
      data: wire,
      empty: wire.length === 0,
      now,
      /* WireItem carries an age in hours rather than a timestamp, so the
         published time is arrived at backwards. */
      fresh: recordAge(newest(wire.map((item) => now - item.age * HOUR_MS))),
      degraded:
        news.failed > 0 ? `${news.failed} of ${WIRE_TICKERS.length} newsfeeds did not answer.` : null,
      downNote: "The wire is quiet — no headlines could be retrieved.",
    }),

    universe: searchUniverse,

    diagnostics: {
      /* What this render costs upstream with a cold cache: the sweep's chunks,
         the one strip call, a month of history per sector fund, and two
         reference calls for each covered name. */
      calls: s.calls + 1 + SECTOR_ETF_SYMBOLS.length + WIRE_TICKERS.length + CALENDAR_TICKERS.length,
      ms: Date.now() - startedAt,
      sweptAt: new Date(s.sweptAt).toISOString(),
      rows: s.rows.length,
      eligible: eligible.length,
      failures,
    },
  };
});
