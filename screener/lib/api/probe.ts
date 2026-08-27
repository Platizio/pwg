import { env, newsAvailable } from "./env.ts";
import { getToken, resetToken } from "./token.ts";
import { vtGet } from "./http.ts";
import { TAGS } from "./ttl.ts";
import { fetchHistory, fetchQuotes, searchSymbols } from "./clients/quotes.ts";
import { repairSplitBreaks, returnsFrom } from "./normalize/returns.ts";
import {
  fetchCorporateActionsUncached,
  fetchFundamentalsUncached,
} from "./clients/fundamentals.ts";
import { budgetRaw } from "./clients/news.ts";
import { fetchAnalystConsensus } from "./clients/analysts.ts";
import {
  compareQuote,
  independentFiveYearCagr,
  independentPrice,
  independentYearReturn,
} from "./crosscheck.ts";
import { runSweep, type Snapshot } from "./sweep.ts";
import { MASTER_BUILT_AT, TRADABLE_SYMBOLS } from "../market/universe.ts";
import {
  FLOOR,
  floorReport,
  gainers,
  losers,
  mostActive,
  popular,
} from "../market/screen.ts";

/* The endpoint probe.

   This module deliberately imports nothing that reaches next/cache, so the
   same checks run inside a route handler and from a bare Node process. Every
   check calls the real client code rather than a parallel copy, which is the
   only way a green probe means anything.

   Several checks assert a FAILURE. `hist.5d` must 400, index symbols must come
   back notPermissioned, the middleware family must reject us. Those are not
   known-broken tests to be tolerated — they are tripwires. The day one of them
   starts passing, an entitlement or a contract changed and we want to know. */

export type Assertion = { label: string; ok: boolean; detail: string };

export type CheckResult = {
  id: string;
  group: string;
  ok: boolean;
  status: number;
  ms: number;
  /** True when this check passes by observing an expected failure. */
  negative: boolean;
  assertions: Assertion[];
  detail: string;
  error?: string;
};

export type ProbeReport = {
  startedAt: string;
  totalMs: number;
  passed: number;
  failed: number;
  checks: CheckResult[];
};

type Check = {
  id: string;
  group: string;
  negative?: boolean;
  run: () => Promise<{ status: number; ms: number; assertions: Assertion[]; detail: string }>;
};

const a = (label: string, ok: boolean, detail: unknown = ""): Assertion => ({
  label,
  ok,
  detail: String(detail),
});

const NO_CACHE = { revalidate: 0, tags: [] as string[] };

/* sweep.full and screen.boards are two views of one expensive operation. */
let sweptOnce: Snapshot | null = null;
async function sharedSweep(): Promise<Snapshot> {
  if (!sweptOnce) sweptOnce = await runSweep({ noStore: true });
  return sweptOnce;
}

const money = (v: number) =>
  v >= 1e9 ? `$${(v / 1e9).toFixed(1)}B` : v >= 1e6 ? `$${(v / 1e6).toFixed(0)}M` : `$${v.toFixed(0)}`;
const n = (v: number | null | undefined) => (v == null ? null : Number(v));

/* ---------------------------------------------------------------- checks */

