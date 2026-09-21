import "server-only";
import { cache } from "react";

import {
  fetchHistory,
  fetchQuotes,
  type RawEquityQuote,
  type RawHistoryPoint,
} from "../api/clients/quotes.ts";
import {
  fetchIndicator,
  fetchShortInterest,
  type RawShortInterest,
} from "../api/clients/technicals.ts";
import type { RawCorporateActions, RawFundamentals } from "../api/clients/fundamentals.ts";
import type { RawFinancials } from "../api/clients/financials.ts";
import { fetchAnalystConsensus } from "../api/clients/analysts.ts";
import { toPricePoints } from "../api/normalize/series.ts";
import { repairAgainst, returnsAgainst, splitRecord, type ActionsRecord } from "./split-record.ts";
import { TAGS, TTL } from "../api/ttl.ts";
import type { ApiResult } from "../api/errors.ts";
import { quoteVerdict } from "./quote-verdict.ts";
import { reconnectDelay } from "../api/stream/backoff.ts";
import { nowMs } from "./clock.ts";
import { isPlaceholderInstrument, presentation } from "./universe.ts";
import { DEFAULT_RANGE, getRange } from "./ranges.ts";
import { storeConfigured, touchVisit } from "./store/client.ts";
import { fromStored } from "./store/sections.ts";
import { indicatorsFromDaily } from "./store/local-indicators.ts";
import type { StoredInstrument } from "./store/types.ts";
import {
  MARKET_PROXY,
  MAX_PEERS,
  assembleInstrument,
  dataOf,
  profileFrom,
  value,
  type InstrumentInputs,
  type InstrumentSnapshot,
  type PeerQuote,
} from "./instrument-assemble.ts";
import sectorMap from "./data/sector-map.json" with { type: "json" };

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
   failure this whole layer exists to prevent.

   What remains in this file is the I/O and the two rules that decide whether
   the page exists at all — the fan-out, the quote retry, the placeholder
   check, and the peers wave that cannot start until the company record has
   named its peers. Everything downstream of "the documents have arrived" is
   instrument-assemble.ts, which is pure and therefore testable, and which the
   durable store calls with the same documents read out of Postgres.

   ── TWO PATHS, AND WHY THE SLOW ONE IS NOT OPTIONAL ──────────────────────

   A cold page on the slow path costs eleven concurrent gateway calls, then a
   peers wave of up to seventeen more, and eight to thirty seconds of a reader's
   time — ADBE 7.7s, CRM 15.0s, ORCL 30.7s, measured in production and recorded
   in prerender.ts. Only 500 of 13,797 symbols are
   prerendered, so somebody pays that on most names. The `market` schema exists
   to end it: one RPC returns the quote, every stored section, the SPY
   benchmark and the priced peers together, and the assembly cannot tell which
   source handed it the documents.

   The store path therefore runs first, and FALLS BACK RATHER THAN FAILING on
   every way it can come up short. It is unconfigured in dev and in CI, it is
   still being filled for most of the universe, a symbol nobody has opened yet
   has no row at all, and a symbol somebody opened a minute ago has a profile
   some time before it has five years of bars. None of those is an answer about
   the company, so none of them may reach the reader: a miss drops straight
   into the fan-out below and the page renders exactly as it always has,
   slowly. The one thing a miss must never do is 404 — see the long note above
   the quote retry for what it costs to turn "we were not told" into "this
   company does not exist".

   ── WHAT NO LONGER RIDES THE RENDER ──────────────────────────────────────

   The session's one-minute bars are the only part of this page too fast-moving
   to store, and they were also one of the calls the reader waited on. They now
   load from app/api/intraday/[ticker] after hydration, through
   components/terminal/use-intraday.ts, so `history.intraday` leaves here empty
   on BOTH paths and `intradayNote` says so.

   The wider news pool went the same way, and by the time it did it was the
   largest thing left. With the store filled, a cold instrument page makes ZERO
   gateway calls — the RPC alone answers in 0.23-0.34s — and the one remaining
   third-party call in the render was `getStockArticles` against newsapi.ai, at
   1 to 1.5 seconds: more than the database read and the React render put
   together. It is now app/api/stock-news/[ticker], reached from
   components/terminal/use-stock-news.ts, so `articles` is null on BOTH paths
   here and the assembler builds `news` from the gateway's own three headlines
   alone. Those cost nothing: they are already inside the fundamentals document
   on the slow path and inside the `news_gateway` section on the fast one, so
   the rail is drawn the moment the page is and only gets richer. */

