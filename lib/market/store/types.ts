import type { RawEquityQuote, RawHistoryPoint } from "../../api/clients/quotes.ts";
import type { SweepRow } from "../../api/sweep.ts";
import type { Section } from "./sections.ts";

/* The shapes the `market` schema hands back, written down once.
 *
 * Every one of these is the JSON a `public.market_*` RPC returns, and the RPC
 * bodies live in supabase/migrations/…_0031_market_store.sql. Nothing validates
 * the agreement at runtime — PostgREST will happily return a jsonb that has
 * drifted from what is declared here, and the first sign of it is a page
 * rendering a blank panel. So these types are the contract, and the wrappers in
 * client.ts are the only place a spelling is written a second time.
 *
 * Deliberately no Next import and no `@/` alias anywhere in this file or in
 * client.ts: the refresh worker loads both from a plain Node process, outside
 * any bundler, and an alias that only the bundler understands would make the
 * worker unrunnable for the sake of four characters.
 *
 * `unknown` for the section payloads is not laziness. A payload is whatever the
 * gateway sent, stored verbatim; the normalisers in lib/api/normalize already
 * own the job of turning that into something typed, and a second, looser copy
 * of those shapes here would be a lie that type-checks.
 *
 * EVERY TIMESTAMP HERE IS EPOCH MILLISECONDS, never an ISO string. The RPCs
 * emit `(extract(epoch from …) * 1000)::bigint` for all of them — lines 669,
 * 680, 773, 791, 875, 904 and 928 of the migration — and market_status's own
 * comment states the convention for the whole `market_*` surface. It is worth
 * saying twice because nothing checks it: the RPC result is cast, so a field
 * declared `string | null` here that arrives as 1758000000000 type-checks all
 * the way to `Date.parse` returning NaN or a freshness badge reading fifty
 * thousand years. The arguments going the other way are ISO strings, because
 * they are handed to Postgres as timestamptz rather than read out of jsonb.
 */

/* The seven data classes a symbol is refreshed in — declared ONCE, next door in
 * sections.ts, and passed through here. See the cadence table in
 * docs/superpowers/specs/2026-09-15-market-store-design.md.
 *
 * It used to be declared twice: a hand-written union here and
 * `(typeof SECTIONS)[number]` there, agreeing member for member, which is
 * exactly why nothing complained. The directory had already split along that
 * seam — cadence.ts imports Section from ./sections.ts, client.ts and reads.ts
 * from here — so an eighth section added on one side would have type-checked on
 * both sides, passed every gate, and been rejected at runtime by
 * market_complete's own section check. sections.ts owns the list because it
 * owns the runtime enumeration the worker enrols and claims by; this file owns
 * the RPC surface, and the RPC surface needs only the type.
 *
 * `export type`, not `export`, and the distinction is load-bearing:
 * app/api/revalidate/route.ts imports from this module at RUNTIME, and a value
 * re-export would drag sections.ts — node:crypto, the normalisers, five years
 * of history maths — into that route to serve a regex. A type-only re-export is
 * erased at compile time. No cycle, either: sections.ts imports nothing here.
 */
export type { Section };

/* Cache tags, spelled here rather than in reads.ts.
 *
 * The worker builds exactly these strings to POST to /api/revalidate, and it
 * cannot import reads.ts — that module pulls in next/cache, which does not
 * load outside a Next render. One definition, two processes, no drift; the
 * regex in app/api/revalidate/route.ts is the third party to the same
 * agreement and has to keep accepting what these produce. */
export const HOME_TAG = "market:home";
export const QUOTES_TAG = "market:quotes";
export const symbolTag = (symbol: string): string => `market:${symbol.toUpperCase()}`;

