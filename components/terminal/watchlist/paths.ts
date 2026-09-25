import { WATCHLIST_PATH, tickerFromPath } from "@/lib/market/paths";

/* The watchlist page's address lives with every other terminal path in
   lib/market/paths.ts, whose `tickerFromPath` also knows /terminal/watchlist
   is a route rather than the ticker WATCHLIST. Re-exported here so the
   watchlist components keep one local import. */
export { WATCHLIST_PATH };

/** Where the page's add box is, for "Add stocks" links. */
export const WATCHLIST_ADD_PATH = `${WATCHLIST_PATH}#add`;

/* An "Add stocks" link followed while the page is already open changes only
   the hash, and Next's Link does that with pushState, which fires no
   `hashchange` — so the add box never heard it and the reader landed on a
   page that was not ready to type. The links say so directly instead, and the
   box (if it is on screen) takes focus inside the same tap, which is also the
   only way iOS will raise the keyboard for it. */
const ADD_EVENT = "watchlist:add";

/** Called by every "Add stocks" link, before it navigates. */
export function askForAddBox(): void {
  window.dispatchEvent(new Event(ADD_EVENT));
}

/** The add box's side of askForAddBox. Returns the unsubscribe. */
export function onAddBoxAsked(listener: () => void): () => void {
  window.addEventListener(ADD_EVENT, listener);
  return () => window.removeEventListener(ADD_EVENT, listener);
}

/** The ticker a terminal pathname names, never the watchlist page's own segment. */
export const routeTicker = (pathname: string): string | null => tickerFromPath(pathname);
