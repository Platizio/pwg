/* The arithmetic of a subscription that is edited rather than replaced.
 *
 * The browser used to open one EventSource per symbol SET. The URL carried the
 * sorted union of every symbol registered on the page, so arriving at a stock
 * page — one more symbol — produced a new union, a new URL, a new connection,
 * and an empty tick map until that connection's snapshot came back. Every
 * navigation made every price on the terminal visibly drop to the server's
 * figure and then jump again a moment later.
 *
 * So the connection now outlives the symbol set: one stream for the life of the
 * page, and a second route that edits its filter in place. These are the pure
 * pieces of that — what a symbol list looks like once cleaned, what changed
 * between two of them, and where the cap bites. Pure, and free of any Next or
 * node import, because both ends of the wire need the same answers: the route
 * computes the filter with them and the provider computes the delta with them.
 */

/* An upper bound on the per-connection filter, not on upstream cost — the
   gateway subscription is a wildcard either way, so this only bounds how much
   one response has to sift and serialise.

   It was 64, chosen when three surfaces were live. Widening the terminal to the
   boards, the ribbon, the index strip and the sector cards took one dashboard
   to 77 symbols, and the excess was dropped in silence — TSLA among them, on a
   tape where it is one of six names. A cap that quietly stops delivering the
   thing it was asked for is worse than no cap, so this is sized for a real page
   and every caller reports it when it bites. */
export const MAX_SYMBOLS = 256;

/**
 * A symbol list in the one shape everything downstream compares against.
 *
 * Sorted because two lists that name the same symbols must be the same list:
 * the diff below, the filter on the server and the URL the stream opens with
 * are all equality tests in disguise, and an unordered list turns each of them
 * into a spurious change.
 */
export function normalise(list: readonly string[]): string[] {
  const seen = new Set<string>();
  for (const raw of list) {
    const symbol = raw.trim().toUpperCase();
    if (symbol) seen.add(symbol);
  }
  return [...seen].sort();
}

/**
 * What to add and what to remove to turn `prev` into `next`.
 *
 * The provider sends a request only when one of these is non-empty, so this
 * must return two empty lists for a set that has not actually changed —
 * otherwise every re-render of every live surface is a round trip.
 */
export function diffSubscription(
  prev: ReadonlySet<string>,
  next: readonly string[],
): { add: string[]; remove: string[] } {
  const want = normalise(next);
  const wanted = new Set(want);
  /* `want` is already sorted, so its filtered copy is too. */
  const add = want.filter((symbol) => !prev.has(symbol));
  const remove = [...prev].filter((symbol) => !wanted.has(symbol)).sort();
  return { add, remove };
}

/**
 * The list truncated to `max`, and how much was refused.
 *
 * The count is returned rather than logged because the caller has to pass it
 * on: a surface silently missing its ticks looks exactly like a quiet market.
 */
export function capped(
  list: readonly string[],
  max = MAX_SYMBOLS,
): { kept: string[]; dropped: number } {
  if (list.length <= max) return { kept: [...list], dropped: 0 };
  return { kept: list.slice(0, max), dropped: list.length - max };
}

/**
 * Every registered list merged into one normalised set.
 *
 * Seven surfaces on a terminal page each name the symbols they show, and they
 * overlap heavily — the ribbon, the tape and the boards share most of a
 * dashboard between them. One subscription covers all of it.
 */
export function unionOf(registry: ReadonlyMap<number, readonly string[]>): string[] {
  const all: string[] = [];
  for (const list of registry.values()) all.push(...list);
  return normalise(all);
}
