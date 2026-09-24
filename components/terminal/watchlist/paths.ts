import { WATCHLIST_PATH, tickerFromPath } from "@/lib/market/paths";

/* The watchlist page's address lives with every other terminal path in
   lib/market/paths.ts, whose `tickerFromPath` also knows /terminal/watchlist
   is a route rather than the ticker WATCHLIST. Re-exported here so the
   watchlist components keep one local import. */
export { WATCHLIST_PATH };

/** Where the page's add box is, for "Add stocks" links. */
export const WATCHLIST_ADD_PATH = `${WATCHLIST_PATH}#add`;

/** The ticker a terminal pathname names, never the watchlist page's own segment. */
export const routeTicker = (pathname: string): string | null => tickerFromPath(pathname);
