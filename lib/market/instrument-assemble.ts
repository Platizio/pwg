import "server-only";

import type { RawFinancials } from "../api/clients/financials.ts";
import type { RawCorporateActions, RawFundamentals } from "../api/clients/fundamentals.ts";
import type { RawEquityQuote, RawHistoryPoint } from "../api/clients/quotes.ts";
import type { RawIndicator, RawShortInterest } from "../api/clients/technicals.ts";
import type { RawArticle } from "../api/clients/news.ts";
import { toFinancialYears, type FinancialYear } from "../api/normalize/financials.ts";
import { toCompanyProfile, type CompanyProfile } from "../api/normalize/profile.ts";
import { toTechnicalRead, type TechnicalRead } from "../api/normalize/technicals.ts";
import { toAnalystAvailability, type AnalystAvailability } from "../api/normalize/analyst.ts";
import { type Returns } from "../api/normalize/returns.ts";
import { relativeAge } from "../api/normalize/time.ts";
import { toPricePoints, type PricePoint } from "../api/normalize/series.ts";
import { toStockNews } from "../api/normalize/stock-news.ts";
import { toWireItems } from "../api/normalize/wire.ts";
import { repairAgainst, returnsAgainst, splitRecord } from "./split-record.ts";
import { sessionAt, type Session } from "./session.ts";
import type { WireItem } from "./home.ts";

/* One instrument, assembled from documents that have already arrived.
 *
 * This is the second half of instrument.ts, and it was lifted out of it whole.
 * The first half is I/O — a thirteen-way fan-out, a quote retry, the rules that
 * decide whether the page exists at all, and the peers wave that cannot start
 * until the company record has named its peers. None of that can be reached by
 * `node --test`: the module imports server-only and does real network calls.
 *
 * What is left here is the judgement. Which failure degrades which panel, when
 * a figure is withheld rather than printed, what the reader is told about a
 * page that is only half there — all of it is now a pure function of documents
 * and an instant, and all of it is testable.
 *
 * The split also has a second caller waiting. The durable store hands back the
 * same raw documents from Postgres that the gateway hands back over HTTP, and
 * the entire argument for that design is that a page cannot tell which one it
 * got. That claim is only checkable if there is one assembler with two
 * callers, rather than two assemblers that drift.
 *
 * The rules this preserves, unchanged from the original:
 *
 *   - Each branch degrades on its own. A company whose filings are missing
 *     still has a price; one whose peers cannot be quoted still has filings.
 *   - Three things this account cannot supply — analyst price targets,
 *     institutional ownership, market share — are declared rather than quietly
 *     omitted, so a panel can say so instead of leaving a reader to wonder
 *     whether the company simply has no analysts.
 *   - Nothing here ever falls back to the authored figures in
 *     lib/market/instruments.ts. Those were invented, and an invented number
 *     wearing a real company's name is the one failure this layer exists to
 *     prevent.
 */

export type PeerQuote = {
  id: string;
  name: string;
  price: number | null;
  /** Move since yesterday's close, percent. */
  chg: number | null;
  /* Trailing-year return, percent, measured the same way the subject's is.
     The comparison table used to print `chg` under a "1Y return" header, so
     the subject's year sat beside every peer's day in one column. Null when
     the peer's history does not reach back a year — returnsFrom refuses to
     extrapolate one, and the table must show a dash rather than fall back to
     the day move to fill the cell. */
  ret1y: number | null;
  marketCap: number | null;
  pe: number | null;
};

export type InstrumentSnapshot = {
  profile: CompanyProfile;
  /* The exchange's own state. The header used to announce "Market open" as a
     fixed string beside a pulsing dot, on a Sunday as readily as a Tuesday. */
  session: Session;
  financials: { annual: FinancialYear[]; note: string | null };
  technical: TechnicalRead;
  shortInterest: {
    shortInterest: number | null;
    daysToCover: number | null;
    settlementDate: string | null;
  };
  returns: Returns;
  history: {
    /* Five years of daily bars, split-repaired. Every range but the day is a
       slice of this one series rather than a call of its own. */
    daily: PricePoint[];
    /** The current session's one-minute bars. Empty when the market is shut. */
    intraday: PricePoint[];
    /** Why the intraday series is empty, when it is. */
    intradayNote: string | null;
  };
  dividends: Array<{ exDate: string; amount: number; payDate: string | null }>;
  news: WireItem[];
  peers: PeerQuote[];
  /* The tracking fund's own history, so a period return can be shown beside
     the market's for the same window. No index instrument is entitled, so this
     is SPY rather than the S&P 500 itself, and the panel says so. */
  market: { symbol: string; daily: PricePoint[] } | null;
  /** The largest single-session moves in the record. */
  notableMoves: Array<{ date: string; chg: string; color: string }>;
  /* Analyst coverage, as a state rather than a claim.
     `unavailable.analystTargets` was hardcoded `true` — correct today, because
     every analyst path answers 403/4031, but it is a fact about the account
     rather than about the company, and it could not become false when the
     entitlement lifts. This carries the live answer instead, and distinguishes
     "the account cannot see this" from "nobody covers this company" from "the
     call failed and we do not know". The panel renders whichever it gets, and
     starts showing real consensus the day the door opens with no code change
     here. */
  analyst: AnalystAvailability;
  /** What this account has no entitlement for, so a panel can say so. */
  unavailable: { analystTargets: true; institutionalHolders: true; marketShare: true };
  status: "live" | "stale" | "degraded" | "down";
  note: string | null;
  /* When the store's copy of this company's record was written, or null when
     the documents came straight off the gateway. The page is served from
     Postgres on the fast path, and a reader who is being shown a record that
     was last refreshed on Friday is owed the date. */
  storedAt: string | null;
};