const CHECKS: Check[] = [
  {
    id: "auth.login",
    group: "auth",
    async run() {
      resetToken();
      const t0 = Date.now();
      const tok = await getToken(true);
      const ms = Date.now() - t0;
      const ttl = tok.expiresAt - Math.floor(Date.now() / 1000);
      return {
        status: 201,
        ms,
        assertions: [
          a("access_token present", tok.accessToken.length > 100, `len ${tok.accessToken.length}`),
          a("refresh_token present", tok.refreshToken.length > 100, `len ${tok.refreshToken.length}`),
          a("expiry in the future", ttl > 0, `${ttl}s`),
        ],
        detail: `token ttl ${ttl}s (${(ttl / 3600).toFixed(1)}h)`,
      };
    },
  },

  {
    id: "auth.singleFlight",
    group: "auth",
    async run() {
      resetToken();
      const t0 = Date.now();
      const all = await Promise.all([getToken(), getToken(), getToken(), getToken()]);
      const ms = Date.now() - t0;
      const same = all.every((t) => t.accessToken === all[0].accessToken);
      return {
        status: 200,
        ms,
        assertions: [a("4 concurrent callers share one login", same, same ? "identical token" : "DIVERGED")],
        detail: `4 concurrent getToken() in ${ms}ms`,
      };
    },
  },

  {
    id: "quotes.cap50",
    group: "quotes",
    async run() {
      const syms = SAMPLE_50;
      const r = await fetchQuotes(syms, NO_CACHE.revalidate, [TAGS.quotes], true);
      if (!r.ok) throw new Error(`HTTP ${r.status}: ${r.error}`);
      const nf = r.data.filter((q) => q.notFound).length;
      return {
        status: r.status,
        ms: r.ms,
        assertions: [
          a("50 rows returned", r.data.length === 50, `${r.data.length}`),
          a("no notFound", nf === 0, `${nf} notFound`),
        ],
        detail: `${r.data.length}/50 rows, ${nf} notFound`,
      };
    },
  },

  {
    id: "quotes.cap51",
    group: "quotes",
    negative: true,
    async run() {
      // Bypass the client's own guard to confirm the SERVER enforces the cap.
      const r = await vtGet<unknown>("/aes/api/quotes/equity", {
        query: { symbols: [...SAMPLE_50, "AAPL"].join(",") },
        ...NO_CACHE,
        noStore: true,
      });
      const rejected = !r.ok && r.status === 400;
      return {
        status: r.status,
        ms: r.ms,
        assertions: [
          a("server rejects 51 symbols", rejected, r.ok ? "ACCEPTED — cap moved!" : r.error),
        ],
        detail: r.ok ? "51 accepted — the cap has changed" : `400 · ${r.error}`,
      };
    },
  },

  {
    id: "quotes.fractionGuard",
    group: "quotes",
    async run() {
      const r = await fetchQuotes(["AAPL"], 0, [TAGS.quotes], true);
      if (!r.ok) throw new Error(r.error);
      const q = r.data[0];
      const cp = n(q.changePercent);
      // A percent-valued field would routinely exceed 1. A fraction cannot,
      // short of a 100% single-day move.
      const isFraction = cp !== null && Math.abs(cp) < 1;
      return {
        status: r.status,
        ms: r.ms,
        assertions: [
          a("changePercent is a fraction", isFraction, `${cp} → ${cp !== null ? (cp * 100).toFixed(2) : "?"}%`),
        ],
        detail: `AAPL changePercent=${cp} (×100 = ${cp !== null ? (cp * 100).toFixed(2) : "?"}%)`,
      };
    },
  },

  {
    id: "quotes.mcapGuard",
    group: "quotes",
    async run() {
      const r = await fetchQuotes(["AAPL"], 0, [TAGS.quotes], true);
      if (!r.ok) throw new Error(r.error);
      const mc = n(r.data[0].marketCap);
      // Apple in real units would be ~4.6e12. In millions it is ~4.6e6.
      const inMillions = mc !== null && mc < 1e8;
      return {
        status: r.status,
        ms: r.ms,
        assertions: [a("marketCap is in millions", inMillions, `${mc}`)],
        detail: `AAPL marketCap=${mc} → $${mc !== null ? (mc / 1e6).toFixed(2) : "?"}T`,
      };
    },
  },

  {
    id: "quotes.chgCrosscheck",
    group: "quotes",
    async run() {
      const r = await fetchQuotes(["AAPL", "MSFT", "NVDA"], 0, [TAGS.quotes], true);
      if (!r.ok) throw new Error(r.error);
      const rows = r.data.map((q) => {
        const stated = (n(q.changePercent) ?? 0) * 100;
        const base = n(q.yesterdayClose) ?? n(q.closingPrice) ?? 0;
        const derived = base ? ((n(q.change) ?? 0) / base) * 100 : NaN;
        return { s: q.symbol, stated, derived, diff: Math.abs(stated - derived) };
      });
      const worst = Math.max(...rows.map((x) => x.diff));
      return {
        status: r.status,
        ms: r.ms,
        assertions: [
          a("changePercent agrees with change/prevClose", worst < 0.02, `max diff ${worst.toFixed(4)}pp`),
        ],
        detail: rows.map((x) => `${x.s} ${x.stated.toFixed(2)}%/${x.derived.toFixed(2)}%`).join("  "),
      };
    },
  },

  {
    id: "quotes.staleness",
    group: "quotes",
    async run() {
      const r = await fetchQuotes(["AAPL"], 0, [TAGS.quotes], true);
      if (!r.ok) throw new Error(r.error);
      const q = r.data[0];
      const t = q.updateTime ? Date.parse(q.updateTime) : NaN;
      const ageMin = Number.isFinite(t) ? Math.round((Date.now() - t) / 60000) : null;
      return {
        status: r.status,
        ms: r.ms,
        assertions: [
          a("delayed flag present", typeof q.delayed === "boolean", `${q.delayed}`),
          a("updateTime parses", Number.isFinite(t), q.updateTime ?? "null"),
        ],
        detail: `delayed=${q.delayed} source=${q.source} age=${ageMin}min`,
      };
    },
  },

  {
    id: "quotes.etf14",
    group: "quotes",
    async run() {
      const syms = [
        "XLK", "XLC", "XLE", "XLY", "XLI", "XLF", "XLB", "XLV", "XLP", "XLU", "XLRE",
        "SPY", "QQQ", "IWM",
      ];
      const r = await fetchQuotes(syms, 0, [TAGS.sectors], true);
      if (!r.ok) throw new Error(r.error);
      const priced = r.data.filter((q) => n(q.lastPrice) !== null);
      return {
        status: r.status,
        ms: r.ms,
        assertions: [
          a("all 14 returned", r.data.length === 14, `${r.data.length}`),
          a("all priced", priced.length === 14, `${priced.length} priced`),
        ],
        detail: `11 sector SPDRs + SPY/QQQ/IWM in one call · ${priced.length}/14 priced`,
      };
    },
  },

  {
    id: "index.entitlement",
    group: "blocked",
    negative: true,
    async run() {
      const r = await fetchQuotes(["SPX$", "NDX$", "RUT$"], 0, [TAGS.indices], true);
      if (!r.ok) throw new Error(r.error);
      const blocked = r.data.filter((q) => q.notPermissioned);
      const priced = r.data.filter((q) => n(q.lastPrice) !== null);
      return {
        status: r.status,
        ms: r.ms,
        assertions: [
          a(
            "index symbols still notPermissioned",
            blocked.length === r.data.length && priced.length === 0,
            priced.length ? `${priced.length} NOW PRICED — entitlement granted!` : `${blocked.length} blocked`,
          ),
        ],
        detail: priced.length
          ? "ENTITLEMENT GRANTED — switch INDEX_PROXY to real symbols"
          : `${blocked.length}/${r.data.length} notPermissioned (ETF proxies still required)`,
      };
    },
  },

  {
    id: "search.apple",
    group: "quotes",
    async run() {
      const r = await searchSymbols("APPLE", 0, [TAGS.quotes], true);
      if (!r.ok) throw new Error(r.error);
      const hit = r.data.some((x) => x.symbol === "AAPL");
      return {
        status: r.status,
        ms: r.ms,
        assertions: [
          a("returns results", r.data.length > 0, `${r.data.length}`),
          a("AAPL among them", hit, hit ? "found" : "missing"),
        ],
        detail: `${r.data.length} hits (cap is 20)`,
      };
    },
  },

  {
    id: "hist.1m",
    group: "history",
    async run() {
      const r = await fetchHistory("AAPL", "1m", 0, [TAGS.history], true);
      if (!r.ok) throw new Error(r.error);
      const pts = r.data;
      const hasPrice = pts.length > 0 && typeof pts[0].price === "number";
      const noClose = pts.length > 0 && !("close" in pts[0]);
      return {
        status: r.status,
        ms: r.ms,
        assertions: [
          a("at least 6 points", pts.length >= 6, `${pts.length}`),
          a("field is `price`", hasPrice, hasPrice ? "price" : "MISSING"),
          a("field is not `close`", noClose, noClose ? "confirmed" : "close appeared"),
        ],
        detail: `${pts.length} points · ${pts[0]?.date?.slice(0, 10)} → ${pts.at(-1)?.date?.slice(0, 10)}`,
      };
    },
  },

  {
    id: "hist.5d",
    group: "history",
    negative: true,
    async run() {
      const r = await vtGet<unknown>("/aes/api/quotes/equity/historical", {
        query: { symbol: "AAPL", range: "5d" },
        ...NO_CACHE,
        noStore: true,
      });
      const rejected = !r.ok && r.status === 400;
      return {
        status: r.status,
        ms: r.ms,
        assertions: [a("range=5d still unsupported", rejected, r.ok ? "NOW WORKS" : `400 ${r.error}`)],
        detail: r.ok ? "5d now supported — week change can stop slicing 1m" : "400 (expected)",
      };
    },
  },

  {
    id: "fund.aapl",
    group: "fundamentals",
    async run() {
      const r = await fetchFundamentalsUncached("AAPL");
      if (!r.ok) throw new Error(r.error);
      const d = r.data;
      return {
        status: r.status,
        ms: r.ms,
        assertions: [
          a("logo_url present", Boolean(d.ticker?.branding?.logo_url), d.ticker?.branding?.logo_url ?? "none"),
          a("sic_code present", Boolean(d.ticker?.sic_code), d.ticker?.sic_code ?? "none"),
          a("P/E present", n(d.ratios?.price_to_earnings) !== null, `${d.ratios?.price_to_earnings}`),
          a("ticker_news non-empty", (d.ticker_news?.length ?? 0) > 0, `${d.ticker_news?.length ?? 0}`),
          a("related_companies non-empty", (d.related_companies?.length ?? 0) > 0, `${d.related_companies?.length ?? 0}`),
        ],
        detail: `sic=${d.ticker?.sic_code} pe=${d.ratios?.price_to_earnings} news=${d.ticker_news?.length ?? 0} peers=${d.related_companies?.length ?? 0}`,
      };
    },
  },

  {
    id: "fund.divUnits",
    group: "fundamentals",
    async run() {
      const [q, f] = await Promise.all([
        fetchQuotes(["AAPL"], 0, [TAGS.quotes], true),
        fetchFundamentalsUncached("AAPL"),
      ]);
      if (!q.ok) throw new Error(q.error);
      if (!f.ok) throw new Error(f.error);
      const asPercent = n(q.data[0].dividendYield);
      const asFraction = n(f.data.ratios?.dividend_yield);
      const ratio = asPercent && asFraction ? asPercent / asFraction : NaN;
      // Pins the documented inconsistency: one endpoint says 0.34, the other 0.0034.
      const holds = Number.isFinite(ratio) && Math.abs(ratio - 100) < 5;
      return {
        status: 200,
        ms: q.ms + f.ms,
        assertions: [a("quotes yield is 100× ratios yield", holds, `ratio ${Number.isFinite(ratio) ? ratio.toFixed(1) : "n/a"}`)],
        detail: `quotes=${asPercent} ratios=${asFraction} → ${Number.isFinite(ratio) ? ratio.toFixed(1) : "n/a"}×`,
      };
    },
  },

  {
    id: "corp.aapl",
    group: "fundamentals",
    async run() {
      const r = await fetchCorporateActionsUncached("AAPL");
      if (!r.ok) throw new Error(r.error);
      const divs = r.data.dividends ?? [];
      const splits = r.data.splits ?? [];
      const parses = divs.length > 0 && Number.isFinite(Date.parse(divs[0].ex_dividend_date));
      return {
        status: r.status,
        ms: r.ms,
        assertions: [
          a("dividends or splits present", divs.length + splits.length > 0, `${divs.length}d ${splits.length}s`),
          a("ex-dividend date parses", parses, divs[0]?.ex_dividend_date ?? "none"),
        ],
        detail: `${divs.length} dividends, ${splits.length} splits · latest ex-div ${divs[0]?.ex_dividend_date ?? "n/a"}`,
      };
    },
  },

  {
    id: "news.budget",
    group: "news",
    async run() {
      if (!newsAvailable()) {
        return {
          status: 0,
          ms: 0,
          assertions: [a("news enabled", false, "NEWS_ENABLED=0 or key missing")],
          detail: "news disabled",
        };
      }
      const r = await budgetRaw();
      if (!r.ok) throw new Error(r.error);
      const left = r.data.availableTokens;
      return {
        status: r.status,
        ms: r.ms,
        assertions: [a("at least 200 requests left", left >= 200, `${left} available`)],
        detail: `${left} available / ${r.data.usedTokens} used (lifetime cap)`,
      };
    },
  },

  {
    id: "blocked.insight",
    group: "blocked",
    negative: true,
    async run() {
      const t0 = Date.now();
      const { accessToken } = await getToken();
      const res = await fetch(
        "https://middleware-staging.viewtrade.in/api/v1/insight/v1/quote-profile?symbol=AAPL",
        { headers: { Authorization: `Bearer ${accessToken}` }, cache: "no-store", signal: AbortSignal.timeout(15_000) },
      ).catch(() => null);
      const ms = Date.now() - t0;
      const blocked = !res || !res.ok;
      return {
        status: res?.status ?? 0,
        ms,
        assertions: [
          a("middleware /insight still blocked", blocked, blocked ? `HTTP ${res?.status}` : "NOW OPEN — GICS available!"),
        ],
        detail: blocked
          ? `HTTP ${res?.status} — GICS sectors unavailable, SIC mapping still required`
          : "UNBLOCKED — switch sector source to quote-profile.sector",
      };
    },
  },

  {
    id: "blocked.analysts",
    group: "blocked",
    negative: true,
    async run() {
      const r = await fetchAnalystConsensus("AAPL", NO_CACHE.revalidate, NO_CACHE.tags, true);
      const refused = !r.ok && r.status === 403;
      return {
        status: r.status,
        ms: r.ms,
        assertions: [
          a(
            "analyst ratings still 403",
            refused,
            r.ok ? "NOW ENTITLED — a consensus is available!" : `HTTP ${r.status} · ${r.error}`,
          ),
        ],
        detail: refused
          ? "403 — no ratings, no price targets, no estimates; the Analyst view stays empty"
          : "ENTITLED — wire fetchAnalystConsensus into the snapshot and drop unavailable.analystTargets",
      };
    },
  },

  {
    id: "master.crawl",
    group: "universe",
    async run() {
      const n = TRADABLE_SYMBOLS.length;
      return {
        status: 200,
        ms: 0,
        assertions: [
          a("master has been built", n > 0, `${n} tradable`),
          a("at least 2,500 tradable symbols", n >= 2500, `${n}`),
        ],
        detail: `${n} tradable symbols · built ${MASTER_BUILT_AT?.slice(0, 10)}`,
      };
    },
  },

  {
    id: "sweep.full",
    group: "sweep",
    async run() {
      const s = await sharedSweep();
      return {
        status: 200,
        ms: s.ms,
        assertions: [
          a("no failed chunks", s.failedChunks === 0, `${s.failedChunks} of ${s.calls}`),
          a("most symbols priced", s.rows.length > s.requested * 0.5, `${s.rows.length}/${s.requested}`),
        ],
        detail: `${s.rows.length} priced of ${s.requested} · ${s.calls} calls · ${s.failedChunks} failed · ${(s.ms / 1000).toFixed(1)}s`,
      };
    },
  },

  {
    id: "screen.boards",
    group: "sweep",
    async run() {
      const s = await sharedSweep();
      const f = floorReport(s);
      const board = (label: string, rows: ReturnType<typeof gainers>, metric: (r: (typeof rows)[number]) => string) =>
        `\n      ${label}: ` +
        (rows.length
          ? rows.map((r) => `${r.s} ${metric(r)}`).join("  ")
          : "(none passed the floor)");

      const detail =
        `${f.eligible} eligible of ${f.swept} swept ` +
        `(dropped: ${f.droppedExchange} off-exchange, ${f.droppedPrice} sub-$${FLOOR.minPrice}, ${f.droppedVolume} thin)` +
        board("gainers  ", gainers(s, 5), (r) => `+${r.chg.toFixed(1)}%`) +
        board("losers   ", losers(s, 5), (r) => `${r.chg.toFixed(1)}%`) +
        board("active   ", mostActive(s, 5), (r) => money(r.dollarVol)) +
        board("popular  ", popular(s, 5), (r) => `${r.relVol.toFixed(1)}x`);

      return {
        status: 200,
        ms: 0,
        assertions: [
          a("floor leaves a usable pool", f.eligible >= 200, `${f.eligible} eligible`),
          a("gainers board fills", gainers(s, 5).length === 5, `${gainers(s, 5).length}/5`),
          a("losers board fills", losers(s, 5).length === 5, `${losers(s, 5).length}/5`),
          a("most-active board fills", mostActive(s, 5).length === 5, `${mostActive(s, 5).length}/5`),
        ],
        detail,
      };
    },
  },

  {
    id: "crosscheck.prices",
    group: "truth",
    async run() {
      /* Eight liquid names across sectors. The tolerance is wide because our
         feed runs fifteen minutes behind and the independent one does not —
         it is set to catch a scale error or a wrong symbol, not a tick. */
      const SYMBOLS = ["AAPL", "MSFT", "NVDA", "JPM", "XOM", "WMT", "JNJ", "KO"];
      const TOLERANCE_PCT = 3;

      const [mine, theirs] = await Promise.all([
        fetchQuotes(SYMBOLS, 0, [TAGS.quotes], true),
        Promise.all(SYMBOLS.map((s) => independentPrice(s))),
      ]);
      if (!mine.ok) throw new Error(mine.error);

      const bySymbol = new Map(mine.data.map((q) => [q.symbol, q]));
      const checks = SYMBOLS.map((s, i) => {
        const ours = n(bySymbol.get(s)?.lastPrice) ?? n(bySymbol.get(s)?.closingPrice) ?? 0;
        return compareQuote(s, ours, theirs[i], TOLERANCE_PCT);
      });

      const reachable = checks.filter((c) => c.theirs !== null);
      const agreeing = reachable.filter((c) => c.ok);
      const worst = reachable.reduce(
        (w, c) => (Math.abs(c.diffPct) > Math.abs(w) ? c.diffPct : w),
        0,
      );

      return {
        status: 200,
        ms: mine.ms,
        assertions: [
          a("independent source reachable", reachable.length >= 6, `${reachable.length}/${SYMBOLS.length}`),
          a(
            "every price agrees within tolerance",
            agreeing.length === reachable.length,
            reachable
              .filter((c) => !c.ok)
              .map((c) => `${c.symbol} ${c.note}`)
              .join("; ") || "all agree",
          ),
        ],
        detail: `${agreeing.length}/${reachable.length} agree within ${TOLERANCE_PCT}% · worst ${worst.toFixed(2)}%`,
      };
    },
  },

  {
    id: "crosscheck.marketCap",
    group: "truth",
    async run() {
      /* Market cap is reported in millions on the quotes endpoint and in whole
         dollars on the fundamentals endpoint. If those two ever agree, one of
         them has changed and every figure derived from it is out by 1e6. */
      const [q, f] = await Promise.all([
        fetchQuotes(["AAPL"], 0, [TAGS.quotes], true),
        fetchFundamentalsUncached("AAPL"),
      ]);
      if (!q.ok) throw new Error(q.error);
      if (!f.ok) throw new Error(f.error);

      const millions = n(q.data[0].marketCap);
      const units = n(f.data.ticker?.market_cap);
      const ratio = millions && units ? units / millions : Number.NaN;

      return {
        status: 200,
        ms: q.ms + f.ms,
        assertions: [
          a("fundamentals cap is 1e6 times the quotes cap", Number.isFinite(ratio) && Math.abs(ratio - 1e6) / 1e6 < 0.02, `ratio ${Number.isFinite(ratio) ? ratio.toExponential(2) : "n/a"}`),
        ],
        detail: `quotes ${millions} (millions) · fundamentals ${units} (dollars)`,
      };
    },
  },

  {
    id: "crosscheck.history",
    group: "truth",
    async run() {
      /* The price cross-check passed for months while every trailing-return
         column was wrong: the gateway's history is not split-adjusted, and a
         current price is correct whatever happened to the series behind it.
         This measures the thing that was actually broken. */
      const SYMBOLS = ["XLK", "SPY", "AAPL", "NVDA"];
      const TOLERANCE_PP = 8;

      const results = await Promise.all(
        SYMBOLS.map(async (sym) => {
          const [hist, actions, theirs, theirCagr] = await Promise.all([
            fetchHistory(sym, "5y", 0, [TAGS.history], true),
            fetchCorporateActionsUncached(sym),
            independentYearReturn(sym),
            independentFiveYearCagr(sym),
          ]);
          if (!hist.ok) return { sym, ours: null, theirs, ourCagr: null, theirCagr, splits: 0 };
          const splits = actions.ok ? (actions.data.splits ?? []) : [];
          const series = splits.length ? repairSplitBreaks(hist.data, splits) : hist.data;
          const v = returnsFrom(series);
          return { sym, ours: v.ret1y, theirs, ourCagr: v.cagr5y, theirCagr, splits: splits.length };
        }),
      );

      const comparable = results.filter((r) => r.ours !== null && r.theirs !== null);
      const off = comparable.filter(
        (r) => Math.abs((r.ours as number) - (r.theirs as number)) > TOLERANCE_PP,
      );

      /* The compound rate is checked separately and more loosely: it is a rate
         rather than a total, so a few points of tolerance covers a different
         start date, while a mis-applied split shows up as a multiple. */
      const CAGR_TOLERANCE_PP = 10;
      const cagrComparable = results.filter((r) => r.ourCagr !== null && r.theirCagr !== null);
      const cagrOff = cagrComparable.filter(
        (r) => Math.abs((r.ourCagr as number) - (r.theirCagr as number)) > CAGR_TOLERANCE_PP,
      );

      return {
        status: 200,
        ms: 0,
        assertions: [
          a("independent one-year returns available", comparable.length >= 3, `${comparable.length}/${SYMBOLS.length}`),
          a(
            "our adjusted one-year return matches theirs",
            off.length === 0,
            off.map((r) => `${r.sym} ours ${r.ours?.toFixed(1)}% vs ${r.theirs?.toFixed(1)}%`).join("; ") || "all within tolerance",
          ),
          a(
            "our five-year compound rate matches theirs",
            cagrOff.length === 0,
            cagrOff
              .map((r) => `${r.sym} ours ${r.ourCagr?.toFixed(1)}% vs ${r.theirCagr?.toFixed(1)}%`)
              .join("; ") || "all within tolerance",
          ),
        ],
        detail: comparable
          .map(
            (r) =>
              `${r.sym} 1y ${(r.ours as number).toFixed(0)}/${(r.theirs as number).toFixed(0)}` +
              (r.ourCagr !== null && r.theirCagr !== null
                ? ` cagr ${r.ourCagr.toFixed(0)}/${r.theirCagr.toFixed(0)}`
                : ""),
          )
          .join("  "),
      };
    },
  },
];

