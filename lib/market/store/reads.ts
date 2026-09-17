import "server-only";
import { unstable_cache } from "next/cache";

import { settle, TransientFailure } from "../../api/cache-policy.ts";
import { INDEX_ETF_SYMBOLS } from "../../api/normalize/index-proxy.ts";
import { SECTOR_ETF_SYMBOLS } from "../../api/normalize/sector.ts";
import { CALENDAR_TICKERS, WIRE_TICKERS } from "../universe.ts";
import { readHomeRaw, readInstrumentRaw, readSectionsRaw } from "./client.ts";
import {
  HOME_TAG,
  QUOTES_TAG,
  symbolTag,
  type Section,
  type StoredHome,
  type StoredInstrument,
  type StoredSectionRow,
} from "./types.ts";
import type { ApiResult } from "../../api/errors.ts";

/* The cached read path.
 *
 * One RPC per page regeneration, and the tags are what make that affordable:
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
 * down, each bounded by the client's eight-second timeout, and the page still
 * renders because every caller falls back. That is the cheap side of the trade:
 * a store failure here is global and rare, where a gateway 404 is per-record,
 * common and permanent.
 */
function guardStore<T>(result: ApiResult<T>): ApiResult<T> {
  if (!result.ok) throw new TransientFailure(result);
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
 * One instrument, tagged so the worker can invalidate exactly this symbol.
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
export function readInstrument(symbol: string): Promise<ApiResult<StoredInstrument>> {
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
    async (s: string) => guardStore(await readInstrumentRaw(s)),
    ["market", "instrument"],
    {
      revalidate: INSTRUMENT_TTL,
      /* Two tags: the worker clears the first when this symbol's own reference
         data changes, and the second after a full sweep, when every stored
         quote has moved at once. */
      tags: [symbolTag(sym), QUOTES_TAG],
    },
  );
  return settle(cached(sym));
}

/* The home read takes no arguments and one fixed tag, so it is wrapped once at
   module scope — the ordinary case, and the shape everything in cache-layer.ts
   already has. The ticker lists are spread out of their `as const` tuples
   because the client's signature is a plain string[]; they are constants, so
   this happens once per process rather than per read. */
const cachedHome = unstable_cache(
  async () =>
    guardStore(await readHomeRaw(STRIP_SYMBOLS, [...WIRE_TICKERS], [...CALENDAR_TICKERS])),
  ["market", "home"],
  { revalidate: HOME_TTL, tags: [HOME_TAG] },
);

export function readHome(): Promise<ApiResult<StoredHome>> {
  return settle(cachedHome());
}

/**
 * One section for a batch of symbols — the sector pages and the feeds.
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
    async (list: string[], sec: Section) => guardStore(await readSectionsRaw(list, sec)),
    ["market", "sections"],
    { revalidate: INSTRUMENT_TTL, tags: syms.map(symbolTag) },
  );
  return settle(cached(syms, section));
}