type SectorMapFile = { sectors: Record<string, string> };
const SECTORS = (sectorMap as SectorMapFile).sectors ?? {};

/* Re-exported from their new home. Nine components and two test files import
   these two names from here, and where the type lives is not worth a rename
   across all of them. */
export type { InstrumentSnapshot, PeerQuote } from "./instrument-assemble.ts";

/* How many times to re-ask for a quote that failed, beyond the first attempt.
 *
 * It was one, after a flat 400ms, and that was sized for a six-page build. At
 * five hundred it is not enough: nine build workers each fanning out a dozen
 * concurrent calls is over a hundred simultaneous requests, the gateway
 * throttles briefly, and one unlucky ticker takes the whole build down — SPCX
 * did exactly that, and answered normally when asked again a moment later.
 *
 * Three attempts on a curve of roughly 0.75s, 1.5s and 3s costs at most about
 * seven seconds, and only on the failure path — well inside the sixty-second
 * per-page budget. The throw is kept for a genuine outage, where failing loudly
 * is still better than baking a 404 onto a real company. */
const QUOTE_RETRIES = 3;

/* What the chart says while the session series is still in flight.
 *
 * price-chart.tsx draws `history.intradayNote` over an empty day view, so this
 * is the sentence a reader sees for the few hundred milliseconds between
 * hydration and the first answer from /api/intraday. It has to be true of a
 * shut market too, because a reader with JavaScript off never gets the second
 * sentence: "loading" would be a promise this page cannot keep for them, while
 * this says only where the series comes from. */
const SESSION_SERIES_NOTE = "This session's trades load with the chart.";

/* How long the store gets to answer before the page stops waiting for it.
 *
 * This is the ceiling on a read PLUS its wait behind the gate, and it has to
 * be far above the cost of one read because of what sits on the other side of
 * it. A single read is already bounded at four seconds by the client
 * (READ_TIMEOUT_MS in store/client.ts); the only time this budget adds
 * anything is when the read is queued behind others, and queueing is the
 * cheap, correct outcome. Giving up is the expensive one: it sends this render
 * to the gateway fan-out — eleven calls and a peers wave — which is exactly
 * the load the store exists to keep off the box.
 *
 * It was 2,500ms, and that number was measured wrong. On the deployed build
 * every worker renders four pages at once and each page makes two gated reads,
 * so eight reads share four permits and the second wave waits a full read
 * before it starts. Whole pages tripped the budget with the store answering
 * perfectly — the build log shows zero store failures beside twenty-two
 * gateway timeouts and nine pages that took over sixty seconds and had to be
 * retried, all of them pages that had silently gone to the gateway. Twenty
 * Eight, not twenty. Twenty was picked to cover five reads' worth of queue and
 * it did not survive contact with a build: Next gives a page sixty seconds and
 * retries it three times, so a budget that can be spent in full three times
 * over is a build failure rather than a fallback. A deployed build spent
 * exactly that — 20,020ms per attempt, three attempts, `/terminal/SHW after 3
 * attempts` — while the gate sat idle at one permit of four, which is what
 * says the wait was never queueing in the first place. Eight covers one read's
 * four-second ceiling plus one full read ahead of it in the queue, and three of
 * them still leave half the page's minute for the fan-out that follows.
 *
 * The abandoned read is not cancelled. It carries on into the unstable_cache
 * entry it was already going to fill, so the next reader of this symbol finds
 * the answer this one gave up on. Nothing is wasted except the waiting. */
const STORE_BUDGET_MS = 8_000;

/**
 * The snapshot, minus everything that no longer travels with the page.
 *
 * `assembleInstrument` still owns the day view — it is handed `intraday: null`
 * on both paths and reports the empty series and its own note — and this
 * replaces that note with one that describes where the bars actually come from
 * now. Done here rather than in the assembler because the assembler is the one
 * piece of this page with no opinion about transport.
 *
 * Exported only so a test can hold it to that. It is the last thing both paths
 * pass through, and anything that crept back into the payload — a day view, a
 * second year of bars, the benchmark — would otherwise show up as a cold page
 * that had quietly gone slow again, or as an instance that died on the third
 * click, rather than as a failing assertion.
 */
