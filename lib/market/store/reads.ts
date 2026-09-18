import "server-only";
import { unstable_cache } from "next/cache";

import { settle, TransientFailure } from "../../api/cache-policy.ts";
import { INDEX_ETF_SYMBOLS } from "../../api/normalize/index-proxy.ts";
import { SECTOR_ETF_SYMBOLS } from "../../api/normalize/sector.ts";
import { readHomeRaw, readInstrumentRaw, readSectionsRaw } from "./client.ts";
import {
  HOME_TAG,
  MARKET_PROXY_SYMBOL,
  symbolTag,
  type Section,
  type StoredHome,
  type StoredInstrument,
  type StoredInstrumentRecord,
  type StoredSectionRow,
} from "./types.ts";
import type { ApiOk, ApiResult } from "../../api/errors.ts";

/* The cached read path.
 *
 * A handful of RPCs per page regeneration — one for an instrument, three for
 * the dashboard — and the tags are what make that affordable:
 * the worker POSTs to /api/revalidate only when a hash actually changed, so a
 * symbol whose profile has not moved in nine days is served from the ISR entry
 * without the database being asked at all. The `revalidate` seconds below are a
 * safety net for a worker that has stopped, not the refresh mechanism.
 *
 * This is the third module under lib/ to import next/cache, after
 * lib/api/cache-layer.ts and lib/market/swept.ts, and it should be the last.
 * The two route handlers that call revalidateTag do not count against that: a
 * route handler is Next's own process by definition. Every other module under
 * lib/api and lib/market/store loads from a plain Node process — that is what
 * lets the refresh worker and the probe share the real client code instead of a
 * second copy of it — and next/cache is precisely what breaks that.
 *
 * The guard/settle pattern around every call is cache-layer.ts's lesson, and it
 * matters more here than it did there. Nothing in this path throws, so an
 * ApiFailure is just a value, and a value is what a memoiser keeps: without the
 * guard, one eight-second Supabase timeout would be remembered as "this stock
 * does not exist" for the next fifteen minutes. What counts as worth keeping is
 * NOT the gateway's rule, though — see `guardStore` below, which is why this
 * module does not simply call cache-policy's `guard`.
 */

/**
 * Let an answer be memoised; never let a failure be.
 *
 * lib/api/cache-layer.ts calls `guard` from cache-policy.ts, which deliberately
 * keeps a 404, 410 or 422, because at the gateway those are the upstream
 * answering a question about a record: EA genuinely has no corporate-actions
 * document, and it will not have one any harder for being asked every five
 * minutes. NONE OF THAT REASONING TRANSFERS TO POSTGREST, and importing it
 * unread is the mistake this function exists to prevent.
 *
 * No `market_*` function can 404 about a symbol. Asked for a name it has never
 * heard of, market_instrument returns 200 with `enrolled: false` and
 * market_sections returns 200 with an empty array (migration:642-760, :875-895)
 * — "not in the store" is a successful answer on this surface, and the callers
 * read it as the signal to fall back to the gateway. So a 404 here can only mean
 * PostgREST cannot find the FUNCTION: the migration has not landed, or the
 * schema cache has not reloaded after one that has. That is a whole-store
 * outage, it clears itself within seconds of a `notify pgrst`, and `guard`
 * would have written it into the cache once per symbol for the full fifteen
 * minutes — a deploy glitch outliving its cause by three orders of magnitude,
 * which is the exact shape of the bug cache-policy.ts was written to kill.
 *
 * Refusing to keep any failure costs one RPC per render while the store is
 * down, each bounded by the client's four-second read ceiling and by the gate
 * that keeps four of them in flight at a time, and the page still renders
 * because every caller falls back. That is the cheap side of the trade: a store
 * failure here is global and rare, where a gateway 404 is per-record, common
 * and permanent.
 */
