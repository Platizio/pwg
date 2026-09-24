/**
 * Whether the reference rail (the newswire, About and Notable moves column on
 * an instrument page) is folded to a strip.
 *
 * The choice lives in the same place the lighting choice does: an attribute on
 * <html>, persisted in localStorage. That is deliberate. The attribute is what
 * the CSS reads, so the page is drawn at the right width before React has
 * hydrated, and nothing React renders depends on it — the "collapse" control
 * and the "expand" strip are both always in the markup and CSS shows one. A
 * reader who folded the rail therefore never sees it open for a frame and then
 * snap shut, and there is no server/client disagreement to reconcile.
 *
 * Plain functions over the two surfaces (a Storage and an element) so the
 * rules can be run in node without a DOM.
 */

/** localStorage key. Sits beside the theme's `pg-theme`. */
export const RAIL_STORAGE_KEY = "pg-news-rail";

/** The attribute on <html>. work-column.tsx spells it out in its class names. */
export const RAIL_ATTR = "data-news-rail";

/** The attribute's only value. Open is the attribute's absence. */
export const RAIL_FOLDED = "collapsed";

/* Stored explicitly rather than removed on expand, so that if the default ever
   changes, a reader who chose "open" keeps their choice. */
const RAIL_OPEN = "open";

type Readable = { getItem(key: string): string | null };
type Writable = { setItem(key: string, value: string): void };
type Root = {
  setAttribute(name: string, value: string): void;
  removeAttribute(name: string): void;
};

/** The stored choice. Anything unreadable is "open", which is the default. */
export function readFolded(storage: Readable | undefined): boolean {
  try {
    return storage?.getItem(RAIL_STORAGE_KEY) === RAIL_FOLDED;
  } catch {
    return false;
  }
}

/**
 * Persists the choice. Returns whether it was kept: private browsing and
 * blocked site data refuse the write, and the fold still holds for this page
 * view because the attribute carries it.
 */
export function writeFolded(storage: Writable | undefined, folded: boolean): boolean {
  if (!storage) return false;
  try {
    storage.setItem(RAIL_STORAGE_KEY, folded ? RAIL_FOLDED : RAIL_OPEN);
    return true;
  } catch {
    return false;
  }
}

/** Draws the choice: the CSS in work-column.tsx keys off this attribute. */
export function applyFolded(root: Root, folded: boolean): void {
  if (folded) root.setAttribute(RAIL_ATTR, RAIL_FOLDED);
  else root.removeAttribute(RAIL_ATTR);
}

/**
 * The same read, as source for an inline <script> that runs while the HTML is
 * still being parsed — before the rail is laid out, and long before any module
 * could. It cannot import the constants above, so the test suite executes it
 * against the same fakes the functions are tested with.
 */
export const RAIL_PRE_PAINT =
  `try{if(localStorage.getItem(${JSON.stringify(RAIL_STORAGE_KEY)})===${JSON.stringify(RAIL_FOLDED)})` +
  `document.documentElement.setAttribute(${JSON.stringify(RAIL_ATTR)},${JSON.stringify(RAIL_FOLDED)})}catch(e){}`;
