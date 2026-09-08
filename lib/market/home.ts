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
import { newest, oldest, quoteAge, type Freshness } from "@/lib/market/freshness";
import { breadthSample } from "@/lib/market/membership";
import { baselineSnapshot, describeBaseline } from "@/lib/market/baseline";
import { nowMs, nowSeconds } from "@/lib/market/clock";
import { eligibleRows, gainers, losers, mostActive, popular } from "@/lib/market/screen";
import { sessionAt } from "@/lib/market/session";
import { type Fault, shortfall } from "./health.ts";
import {
  CALENDAR_TICKERS,
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

/* How many names the tape carries.
 *
 * The strip renders its rows twice and translates by half its own width, so
 * the loop is seamless but the *contents* repeat once per cycle regardless.
 * What decides whether that repeat is noticed is how long a name is off-screen
 * before it comes round again, and with the six covered symbols it was a few
 * seconds — the tape read as the same handful of tickers cycling rather than
 * as a market. Two dozen is comfortably wider than any viewport at this cell
 * size, which puts a full traversal between one sighting of a symbol and the
 * next. It is also well inside the eligible pool on any ordinary day, so the
 * tape does not run short. */
const TAPE_LENGTH = 24;

export type IndexView = {
  index: MarketIndex;
  /* Four buckets, and they sum to `total`. `unreported` is the names the
     gateway priced but sent no change for; folding them into `flat` overstated
     how still the day was and left the card's arithmetic visibly broken. */
  breadth: { total: number; up: number; down: number; flat: number; unreported: number };
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
  /* How much this article is about `ticker`, 0..1, from
     lib/api/normalize/relevance.ts. Carried so the rail can rank on it rather
     than on recency alone — a fresher roundup used to outrank real coverage. */
  relevance?: number;
  /* How much the story bears on the price, 0..1, from
     lib/api/normalize/market-impact.ts. Relevance answers "is this about the
     company" and is necessary but not sufficient: "Apple Maps Renames Lake
     Ontario" is unimpeachably about Apple and worth nothing to somebody
     deciding whether to hold it. The rail ranks on both. */
  impact?: number;
  /** What kind of event it looks like — "earnings", "leadership", "none". */
  impactKind?: string;
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
    /* Severity-tagged, because "the terminal is showing week-old prices" and
       "one sector card lost its week column" used to be the same bit. */
    faults: Fault[];
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

/* newest / oldest / quoteAge live in lib/market/freshness.ts, which is pure and
   therefore reachable by node --test. Nothing in this file is: it imports
   server-only and resolves through the @/ alias, which is why the badge below
   went years without a test. */

const stampOf = (q: RawEquityQuote): number | null => {
  const at = q.updateTime === null ? Number.NaN : Date.parse(q.updateTime);
  return Number.isFinite(at) ? at : null;
};

/* Dated by the oldest quote in the group, for the reason in freshness.ts: this
   feeds the index strip's badge and the sector cards' badge, and a badge drawn
   from the freshest member describes the one member rather than the card. */
const rawAge = (quotes: readonly RawEquityQuote[]): Freshness => ({
  at: oldest(quotes.map(stampOf)),
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
  const faults: Fault[] = [];

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
  if (swept === null) faults.push({ severity: "fatal", message: "sweep: no snapshot returned" });
  else {
    const chunks = shortfall("sweep chunks", swept.failedChunks, swept.calls);
    if (chunks) faults.push(chunks);
  }

  /* A live sweep, else the committed baseline, else nothing.

     The baseline is real data that was once true, so it renders — flagged
     stale and dated. What never happens is a fall back to the seeded quotes in
     session.ts: those were invented, and an invented price wearing a real
     company's name is the one failure mode this layer exists to prevent. */
  const fallback = swept === null || swept.rows.length === 0 ? baselineSnapshot() : null;
  /* Fatal: every price on the page is a committed snapshot, not the market. */
  if (fallback !== null)
    faults.push({ severity: "fatal", message: "sweep: serving the committed baseline" });

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
    /* Fatal: the index strip and every sector card lose their quote. */
    faults.push({ severity: "fatal", message: `index and sector fund quotes failed${why}` });
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
  const weekFault = shortfall("week history", week.failed, SECTOR_ETF_SYMBOLS.length);
  if (weekFault) faults.push(weekFault);

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
  /* Fatal, and a deployment fault rather than an upstream one: the sector map
     is a committed file, so an empty one means the build shipped wrong. */
  if (classified === 0 && universe.length > 0)
    faults.push({ severity: "fatal", message: "sector map is empty" });

  /* ---- the wire ---- */
  const news = settledOr(newsSettled, { rows: [], failed: WIRE_TICKERS.length });
  const newsFault = shortfall("ticker news", news.failed, WIRE_TICKERS.length);
  if (newsFault) faults.push(newsFault);

  const wire = toWireItems(
    news.rows
      .filter((r) => r.data.ticker_news !== null)
      .map((r) => ({ ticker: r.ticker, news: r.data.ticker_news ?? [] })),
    now,
    8,
  );

  /* ---- dated corporate actions ---- */
  const actions = settledOr(actionsSettled, { rows: [], failed: CALENDAR_TICKERS.length });
  const actionsFault = shortfall("corporate actions", actions.failed, CALENDAR_TICKERS.length);
  if (actionsFault) faults.push(actionsFault);

  const events = toCalendarEvents(
    actions.rows.map((r) => ({ ticker: r.ticker, actions: r.data })),
    now,
    5,
  );

  /* ---- the tape ---- */
  /* The most traded names by dollar volume, which is what a real tape shows.
     It used to be COVERED — the six symbols with instrument pages — so the
     strip along the top of the page was a menu of this site's own coverage
     wearing a ticker's clothes, and it said the same six things every day
     whatever the market did.
     mostActive() is deliberately not filtered by direction here: a tape
     reports what changed hands, and a name down eight percent on record
     turnover is one of the truest things it can say. Screening for green
     would make this a second gainers board with a marquee on it. */
  const tapeRows = mostActive(s, TAPE_LENGTH);
  const tape: TapeRow[] = tapeRows.map((r) => ({ id: r.s, price: r.px, chg: r.chg }));

  /* ---- the dateline ---- */
  /* The dateline answers "when did anything last arrive", which is a question
     about the connection rather than about a card — so it reads the newest
     stamp anywhere, and must not be built from quoteAge/rawAge now that those
     two report their group's oldest. */
  const freshestQuote = newest([
    newest(universe.map((r) => r.asOf ?? null)),
    newest(stripQuotes.map(stampOf)),
  ]);
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
        tape.length < TAPE_LENGTH
          ? `Only ${tape.length} names cleared the liquidity floor, so the tape is short.`
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
    /* Wanted is the full twelve now, where it used to be one. Under the old
       relative-volume screen a short ribbon was usually just a quiet market,
       so demanding twelve would have cried wolf on ordinary days. A curated
       list carries no such excuse: these names trade every session, and any
       one of them missing means the feed did not price it. That is worth
       saying out loud rather than hiding behind a shorter strip. */
    popular: board(popularRows, 12, thin(popularRows.length, 12)),

    sectors: panelOf({
      data: sectors,
      empty: sectors.length === 0 || sectorQuotes.length === 0,
      now,
      fresh: rawAge(sectorQuotes),
      /* Passed as the baseline rather than folded into `degraded`, which is what
         every other board does. Smuggled through `degraded` it lost to the
         coverage caveat whenever that fired, so on a cold start the sector cards
         alone dropped the sentence naming the date their figures came from —
         and were badged "Partial" while the boards beside them said "Delayed"
         off the same stale sweep. */
      baseline: fromBaseline ? sweepNote : null,
      degraded:
        coverage < SECTOR_COVERAGE_FLOOR
          ? `Sectors are assigned to ${classified} of the ${operatingCount} companies quoted here; ` +
            "the fund's move covers the whole sector, the names below only those."
          : null,
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
      faults,
    },
  };
});