export function shippedWithPage(snapshot: InstrumentSnapshot): InstrumentSnapshot {
  /* The day view, which arrives after hydration from /api/intraday. */
  const history = { ...snapshot.history, intraday: [], intradayNote: SESSION_SERIES_NOTE };

  /* THE BARS, and this is the line that stopped a board click killing the box.
   *
   * The assembler is handed five years because it MEASURES against five years
   * — the returns, the drawdowns, the notable moves are all computed here and
   * arrive as numbers. What the page then has to CARRY is only what the chart
   * draws on opening, which is one year; 1M and 3M are slices of that same
   * year, so they cost nothing and stay instant, and 1W, 1D and 5Y fetch their
   * own series from /api/history when a button is pressed.
   *
   * Measured before: 438KB a click, 234KB of it bars, 2,549 of them — the
   * company's five years and SPY's. On a 512MB instance each on-demand render
   * held 40-60MB and did not give it back; a fresh box went 81MB, 200MB,
   * 212MB, and the next render returned 502. Every never-prerendered stock
   * then hung for as long as anyone waited.
   *
   * `slice(-n)` and not `slice(0, n)`: the most recent year. Keeping the
   * OLDEST year would draw a year-old chart under today's price, and nothing
   * about the page would look wrong. */
  const year = getRange(DEFAULT_RANGE).sessions;
  if (typeof year === "number" && history.daily.length > year) {
    history.daily = history.daily.slice(-year);
  }

  return {
    ...snapshot,
    history,
    /* The benchmark belongs to the panel that draws it. It is the same 86KB of
       SPY on every company's page — identical bytes, one comparison line — and
       only the performance tab reads it. It fetches its own now. */
    market: null,
  };
}

/**
 * What a stored record turns out to be worth, as three outcomes rather than
 * two.
 *
 * Collapsing `gateway` and `absent` into a single null is the mistake this
 * union exists to make impossible. "The store has nothing for this symbol" and
 * "the store holds a quote saying this symbol is not a company" are opposite
 * claims: the first must fall through to the fan-out, the second must 404, and
 * a page that mixes them up either bakes a 404 onto Apple because a database
 * was empty, or renders a page of dashes for Nasdaq's test ticker.
 */
export type StoredRead =
  /** Nothing usable here. Fall back to the gateway; NEVER a 404. */
  | { use: "gateway" }
  /** The store's own quote says there is no page to draw. */
  | { use: "absent" }
  | { use: "store"; inputs: InstrumentInputs };

/**
 * One stored record, turned into the documents the assembly takes.
 *
 * Pure, and exported for that reason: this is the whole of the fast path's
 * judgement — which fields come from where, which absences are failures the
 * reader is owed a sentence about, and which of them mean there is no page —
 * and none of it should be reachable only by pointing a render at Postgres.
 * tests/instrument-store-path.test.ts is the caller that checks it against an
 * equivalent set of gateway documents.
 *
 * `articles` is left null, and it now stays null all the way into the
 * assembler on both paths — the wider pool is fetched by the browser, from
 * app/api/stock-news/[ticker]. The field survives because the assembler is
 * still the one thing that knows how to merge the two feeds, and the route
 * calls the same normaliser with both halves filled.
 */