/**
 * What /api/revalidate will accept — next to the thing that produces it.
 *
 * The producer and its validator sat in different files agreeing by comment,
 * and they did not agree: the class here once omitted `+`, which 80 listed
 * tickers carry (ACHR+, BBAI+, BKKT+ — the warrants), while admitting `$` and
 * `:`, which no listed US ticker carries at all. The route validates
 * all-or-nothing, so one warrant in a batch of 200 returned a 400 and marked
 * nothing stale: 199 healthy symbols frozen on their timer by one character.
 * tests/store-client.test.ts now runs every tradable symbol through
 * `symbolTag` and this pattern, so the two cannot drift apart again in silence.
 *
 * Wider than today's universe on purpose. This is a namespace boundary, not a
 * ticker validator — a caller holding CRON_SECRET may clear `market:` tags and
 * nothing else — and the asymmetry of the two mistakes is the whole argument:
 * one character too wide costs nothing, because the tag names a cache entry
 * that does not exist, while one character too narrow costs a whole batch.
 * 40 is comfortably over market.symbols' own 16-character ceiling
 * (migration:51).
 *
 * Case-insensitive to MATCH only. revalidateTag is case-sensitive, so the route
 * passes the tag through verbatim rather than upper-casing it — a normalised
 * tag would clear an entry nothing holds.
 */
export const TAG_PATTERN = /^market:[A-Z0-9.$:+_-]{1,40}$/i;

/* The batch the worker chunks to. A longer body is a bug on the other side, not
   a request to do more work; 200 tags is already 200 marked entries. */
export const MAX_TAGS = 200;

/** Either the tags to mark, deduplicated, or the sentence to send back as 400. */
export type TagBatch = { ok: true; tags: string[] } | { ok: false; error: string };

/**
 * Everything /api/revalidate decides before it calls into Next.
 *
 * It lives here, and not in the route, because a route file may not export
 * anything else: `next build` writes a
 * `checkFields<Diff<{…known keys…}, typeof entry>>()` guard per route
 * (node_modules/next/dist/build/webpack/plugins/next-types-plugin/index.js:44-56
 * and :144) that requires every export outside its own list to be `never`, so a
 * helper exported for a test would fail the build. Held inside the handler, the
 * cap, the all-or-nothing rule and the dedupe were reachable only by reading —
 * `revalidateTag` throws outside a Next request, so no test can load that module
 * — and a deliberate bug in any of them passed every gate. Out here, plain Node
 * can hold them, which is what tests/store-client.test.ts does.
 *
 * Takes `unknown` because the argument is `await request.json()`, and a body
 * that failed to parse arrives as null rather than as a thrown SyntaxError.
 */
export function parseTagBatch(body: unknown): TagBatch {
  const tags = (body as { tags?: unknown } | null)?.tags;

  if (!Array.isArray(tags)) return { ok: false, error: "body must be { tags: string[] }" };
  if (tags.length > MAX_TAGS) return { ok: false, error: `at most ${MAX_TAGS} tags per call` };

  /* `some` with a second lookup for the message, rather than `find` and a
     `!== undefined` sentinel: `find` cannot distinguish "nothing matched" from
     "matched an element that is itself undefined", and the one it would report
     as nothing matched is the one that must not reach revalidateTag. Nothing
     can produce that today — the array comes from request.json() and JSON has
     no undefined — but the check should not depend on that staying true. */
  const invalid = (t: unknown) => typeof t !== "string" || !TAG_PATTERN.test(t);
  /* All-or-nothing, deliberately, and it is a real trade. Skipping the bad
     entries and marking the rest would make a batch that is half wrong look
     entirely right, and the failure it hides — a worker building a tag nobody
     accepts — is silent staleness, the hardest thing here to notice from the
     outside. A 400 naming the offending tag is the loud version, and it lands
     in the worker's log as `refresh revalidate tags=N status=400`.

     The worker does not then retry: `createRevalidator` empties `pending` into
     the request before it is sent, so a rejected batch is gone. The cost of
     being wrong in this direction is therefore that those pages wait out their
     own revalidate timer, with a line saying which call was refused and which
     tag did it. The cost of the other is a symbol that never refreshes again
     and never says so. */
  if (tags.some(invalid)) {
    const bad = tags[tags.findIndex(invalid)];
    return { ok: false, error: `not a market tag: ${String(bad).slice(0, 60)}` };
  }

  /* Deduplicated: the worker batches per changed section, so a symbol whose
     profile and history both moved names `market:AAPL` twice, and marking a tag
     twice is not two units of work. The count the route reports is therefore
     ENTRIES MARKED, and a caller that posts duplicates reads a number lower
     than the length of what it sent. That is not a dropped tag.

     Verbatim, never upper-cased: revalidateTag is case-sensitive, the entries
     carry whatever `symbolTag` produced, and the two fixed tags above are
     lower-case — so normalising here would clear nothing for `market:home`. */
  return { ok: true, tags: Array.from(new Set(tags as string[])) };
}