/** Everything the assembly needs, each piece exactly as its source hands it. */
export type InstrumentInputs = {
  ticker: string;
  /* Not nullable. Whether a page exists at all is the caller's question — a
     quote that was never answered is a thrown render, and one that says
     notFound is a 404 — and by the time the assembly runs it has been settled.
     See the reasoning at the retry in instrument.ts. */
  quote: RawEquityQuote;
  sector: string | null;
  fundamentals: RawFundamentals | null;
  financials: RawFinancials | null;
  actions: RawCorporateActions | null;
  history: RawHistoryPoint[] | null;
  /* Either the gateway's three indicator documents or the same three computed
     locally from the daily bars; see store/local-indicators.ts. */
  indicators: { rsi: RawIndicator | null; sma: RawIndicator | null; ema: RawIndicator | null };
  shortInterest: RawShortInterest | null;
  intraday: RawHistoryPoint[] | null;
  /** The tracking fund's bars, for the market comparison. */
  market: RawHistoryPoint[] | null;
  analyst: Parameters<typeof toAnalystAvailability>[0];
  articles: RawArticle[] | null;
  /* Already resolved. The wave that fills these needs `profile.peers` before
     it can ask for anything, so it runs in the caller, around profileFrom. */
  peers: PeerQuote[];
  /* Failures the caller observed that the assembly cannot see for itself —
     today only "peers". Appended after the ones found here so the note reads
     in the order it always did. */
  failures: string[];
  storedAt: string | null;
};

/* Fifteen minutes is the delayed feed's own lag, so a quote older than that is
   not merely delayed — it has stopped arriving. */
export const STALE_AFTER_MS = 15 * 60 * 1000;

export const MAX_PEERS = 8;

/* The S&P 500 tracking fund. Index instruments answer notPermissioned on this
   account, so a market comparison has to be made against the fund. */
export const MARKET_PROXY = "SPY";

const MOVE_DATE = new Intl.DateTimeFormat("en-US", {
  timeZone: "UTC",
  day: "numeric",
  month: "long",
  year: "numeric",
});

/** The largest single-session moves in the record, most recent first. */
export function largestSessions(points: PricePoint[], count = 3) {
  const moves: Array<{ at: number; chg: number }> = [];
  for (let i = 1; i < points.length; i += 1) {
    const prev = points[i - 1].price;
    if (prev > 0) moves.push({ at: points[i].at, chg: (points[i].price / prev - 1) * 100 });
  }
  return moves
    .sort((a, b) => Math.abs(b.chg) - Math.abs(a.chg))
    .slice(0, count)
    .sort((a, b) => b.at - a.at)
    .map((m) => ({
      date: MOVE_DATE.format(m.at),
      chg: `${m.chg >= 0 ? "+" : "−"}${Math.abs(m.chg).toFixed(2)}%`,
      color: m.chg >= 0 ? "#7dd3a0" : "#e0796b",
    }));
}

export const value = <T,>(s: PromiseSettledResult<T>, fallback: T): T =>
  s.status === "fulfilled" ? s.value : fallback;

/* Structural rather than tied to ApiResult, so one helper serves every client
   in the fan-out without a cast per call site. */
export const dataOf = <T,>(r: { ok: true; data: T } | { ok: false } | undefined): T | null =>
  r !== undefined && r.ok ? r.data : null;

/**
 * The company profile, which the peers wave needs before it can run.
 *
 * Exported so the caller can compute it once, resolve `profile.peers`, and
 * hand the resolved rows back to `assembleInstrument` — which recomputes the
 * profile from the same inputs and therefore gets the same one. Cheap: it is a
 * field-by-field read of two documents already in memory.
 */
export function profileFrom(inputs: InstrumentInputs): CompanyProfile {
  return toCompanyProfile({
    ticker: inputs.ticker,
    quote: inputs.quote,
    fundamentals: inputs.fundamentals ?? undefined,
    sector: inputs.sector,
  });
}