/** Fifty real large caps — enough to exercise the batch cap honestly. */
const SAMPLE_50 = [
  "AAPL","MSFT","NVDA","AMZN","GOOGL","META","TSLA","AVGO","LLY","JPM",
  "V","UNH","XOM","MA","COST","HD","PG","JNJ","WMT","ABBV",
  "NFLX","CRM","BAC","ORCL","MRK","KO","PEP","AMD","TMO","LIN",
  "ADBE","CVX","MCD","CSCO","ACN","ABT","WFC","DHR","TXN","GE",
  "VZ","DIS","INTU","IBM","NOW","CAT","AMGN","QCOM","PFE","CMCSA",
];

/* ---------------------------------------------------------------- runner */

export function checkIds(): string[] {
  return CHECKS.map((c) => c.id);
}

export async function runProbe(only?: string[]): Promise<ProbeReport> {
  env(); // fail fast and loudly on missing configuration
  const startedAt = new Date().toISOString();
  const t0 = Date.now();
  const selected = only?.length
    ? CHECKS.filter((c) => only.some((o) => c.id === o || c.group === o || c.id.startsWith(`${o}.`)))
    : CHECKS;

  const checks: CheckResult[] = [];
  for (const c of selected) {
    try {
      const r = await c.run();
      checks.push({
        id: c.id,
        group: c.group,
        ok: r.assertions.every((x) => x.ok),
        negative: Boolean(c.negative),
        status: r.status,
        ms: r.ms,
        assertions: r.assertions,
        detail: r.detail,
      });
    } catch (e) {
      checks.push({
        id: c.id,
        group: c.group,
        ok: false,
        negative: Boolean(c.negative),
        status: 0,
        ms: 0,
        assertions: [],
        detail: "",
        error: String(e instanceof Error ? e.message : e).slice(0, 240),
      });
    }
  }

  return {
    startedAt,
    totalMs: Date.now() - t0,
    passed: checks.filter((c) => c.ok).length,
    failed: checks.filter((c) => !c.ok).length,
    checks,
  };
}

