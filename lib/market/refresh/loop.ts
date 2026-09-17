import { stableAnswer } from "../../api/cache-policy.ts";
import { fetchAnalystConsensus } from "../../api/clients/analysts.ts";
import { fetchFinancials } from "../../api/clients/financials.ts";
import {
  fetchCorporateActionsUncached,
  fetchFundamentalsUncached,
} from "../../api/clients/fundamentals.ts";
import { chunk, fetchHistory } from "../../api/clients/quotes.ts";
import { fetchShortInterest } from "../../api/clients/technicals.ts";
import { scrub, type ApiResult } from "../../api/errors.ts";
import { INDEX_ETF_SYMBOLS } from "../../api/normalize/index-proxy.ts";
import { SECTOR_ETF_SYMBOLS } from "../../api/normalize/sector.ts";
import { pooled } from "../../api/pool.ts";
import { runSweep, type Snapshot, type SweepRow } from "../../api/sweep.ts";
import { TAGS, TTL } from "../../api/ttl.ts";
import { hotList } from "../hot-list.ts";
import { pricesMove, sessionAt } from "../session.ts";
import {
  claimDue,
  complete,
  enrol,
  seedSymbols,
  setHot,
  storeConfigured,
  upsertQuotes,
} from "../store/client.ts";
import { errorBackoffMs, nextCheckAt } from "../store/cadence.ts";
import { canonicalise, fromStored, hashOf, sourceUpdatedAt, toStored } from "../store/sections.ts";
import type { Section } from "../store/sections.ts";
import {
  HOME_TAG,
  MAX_TAGS,
  QUOTES_TAG,
  symbolTag,
  type ClaimedJob,
  type QuoteUpsertRow,
  type SeedSymbolRow,
} from "../store/types.ts";
import { CALENDAR_TICKERS, COVERED, TRADABLE, WIRE_TICKERS } from "../universe.ts";
import {
  CONCURRENCY_CEILING,
  backoffFor,
  dueSweep,
  pace,
  priorityFor,
  sectionsFor,
  type LastSweeps,
  type PrioritySets,
} from "./plan.ts";

/* The background refresher: the only thing in this codebase that writes to the
 * market store.
 *
 * It exists because the gateway offers no change feed. "Has this company's
 * filing changed" can only be answered by fetching the document and comparing
 * it with the one already held, so the saving is never in asking cheaply — it
 * is in not asking, and in writing nothing when the answer comes back
 * identical. Both halves live elsewhere: ../store/cadence.ts decides when to
 * ask, ../store/sections.ts decides whether the answer is news. What is left
 * here is the doing.
 *
 * ONE MODULE, TWO ENTRY POINTS, and they must never both be live:
 *
 *   - scripts/refresh-worker.mts, run as the Render `platizio-refresh` worker
 *     or from a laptop for the one-time bootstrap;
 *   - instrumentation.ts, when REFRESH_IN_PROCESS=1, inside the web service.
 *
 * Two loops against one store is not a correctness problem — every claim is a
 * lease taken with FOR UPDATE SKIP LOCKED, so concurrent workers take disjoint
 * rows — but it is two gateway logins and twice the request budget for the
 * same work. render.yaml says so where the switch is set.
 *
 * Relative imports with .ts extensions throughout, and nothing from next/*:
 * this module is loaded by `node --conditions=react-server`, where the
 * bundler's `@/` alias does not exist and next/cache does not resolve.
 *
 * Resumable at every step. The bootstrap's four stages are each idempotent —
 * seeding an unchanged master writes nothing, enrolling a name twice returns
 * 0 — and the steady loop holds no state that matters beyond a claim's
 * fifteen-minute lease. A worker killed mid-batch loses at most the requests
 * that were in flight.
 */

/* ------------------------------------------------------------------ */
/* Sizes                                                               */
/* ------------------------------------------------------------------ */