function guardStore<T>(read: string, result: ApiResult<T>): ApiOk<T> {
  if (!result.ok) {
    /* THE ONE LINE, and it is here because this is the only place that knows
     * both which read failed and that the failure is about to stop being a
     * value anybody can look at.
     *
     * A store read that times out is not an error the site has to report — the
     * caller falls back to the gateway and renders a correct page — but it is
     * something an operator has to be able to see, and the throw below is
     * about to turn it into either nothing at all (a miss, caught by `settle`)
     * or Next's own `revalidating cache with key: …` (a stale entry). Neither
     * carries the elapsed time, which is the number that tells a timeout apart
     * from a refusal.
     *
     * `warn`, not `error`: this degrades, and a line that reads like an outage
     * for something the reader never noticed is how a log stops being read. */
    console.warn(`market store: ${read} failed ms=${result.ms} error=${result.error}`);
    throw new TransientFailure(result);
  }
  /* ApiOk rather than ApiResult, because the line above means a failure never
     leaves this function. Callers get the narrowing for free. */
  return result;
}

/** Next's own hard ceiling for one cached entry, two megabytes
    (node_modules/next/dist/server/lib/incremental-cache/index.js:509-524). */
const CACHE_CEILING = 2 * 1024 * 1024;

/** Where this file starts saying so, about half a megabyte short of the cliff.
    Room enough that the sentence lands in a log while there is still something
    to do about it, high enough that no healthy read here trips it. */
const CACHE_ALARM = 1_500_000;

/**
 * What Next will measure this entry as, without serialising it a second time.
 *
 * `unstable_cache` stores the callback's value as a STRING inside the entry
 * (`body: JSON.stringify(result)`, node_modules/next/dist/server/web/
 * spec-extension/unstable-cache.js:23), and the size check runs over the entry
 * (`itemSize = JSON.stringify(data).length`, .../server/lib/incremental-cache/
 * index.js:509). So every `"` and `\` in the JSON is escaped a SECOND time, and
 * the figure in Next's error runs a tenth or so above the JSON's own length —
 * measured 2,155,773 against 1,936,280 for the payload that prompted this.
 * Measure the value alone and something that has already fallen off the ceiling
 * reports as comfortably inside it.
 *
 * That second escape is the only difference, and it is countable in one pass
 * over a string that already exists: the first `JSON.stringify` has turned
 * every control character into `\uXXXX`, so nothing left in it escapes to more
 * than two characters. The envelope around the body — the kind, the status, the
 * revalidate — is under a hundred characters and is ignored; at this scale it
 * is noise, and leaving it out keeps the number an understatement rather than
 * an overstatement, which is the safe direction for a ceiling.
 *
 * `.length`, not a byte count, because `.length` is what Next compares. The two
 * agree for the ASCII these payloads are almost entirely made of, and where
 * they differ it is Next's arithmetic that decides, not ours.
 */
function entrySize(value: unknown): number {
  const body = JSON.stringify(value);
  let size = body.length;
  for (let i = 0; i < body.length; i += 1) {
    const c = body.charCodeAt(i);
    if (c === 0x22 || c === 0x5c) size += 1;
  }
  return size;
}

/**
 * Say so, out loud and once, when a read comes back near the cache ceiling.
 *
 * THIS EXISTS BECAUSE THE CLIFF IS SILENT IN PRODUCTION. Over two megabytes
 * Next stores nothing and returns from `set` (incremental-cache/index.js:515-524)
 * — one `console.warn` in the server log, and in development a thrown error that
 * a reader meets as a half-rendered page. Everything else keeps working, which
 * is the trap: the read still answers, so the page still renders, and the only
 * symptom is that `revalidate` and the tag on that entry have quietly stopped
 * meaning anything and every render pays the database again. `market_home` shipped
 * like that at 2,153,236 bytes until someone read the console.
 *
 * So the measurement is taken here, where the payload is already in hand, and it
 * only ever warns. Throwing would turn a read that works into a page that does
 * not, which is strictly worse than the thing being warned about, and this
 * module's whole contract is that a store problem degrades rather than breaks.
 *
 * It costs one serialisation, and only on a cache MISS — a hit never enters the
 * callback at all, so the warm path is untouched. On a miss Next is about to
 * serialise the same value anyway.
 */
function measured<T>(read: string, result: ApiResult<T>): ApiResult<T> {
  const size = entrySize(result);
  if (size >= CACHE_ALARM) {
    console.warn(
      `market store: the ${read} cache entry measures ${size} bytes against Next's ` +
        `${CACHE_CEILING}-byte per-entry ceiling. Past the ceiling Next stores nothing: ` +
        `the entry's tags and revalidate stop meaning anything and every render ` +
        `re-queries the store. Split the read before it gets there.`,
    );
  }
  return result;
}