export function inputsFromStored(
  record: StoredInstrument | null | undefined,
  ticker: string,
): StoredRead {
  /* Three gates on whether the record says anything at all, and every one of
     them means "fall back", not "no such company". `enrolled` is false for a
     symbol nobody has opened yet; the quote and the profile are what every
     panel on the page is measured against, and a record without them is a page
     of dashes wearing a real company's name. */
  if (!record || record.enrolled !== true) return { use: "gateway" };
  const quote = record.quote;
  if (!quote) return { use: "gateway" };

  const sections = record.sections ?? {};
  const profileDoc = fromStored("profile", sections.profile);
  if (!profileDoc) return { use: "gateway" };

  /* The same two durable refusals the gateway path makes, in the same order
     and for the same reasons — see the notes on them below. They are read off
     the stored quote because the stored quote IS the gateway's answer, kept
     verbatim in market.quotes.raw.

     Settled BEFORE the last gate, because they are about identity and it is
     about quality. A placeholder has no five years of bars and never will, so
     asking about the bars first would drop every one of them into the fan-out
     to be refused a second time, thirty seconds later. Which is the right
     order in general: what a record says about whether the company exists is
     worth more than how much of the company it has. */
  if (quote.notFound || quote.notPermissioned) return { use: "absent" };
  if (isPlaceholderInstrument(quote.symbol, quote.companyName)) return { use: "absent" };

  /* The last gate, and the only one that is about the QUALITY of the answer
     rather than about whether there is one.

     An enrolled symbol fills section by section, so there is a window — short
     for a name somebody has just opened, long for as long as the store is
     being filled for the first time — where the profile has landed and the
     five years of bars have not. Every rule above admits that record, and
     serving it is still the wrong answer: no chart, no returns, no notable
     moves, no technicals, and a degraded note across a company the slow path
     would have drawn whole. The bars are what the chart, the returns, the
     moves and the three local indicators are all measured from, which makes
     them the one section whose absence costs more than it saves.

     So a record without bars pays for the fan-out, once. The visit stamp the
     caller fires on the way past keeps the symbol enrolled, the refresher
     fills the gap behind this reader, and the next one gets the fast page.
     Empty counts as absent: a stored series of no bars draws the same nothing
     as no series at all. */
  const history = fromStored("history_daily", sections.history_daily);
  if (!history || history.length === 0) return { use: "gateway" };

  /* The news travels in its own section on its own six-hour cadence, because
     leaving it inside the company record would make a company look revised
     every time a wire moved. The assembly reads it back off `ticker_news`,
     where the gateway puts it, so it is put back here. */
  const news = fromStored("news_gateway", sections.news_gateway);
  const fundamentals: RawFundamentals = news ? { ...profileDoc, ticker_news: news } : profileDoc;

  const actions = fromStored("corporate_actions", sections.corporate_actions);
  const financials = fromStored("financials_annual", sections.financials_annual);
  const shortInterest = fromStored("short_interest", sections.short_interest);
  const market = fromStored("history_daily", record.market?.history_daily);

  /* RSI, the fifty-day average and the twenty-day average, computed here
     rather than fetched — three of the gateway path's eleven calls, and every
     one of them arithmetic over a series already in hand. The repair is
     deliberately redone rather than borrowed: the assembly repairs the same
     bars against the same record a moment later, and an indicator measured off
     the raw series while the chart above it is measured off the repaired one
     would disagree with the chart by a whole split.

     Withheld entirely when the repair leaves nothing to measure. The gate
     above means there were bars; `toPricePoints` can still discard every one
     of them. An indicator document carrying no readings is a truthful shape,
     but nulls are what the gateway path hands `toTechnicalRead` for a call
     that did not answer, and the panel already draws that case. */
  const daily = toPricePoints(repairAgainst(history, splitRecord(actions)));
  const indicators =
    daily.length > 0 ? indicatorsFromDaily(daily) : { rsi: null, sma: null, ema: null };

  /* The whole second wave, already done. market_instrument joins the peers to
     their stored quotes and to the trailing-year figure the history job
     derived, so one batched quote call and up to sixteen per-peer calls
     collapse into rows that arrived with the record. */
  const peers: PeerQuote[] = (Array.isArray(record.peers) ? record.peers : [])
    .slice(0, MAX_PEERS)
    .map((p) => ({
      id: p.s,
      name: presentation(p.s, p.name).name,
      price: p.px,
      /* Passed through as the store holds it, which is one honest figure short
         of the gateway path: market.quotes keeps a `chg_known` flag for the
         names the gateway prices but sends no change for, and market_instrument
         does not select it onto a peer row. Such a peer reads as flat rather
         than as a dash. The fix is a column in the RPC, not a guess here. */
      chg: p.chg,
      ret1y: p.ret1y,
      /* Already in dollars: toSweepRow multiplies the quotes feed's millions
         out before the row is stored, where the gateway path has to do it
         itself. */
      marketCap: p.mcap,
      pe: p.pe !== null && p.pe > 0 ? p.pe : null,
    }));

  /* Failures the store can see and the assembly cannot.
   *
   * The assembly finds its own — no company record, no filings, an unreadable
   * corporate-actions document, no price history — from the nulls above, so
   * those are not repeated here. Short interest is the one absence it has no
   * name for, and on this path an absence is a fact worth reporting: a section
   * with no stored payload has never been fetched successfully, and the panel
   * that would have drawn it is empty because of that rather than because the
   * company has no filing. */
  const failures: string[] = [];
  if (!shortInterest) failures.push("short interest");

  const inputs: InstrumentInputs = {
    ticker,
    quote,
    sector: SECTORS[ticker] ?? null,
    fundamentals,
    financials,
    actions,
    history,
    indicators,
    shortInterest,
    /* The day view loads in the browser now, on both paths. */
    intraday: null,
    market,
    /* The store observes whether the analyst door is open, not what is behind
       it — its whole payload is an HTTP status. A shut door is reported as the
       failure it is, so the panel says "not available on this account" exactly
       as it does on the gateway path. An OPEN door is reported as nothing at
       all: the entitlement would have landed and the store has no consensus to
       hand over, and "we could not find out" is the honest answer to that,
       where synthesising an empty record would print "no analyst coverage"
       about a company the street may cover heavily. */
    analyst: analystFrom(sections.analyst),
    articles: null,
    peers,
    failures,
    /* Epoch milliseconds throughout the `market_*` surface — see the note at
       the top of store/types.ts. Handing the raw number to a field declared
       `string | null` type-checks all the way to a freshness badge reading
       fifty thousand years. */
    storedAt: isoFrom(record.meta?.profile?.fetchedAt),
  };

  /* Same rule as the gateway path: peers the company named but nothing could
     price are a degraded panel, not an empty one. profileFrom is a field read
     over two documents already in memory. */
  if (peers.length === 0 && profileFrom(inputs).peers.length > 0) failures.push("peers");

  return { use: "store", inputs };
}

