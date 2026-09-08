/* Where the terminal lives, in one place.
 *
 * The terminal used to be its own Next service mounted at the root, so every
 * link inside it was written as `/instrument/AAPL`, `/wire`, `/calendar`.
 * Folding it into the site moved all of that under /terminal, and because the
 * paths were string literals scattered across twenty files, every internal link
 * in the terminal 404'd while every page still rendered — the failure was
 * invisible until something followed a link.
 *
 * Routing through these helpers means the next move is one edit, and a wrong
 * path is a type error rather than a dead link.
 */

/** The terminal's overview. */
export const TERMINAL_PATH = "/terminal";
export const CALENDAR_PATH = "/terminal/calendar";
export const WIRE_PATH = "/terminal/wire";

/** One instrument. Encoded: tickers may carry `.` and `/` (BRK.B, RDS/A). */
export const instrumentPath = (ticker: string): string =>
  `${TERMINAL_PATH}/${encodeURIComponent(ticker)}`;

/* The TradingView deep-dive, opened in its own tab.
 *
 * A top-level segment rather than a child of /terminal, for two reasons. The
 * terminal layout awaits getHomeSnapshot() and wraps everything in the Shell —
 * sidebar, drawer, ticker tape, order ticket — and a route group cannot escape
 * a parent layout, so a full-screen chart under /terminal would mean
 * restructuring every existing terminal route. And tickerFromPath below
 * hardcodes the static children of /terminal; a new one there would be read as
 * a ticker. */
export const chartPath = (ticker: string): string =>
  `/chart/${encodeURIComponent(ticker)}`;

/** One sector. The slug is already url-safe by construction. */
export const sectorPath = (slug: string): string => `${TERMINAL_PATH}/sector/${slug}`;

/** The ticker in a terminal pathname, or null when it is not an instrument. */
export const tickerFromPath = (pathname: string): string | null => {
  const m = /^\/terminal\/([^/]+)$/.exec(pathname);
  if (!m) return null;
  /* The static children of /terminal are routes, not tickers. */
  if (m[1] === "sector" || m[1] === "calendar" || m[1] === "wire") return null;
  return decodeURIComponent(m[1]);
};