/** Fifteen minutes. The worker revalidates on change; this only covers a worker
    that has stopped, which is a page an hour stale rather than a page frozen. */
const INSTRUMENT_TTL = 900;

/** Five minutes, matching the hot sweep's cadence: the quotes behind the home
    screen cannot be fresher than the sweep that wrote them. */
const HOME_TTL = 300;

/* The strip the home RPC prices: three index proxies and eleven sector ETFs.
   Through a Set because a proxy and a sector ETF naming the same fund would
   otherwise be priced twice and drawn twice. */
const STRIP_SYMBOLS = Array.from(new Set([...INDEX_ETF_SYMBOLS, ...SECTOR_ETF_SYMBOLS]));

/**
 * One instrument, tagged so the worker can invalidate exactly this symbol —
 * and ONLY this symbol.
 *
 * ONE TAG, NOT TWO, and the second one is what took the site down. This entry
 * used to carry `market:quotes` as well, which the refresher sends after every
 * full sweep. A tag is not a hint: one POST therefore marked all ~500
 * prerendered instrument pages stale at the same instant, they all began
 * regenerating together, and each one asked a database with 60 connections for
 * its own 213KB. Every read in that log timed out at the client ceiling —
 * 8,165ms for a query measured at 0.27-0.72s when it is the only one asking.
 * The store was never slow. It was asked five hundred times at once, on a
 * schedule, by design.
 *
 * Dropping it is safe for two independent reasons, and either alone would do.
 *
 * The route already carries `export const revalidate = 900`
 * (app/terminal/[ticker]/page.tsx:61), so a page regenerates on its own timer
 * regardless of any tag — the tag only ever bought a fresher stored quote
 * sooner, and now it does not, so the worst case is a stored figure up to
 * fifteen minutes old on a page that already says its quotes are fifteen
 * minutes delayed.
 *
 * And the price a reader actually looks at is not in this entry at all. It
 * arrives over the websocket and the header updates from it live; the stored
 * quote is the delayed feed's, fifteen minutes behind BY DEFINITION, and it is
 * there to be computed from — the boards' rankings, the peers table — not to
 * be read as the price. Invalidating five hundred pages to refresh a number
 * the page overwrites in the browser is the definition of a stampede bought
 * for nothing.
 *
 * `market:<SYMBOL>` stays, and it is the one that was always doing the work:
 * the refresher already sends it per changed symbol, so the reference data
 * this entry is actually made of still invalidates the moment it moves, one
 * page at a time.
 *
 * WHY THE CACHE IS BUILT PER CALL. `unstable_cache` reads `options.tags` ONCE,
 * when it wraps the function (node_modules/next/dist/server/web/spec-extension/
 * unstable-cache.js:45), and the tags take no part in the cache key — that is
 * built from the callback's source text and the keyParts
 * (`fixedKey = cb.toString() + "-" + keyParts.join(",")`, :55) plus the
 * stringified arguments (:82). So a single module-level wrapper can only ever
 * carry one fixed tag list, and `market:AAPL` on an entry holding NVDA's data
 * would be worse than no tag at all. Constructing the wrapper per call is how a
 * per-symbol tag is possible, and it costs nothing: the callback's source is
 * identical every time, so the key is stable and the entries are shared.
 *
 * The symbol is passed as an ARGUMENT rather than closed over, which is what
 * keeps that true — arguments are in the key (:82), a closure is not, and the
 * doc for keyParts says as much. Uppercased first so /terminal/aapl and
 * /terminal/AAPL are one cache entry and one tag, not two of each.
 */