function analystFrom(payload: unknown): InstrumentInputs["analyst"] {
  const observed = fromStored("analyst", payload);
  if (!observed || observed.ok) return undefined;
  return {
    ok: false,
    error: `analyst paths answer ${observed.status}`,
    status: observed.status,
    ms: 0,
  };
}

function isoFrom(epochMs: number | null | undefined): string | null {
  if (typeof epochMs !== "number" || !Number.isFinite(epochMs)) return null;
  return new Date(epochMs).toISOString();
}

/**
 * The fetch this file writes with, which must never be the one Next patched.
 *
 * Next replaces `globalThis.fetch` during a build and inside the server, and
 * the replacement reads the render's own work-unit store: a `cache: "no-store"`
 * request — which is every RPC in store/client.ts — reaches
 * patch-fetch.js:854, falls through that switch for a `prerender-legacy` store,
 * and lands in dynamic-rendering.js:238, which sets `revalidate = 0` on the
 * render and throws DynamicServerError. That is the correct behaviour for a
 * page reading live data. It is catastrophic for a stamp nobody is waiting on:
 * `revalidate = 0` is collected at app-render.js:4258 and turned into a cache
 * control of zero, and export/routes/app-page.js:60 then writes no static
 * output at all. The throw itself is swallowed by `rpc`, so the page still
 * renders and nothing says a word — the only symptom is that /terminal/[ticker]
 * silently stops being prerendered and stops filling its ISR entry, and every
 * request pays the eight-to-thirty-second fan-out this whole layer exists to
 * remove. It would have shown up only in production, because the stamp is
 * guarded on a store configuration that dev and CI do not have.
 *
 * So the stamp goes around the patch, to the original fetch Next keeps a
 * handle on. `_nextOriginalFetch` is the dedupe wrapper, and dedupe-fetch.js:88
 * opts out of deduplication whenever a signal is set, which `rpc` always sets —
 * so this is the plain platform fetch, with nothing between it and the socket
 * that has an opinion about the render it happens to be inside.
 *
 * Null when fetch is patched and the handle is not there, which is a shape
 * only a future version of Next can produce. A lost visit stamp costs one
 * refresh cycle of priority; a lost prerender costs every reader of the symbol
 * thirty seconds. Given the choice this drops the stamp.
 *
 * Exported for tests/instrument-store-path.test.ts, which is the only way this
 * can fail loudly: the bug it prevents is silent in production and invisible
 * in dev, so the guarantee has to be an assertion rather than a comment.
 */
type MaybePatchedFetch = typeof fetch & {
  __nextPatched?: boolean;
  _nextOriginalFetch?: typeof fetch;
};

export function unpatchedFetch(): typeof fetch | null {
  const current = globalThis.fetch as MaybePatchedFetch | undefined;
  if (typeof current !== "function") return null;
  // Not in a render at all — the worker, the probe, `node --test`.
  if (current.__nextPatched !== true) return current;
  return typeof current._nextOriginalFetch === "function" ? current._nextOriginalFetch : null;
}

/**
 * Mark this symbol as visited, and never let it cost the reader anything.
 *
 * The refresher enrols on visits: a name somebody opened is worth keeping warm
 * and rises to priority 2 in the cadence table, which is how the store fills
 * itself along the paths readers actually walk. It is fired on the store path
 * too, because a hit is exactly the evidence that this name deserves to stay
 * warm.
 *
 * Called only once the symbol has been shown to be a company — after the
 * stored record survives its own refusals, or after the gateway quote survives
 * the same ones. market_touch_visit INSERTs a `market.symbols` row for whatever
 * string it is handed and enrols it on six sections, so firing it on the way in
 * would let any anonymous request to /terminal/<sixteen characters of nonsense>
 * write a row and queue six refresh jobs for a name that can only ever error
 * and back off. The page is public; the write has to be earned.
 *
 * Deliberately not awaited. The stamp is worth a round trip to Mumbai only if
 * that round trip is somebody else's; a visit lost to a process that finished
 * first costs one refresh cycle of priority and nothing else. Guarded on
 * `storeConfigured` so a dev machine with no Supabase does not open a socket
 * per page view, given a fetch of its own so it cannot bail the page out of
 * static generation (see above), and caught unconditionally so an unhandled
 * rejection can never take down a render that had already succeeded.
 */
