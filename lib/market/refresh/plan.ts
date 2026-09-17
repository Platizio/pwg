import { pricesMove, type SessionPhase } from "../session.ts";
import { SECTIONS, type Section } from "../store/sections.ts";

/* The refresher's arithmetic, with nothing in it that can fail.
 *
 * The loop next door talks to two networks at once — the gateway and the
 * store — and holds a lease on rows a second worker may also want. None of
 * that can be reached by `node --test`, so everything the loop DECIDES is
 * lifted out to here and the loop is left with the doing: which sections a
 * name is worth enrolling on, what attention it has earned, whether a sweep is
 * owed, how far apart two request starts have to be, and how many workers to
 * run after a batch went badly.
 *
 * No clock, no randomness, no network, exactly as ../store/cadence.ts next
 * door: `now` arrives as an argument so the answer is the same in a test, in a
 * log line and on the second read a day later.
 *
 * Relative imports with .ts extensions and no `@/`: this module is loaded from
 * a plain Node process, where the bundler's alias does not exist.
 */

const MINUTE = 60_000;
const HOUR = 3_600_000;

/* ------------------------------------------------------------------ */
/* What a name is enrolled on                                          */
/* ------------------------------------------------------------------ */

/**
 * Why a symbol is in the queue at all.
 *
 * "covered" is the attended universe rather than the six pages: the covered
 * names, the fourteen tracking funds, the wire and the calendar all get the
 * same treatment, because all four are read on a screen somebody has open.
 */
export type EnrolKind = "covered" | "hot" | "visited";

/**
 * The sections to enrol a symbol of this kind on.
 *
 * Everything but `news_gateway` for the hot list and for a name a reader has
 * merely opened. The gateway bundles three articles into the fundamentals
 * document, and they are drawn in exactly one place — the wire strip on the
 * terminal's front page. Enrolling the whole liquid universe on a six-hourly
 * news re-read would be roughly four thousand calls every six hours spent on
 * headlines nothing renders, which is most of the refresher's budget. The same
 * rule is written into `market_touch_visit` in the migration, which enrols a
 * first-time visit on these same six sections.
 *
 * A fresh array each call, deliberately. The result goes straight to
 * `market_enrol` and is reused across bootstrap chunks; a shared array that
 * one caller sorted or spliced would re-enrol the next batch on the wrong
 * sections, and nothing would say so.
 */
export function sectionsFor(kind: EnrolKind): Section[] {
  if (kind === "covered") return [...SECTIONS];
  return SECTIONS.filter((s) => s !== "news_gateway");
}

/* ------------------------------------------------------------------ */
/* What attention a name has earned                                    */
/* ------------------------------------------------------------------ */

/** The four attended lists, plus the liquid remainder. */
export type PrioritySets = {
  /** The symbols with instrument pages of their own. */
  covered: ReadonlySet<string>;
  /** The fourteen tracking funds behind the index tabs and the sector strip. */
  strip: ReadonlySet<string>;
  wire: ReadonlySet<string>;
  calendar: ReadonlySet<string>;
  /** Everything that cleared the liquidity floor on the last full sweep. */
  hot: ReadonlySet<string>;
};

/**
 * The priority to enrol a symbol at: 3 attended, 1 liquid, 0 otherwise.
 *
 * It matches the scale `market_claim_due` orders by and the one
 * ../store/cadence.ts reads (`priority >= 2` means somebody is looking). 2 is
 * absent here on purpose — that value belongs to `market_touch_visit`, which
 * stamps a reader's actual visit, and a worker inventing it would promote a
 * name nobody has opened.
 *
 * The attended lists win over the hot list rather than merely being checked
 * first, which is the normal case and not an edge one: every covered name is
 * liquid enough to be hot too, and read the other way round the six symbols
 * with pages of their own would refresh on the whole universe's cadence.
 *
 * The symbol is upper-cased; the sets carry the universe's own spelling, which
 * is upper-case throughout (market.symbols stores it that way, and every RPC
 * upper-cases on the way in).
 */
export function priorityFor(symbol: string, sets: PrioritySets): number {
  const s = symbol.trim().toUpperCase();
  if (sets.covered.has(s) || sets.strip.has(s) || sets.wire.has(s) || sets.calendar.has(s)) {
    return 3;
  }
  return sets.hot.has(s) ? 1 : 0;
}

/* ------------------------------------------------------------------ */
/* When a sweep is owed                                                */
/* ------------------------------------------------------------------ */

/** Five minutes, because the feed is fifteen minutes delayed. */
const HOT_SWEEP_MS = 5 * MINUTE;
/** The same sweep with the exchange shut. */
const HOT_SWEEP_SHUT_MS = 30 * MINUTE;
/** How often the liquidity floor is re-derived over the whole universe. */
const FULL_SWEEP_MS = HOUR;