export function assembleInstrument(inputs: InstrumentInputs, now: number): InstrumentSnapshot {
  const { ticker } = inputs;
  const failures: string[] = [];

  const fundamentals = inputs.fundamentals;
  if (!fundamentals) failures.push("company record");

  const profile = profileFrom(inputs);

  /* ---- filings ---- */
  const annual = inputs.financials ? toFinancialYears(inputs.financials) : [];
  if (annual.length === 0) failures.push("filings");

  /* ---- history, split-repaired before anything is measured ---- */
  const actions = inputs.actions;

  /* A company with no splits and a corporate-actions call that failed used
     to be the same value here, and they are opposites: the first says the
     raw series needs no repair, the second says we cannot know whether it
     does. See lib/market/split-record.ts — Netflix shipped a −93.3% year
     off an unapplied ten-for-one split on the strength of that conflation. */
  const record = splitRecord(actions);
  if (!record.readable) failures.push("corporate actions");

  const rawHistory = inputs.history;
  const series = rawHistory ? repairAgainst(rawHistory, record) : [];
  if (series.length === 0) failures.push("price history");

  const daily = toPricePoints(series);

  const intraday = inputs.intraday ? toPricePoints(inputs.intraday) : [];
  const marketDaily = inputs.market ? toPricePoints(inputs.market) : [];

  /* The peers wave has already run in the caller — it needs profile.peers to
     start, and it is the one part of the assembly that does its own I/O. */
  failures.push(...inputs.failures);

  /* ---- the rest ---- */
  const short = inputs.shortInterest?.results?.[0];

  /* Both feeds, ranked as one list. toWireItems has already dropped anything
     the gateway's own reasoning marks as a mention, and toStockNews scores
     the second source on its concepts, dedupes the syndicated copies the two
     share, caps any one publisher and takes the best three.

     In a RENDER the second feed is now always absent: `articles` is null on
     both of instrument.ts's paths, because newsapi.ai cost a cold page more
     than the database read and the React render together and it is fetched by
     the browser instead. toStockNews handles the empty pool without a special
     case — nothing is contributed, and the gateway items are still ranked,
     deduped and capped exactly as they would have been among a wider field —
     so this call is unchanged and stays the single definition of the rail.
     app/api/stock-news/[ticker] makes the same call with both halves filled,
     and the rail swaps its list for that one. */
  const gatewayNews = toWireItems(
    fundamentals?.ticker_news?.length ? [{ ticker, news: fundamentals.ticker_news }] : [],
    now,
    8,
  );
  const articles = inputs.articles ?? [];
  const news = toStockNews(gatewayNews, articles, ticker, now, 3);

  const dividends = (actions?.dividends ?? [])
    .filter((d) => d.cash_amount > 0 && d.ex_dividend_date)
    .slice(0, 6)
    .map((d) => ({ exDate: d.ex_dividend_date, amount: d.cash_amount, payDate: d.pay_date }));

  const aged = profile.asOf !== null && now - profile.asOf > STALE_AFTER_MS;
  const status: InstrumentSnapshot["status"] =
    failures.length >= 3 ? "degraded" : profile.delayed || aged ? "stale" : "live";

  const note =
    status === "degraded"
      ? `Some of this company's record is unavailable: ${failures.join(", ")}.`
      : status === "stale"
        ? `Quotes run fifteen minutes behind${
            profile.asOf === null ? "" : `; the last tick arrived ${relativeAge(profile.asOf, now)}`
          }.`
        : null;

  return {
    profile,
    /* One clock for the whole snapshot. This used to read nowSeconds() beside
       the nowMs() the rest of the assembly used; they are two cache() entries
       and could in principle disagree, and the page has no use for two
       different nows. */
    session: sessionAt(Math.floor(now / 1000)),
    financials: {
      annual,
      note: annual.length === 0 ? "No filings are available for this company." : null,
    },
    technical: toTechnicalRead({
      rsi: inputs.indicators.rsi,
      sma: inputs.indicators.sma,
      ema: inputs.indicators.ema,
      price: profile.price,
      low52: profile.low52,
      high52: profile.high52,
    }),
    shortInterest: {
      shortInterest: short?.short_interest ?? null,
      daysToCover: short?.days_to_cover ?? null,
      settlementDate: short?.settlement_date ?? null,
    },
    /* Measured from the raw series rather than the repaired one, so the
       repair and the measurement cannot come apart: returnsAgainst does
       both, or neither. The chart below keeps its bars either way. */
    returns: returnsAgainst(rawHistory ?? [], record),
    history: {
      daily,
      intraday,
      intradayNote:
        intraday.length > 0
          ? null
          : "No trades yet this session. The day view fills when the market opens.",
    },
    dividends,
    news,
    peers: inputs.peers,
    market: marketDaily.length ? { symbol: MARKET_PROXY, daily: marketDaily } : null,
    /* An unapplied ten-for-one split is a −90% session, and it would top
       this list every time — the one figure on the page most likely to be
       a split break is the one this picks out. Withheld with the returns. */
    notableMoves: record.readable ? largestSessions(daily) : [],
    analyst: toAnalystAvailability(inputs.analyst, profile.price),
    unavailable: { analystTargets: true, institutionalHolders: true, marketShare: true },
    status,
    note,
    storedAt: inputs.storedAt,
  };
}