function markVisited(ticker: string): void {
  if (!storeConfigured()) return;
  const fetchImpl = unpatchedFetch();
  if (!fetchImpl) return;
  /* client.ts calls `fetchImpl` a test seam. This is the second caller and the
     reason it has to stay: there is no other handle on a fetch that Next has
     not wrapped. */
  void touchVisit(ticker, { fetchImpl }).catch(() => {});
}

/**
 * A promise flattened into the shape `Promise.allSettled` produces.
 *
 * The one caller left is the quote retry, and the shape is the point there:
 * `quoteVerdict` reads a settled result, so a re-ask has to arrive wearing the
 * same clothes as the element of the fan-out it replaces.
 *
 * It was also what let a call be started before anything awaited it — a
 * promise that can reject with nobody listening, which Node has thrown on by
 * default since v15 — and attaching both handlers at the moment the call is
 * made is what made that safe. Nothing does that any more: the news pool was
 * the one call worth starting early, and it has left the render entirely.
 */
function asSettled<T>(pending: Promise<T>): Promise<PromiseSettledResult<T>> {
  return pending.then(
    (v) => ({ status: "fulfilled", value: v }) as const,
    (reason: unknown) => ({ status: "rejected", reason }) as const,
  );
}

export const getInstrumentSnapshot = cache(
  async (rawTicker: string): Promise<InstrumentSnapshot | null> => {
    const ticker = decodeURIComponent(rawTicker).trim().toUpperCase();
    if (!ticker) return null;

    const now = nowMs();
    const startedAt = Date.now();

    /* ---- the fast path ---- */
    const stored = await readStored(ticker);

    if (stored.use === "absent") return null;

    if (stored.use === "store") {
      /* The record answered, which means the quote in it said this is a
         company. That is the evidence the stamp needs, and a hit is exactly
         the name worth keeping warm. */
      markVisited(ticker);
      /* One RPC and nothing else. `inputs.articles` is already null and stays
         that way: this used to await the news provider here, which was the
         whole of what a filled-store page still cost a reader. */
      return shippedWithPage(assembleInstrument(stored.inputs, now));
    }

    /* ---- the gateway fan-out, unchanged ---- */

    /* Loaded HERE, not above the store read, and the move is the fix.
     *
     * These three are the only things this file takes from cache-layer.ts and
     * every one of them is called below, on this path. Imported before the
     * store read they were pulled into every instrument render — including the
     * ones the store answers in under a second and returns from without ever
     * calling them — and a dynamic import is not free: it is the first time a
     * build worker or a cold instance resolves, reads and evaluates that
     * module's whole graph, which reaches next/cache and the news clients.
     * Unmeasured, on the critical path, for a module the fast path does not
     * use. A deployed build put three pages past Next's sixty-second limit
     * having reached the store read about sixty-one seconds in, with the store
     * itself answering those symbols in under half a second when asked
     * directly; this import is what sat in front of it.
     *
     * The reason it is dynamic at all is unchanged: `next/cache` does not
     * resolve in a plain Node process — the rule the whole of lib/api and
     * lib/market/store is written to, so the refresh worker and the probe can
     * share the real client code — and a static import would make this file
     * unloadable outside a Next render, taking `inputsFromStored` with it. The
     * module registry still hands back the same instance on every call after
     * the first; the difference is which renders pay for the first. */
    const importedAt = Date.now();
    const { getCorporateActions, getFinancials, getFundamentals } =
      await import("../api/cache-layer.ts");
    const importMs = Date.now() - importedAt;
    if (importMs > 100) console.info(`instrument ${ticker}: cache-layer import ms=${importMs}`);

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
      marketS,
      analystS,
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
      fetchHistory(MARKET_PROXY, "5y", TTL.history1m, [TAGS.history]),
      /* 403 today on every analyst path. It rides the fan-out anyway so the
         refusal is observed per request rather than assumed, and so the panel
         fills itself the day the entitlement arrives. allSettled means the
         refusal cannot take the page down. */
      fetchAnalystConsensus(ticker, TTL.fundamentals, [TAGS.fundamentals]),
    ]);

    /* The quote decides whether this page exists at all. A ticker the gateway
       does not know, or will not quote to this account, is a 404 rather than a
       page of dashes wearing a name we cannot price.

       But only a gateway that ANSWERED may send a reader to a 404 — the
       reasoning is in quote-verdict.ts. A call that failed says nothing about
       whether the company exists, and returning null for it turns "we were not
       told" into a durable claim that it does not exist: the page calls
       notFound() and Next bakes the 404 into the prerender. A clean build
       shipped exactly that on all six covered tickers, and the same fault was
       caught live in dev, where this route answered "Stock not found" and then
       200 on the very next request. It is also why a store MISS lands here
       rather than returning null a few lines above.

       So a failed call is retried once — the observed failure recovered
       immediately, and one extra call on the failure path is cheap against
       shipping a 404 for Apple. If it fails again this throws rather than
       returning null. A thrown render is not cached, so the next request tries
       again, which is the honest outcome for not knowing.

       The re-ask deliberately carries the SAME cache options as the first.
       Passing noStore here was a bug: `cache: "no-store"` inside a static
       render reaches patch-fetch.js:854, and for a prerender-legacy store
       dynamic-rendering.js:238 sets revalidate = 0 and throws
       DynamicServerError before the request leaves the process — so the retry
       contacted nothing, http.ts reported a dead socket, and a single blip
       killed the build. A bit-identical repeat is genuinely a fresh call:
       patch-fetch.js:664 writes the Data Cache only on `res.status === 200`,
       so no failure is ever stored for it to re-read, and dedupe-fetch.js:88
       opts out of deduplication whenever a signal is set, which http.ts:38
       always does. */
    let settled: PromiseSettledResult<ApiResult<RawEquityQuote[]>> = quoteS;

    /* Each re-ask waits longer than the last, because the failure being absorbed
       is contention and an instant repeat re-enters the same crowd it just lost
       to. reconnectDelay is the socket's curve, but the shape is generic: half
       fixed so a retry can never become a hot loop, half jittered so parallel
       build workers do not all come back at the same instant. */
    for (let attempt = 1; attempt <= QUOTE_RETRIES; attempt += 1) {
      if (quoteVerdict(settled) !== "unavailable") break;
      await new Promise((resolve) => setTimeout(resolve, reconnectDelay(attempt)));
      settled = await asSettled(fetchQuotes([ticker], TTL.sweep, [TAGS.quotes]));
    }

    if (quoteVerdict(settled) === "unavailable") {
      throw new Error(
        `Quote unavailable for ${ticker} after ${QUOTE_RETRIES} retries. Refusing to answer 404 ` +
          `for a gateway that never said the symbol is absent.`,
      );
    }

    const quotes = dataOf<RawEquityQuote[]>(value(settled, undefined));
    const quote = quotes?.[0];
    if (!quote || quote.notFound || quote.notPermissioned) return null;

    /* The last reason to refuse a page, and the only durable one left: the
       symbol is an exchange placeholder rather than a company.

       This used to be `isQuotable`, which also requires a price above zero.
       That is the right rule for a movers board — a row needs a number to put
       in it — and the wrong rule for a page. A halted stock, a name on its
       first day, or any company quiet enough that the gateway sends no last or
       closing price was told it did not exist. The price now flows through as
       null and the header renders a dash: CompanyProfile.price is already
       `number | null` and price-header.tsx already draws that case.

       Note this must NOT go through quoteVerdict and the retry above it. A
       priceless quote is deterministically priceless on a second ask, so
       routing it there would turn a quiet company into a thrown render and,
       during a build, into a failed deploy. */
    if (isPlaceholderInstrument(quote.symbol, quote.companyName)) return null;

    /* Past every refusal, so this is a real listing with a real page. Now the
       store may hear about it: the fan-out below is the cost this stamp exists
       to stop the next reader paying. */
    markVisited(ticker);
    console.info(`instrument ${ticker}: gateway fan-out ms=${Date.now() - startedAt}`);

    const inputs: InstrumentInputs = {
      ticker,
      quote,
      sector: SECTORS[ticker] ?? null,
      fundamentals: dataOf<RawFundamentals>(value(fundamentalsS, undefined)),
      financials: dataOf<RawFinancials>(value(financialsS, undefined)),
      actions: dataOf<RawCorporateActions>(value(actionsS, undefined)),
      history: dataOf<RawHistoryPoint[]>(value(historyS, undefined)),
      indicators: {
        rsi: dataOf(value(rsiS, undefined)),
        sma: dataOf(value(smaS, undefined)),
        ema: dataOf(value(emaS, undefined)),
      },
      shortInterest: dataOf<RawShortInterest>(value(shortS, undefined)),
      /* The day view is fetched by the browser now, not here. It was the one
         call on this page with a horizon under half an hour, and the reader
         waited on it along with the other twelve. */
      intraday: null,
      market: dataOf<RawHistoryPoint[]>(value(marketS, undefined)),
      analyst: value(analystS, undefined),
      /* The wider news pool is the browser's call now, on both paths. It was
         the last third-party call in the render and the most expensive one
         left — see the note at the top of this file. The gateway's own three
         headlines are already inside the fundamentals document above, so the
         rail still renders with the page. */
      articles: null,
      /* Both filled by the wave below, which cannot start until the company
         record has named the peers. */
      peers: [],
      failures: [],
      /* The gateway path has no stored row behind it, so there is no date to
         show a reader. */
      storedAt: null,
    };

    /* ---- peers, in one batched call ---- */
    const profile = profileFrom(inputs);
    const peerIds = profile.peers.slice(0, MAX_PEERS);
    if (peerIds.length > 0) {
      let peers: PeerQuote[] = [];
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
        inputs.failures.push("peers");
      }

      /* One trailing year per peer, so every row of the comparison measures
         the same window. Two cached calls per peer, fanned out rather than
         chained; warm page cost was unchanged at ~0.34s. This is the wave the
         store path does not have to run at all — market_instrument joins the
         same figure out of each peer's stored history.

         The corporate actions are not optional. Measuring the raw series
         alone put Netflix at −93.3% off a $80.58 price — a ten-for-one split
         the vendor had not applied, read as a collapse. The subject's series
         is repaired the same way in the assembler, and a peer column that
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
          const settledHistory = histories[i];
          const raw =
            settledHistory.status === "fulfilled" && settledHistory.value.ok
              ? settledHistory.value.data
              : null;
          if (!raw) return { ...c, ret1y: null };
          const peerRecord = splitRecord(dataOf<ActionsRecord>(value(actionsList[i], undefined)));
          return { ...c, ret1y: returnsAgainst(raw, peerRecord).ret1y };
        });
      }

      inputs.peers = peers;
    }

    return shippedWithPage(assembleInstrument(inputs, now));
  },
);

/**
 * The store read, with every way it can go wrong flattened to "fall back".
 *
 * `readInstrument` already returns rather than throws — an unconfigured store
 * is `ok: false`, not an exception — so the catch is for the import itself and
 * for anything next/cache decides to throw inside a render it does not like.
 * Whatever the reason, the answer is the same one, and it is the answer this
 * whole layer is built to guarantee: the reader gets the slow page, not a
 * blank one.
 */