/** What market_seed_symbols is documented to take per call. */
const SEED_CHUNK = 2_000;

/* Quotes carry the whole raw quote alongside the row, so a chunk is roughly
   two megabytes of JSON at this size. Larger is one fewer round trip and a
   request body PostgREST has to buffer whole; smaller is more round trips to
   Mumbai for no gain. */
const QUOTE_CHUNK = 500;

/* Enrolment is symbols × sections rows in one statement: a thousand names on
   six sections is six thousand inserts, which is a comfortable statement and
   an uncomfortable one at ten times that. */
const ENROL_CHUNK = 1_000;

/** market_claim_due caps at 200; sixty is a batch that finishes inside a lease. */
const CLAIM_LIMIT = 60;

/** Nothing due. Long enough not to poll a database for sport. */
const IDLE_MS = 20_000;

/** The floor between two request starts — about sixteen a second. See `pace`. */
const MIN_GAP_MS = 60;

/* A batch that failed more than a fifth of the time gets a minute of quiet as
   well as half the workers. A gateway that is throttling or down needs time,
   and retrying it sooner with fewer workers is still retrying it sooner. */
const COOLDOWN_MS = 60_000;

/** Tags are gathered for five seconds before being posted, then batched at 200. */
const REVALIDATE_DEBOUNCE_MS = 5_000;

const REVALIDATE_TIMEOUT_MS = 10_000;

/* ------------------------------------------------------------------ */
/* Options                                                             */
/* ------------------------------------------------------------------ */

export type RefresherOptions = {
  /** One pass, then stop. What `--once` gives the worker script. */
  once?: boolean;
  /** Seed, sweep and enrol before falling into the loop. */
  bootstrap?: boolean;
  concurrency?: number;
  /** Structured single lines. Defaults to stdout. */
  log?: (line: string) => void;
};

export type Refresher = {
  /**
   * Finish what is in flight and come back.
   *
   * Resolves once the batch that was running has completed and the pending
   * revalidations have been posted; leaves no timer behind, so a Node process
   * whose only work was this loop exits on its own afterwards.
   *
   * Under `once` it is a wait rather than a stop: the run already ends after
   * one pass, and this resolves when that pass and its revalidations are done.
   */
  stop: () => Promise<void>;
};

const message = (e: unknown): string =>
  scrub(e instanceof Error ? (e.message ? `${e.name}: ${e.message}` : e.name) : String(e));

const iso = (ms: number): string => new Date(ms).toISOString();

/* ------------------------------------------------------------------ */
/* Who is worth watching                                               */
/* ------------------------------------------------------------------ */

/* The fourteen tracking funds, taken from the two normalisers that declare
   them rather than re-derived here: every index tab and every sector card is
   drawn from these quotes, so a list that drifted from theirs would leave a
   strip reading a price nothing refreshed. */
const STRIP_SYMBOLS = [...INDEX_ETF_SYMBOLS, ...SECTOR_ETF_SYMBOLS];

function prioritySets(hot: readonly string[]): PrioritySets {
  return {
    covered: new Set<string>(COVERED),
    strip: new Set(STRIP_SYMBOLS),
    wire: new Set<string>(WIRE_TICKERS),
    calendar: new Set<string>(CALENDAR_TICKERS),
    hot: new Set(hot),
  };
}

/** Everybody somebody is actually looking at, each name once. */
const ATTENDED: string[] = [
  ...new Set([...COVERED, ...STRIP_SYMBOLS, ...WIRE_TICKERS, ...CALENDAR_TICKERS]),
];

/* ------------------------------------------------------------------ */
/* Telling the web service something changed                           */
/* ------------------------------------------------------------------ */