/** Fixed-width report. Shared by the CLI and the route handler's text mode. */
export function formatReport(r: ProbeReport): string {
  const L: string[] = [];
  L.push(`MERIDIAN API PROBE · ${r.startedAt} · uat`);
  L.push("");
  L.push("  ok     ms   check                    detail");
  L.push("  ────  ────  ───────────────────────  ────────────────────────────────────────");
  for (const c of r.checks) {
    const mark = c.ok ? (c.negative ? "PASS*" : "PASS ") : "FAIL ";
    const ms = c.ms ? String(c.ms) : "–";
    const detail = c.error ? `ERROR ${c.error}` : c.detail;
    L.push(`  ${mark} ${ms.padStart(5)}  ${c.id.padEnd(23)}  ${detail}`);
    if (!c.ok) {
      for (const x of c.assertions.filter((y) => !y.ok)) {
        L.push(`         ${"".padStart(5)}  ${"".padEnd(23)}    ✗ ${x.label}: ${x.detail}`);
      }
    }
  }
  L.push("");
  L.push(`  ${r.passed} passed · ${r.failed} failed · ${(r.totalMs / 1000).toFixed(1)}s`);
  L.push(`  PASS* = passed by observing an EXPECTED failure (tripwire checks)`);
  return L.join("\n");
}