/**
 * A `SweepRow` after a round trip through jsonb.
 *
 * Structurally identical to `SweepRow` in lib/api/sweep.ts — the store keeps
 * the sweep's own shape so the boards can render a stored row and a freshly
 * swept one through the same code. The typed tuple below is the guard, and it
 * is the construct not to delete: each conditional collapses to `never` the
 * moment one type gains a field the other lacks, and a `never` cannot be
 * assigned `true`, so this file stops compiling rather than the terminal
 * quietly losing a column. (It is not a `satisfies`, which an earlier version
 * of this comment claimed; `satisfies` would check one direction only.)
 */
export type SweepRowJson = {
  s: string;
  name: string;
  px: number;
  chg: number;
  chgKnown: boolean;
  vol: number;
  avgVol: number;
  dollarVol: number;
  relVol: number;
  mcap: number | null;
  pe: number | null;
  ex: string;
  /** Epoch ms of the quote's own updateTime, for staleness. */
  asOf: number | null;
  delayed: boolean;
};

/* Both directions, so neither type may grow a field the other lacks. */
type _RowMatchesSweep = SweepRowJson extends SweepRow ? true : never;
type _SweepMatchesRow = SweepRow extends SweepRowJson ? true : never;
const _rowsAgree: [_RowMatchesSweep, _SweepMatchesRow] = [true, true];
void _rowsAgree;

/** When a section was last written, and how many times it has changed. */
export type SectionMeta = {
  /** Epoch ms, or null for a section enrolled but never filled. */
  fetchedAt: number | null;
  version: number;
};

/** A peer row, pre-joined by the RPC so a page costs one call, not nine. */
export type StoredPeer = {
  s: string;
  name: string;
  px: number | null;
  chg: number | null;
  mcap: number | null;
  pe: number | null;
  /** Total return over one year, derived from the stored daily history. */
  ret1y: number | null;
};

/** Everything one instrument page needs, in one answer. */
export type StoredInstrument = {
  /* False for a symbol nobody has opened yet. The page then falls back to the
     gateway fan-out and calls market_touch_visit so the next visit is cheap. */
  enrolled: boolean;
  quote: RawEquityQuote | null;
  row: SweepRowJson | null;
  sections: Partial<Record<Section, unknown>>;
  meta: Partial<Record<Section, SectionMeta>>;
  /* The market's own daily history, for the relative-performance chart. Pinned
     to the literal the RPC pins: market_instrument selects SPY by name, so a
     read path comparing against it should get the comparison checked rather
     than wave a bare string through. If the SQL ever names a different proxy,
     this literal is the one place the change has to be repeated. */
  market: { symbol: "SPY"; history_daily: unknown | null };
  peers: StoredPeer[];
};

/** Everything the terminal's home screen needs, in one answer. */
export type StoredHome = {
  /** Epoch ms of the sweep that wrote these rows. */
  sweptAt: number | null;
  rows: SweepRowJson[];
  /** Raw quotes for the index and sector strips, which read fields the
      SweepRow shape drops. */
  strip: RawEquityQuote[];
  /** The last bars per strip symbol, keyed by symbol, for the sparklines. */
  weekBars: Record<string, RawHistoryPoint[]>;
  /* `news` is nullable because the RPC reaches into the stored payload for it
     (`s.payload -> 'ticker_news'`, migration:836) and only guards that the
     payload itself is non-null. A gateway fundamentals answer carrying
     `ticker_news: null` — which happens, see tests/profile.test.ts — therefore
     arrives here as a wire entry with a null list, and a consumer that maps
     over it unguarded throws on a symbol that simply had no news. */
  wire: Array<{ ticker: string; news: unknown[] | null }>;
  calendar: Array<{ ticker: string; actions: unknown }>;
};