/**
 * The tag batcher behind POST /api/revalidate.
 *
 * Debounced rather than sent per job because a batch of sixty jobs routinely
 * touches one symbol two or three times — its profile and its history both
 * moved — and marking a cache entry stale twice is not two units of work. Five
 * seconds is long enough to collect a whole batch and short enough that a
 * reader who lands during the gap sees the previous render rather than a wait.
 *
 * Every failure is swallowed into a log line. A web service that is redeploying,
 * a SITE_URL that is wrong and a 401 from a rotated CRON_SECRET are all reasons
 * a page stays on its own timer for a while; none of them is a reason to stop
 * refreshing the data underneath it, which is the part that cannot be caught up
 * later.
 */
function createRevalidator(log: (line: string) => void) {
  const pending = new Set<string>();
  let timer: ReturnType<typeof setTimeout> | null = null;
  let warnedNoSite = false;

  async function post(tags: string[]): Promise<void> {
    const site = (process.env.SITE_URL ?? "").replace(/\/+$/, "");
    if (!site) {
      /* Once, not per batch. A worker filling the store from a laptop has no
         site to tell, and a line per flush would bury everything else. */
      if (!warnedNoSite) {
        warnedNoSite = true;
        log("refresh revalidate skipped=no-site-url");
      }
      return;
    }

    const secret = process.env.CRON_SECRET;
    try {
      const res = await fetch(`${site}/api/revalidate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(secret ? { Authorization: `Bearer ${secret}` } : {}),
        },
        body: JSON.stringify({ tags }),
        signal: AbortSignal.timeout(REVALIDATE_TIMEOUT_MS),
      });
      log(`refresh revalidate tags=${tags.length} status=${res.status}`);
    } catch (e) {
      log(`refresh revalidate tags=${tags.length} error=${message(e)}`);
    }
  }

  async function flush(): Promise<void> {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
    if (pending.size === 0) return;
    const tags = [...pending];
    pending.clear();
    for (const part of chunk(tags, MAX_TAGS)) await post(part);
  }

  return {
    add(tags: readonly string[]): void {
      for (const tag of tags) pending.add(tag);
      if (timer === null) {
        timer = setTimeout(() => {
          timer = null;
          void flush();
        }, REVALIDATE_DEBOUNCE_MS);
      }
    },
    flush,
  };
}

/* ------------------------------------------------------------------ */
/* One job                                                             */
/* ------------------------------------------------------------------ */

/**
 * The gateway call behind each section.
 *
 * `profile` and `news_gateway` are the same document read twice, on two
 * cadences, and that is deliberate rather than an oversight: the gateway
 * bundles a rolling news feed into the company record, the company record
 * changes a few times a year and the feed several times a day, and ../store/
 * sections.ts splits them precisely so the daily half does not rewrite the
 * annual half's row.
 *
 * Every call is uncached — `noStore`, or the `*Uncached` variant. The worker's
 * whole job is to find out whether the upstream answer has changed, and a
 * memoised answer cannot tell it that.
 */
function fetchSection(job: ClaimedJob): Promise<ApiResult<unknown>> {
  const s = job.symbol;
  switch (job.section) {
    case "profile":
    case "news_gateway":
      return fetchFundamentalsUncached(s);
    case "corporate_actions":
      return fetchCorporateActionsUncached(s);
    case "financials_annual":
      return fetchFinancials(s, "annual", TTL.fundamentals, [TAGS.fundamentals], true);
    case "history_daily":
      return fetchHistory(s, "5y", TTL.history1m, [TAGS.history], true);
    case "short_interest":
      return fetchShortInterest(s, TTL.fundamentals, [TAGS.fundamentals], true);
    case "analyst":
      return fetchAnalystConsensus(s, TTL.fundamentals, [TAGS.fundamentals], true);
  }
}

/** What happened to one job, in the vocabulary market.refresh_log uses. */
type Outcome = "changed" | "unchanged" | "absent" | "error";

/* ------------------------------------------------------------------ */
/* The loop                                                            */
/* ------------------------------------------------------------------ */

export function startRefresher(opts: RefresherOptions = {}): Refresher {
  const log = opts.log ?? ((line: string) => console.log(line));
  const revalidator = createRevalidator(log);

  /* The most workers this run may use, and so the number it climbs back to
     after a retreat.

     REFRESH_CONCURRENCY arrives as opts.concurrency and an operator who lowers
     it means it. `backoffFor` on its own restores one worker per clean batch
     until it reaches plan.ts's ceiling, so a gateway backed off to four would
     be handed ten again six batches later and nothing in the dashboard would
     say why. It can only lower: CONCURRENCY_CEILING is measured against the
     gateway rather than chosen, and is not an operator's to raise. */
  const ceiling = Math.min(
    CONCURRENCY_CEILING,
    Math.max(1, Math.floor(opts.concurrency ?? CONCURRENCY_CEILING)),
  );

  let concurrency = ceiling;

  /* Raised by `stop`, and it means DRAIN: finish the request in flight, skip
     what has not started. It is deliberately not what `--once` runs on — see
     `stop` at the foot of this function — because a run asked for one complete
     pass and a run asked to go down now want opposite things from every check
     below. */
  let stopping = false;

  /* The hot list as the last full sweep left it. Null means "not known yet",
     which makes the first hot sweep a full one rather than a sweep of nothing. */
  let hot: string[] | null = null;
  const last: LastSweeps = { hot: 0, full: 0 };

  /* How many consecutive unchanged reads each section has had, which the
     cadence doubles on.

     It is held here rather than read from the row because market_claim_due
     does not hand it over — the claim carries version, hash, priority,
     attempts and the corporate-actions context, and nothing else. The database
     keeps the authoritative count (market_complete increments it); this is the
     worker's own running total, used only to pick the next interval. A restart
     resets it, so a long-dormant company walks out to its cap again from the
     base interval instead of resuming at it. That costs a handful of extra
     reads per name after a deploy and never produces a stale row, which is the
     right way round to be wrong. Bounded by the universe: at most one entry per
     enrolled symbol per section. */
  const streaks = new Map<string, number>();

  /* A sleep that `stop` can cut short, so shutting down does not wait out a
     twenty-second idle. One at a time by construction — only the loop body
     sleeps on it — and the handle is cleared on the way out so no timer
     survives `stop`. */
  let idleTimer: ReturnType<typeof setTimeout> | null = null;
  let wake: (() => void) | null = null;

  function idle(ms: number): Promise<void> {
    if (stopping || ms <= 0) return Promise.resolve();
    return new Promise<void>((resolve) => {
      wake = resolve;
      idleTimer = setTimeout(() => {
        idleTimer = null;
        wake = null;
        resolve();
      }, ms);
    });
  }

  function interrupt(): void {
    if (idleTimer !== null) {
      clearTimeout(idleTimer);
      idleTimer = null;
    }
    const w = wake;
    wake = null;
    w?.();
  }

  /* Pacing waits, unlike the idle wait, are measured in tens of milliseconds
     and several are outstanding at once, so they get a plain timer rather than
     the interruptible one. `stop` waits for the batch they belong to anyway. */
  const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

  /* ---------------- bootstrap ---------------- */

  async function seed(): Promise<void> {
    /* Renamed on the way in. symbol-master.json writes {s, n, ex} and
       market_seed_symbols reads 'symbol', 'name' and 'exchange' — hand it the
       master's own spelling and its `where` clause matches nothing, the insert
       writes nothing, and it returns 0, which is exactly what a re-seed of an
       unchanged universe returns. It would look like it worked. */
    const rows: SeedSymbolRow[] = TRADABLE.map((e) => ({
      symbol: e.s,
      name: e.n,
      exchange: e.ex,
    }));

    let written = 0;
    /* Counted as they are attempted rather than taken from the universe up
       front, because a drain can cut this loop after the first chunk and a line
       claiming all seven ran would be read the next morning as a seed that
       worked. `stopped=early` says the rest were never tried. */
    let symbols = 0;
    let chunks = 0;
    const parts = chunk(rows, SEED_CHUNK);
    for (const part of parts) {
      const res = await seedSymbols(part);
      if (!res.ok) log(`refresh seed chunk=${part.length} error=${res.error}`);
      else written += res.data ?? 0;
      symbols += part.length;
      chunks += 1;
      if (stopping) break;
    }
    log(
      `refresh seed symbols=${symbols} chunks=${chunks} written=${written}` +
        (chunks < parts.length ? ` of=${rows.length} stopped=early` : ""),
    );
  }

  async function enrolChunked(
    symbols: readonly string[],
    sections: Section[],
    priority: number,
  ): Promise<void> {
    let created = 0;
    /* Attempted, not intended — the same reason as `seed` above. */
    let enrolled = 0;
    const parts = chunk(symbols, ENROL_CHUNK);
    let chunks = 0;
    for (const part of parts) {
      const res = await enrol(part, sections, priority);
      if (!res.ok) log(`refresh enrol priority=${priority} error=${res.error}`);
      else created += res.data ?? 0;
      enrolled += part.length;
      chunks += 1;
      if (stopping) break;
    }
    log(
      `refresh enrol priority=${priority} symbols=${enrolled} ` +
        `sections=${sections.length} created=${created}` +
        (chunks < parts.length ? ` of=${symbols.length} stopped=early` : ""),
    );
  }

  /**
   * Take the universe on, attended names first.
   *
   * The two calls are not interchangeable and the order is not cosmetic.
   * `market_enrol` raises a priority with `greatest` and inserts sections with
   * ON CONFLICT DO NOTHING, so a name enrolled at 3 on all seven sections and
   * then again at 1 on six keeps its 3 and keeps its news row. The hot list is
   * filtered anyway — `priorityFor` is what says which names are already
   * attended — so the second call is the liquid remainder and nothing else.
   */
  async function enrolAll(hotSymbols: readonly string[]): Promise<void> {
    await enrolChunked(ATTENDED, sectionsFor("covered"), 3);
    if (stopping) return;
    const sets = prioritySets(hotSymbols);
    const rest = hotSymbols.filter((s) => priorityFor(s, sets) < 3);
    if (rest.length > 0) await enrolChunked(rest, sectionsFor("hot"), 1);
  }

  async function bootstrap(): Promise<void> {
    const started = Date.now();
    log("refresh bootstrap start");
    await seed();
    if (stopping) return;
    const snap = await sweep("full");
    if (stopping) return;
    await enrolAll(hot ?? (snap ? snap.rows.map((r) => r.s) : []));
    log(`refresh bootstrap done ms=${Date.now() - started}`);
  }

  /* ---------------- the sweep ---------------- */

  async function sweep(kind: "hot" | "full"): Promise<Snapshot | null> {
    const started = Date.now();
    let snap: Snapshot;
    try {
      snap = await runSweep({
        /* A hot sweep quotes what the last full one found liquid. Undefined
           means the whole tradable universe, which is also what a hot sweep
           falls back to before the first full one has run. */
        symbols: kind === "full" ? undefined : (hot ?? undefined),
        keepRaw: true,
        noStore: true,
      });
    } catch (e) {
      log(`refresh sweep kind=${kind} error=${message(e)}`);
      return null;
    }

    const sweptAt = iso(snap.sweptAt);
    let upserted = 0;
    let failed = 0;
    for (const part of chunk(snap.rows, QUOTE_CHUNK)) {
      const rows: QuoteUpsertRow[] = part.map((row: SweepRow) => ({
        ...row,
        raw: row.raw ?? null,
      }));
      const res = await upsertQuotes(rows, sweptAt);
      if (!res.ok) {
        failed += 1;
        log(`refresh quotes chunk=${rows.length} error=${res.error}`);
      } else {
        upserted += res.data?.upserted ?? 0;
      }
    }

    /* A full sweep has quoted everything the hot sweep would have, so it
       satisfies both timers. */
    last.hot = Date.now();
    const tags = [HOME_TAG];

    if (kind === "full") {
      last.full = last.hot;
      const list = hotList(snap);
      if (list) {
        hot = list;
        const res = await setHot(list);
        if (!res.ok) log(`refresh hot error=${res.error}`);
      } else {
        /* Too few names cleared the floor to be a real answer — a gateway blip
           rather than a market. Keeping the previous hot set is the safe half
           of hot-list.ts's own rule; the next full sweep decides again. */
        log(`refresh hot list=short rows=${snap.rows.length} kept=previous`);
      }
      tags.push(QUOTES_TAG);
    }

    /* A sweep that came back with nothing — every chunk refused, or a gateway
       answering an empty universe — has no news to announce, and marking the
       home page stale anyway would regenerate it against the rows it already
       holds. The same discipline the hash compare keeps for a section. */
    if (snap.rows.length > 0 || upserted > 0) revalidator.add(tags);
    log(
      `refresh sweep kind=${kind} requested=${snap.requested} rows=${snap.rows.length} ` +
        `calls=${snap.calls} failedChunks=${snap.failedChunks} upserted=${upserted} ` +
        `writeFailures=${failed} ms=${Date.now() - started}`,
    );
    return snap;
  }

  /* ---------------- one job ---------------- */

  async function runJob(job: ClaimedJob, now: number): Promise<Outcome> {
    const res = await fetchSection(job);

    /* The corporate-actions document travels with the claim for exactly two
       sections. The five-year series is measured against the split record —
       `returnsAgainst(raw, splitRecord(actions))` — and the annual filings are
       re-timed against the earnings dates in it. Handing it over with the job
       is what makes it impossible for the worker to derive a return from a
       split record it never read. */
    const actions = fromStored("corporate_actions", job.context);

    let stored: unknown = null;
    let payload: unknown = null;
    let absent = false;

    if (job.section === "analyst") {
      /* The one section whose content is the OBSERVATION rather than the
         document. Every analyst path answers 403 on this account, and the
         panel's job is to tell "we cannot see this" from "nobody covers this
         company" — so a failed call is the datum, not an error, and the day it
         becomes a 200 the hash changes and the row is written. */
      stored = toStored("analyst", { ok: res.ok, status: res.status });
    } else if (res.ok) {
      stored = toStored(job.section, res.data, { actions });
    } else if (stableAnswer(res.status)) {
      /* 404, 410 and 422: the gateway answered ABOUT the record and said there
         isn't one. That is a fact worth storing — it stops the section being
         retried on a five-minute error backoff forever — and market_complete
         reads the marker to log the outcome as 'absent'. It is passed on both
         the changed and the unchanged branch for that reason; the unchanged
         branch never writes it to the row. */
      absent = true;
      stored = { absent: true, status: res.status };
    } else {
      /* Everything else — a timeout, a 429, a 502, a socket that never opened
         — is a statement about the gateway at one instant and nothing about
         the company. The error goes back so the row backs off and keeps its
         payload, and the interval goes back with it: the claim carries the
         attempt count market_claim_due just incremented, so the worker can say
         what it decided and the row then holds the number the log names.

         market_complete has a fallback for the case this branch never hits — a
         worker that could not get far enough to decide — and it is reached
         through `coalesce`, so a value sent here always wins it. The two agree
         on the shape, five minutes trebling per attempt, and part company only
         at the top: the SQL caps the EXPONENT at four, a little under seven
         hours, where ../store/cadence.ts caps the interval itself at six. Six
         is the one that applies on this path. */
      const at = now + errorBackoffMs(job.attempts);
      const done = await complete({
        symbol: job.symbol,
        section: job.section,
        payload: null,
        hash: null,
        changed: false,
        error: res.error,
        nextCheckAt: iso(at),
        ms: res.ms,
      });
      if (!done.ok) log(`refresh complete symbol=${job.symbol} section=${job.section} error=${done.error}`);
      return "error";
    }

    const hash = hashOf(canonicalise(job.section, stored));
    const changed = hash !== job.contentHash;

    /* The payload is sent only when it is news. An unchanged read is the worker
       saying the stored document is still right, and rewriting it would churn
       the table, bump a version and mark a page stale for no new fact. The
       absent marker is the exception, and only so the log can name it. */
    payload = changed || absent ? stored : null;

    const key = `${job.symbol}|${job.section}`;
    const streak = changed ? 0 : (streaks.get(key) ?? 0) + 1;
    if (changed) streaks.delete(key);
    else streaks.set(key, streak);

    const at = nextCheckAt({
      section: job.section,
      changed,
      unchangedStreak: streak,
      priority: job.priority,
      now,
      phase: sessionAt(Math.floor(now / 1000)).phase,
      payload: stored,
      context: { actions },
    });

    const done = await complete({
      symbol: job.symbol,
      section: job.section,
      payload,
      hash,
      changed,
      error: null,
      nextCheckAt: iso(at),
      ms: res.ms,
      sourceUpdatedAt: sourceUpdatedAt(job.section, stored),
    });
    if (!done.ok) {
      log(`refresh complete symbol=${job.symbol} section=${job.section} error=${done.error}`);
      return "error";
    }

    return absent ? "absent" : changed ? "changed" : "unchanged";
  }

  /* ---------------- one batch ---------------- */

  async function batch(): Promise<number> {
    const claim = await claimDue(CLAIM_LIMIT);
    if (!claim.ok) {
      log(`refresh claim error=${claim.error}`);
      return 0;
    }

    const jobs = claim.data ?? [];
    if (jobs.length === 0) return 0;

    const started = Date.now();
    let issued = 0;

    const settled = await pooled(jobs, concurrency, async (job) => {
      /* The rate limit is a gap between STARTS rather than a worker count, so
         it has to be honoured by each worker as it picks a job up rather than
         by the pool as a whole. `pace` gives the moment; the clock lives
         here. */
      const at = pace(started, issued, MIN_GAP_MS);
      issued += 1;
      const wait = at - Date.now();
      if (wait > 0) await delay(wait);
      return runJob(job, Date.now());
    });

    const counts: Record<Outcome, number> = { changed: 0, unchanged: 0, absent: 0, error: 0 };
    const tags = new Set<string>();

    for (let i = 0; i < settled.length; i += 1) {
      const s = settled[i];
      if (s.status === "fulfilled") {
        counts[s.value] += 1;
        /* Only a changed section marks a page stale. That is the whole point of
           the hash compare: a symbol whose profile has not moved in nine days
           must not be regenerated every fifteen minutes. */
        if (s.value === "changed") tags.add(symbolTag(jobs[i].symbol));
      } else {
        /* A throw, as opposed to an ApiResult failure — nothing in lib/api
           throws, so this is a bug or an out-of-memory, and the lease simply
           expires in fifteen minutes. */
        counts.error += 1;
        log(`refresh job symbol=${jobs[i].symbol} section=${jobs[i].section} threw=${message(s.reason)}`);
      }
    }

    if (tags.size > 0) revalidator.add([...tags]);

    const rate = counts.error / jobs.length;
    /* `backoffFor` halves on a bad batch and restores one worker on a good one,
       up to plan.ts's ceiling; this run's own ceiling is the lower of that and
       what the host asked for. */
    const next = Math.min(ceiling, backoffFor(rate, concurrency));
    const retreated = next < concurrency;
    concurrency = next;

    log(
      `refresh batch claimed=${jobs.length} changed=${counts.changed} ` +
        `unchanged=${counts.unchanged} absent=${counts.absent} error=${counts.error} ` +
        `concurrency=${concurrency} ms=${Date.now() - started}`,
    );

    /* The minute of quiet is for the NEXT batch's sake, so it is skipped when
       there will not be one: a draining worker is leaving and a `--once` run
       has finished its pass, and both would only be sleeping on the way out. */
    if (retreated && !stopping && !opts.once) {
      log(`refresh cooldown ms=${COOLDOWN_MS} errorRate=${rate.toFixed(2)}`);
      await idle(COOLDOWN_MS);
    }

    return jobs.length;
  }

  /* ---------------- the pass ---------------- */

  /** One turn of the loop. Returns whether it found anything to do. */
  async function tick(): Promise<boolean> {
    /* A drain that landed while the bootstrap ran, or during the sleep before
       this pass, means the process is going down: a fresh full sweep is 276
       chunks it cannot finish and would only spend the gateway on the way out.
       The check inside the pass is what shortens one already under way. */
    if (stopping) return false;

    const now = Date.now();
    const phase = sessionAt(Math.floor(now / 1000)).phase;
    const due = dueSweep(now, last, phase);

    let worked = false;
    /* Full before hot: a full sweep covers everything a hot one would and
       clears both timers, so running both when both are due quotes the liquid
       names twice for nothing. */
    if (due.full) {
      await sweep("full");
      worked = true;
    } else if (due.hot) {
      await sweep("hot");
      worked = true;
    }
    if (stopping) return worked;

    const claimed = await batch();
    return worked || claimed > 0;
  }

  async function run(): Promise<void> {
    if (!storeConfigured()) {
      /* SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY. Without them every RPC
         would answer "store not configured" and the loop would spin writing
         nothing — worse than not starting, because it would still quote the
         gateway. */
      log("refresh disabled reason=store-not-configured");
      return;
    }

    log(
      `refresh start once=${opts.once === true} bootstrap=${opts.bootstrap === true} ` +
        `concurrency=${concurrency} phase=${sessionAt(Math.floor(Date.now() / 1000)).phase} ` +
        `pricesMove=${pricesMove(sessionAt(Math.floor(Date.now() / 1000)).phase)}`,
    );

    if (opts.bootstrap) await bootstrap();

    for (;;) {
      const worked = await tick().catch((e: unknown) => {
        /* A pass must not be able to kill the loop. Everything inside returns
           an ApiResult, so reaching here means something unforeseen — and the
           answer to that is the next pass, not a dead worker. */
        log(`refresh tick error=${message(e)}`);
        return false;
      });

      /* The stop check sits AFTER the pass rather than before it, so a drain
         that arrives while a pass is running never costs the work that pass
         has already paid the gateway for. `--once` returns here too, having
         had a pass nothing interrupted: it does not raise the drain flag at
         all, because the checks that make a drain quick — the one in `tick`
         between the sweep and the batch, and the ones through the bootstrap —
         would otherwise cut the single pass short and a `--once` run would
         sweep and claim nothing. */
      if (opts.once || stopping) return;
      if (!worked) {
        log(`refresh idle ms=${IDLE_MS}`);
        await idle(IDLE_MS);
      }
      if (stopping) return;
    }
  }

  const running = run();

  return {
    async stop(): Promise<void> {
      /* In `--once` mode this is a wait, not an interruption. The run has a
         finish line of its own — one pass — and the script asks for it by
         awaiting this handle straight away, which is the only way a caller
         holding `{ stop }` can wait for a loop that ends by itself. Raising
         the drain flag there would cut the very pass being waited for: a fresh
         worker always owes a full sweep, and the drain check between the sweep
         and the batch would then skip the batch every time rather than
         occasionally. A `--once` run that must go down NOW goes down on a
         second signal, which the worker script answers by exiting. */
      if (!opts.once) {
        stopping = true;
        interrupt();
      }
      await running;
      /* Posts whatever the last batch gathered and clears the debounce timer,
         so nothing is left holding the event loop open. */
      await revalidator.flush();
      log("refresh stopped");
    },
  };
}