async function readStored(ticker: string): Promise<StoredRead> {
  if (!storeConfigured()) return { use: "gateway" };
  const started = Date.now();
  try {
    const { readInstrument } = await import("./store/reads.ts");
    const { gateStats } = await import("./store/gate.ts");

    let timer: ReturnType<typeof setTimeout> | undefined;
    const budget = new Promise<null>((resolve) => {
      timer = setTimeout(() => resolve(null), STORE_BUDGET_MS);
    });

    try {
      const result = await Promise.race([readInstrument(ticker), budget]);
      const ms = Date.now() - started;

      /* EVERY way off the fast path writes one line, because the one that did
         not is how a ninety-second page went undiagnosed: the budget expired
         in silence, the fan-out below ran in silence, and the log for the
         whole incident was empty. The gate figures are what separate "the
         store was slow" from "this process was queueing on itself". */
      if (!result) {
        const g = gateStats();
        console.warn(
          `market store: instrument ${ticker} gave up after ${ms}ms ` +
            `(gate active=${g.active}/${g.limit} waiting=${g.waiting}); falling back to the gateway`,
        );
        return { use: "gateway" };
      }
      /* A failure has already been logged where it was seen (guardStore); an
         unconfigured store is not worth a line. */
      if (!result.ok) return { use: "gateway" };

      const read = inputsFromStored(result.data, ticker);
      if (read.use === "gateway") {
        console.warn(
          `market store: instrument ${ticker} record not usable after ${ms}ms ` +
            `(enrolled=${result.data.enrolled}); falling back to the gateway`,
        );
      } else {
        console.info(`market store: instrument ${ticker} ${read.use} ms=${ms}`);
      }
      return read;
    } finally {
      clearTimeout(timer);
    }
  } catch (e) {
    console.warn(
      `market store: instrument ${ticker} read threw after ${Date.now() - started}ms: ` +
        `${e instanceof Error ? e.message : String(e)}; falling back to the gateway`,
    );
    return { use: "gateway" };
  }
}