/** One row of the generic batch read behind the sector pages and the feeds. */
export type StoredSectionRow = {
  symbol: string;
  payload: unknown;
  /** Epoch ms (migration:875). */
  fetchedAt: number | null;
  version: number;
};

/** What /api/sweep reports once it becomes a health read rather than a warmer. */
export type StoreStatus = {
  /** Epoch ms of the newest quote sweep (migration:904). */
  quotesSweptAt: number | null;
  hotCount: number;
  quotesCount: number;
  enrolled: number;
  due: number;
  claimed: number;
  erroring: number;
  /** Epoch ms of the newest refresh-log row (migration:928). */
  lastRefreshAt: number | null;
  lastHour: { changed: number; unchanged: number; error: number; absent: number };
};

/** One unit of refresh work, leased to this worker for fifteen minutes. */
export type ClaimedJob = {
  symbol: string;
  section: Section;
  /** The version the worker is holding; market_complete bumps it on a change. */
  version: number;
  /** The hash of the stored payload. A fetch that hashes to this writes nothing. */
  contentHash: string | null;
  priority: number;
  attempts: number;
  /* The stored corporate_actions payload, supplied for history_daily and
     financials_annual so the worker can repair a series and time an earnings
     re-check without a second read. Null for every other section. */
  context: unknown | null;
};

/* ---- arguments to the write RPCs ------------------------------------- */

/**
 * One row of the bootstrap seed.
 *
 * SPELLED THE WAY THE SQL READS IT, which is not the way symbol-master.json
 * writes it. market_seed_symbols takes `item ->> 'symbol'`, `'name'`,
 * `'exchange'` and `'tradable'` (migration:199-203), and its `where` clause
 * drops any row whose `'symbol'` is null or empty (migration:205). So the
 * bootstrap has to rename the master's `{s, n, ex}` on the way in — 13,797
 * three-key objects, once per bootstrap, which is the cheap half of this. Hand
 * the master's own spelling to this function and the filter matches nothing,
 * the insert writes nothing, and the RPC returns 0 rows written, which is
 * indistinguishable from a re-seed of an unchanged universe. It would look like
 * it worked.
 *
 * The neighbouring function goes the other way: market_upsert_quotes reads
 * 's', 'name', 'ex' and 'px' (migration:246-251), because a sweep row already
 * has those names. Two functions, two conventions, no way to tell from
 * TypeScript — so tests/store-client.test.ts asserts both against the
 * migration.
 *
 * `tradable` is optional because the SQL defaults it to true and every symbol
 * the bootstrap sends has been filtered to tradable exchanges already; it is
 * declared so a future de-listing sweep has somewhere to say so. There is no
 * `mic` field: market.symbols has no such column (migration:35-52), and a key
 * the function never reads is a promise the database does not keep.
 */
export type SeedSymbolRow = {
  symbol: string;
  name: string;
  exchange: string;
  tradable?: boolean;
};

/**
 * One row of a quote upsert: the sweep row the boards rank on, plus the raw
 * quote verbatim.
 *
 * `raw` is not redundant. toCompanyProfile and the index and sector strips read
 * fields SweepRow drops — 52-week range, beta, dividend yield, ISIN — and
 * without it the store could serve a board but not a page.
 */
export type QuoteUpsertRow = SweepRowJson & { raw: RawEquityQuote | null };

/** The outcome of one refresh job, as market_complete takes it. */
export type CompleteArgs = {
  symbol: string;
  section: Section;
  /** Only sent when the content changed; null leaves the stored payload alone. */
  payload: unknown | null;
  hash: string | null;
  changed: boolean;
  /** Null on success. A non-null error backs the section off and clears the lease. */
  error: string | null;
  /** ISO — when this section should next be looked at. */
  nextCheckAt: string;
  /** How long the fetch took, for the refresh log. */
  ms?: number;
  /** The upstream's own timestamp, where it gives one. */
  sourceUpdatedAt?: string | null;
};