/** When each sweep last finished, as epoch ms. 0 for a worker that just woke. */
export type LastSweeps = { hot: number; full: number };

/**
 * Whether either sweep is owed.
 *
 * The hot sweep drops from five minutes to thirty when prices are not moving,
 * and the reason is worth stating because the obvious version of it is wrong.
 * A shut market cannot move a price, so a sweep taken two minutes after the
 * last one returns the identical bytes — 276 chunks of them on the full pass —
 * and the only thing it buys is a fresher `swept_at`. But "shut" is not "the
 * regular session is over": `pricesMove` counts pre-market and post-market as
 * moving, because they genuinely print, and a rule written as 09:30-16:00 ET
 * would freeze the boards through four hours of every trading day and all of
 * an earnings evening.
 *
 * The full sweep keeps its hour whatever the market is doing. It exists to
 * re-derive which names clear the liquidity floor, and that is a fact about a
 * thirty-day average volume rather than about the last five minutes.
 *
 * The two are independent booleans rather than one decision: a caller that
 * runs the full sweep has covered the hot list as a side effect and can mark
 * both done, but that is the loop's call to make and not this function's.
 */
export function dueSweep(now: number, last: LastSweeps, phase: SessionPhase): {
  hot: boolean;
  full: boolean;
} {
  const hotEvery = pricesMove(phase) ? HOT_SWEEP_MS : HOT_SWEEP_SHUT_MS;
  return {
    hot: now - last.hot >= hotEvery,
    full: now - last.full >= FULL_SWEEP_MS,
  };
}

/* ------------------------------------------------------------------ */
/* Pacing                                                              */
/* ------------------------------------------------------------------ */

/**
 * The earliest moment request number `count` of a run that began at
 * `startedAt` may start, given a floor of `minGapMs` between starts.
 *
 * A moment rather than a duration, and that is exactly why it is here: "how
 * long to wait" can only be answered against a clock, and this module reads
 * none. The loop subtracts its own `Date.now()` and sleeps whatever is left,
 * which is the same answer with the untestable half kept outside.
 *
 * A floor between STARTS rather than a concurrency limit, because a worker
 * count bounds how many requests are IN FLIGHT and not how many are issued a
 * second: ten workers against a gateway answering in 50 ms is two hundred
 * requests a second, and the same ten drop to five on a retreat without the
 * rate halving, because each survivor simply picks its next job up sooner. Ten
 * workers honouring a 60 ms gap are sixteen a second whatever the latency does
 * and whatever a retreat has left running.
 *
 * The refresher's other spender does not come through here, and should not be
 * read into this number. The quote sweep fans out under SWEEP_CONCURRENCY in
 * lib/api/clients/quotes.ts, and the loop runs a pass's sweep to completion
 * before it claims anything, so the two never overlap inside a worker.
 *
 * `count` is floored and clamped at zero: it arrives from a counter the pool
 * increments, and a wait measured backwards would be a burst rather than a
 * pause.
 */
export function pace(startedAt: number, count: number, minGapMs: number): number {
  const n = Math.max(0, Math.floor(count));
  const gap = Math.max(0, minGapMs);
  return startedAt + n * gap;
}

/* ------------------------------------------------------------------ */
/* Concurrency after a bad batch                                       */
/* ------------------------------------------------------------------ */

/** Ten workers against a gateway that measured comfortably at eight. */
export const CONCURRENCY_CEILING = 10;

/**
 * Two, and never one.
 *
 * Halving without a floor reaches zero, and `pooled` spawns
 * `min(limit, items)` workers — a limit of zero is not a slow loop but one
 * that never finishes a batch. Two rather than one so a single wedged request
 * cannot stall the queue behind it.
 */
export const CONCURRENCY_FLOOR = 2;

/** Above this share of a batch failing, the gateway is the problem. */
const ERROR_RATE_LIMIT = 0.2;

const clampConcurrency = (n: number): number =>
  Math.min(CONCURRENCY_CEILING, Math.max(CONCURRENCY_FLOOR, Math.floor(n) || CONCURRENCY_FLOOR));

/**
 * How many workers to run after a batch that failed `errorRate` of the time.
 *
 * Halve above a fifth, restore one worker at a time otherwise. The asymmetry
 * is the point: the failures worth reacting to here are throttles and outages,
 * where more workers make it worse and faster, so the retreat is immediate and
 * the return is slow enough that a gateway recovering from one is not
 * immediately handed ten again.
 *
 * A rate that is not a number leaves the setting alone. An empty batch divides
 * by zero, and neither halving nor restoring is an honest reading of a batch
 * that never ran.
 */
export function backoffFor(errorRate: number, concurrency: number): number {
  if (!Number.isFinite(errorRate)) return clampConcurrency(concurrency);
  if (errorRate > ERROR_RATE_LIMIT) return clampConcurrency(Math.floor(concurrency / 2));
  return clampConcurrency(concurrency + 1);
}
