import "server-only";
import { cache } from "react";

import {
  fetchHistory,
  fetchIntraday,
  fetchQuotes,
  type RawEquityQuote,
  type RawHistoryPoint,
} from "@/lib/api/clients/quotes";
import { fetchIndicator, fetchShortInterest } from "@/lib/api/clients/technicals";
import {
  getCorporateActions,
  getFinancials,
  getFundamentals,
  getStockArticles,
} from "@/lib/api/cache-layer";
import { toFinancialYears, type FinancialYear } from "@/lib/api/normalize/financials";
import { toCompanyProfile, type CompanyProfile } from "@/lib/api/normalize/profile";
import { toTechnicalRead, type TechnicalRead } from "@/lib/api/normalize/technicals";
import { fetchAnalystConsensus } from "@/lib/api/clients/analysts";
import { toAnalystAvailability, type AnalystAvailability } from "@/lib/api/normalize/analyst";
import { type Returns } from "@/lib/api/normalize/returns";
import {
  repairAgainst,
  returnsAgainst,
  splitRecord,
  type ActionsRecord,
} from "@/lib/market/split-record";
import { relativeAge } from "@/lib/api/normalize/time";
import { toPricePoints, type PricePoint } from "@/lib/api/normalize/series";
import { toStockNews } from "@/lib/api/normalize/stock-news";
import { toWireItems } from "@/lib/api/normalize/wire";
import { TAGS, TTL } from "@/lib/api/ttl";
import { nowMs, nowSeconds } from "@/lib/market/clock";
import { isQuotable, presentation } from "@/lib/market/universe";
import { sessionAt, type Session } from "@/lib/market/session";
import type { WireItem } from "@/lib/market/home";
import sectorMap from "@/lib/market/data/sector-map.json" with { type: "json" };

/* One instrument, assembled once per request.

   The page is built from seven independent sources and it renders whatever
   arrives. Each branch degrades on its own: a company whose filings are
   missing still has a price, and a company whose peers cannot be quoted still
   has its filings.

   Three things this account genuinely cannot supply — analyst price targets,
   institutional ownership, and market share — all lived behind the middleware
   insight family, which is not entitled here. They are declared rather than
   quietly omitted, so the panels can say so instead of leaving a reader to
   wonder whether the company simply has no analysts. Nothing here ever falls
   back to the authored figures in lib/market/instruments.ts: those were
   invented, and an invented number wearing a real company's name is the one
   failure this whole layer exists to prevent. */

type SectorMapFile = { sectors: Record<string, string> };
const SECTORS = (sectorMap as SectorMapFile).sectors ?? {};

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
};

const STALE_AFTER_MS = 15 * 60 * 1000;
const MAX_PEERS = 8;

/* The S&P 500 tracking fund. Index instruments answer notPermissioned on this
   account, so a market comparison has to be made against the fund. */
const MARKET_PROXY = "SPY";

const MOVE_DATE = new Intl.DateTimeFormat("en-US", {
  timeZone: "UTC",
  day: "numeric",
  month: "long",
  year: "numeric",
});