export async function readInstrument(symbol: string): Promise<ApiResult<StoredInstrument>> {
  /* Trimmed as well as uppercased, matching `upper(nullif(trim(p_symbol), ''))`
     in the RPC (migration:650) and the reader one file over
     (lib/market/instrument.ts:92). Without it a route param that arrived as
     "%20AAPL" is a SECOND entry holding AAPL's correct rows under the tag
     "market: AAPL " — a tag app/api/revalidate/route.ts rejects for the space,
     so the worker can never clear it and it ages out only on the 900s timer.
     The data would never be wrong; it would just be unreachable by the
     invalidation path, which is the failure this whole file is built around. */
  const sym = symbol.trim().toUpperCase();
  const cached = unstable_cache(
    async (s: string) => {
      const read = `instrument ${s}`;
      const record = guardStore(read, await readInstrumentRaw(s));
      return measured(read, { ...record, data: withoutProxy(record.data) });
    },
    ["market", "instrument"],
    /* One tag. The worker clears it when this symbol's own reference data
       changes; nothing else may mark this entry stale. */
    { revalidate: INSTRUMENT_TTL, tags: [symbolTag(sym)] },
  );

  /* allSettled, not all, and it is not defensiveness for its own sake. Both of
     these are `settle`d already, so neither rejects for a store failure — but
     both run inside a Next render, and the things next/cache throws when it
     dislikes the context it is called in (a missing incrementalCache, say) are
     not TransientFailures and `settle` rightly refuses to launder them. With
     `Promise.all`, the first of those to arrive discards the other, whose
     rejection then has no handler: an unhandled rejection, which is the exact
     noise this change set out to remove. */
  const [record, proxy] = await Promise.allSettled([settle(cached(sym)), proxyHistory()]);

  /* The record's throw is the caller's to see. readStored in instrument.ts
     catches everything and falls back to the gateway, which is the right
     answer for a page that cannot read its own company. */
  if (record.status === "rejected") throw record.reason;
  if (!record.value.ok) return record.value;

  /* The benchmark does not get that power. A missing SPY series is a panel the
     assembler already knows how to leave out — `market: null` in the snapshot,
     exactly as it looked when the RPC had no SPY row to join — and losing one
     comparison chart is not a reason to send a reader to a thirty-second
     gateway fan-out for a company whose record is sitting right here. */
  const history = proxy.status === "fulfilled" ? proxy.value : null;

  return {
    ...record.value,
    data: { ...record.value.data, market: { symbol: MARKET_PROXY_SYMBOL, history_daily: history } },
  };
}

/**
 * SPY's five years of daily bars: fetched once, shared by every instrument page.
 *
 * This is the other half of the payload problem. `market_instrument` used to
 * return the benchmark series inside every answer — 86KB of the 213KB, the same
 * bytes for AAPL as for NVO — so each of ~500 instrument pages downloaded it,
 * parsed it and kept its own copy in its own cache entry. Forty-three megabytes
 * of identical benchmark, on an instance with 512MB.
 *
 * It is one read now, through `readSections`, which means it is one CACHE ENTRY
 * for the whole site and one flight for however many pages are regenerating at
 * once (see gate.ts). The entry is tagged `market:SPY` and revalidates on the
 * same 900s as the instrument entries, so the refresher's per-symbol POST for
 * SPY's history clears this and SPY's own page together — which is precisely
 * the invalidation that used to require marking every page on the site.
 *
 * `null` for anything that is not a usable row, and the caller treats that as
 * the store simply not having SPY yet. `fromStored` is not called here: this
 * layer moves stored payloads, and the one place that knows how to read a
 * history payload back into bars is the reader in instrument.ts, which already
 * does it to exactly this value.
 */
async function proxyHistory(): Promise<unknown | null> {
  const rows = await readSections([MARKET_PROXY_SYMBOL], "history_daily");
  if (!rows.ok) return null;
  return rows.data.find((r) => r.symbol === MARKET_PROXY_SYMBOL)?.payload ?? null;
}

/**
 * Drop the benchmark block an older `market_instrument` may still be sending.
 *
 * This code has to be right against two definitions of the function. The
 * migration that removes the block is applied by hand after review, so there is
 * a window — and a rollback — in which the answer still carries SPY's history,
 * and an entry written during it would hold the 86KB this change exists to stop
 * holding, for the full fifteen minutes, on every symbol. The value is never
 * read either way: `proxyHistory` above is the only source of the series.
 *
 * Six top-level keys, copied once per cache MISS. A hit never enters the
 * callback at all.
 */
function withoutProxy(record: StoredInstrumentRecord): StoredInstrumentRecord {
  if (record === null || typeof record !== "object" || !("market" in record)) return record;
  const { market: _proxy, ...rest } = record as StoredInstrumentRecord & { market?: unknown };
  return rest;
}

