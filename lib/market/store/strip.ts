import { INDEX_ETF_SYMBOLS } from "../../api/normalize/index-proxy.ts";
import { SECTOR_ETF_SYMBOLS } from "../../api/normalize/sector.ts";

/* The strip the landing page asks the store for, in the order it asks.
 *
 * ONE LIST, TWO CALLERS, and it is here so they cannot drift. The refresh
 * worker builds the stored home blob with it (market_build_home, migration
 * 0034) and the cached read asks market_home with it; the RPC compares the two
 * arrays for equality — order included — and computes live on a mismatch. A
 * worker and a reader holding lists that differed by one fund or one position
 * would therefore agree on nothing, and every dashboard render would pay the
 * 1.2MB aggregate this blob exists to pay once.
 *
 * Deduplicated because the two source lists are independent and nothing stops
 * a fund appearing in both; the store returns the strip in the order given and
 * a duplicate would render twice. */
export const HOME_STRIP_SYMBOLS: readonly string[] = Array.from(
  new Set([...INDEX_ETF_SYMBOLS, ...SECTOR_ETF_SYMBOLS]),
);