/** The largest single-session moves in the record, most recent first. */
function largestSessions(points: PricePoint[], count = 3) {
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

const value = <T,>(s: PromiseSettledResult<T>, fallback: T): T =>
  s.status === "fulfilled" ? s.value : fallback;

/* Structural rather than tied to ApiResult, so one helper serves every client
   in the fan-out without a cast per call site. */
const dataOf = <T,>(r: { ok: true; data: T } | { ok: false } | undefined): T | null =>
  r !== undefined && r.ok ? r.data : null;

export const getInstrumentSnapshot = cache(
  async (rawTicker: string): Promise<InstrumentSnapshot | null> => {
    const ticker = decodeURIComponent(rawTicker).trim().toUpperCase();
    if (!ticker) return null;

    const now = nowMs();
    const failures: string[] = [];

    const [
      quoteS,
      fundamentalsS,
      financialsS,
      actionsS,
      historyS,
      rsiS,
      smaS,
      emaS,
      shortS,
      intradayS,
      marketS,
      analystS,
      articlesS,
    ] = await Promise.allSettled([
      fetchQuotes([ticker], TTL.sweep, [TAGS.quotes]),
      getFundamentals(ticker),
      getFinancials(ticker, "annual"),
      getCorporateActions(ticker),
      fetchHistory(ticker, "5y", TTL.history1m, [TAGS.history]),
      fetchIndicator("rsi", ticker, { window: 14, timespan: "day" }, TTL.history1m, [TAGS.history]),
      fetchIndicator("sma", ticker, { window: 50, timespan: "day" }, TTL.history1m, [TAGS.history]),
      fetchIndicator("ema", ticker, { window: 20, timespan: "day" }, TTL.history1m, [TAGS.history]),
      fetchShortInterest(ticker, TTL.fundamentals, [TAGS.fundamentals]),
      fetchIntraday(ticker, TTL.sweep, [TAGS.history]),
      fetchHistory(MARKET_PROXY, "5y", TTL.history1m, [TAGS.history]),
      /* 403 today on every analyst path. It rides the fan-out anyway so the
         refusal is observed per request rather than assumed, and so the panel
         fills itself the day the entitlement arrives. allSettled means the
         refusal cannot take the page down. */
      fetchAnalystConsensus(ticker, TTL.fundamentals, [TAGS.fundamentals]),
      /* The wider news pool. The gateway bundles three articles per ticker and
         about two are filler, so three relevant stories cannot come from it —
         this is the second source, cached a day and budget-guarded. It rides
         allSettled like everything else: an exhausted allowance or a dead
         provider costs the page its extra headlines, never the page. */
      getStockArticles(presentation(ticker).name, ticker),
    ]);

    /* The quote decides whether this page exists at all. A ticker the gateway
       does not know, or will not quote to this account, is a 404 rather than a
       page of dashes wearing a name we cannot price. */
    const quotes = dataOf<RawEquityQuote[]>(value(quoteS, undefined));
    const quote = quotes?.[0];
    if (!quote || quote.notFound || quote.notPermissioned) return null;
    if (
      !isQuotable({
        symbol: quote.symbol,
        name: quote.companyName,
        price: quote.lastPrice ?? quote.closingPrice,
      })
    ) {
      return null;
    }

    const fundamentals = dataOf<Parameters<typeof toCompanyProfile>[0]["fundamentals"]>(
      value(fundamentalsS, undefined),
    );
    if (!fundamentals) failures.push("company record");

    const profile = toCompanyProfile({
      ticker,
      quote,
      fundamentals: fundamentals ?? undefined,
      sector: SECTORS[ticker] ?? null,
    });

    /* ---- filings ---- */
    const rawFinancials = dataOf<Parameters<typeof toFinancialYears>[0]>(value(financialsS, undefined));
    const annual = rawFinancials ? toFinancialYears(rawFinancials) : [];
    if (annual.length === 0) failures.push("filings");

    /* ---- history, split-repaired before anything is measured ---- */
    const actions = dataOf<
      ActionsRecord & {
        dividends?: Array<{
          ex_dividend_date: string;
          cash_amount: number;
          pay_date: string | null;
        }> | null;
      }
    >(value(actionsS, undefined));

    /* A company with no splits and a corporate-actions call that failed used
       to be the same value here, and they are opposites: the first says the
       raw series needs no repair, the second says we cannot know whether it
       does. See lib/market/split-record.ts — Netflix shipped a −93.3% year
       off an unapplied ten-for-one split on the strength of that conflation. */
    const record = splitRecord(actions);
    if (!record.readable) failures.push("corporate actions");

    const rawHistory = dataOf<RawHistoryPoint[]>(value(historyS, undefined));
    const series = rawHistory ? repairAgainst(rawHistory, record) : [];
    if (series.length === 0) failures.push("price history");

    const daily = toPricePoints(series);

    const rawIntraday = dataOf<Parameters<typeof toPricePoints>[0]>(value(intradayS, undefined));
    const intraday = rawIntraday ? toPricePoints(rawIntraday) : [];

    const rawMarket = dataOf<Parameters<typeof toPricePoints>[0]>(value(marketS, undefined));
    const marketDaily = rawMarket ? toPricePoints(rawMarket) : [];

    /* ---- peers, in one batched call ---- */
    const peerIds = profile.peers.slice(0, MAX_PEERS);
    let peers: PeerQuote[] = [];
    if (peerIds.length > 0) {
      const peerQuotes = await fetchQuotes(peerIds, TTL.sweep, [TAGS.quotes]).catch(() => null);
      if (peerQuotes?.ok) {
        peers = peerQuotes.data
          .filter((q) => !q.notFound && !q.notPermissioned)
          .map((q) => ({
            id: q.symbol,
            name: presentation(q.symbol, q.companyName).name,
            price: q.lastPrice ?? q.closingPrice ?? null,
            chg: q.changePercent === null ? null : q.changePercent * 100,
            /* Filled from each peer's own history below; the quotes feed
               carries no trailing-year figure. */
            ret1y: null,
            // The quotes feed reports capitalisation in millions.
            marketCap: q.marketCap === null ? null : q.marketCap * 1e6,
            pe: q.priceEarningRatio !== null && q.priceEarningRatio > 0 ? q.priceEarningRatio : null,
          }));
      } else {
        failures.push("peers");
      }

      /* One trailing year per peer, so every row of the comparison measures
         the same window. Two cached calls per peer, fanned out rather than
         chained; warm page cost was unchanged at ~0.34s.

         The corporate actions are not optional. Measuring the raw series
         alone put Netflix at −93.3% off a $80.58 price — a ten-for-one split
         the vendor had not applied, read as a collapse. The subject's series
         is repaired the same way a few lines above, and a peer column that
         skipped it would be quoting a different, wronger number than the one
         it replaced.

         Only the resulting scalar is kept. Attaching eight more years of
         daily bars to the snapshot would inflate a flight payload that is
         already 58% price series, to render eight numbers. A peer whose
         history fails or falls short of a year keeps ret1y null and renders
         a dash — and so does one whose corporate actions cannot be read,
         because a series that could not be repaired is a series we cannot
         say anything about. */
      if (peers.length > 0) {
        const [histories, actionsList] = await Promise.all([
          Promise.allSettled(
            peers.map((c) => fetchHistory(c.id, "1y", TTL.history1m, [TAGS.history])),
          ),
          Promise.allSettled(peers.map((c) => getCorporateActions(c.id))),
        ]);
        peers = peers.map((c, i) => {
          const settled = histories[i];
          const raw =
            settled.status === "fulfilled" && settled.value.ok ? settled.value.data : null;
          if (!raw) return { ...c, ret1y: null };
          const peerRecord = splitRecord(dataOf<ActionsRecord>(value(actionsList[i], undefined)));
          return { ...c, ret1y: returnsAgainst(raw, peerRecord).ret1y };
        });
      }
    }

    /* ---- the rest ---- */
    const short = dataOf<{
      results?: Array<{
        short_interest: number;
        days_to_cover: number;
        settlement_date: string;
      }>;
    }>(value(shortS, undefined))?.results?.[0];

    /* Both feeds, ranked as one list. toWireItems has already dropped anything
       the gateway's own reasoning marks as a mention, and toStockNews scores
       the second source on its concepts, dedupes the syndicated copies the two
       share, caps any one publisher and takes the best three. */
    const gatewayNews = toWireItems(
      fundamentals?.ticker_news?.length ? [{ ticker, news: fundamentals.ticker_news }] : [],
      now,
      8,
    );
    const articles = dataOf(value(articlesS, undefined)) ?? [];
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
      session: sessionAt(nowSeconds()),
      financials: {
        annual,
        note: annual.length === 0 ? "No filings are available for this company." : null,
      },
      technical: toTechnicalRead({
        rsi: dataOf(value(rsiS, undefined)),
        sma: dataOf(value(smaS, undefined)),
        ema: dataOf(value(emaS, undefined)),
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
      peers,
      market: marketDaily.length ? { symbol: MARKET_PROXY, daily: marketDaily } : null,
      /* An unapplied ten-for-one split is a −90% session, and it would top
         this list every time — the one figure on the page most likely to be
         a split break is the one this picks out. Withheld with the returns. */
      notableMoves: record.readable ? largestSessions(daily) : [],
      analyst: toAnalystAvailability(value(analystS, undefined), profile.price),
      unavailable: { analystTargets: true, institutionalHolders: true, marketShare: true },
      status,
      note,
    };
  },
);