/**
 * The boards, the strips and the sparklines. NOT the wire and NOT the calendar.
 *
 * This read asked `market_home` for all six things it can answer, and the
 * answer measured 2,153,236 bytes — over the ceiling `measured` above is named
 * after. So the entry was refused on every render: `market:home` and the
 * five-minute revalidate were inert, and the dashboard re-queried and re-parsed
 * two megabytes each time a reader arrived.
 *
 * The 4,410 hot quote rows are about half of that and they are the half that
 * cannot move — every board on the page ranks from them. The wire's 51 news
 * documents and the calendar's 93 corporate-actions documents are the other
 * half, and they were already being read a second way: `readSections` below
 * fetches exactly those two batches for /terminal/wire and /terminal/calendar.
 * So they leave this entry and the dashboard joins those reads instead, which
 * makes three cache entries of about a megabyte, half a megabyte and a quarter
 * — and makes the dashboard and the two feed pages share the documents rather
 * than fetch them twice.
 *
 * EMPTY ARRAYS, NOT A NEW FUNCTION. `market_home` builds the wire and the
 * calendar by unnesting the ticker arrays it is handed and joining against the
 * stored sections (migration:845-859); `unnest` of an empty array produces no
 * rows and the surrounding `coalesce(jsonb_agg(…), '[]')` returns an empty
 * list. Asking for none is therefore already a supported question, and the
 * migration is applied to a live database, so it stays exactly as it is.
 *
 * Wrapped once at module scope, because the read takes no arguments and carries
 * one fixed tag — the ordinary case, and the shape everything in cache-layer.ts
 * already has.
 */
const cachedHome = unstable_cache(
  async () => measured("home", guardStore("home", await readHomeRaw(STRIP_SYMBOLS, [], []))),
  ["market", "home"],
  { revalidate: HOME_TTL, tags: [HOME_TAG] },
);

export function readHome(): Promise<ApiResult<StoredHome>> {
  return settle(cachedHome());
}

/**
 * One section for a batch of symbols — the sector pages, the feeds, and the
 * dashboard's wire and calendar rails.
 *
 * The dashboard asks for the same two batches the feed pages ask for, with the
 * same ticker lists, so the three pages share two entries rather than three
 * paying for six. That is not luck: the key is the callback's source plus the
 * arguments (unstable-cache.js:55 and :82), and the sort below is what makes
 * two callers spelling the same list in a different order land on it.
 *
 * Tagged with every symbol in the batch, for the same reason and by the same
 * mechanism as readInstrument: the tag list is fixed when the wrapper is built,
 * so the wrapper is built here. A change to any one member invalidates the
 * batch, which is right — the page renders all of them.
 *
 * CALLERS MUST KEEP A BATCH UNDER 128 SYMBOLS. Next caps a cache entry at
 * NEXT_CACHE_TAG_MAX_ITEMS = 128 (node_modules/next/dist/lib/constants.js:280);
 * `validateTags` warns and silently DROPS everything past the cap
 * (node_modules/next/dist/server/lib/patch-fetch.js:74-98). A larger batch
 * still caches and still reads correctly — it just stops being invalidable for
 * the symbols whose tags fell off the end, so those go stale only on the 900s
 * timer. The sector pages chunk for this reason; there is no runtime check here
 * because the honest fix is a smaller batch, not a silently split cache entry.
 */
export function readSections(
  symbols: string[],
  section: Section,
): Promise<ApiResult<StoredSectionRow[]>> {
  /* Trimmed, uppercased, deduplicated and SORTED, and only the first of those
     is housekeeping — see readInstrument for what an untrimmed symbol costs.
     The argument list goes into the cache key verbatim
     (`invocationKey = fixedKey + "-" + JSON.stringify(args)`,
     node_modules/next/dist/server/web/spec-extension/unstable-cache.js:82), so
     ["AAPL","MSFT"] and ["MSFT","AAPL"] are two entries holding identical rows
     behind identical tags — two RPCs, two stored payloads, one answer. A
     duplicate in the list does the same thing and sends the database a symbol
     twice. Ordering the key is safe because the answer is order-independent:
     market_sections orders its own output by symbol, so no caller can be
     relying on the order it asked in. */
  const syms = Array.from(new Set(symbols.map((s) => s.trim().toUpperCase()))).sort();
  const cached = unstable_cache(
    async (list: string[], sec: Section) => {
      const read = `${sec} sections for ${list.length} symbols`;
      return measured(read, guardStore(read, await readSectionsRaw(list, sec)));
    },
    ["market", "sections"],
    { revalidate: INSTRUMENT_TTL, tags: syms.map(symbolTag) },
  );
  return settle(cached(syms, section));
}
